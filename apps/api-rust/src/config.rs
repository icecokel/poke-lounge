use crate::error::{AppError, AppResult};
use axum::http::HeaderValue;
use std::{
    env,
    net::{IpAddr, SocketAddr},
    time::Duration,
};
pub const REDIS_PREFIX: &str = "poke-lounge:{rust-v2}";
pub const MAX_ROOMS: usize = 30;
pub const MAX_ACTORS: usize = 64;
pub const MAILBOX_CAPACITY: usize = 64;
pub const IO_TIMEOUT: Duration = Duration::from_secs(2);
pub const REQUEST_TIMEOUT: Duration = Duration::from_secs(10);
pub const OWNER_LEASE_MS: u64 = 15_000;
pub const OWNER_RENEWAL: Duration = Duration::from_secs(3);
// Stop serving before the lease can expire under us: one renewal interval plus one IO timeout of margin.
pub const OWNER_STOP_AFTER: Duration = Duration::from_millis(OWNER_LEASE_MS - 3_000 - 2_000);
pub const OWNER_ACQUIRE_WAIT: Duration = Duration::from_millis(OWNER_LEASE_MS + 5_000);
pub const OWNER_ACQUIRE_RETRY: Duration = Duration::from_secs(1);
pub struct Config {
    pub bind: SocketAddr,
    pub redis_url: String,
    pub worker_url: String,
    pub worker_token: String,
    pub allowed_origins: Vec<HeaderValue>,
    pub trusted_proxies: Vec<ipnet::IpNet>,
    pub database: tokio_postgres::Config,
    pub discord: Option<DiscordConfig>,
}
pub struct DiscordConfig {
    pub client_id: String,
    pub client_secret: String,
    pub redirect_uri: reqwest::Url,
    /// Exact web origin the callback returns to; one of the CORS origins.
    pub web_origin: String,
    pub secure_cookie: bool,
}
impl DiscordConfig {
    /// All three Discord values unset disables login; a partial set is a deployment mistake.
    fn from_env(allowed_origins: &[HeaderValue]) -> AppResult<Option<Self>> {
        let read = |name| env::var(name).ok().filter(|value| !value.trim().is_empty());
        let (client_id, client_secret, redirect_uri) = match (
            read("DISCORD_CLIENT_ID"),
            read("DISCORD_CLIENT_SECRET"),
            read("DISCORD_REDIRECT_URI"),
        ) {
            (None, None, None) => return Ok(None),
            (Some(id), Some(secret), Some(uri)) => (id, secret, uri),
            _ => {
                return Err(AppError::Configuration(
                    "DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET and DISCORD_REDIRECT_URI must be set together",
                ));
            }
        };
        if !client_id.bytes().all(|b| b.is_ascii_digit()) || client_id.len() > 32 {
            return Err(AppError::Configuration("Invalid DISCORD_CLIENT_ID"));
        }
        let redirect_uri = reqwest::Url::parse(redirect_uri.trim())
            .ok()
            .filter(|uri| {
                matches!(uri.scheme(), "http" | "https")
                    && uri.path() == "/auth/discord/callback"
                    && uri.query().is_none()
            })
            .ok_or(AppError::Configuration("Invalid DISCORD_REDIRECT_URI"))?;
        let web_origin = match read("AUTH_WEB_ORIGIN") {
            Some(origin) => origin,
            None => allowed_origins
                .first()
                .and_then(|origin| origin.to_str().ok())
                .ok_or(AppError::Configuration("AUTH_WEB_ORIGIN required"))?
                .to_owned(),
        };
        if !allowed_origins
            .iter()
            .any(|origin| origin == web_origin.as_str())
        {
            return Err(AppError::Configuration(
                "AUTH_WEB_ORIGIN must be one of CORS_ORIGINS",
            ));
        }
        Ok(Some(Self {
            client_id,
            client_secret: client_secret.trim().to_owned(),
            secure_cookie: redirect_uri.scheme() == "https",
            redirect_uri,
            web_origin,
        }))
    }
}
impl Config {
    pub fn from_env() -> AppResult<Self> {
        let bind = env::var("RUST_API_BIND_ADDR")
            .unwrap_or_else(|_| "127.0.0.1:3011".into())
            .parse::<SocketAddr>()
            .map_err(|_| AppError::Configuration("Invalid RUST_API_BIND_ADDR"))?;
        if !bind.ip().is_loopback() && env::var("RUST_API_ALLOW_REMOTE").as_deref() != Ok("true") {
            return Err(AppError::Configuration(
                "Remote binding requires explicit opt-in",
            ));
        }
        let redis_url = env::var("RUST_API_REDIS_URL")
            .map_err(|_| AppError::Configuration("RUST_API_REDIS_URL required"))?;
        let worker_url =
            env::var("BATTLE_WORKER_URL").unwrap_or_else(|_| "http://127.0.0.1:3021".into());
        let worker_token = env::var("BATTLE_WORKER_TOKEN")
            .ok()
            .or_else(|| {
                std::fs::read_to_string(
                    env::var("BATTLE_WORKER_TOKEN_FILE")
                        .unwrap_or_else(|_| "/run/poke-private/token".into()),
                )
                .ok()
            })
            .ok_or(AppError::Configuration("Private worker token required"))?
            .trim()
            .to_string();
        if worker_token.len() < 32 || worker_token.len() > 256 || !worker_token.is_ascii() {
            return Err(AppError::Configuration("Invalid private worker token"));
        }
        let mut allowed_origins = Vec::new();
        for origin in env::var("CORS_ORIGINS")
            .unwrap_or_else(|_| "http://localhost:3000,http://127.0.0.1:3000".into())
            .split(',')
            .map(str::trim)
        {
            let uri: axum::http::Uri = origin
                .parse()
                .map_err(|_| AppError::Configuration("Invalid CORS origin"))?;
            if !matches!(uri.scheme_str(), Some("http" | "https"))
                || uri.authority().is_none()
                || uri.path_and_query().is_some_and(|p| p.as_str() != "/")
                || origin.ends_with('/')
                || origin.contains('@')
            {
                return Err(AppError::Configuration("CORS requires exact origins"));
            }
            allowed_origins.push(
                HeaderValue::from_str(origin)
                    .map_err(|_| AppError::Configuration("Invalid CORS header"))?,
            );
        }
        let trusted_proxies = env::var("RUST_API_TRUSTED_PROXIES")
            .unwrap_or_default()
            .split(',')
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(|value| {
                value
                    .parse::<ipnet::IpNet>()
                    .or_else(|_| value.parse::<IpAddr>().map(ipnet::IpNet::from))
                    .map_err(|_| AppError::Configuration("Invalid RUST_API_TRUSTED_PROXIES"))
            })
            .collect::<AppResult<Vec<_>>>()?;
        let mut database = tokio_postgres::Config::new();
        database
            .host(env::var("DB_HOST").unwrap_or_else(|_| "127.0.0.1".into()))
            .port(
                env::var("DB_PORT")
                    .unwrap_or_else(|_| "5432".into())
                    .parse()
                    .map_err(|_| AppError::Configuration("Invalid DB_PORT"))?,
            )
            .user(env::var("DB_USERNAME").unwrap_or_else(|_| "poke_lounge".into()))
            .password(
                env::var("DB_PASSWORD")
                    .map_err(|_| AppError::Configuration("DB_PASSWORD required"))?,
            )
            .dbname(env::var("DB_DATABASE").unwrap_or_else(|_| "poke_lounge".into()))
            .connect_timeout(IO_TIMEOUT)
            .options("-c statement_timeout=3000");
        let discord = DiscordConfig::from_env(&allowed_origins)?;
        Ok(Self {
            bind,
            redis_url,
            worker_url,
            worker_token,
            allowed_origins,
            trusted_proxies,
            database,
            discord,
        })
    }
}
