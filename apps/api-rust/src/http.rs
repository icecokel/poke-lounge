use crate::{
    actors::{Operation, Rooms},
    compute::{Compute, ENGINE_VERSION},
    config::{Config, REQUEST_TIMEOUT},
    data::Data,
    domain::{
        AiDifficulty, CreateRoom, GameCommand, normalize_code, normalize_name, session_hash,
        validate_player_id,
    },
    error::{AppError, AppResult},
    repository::Repository,
};
use axum::{
    Json, Router,
    extract::{
        ConnectInfo, DefaultBodyLimit, MatchedPath, Path, Query, Request, State,
        rejection::JsonRejection,
    },
    http::{HeaderMap, HeaderValue, Method, StatusCode, header},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::{any, get, post},
};
use serde::Deserialize;
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    net::{IpAddr, SocketAddr},
    sync::{Arc, atomic::Ordering},
    time::{Duration, Instant},
};
use tokio::sync::{Mutex, Semaphore};
use tokio_util::sync::CancellationToken;
use tower_http::cors::CorsLayer;
use tracing::Instrument;
use uuid::Uuid;

#[derive(Clone)]
pub struct AppState {
    pub release: String,
    pub repository: Repository,
    pub rooms: Rooms,
    pub compute: Compute,
    pub data: Data,
    pub shutdown: CancellationToken,
    pub started: Instant,
    pub requests: Arc<Semaphore>,
    pub sockets: Arc<Semaphore>,
    pub origins: Arc<Vec<HeaderValue>>,
    pub budgets: Arc<Mutex<HashMap<IpAddr, Budget>>>,
}
pub struct Budget {
    since: Instant,
    count: u32,
    creates: u32,
    diagnostics: u32,
}
pub fn router(state: AppState, config: &Config) -> Router {
    Router::new()
        .route(
            "/",
            get(|| async { success(json!("Poke Lounge Rust API")) }),
        )
        .route("/health", get(ready))
        .route("/health/live", get(live))
        .route("/health/ready", get(ready))
        .route("/diagnostics/client-errors", post(client_error))
        .route("/poke-lounge/rom-data", get(rom))
        .route("/poke-lounge/rooms", post(create))
        .route("/poke-lounge/rooms/public", get(public_rooms))
        .route("/poke-lounge/rooms/quick-play", post(quick_play))
        .route("/poke-lounge/rooms/{code}", get(snapshot))
        .route("/poke-lounge/rooms/{code}/join", post(join))
        .route("/poke-lounge/rooms/{code}/ready", post(set_ready))
        .route("/poke-lounge/rooms/{code}/round-ready", post(round_ready))
        .route("/poke-lounge/rooms/{code}/start", post(start))
        .route("/poke-lounge/rooms/{code}/ai-participants", post(add_ai))
        .route(
            "/poke-lounge/rooms/{code}/ai-participants/{player}/difficulty",
            post(set_ai_difficulty),
        )
        .route(
            "/poke-lounge/rooms/{code}/ai-participants/{player}/remove",
            post(remove_ai),
        )
        .route("/poke-lounge/rooms/{code}/party-snapshot", post(party))
        .route("/poke-lounge/rooms/{code}/leave", post(leave))
        .route(
            "/poke-lounge/rooms/{code}/matches/{battle}/session-actions",
            post(action),
        )
        .route(
            "/poke-lounge/rooms/{code}/matches/{battle}/actions",
            post(account_disabled),
        )
        .route(
            "/poke-lounge/rooms/{code}/competitive-seat",
            post(account_disabled),
        )
        .route(
            "/poke-lounge/rooms/{code}/result",
            post(|| async {
                AppError::Invalid("Only the server may determine tournament results")
            }),
        )
        .route("/poke-lounge/ws", any(crate::socket::upgrade))
        .route("/game/ranking", get(ranking))
        .route("/game/result/{id}", get(result))
        .route("/game/result", post(account_disabled))
        .route(
            "/game/poke-lounge/state",
            get(account_disabled).put(account_disabled),
        )
        .fallback(|| async {
            (
                StatusCode::NOT_FOUND,
                Json(json!({"success":false,"code":"ROUTE_NOT_FOUND"})),
            )
        })
        .layer(DefaultBodyLimit::max(128 * 1024))
        .layer(middleware::from_fn_with_state(state.clone(), limits))
        .layer(
            CorsLayer::new()
                .allow_origin(config.allowed_origins.clone())
                .allow_methods([
                    Method::GET,
                    Method::POST,
                    Method::PUT,
                    Method::DELETE,
                    Method::OPTIONS,
                ])
                .allow_headers([
                    header::AUTHORIZATION,
                    header::CONTENT_TYPE,
                    "x-idempotency-key".parse().expect("static header"),
                    "if-match-revision".parse().expect("static header"),
                    "x-room-instance".parse().expect("static header"),
                    "x-player-id".parse().expect("static header"),
                    "x-session-id".parse().expect("static header"),
                    "x-request-id".parse().expect("static header"),
                ])
                .expose_headers(["x-request-id".parse().expect("static header")]),
        )
        .layer(middleware::from_fn_with_state(state.clone(), diagnostics))
        .with_state(state)
}
pub fn success(data: Value) -> Json<Value> {
    Json(json!({"success":true,"data":data}))
}
async fn live(State(state): State<AppState>) -> Json<Value> {
    success(json!({"status":"ok","backend":"rust","uptime":state.started.elapsed().as_secs()}))
}
async fn ready(State(state): State<AppState>) -> AppResult<Json<Value>> {
    if state.shutdown.is_cancelled() {
        return Err(AppError::Unavailable);
    }
    let (now, _, _) = tokio::try_join!(
        state.repository.now(),
        state.compute.ready(),
        state.data.ready()
    )?;
    Ok(success(
        json!({"status":"ok","backend":"rust","engineVersion":ENGINE_VERSION.trim(),"serverNowMs":now,"lastRoomTickMs":state.rooms.last_tick_ms.load(Ordering::Relaxed),"uptime":state.started.elapsed().as_secs()}),
    ))
}
async fn limits(State(state): State<AppState>, request: Request, next: Next) -> Response {
    if state.shutdown.is_cancelled() {
        return AppError::Unavailable.into_response();
    }
    let Ok(_permit) = state.requests.try_acquire() else {
        return AppError::Busy.into_response();
    };
    if let Some(origin) = request.headers().get(header::ORIGIN)
        && !state.origins.contains(origin)
    {
        return AppError::Forbidden.into_response();
    }
    if let Some(peer) = request.extensions().get::<ConnectInfo<SocketAddr>>() {
        let mut budgets = state.budgets.lock().await;
        budgets.retain(|_, b| b.since.elapsed() < Duration::from_secs(60));
        if budgets.len() >= 4096 && !budgets.contains_key(&peer.0.ip()) {
            return AppError::Busy.into_response();
        }
        let budget = budgets.entry(peer.0.ip()).or_insert(Budget {
            since: Instant::now(),
            count: 0,
            creates: 0,
            diagnostics: 0,
        });
        budget.count += 1;
        if request.method() == Method::POST
            && matches!(
                request.uri().path(),
                "/poke-lounge/rooms" | "/poke-lounge/rooms/quick-play"
            )
        {
            budget.creates += 1;
        }
        if request.uri().path() == "/diagnostics/client-errors" {
            budget.diagnostics += 1;
        }
        if budget.count > 6_000 || budget.creates > 60 || budget.diagnostics > 600 {
            return AppError::Busy.into_response();
        }
    }
    // WebSocket upgrades return immediately. The connection has separate limits and deadlines.
    match tokio::time::timeout(REQUEST_TIMEOUT, next.run(request)).await {
        Ok(r) => r,
        Err(_) => AppError::Timeout.into_response(),
    }
}
async fn diagnostics(State(state): State<AppState>, request: Request, next: Next) -> Response {
    let id = request
        .headers()
        .get("x-request-id")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| Uuid::parse_str(value).ok())
        .filter(|value| value.get_version_num() == 4)
        .unwrap_or_else(Uuid::new_v4)
        .to_string();
    let route = request
        .extensions()
        .get::<MatchedPath>()
        .map(MatchedPath::as_str)
        .unwrap_or("unmatched")
        .to_owned();
    let method = request.method().clone();
    let room_code = request
        .uri()
        .path()
        .strip_prefix("/poke-lounge/rooms/")
        .filter(|_| route.contains("{code}"))
        .and_then(|path| path.split('/').next())
        .and_then(|code| normalize_code(code).ok());
    let command_id = request
        .headers()
        .get("x-idempotency-key")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| Uuid::parse_str(value).ok())
        .filter(|value| value.get_version_num() == 4);
    let room_instance_id = request
        .headers()
        .get("x-room-instance")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| Uuid::parse_str(value).ok());
    let start = Instant::now();
    let span = tracing::info_span!("http.request", request_id = %id, route = %route, method = %method, room_instance_id = ?room_instance_id, room_code = ?room_code, command_id = ?command_id, release = %state.release);
    let mut response = next.run(request).instrument(span).await;
    response.headers_mut().insert(
        "x-request-id",
        HeaderValue::from_str(&id).expect("UUID header"),
    );
    response
        .headers_mut()
        .insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    let status = response.status().as_u16();
    let duration_ms = start.elapsed().as_millis() as u64;
    if status >= 500 {
        tracing::error!(event="api.request",request_id=%id,%route,%method,room_instance_id=?room_instance_id,room_code=?room_code,command_id=?command_id,release=%state.release,status,duration_ms);
    } else if status >= 400 || duration_ms >= 1_000 {
        tracing::warn!(event="api.request",request_id=%id,%route,%method,room_instance_id=?room_instance_id,room_code=?room_code,command_id=?command_id,release=%state.release,status,duration_ms);
    } else if method == Method::GET && route.starts_with("/health") {
        tracing::debug!(event="api.request",request_id=%id,%route,%method,release=%state.release,status,duration_ms);
    } else {
        tracing::info!(event="api.request",request_id=%id,%route,%method,room_instance_id=?room_instance_id,room_code=?room_code,command_id=?command_id,release=%state.release,status,duration_ms);
    }
    response
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ClientError {
    kind: String,
    code: String,
    request_id: Option<Uuid>,
    page: String,
    line: Option<u32>,
    column: Option<u32>,
    release: Option<String>,
    script: Option<String>,
    room_instance_id: Option<Uuid>,
    room_code: Option<String>,
    session_id: Option<String>,
    error_name: Option<String>,
    error_text: Option<String>,
    startup_step: Option<String>,
    resource_path: Option<String>,
    user_code: Option<String>,
    user_agent: Option<String>,
}

async fn client_error(Json(payload): Json<ClientError>) -> AppResult<StatusCode> {
    let valid_label = |value: &str, max: usize| {
        !value.is_empty()
            && value.len() <= max
            && value
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b'-'))
    };
    if !valid_label(&payload.kind, 32)
        || !valid_label(&payload.code, 64)
        || !matches!(payload.page.as_str(), "poke-lounge" | "other")
        || payload.line.is_some_and(|line| line > 1_000_000)
        || payload.column.is_some_and(|column| column > 1_000_000)
        || payload.release.as_ref().is_some_and(|release| {
            release.len() != 40 || !release.bytes().all(|byte| byte.is_ascii_hexdigit())
        })
        || payload.script.as_ref().is_some_and(|script| {
            !script.starts_with("/_next/static/")
                || script.len() > 200
                || !script.bytes().all(|byte| {
                    byte.is_ascii_alphanumeric() || matches!(byte, b'/' | b'_' | b'.' | b'-')
                })
        })
        || payload
            .error_name
            .as_ref()
            .is_some_and(|name| !valid_label(name, 48))
        || payload
            .room_code
            .as_ref()
            .is_some_and(|code| !valid_label(code, 64))
        || payload
            .session_id
            .as_ref()
            .is_some_and(|id| !valid_label(id, 80))
        || payload.error_text.as_ref().is_some_and(|text| {
            text.is_empty()
                || text.len() > 8192
                || text
                    .chars()
                    .any(|character| character.is_control() && !matches!(character, '\n' | '\t'))
        })
        || payload.startup_step.as_ref().is_some_and(|step| {
            step.is_empty()
                || step.len() > 48
                || !step
                    .bytes()
                    .all(|byte| byte.is_ascii_lowercase() || byte == b'_')
        })
        || payload.resource_path.as_ref().is_some_and(|path| {
            path.len() > 200
                || !(path.starts_with("/assets/") || path.starts_with("/game-data/"))
                || path.contains("..")
                || !path.bytes().all(|byte| {
                    byte.is_ascii_alphanumeric() || matches!(byte, b'/' | b'_' | b'.' | b'-')
                })
        })
        || payload
            .user_code
            .as_ref()
            .is_some_and(|code| code.len() != 5 || !code.bytes().all(|byte| byte.is_ascii_digit()))
        || payload.user_agent.as_ref().is_some_and(|agent| {
            agent.is_empty() || agent.len() > 1024 || agent.chars().any(char::is_control)
        })
    {
        return Err(AppError::Invalid("Invalid diagnostic event"));
    }
    tracing::warn!(
        event = "browser.error",
        kind = %payload.kind,
        code = %payload.code,
        related_request_id = %payload.request_id.map(|id| id.to_string()).unwrap_or_else(|| "none".to_string()),
        page = %payload.page,
        line = ?payload.line,
        column = ?payload.column,
        release = %payload.release.as_deref().unwrap_or("none"),
        script = %payload.script.as_deref().unwrap_or("none"),
        room_instance_id = %payload.room_instance_id.map(|id| id.to_string()).unwrap_or_else(|| "none".to_string()),
        room_code = %payload.room_code.as_deref().unwrap_or("none"),
        session_fingerprint = ?payload.session_id.as_deref().map(|id| crate::repository::hash_bytes(id.as_bytes())),
        error_name = %payload.error_name.as_deref().unwrap_or("none"),
        error_text = %payload.error_text.as_deref().unwrap_or("none"),
        startup_step = %payload.startup_step.as_deref().unwrap_or("none"),
        resource_path = %payload.resource_path.as_deref().unwrap_or("none"),
        user_code = %payload.user_code.as_deref().unwrap_or("none"),
        user_agent = %payload.user_agent.as_deref().unwrap_or("none"),
    );
    Ok(StatusCode::NO_CONTENT)
}
fn body<T>(value: Result<Json<T>, JsonRejection>) -> AppResult<T> {
    value
        .map(|j| j.0)
        .map_err(|_| AppError::Invalid("Request body is invalid"))
}
fn command_id(headers: &HeaderMap) -> AppResult<String> {
    let value = headers
        .get("x-idempotency-key")
        .and_then(|v| v.to_str().ok())
        .ok_or(AppError::Invalid("X-Idempotency-Key required"))?;
    let id = Uuid::parse_str(value).map_err(|_| AppError::Invalid("Invalid idempotency key"))?;
    if id.get_version_num() != 4 || id.to_string() != value {
        return Err(AppError::Invalid(
            "Idempotency key must be canonical UUID v4",
        ));
    }
    Ok(value.into())
}
fn revision(headers: &HeaderMap) -> AppResult<u64> {
    headers
        .get("if-match-revision")
        .and_then(|h| h.to_str().ok())
        .filter(|v| !v.is_empty() && v.bytes().all(|b| b.is_ascii_digit()))
        .and_then(|v| v.parse().ok())
        .filter(|n| *n < 9_007_199_254_740_991)
        .ok_or(AppError::Invalid("If-Match-Revision required"))
}
fn optional_revision(headers: &HeaderMap) -> AppResult<Option<u64>> {
    headers
        .get("if-match-revision")
        .map(|_| revision(headers))
        .transpose()
}
pub fn instance(headers: &HeaderMap) -> AppResult<Option<Uuid>> {
    headers
        .get("x-room-instance")
        .map(|h| {
            h.to_str()
                .ok()
                .and_then(|v| Uuid::parse_str(v).ok())
                .ok_or(AppError::Invalid("Invalid room instance"))
        })
        .transpose()
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Identity {
    player_id: String,
    session_id: String,
}
async fn apply(
    state: AppState,
    code: String,
    headers: HeaderMap,
    identity: Identity,
    command: GameCommand,
    expected: Option<u64>,
) -> AppResult<Json<Value>> {
    validate_player_id(&identity.player_id)?;
    let session = session_hash(&identity.session_id)?;
    let id = state
        .rooms
        .resolve(&normalize_code(&code)?, instance(&headers)?)
        .await?;
    let value = state
        .rooms
        .request(
            id,
            Operation::Command {
                player: identity.player_id,
                session,
                id: command_id(&headers)?,
                expected,
                command,
                request_hash: None,
            },
        )
        .await?;
    Ok(success(value))
}
async fn create(
    State(state): State<AppState>,
    headers: HeaderMap,
    value: Result<Json<CreateRoom>, JsonRejection>,
) -> AppResult<Json<Value>> {
    if revision(&headers)? != 0 {
        return Err(AppError::Invalid("Create revision must be zero"));
    }
    Ok(success(
        state
            .rooms
            .create(body(value)?.normalize()?, command_id(&headers)?)
            .await?,
    ))
}
async fn public_rooms(State(state): State<AppState>) -> AppResult<Json<Value>> {
    Ok(success(state.rooms.public_rooms().await?))
}
async fn quick_play(
    State(state): State<AppState>,
    headers: HeaderMap,
    value: Result<Json<CreateRoom>, JsonRejection>,
) -> AppResult<Json<Value>> {
    Ok(success(
        state
            .rooms
            .quick_play(body(value)?.normalize()?, command_id(&headers)?)
            .await?,
    ))
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ReadQuery {
    after_revision: Option<u64>,
}
async fn snapshot(
    State(state): State<AppState>,
    Path(code): Path<String>,
    headers: HeaderMap,
    Query(query): Query<ReadQuery>,
) -> AppResult<Json<Value>> {
    let requester = match (headers.get("x-player-id"), headers.get("x-session-id")) {
        (Some(player), Some(session)) => {
            let player = player.to_str().map_err(|_| AppError::Forbidden)?;
            validate_player_id(player)?;
            let session = session.to_str().map_err(|_| AppError::Forbidden)?;
            Some((player.to_owned(), session_hash(session)?))
        }
        (None, None) => None,
        _ => return Err(AppError::Forbidden),
    };
    let id = state
        .rooms
        .resolve(&normalize_code(&code)?, instance(&headers)?)
        .await?;
    Ok(success(
        state
            .rooms
            .request(
                id,
                Operation::ReadSnapshot {
                    after: query.after_revision,
                    requester,
                },
            )
            .await?,
    ))
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct JoinBody {
    player_id: String,
    session_id: String,
    display_name: Option<String>,
}
async fn join(
    State(state): State<AppState>,
    Path(code): Path<String>,
    headers: HeaderMap,
    value: Result<Json<JoinBody>, JsonRejection>,
) -> AppResult<Json<Value>> {
    let b = body(value)?;
    let expected = optional_revision(&headers)?;
    let name = normalize_name(b.display_name.as_deref().unwrap_or("플레이어"))?;
    apply(
        state,
        code,
        headers,
        Identity {
            player_id: b.player_id,
            session_id: b.session_id,
        },
        GameCommand::Join { display_name: name },
        expected,
    )
    .await
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ReadyBody {
    player_id: String,
    session_id: String,
    ready: bool,
    round_index: Option<u8>,
}
async fn set_ready(
    State(state): State<AppState>,
    Path(code): Path<String>,
    headers: HeaderMap,
    value: Result<Json<ReadyBody>, JsonRejection>,
) -> AppResult<Json<Value>> {
    let b = body(value)?;
    let expected = revision(&headers)?;
    apply(
        state,
        code,
        headers,
        Identity {
            player_id: b.player_id,
            session_id: b.session_id,
        },
        GameCommand::Ready {
            ready: b.ready,
            round_index: b.round_index,
        },
        Some(expected),
    )
    .await
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RoundBody {
    player_id: String,
    session_id: String,
    round_index: u8,
}
async fn round_ready(
    State(state): State<AppState>,
    Path(code): Path<String>,
    headers: HeaderMap,
    value: Result<Json<RoundBody>, JsonRejection>,
) -> AppResult<Json<Value>> {
    let b = body(value)?;
    if !(1..=3).contains(&b.round_index) {
        return Err(AppError::Invalid("Invalid round"));
    }
    apply(
        state,
        code,
        headers,
        Identity {
            player_id: b.player_id,
            session_id: b.session_id,
        },
        GameCommand::RoundReady {
            round_index: b.round_index,
        },
        None,
    )
    .await
}
async fn start(
    State(state): State<AppState>,
    Path(code): Path<String>,
    headers: HeaderMap,
    value: Result<Json<Identity>, JsonRejection>,
) -> AppResult<Json<Value>> {
    let expected = revision(&headers)?;
    apply(
        state,
        code,
        headers,
        body(value)?,
        GameCommand::Start,
        Some(expected),
    )
    .await
}
async fn add_ai(
    State(state): State<AppState>,
    Path(code): Path<String>,
    headers: HeaderMap,
    value: Result<Json<Identity>, JsonRejection>,
) -> AppResult<Json<Value>> {
    let expected = revision(&headers)?;
    apply(
        state,
        code,
        headers,
        body(value)?,
        GameCommand::AddAi,
        Some(expected),
    )
    .await
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct AiDifficultyBody {
    player_id: String,
    session_id: String,
    difficulty: AiDifficulty,
}
async fn set_ai_difficulty(
    State(state): State<AppState>,
    Path((code, ai_player)): Path<(String, String)>,
    headers: HeaderMap,
    value: Result<Json<AiDifficultyBody>, JsonRejection>,
) -> AppResult<Json<Value>> {
    let expected = revision(&headers)?;
    let body = body(value)?;
    apply(
        state,
        code,
        headers,
        Identity {
            player_id: body.player_id,
            session_id: body.session_id,
        },
        GameCommand::SetAiDifficulty {
            player_id: ai_player,
            difficulty: body.difficulty,
        },
        Some(expected),
    )
    .await
}
async fn remove_ai(
    State(state): State<AppState>,
    Path((code, player)): Path<(String, String)>,
    headers: HeaderMap,
    value: Result<Json<Identity>, JsonRejection>,
) -> AppResult<Json<Value>> {
    let expected = revision(&headers)?;
    apply(
        state,
        code,
        headers,
        body(value)?,
        GameCommand::RemoveAi { player_id: player },
        Some(expected),
    )
    .await
}
async fn leave(
    State(state): State<AppState>,
    Path(code): Path<String>,
    headers: HeaderMap,
    value: Result<Json<Identity>, JsonRejection>,
) -> AppResult<Json<Value>> {
    let expected = revision(&headers)?;
    apply(
        state,
        code,
        headers,
        body(value)?,
        GameCommand::Leave,
        Some(expected),
    )
    .await
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PartyBody {
    player_id: String,
    session_id: String,
    display_name: Option<String>,
    competitive_party: Value,
}
async fn party(
    State(state): State<AppState>,
    Path(code): Path<String>,
    headers: HeaderMap,
    value: Result<Json<PartyBody>, JsonRejection>,
) -> AppResult<Json<Value>> {
    let b = body(value)?;
    if let Some(name) = &b.display_name {
        normalize_name(name)?;
    }
    let expected = revision(&headers)?;
    apply(
        state,
        code,
        headers,
        Identity {
            player_id: b.player_id,
            session_id: b.session_id,
        },
        GameCommand::Party {
            party: b.competitive_party,
        },
        Some(expected),
    )
    .await
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ActionBody {
    session_id: String,
    assignment_revision: u64,
    turn: u64,
    client_command_id: String,
    action: Value,
}
async fn action(
    State(state): State<AppState>,
    Path((code, battle)): Path<(String, Uuid)>,
    headers: HeaderMap,
    value: Result<Json<ActionBody>, JsonRejection>,
) -> AppResult<Json<Value>> {
    let b = body(value)?;
    let session = session_hash(&b.session_id)?;
    if b.client_command_id.is_empty()
        || b.client_command_id.len() > 160
        || !b.client_command_id.is_ascii()
    {
        return Err(AppError::Invalid("Invalid action command ID"));
    }
    let id = state
        .rooms
        .resolve(&normalize_code(&code)?, instance(&headers)?)
        .await?;
    let (_, room) = state.repository.read(id).await?;
    let player = room
        .participants
        .iter()
        .find(|p| p.session_hash == session && !p.ai)
        .ok_or(AppError::Forbidden)?
        .player_id
        .clone();
    Ok(success(
        state
            .rooms
            .request(
                id,
                Operation::Command {
                    player,
                    session,
                    id: b.client_command_id,
                    expected: None,
                    command: GameCommand::Action {
                        match_id: battle,
                        assignment_revision: b.assignment_revision,
                        turn: b.turn,
                        action: b.action,
                    },
                    request_hash: None,
                },
            )
            .await?,
    ))
}
async fn rom(State(state): State<AppState>) -> Json<Value> {
    success(state.data.rom())
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RankQuery {
    game_type: String,
}
async fn ranking(
    State(state): State<AppState>,
    Query(q): Query<RankQuery>,
) -> AppResult<Json<Value>> {
    Ok(success(state.data.ranking(&q.game_type).await?))
}
async fn result(State(state): State<AppState>, Path(id): Path<Uuid>) -> AppResult<Json<Value>> {
    Ok(success(state.data.result(id).await?))
}
async fn account_disabled() -> AppError {
    AppError::AccountDisabled
}
