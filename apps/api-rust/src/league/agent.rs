//! Operator-only test accounts for agent play on the production league.
//!
//! A shared secret logs a browser in as one of a few fixed accounts. Their records are kept so
//! the agent can see its own result, but they never enter standings, defender rosters, the hall
//! of fame or final ranks, so real players and the season are unaffected.

use super::League;
use super::error::{LeagueError, Result as LeagueResult};
use crate::{
    auth::{previous_session_token, set_session_cookie},
    http::{AppState, success},
    repository::hash_bytes,
};
use axum::{
    Extension, Json, Router,
    extract::{State, rejection::JsonRejection},
    http::HeaderMap,
    response::{IntoResponse, Response},
    routing::post,
};
use rand::RngCore;
use serde::Deserialize;
use serde_json::json;
use std::{env, sync::Arc};
use subtle::ConstantTimeEq;
use uuid::Uuid;

/// Agent account N (1..=8) is `a9e70000-0000-4000-8000-0000000000NN`.
pub const FIRST_ID: &str = "a9e70000-0000-4000-8000-000000000000";
pub const LAST_ID: &str = "a9e70000-0000-4000-8000-0000000000ff";
/// SQL predicate (on a `user_id` column) that keeps agent accounts out of rankings.
pub const NOT_AGENT: &str = "user_id NOT BETWEEN 'a9e70000-0000-4000-8000-000000000000'::uuid AND 'a9e70000-0000-4000-8000-0000000000ff'::uuid";

pub struct AgentConfig {
    token: String,
    accounts: i16,
}

impl AgentConfig {
    /// A bad value only turns agent login off; the league itself keeps running.
    pub fn from_env() -> Option<Self> {
        let token = optional("LEAGUE_AGENT_LOGIN_TOKEN")?;
        let valid = (32..=128).contains(&token.len())
            && token
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'_' | b'-'));
        let accounts = match optional("LEAGUE_AGENT_ACCOUNTS") {
            None => Some(4),
            Some(v) => v.parse::<i16>().ok().filter(|v| (1..=8).contains(v)),
        };
        match (valid, accounts) {
            (true, Some(accounts)) => {
                tracing::info!(event = "league.agent_login_on", accounts);
                Some(Self { token, accounts })
            }
            _ => {
                tracing::warn!(event = "league.agent_login_invalid");
                None
            }
        }
    }
}

pub fn is_agent(user: Uuid) -> bool {
    let id = user.to_string();
    id.as_str() >= FIRST_ID && id.as_str() <= LAST_ID
}

fn optional(key: &str) -> Option<String> {
    env::var(key).ok().filter(|v| !v.trim().is_empty())
}

pub fn routes(league: &Arc<League>) -> Router<AppState> {
    if league.config.agent.is_some() {
        Router::new().route("/league/v1/agent/login", post(login))
    } else {
        Router::new()
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Login {
    token: String,
    account: i16,
}

async fn login(
    State(state): State<AppState>,
    Extension(league): Extension<Arc<League>>,
    headers: HeaderMap,
    body: std::result::Result<Json<Login>, JsonRejection>,
) -> LeagueResult<Response> {
    let Some(agent) = league.config.agent.as_ref() else {
        return Err(LeagueError::new(404, "LEAGUE_NOT_FOUND"));
    };
    let Ok(Json(body)) = body else {
        return Err(LeagueError::new(404, "LEAGUE_NOT_FOUND"));
    };
    if !bool::from(body.token.as_bytes().ct_eq(agent.token.as_bytes())) {
        tracing::warn!(event = "league.agent_login_rejected");
        return Err(LeagueError::new(404, "LEAGUE_NOT_FOUND"));
    }
    if !(1..=agent.accounts).contains(&body.account) {
        return Err(LeagueError::new(422, "LEAGUE_AGENT_ACCOUNT_INVALID"));
    }
    let id = Uuid::parse_str(&format!(
        "a9e70000-0000-4000-8000-0000000000{:02}",
        body.account
    ))
    .expect("validated agent account");
    let name = format!("Agent {}", body.account);
    let mut random = [0u8; 32];
    rand::rng().fill_bytes(&mut random);
    let session: String = random.iter().map(|b| format!("{b:02x}")).collect();
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
    if let Some(previous) = previous_session_token(&headers) {
        tx.execute(
            "DELETE FROM poke_lounge_auth_session WHERE token_hash = $1",
            &[&hash_bytes(previous.as_bytes())],
        )
        .await?;
    }
    tx.execute(
        "INSERT INTO poke_lounge_auth_session (token_hash, user_id, expires_at) VALUES ($1, $2, now() + interval '30 days')",
        &[&hash_bytes(session.as_bytes()), &id],
    ).await?;
    tx.commit().await?;
    tracing::info!(event = "league.agent_login", account = body.account);
    let mut response = success(json!({"user":{"id":id,"displayName":name}})).into_response();
    set_session_cookie(&state, &mut response, &session);
    Ok(response)
}
