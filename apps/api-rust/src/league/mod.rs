pub mod config;
pub mod db;
pub mod error;
pub mod limiter;

use crate::http::AppState;
use axum::Router;
use std::sync::Arc;

pub struct League {
    pub config: config::Config,
    pub db: db::Db,
    pub limiter: limiter::Limiter,
}
impl League {
    pub async fn from_env(database: &tokio_postgres::Config) -> Option<Arc<Self>> {
        if std::env::var("LEAGUE_ENABLED").as_deref() != Ok("true") {
            return None;
        }
        let config = match config::Config::from_env() {
            Ok(config) => config,
            Err(key) => {
                tracing::warn!(event = "league.disabled", key);
                return None;
            }
        };
        Some(Arc::new(Self {
            db: db::Db::new(database.clone(), config.db_max),
            config,
            limiter: limiter::Limiter::default(),
        }))
    }
}
pub fn router(_league: Option<Arc<League>>) -> Router<AppState> {
    Router::new()
}
