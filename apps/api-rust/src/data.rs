use crate::{
    config::IO_TIMEOUT,
    error::{AppError, AppResult},
    repository::hash_bytes,
};
use serde_json::{Value, json};
use std::{collections::BTreeSet, sync::Arc};
use tokio::sync::Mutex;
use tokio_postgres::{Client, NoTls};
use uuid::Uuid;
const ROM_SHA1: &str = "5834fb3a2d751c48501d47d6a56898d7af6ccf9e";
const KEYS: [&str; 4] = [
    "pokemon-data",
    "item-data",
    "level-up-move-table",
    "growth-table",
];
#[derive(Clone)]
pub struct Data {
    config: Arc<tokio_postgres::Config>,
    client: Arc<Mutex<Option<Arc<Client>>>>,
    rom: Arc<Value>,
    shops: Arc<[Value; 2]>,
}
impl Data {
    pub async fn connect(config: tokio_postgres::Config) -> AppResult<Self> {
        let mut data = Self {
            config: Arc::new(config),
            client: Arc::new(Mutex::new(None)),
            rom: Arc::new(Value::Null),
            shops: Arc::new([Value::Null, Value::Null]),
        };
        let rows=data.client().await?.query("SELECT document_key,schema_version::int AS schema_version,rom_sha1,content_sha256,payload FROM poke_lounge_rom_document ORDER BY document_key",&[]).await?;
        let mut documents = std::collections::BTreeMap::new();
        for row in rows {
            let key: String = row.try_get("document_key")?;
            let version: i32 = row.try_get("schema_version")?;
            let rom: String = row.try_get("rom_sha1")?;
            let hash: String = row.try_get("content_sha256")?;
            let payload: Value = row.try_get("payload")?;
            if !KEYS.contains(&key.as_str())
                || version != 1
                || rom != ROM_SHA1
                || payload["version"] != 1
                || payload["source"]["romSha1"] != ROM_SHA1
                || hash_bytes(canonical_rom_json(&payload)?.as_bytes()) != hash
            {
                return Err(AppError::Configuration(
                    "ROM document integrity check failed",
                ));
            }
            if documents.insert(key.clone(),json!({"documentKey":key,"schemaVersion":version,"romSha1":rom,"contentSha256":hash,"payload":payload})).is_some(){return Err(AppError::Configuration("Duplicate ROM document"));}
        }
        if KEYS.iter().any(|key| !documents.contains_key(*key)) {
            return Err(AppError::Configuration("Required ROM document missing"));
        }
        let items = &documents["item-data"]["payload"];
        let mut seen = BTreeSet::new();
        let mut shops = [Value::Null, Value::Null];
        for (index, key) in ["basic", "premium"].iter().enumerate() {
            let list = items["shopCatalogs"][key]
                .as_array()
                .filter(|v| !v.is_empty())
                .ok_or(AppError::Configuration("Shop catalog missing"))?;
            for item in list {
                let id = item
                    .as_u64()
                    .filter(|i| *i > 0 && *i <= 536)
                    .ok_or(AppError::Configuration("Invalid shop item"))?;
                if !seen.insert(id) || items["items"][id.to_string()]["id"] != id {
                    return Err(AppError::Configuration("Invalid shop catalog"));
                }
            }
            shops[index] = json!(list);
        }
        data.shops = Arc::new(shops);
        data.rom = Arc::new(
            json!({"documents":KEYS.iter().map(|key|documents[*key].clone()).collect::<Vec<_>>()}),
        );
        Ok(data)
    }
    async fn client(&self) -> AppResult<Arc<Client>> {
        let mut guard = self.client.lock().await;
        if let Some(client) = guard.as_ref().filter(|c| !c.is_closed()) {
            return Ok(client.clone());
        }
        let (client, connection) = tokio::time::timeout(IO_TIMEOUT, self.config.connect(NoTls))
            .await
            .map_err(|_| AppError::Unavailable)??;
        tokio::spawn(async move {
            if connection.await.is_err() {
                tracing::warn!(event = "database.connection_closed");
            }
        });
        let client = Arc::new(client);
        *guard = Some(client.clone());
        Ok(client)
    }
    pub async fn ready(&self) -> AppResult<()> {
        self.client().await?.simple_query("SELECT 1").await?;
        Ok(())
    }
    pub fn rom(&self) -> Value {
        (*self.rom).clone()
    }
    pub fn shop(&self, kind: &str) -> AppResult<Value> {
        match kind {
            "basic" => Ok(self.shops[0].clone()),
            "premium" => Ok(self.shops[1].clone()),
            _ => Err(AppError::NotFound),
        }
    }
    pub async fn ranking(&self, game_type: &str) -> AppResult<Value> {
        if game_type == "POKE_LOUNGE" {
            return Ok(json!([]));
        }
        if game_type != "SKY_DROP" {
            return Err(AppError::Invalid("Invalid game type"));
        }
        let rows=self.client().await?.query(r#"
WITH best AS (
 SELECT DISTINCT ON (h."userId") h.id,h.score,h."createdAt",h."userId"
 FROM game_history h
 WHERE h."gameType"='SKY_DROP' AND h.score BETWEEN 1 AND 100000
 AND (h."playTime" IS NULL OR (h."playTime" BETWEEN 1 AND 86400 AND h.score <= h."playTime"*2000))
 ORDER BY h."userId",h.score DESC,h."createdAt" ASC,h.id ASC
)
SELECT jsonb_build_object('score',b.score,'rank',row_number() OVER (ORDER BY b.score DESC,b."createdAt" ASC,b.id ASC),
 'createdAt',to_char(b."createdAt" AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
 'user',jsonb_build_object('displayName',concat(u."firstName",' ',u."lastName"))) AS value
FROM best b JOIN "user" u ON u.id=b."userId" ORDER BY b.score DESC,b."createdAt" ASC,b.id ASC LIMIT 10
"#,&[]).await?;
        let values = rows
            .iter()
            .map(|r| r.try_get::<_, Value>("value"))
            .collect::<Result<Vec<_>, _>>()?;
        Ok(json!(values))
    }
    pub async fn result(&self, id: Uuid) -> AppResult<Value> {
        let row=self.client().await?.query_opt(r#"SELECT jsonb_build_object('id',h.id,'score',h.score,'gameType',h."gameType",'createdAt',to_char(h."createdAt" AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'user',jsonb_build_object('displayName',concat(u."firstName",' ',u."lastName"))) AS value FROM game_history h JOIN "user" u ON u.id=h."userId" WHERE h.id=$1"#,&[&id]).await?.ok_or(AppError::NotFound)?;
        Ok(row.try_get("value")?)
    }
}

// The existing importer uses JSON.stringify after sorting object properties.
// ECMAScript still enumerates array-index keys numerically before other keys.
// All four checked-in ROM documents contain integer numbers only; reject future
// floating-point payloads rather than silently hashing a different representation.
fn canonical_rom_json(value: &Value) -> AppResult<String> {
    fn index(key: &str) -> Option<u32> {
        let n = key.parse::<u32>().ok()?;
        (n < u32::MAX && n.to_string() == key).then_some(n)
    }
    match value {
        Value::Object(map) => {
            let mut keys = map.keys().collect::<Vec<_>>();
            keys.sort_by(|a, b| match (index(a), index(b)) {
                (Some(a), Some(b)) => a.cmp(&b),
                (Some(_), None) => std::cmp::Ordering::Less,
                (None, Some(_)) => std::cmp::Ordering::Greater,
                (None, None) => a.encode_utf16().cmp(b.encode_utf16()),
            });
            let fields = keys
                .into_iter()
                .map(|key| {
                    Ok(format!(
                        "{}:{}",
                        serde_json::to_string(key)?,
                        canonical_rom_json(&map[key])?
                    ))
                })
                .collect::<AppResult<Vec<_>>>()?;
            Ok(format!("{{{}}}", fields.join(",")))
        }
        Value::Array(values) => Ok(format!(
            "[{}]",
            values
                .iter()
                .map(canonical_rom_json)
                .collect::<AppResult<Vec<_>>>()?
                .join(",")
        )),
        Value::Number(number) if !number.is_i64() && !number.is_u64() => {
            Err(AppError::Configuration("ROM numbers must be integers"))
        }
        _ => Ok(serde_json::to_string(value)?),
    }
}
