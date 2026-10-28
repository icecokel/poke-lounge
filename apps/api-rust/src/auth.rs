use crate::{
    config::DiscordConfig,
    error::{AppError, AppResult},
    http::{AppState, success},
    repository::hash_bytes,
};
use axum::{
    Json,
    extract::{Query, State},
    http::{HeaderMap, HeaderValue, StatusCode, header},
    response::{IntoResponse, Response},
};
use rand::RngCore;
use serde::Deserialize;
use serde_json::{Value, json};
use std::{sync::Arc, time::Duration};
use subtle::ConstantTimeEq;
use tokio::sync::Semaphore;

const SESSION_COOKIE: &str = "pl_session";
const STATE_COOKIE: &str = "pl_oauth_state";
const RETURN_COOKIE: &str = "pl_oauth_return";
const OAUTH_COOKIE_PATH: &str = "/auth/discord";
const SESSION_MAX_AGE_S: u64 = 30 * 24 * 60 * 60;
const STATE_MAX_AGE_S: u64 = 10 * 60;
/// The web client shows a login failure when it lands on this fragment.
const LOGIN_FAILED_FRAGMENT: &str = "#discord-login-failed";
const DISCORD_AUTHORIZE_URL: &str = "https://discord.com/oauth2/authorize";
const DISCORD_TOKEN_URL: &str = "https://discord.com/api/oauth2/token";
const DISCORD_USER_URL: &str = "https://discord.com/api/users/@me";

#[derive(Clone)]
pub struct Auth {
    discord: Option<Arc<DiscordConfig>>,
    client: reqwest::Client,
    discord_requests: Arc<Semaphore>,
}
impl Auth {
    pub fn new(discord: Option<DiscordConfig>) -> AppResult<Self> {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(3))
            .redirect(reqwest::redirect::Policy::none())
            .user_agent("poke-lounge-api")
            .build()
            .map_err(|_| AppError::Configuration("Cannot build OAuth client"))?;
        Ok(Self {
            discord: discord.map(Arc::new),
            client,
            discord_requests: Arc::new(Semaphore::new(8)),
        })
    }
    fn secure_cookie(&self) -> bool {
        self.discord.as_ref().is_some_and(|d| d.secure_cookie)
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartQuery {
    return_to: Option<String>,
}
pub async fn discord_start(
    State(state): State<AppState>,
    Query(query): Query<StartQuery>,
) -> Response {
    let Some(discord) = state.auth.discord.clone() else {
        return AppError::AccountDisabled.into_response();
    };
    let return_to = query
        .return_to
        .filter(|path| is_safe_return_path(path))
        .unwrap_or_else(|| "/".into());
    let oauth_state = random_hex(32);
    let mut url = reqwest::Url::parse(DISCORD_AUTHORIZE_URL).expect("static URL");
    url.query_pairs_mut()
        .append_pair("response_type", "code")
        .append_pair("client_id", &discord.client_id)
        .append_pair("scope", "identify")
        .append_pair("redirect_uri", discord.redirect_uri.as_str())
        .append_pair("state", &oauth_state);
    let mut response = redirect(url.as_str());
    let secure = discord.secure_cookie;
    set_cookie(
        &mut response,
        &cookie(
            STATE_COOKIE,
            &oauth_state,
            OAUTH_COOKIE_PATH,
            STATE_MAX_AGE_S,
            secure,
        ),
    );
    set_cookie(
        &mut response,
        &cookie(
            RETURN_COOKIE,
            &return_to,
            OAUTH_COOKIE_PATH,
            STATE_MAX_AGE_S,
            secure,
        ),
    );
    response
}

#[derive(Deserialize)]
pub struct CallbackQuery {
    code: Option<String>,
    state: Option<String>,
    error: Option<String>,
}
#[derive(Deserialize)]
struct DiscordToken {
    access_token: String,
}
#[derive(Deserialize)]
struct DiscordUser {
    id: String,
    username: String,
    global_name: Option<String>,
}
pub async fn discord_callback(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<CallbackQuery>,
) -> Response {
    let Some(discord) = state.auth.discord.clone() else {
        return AppError::AccountDisabled.into_response();
    };
    let return_to = read_cookie(&headers, RETURN_COOKIE)
        .filter(|path| is_safe_return_path(path))
        .unwrap_or("/");
    let result = tokio::time::timeout(
        Duration::from_secs(7),
        complete_discord_login(&state, &discord, &headers, &query),
    )
    .await
    .unwrap_or(Err("timeout"));
    let target = match &result {
        Ok(_) => format!("{}{}", discord.web_origin, return_to),
        Err(reason) => {
            tracing::warn!(event = "auth.discord_login_failed", reason);
            format!(
                "{}{}{}",
                discord.web_origin, return_to, LOGIN_FAILED_FRAGMENT
            )
        }
    };
    let mut response = redirect(&target);
    let secure = discord.secure_cookie;
    for name in [STATE_COOKIE, RETURN_COOKIE] {
        set_cookie(
            &mut response,
            &cookie(name, "", OAUTH_COOKIE_PATH, 0, secure),
        );
    }
    if let Ok(session) = result {
        set_cookie(
            &mut response,
            &cookie(SESSION_COOKIE, &session, "/", SESSION_MAX_AGE_S, secure),
        );
    }
    response
}

/// Returns the new session token, or a short reason for the log.
async fn complete_discord_login(
    state: &AppState,
    discord: &DiscordConfig,
    headers: &HeaderMap,
    query: &CallbackQuery,
) -> Result<String, &'static str> {
    if query.error.is_some() {
        return Err("authorization_denied");
    }
    let (Some(code), Some(returned_state)) = (&query.code, &query.state) else {
        return Err("missing_code");
    };
    let expected = read_cookie(headers, STATE_COOKIE).ok_or("missing_state_cookie")?;
    if code.is_empty()
        || code.len() > 256
        || ![expected, returned_state.as_str()].iter().all(|value| {
            value.len() == 64
                && value
                    .bytes()
                    .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
        })
        || !bool::from(returned_state.as_bytes().ct_eq(expected.as_bytes()))
    {
        return Err("state_mismatch");
    }
    let _permit = state
        .auth
        .discord_requests
        .try_acquire()
        .map_err(|_| "discord_busy")?;
    let client = &state.auth.client;
    let token: DiscordToken = client
        .post(DISCORD_TOKEN_URL)
        .basic_auth(&discord.client_id, Some(&discord.client_secret))
        .form(&[
            ("grant_type", "authorization_code"),
            ("code", code.as_str()),
            ("redirect_uri", discord.redirect_uri.as_str()),
        ])
        .send()
        .await
        .map_err(|_| "token_request_failed")?
        .error_for_status()
        .map_err(|_| "token_rejected")?
        .json()
        .await
        .map_err(|_| "token_body_invalid")?;
    // The access token is used once here and never stored.
    let user: DiscordUser = client
        .get(DISCORD_USER_URL)
        .bearer_auth(&token.access_token)
        .send()
        .await
        .map_err(|_| "user_request_failed")?
        .error_for_status()
        .map_err(|_| "user_rejected")?
        .json()
        .await
        .map_err(|_| "user_body_invalid")?;
    if user.id.is_empty() || user.id.len() > 32 || !user.id.bytes().all(|b| b.is_ascii_digit()) {
        return Err("user_id_invalid");
    }
    let display_name = display_name(user.global_name.as_deref().unwrap_or(&user.username));
    let user_id = state
        .data
        .upsert_identity_user("discord", &user.id, &display_name)
        .await
        .map_err(|error| {
            tracing::error!(event = "auth.user_upsert_failed", detail = ?error.detail(), db_code = ?error.db_code());
            "user_upsert_failed"
        })?;
    let session = random_hex(32);
    state
        .data
        .create_session(&hash_bytes(session.as_bytes()), user_id)
        .await
        .map_err(|error| {
            tracing::error!(event = "auth.session_create_failed", detail = ?error.detail(), db_code = ?error.db_code());
            "session_create_failed"
        })?;
    tracing::info!(event = "auth.discord_login", user_id = %user_id);
    Ok(session)
}

pub async fn me(State(state): State<AppState>, headers: HeaderMap) -> AppResult<Json<Value>> {
    let user = match session_token(&headers) {
        Some(token) => {
            state
                .data
                .session_user(&hash_bytes(token.as_bytes()))
                .await?
        }
        None => None,
    };
    let providers: &[&str] = if state.auth.discord.is_some() {
        &["discord"]
    } else {
        &[]
    };
    Ok(success(json!({
        "providers": providers,
        "user": user.map(|(id, name)| json!({"id": id, "displayName": name})),
    })))
}

pub async fn logout(State(state): State<AppState>, headers: HeaderMap) -> AppResult<Response> {
    if let Some(token) = session_token(&headers) {
        state
            .data
            .delete_session(&hash_bytes(token.as_bytes()))
            .await?;
    }
    let mut response = success(Value::Null).into_response();
    set_cookie(
        &mut response,
        &cookie(SESSION_COOKIE, "", "/", 0, state.auth.secure_cookie()),
    );
    Ok(response)
}

fn session_token(headers: &HeaderMap) -> Option<&str> {
    read_cookie(headers, SESSION_COOKIE)
        .filter(|token| token.len() == 64 && token.bytes().all(|b| b.is_ascii_hexdigit()))
}
fn read_cookie<'a>(headers: &'a HeaderMap, name: &str) -> Option<&'a str> {
    headers
        .get_all(header::COOKIE)
        .iter()
        .filter_map(|value| value.to_str().ok())
        .flat_map(|value| value.split(';'))
        .filter_map(|pair| pair.trim().split_once('='))
        .find_map(|(key, value)| (key == name).then_some(value))
}
fn cookie(name: &str, value: &str, path: &str, max_age_s: u64, secure: bool) -> String {
    let secure = if secure { "; Secure" } else { "" };
    format!("{name}={value}; Path={path}; Max-Age={max_age_s}; HttpOnly; SameSite=Lax{secure}")
}
fn set_cookie(response: &mut Response, value: &str) {
    if let Ok(value) = HeaderValue::from_str(value) {
        response.headers_mut().append(header::SET_COOKIE, value);
    }
}
fn redirect(location: &str) -> Response {
    match HeaderValue::from_str(location) {
        Ok(location) => (StatusCode::SEE_OTHER, [(header::LOCATION, location)]).into_response(),
        Err(_) => AppError::Invalid("Invalid redirect").into_response(),
    }
}
/// Same-origin paths only, in characters that are also valid inside a cookie value.
fn is_safe_return_path(path: &str) -> bool {
    path.len() <= 200
        && path.starts_with('/')
        && !path.starts_with("//")
        && path
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"/-_.~?=&%".contains(&b))
}
fn display_name(raw: &str) -> String {
    let name = raw
        .chars()
        .filter(|c| !c.is_control())
        .take(32)
        .collect::<String>()
        .trim()
        .to_owned();
    if name.is_empty() {
        "Discord".into()
    } else {
        name
    }
}
fn random_hex(bytes: usize) -> String {
    let mut buffer = vec![0u8; bytes];
    rand::rng().fill_bytes(&mut buffer);
    buffer.iter().map(|b| format!("{b:02x}")).collect()
}
