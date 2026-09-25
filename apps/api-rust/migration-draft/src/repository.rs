use std::sync::Arc;

use redis::{
    Script,
    aio::{ConnectionManager, ConnectionManagerConfig},
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use uuid::Uuid;

use crate::{
    config::{IO_TIMEOUT, MAX_ROOMS, OWNER_LEASE_MS, REDIS_PREFIX},
    domain::{CreateRoom, FINISHED_RETENTION_MS, Room},
    error::{AppError, AppResult},
};

const READ: &str = r"
if redis.call('GET', KEYS[1]) ~= ARGV[1] then return {'fenced', '0', ''} end
local t = redis.call('TIME')
local now = t[1] * 1000 + math.floor(t[2] / 1000)
local value = redis.call('GET', KEYS[2])
if not value then return {'missing', tostring(now), ''} end
return {'ok', tostring(now), value}
";
const RENEW: &str = r"
if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
return redis.call('PEXPIRE', KEYS[1], ARGV[2])
";
const RELEASE: &str = r"
if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
return redis.call('DEL', KEYS[1])
";

#[derive(Clone)]
pub struct Repository {
    connection: ConnectionManager,
    owner: Arc<str>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Receipt {
    pub room_instance_id: Uuid,
    pub applied_revision: u64,
    pub request_hash: String,
    pub response: Option<serde_json::Value>,
}

pub struct Commit {
    pub receipt: Option<Receipt>,
    pub replayed: bool,
}

impl Repository {
    pub async fn connect(url: &str) -> AppResult<Self> {
        let client = redis::Client::open(url)?;
        let config = ConnectionManagerConfig::new()
            .set_number_of_retries(1)
            .set_connection_timeout(Some(IO_TIMEOUT))
            .set_response_timeout(Some(IO_TIMEOUT));
        let connection = tokio::time::timeout(
            IO_TIMEOUT * 2,
            ConnectionManager::new_with_config(client, config),
        )
        .await
        .map_err(|_| AppError::Unavailable)??;
        Ok(Self {
            connection,
            owner: Uuid::new_v4().to_string().into(),
        })
    }

    pub async fn acquire(&self) -> AppResult<()> {
        let value: Option<String> = redis::cmd("SET")
            .arg(self.owner_key())
            .arg(self.owner.as_ref())
            .arg("NX")
            .arg("PX")
            .arg(OWNER_LEASE_MS)
            .query_async(&mut self.connection.clone())
            .await?;
        if value.as_deref() != Some("OK") {
            return Err(AppError::Unavailable);
        }
        Ok(())
    }

    pub async fn renew(&self) -> AppResult<()> {
        let value: i64 = Script::new(RENEW)
            .key(self.owner_key())
            .arg(self.owner.as_ref())
            .arg(OWNER_LEASE_MS)
            .invoke_async(&mut self.connection.clone())
            .await?;
        if value != 1 {
            return Err(AppError::Unavailable);
        }
        Ok(())
    }

    pub async fn release(&self) -> AppResult<()> {
        let _: i64 = Script::new(RELEASE)
            .key(self.owner_key())
            .arg(self.owner.as_ref())
            .invoke_async(&mut self.connection.clone())
            .await?;
        Ok(())
    }

    // TIME comes from the same Redis authority that enforces lease and TTL boundaries.
    pub async fn now(&self) -> AppResult<u64> {
        self.read_value(self.owner_key()).await.map(|(now, _)| now)
    }

    pub async fn read(&self, id: Uuid) -> AppResult<(u64, Room)> {
        let (now, value) = self.read_value(self.room_key(id)).await?;
        let room: Room = serde_json::from_str(&value.ok_or(AppError::NotFound)?)?;
        room.validate(id)?;
        Ok((now, room))
    }

    pub async fn lookup_code(&self, code: &str) -> AppResult<Uuid> {
        let (_, value) = self.read_value(self.code_key(code)).await?;
        Uuid::parse_str(&value.ok_or(AppError::NotFound)?)
            .map_err(|_| AppError::Configuration("invalid room-code mapping"))
    }

    pub async fn active_ids(&self) -> AppResult<Vec<Uuid>> {
        let ids: Vec<String> = Script::new(
            r"
if redis.call('GET', KEYS[1]) ~= ARGV[1] then return {'fenced'} end
return redis.call('ZRANGE', KEYS[2], 0, ARGV[2])
",
        )
        .key(self.owner_key())
        .key(self.index_key())
        .arg(self.owner.as_ref())
        .arg(MAX_ROOMS)
        .invoke_async(&mut self.connection.clone())
        .await?;
        if ids.first().is_some_and(|id| id == "fenced") {
            return Err(AppError::Unavailable);
        }
        ids.into_iter()
            .map(|id| {
                Uuid::parse_str(&id)
                    .map_err(|_| AppError::Configuration("invalid active room index"))
            })
            .collect()
    }

    pub async fn receipt(
        &self,
        session_hash: &str,
        command_id: &str,
    ) -> AppResult<Option<Receipt>> {
        let (_, value) = self
            .read_value(self.receipt_key(session_hash, command_id))
            .await?;
        value
            .map(|raw| serde_json::from_str(&raw).map_err(AppError::from))
            .transpose()
    }

    pub async fn create(
        &self,
        input: CreateRoom,
        public: bool,
        session_hash: &str,
        command_id: &str,
    ) -> AppResult<(Room, Receipt, bool)> {
        let request_hash = fingerprint(&("create", public, &input))?;
        for _ in 0..8 {
            let now = self.now().await?;
            let room = Room::new(input.clone(), public, now)?;
            let receipt = Receipt {
                room_instance_id: room.room_instance_id,
                applied_revision: 0,
                request_hash: request_hash.clone(),
                response: None,
            };
            let (status, raw): (String, String) =
                Script::new(include_str!("../lua/create_room.lua"))
                    .key(self.owner_key())
                    .key(self.room_key(room.room_instance_id))
                    .key(self.code_key(&room.room_code))
                    .key(self.index_key())
                    .key(self.receipt_key(session_hash, command_id))
                    .arg(self.owner.as_ref())
                    .arg(serde_json::to_string(&room)?)
                    .arg(room.retention_deadline())
                    .arg(serde_json::to_string(&receipt)?)
                    .arg(MAX_ROOMS)
                    .invoke_async(&mut self.connection.clone())
                    .await?;
            match status.as_str() {
                "created" => return Ok((room, receipt, false)),
                "replayed" => {
                    let receipt: Receipt = serde_json::from_str(&raw)?;
                    if receipt.request_hash != request_hash {
                        return Err(AppError::CommandConflict);
                    }
                    let (_, room) = self.read(receipt.room_instance_id).await?;
                    // An old create command can report its retained result, never create a new session.
                    return Ok((room, receipt, true));
                }
                "collision" if input.room_code.is_none() => continue,
                "collision" => return Err(AppError::Invalid("Room code is already in use")),
                "capacity" => return Err(AppError::Capacity),
                "expired" => return Err(AppError::Closed),
                "fenced" => return Err(AppError::Unavailable),
                _ => return Err(AppError::Configuration("invalid create response")),
            }
        }
        Err(AppError::Busy)
    }

    pub async fn commit(
        &self,
        expected: u64,
        room: &mut Room,
        command: Option<(&str, &str, &Receipt)>,
    ) -> AppResult<Commit> {
        room.storage_version = expected.checked_add(1).ok_or(AppError::Unavailable)?;
        let serialized = serde_json::to_string(room)?;
        if serialized.len() > 32 * 1024 * 1024 { return Err(AppError::Capacity); }
        let (key, raw) = match command {
            Some((session, id, receipt)) => (
                self.receipt_key(session, id),
                serde_json::to_string(receipt)?,
            ),
            None => (format!("{REDIS_PREFIX}:no-receipt"), String::new()),
        };
        let (status, raw): (String, String) = Script::new(include_str!("../lua/commit_room.lua"))
            .key(self.owner_key())
            .key(self.room_key(room.room_instance_id))
            .key(self.code_key(&room.room_code))
            .key(self.index_key())
            .key(key)
            .arg(self.owner.as_ref())
            .arg(expected)
            .arg(serialized)
            .arg(room.retention_deadline())
            .arg(raw)
            .arg(room.hard_expires_at_ms + FINISHED_RETENTION_MS)
            .arg(room.active_deadline())
            .invoke_async(&mut self.connection.clone())
            .await?;
        match status.as_str() {
            "committed" | "replayed" => Ok(Commit {
                receipt: if raw.is_empty() {
                    None
                } else {
                    Some(serde_json::from_str(&raw)?)
                },
                replayed: status == "replayed",
            }),
            "missing" => Err(AppError::NotFound),
            "closed" | "expired" => Err(AppError::Closed),
            "conflict" => Err(AppError::RevisionConflict),
            "fenced" => Err(AppError::Unavailable),
            _ => Err(AppError::Configuration("invalid commit response")),
        }
    }

    async fn read_value(&self, key: String) -> AppResult<(u64, Option<String>)> {
        let (status, now, value): (String, String, String) = Script::new(READ)
            .key(self.owner_key())
            .key(key)
            .arg(self.owner.as_ref())
            .invoke_async(&mut self.connection.clone())
            .await?;
        if status == "fenced" {
            return Err(AppError::Unavailable);
        }
        if !matches!(status.as_str(), "ok" | "missing") {
            return Err(AppError::Configuration("invalid read response"));
        }
        let now = now
            .parse()
            .map_err(|_| AppError::Configuration("invalid Redis clock"))?;
        Ok((now, (status == "ok").then_some(value)))
    }

    fn owner_key(&self) -> String {
        format!("{REDIS_PREFIX}:owner")
    }
    fn index_key(&self) -> String {
        format!("{REDIS_PREFIX}:active")
    }
    fn room_key(&self, id: Uuid) -> String {
        format!("{REDIS_PREFIX}:room:{id}")
    }
    fn code_key(&self, code: &str) -> String {
        format!("{REDIS_PREFIX}:code:{code}")
    }
    fn receipt_key(&self, session_hash: &str, command_id: &str) -> String {
        format!("{REDIS_PREFIX}:receipt:{session_hash}:{}", hash_bytes(command_id.as_bytes()))
    }
}

pub fn fingerprint(value: &impl Serialize) -> AppResult<String> {
    Ok(hash_bytes(&serde_json::to_vec(value)?))
}

pub fn hash_bytes(value: &[u8]) -> String {
    format!("{:x}", Sha256::digest(value))
}
