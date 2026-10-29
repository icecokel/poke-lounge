use crate::http::AppState;
use axum::Router;

pub fn routes() -> Router<AppState> {
    Router::new()
}
