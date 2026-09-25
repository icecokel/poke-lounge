use axum::{Json,http::StatusCode,response::{IntoResponse,Response}};
use serde_json::{Value,json};
pub type AppResult<T> = Result<T,AppError>;
#[derive(Debug,thiserror::Error)]
pub enum AppError {
    #[error("{0}")] Invalid(&'static str),
    #[error("Authentication is required")] Unauthorized,
    #[error("Participant is not authorized for this room")] Forbidden,
    #[error("Poke Lounge room not found")] NotFound,
    #[error("Room is closed")] Closed,
    #[error("Poke Lounge room is full")] RoomFull,
    #[error("Room capacity reached")] Capacity,
    #[error("Room revision conflict")] RevisionConflict,
    #[error("Idempotency key was reused with different input")] CommandConflict,
    #[error("Command budget exhausted")] CommandLimit,
    #[error("Poke Lounge party snapshot is locked")] PartyLocked,
    #[error("Competitive action conflict")] ActionConflict,
    #[error("Room conflict")] Conflict(&'static str,Box<Value>),
    #[error("Server is busy; retry with the same command ID")] Busy,
    #[error("Command outcome is unknown; retry with the same command ID")] Timeout,
    #[error("Backend unavailable")] Unavailable,
    #[error("Battle computation unavailable")] ComputeUnavailable,
    #[error("Account authentication is disabled. Use anonymous play.")] AccountDisabled,
    #[error("Storage unavailable")] Storage(#[from]redis::RedisError),
    #[error("Database unavailable")] Database(#[from]tokio_postgres::Error),
    #[error("Invalid stored data")] Corrupt(#[from]serde_json::Error),
    #[error("Configuration error: {0}")] Configuration(&'static str),
}
impl IntoResponse for AppError {
    fn into_response(self)->Response {
        let (status,code)=match &self {
            Self::Invalid(_)=>(StatusCode::BAD_REQUEST,"INVALID_INPUT"),Self::Unauthorized=>(StatusCode::UNAUTHORIZED,"UNAUTHORIZED"),Self::Forbidden=>(StatusCode::FORBIDDEN,"FORBIDDEN"),
            Self::NotFound=>(StatusCode::NOT_FOUND,"ROOM_NOT_FOUND"),Self::Closed=>(StatusCode::GONE,"ROOM_CLOSED"),Self::RoomFull=>(StatusCode::CONFLICT,"POKE_LOUNGE_ROOM_FULL"),
            Self::RevisionConflict=>(StatusCode::CONFLICT,"POKE_LOUNGE_REVISION_CONFLICT"),Self::CommandConflict=>(StatusCode::CONFLICT,"POKE_LOUNGE_IDEMPOTENCY_CONFLICT"),
            Self::Conflict(code,_) =>(StatusCode::CONFLICT,*code),Self::PartyLocked=>(StatusCode::CONFLICT,"POKE_LOUNGE_PARTY_SNAPSHOT_LOCKED"),Self::ActionConflict=>(StatusCode::CONFLICT,"POKE_LOUNGE_COMPETITIVE_TURN_CONFLICT"),
            Self::Capacity|Self::Busy|Self::CommandLimit=>(StatusCode::TOO_MANY_REQUESTS,"BACKEND_BUSY"),Self::Timeout=>(StatusCode::GATEWAY_TIMEOUT,"OUTCOME_UNKNOWN"),Self::AccountDisabled=>(StatusCode::SERVICE_UNAVAILABLE,"ACCOUNT_AUTH_DISABLED"),
            Self::Unavailable|Self::Storage(_)|Self::Database(_)=>(StatusCode::SERVICE_UNAVAILABLE,"BACKEND_UNAVAILABLE"),Self::ComputeUnavailable=>(StatusCode::SERVICE_UNAVAILABLE,"COMPUTE_UNAVAILABLE"),
            Self::Corrupt(_)|Self::Configuration(_)=>(StatusCode::INTERNAL_SERVER_ERROR,"INTERNAL_ERROR"),
        };
        if status.is_server_error(){tracing::error!(event="api.error",code);}
        let message=if matches!(self,Self::Corrupt(_)|Self::Configuration(_)){"Internal server error".into()}else{self.to_string()};
        let mut body=json!({"success":false,"statusCode":status.as_u16(),"code":code,"message":message});
        if let Self::Conflict(_,snapshot)=self {body["snapshot"]=*snapshot;}
        (status,Json(body)).into_response()
    }
}
