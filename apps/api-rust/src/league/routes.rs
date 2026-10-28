use super::{
    League, db,
    error::{LeagueError, Result},
    limiter::Kind,
};
use crate::{
    auth::current_user,
    http::{AppState, success},
};
use axum::{
    Extension, Json, Router,
    extract::{Query, State},
    http::HeaderMap,
    routing::get,
};
use serde::Deserialize;
use serde_json::Value;
use std::sync::Arc;
use uuid::Uuid;

pub fn router(league: Arc<League>) -> Router<AppState> {
    Router::new()
        .route("/league/v1/status", get(status))
        .route("/league/v1/standings", get(standings))
        .route("/league/v1/hall-of-fame", get(hall))
        .route("/league/v1/me", get(me))
        .route("/league/v1/me/seasons", get(seasons))
        .layer(Extension(league))
}
async fn user(
    state: &AppState,
    headers: &HeaderMap,
    league: &League,
    kind: Kind,
) -> Result<(Uuid, String)> {
    let user = current_user(state, headers)
        .await
        .map_err(|_| LeagueError::unavailable())?
        .ok_or_else(|| LeagueError::new(401, "LEAGUE_UNAUTHORIZED"))?;
    league.limiter.check(user.0, kind)?;
    Ok(user)
}
async fn public_limit(state: &AppState, headers: &HeaderMap, league: &League) -> Result<()> {
    if let Some((id, _)) = current_user(state, headers)
        .await
        .map_err(|_| LeagueError::unavailable())?
    {
        league.limiter.check(id, Kind::Read)?;
    }
    Ok(())
}
async fn status(
    State(state): State<AppState>,
    Extension(l): Extension<Arc<League>>,
    headers: HeaderMap,
) -> Result<Json<Value>> {
    public_limit(&state, &headers, &l).await?;
    Ok(success(db::retry(|| l.status()).await?))
}
async fn standings(
    State(state): State<AppState>,
    Extension(l): Extension<Arc<League>>,
    headers: HeaderMap,
) -> Result<Json<Value>> {
    public_limit(&state, &headers, &l).await?;
    Ok(success(db::retry(|| l.standings()).await?))
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct HallQuery {
    season_id: Option<i32>,
}
async fn hall(
    State(state): State<AppState>,
    Extension(l): Extension<Arc<League>>,
    headers: HeaderMap,
    Query(q): Query<HallQuery>,
) -> Result<Json<Value>> {
    public_limit(&state, &headers, &l).await?;
    Ok(success(db::retry(|| l.hall_of_fame(q.season_id)).await?))
}
async fn me(
    State(state): State<AppState>,
    Extension(l): Extension<Arc<League>>,
    headers: HeaderMap,
) -> Result<Json<Value>> {
    let (id, name) = user(&state, &headers, &l, Kind::Read).await?;
    Ok(success(db::retry(|| l.me(id, &name)).await?))
}
async fn seasons(
    State(state): State<AppState>,
    Extension(l): Extension<Arc<League>>,
    headers: HeaderMap,
) -> Result<Json<Value>> {
    let (id, _) = user(&state, &headers, &l, Kind::Read).await?;
    Ok(success(db::retry(|| l.personal_seasons(id)).await?))
}
