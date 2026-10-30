#[path = "growth_store.rs"]
mod growth_store;
#[path = "profile.rs"]
pub(super) mod profile;
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
    extract::{
        Path, State,
        rejection::{JsonRejection, PathRejection},
    },
    http::HeaderMap,
    routing::{get, post, put},
};
use serde::Deserialize;
use serde_json::Value;
use std::sync::Arc;
use uuid::Uuid;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/league/v1/profile/nickname", put(nickname))
        .route("/league/v1/runs", post(start))
        .route("/league/v1/runs/{id}/save", get(load).put(save))
        .route("/league/v1/runs/{id}/mints", post(mint))
        .route("/league/v1/runs/{id}/badge-battles", post(badge_start))
        .route("/league/v1/badge-battles/{id}/result", post(badge_result))
}
async fn user(state: &AppState, headers: &HeaderMap, l: &League, kind: Kind) -> Result<Uuid> {
    let (id, _) = current_user(state, headers)
        .await
        .map_err(|_| LeagueError::unavailable())?
        .ok_or_else(|| LeagueError::new(401, "LEAGUE_UNAUTHORIZED"))?;
    l.limiter.check(id, kind)?;
    Ok(id)
}
fn body<T>(value: std::result::Result<Json<T>, JsonRejection>, code: &'static str) -> Result<T> {
    value
        .map(|Json(v)| v)
        .map_err(|_| LeagueError::new(422, code))
}
fn path(value: std::result::Result<Path<Uuid>, PathRejection>) -> Result<Uuid> {
    value
        .map(|Path(v)| v)
        .map_err(|_| LeagueError::new(404, "LEAGUE_NOT_FOUND"))
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Nickname {
    nickname: String,
}
async fn nickname(
    State(state): State<AppState>,
    Extension(l): Extension<Arc<League>>,
    headers: HeaderMap,
    input: std::result::Result<Json<Nickname>, JsonRejection>,
) -> Result<Json<Value>> {
    let user = user(&state, &headers, &l, Kind::Growth).await?;
    let b = body(input, "LEAGUE_NICKNAME_INVALID")?;
    Ok(success(
        db::retry(|| profile::set_nickname(&l, user, &b.nickname)).await?,
    ))
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Start {
    starter_species_id: i16,
    request_key: Uuid,
}
async fn start(
    State(state): State<AppState>,
    Extension(l): Extension<Arc<League>>,
    headers: HeaderMap,
    input: std::result::Result<Json<Start>, JsonRejection>,
) -> Result<Json<Value>> {
    let user = user(&state, &headers, &l, Kind::Growth).await?;
    let b = body(input, "LEAGUE_STARTER_INVALID")?;
    Ok(success(
        l.growth_start(user, b.starter_species_id, b.request_key)
            .await?,
    ))
}
async fn load(
    State(state): State<AppState>,
    Extension(l): Extension<Arc<League>>,
    headers: HeaderMap,
    id: std::result::Result<Path<Uuid>, PathRejection>,
) -> Result<Json<Value>> {
    let user = user(&state, &headers, &l, Kind::Read).await?;
    let id = path(id)?;
    Ok(success(db::retry(|| l.growth_save_get(user, id)).await?))
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Save {
    base_rev: i32,
    data: Value,
}
async fn save(
    State(state): State<AppState>,
    Extension(l): Extension<Arc<League>>,
    headers: HeaderMap,
    id: std::result::Result<Path<Uuid>, PathRejection>,
    input: std::result::Result<Json<Save>, JsonRejection>,
) -> Result<Json<Value>> {
    let user = user(&state, &headers, &l, Kind::Save).await?;
    let id = path(id)?;
    let b = body(input, "LEAGUE_SAVE_INVALID")?;
    Ok(success(
        db::retry(|| l.growth_save_put(user, id, b.base_rev, &b.data)).await?,
    ))
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Mint {
    species_id: i16,
    level: i16,
    request_key: Uuid,
}
async fn mint(
    State(state): State<AppState>,
    Extension(l): Extension<Arc<League>>,
    headers: HeaderMap,
    id: std::result::Result<Path<Uuid>, PathRejection>,
    input: std::result::Result<Json<Mint>, JsonRejection>,
) -> Result<Json<Value>> {
    let user = user(&state, &headers, &l, Kind::Mint).await?;
    let id = path(id)?;
    let b = body(input, "LEAGUE_MINT_REJECTED")?;
    if !(1..=493).contains(&b.species_id) || !(1..=100).contains(&b.level) {
        return Err(LeagueError::new(422, "LEAGUE_MINT_REJECTED"));
    }
    Ok(success(
        db::retry(|| l.growth_mint(user, id, b.species_id, b.level, b.request_key)).await?,
    ))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct BadgeStart {
    party: Value,
    request_key: Uuid,
}
async fn badge_start(
    State(state): State<AppState>,
    Extension(l): Extension<Arc<League>>,
    headers: HeaderMap,
    id: std::result::Result<Path<Uuid>, PathRejection>,
    input: std::result::Result<Json<BadgeStart>, JsonRejection>,
) -> Result<Json<Value>> {
    let user = user(&state, &headers, &l, Kind::Badge).await?;
    let id = path(id)?;
    let b = body(input, "LEAGUE_PARTY_INVALID")?;
    Ok(success(
        db::retry(|| l.growth_badge_start(user, id, b.request_key, &b.party)).await?,
    ))
}
async fn badge_result(
    State(state): State<AppState>,
    Extension(l): Extension<Arc<League>>,
    headers: HeaderMap,
    id: std::result::Result<Path<Uuid>, PathRejection>,
    input: std::result::Result<Json<Value>, JsonRejection>,
) -> Result<Json<Value>> {
    let user = user(&state, &headers, &l, Kind::Badge).await?;
    let id = path(id)?;
    let b = body(input, "LEAGUE_INPUT_REJECTED")?;
    Ok(success(l.growth_badge_result(user, id, &b).await?))
}
