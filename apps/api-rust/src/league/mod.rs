pub mod config;
pub mod db;
pub mod error;
pub mod judge;
pub mod limiter;
mod routes;
pub mod standings;
pub mod store;
pub mod views;

use crate::http::AppState;
use axum::Router;
use std::sync::Arc;

pub struct League {
    pub config: config::Config,
    pub judge: judge::Judge,
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
        let judge = match judge::Judge::new(&config) {
            Ok(judge) => judge,
            Err(_) => {
                tracing::warn!(event = "league.disabled", key = "LEAGUE_JUDGE_URL");
                return None;
            }
        };
        Some(Arc::new(Self {
            judge,
            db: db::Db::new(database.clone(), config.db_max),
            config,
            limiter: limiter::Limiter::default(),
        }))
    }
}
pub fn router(league: Option<Arc<League>>) -> Router<AppState> {
    league.map_or_else(Router::new, routes::router)
}
