use super::{
    League,
    error::{LeagueError, Result},
};
use crate::{
    auth::{current_user, set_session_cookie},
    http::{AppState, client_ip, success},
    repository::hash_bytes,
};
use axum::{
    Extension, Json,
    extract::{ConnectInfo, State, rejection::JsonRejection},
    http::{HeaderMap, header},
    response::{IntoResponse, Response},
};
use rand::RngCore;
use serde_json::{Value, json};
use std::{net::SocketAddr, sync::Arc};
use uuid::Uuid;

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
    if !headers
        .get(header::ORIGIN)
        .is_some_and(|origin| state.origins.contains(origin))
    {
        return Err(LeagueError::new(403, "LEAGUE_GUEST_ORIGIN_REJECTED"));
    }
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
    if budget.try_get::<_, i64>("total")? >= 500 || budget.try_get::<_, i64>("per_ip")? >= 5 {
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
