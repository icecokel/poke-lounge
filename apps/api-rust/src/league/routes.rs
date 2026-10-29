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
    extract::{Path, Query, Request, State},
    http::HeaderMap,
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::{get, post},
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
        .route("/league/v1/attempts/current", get(current))
        .route("/league/v1/attempts", post(enter))
        .route("/league/v1/attempts/{id}/matches/{index}", post(submit))
        .route("/league/v1/attempts/{id}/forfeit", post(forfeit))
        .route_layer(middleware::from_fn_with_state(league.clone(), limit))
        .layer(Extension(league))
}
async fn limit(State(league): State<Arc<League>>, request: Request, next: Next) -> Response {
    let Ok(_permit) = league.requests.try_acquire() else {
        return LeagueError::new(503, "LEAGUE_BUSY").into_response();
    };
    next.run(request).await
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
    query: std::result::Result<Query<HallQuery>, axum::extract::rejection::QueryRejection>,
) -> Result<Json<Value>> {
    public_limit(&state, &headers, &l).await?;
    let Query(q) = query.map_err(|_| LeagueError::new(404, "LEAGUE_NOT_FOUND"))?;
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

async fn current(
    State(state): State<AppState>,
    Extension(l): Extension<Arc<League>>,
    headers: HeaderMap,
) -> Result<Json<Value>> {
    let (id, _) = user(&state, &headers, &l, Kind::Read).await?;
    Ok(success(
        serde_json::to_value(db::retry(|| l.current_attempt(id)).await?)
            .map_err(|_| LeagueError::corrupt())?,
    ))
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Entry {
    run_id: Uuid,
    entry_key: Uuid,
    party: Value,
}
async fn enter(
    State(state): State<AppState>,
    Extension(l): Extension<Arc<League>>,
    headers: HeaderMap,
    body: std::result::Result<Json<Entry>, axum::extract::rejection::JsonRejection>,
) -> Result<Json<Value>> {
    let (id, _) = user(&state, &headers, &l, Kind::Entry).await?;
    let Json(body) = body.map_err(|_| LeagueError::new(422, "LEAGUE_PARTY_INVALID"))?;
    Ok(success(
        l.enter_attempt(id, body.run_id, body.entry_key, &body.party)
            .await?,
    ))
}

async fn submit(
    State(state): State<AppState>,
    Extension(l): Extension<Arc<League>>,
    headers: HeaderMap,
    path: std::result::Result<Path<(Uuid, i16)>, axum::extract::rejection::PathRejection>,
    body: std::result::Result<Json<Value>, axum::extract::rejection::JsonRejection>,
) -> Result<Json<Value>> {
    let (user, name) = user(&state, &headers, &l, Kind::Match).await?;
    let Path((attempt, index)) = path.map_err(|_| LeagueError::new(404, "LEAGUE_NOT_FOUND"))?;
    let Json(body) = body.map_err(|_| LeagueError::new(422, "LEAGUE_INPUT_REJECTED"))?;
    Ok(success(
        l.submit_match(user, &name, attempt, index, &body).await?,
    ))
}
async fn forfeit(
    State(state): State<AppState>,
    Extension(l): Extension<Arc<League>>,
    headers: HeaderMap,
    path: std::result::Result<Path<Uuid>, axum::extract::rejection::PathRejection>,
    body: std::result::Result<Json<Value>, axum::extract::rejection::JsonRejection>,
) -> Result<Json<Value>> {
    let (user, _) = user(&state, &headers, &l, Kind::Read).await?;
    let Path(attempt) = path.map_err(|_| LeagueError::new(404, "LEAGUE_NOT_FOUND"))?;
    let Json(body) = body.map_err(|_| LeagueError::new(422, "LEAGUE_INPUT_REJECTED"))?;
    if !body.as_object().is_some_and(|o| o.is_empty()) {
        return Err(LeagueError::new(422, "LEAGUE_INPUT_REJECTED"));
    }
    Ok(success(db::retry(|| l.forfeit(user, attempt)).await?))
}
