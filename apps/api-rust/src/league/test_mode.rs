use super::League;
use crate::http::AppState;
use axum::Router;
use std::sync::Arc;

pub fn routes(_league: &Arc<League>) -> Router<AppState> {
    Router::new()
}
