use crate::{
    actors::{Handle, Operation, RoomEvent},
    domain::{normalize_code, session_hash, validate_player_id},
    error::{AppError, AppResult},
    http::AppState,
};
use axum::{
    extract::{
        ConnectInfo, State, WebSocketUpgrade,
        ws::{Message, WebSocket},
    },
    http::{HeaderMap, header},
    response::Response,
};
use serde::Deserialize;
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    net::{IpAddr, SocketAddr},
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};
use tokio::sync::{OwnedSemaphorePermit, broadcast};
use uuid::Uuid;

const SEND_TIMEOUT: Duration = Duration::from_secs(3);
pub(crate) const PENDING_SOCKET_CAPACITY: usize = 32;
const PENDING_SOCKETS_PER_IP: usize = 8;
const FIRST_FRAME_TIMEOUT: Duration = Duration::from_secs(5);

struct PendingIp {
    ip: IpAddr,
    map: Arc<Mutex<HashMap<IpAddr, usize>>>,
}
impl Drop for PendingIp {
    fn drop(&mut self) {
        let mut map = self.map.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(count) = map.get_mut(&self.ip) {
            *count -= 1;
            if *count == 0 {
                map.remove(&self.ip);
            }
        }
    }
}
fn admit_pending_ip(state: &AppState, ip: IpAddr) -> AppResult<PendingIp> {
    let mut map = state
        .pending_by_ip
        .lock()
        .unwrap_or_else(|e| e.into_inner());
    let count = map.entry(ip).or_default();
    if *count >= PENDING_SOCKETS_PER_IP {
        return Err(AppError::Busy);
    }
    *count += 1;
    Ok(PendingIp {
        ip,
        map: state.pending_by_ip.clone(),
    })
}
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
    visitor_id: Option<Uuid>,
}

pub async fn upgrade(
    State(state): State<AppState>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    ws: WebSocketUpgrade,
) -> AppResult<Response> {
    let origin = headers.get(header::ORIGIN).ok_or(AppError::Forbidden)?;
    if !state.origins.contains(origin) || state.shutdown.is_cancelled() {
        return Err(AppError::Forbidden);
    }
    let ip = crate::http::client_ip(peer.ip(), &headers, &state.trusted_proxies);
    let ip_guard = admit_pending_ip(&state, ip)?;
    let pending = state
        .pending_sockets
        .clone()
        .try_acquire_owned()
        .map_err(|_| AppError::Busy)?;
    Ok(ws
        .max_message_size(16 * 1024)
        .max_frame_size(16 * 1024)
        .on_upgrade(move |socket| connection(socket, state, pending, ip_guard)))
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
async fn connection(
    mut socket: WebSocket,
    state: AppState,
    pending: OwnedSemaphorePermit,
    ip_guard: PendingIp,
) {
    let id = Uuid::new_v4();
    let first = tokio::time::timeout(FIRST_FRAME_TIMEOUT, socket.recv()).await;
    // Say why the first frame was unusable; the frame itself can carry a session secret.
    let subscription = match first {
        Ok(Some(Ok(Message::Text(text)))) => match serde_json::from_str::<Frame>(&text) {
            Err(error) => Err(("frame_json", Some(error.to_string()))),
            Ok(frame) if frame.event != "room.subscribe" => Err((
                "unexpected_event",
                Some(frame.event.chars().take(48).collect()),
            )),
            Ok(frame) => serde_json::from_value::<Subscription>(frame.payload)
                .map_err(|error| ("subscription_schema", Some(error.to_string()))),
        },
        Ok(Some(Ok(_))) => Err(("non_text_frame", None)),
        Ok(Some(Err(error))) => Err(("receive_error", Some(error.to_string()))),
        Ok(None) => Err(("closed_before_subscribe", None)),
        Err(_) => Err(("first_frame_timeout", None)),
    };
    let subscription = match subscription {
        Ok(subscription) => subscription,
        Err((detail_reason, detail)) => {
            let detail: Option<String> =
                detail.map(|text| text.chars().filter(|c| !c.is_control()).take(200).collect());
            tracing::warn!(event="socket.subscription_rejected",connection_id=%id,reason="invalid_frame",detail_reason,detail=?detail);
            let _ = send(
                &mut socket,
                "room.subscription-error",
                json!({"code":"INVALID_SUBSCRIPTION"}),
            )
            .await;
            return;
        }
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
    let (handle, hash, room_id) = match prepared {
        Ok(prepared) => prepared,
        Err(error) => {
            tracing::warn!(event="socket.subscription_rejected",connection_id=%id,reason="invalid_identity_or_room",code=error.code(),error=%error,room_instance_id=?subscription.room_instance_id,player_id=%subscription.player_id);
            let _ = send(
                &mut socket,
                "room.subscription-error",
                json!({"code":"SUBSCRIPTION_REJECTED"}),
            )
            .await;
            return;
        }
    };
    let mut events = handle.subscribe();
    let connected_at = std::time::Instant::now();
    let Ok(active) = state.sockets.clone().try_acquire_owned() else {
        tracing::warn!(event="socket.subscription_rejected",connection_id=%id,reason="server_busy",room_instance_id=%room_id,player_id=%subscription.player_id);
        let _ = send(
            &mut socket,
            "room.subscription-error",
            json!({"code":"SERVER_BUSY"}),
        )
        .await;
        return;
    };
    drop(pending);
    drop(ip_guard);
    let _active = active;
    let initial = handle
        .request(Operation::Connect {
            connection: id,
            player: subscription.player_id.clone(),
            session: hash,
            after: subscription.after_revision,
        })
        .await;
    match initial {
        Ok(value) => {
            crate::http::record_activity(&state, subscription.visitor_id);
            tracing::info!(event="socket.connected",connection_id=%id,room_instance_id=%room_id,player_id=%subscription.player_id,release=%state.release);
            match publish_state(&mut socket, value).await {
                Ok(()) => {
                    let mut stage = "idle";
                    if let Err(error) = serve(
                        &mut socket,
                        &state,
                        &handle,
                        &mut events,
                        id,
                        &subscription,
                        &mut stage,
                    )
                    .await
                    {
                        tracing::warn!(event="socket.disconnected_error",connection_id=%id,room_instance_id=%room_id,player_id=%subscription.player_id,stage,code=error.code(),error=%error,duration_ms=connected_at.elapsed().as_millis() as u64);
                    }
                }
                Err(error) => {
                    tracing::warn!(event="socket.publish_failed",connection_id=%id,room_instance_id=%room_id,player_id=%subscription.player_id,code=error.code(),error=%error);
                }
            }
        }
        Err(error) => {
            tracing::warn!(event="socket.subscription_rejected",connection_id=%id,reason="connect_failed",room_instance_id=%room_id,player_id=%subscription.player_id,code=error.code(),error=%error);
            let _ = send(
                &mut socket,
                "room.subscription-error",
                json!({"code":"SUBSCRIPTION_REJECTED"}),
            )
            .await;
        }
    }
    tracing::info!(event="socket.closed",connection_id=%id,room_instance_id=%room_id,player_id=%subscription.player_id,duration_ms=connected_at.elapsed().as_millis() as u64,release=%state.release);
    // Connect may have committed even when its response timed out. Always enqueue matching cleanup.
    if let Err(error) = handle
        .request_reliable(Operation::Disconnect { connection: id })
        .await
    {
        // Presence then lapses through the stale-connection sweep instead.
        tracing::warn!(event="socket.cleanup_failed",connection_id=%id,room_instance_id=%room_id,player_id=%subscription.player_id,code=error.code(),error=%error);
    }
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
    events: &mut broadcast::Receiver<Arc<RoomEvent>>,
    connection: Uuid,
    identity: &Subscription,
    stage: &mut &'static str,
) -> AppResult<()> {
    let mut interval = tokio::time::interval(Duration::from_secs(5));
    interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
    let mut activity_interval = tokio::time::interval_at(
        tokio::time::Instant::now() + Duration::from_secs(30 * 60),
        Duration::from_secs(30 * 60),
    );
    activity_interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
    let mut seen = Instant::now();
    let mut budget_start = Instant::now();
    let mut count = 0_u32;
    loop {
        tokio::select! {
            _=state.shutdown.cancelled()=>return Ok(()),
            _=activity_interval.tick()=>crate::http::record_activity(state, identity.visitor_id),
            _=interval.tick()=>{
                if seen.elapsed()>Duration::from_secs(25){*stage="idle_timeout";return Err(AppError::Timeout);}
                *stage="heartbeat";
                handle.request(Operation::Heartbeat{connection}).await?;
                *stage="ping";
                send_message(socket,Message::Ping(Vec::new().into())).await?;
            }
            incoming=socket.recv()=>{
                *stage="receive";
                let message=incoming.ok_or(AppError::Unavailable)?.map_err(|error|{
                    tracing::debug!(event="socket.receive_error",connection_id=%connection,error=%error);
                    AppError::Unavailable
                })?;
                seen=Instant::now();
                if budget_start.elapsed()>=Duration::from_secs(1){count=0;budget_start=Instant::now();}
                count+=1;if count>120{*stage="message_rate_limit";return Err(AppError::Busy);}
                match message {
                    Message::Text(text)=>{
                        *stage="frame_parse";
                        let frame:Frame=serde_json::from_str(&text).map_err(|error|{
                            tracing::warn!(event="socket.frame_invalid",connection_id=%connection,player_id=%identity.player_id,detail=%error);
                            AppError::Invalid("Invalid websocket frame")
                        })?;
                        match frame.event.as_str(){
                            "room.subscribe"=>{
                                *stage="resubscribe";
                                let sub:Subscription=serde_json::from_value(frame.payload).map_err(|error|{
                                    tracing::warn!(event="socket.frame_invalid",connection_id=%connection,player_id=%identity.player_id,frame_event="room.subscribe",detail=%error);
                                    AppError::Invalid("Invalid subscription")
                                })?;
                                if sub.room_code!=identity.room_code||sub.player_id!=identity.player_id||sub.session_id!=identity.session_id||sub.room_instance_id!=identity.room_instance_id{*stage="resubscribe_identity_mismatch";return Err(AppError::Forbidden);}
                                let mut current=handle.request(Operation::Resync{connection}).await?;
                                current["room"]=handle.request(Operation::Snapshot{after:sub.after_revision}).await?;
                                publish_state(socket,current).await?;
                            }
                            "room.world-resync"=>{*stage="world_resync";publish_state(socket,handle.request(Operation::Resync{connection}).await?).await?}
                            "room.heartbeat"=>{*stage="client_heartbeat";handle.request(Operation::Heartbeat{connection}).await?;},
                            "room.player-event"=>{
                                *stage="player_event";
                                let event=frame.payload["type"].as_str().ok_or(AppError::Invalid("Missing movement type"))?.to_string();
                                let position=frame.payload.get("snapshot").cloned().ok_or(AppError::Invalid("Missing movement snapshot"))?;
                                match handle.request(Operation::World{connection,event,position}).await{Ok(_)|Err(AppError::Busy)=>(),Err(e)=>return Err(e)}
                            }
                            other=>{
                                tracing::warn!(event="socket.frame_invalid",connection_id=%connection,player_id=%identity.player_id,frame_event=%other.chars().take(48).collect::<String>(),detail="unsupported event");
                                *stage="unsupported_event";
                                return Err(AppError::Invalid("Unsupported websocket event"));
                            }
                        }
                    }
                    Message::Pong(_)=>(), Message::Ping(data)=>{*stage="pong";send_message(socket,Message::Pong(data)).await?}
                    Message::Close(_)=>return Ok(()), Message::Binary(_)=>{*stage="binary_frame";return Err(AppError::Invalid("Binary frames are not supported"))}
                }
            }
            received=events.recv()=>match received {
                Ok(event)=>{
                    *stage="forward_event";
                    let terminal=event.name=="room.expired"||event.name=="server.draining";
                    send_message(socket,Message::Text(event.text.to_string().into())).await?;if terminal{return Ok(());}
                }
                Err(broadcast::error::RecvError::Lagged(skipped))=>{
                    // The client missed broadcast events; a full resync replaces them.
                    tracing::warn!(event="socket.lagged",connection_id=%connection,player_id=%identity.player_id,skipped);
                    *stage="lagged_resync";
                    publish_state(socket,handle.request(Operation::Resync{connection}).await?).await?
                }
                Err(broadcast::error::RecvError::Closed)=>{*stage="room_events_closed";return Err(AppError::Unavailable)}
            }
        }
    }
}
