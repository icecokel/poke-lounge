use super::{
    config::Config,
    error::{LeagueError, Result},
};
use serde_json::{Value, json};
use std::time::{Duration, Instant};
use tokio::sync::{Mutex, Semaphore};
use uuid::Uuid;

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
        let mut cache = self.health.try_lock().map_err(|_| unavailable())?;
        if let Some((at, value)) = &*cache
            && at.elapsed() < Duration::from_secs(60)
        {
            return Ok(value.clone());
        }
        let _permit = self.permits.try_acquire().map_err(|_| unavailable())?;
        let response = self
            .client
            .get(self.base.join("health").map_err(|_| unavailable())?)
            .header("x-league-judge-token", &self.token)
            .send()
            .await
            .map_err(|_| unavailable())?;
        let body = read(response).await?;
        let engine = version(&body["engineVersion"])?;
        let roster = version(&body["rosterVersion"])?;
        if body["ready"] != true {
            return Err(unavailable());
        }
        let health = Health { engine, roster };
        *cache = Some((Instant::now(), health.clone()));
        Ok(health)
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
            .map_err(|_| unavailable())?;
        let body = read(response).await?;
        if body["protocol"] != "league-judge/1" || body["requestId"] != id {
            return Err(unavailable());
        }
        let returned_engine = version(&body["engineVersion"])?;
        if body["ok"] == false {
            let code = body["code"].as_str().unwrap_or("");
            let mut error = match code {
                "ENGINE_VERSION_MISMATCH" => {
                    *self.health.lock().await = None;
                    LeagueError::new(409, "LEAGUE_ENGINE_RETIRED")
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
                "PARTY_CHECK_UNAVAILABLE" | "ROSTER_SOURCE_INVALID" => unavailable(),
                _ => LeagueError::new(500, "LEAGUE_JUDGE_FAILED"),
            };
            if returned_engine != engine && code != "ENGINE_VERSION_MISMATCH" {
                error = unavailable();
            }
            // Only log the validated category, never arbitrary judge detail.
            tracing::warn!(event = "league.judge_failed", code = error.code);
            return Err(error);
        }
        if returned_engine != engine || body["ok"] != true || !body["data"].is_object() {
            return Err(unavailable());
        }
        Ok(body["data"].clone())
    }
}
fn unavailable() -> LeagueError {
    LeagueError::new(503, "LEAGUE_JUDGE_UNAVAILABLE")
}
fn version(value: &Value) -> Result<String> {
    let text = value
        .as_str()
        .filter(|s| !s.is_empty() && s.len() <= 96)
        .ok_or_else(unavailable)?;
    Ok(text.to_owned())
}
async fn read(mut response: reqwest::Response) -> Result<Value> {
    if response.status().is_server_error()
        || response.status().is_redirection()
        || response.content_length().is_some_and(|n| n > 1024 * 1024)
    {
        return Err(unavailable());
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|_| unavailable())? {
        if bytes.len() + chunk.len() > 1024 * 1024 {
            return Err(unavailable());
        }
        bytes.extend_from_slice(&chunk);
    }
    serde_json::from_slice(&bytes).map_err(|_| unavailable())
}
