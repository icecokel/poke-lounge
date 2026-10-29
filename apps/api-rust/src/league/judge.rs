use super::{
    config::Config,
    error::{LeagueError, Result},
};
use serde_json::{Value, json};
use std::time::{Duration, Instant};
use tokio::sync::{Mutex, Semaphore};
use uuid::Uuid;

const RETRYABLE_JUDGE_CODES: &[&str] = &["JUDGE_UNAVAILABLE", "PARTY_CHECK_UNAVAILABLE"];

#[derive(Clone)]
pub struct Health {
    pub engine: String,
    pub roster: String,
}
pub struct Judge {
    client: reqwest::Client,
    base: reqwest::Url,
    token: String,
    permits: Semaphore,
    health: Mutex<Option<(Instant, Health)>>,
}
impl Judge {
    pub fn new(config: &Config) -> Result<Self> {
        Ok(Self {
            client: reqwest::Client::builder()
                .timeout(Duration::from_secs(8))
                .redirect(reqwest::redirect::Policy::none())
                .build()
                .map_err(|_| unavailable())?,
            base: config.judge_url.clone(),
            token: config.token.clone(),
            permits: Semaphore::new(2),
            health: Mutex::new(None),
        })
    }
    pub async fn health(&self) -> Result<Health> {
        tokio::time::timeout(Duration::from_secs(1), async {
            let mut cache = self.health.lock().await;
            if let Some((at, value)) = &*cache
                && at.elapsed() < Duration::from_secs(60)
            {
                return Ok(value.clone());
            }
            let response = self
                .client
                .get(self.base.join("health").map_err(|_| unavailable())?)
                .header("x-league-judge-token", &self.token)
                .send()
                .await
                .map_err(|_| failed(None, "", "connection_failed", unavailable()))?;
            let status = response.status().as_u16();
            if status == 401 {
                return Err(failed(
                    Some(status),
                    "UNAUTHORIZED",
                    "authentication_failed",
                    judge_failed(),
                ));
            }
            if !response.status().is_success() {
                return Err(failed(Some(status), "", "health_status", unavailable()));
            }
            let body = read(response)
                .await
                .map_err(|reason| failed(Some(status), "", reason, unavailable()))?;
            let engine = version(&body["engineVersion"])
                .map_err(|e| failed(Some(status), "", "invalid_engine_version", e))?;
            let roster = version(&body["rosterVersion"])
                .map_err(|e| failed(Some(status), "", "invalid_roster_version", e))?;
            if body["ready"] != true {
                return Err(failed(Some(status), "", "health_not_ready", unavailable()));
            }
            let health = Health { engine, roster };
            *cache = Some((Instant::now(), health.clone()));
            Ok(health)
        })
        .await
        .map_err(|_| failed(None, "", "health_timeout", unavailable()))?
    }
    pub async fn call(&self, engine: &str, op: Value) -> Result<Value> {
        let _permit = self.permits.try_acquire().map_err(|_| unavailable())?;
        let id = Uuid::new_v4().to_string();
        let response = self
            .client
            .post(self.base.join("v1/op").map_err(|_| unavailable())?)
            .header("x-league-judge-token", &self.token)
            .json(
                &json!({"protocol":"league-judge/1","requestId":id,"engineVersion":engine,"op":op}),
            )
            .send()
            .await
            .map_err(|_| failed(None, "", "connection_failed", unavailable()))?;
        let status = response.status().as_u16();
        if status == 401 {
            return Err(failed(
                Some(status),
                "UNAUTHORIZED",
                "authentication_failed",
                judge_failed(),
            ));
        }
        let body = read(response)
            .await
            .map_err(|reason| failed(Some(status), "", reason, unavailable()))?;
        if body["protocol"] != "league-judge/1" {
            return Err(failed(Some(status), "", "protocol_mismatch", unavailable()));
        }
        if body["requestId"] != id {
            return Err(failed(
                Some(status),
                "",
                "request_id_mismatch",
                unavailable(),
            ));
        }
        let returned_engine = version(&body["engineVersion"])
            .map_err(|e| failed(Some(status), "", "invalid_engine_version", e))?;
        if body["ok"] == false {
            let code = body["code"]
                .as_str()
                .filter(|s| !s.is_empty())
                .ok_or_else(|| failed(Some(status), "", "missing_code", unavailable()))?;
            if returned_engine != engine && code != "ENGINE_VERSION_MISMATCH" {
                return Err(failed(
                    Some(status),
                    code,
                    "engine_version_mismatch",
                    unavailable(),
                ));
            }
            let error = match code {
                "ENGINE_VERSION_MISMATCH" => {
                    *self.health.lock().await = None;
                    LeagueError::new(409, "LEAGUE_ENGINE_RETIRED")
                        .detail(json!({"engineVersion":returned_engine}))
                }
                "PARTY_INVALID" => LeagueError::new(422, "LEAGUE_PARTY_INVALID")
                    .detail(json!({"reasons":[body["detail"]]})),
                "PARTY_IMPLAUSIBLE" => LeagueError::new(422, "LEAGUE_PARTY_IMPLAUSIBLE")
                    .detail(json!({"reasons":[body["detail"]]})),
                "ILLEGAL_INPUT" | "INCOMPLETE_INPUT" | "TRAILING_INPUT" | "TOO_LONG" => {
                    LeagueError::new(422, "LEAGUE_INPUT_REJECTED")
                        .detail(json!({"kind":code,"at":body["detail"]["at"]}))
                }
                "ROSTER_NOT_READY" => LeagueError::new(503, "LEAGUE_ROSTER_NOT_READY"),
                code if RETRYABLE_JUDGE_CODES.contains(&code) => unavailable(),
                _ => judge_failed(),
            };
            return Err(failed(Some(status), code, "judge_error", error));
        }
        if !(200..300).contains(&status)
            || returned_engine != engine
            || body["ok"] != true
            || !body["data"].is_object()
        {
            return Err(failed(
                Some(status),
                "",
                "invalid_success_response",
                unavailable(),
            ));
        }
        Ok(body["data"].clone())
    }
}
fn unavailable() -> LeagueError {
    LeagueError::new(503, "LEAGUE_JUDGE_UNAVAILABLE")
}
fn judge_failed() -> LeagueError {
    LeagueError::new(500, "LEAGUE_JUDGE_FAILED")
}
fn failed(
    status: Option<u16>,
    code: &str,
    reason: &'static str,
    error: LeagueError,
) -> LeagueError {
    // Only log known categories, never arbitrary judge code, detail or response data.
    let category = match code {
        "ENGINE_VERSION_MISMATCH"
        | "PARTY_INVALID"
        | "PARTY_IMPLAUSIBLE"
        | "ILLEGAL_INPUT"
        | "INCOMPLETE_INPUT"
        | "TRAILING_INPUT"
        | "TOO_LONG"
        | "ROSTER_NOT_READY"
        | "PARTY_CHECK_UNAVAILABLE"
        | "ROSTER_SOURCE_INVALID"
        | "INVALID_REQUEST"
        | "ENGINE_STALL"
        | "JUDGE_UNAVAILABLE"
        | "UNAUTHORIZED" => code,
        _ => "UNKNOWN",
    };
    tracing::warn!(
        event = "league.judge_failed",
        http_status = status,
        code = category,
        reason,
        mapped_code = error.code
    );
    error
}
fn version(value: &Value) -> Result<String> {
    let text = value
        .as_str()
        .filter(|s| !s.is_empty() && s.len() <= 96)
        .ok_or_else(unavailable)?;
    Ok(text.to_owned())
}
async fn read(mut response: reqwest::Response) -> std::result::Result<Value, &'static str> {
    if response.status().is_redirection() {
        return Err("redirect_rejected");
    }
    if response.content_length().is_some_and(|n| n > 1024 * 1024) {
        return Err("response_too_large");
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|_| "response_read_failed")? {
        if bytes.len() + chunk.len() > 1024 * 1024 {
            return Err("response_too_large");
        }
        bytes.extend_from_slice(&chunk);
    }
    serde_json::from_slice(&bytes).map_err(|_| "invalid_json")
}
