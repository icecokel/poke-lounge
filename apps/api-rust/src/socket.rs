use crate::{
    actors::{Handle, Operation},
    domain::{normalize_code, session_hash, validate_player_id},
    error::{AppError, AppResult},
    http::AppState,
};
use axum::{
    extract::{
        State, WebSocketUpgrade,
        ws::{Message, WebSocket},
    },
    http::{HeaderMap, header},
    response::Response,
};
use serde::Deserialize;
use serde_json::{Value, json};
use std::time::{Duration, Instant};
use tokio::sync::{OwnedSemaphorePermit, broadcast};
use uuid::Uuid;

const SEND_TIMEOUT: Duration = Duration::from_secs(3);
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Frame {
    event: String,
    payload: Value,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Subscription {
    room_code: String,
    player_id: String,
    session_id: String,
    after_revision: Option<u64>,
    room_instance_id: Option<Uuid>,
}

pub async fn upgrade(
    State(state): State<AppState>,
    headers: HeaderMap,
    ws: WebSocketUpgrade,
) -> AppResult<Response> {
    let origin = headers.get(header::ORIGIN).ok_or(AppError::Forbidden)?;
    if !state.origins.contains(origin) || state.shutdown.is_cancelled() {
        return Err(AppError::Forbidden);
    }
    let permit = state
        .sockets
        .clone()
        .try_acquire_owned()
        .map_err(|_| AppError::Busy)?;
    Ok(ws
        .max_message_size(16 * 1024)
        .max_frame_size(16 * 1024)
        .on_upgrade(move |socket| connection(socket, state, permit)))
}
async fn send(socket: &mut WebSocket, event: &str, payload: Value) -> AppResult<()> {
    send_message(
        socket,
        Message::Text(json!({"event":event,"payload":payload}).to_string().into()),
    )
    .await
}
async fn send_message(socket: &mut WebSocket, message: Message) -> AppResult<()> {
    tokio::time::timeout(SEND_TIMEOUT, socket.send(message))
        .await
        .map_err(|_| AppError::Timeout)?
        .map_err(|_| AppError::Unavailable)
}
async fn connection(mut socket: WebSocket, state: AppState, _permit: OwnedSemaphorePermit) {
    let id = Uuid::new_v4();
    let first = tokio::time::timeout(Duration::from_secs(10), socket.recv()).await;
    let subscription = match first {
        Ok(Some(Ok(Message::Text(text)))) => serde_json::from_str::<Frame>(&text)
            .ok()
            .filter(|f| f.event == "room.subscribe")
            .and_then(|f| serde_json::from_value::<Subscription>(f.payload).ok()),
        _ => None,
    };
    let Some(subscription) = subscription else {
        tracing::warn!(event="socket.subscription_rejected",connection_id=%id,reason="invalid_frame");
        let _ = send(
            &mut socket,
            "room.subscription-error",
            json!({"code":"INVALID_SUBSCRIPTION"}),
        )
        .await;
        return;
    };
    let prepared = async {
        validate_player_id(&subscription.player_id)?;
        let hash = session_hash(&subscription.session_id)?;
        let room_id = state
            .rooms
            .resolve(
                &normalize_code(&subscription.room_code)?,
                subscription.room_instance_id,
            )
            .await?;
        let handle = state.rooms.handle(room_id).await?;
        Ok::<_, AppError>((handle, hash, room_id))
    }
    .await;
    let Ok((handle, hash, room_id)) = prepared else {
        tracing::warn!(event="socket.subscription_rejected",connection_id=%id,reason="invalid_identity_or_room");
        let _ = send(
            &mut socket,
            "room.subscription-error",
            json!({"code":"SUBSCRIPTION_REJECTED"}),
        )
        .await;
        return;
    };
    let mut events = handle.subscribe();
    let initial = handle
        .request(Operation::Connect {
            connection: id,
            player: subscription.player_id.clone(),
            session: hash,
            after: subscription.after_revision,
        })
        .await;
    if let Ok(value) = initial {
        tracing::info!(event="socket.connected",connection_id=%id,room_instance_id=%room_id);
        if publish_state(&mut socket, value).await.is_ok() {
            if let Err(error) =
                serve(&mut socket, &state, &handle, &mut events, id, &subscription).await
            {
                tracing::warn!(event="socket.disconnected_error",connection_id=%id,room_instance_id=%room_id,error=%error);
            }
        } else {
            tracing::warn!(event="socket.publish_failed",connection_id=%id,room_instance_id=%room_id);
        }
    } else {
        tracing::warn!(event="socket.subscription_rejected",connection_id=%id,reason="connect_failed",room_instance_id=%room_id);
        let _ = send(
            &mut socket,
            "room.subscription-error",
            json!({"code":"SUBSCRIPTION_REJECTED"}),
        )
        .await;
    }
    // Connect may have committed even when its response timed out. Always enqueue matching cleanup.
    let _ = handle
        .request(Operation::Disconnect { connection: id })
        .await;
    let _ = send_message(&mut socket, Message::Close(None)).await;
}
async fn publish_state(socket: &mut WebSocket, value: Value) -> AppResult<()> {
    send(socket, "room.snapshot", json!({"room":value["room"]})).await?;
    send(socket, "room.world-snapshot", value["world"].clone()).await
}
async fn serve(
    socket: &mut WebSocket,
    state: &AppState,
    handle: &Handle,
    events: &mut broadcast::Receiver<Value>,
    connection: Uuid,
    identity: &Subscription,
) -> AppResult<()> {
    let mut interval = tokio::time::interval(Duration::from_secs(5));
    interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
    let mut seen = Instant::now();
    let mut budget_start = Instant::now();
    let mut count = 0_u32;
    loop {
        tokio::select! {
            _=state.shutdown.cancelled()=>return Ok(()),
            _=interval.tick()=>{
                if seen.elapsed()>Duration::from_secs(25){return Err(AppError::Timeout);}
                handle.request(Operation::Heartbeat{connection}).await?;
                send_message(socket,Message::Ping(Vec::new().into())).await?;
            }
            incoming=socket.recv()=>{
                let message=incoming.ok_or(AppError::Unavailable)?.map_err(|_|AppError::Unavailable)?;
                seen=Instant::now();
                if budget_start.elapsed()>=Duration::from_secs(1){count=0;budget_start=Instant::now();}
                count+=1;if count>120{return Err(AppError::Busy);}
                match message {
                    Message::Text(text)=>{
                        let frame:Frame=serde_json::from_str(&text).map_err(|_|AppError::Invalid("Invalid websocket frame"))?;
                        match frame.event.as_str(){
                            "room.subscribe"=>{
                                let sub:Subscription=serde_json::from_value(frame.payload).map_err(|_|AppError::Invalid("Invalid subscription"))?;
                                if sub.room_code!=identity.room_code||sub.player_id!=identity.player_id||sub.session_id!=identity.session_id||sub.room_instance_id!=identity.room_instance_id{return Err(AppError::Forbidden);}
                                let mut current=handle.request(Operation::Resync{connection}).await?;
                                current["room"]=handle.request(Operation::Snapshot{after:sub.after_revision}).await?;
                                publish_state(socket,current).await?;
                            }
                            "room.world-resync"=>publish_state(socket,handle.request(Operation::Resync{connection}).await?).await?,
                            "room.heartbeat"=>{handle.request(Operation::Heartbeat{connection}).await?;},
                            "room.player-event"=>{
                                let event=frame.payload["type"].as_str().ok_or(AppError::Invalid("Missing movement type"))?.to_string();
                                let position=frame.payload.get("snapshot").cloned().ok_or(AppError::Invalid("Missing movement snapshot"))?;
                                match handle.request(Operation::World{connection,event,position}).await{Ok(_)|Err(AppError::Busy)=>(),Err(e)=>return Err(e)}
                            }
                            _=>return Err(AppError::Invalid("Unsupported websocket event")),
                        }
                    }
                    Message::Pong(_)=>(), Message::Ping(data)=>send_message(socket,Message::Pong(data)).await?,
                    Message::Close(_)=>return Ok(()), Message::Binary(_)=>return Err(AppError::Invalid("Binary frames are not supported")),
                }
            }
            received=events.recv()=>match received {
                Ok(event)=>{
                    let terminal=event["event"]=="room.expired"||event["event"]=="server.draining";
                    send_message(socket,Message::Text(event.to_string().into())).await?;if terminal{return Ok(());}
                }
                Err(broadcast::error::RecvError::Lagged(_))=>publish_state(socket,handle.request(Operation::Resync{connection}).await?).await?,
                Err(broadcast::error::RecvError::Closed)=>return Err(AppError::Unavailable),
            }
        }
    }
}
