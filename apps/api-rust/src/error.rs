use axum::{
    Json,
    http::StatusCode,
    response::{IntoResponse, Response},
};
use serde_json::{Value, json};
pub type AppResult<T> = Result<T, AppError>;
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("{0}")]
    Invalid(&'static str),
    #[error("Authentication is required")]
    Unauthorized,
    #[error("Participant is not authorized for this room")]
    Forbidden,
    #[error("Poke Lounge room not found")]
    NotFound,
    #[error("Room is closed")]
    Closed,
    #[error("Poke Lounge room is full")]
    RoomFull,
    #[error("Room code is already in use")]
    RoomCodeInUse,
    #[error("Room has already started")]
    RoomAlreadyStarted,
    #[error("Room participant identity does not match")]
    RoomIdentityMismatch,
    #[error("Disconnected participant cannot rejoin a started room")]
    RoomRejoinBlocked,
    #[error("Room capacity reached")]
    Capacity,
    #[error("Room revision conflict")]
    RevisionConflict,
    #[error("Idempotency key was reused with different input")]
    CommandConflict,
    #[error("Command budget exhausted")]
    CommandLimit,
    #[error("Poke Lounge party snapshot is locked")]
    PartyLocked,
    #[error("Competitive action conflict")]
    ActionConflict,
    #[error("Room conflict")]
    Conflict(&'static str, Box<Value>),
    #[error("Server is busy; retry with the same command ID")]
    Busy,
    #[error("Command outcome is unknown; retry with the same command ID")]
    Timeout,
    #[error("Backend unavailable")]
    Unavailable,
    #[error("Battle computation unavailable")]
    ComputeUnavailable,
    /// The worker refused the input. The string is its bounded diagnostic reason (e.g. a party rule).
    #[error("Invalid battle or party input")]
    ComputeRejected(String),
    #[error("Account authentication is disabled. Use anonymous play.")]
    AccountDisabled,
    #[error("Storage unavailable")]
    Storage(#[from] redis::RedisError),
    #[error("Database unavailable")]
    Database(#[from] tokio_postgres::Error),
    #[error("Invalid stored data")]
    Corrupt(#[from] serde_json::Error),
    #[error("Configuration error: {0}")]
    Configuration(&'static str),
}
impl AppError {
    pub fn storage_error(&self) -> Option<&redis::RedisError> {
        match self {
            Self::Storage(error) => Some(error),
            _ => None,
        }
    }
    pub fn classify(&self) -> (StatusCode, &'static str) {
        match self {
            Self::Invalid(_) | Self::ComputeRejected(_) => {
                (StatusCode::BAD_REQUEST, "INVALID_INPUT")
            }
            Self::Unauthorized => (StatusCode::UNAUTHORIZED, "UNAUTHORIZED"),
            Self::Forbidden => (StatusCode::FORBIDDEN, "FORBIDDEN"),
            Self::NotFound => (StatusCode::NOT_FOUND, "ROOM_NOT_FOUND"),
            Self::Closed => (StatusCode::GONE, "ROOM_CLOSED"),
            Self::RoomFull => (StatusCode::CONFLICT, "POKE_LOUNGE_ROOM_FULL"),
            Self::RoomCodeInUse => (StatusCode::CONFLICT, "POKE_LOUNGE_ROOM_CODE_IN_USE"),
            Self::RoomAlreadyStarted => {
                (StatusCode::BAD_REQUEST, "POKE_LOUNGE_ROOM_ALREADY_STARTED")
            }
            Self::RoomIdentityMismatch => {
                (StatusCode::FORBIDDEN, "POKE_LOUNGE_ROOM_IDENTITY_MISMATCH")
            }
            Self::RoomRejoinBlocked => (StatusCode::GONE, "POKE_LOUNGE_ROOM_REJOIN_BLOCKED"),
            Self::RevisionConflict => (StatusCode::CONFLICT, "POKE_LOUNGE_REVISION_CONFLICT"),
            Self::CommandConflict => (StatusCode::CONFLICT, "POKE_LOUNGE_IDEMPOTENCY_CONFLICT"),
            Self::Conflict(code, _) => (StatusCode::CONFLICT, *code),
            Self::PartyLocked => (StatusCode::CONFLICT, "POKE_LOUNGE_PARTY_SNAPSHOT_LOCKED"),
            Self::ActionConflict => (
                StatusCode::CONFLICT,
                "POKE_LOUNGE_COMPETITIVE_TURN_CONFLICT",
            ),
            Self::Capacity | Self::Busy | Self::CommandLimit => {
                (StatusCode::TOO_MANY_REQUESTS, "BACKEND_BUSY")
            }
            Self::Timeout => (StatusCode::GATEWAY_TIMEOUT, "OUTCOME_UNKNOWN"),
            Self::AccountDisabled => (StatusCode::SERVICE_UNAVAILABLE, "ACCOUNT_AUTH_DISABLED"),
            Self::Unavailable | Self::Storage(_) | Self::Database(_) => {
                (StatusCode::SERVICE_UNAVAILABLE, "BACKEND_UNAVAILABLE")
            }
            Self::ComputeUnavailable => (StatusCode::SERVICE_UNAVAILABLE, "COMPUTE_UNAVAILABLE"),
            Self::Corrupt(_) | Self::Configuration(_) => {
                (StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL_ERROR")
            }
        }
    }
    /// Stable response code, for log fields.
    pub fn code(&self) -> &'static str {
        self.classify().1
    }
    /// Which dependency or layer produced the error, for log fields.
    pub fn source_label(&self) -> &'static str {
        match self {
            Self::Storage(_) => "redis",
            Self::Database(_) => "postgres",
            Self::ComputeUnavailable | Self::ComputeRejected(_) => "compute",
            Self::Corrupt(_) => "stored_data",
            Self::Timeout => "timeout",
            Self::Unavailable => "backend",
            Self::Configuration(_) => "configuration",
            Self::Busy | Self::Capacity | Self::CommandLimit => "capacity",
            _ => "request",
        }
    }
    /// Internal cause safe to log. Redis errors are excluded: their text can echo the connection
    /// URL with credentials, so only their kind/flags are logged (see `log_fields`).
    pub fn detail(&self) -> Option<String> {
        let text = match self {
            // Other variants already carry their whole cause in their display text.
            Self::ComputeRejected(reason) => reason.clone(),
            // Server message only; DETAIL/HINT can quote row values.
            Self::Database(error) => match error.as_db_error() {
                Some(db) => format!("{}: {}", db.severity(), db.message()),
                None => error.to_string(),
            },
            Self::Corrupt(error) => format!("{:?}: {error}", error.classify()),
            _ => return None,
        };
        Some(text.chars().filter(|c| !c.is_control()).take(300).collect())
    }
    /// Postgres SQLSTATE, when the error came from the database server.
    pub fn db_code(&self) -> Option<&str> {
        match self {
            Self::Database(error) => error.code().map(|code| code.code()),
            _ => None,
        }
    }
}
impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, code) = self.classify();
        if status.is_server_error() {
            let storage = self.storage_error();
            tracing::error!(event = "api.error", code, source = self.source_label(),
                error = %self, detail = ?self.detail(), db_code = ?self.db_code(),
                storage_kind = ?storage.map(redis::RedisError::kind),
                storage_connection_refused = ?storage.map(redis::RedisError::is_connection_refusal),
                storage_timeout = ?storage.map(redis::RedisError::is_timeout));
        } else if status.is_client_error() {
            tracing::warn!(event = "api.rejected", code, reason = %self, detail = ?self.detail());
        }
        let message = if matches!(self, Self::Corrupt(_) | Self::Configuration(_)) {
            "Internal server error".into()
        } else {
            self.to_string()
        };
        let mut body =
            json!({"success":false,"statusCode":status.as_u16(),"code":code,"message":message});
        if let Self::Conflict(_, snapshot) = self {
            body["snapshot"] = *snapshot;
        }
        (status, Json(body)).into_response()
    }
}
