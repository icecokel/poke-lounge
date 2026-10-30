use super::League;
use super::config::Config;
use super::error::{LeagueError, Result as LeagueResult};
use crate::{
    http::{AppState, success},
    repository::hash_bytes,
};
use axum::{
    Extension, Json, Router, extract::rejection::JsonRejection, http::HeaderMap, routing::post,
};
use rand::RngCore;
use serde::Deserialize;
use serde_json::{Value, json};
use std::{env, sync::Arc};
use subtle::ConstantTimeEq;
use uuid::Uuid;

pub struct TestConfig {
    pub starter_level: Option<i16>,
    pub badges_required: i16,
    pub opponent_level_drop: i16,
    pub accounts: i16,
    pub login_token: Option<String>,
}

impl TestConfig {
    pub fn from_env() -> Result<Option<Self>, &'static str> {
        let mode = optional("LEAGUE_TEST_MODE")?;
        let token = optional("LEAGUE_TEST_LOGIN_TOKEN")?;
        let accounts = optional("LEAGUE_TEST_ACCOUNTS")?;
        let starter = optional("LEAGUE_TEST_STARTER_LEVEL")?;
        let badges = optional("LEAGUE_TEST_BADGES_REQUIRED")?;
        let drop = optional("LEAGUE_TEST_OPPONENT_LEVEL_DROP")?;
        if mode.is_none() {
            for (key, value) in [
                ("LEAGUE_TEST_LOGIN_TOKEN", &token),
                ("LEAGUE_TEST_ACCOUNTS", &accounts),
                ("LEAGUE_TEST_STARTER_LEVEL", &starter),
                ("LEAGUE_TEST_BADGES_REQUIRED", &badges),
                ("LEAGUE_TEST_OPPONENT_LEVEL_DROP", &drop),
            ] {
                if value.is_some() {
                    return Err(key);
                }
            }
            return Ok(None);
        }
        if mode.as_deref() != Some("true") {
            return Err("LEAGUE_TEST_MODE");
        }
        if token.as_ref().is_some_and(|token| {
            !(32..=128).contains(&token.len())
                || !token
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'_' | b'-'))
        }) {
            return Err("LEAGUE_TEST_LOGIN_TOKEN");
        }
        let config = Self {
            starter_level: starter
                .as_deref()
                .map(|v| number("LEAGUE_TEST_STARTER_LEVEL", v, 1, 100))
                .transpose()?,
            badges_required: badges
                .as_deref()
                .map_or(Ok(8), |v| number("LEAGUE_TEST_BADGES_REQUIRED", v, 0, 8))?,
            opponent_level_drop: drop.as_deref().map_or(Ok(0), |v| {
                number("LEAGUE_TEST_OPPONENT_LEVEL_DROP", v, 0, 49)
            })?,
            accounts: accounts
                .as_deref()
                .map_or(Ok(4), |v| number("LEAGUE_TEST_ACCOUNTS", v, 1, 8))?,
            login_token: token,
        };
        local_only()?;
        Ok(Some(config))
    }

    pub fn marker(&self) -> String {
        format!(
            "+test.s{}.b{}.d{}",
            self.starter_level
                .map_or_else(|| "-".into(), |v| v.to_string()),
            self.badges_required,
            self.opponent_level_drop,
        )
    }
}

impl Config {
    pub fn badges_required(&self) -> i16 {
        self.test.as_ref().map_or(8, |t| t.badges_required)
    }
}

fn optional(key: &'static str) -> Result<Option<String>, &'static str> {
    match env::var(key) {
        Ok(value) if value.trim().is_empty() => Ok(None),
        Ok(value) => Ok(Some(value)),
        Err(env::VarError::NotPresent) => Ok(None),
        Err(_) => Err(key),
    }
}

fn number(key: &'static str, value: &str, min: i16, max: i16) -> Result<i16, &'static str> {
    if !value.bytes().all(|b| b.is_ascii_digit()) {
        return Err(key);
    }
    value
        .parse::<i16>()
        .ok()
        .filter(|v| (min..=max).contains(v))
        .ok_or(key)
}

fn local_origin(value: &str, allow_ip: bool) -> bool {
    reqwest::Url::parse(value).is_ok_and(|url| {
        url.scheme() == "http"
            && (url.host_str() == Some("localhost")
                || (allow_ip && url.host_str() == Some("127.0.0.1")))
            && url.username().is_empty()
            && url.password().is_none()
            && url.path() == "/"
            && url.query().is_none()
            && url.fragment().is_none()
    })
}

fn local_only() -> Result<(), &'static str> {
    let key = "LEAGUE_TEST_MODE";
    let origins = optional("CORS_ORIGINS")
        .map_err(|_| key)?
        .unwrap_or_else(|| "http://localhost:3000,http://127.0.0.1:3000".into());
    if !origins.split(',').all(|v| local_origin(v.trim(), true))
        || optional("AUTH_WEB_ORIGIN")
            .map_err(|_| key)?
            .is_some_and(|v| !local_origin(v.trim(), false))
        || optional("DISCORD_REDIRECT_URI")
            .map_err(|_| key)?
            .is_some_and(|v| {
                !reqwest::Url::parse(v.trim())
                    .is_ok_and(|url| matches!(url.host_str(), Some("localhost" | "127.0.0.1")))
            })
    {
        return Err(key);
    }
    Ok(())
}

pub fn routes(league: &Arc<League>) -> Router<AppState> {
    if league
        .config
        .test
        .as_ref()
        .is_some_and(|t| t.login_token.is_some())
    {
        Router::new().route("/league/v1/test/login", post(login))
    } else {
        Router::new()
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Login {
    account: i16,
    previous: Option<String>,
}

async fn login(
    Extension(league): Extension<Arc<League>>,
    headers: HeaderMap,
    body: std::result::Result<Json<Login>, JsonRejection>,
) -> LeagueResult<Json<Value>> {
    let test = league.config.test.as_ref();
    let token = test.and_then(|t| t.login_token.as_deref());
    let supplied = headers.get("x-league-test-token").map(|v| v.as_bytes());
    let (Some(test), Some(token), Some(supplied)) = (test, token, supplied) else {
        return Err(LeagueError::new(404, "LEAGUE_NOT_FOUND"));
    };
    if !bool::from(supplied.ct_eq(token.as_bytes())) {
        return Err(LeagueError::new(404, "LEAGUE_NOT_FOUND"));
    }
    let Json(body) = body.map_err(|_| LeagueError::new(422, "LEAGUE_TEST_ACCOUNT_INVALID"))?;
    if !(1..=test.accounts).contains(&body.account)
        || body
            .previous
            .as_ref()
            .is_some_and(|value| value.len() != 64 || !value.bytes().all(|b| b.is_ascii_hexdigit()))
    {
        return Err(LeagueError::new(422, "LEAGUE_TEST_ACCOUNT_INVALID"));
    }
    let id = Uuid::parse_str(&format!(
        "7e570000-0000-4000-8000-0000000000{:02}",
        body.account
    ))
    .expect("validated test account");
    let name = format!("Test {}", body.account);
    let mut random = [0u8; 32];
    rand::rng().fill_bytes(&mut random);
    let session: String = random.iter().map(|b| format!("{b:02x}")).collect();
    let session_hash = hash_bytes(session.as_bytes());
    let mut slot = league.db.client().await?;
    let tx = slot
        .as_mut()
        .ok_or_else(LeagueError::unavailable)?
        .transaction()
        .await?;
    tx.execute(
        "INSERT INTO poke_lounge_user (id, display_name) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name, updated_at = now()",
        &[&id, &name],
    ).await?;
    if let Some(previous) = body.previous {
        tx.execute(
            "DELETE FROM poke_lounge_auth_session WHERE token_hash = $1",
            &[&hash_bytes(previous.as_bytes())],
        )
        .await?;
    }
    tx.execute(
        "INSERT INTO poke_lounge_auth_session (token_hash, user_id, expires_at) VALUES ($1, $2, now() + interval '30 days')",
        &[&session_hash, &id],
    ).await?;
    tx.commit().await?;
    tracing::info!(event = "league.test_login", account = body.account);
    Ok(success(json!({
        "sessionToken":session,
        "maxAgeS":2_592_000,
        "user":{"id":id,"displayName":name},
    })))
}
