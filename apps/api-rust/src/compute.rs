use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::{sync::Arc, time::Duration};
use tokio::sync::Semaphore;
use uuid::Uuid;

const COMPUTE_CAPACITY: usize = 32;
const BACKGROUND_CAPACITY: usize = 16;
const INTERACTIVE_QUEUE_WAIT: Duration = Duration::from_secs(1);

pub const ENGINE_VERSION: &str = include_str!("../engine-version.txt");
#[derive(Clone)]
pub struct Compute {
    client: reqwest::Client,
    url: Arc<str>,
    token: Arc<str>,
    capacity: Arc<Semaphore>,
    background: Arc<Semaphore>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BattlePack {
    pub state: Value,
    pub public_state: Value,
    pub state_hash: String,
    pub required_player_ids: Vec<String>,
}
impl Compute {
    pub fn new(url: String, token: String) -> AppResult<Self> {
        let parsed =
            reqwest::Url::parse(&url).map_err(|_| AppError::Configuration("Invalid worker URL"))?;
        if parsed.scheme() != "http"
            || parsed.host_str().is_none()
            || parsed.username() != ""
            || parsed.password().is_some()
            || parsed.query().is_some()
        {
            return Err(AppError::Configuration("Worker URL must be internal HTTP"));
        }
        let client = reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(2))
            .timeout(Duration::from_secs(9))
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .map_err(|_| AppError::Unavailable)?;
        Ok(Self {
            client,
            url: url.trim_end_matches('/').into(),
            token: token.into(),
            capacity: Arc::new(Semaphore::new(COMPUTE_CAPACITY)),
            background: Arc::new(Semaphore::new(BACKGROUND_CAPACITY)),
        })
    }
    pub async fn ready(&self) -> AppResult<()> {
        let not_ready = |reason: &'static str| {
            move |detail: String| {
                tracing::warn!(event = "compute.not_ready", reason, detail = %detail);
                AppError::Unavailable
            }
        };
        let response = self
            .client
            .get(format!("{}/health", self.url))
            .header("x-worker-token", self.token.as_ref())
            .send()
            .await
            .map_err(|error| {
                not_ready("transport")(format!(
                    "timeout={} connect={}",
                    error.is_timeout(),
                    error.is_connect()
                ))
            })?;
        let status = response.status();
        let body = self
            .read(response)
            .await
            .map_err(|(_, stage)| not_ready("body")(stage.to_owned()))?;
        if !status.is_success() {
            return Err(not_ready("status")(format!(
                "status={} code={} readyWorkers={} draining={}",
                status.as_u16(),
                body["code"],
                body["readyWorkers"],
                body["draining"]
            )));
        }
        if body["engineVersion"] != ENGINE_VERSION.trim() {
            return Err(not_ready("engine_version")(format!(
                "worker={} api={}",
                body["engineVersion"],
                ENGINE_VERSION.trim()
            )));
        }
        if body["readyWorkers"].as_u64().unwrap_or(0) == 0 {
            return Err(not_ready("no_workers")(format!(
                "pending={}",
                body["pending"]
            )));
        }
        Ok(())
    }
    pub async fn run(&self, id: Uuid, revision: u64, operation: Value) -> AppResult<Value> {
        let kind = operation["kind"].as_str().unwrap_or("unknown").to_owned();
        let (_background_permit, _permit) = if kind == "ai-step" {
            let lane = self
                .background
                .clone()
                .try_acquire_owned()
                .map_err(|_| AppError::Busy)?;
            let permit = self
                .capacity
                .clone()
                .try_acquire_owned()
                .map_err(|_| AppError::Busy)?;
            (Some(lane), permit)
        } else {
            let permit = tokio::time::timeout(
                INTERACTIVE_QUEUE_WAIT,
                self.capacity.clone().acquire_owned(),
            )
            .await
            .map_err(|_| {
                tracing::warn!(event = "compute.busy", operation = %kind, room_instance_id = %id);
                AppError::Busy
            })?
            .map_err(|_| AppError::Unavailable)?;
            (None, permit)
        };
        let request_id = Uuid::new_v4();
        let started = std::time::Instant::now();
        // Each failure carries the stage that produced it so `compute.failed` says where it broke.
        let result: Result<Value, (AppError, &'static str)> = async {
            let response = self.client.post(format!("{}/compute", self.url))
                .header("x-worker-token", self.token.as_ref())
                .json(&json!({"protocolVersion":1,"requestId":request_id,"roomInstanceId":id,"stateRevision":revision,"engineVersion":ENGINE_VERSION.trim(),"operation":operation}))
                .send().await.map_err(|error| {
                    tracing::error!(event="compute.transport_failed", compute_request_id=%request_id,
                        room_instance_id=%id, revision, operation=%kind,
                        timeout=error.is_timeout(), connect=error.is_connect(),
                        release=%crate::logging::release());
                    (AppError::ComputeUnavailable, "transport")
                })?;
            let status = response.status();
            let body = self.read(response).await?;
            if body["requestId"] != request_id.to_string()
                || body["roomInstanceId"] != id.to_string()
                || body["stateRevision"] != revision
                || body["engineVersion"] != ENGINE_VERSION.trim()
                || body["protocolVersion"] != 1
            {
                // Name the mismatched fields; a worker-level error such as 401 or 503 has no identity.
                let mismatched: Vec<&str> = [
                    ("requestId", body["requestId"] != request_id.to_string()),
                    ("roomInstanceId", body["roomInstanceId"] != id.to_string()),
                    ("stateRevision", body["stateRevision"] != revision),
                    ("engineVersion", body["engineVersion"] != ENGINE_VERSION.trim()),
                    ("protocolVersion", body["protocolVersion"] != 1),
                ].into_iter().filter_map(|(name, bad)| bad.then_some(name)).collect();
                let worker_code = body["code"].as_str().filter(|code| code.len() <= 64
                    && code.bytes().all(|byte| byte.is_ascii_uppercase() || byte == b'_')).unwrap_or("none");
                tracing::error!(event="compute.response_invalid", compute_request_id=%request_id,
                    room_instance_id=%id, revision, operation=%kind, status=status.as_u16(),
                    worker_code, mismatched=%mismatched.join(","),
                    worker_engine_version=%body["engineVersion"], release=%crate::logging::release());
                return Err((AppError::ComputeUnavailable, "identity"));
            }
            if !status.is_success() || body["ok"] != true {
                // Copy only bounded diagnostic labels from the internal worker, never its input.
                let valid_label = |value: &str, max: usize| !value.is_empty() && value.len() <= max
                    && value.bytes().all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.'));
                let reason = body["diagnostic"]["reason"].as_str()
                    .filter(|value| valid_label(value, 64)).unwrap_or("unspecified");
                let issues: Vec<Value> = body["diagnostic"]["issues"].as_array().into_iter().flatten().take(8)
                    .filter_map(|issue| {
                        let code = issue["code"].as_str().filter(|value| valid_label(value, 48))?;
                        let path = issue["path"].as_str().filter(|value| valid_label(value, 256))?;
                        Some(json!({"code":code,"path":path}))
                    }).collect();
                let frames: Vec<&str> = body["diagnostic"]["frames"].as_array().into_iter().flatten().take(4)
                    .filter_map(Value::as_str).filter(|frame| frame.len() <= 120 && frame.bytes().all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'-' | b'.' | b':'))).collect();
                let error_name = body["diagnostic"]["name"].as_str()
                    .filter(|value| valid_label(value, 48)).unwrap_or("none");
                // The worker already strips paths and truncates; re-bound it here anyway.
                let error_message: String = body["diagnostic"]["message"].as_str().unwrap_or("")
                    .chars().filter(|c| !c.is_control()).take(200).collect();
                let worker_code = body["code"].as_str().filter(|code| code.len() <= 64
                    && code.bytes().all(|byte| byte.is_ascii_uppercase() || byte == b'_')).unwrap_or("none");
                let invalid = body["code"] == "INVALID_INPUT";
                if invalid {
                    tracing::warn!(event="compute.rejected", compute_request_id=%request_id,
                        room_instance_id=%id, revision, operation=%kind, status=status.as_u16(),
                        worker_code, reason, error_name, error_message=%error_message,
                        issues=%json!(issues), frames=%json!(frames), release=%crate::logging::release());
                } else {
                    tracing::error!(event="compute.rejected", compute_request_id=%request_id,
                        room_instance_id=%id, revision, operation=%kind, status=status.as_u16(),
                        worker_code, reason, error_name, error_message=%error_message,
                        issues=%json!(issues), frames=%json!(frames), release=%crate::logging::release());
                }
                return Err(if invalid {
                    (AppError::ComputeRejected(reason.to_owned()), "rejected")
                } else {
                    (AppError::ComputeUnavailable, "worker_failed")
                });
            }
            body.get("data").cloned().ok_or((AppError::ComputeUnavailable, "data_missing"))
        }.await;
        let duration_ms = started.elapsed().as_millis() as u64;
        match result {
            Err((error, stage)) => {
                if matches!(error, AppError::ComputeRejected(_)) {
                    // Expected input rejections are already logged as compute.rejected at warn level.
                    tracing::debug!(event="compute.failed",compute_request_id=%request_id,room_instance_id=%id,revision,operation=%kind,stage,code=error.code(),duration_ms);
                } else {
                    tracing::error!(event="compute.failed",compute_request_id=%request_id,room_instance_id=%id,revision,operation=%kind,stage,code=error.code(),duration_ms);
                }
                Err(error)
            }
            Ok(value) => {
                if duration_ms >= 2_000 {
                    tracing::warn!(event="compute.slow",compute_request_id=%request_id,room_instance_id=%id,revision,operation=%kind,duration_ms);
                }
                Ok(value)
            }
        }
    }
    pub async fn battle(
        &self,
        id: Uuid,
        revision: u64,
        operation: Value,
        players: &[String; 2],
    ) -> AppResult<BattlePack> {
        let kind = operation["kind"].as_str().unwrap_or("unknown").to_owned();
        let result: BattlePack = serde_json::from_value(self.run(id, revision, operation).await?)
            .map_err(|error| {
            tracing::error!(event = "compute.battle_invalid", room_instance_id = %id, revision,
                    operation = %kind, check = "shape", detail = %error);
            AppError::Corrupt(error)
        })?;
        let failed_check = if result.state["participantIds"] != json!(players) {
            Some("state_participants")
        } else if result.public_state["participantIds"] != json!(players) {
            Some("public_participants")
        } else if result.state["turn"] != result.public_state["turn"] {
            Some("turn_mismatch")
        } else if result.state["terminal"] != result.public_state["terminal"] {
            Some("terminal_mismatch")
        } else if result.state_hash.len() != 64 {
            Some("state_hash")
        } else if result
            .required_player_ids
            .iter()
            .any(|p| !players.contains(p))
        {
            Some("required_players")
        } else {
            None
        };
        if let Some(check) = failed_check {
            tracing::error!(event = "compute.battle_invalid", room_instance_id = %id, revision,
                operation = %kind, check);
            return Err(AppError::ComputeUnavailable);
        }
        Ok(result)
    }
    async fn read(
        &self,
        mut response: reqwest::Response,
    ) -> Result<Value, (AppError, &'static str)> {
        let mut bytes = Vec::new();
        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|_| (AppError::ComputeUnavailable, "body_read"))?
        {
            if bytes.len() + chunk.len() > 8 * 1024 * 1024 {
                return Err((AppError::ComputeUnavailable, "body_too_large"));
            }
            bytes.extend_from_slice(&chunk);
        }
        serde_json::from_slice(&bytes).map_err(|error| (AppError::from(error), "json_parse"))
    }
}
