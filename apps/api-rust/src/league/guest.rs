use super::{
    League,
    error::{LeagueError, Result},
};
use crate::{
    auth::{current_user, previous_session_token, set_session_cookie},
    http::{AppState, client_ip, success},
    repository::hash_bytes,
};
use axum::{
    Extension, Json,
    extract::{ConnectInfo, State, rejection::JsonRejection},
    http::{HeaderMap, HeaderValue, header},
    response::{IntoResponse, Response},
};
use rand::{RngCore, TryRngCore};
use serde::Deserialize;
use serde_json::{Value, json};
use std::{net::SocketAddr, sync::Arc};
use uuid::Uuid;

const CODE_ALPHABET: &[u8; 32] = b"ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

fn check_origin(state: &AppState, headers: &HeaderMap) -> Result<()> {
    if !headers
        .get(header::ORIGIN)
        .is_some_and(|origin| state.origins.contains(origin))
    {
        return Err(LeagueError::new(403, "LEAGUE_GUEST_ORIGIN_REJECTED"));
    }
    Ok(())
}

impl League {
    pub async fn guest_allowed(&self) -> Result<bool> {
        let slot = self.db.client().await?;
        Ok(slot
            .as_ref()
            .ok_or_else(LeagueError::unavailable)?
            .query_one(
                "SELECT EXISTS (SELECT 1 FROM poke_lounge_league_season WHERE open_ended AND settled_at IS NULL AND starts_at <= now())",
                &[],
            )
            .await?
            .try_get(0)?)
    }
}

pub(super) async fn start(
    State(state): State<AppState>,
    Extension(league): Extension<Arc<League>>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    body: std::result::Result<Json<Value>, JsonRejection>,
) -> Result<Response> {
    // Require an exact allowed Origin even when the browser has no session yet.
    check_origin(&state, &headers)?;
    let Json(body) = body.map_err(|_| LeagueError::new(422, "LEAGUE_INPUT_REJECTED"))?;
    if !body.as_object().is_some_and(|o| o.is_empty()) {
        return Err(LeagueError::new(422, "LEAGUE_INPUT_REJECTED"));
    }
    if !league.guest_allowed().await? {
        return Err(LeagueError::new(404, "LEAGUE_NOT_FOUND"));
    }
    if let Some((id, name, is_guest)) = current_user(&state, &headers)
        .await
        .map_err(|_| LeagueError::unavailable())?
    {
        return Ok(
            success(json!({"user":{"id":id,"displayName":name,"isGuest":is_guest}}))
                .into_response(),
        );
    }
    let ip = client_ip(peer.ip(), &headers, &state.trusted_proxies);
    let ip_hash = hash_bytes(ip.to_string().as_bytes());
    let id = Uuid::new_v4();
    let mut random = [0u8; 32];
    rand::rng().fill_bytes(&mut random);
    let session: String = random.iter().map(|b| format!("{b:02x}")).collect();
    let mut slot = league.db.client().await?;
    let tx = slot
        .as_mut()
        .ok_or_else(LeagueError::unavailable)?
        .transaction()
        .await?;
    // Serialize budget checks across instances; denial rolls back every write.
    tx.query_one("SELECT pg_advisory_xact_lock(1795737600)", &[])
        .await?;
    if tx.query_opt("SELECT id FROM poke_lounge_league_season WHERE open_ended AND settled_at IS NULL AND starts_at <= now() FOR SHARE", &[]).await?.is_none() {
        return Err(LeagueError::new(404, "LEAGUE_NOT_FOUND"));
    }
    tx.execute(
        "DELETE FROM poke_lounge_guest_creation WHERE created_at <= now() - interval '1 hour'",
        &[],
    )
    .await?;
    let budget = tx.query_one("SELECT count(*) AS total, count(*) FILTER (WHERE ip_hash=$1) AS per_ip FROM poke_lounge_guest_creation", &[&ip_hash]).await?;
    if budget.try_get::<_, i64>("total")? >= 500 || budget.try_get::<_, i64>("per_ip")? >= 20 {
        return Err(LeagueError::new(429, "LEAGUE_GUEST_RATE_LIMITED")
            .detail(json!({"retryAfterMs":3_600_000})));
    }
    tx.execute(
        "INSERT INTO poke_lounge_guest_creation (id, ip_hash) VALUES ($1, $2)",
        &[&id, &ip_hash],
    )
    .await?;
    tx.execute(
        "INSERT INTO poke_lounge_user (id, display_name, is_guest) VALUES ($1, 'Guest', true)",
        &[&id],
    )
    .await?;
    tx.execute("INSERT INTO poke_lounge_auth_session (token_hash, user_id, expires_at) VALUES ($1, $2, now() + interval '30 days')", &[&hash_bytes(session.as_bytes()), &id]).await?;
    tx.commit().await?;
    tracing::info!(event = "league.guest_start", user_id = %id);
    let mut response =
        success(json!({"user":{"id":id,"displayName":"Guest","isGuest":true}})).into_response();
    set_session_cookie(&state, &mut response, &session);
    Ok(response)
}

pub(super) async fn issue_code(
    State(state): State<AppState>,
    Extension(league): Extension<Arc<League>>,
    headers: HeaderMap,
    body: std::result::Result<Json<Value>, JsonRejection>,
) -> Result<Response> {
    check_origin(&state, &headers)?;
    let Json(body) = body.map_err(|_| LeagueError::new(422, "LEAGUE_INPUT_REJECTED"))?;
    if !body.as_object().is_some_and(|o| o.is_empty()) {
        return Err(LeagueError::new(422, "LEAGUE_INPUT_REJECTED"));
    }
    let (user, _, true) = current_user(&state, &headers)
        .await
        .map_err(|_| LeagueError::unavailable())?
        .ok_or_else(|| LeagueError::new(403, "LEAGUE_GUEST_REQUIRED"))?
    else {
        return Err(LeagueError::new(403, "LEAGUE_GUEST_REQUIRED"));
    };
    let mut random = [0u8; 12];
    rand::rngs::OsRng
        .try_fill_bytes(&mut random)
        .map_err(|_| LeagueError::unavailable())?;
    // 32 symbols divide 256 exactly: 12 independent characters give 60 bits.
    let code: String = random
        .iter()
        .map(|b| CODE_ALPHABET[(b % 32) as usize] as char)
        .collect();
    let mut slot = league.db.client().await?;
    let tx = slot
        .as_mut()
        .ok_or_else(LeagueError::unavailable)?
        .transaction()
        .await?;
    if tx.query_opt("SELECT id FROM poke_lounge_league_season WHERE open_ended AND settled_at IS NULL AND starts_at <= now() FOR SHARE", &[]).await?.is_none() {
        return Err(LeagueError::new(404, "LEAGUE_NOT_FOUND"));
    }
    if tx
        .execute(
            "UPDATE poke_lounge_user SET resume_code_hash=$1 WHERE id=$2 AND is_guest",
            &[&hash_bytes(code.as_bytes()), &user],
        )
        .await?
        != 1
    {
        return Err(LeagueError::new(403, "LEAGUE_GUEST_REQUIRED"));
    }
    tx.commit().await?;
    tracing::info!(event = "league.guest_code_issued", user_id = %user);
    let mut response =
        success(json!({"code":format!("{}-{}-{}", &code[..4], &code[4..8], &code[8..])}))
            .into_response();
    response
        .headers_mut()
        .insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    Ok(response)
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct ResumeBody {
    code: String,
}

pub(super) async fn resume(
    State(state): State<AppState>,
    Extension(league): Extension<Arc<League>>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    body: std::result::Result<Json<ResumeBody>, JsonRejection>,
) -> Result<Response> {
    check_origin(&state, &headers)?;
    let code = body.ok().and_then(|Json(body)| {
        if body.code.len() > 256 {
            return None;
        }
        let code: String = body
            .code
            .chars()
            .filter(|c| *c != '-' && !c.is_whitespace())
            .map(|c| c.to_ascii_uppercase())
            .collect();
        (code.len() == 12 && code.bytes().all(|b| CODE_ALPHABET.contains(&b))).then_some(code)
    });
    let ip = client_ip(peer.ip(), &headers, &state.trusted_proxies);
    let ip_hash = hash_bytes(ip.to_string().as_bytes());
    let mut slot = league.db.client().await?;
    let tx = slot
        .as_mut()
        .ok_or_else(LeagueError::unavailable)?
        .transaction()
        .await?;
    // A per-IP transaction lock makes failures share one budget across instances.
    tx.query_one(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 1795824000))",
        &[&ip_hash],
    )
    .await?;
    tx.execute("DELETE FROM poke_lounge_guest_resume_failure WHERE ip_hash=$1 AND created_at <= now() - interval '1 hour'", &[&ip_hash]).await?;
    let budget = tx.query_one("SELECT count(*) AS failures, ceil(extract(epoch FROM min(created_at) + interval '1 hour' - now()))::bigint AS retry_after FROM poke_lounge_guest_resume_failure WHERE ip_hash=$1", &[&ip_hash]).await?;
    if budget.try_get::<_, i64>("failures")? >= 10 {
        let retry_after = budget.try_get::<_, i64>("retry_after")?.max(1);
        let mut response = LeagueError::new(429, "LEAGUE_GUEST_RESUME_RATE_LIMITED")
            .detail(json!({"retryAfter":retry_after,"retryAfterMs":retry_after * 1000}))
            .into_response();
        response.headers_mut().insert(
            header::RETRY_AFTER,
            HeaderValue::from_str(&retry_after.to_string()).expect("positive seconds"),
        );
        tx.commit().await?;
        return Ok(response);
    }
    let season = tx.query_opt("SELECT id FROM poke_lounge_league_season WHERE open_ended AND settled_at IS NULL AND starts_at <= now() FOR SHARE", &[]).await?;
    let user = if let (Some(_), Some(code)) = (season, code) {
        // Hold the user row against rotation until the new session is committed.
        tx.query_opt("SELECT id, display_name FROM poke_lounge_user WHERE is_guest AND resume_code_hash=$1 FOR SHARE", &[&hash_bytes(code.as_bytes())]).await?
    } else {
        None
    };
    let Some(user) = user else {
        tx.execute(
            "INSERT INTO poke_lounge_guest_resume_failure (id, ip_hash) VALUES ($1, $2)",
            &[&Uuid::new_v4(), &ip_hash],
        )
        .await?;
        // Commit rejected attempts too; rolling back would erase the rate limit.
        tx.commit().await?;
        tracing::info!(event = "league.guest_resume_rejected");
        return Err(LeagueError::new(404, "LEAGUE_GUEST_RESUME_INVALID"));
    };
    let id: Uuid = user.try_get("id")?;
    let name: String = user.try_get("display_name")?;
    let mut random = [0u8; 32];
    rand::rngs::OsRng
        .try_fill_bytes(&mut random)
        .map_err(|_| LeagueError::unavailable())?;
    let session: String = random.iter().map(|b| format!("{b:02x}")).collect();
    if let Some(previous) = previous_session_token(&headers) {
        tx.execute(
            "DELETE FROM poke_lounge_auth_session WHERE token_hash=$1",
            &[&hash_bytes(previous.as_bytes())],
        )
        .await?;
    }
    tx.execute("INSERT INTO poke_lounge_auth_session (token_hash, user_id, expires_at) VALUES ($1, $2, now() + interval '30 days')", &[&hash_bytes(session.as_bytes()), &id]).await?;
    tx.commit().await?;
    tracing::info!(event = "league.guest_resume", user_id = %id);
    let mut response =
        success(json!({"user":{"id":id,"displayName":name,"isGuest":true}})).into_response();
    response
        .headers_mut()
        .insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    set_session_cookie(&state, &mut response, &session);
    Ok(response)
}
