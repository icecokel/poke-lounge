use axum::{
    Json,
    http::StatusCode,
    response::{IntoResponse, Response},
};
use serde_json::{Value, json};

pub type Result<T> = std::result::Result<T, LeagueError>;
#[derive(Debug)]
pub struct LeagueError {
    pub status: StatusCode,
    pub code: &'static str,
    pub detail: Value,
    pub retry: bool,
    pub constraint: Option<String>,
}
impl LeagueError {
    pub fn new(status: u16, code: &'static str) -> Self {
        Self {
            status: StatusCode::from_u16(status).expect("static status"),
            code,
            detail: Value::Null,
            retry: false,
            constraint: None,
        }
    }
    pub fn detail(mut self, detail: Value) -> Self {
        self.detail = detail;
        self
    }
    pub fn unavailable() -> Self {
        Self::new(503, "LEAGUE_UNAVAILABLE")
    }
    pub fn corrupt() -> Self {
        tracing::error!(event = "league.corrupt");
        Self::new(500, "LEAGUE_CORRUPT")
    }
}
impl From<tokio_postgres::Error> for LeagueError {
    fn from(error: tokio_postgres::Error) -> Self {
        tracing::warn!(
            event = "league.db_unavailable",
            code = error.code().map(|c| c.code())
        );
        let mut result = Self::unavailable();
        result.retry = error
            .code()
            .is_some_and(|c| matches!(c.code(), "40001" | "40P01" | "55P03"));
        result.constraint = error
            .as_db_error()
            .and_then(|e| e.constraint())
            .map(str::to_owned);
        result
    }
}
impl IntoResponse for LeagueError {
    fn into_response(self) -> Response {
        let mut body = json!({"success":false,"statusCode":self.status.as_u16(),"code":self.code,"message":self.code});
        if let Some(detail) = self.detail.as_object() {
            body.as_object_mut().expect("object").extend(detail.clone());
        }
        (self.status, Json(body)).into_response()
    }
}
