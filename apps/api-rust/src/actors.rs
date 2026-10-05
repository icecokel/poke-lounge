use crate::{
    compute::Compute,
    config::{MAILBOX_CAPACITY, MAX_ACTORS, REQUEST_TIMEOUT},
    domain::{
        CreateRoom, GameCommand, MAX_PARTICIPANTS, PRESENCE_LEASE_MS, Room, RoomVisibility, Status,
        session_hash,
    },
    error::{AppError, AppResult},
    repository::{Receipt, Repository, fingerprint},
};
use serde_json::{Value, json};
use std::{
    collections::{BTreeMap, HashMap},
    sync::{
        Arc,
        atomic::{AtomicU64, Ordering},
    },
    time::Duration,
};
use tokio::sync::{Mutex, broadcast, mpsc, oneshot};
use tokio_util::{sync::CancellationToken, task::TaskTracker};
use tracing::{Instrument, Span};
use uuid::Uuid;

pub enum Operation {
    Snapshot {
        after: Option<u64>,
    },
    ReadSnapshot {
        after: Option<u64>,
        requester: Option<(String, String)>,
    },
    Command {
        player: String,
        session: String,
        id: String,
        expected: Option<u64>,
        command: GameCommand,
        request_hash: Option<String>,
    },
    Connect {
        connection: Uuid,
        player: String,
        session: String,
        after: Option<u64>,
    },
    Heartbeat {
        connection: Uuid,
    },
    Disconnect {
        connection: Uuid,
    },
    World {
        connection: Uuid,
        event: String,
        position: Value,
    },
    Resync {
        connection: Uuid,
    },
}
struct Envelope {
    operation: Operation,
    reply: oneshot::Sender<AppResult<Value>>,
    span: Span,
}
#[derive(Clone)]
pub struct Handle {
    sender: mpsc::Sender<Envelope>,
    events: broadcast::Sender<Value>,
}
impl Handle {
    pub fn subscribe(&self) -> broadcast::Receiver<Value> {
        self.events.subscribe()
    }
    pub async fn request(&self, operation: Operation) -> AppResult<Value> {
        let (reply, receiver) = oneshot::channel();
        self.sender
            .try_send(Envelope {
                operation,
                reply,
                span: Span::current(),
            })
            .map_err(|e| match e {
                mpsc::error::TrySendError::Full(_) => AppError::Busy,
                mpsc::error::TrySendError::Closed(_) => AppError::Unavailable,
            })?;
        tokio::time::timeout(REQUEST_TIMEOUT, receiver)
            .await
            .map_err(|_| AppError::Timeout)?
            .map_err(|_| AppError::Unavailable)?
    }
}
#[derive(Clone)]
pub struct Rooms {
    repository: Repository,
    compute: Compute,
    actors: Arc<Mutex<HashMap<Uuid, Handle>>>,
    shutdown: CancellationToken,
    tasks: TaskTracker,
    creation: Arc<Mutex<()>>,
    pub last_tick_ms: Arc<AtomicU64>,
}
impl Rooms {
    pub fn new(repository: Repository, compute: Compute, shutdown: CancellationToken) -> Self {
        Self {
            repository,
            compute,
            actors: Arc::new(Mutex::new(HashMap::new())),
            shutdown,
            tasks: TaskTracker::new(),
            creation: Arc::new(Mutex::new(())),
            last_tick_ms: Arc::new(AtomicU64::new(0)),
        }
    }
    pub async fn handle(&self, id: Uuid) -> AppResult<Handle> {
        if self.shutdown.is_cancelled() {
            return Err(AppError::Unavailable);
        }
        let mut actors = self.actors.lock().await;
        actors.retain(|_, h| !h.sender.is_closed());
        if let Some(h) = actors.get(&id) {
            return Ok(h.clone());
        }
        if actors.len() >= MAX_ACTORS {
            return Err(AppError::Busy);
        }
        let (now, room) = self.repository.read(id).await?;
        let (sender, receiver) = mpsc::channel(MAILBOX_CAPACITY);
        let (events, _) = broadcast::channel(256);
        let h = Handle {
            sender,
            events: events.clone(),
        };
        actors.insert(id, h.clone());
        let actor = Actor {
            room,
            repository: self.repository.clone(),
            compute: self.compute.clone(),
            events,
            shutdown: self.shutdown.clone(),
            world: BTreeMap::new(),
            connections: BTreeMap::new(),
            world_epoch: Uuid::new_v4(),
            world_seq: 0,
            now,
            last_cursor_ms: now,
            last_tick_ms: self.last_tick_ms.clone(),
        };
        self.tasks.spawn(actor.run(receiver));
        Ok(h)
    }
    pub async fn request(&self, id: Uuid, operation: Operation) -> AppResult<Value> {
        self.handle(id).await?.request(operation).await
    }
    pub async fn resolve(&self, code: &str, expected: Option<Uuid>) -> AppResult<Uuid> {
        let id = self.repository.lookup_code(code).await?;
        if expected.is_some_and(|e| e != id) {
            return Err(AppError::NotFound);
        }
        Ok(id)
    }
    pub async fn restore(&self) -> AppResult<()> {
        for id in self.repository.active_ids().await? {
            if let Err(e) = self.handle(id).await {
                if matches!(e, AppError::Unavailable | AppError::Storage(_)) {
                    return Err(e);
                }
                tracing::warn!(event="room.restore_failed",room_instance_id=%id);
            }
        }
        Ok(())
    }
    pub async fn public_rooms(&self) -> AppResult<Value> {
        let mut rooms = Vec::new();
        for room_id in self.repository.active_ids().await? {
            let (now, room) = match self.repository.read(room_id).await {
                Ok(value) => value,
                Err(AppError::NotFound) => continue,
                Err(error) => return Err(error),
            };
            if !room.public
                || matches!(room.status, Status::Completed | Status::Closed)
                || room.active_deadline() <= now
            {
                continue;
            }

            let participant_count = room
                .participants
                .iter()
                .filter(|participant| participant.left_at_ms.is_none())
                .count();
            let human_participant_count = room
                .participants
                .iter()
                .filter(|participant| !participant.ai && participant.left_at_ms.is_none())
                .count();
            let joinable = room.status == Status::Waiting
                && room.round.phase == "waiting"
                && participant_count < MAX_PARTICIPANTS;

            rooms.push((
                room.created_at_ms,
                room.room_code.clone(),
                json!({
                    "roomCode": room.room_code,
                    "roomInstanceId": room.room_instance_id,
                    "visibility": "public",
                    "status": room.status,
                    "revision": room.revision,
                    "participantCount": participant_count,
                    "humanParticipantCount": human_participant_count,
                    "maxParticipants": MAX_PARTICIPANTS,
                    "roundDurationMs": room.round.duration_ms,
                    "createdAtMs": room.created_at_ms,
                    "updatedAtMs": room.updated_at_ms,
                    "expiresAtMs": room.active_deadline(),
                    "joinable": joinable,
                }),
            ));
        }
        rooms.sort_by(|left, right| left.0.cmp(&right.0).then_with(|| left.1.cmp(&right.1)));
        Ok(json!({
            "rooms": rooms
                .into_iter()
                .map(|(_, _, room)| room)
                .collect::<Vec<_>>()
        }))
    }
    pub async fn create(&self, input: CreateRoom, id: String) -> AppResult<Value> {
        self.create_internal(input, id, false).await
    }
    pub async fn quick_play(&self, mut input: CreateRoom, id: String) -> AppResult<Value> {
        input.visibility = RoomVisibility::Public;
        input.room_code = None;
        self.create_internal(input, id, true).await
    }
    async fn create_internal(
        &self,
        input: CreateRoom,
        id: String,
        match_existing_public: bool,
    ) -> AppResult<Value> {
        let _guard = tokio::time::timeout(REQUEST_TIMEOUT, self.creation.lock())
            .await
            .map_err(|_| AppError::Busy)?;
        let public = input.visibility == RoomVisibility::Public;
        let session = session_hash(&input.session_id)?;
        let hash = fingerprint(&("create", public, &input))?;
        if let Some(receipt) = self.repository.receipt(&session, &id).await? {
            if receipt.request_hash != hash {
                return Err(AppError::CommandConflict);
            }
            return self
                .request(
                    receipt.room_instance_id,
                    Operation::Snapshot { after: None },
                )
                .await;
        }
        if public && match_existing_public {
            let mut candidates = Vec::new();
            for room_id in self.repository.active_ids().await? {
                if let Ok((now, room)) = self.repository.read(room_id).await
                    && room.public
                    && room.status == Status::Waiting
                    && room.participants.len() < MAX_PARTICIPANTS
                    && room.active_deadline() > now
                {
                    candidates.push(room);
                }
            }
            candidates.sort_by_key(|r| r.created_at_ms);
            for room in candidates {
                let result = self
                    .request(
                        room.room_instance_id,
                        Operation::Command {
                            player: input.player_id.clone(),
                            session: session.clone(),
                            id: id.clone(),
                            expected: None,
                            command: GameCommand::Join {
                                display_name: input
                                    .display_name
                                    .clone()
                                    .unwrap_or_else(|| "플레이어".into()),
                            },
                            request_hash: Some(hash.clone()),
                        },
                    )
                    .await;
                match result {
                    Ok(value) => return Ok(value),
                    Err(AppError::Closed | AppError::RoomFull | AppError::NotFound) => continue,
                    Err(e) => return Err(e),
                }
            }
        }
        let (room, _, _) = self.repository.create(input, public, &session, &id).await?;
        self.request(room.room_instance_id, Operation::Snapshot { after: None })
            .await
    }
    pub async fn drain(&self) -> bool {
        self.tasks.close();
        tokio::time::timeout(Duration::from_secs(30), self.tasks.wait())
            .await
            .is_ok()
    }
}
struct Actor {
    room: Room,
    repository: Repository,
    compute: Compute,
    events: broadcast::Sender<Value>,
    shutdown: CancellationToken,
    world: BTreeMap<String, Value>,
    connections: BTreeMap<Uuid, String>,
    world_epoch: Uuid,
    world_seq: u64,
    now: u64,
    last_cursor_ms: u64,
    last_tick_ms: Arc<AtomicU64>,
}
impl Actor {
    async fn run(mut self, mut receiver: mpsc::Receiver<Envelope>) {
        let mut ticker = tokio::time::interval_at(
            tokio::time::Instant::now() + Duration::from_millis(250),
            Duration::from_millis(250),
        );
        ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
        loop {
            tokio::select! {
                biased;
                _=self.shutdown.cancelled()=>{
                    receiver.close();while let Some(message)=receiver.recv().await{let _=message.reply.send(Err(AppError::Unavailable));}
                    self.emit("server.draining",json!({}));break;
                }
                _=ticker.tick()=>{
                    match self.tick().await {
                        Ok(())=>(),Err(AppError::NotFound|AppError::Unavailable)=>{if !self.room.terminal(){self.emit("room.expired",json!({"roomCode":self.room.room_code,"roomInstanceId":self.room.room_instance_id}));}break;}
                        Err(_)=>tracing::warn!(event="room.tick_failed",room_instance_id=%self.room.room_instance_id,revision=self.room.revision),
                    }
                    ticker.reset();
                }
                message=receiver.recv()=>{
                    let Some(message)=message else{break;};
                    let result=self.execute(message.operation).instrument(message.span).await;let _=message.reply.send(result);
                }
            }
        }
    }
    async fn reload(&mut self) -> AppResult<()> {
        let (now, mut room) = self.repository.read(self.room.room_instance_id).await?;
        self.now = now;
        let previous = room.revision;
        room.prepare_clock(now);
        if room.revision != previous {
            let version = room.storage_version;
            self.repository.commit(version, &mut room, None).await?;
        }
        let changed = room.revision != self.room.revision;
        self.room = room;
        if changed {
            self.publish_room();
        }
        Ok(())
    }
    async fn tick(&mut self) -> AppResult<()> {
        self.reload().await?;
        if self.room.terminal() {
            self.last_tick_ms.store(self.now, Ordering::Relaxed);
            return Ok(());
        }
        let mut next = self.room.clone();
        next.step_ai(self.now, &self.compute).await?;
        next.advance_game(self.now, &self.compute).await?;
        if next.revision != self.room.revision || next.last_ai_step_ms != self.room.last_ai_step_ms
        {
            let changed = next.revision != self.room.revision;
            let expected = self.room.storage_version;
            self.repository.commit(expected, &mut next, None).await?;
            self.room = next;
            if changed {
                self.publish_room();
            }
        }
        let removed = self
            .world
            .keys()
            .filter(|id| {
                !self
                    .room
                    .participants
                    .iter()
                    .any(|p| &p.player_id == *id && p.connected)
            })
            .cloned()
            .collect::<Vec<_>>();
        for id in removed {
            if let Some(snapshot) = self.world.remove(&id) {
                self.world_seq += 1;
                self.emit("room.player-event",json!({"type":"PLAYER_LEFT","roomCode":self.room.room_code,"worldEpoch":self.world_epoch,"worldSeq":self.world_seq,"snapshot":snapshot}));
            }
        }
        let players = self
            .room
            .participants
            .iter()
            .filter(|p| p.connected && p.admitted)
            .cloned()
            .collect::<Vec<_>>();
        for player in players {
            let position=self.room.position(&player.player_id,self.now).or_else(||{
                let a=self.room.adventures.get(&player.player_id)?;
                Some(json!({"map":"town","x":a["position"]["x"],"y":a["position"]["y"],"facing":a["facing"]}))
            });
            if let Some(position) = position {
                self.update_world(&player.player_id, "PLAYER_MOVED", position)?;
            }
        }
        if self.now >= self.last_cursor_ms + 1_000 {
            self.emit("room.world-cursor", self.cursor());
            self.last_cursor_ms = self.now;
        }
        self.last_tick_ms.store(self.now, Ordering::Relaxed);
        Ok(())
    }
    async fn execute(&mut self, operation: Operation) -> AppResult<Value> {
        // Movement is ephemeral and bounded; it never rewrites the Redis battle document.
        if let Operation::World {
            connection,
            event,
            position,
        } = operation
        {
            let player = self
                .connections
                .get(&connection)
                .cloned()
                .ok_or(AppError::Forbidden)?;
            if self.room.terminal() {
                // Rendering may emit one last movement frame while the final-result UI mounts.
                // Terminal rooms are immutable, so drop that stale frame without killing the socket.
                return Ok(Value::Null);
            }
            self.update_world(&player, &event, position)?;
            return Ok(Value::Null);
        }
        self.reload().await?;
        match operation {
            Operation::Snapshot { after } => Ok(self.room.snapshot(after)),
            Operation::ReadSnapshot { after, requester } => {
                if !self.room.public {
                    let (player, session) = requester.ok_or(AppError::Forbidden)?;
                    self.room.authorize(&player, &session)?;
                }
                Ok(self.room.snapshot(after))
            }
            Operation::Resync { connection } => {
                if !self.connections.contains_key(&connection) {
                    return Err(AppError::Forbidden);
                }
                Ok(json!({"room":self.room.snapshot(None),"world":self.world_snapshot()}))
            }
            Operation::Command {
                player,
                session,
                id,
                expected,
                command,
                request_hash,
            } => {
                let can_read_snapshot =
                    self.room.public || self.room.authorize(&player, &session).is_ok();
                let hash = request_hash.unwrap_or(fingerprint(&(
                    self.room.room_instance_id,
                    &player,
                    &command,
                ))?);
                if let Some(receipt) = self.repository.receipt(&session, &id).await? {
                    if receipt.room_instance_id != self.room.room_instance_id
                        || receipt.request_hash != hash
                    {
                        if !can_read_snapshot {
                            return Err(AppError::CommandConflict);
                        }
                        return Err(AppError::Conflict(
                            "POKE_LOUNGE_IDEMPOTENCY_CONFLICT",
                            Box::new(self.room.snapshot(None)),
                        ));
                    }
                    return Ok(receipt.response.unwrap_or_else(|| self.room.snapshot(None)));
                }
                if expected.is_some_and(|r| r != self.room.revision) {
                    if !can_read_snapshot {
                        return Err(AppError::RevisionConflict);
                    }
                    return Err(AppError::Conflict(
                        "POKE_LOUNGE_REVISION_CONFLICT",
                        Box::new(self.room.snapshot(None)),
                    ));
                }
                let mut next = self.room.clone();
                let response = next
                    .apply(command, &player, &session, self.now, &self.compute)
                    .await?;
                next.accepted_commands += 1;
                let receipt = Receipt {
                    room_instance_id: next.room_instance_id,
                    request_hash: hash.clone(),
                    applied_revision: next.revision,
                    response: response.clone(),
                };
                let committed = self
                    .repository
                    .commit(
                        self.room.storage_version,
                        &mut next,
                        Some((&session, &id, &receipt)),
                    )
                    .await?;
                if committed.replayed {
                    self.reload().await?;
                    let stored = committed.receipt.ok_or(AppError::Unavailable)?;
                    if stored.request_hash != hash {
                        return Err(AppError::CommandConflict);
                    }
                    return Ok(stored.response.unwrap_or_else(|| self.room.snapshot(None)));
                }
                let changed = self.room.revision != next.revision;
                self.room = next;
                if changed {
                    self.publish_room();
                }
                tracing::info!(event="room.command",room_instance_id=%self.room.room_instance_id,revision=self.room.revision);
                Ok(response.unwrap_or_else(|| self.room.snapshot(None)))
            }
            Operation::Connect {
                connection,
                player,
                session,
                after,
            } => {
                let index = self.room.authorize(&player, &session)?;
                if self.room.status == Status::Closed || !self.room.participants[index].connected {
                    return Err(AppError::Closed);
                }
                if self.connections.len() >= 32
                    || self
                        .connections
                        .values()
                        .filter(|id| **id == player)
                        .count()
                        >= 4
                {
                    return Err(AppError::Busy);
                }
                let mut next = self.room.clone();
                if !next.terminal() {
                    let p = &mut next.participants[index];
                    let changed = !p.admitted;
                    p.admitted = true;
                    p.disconnect_pending = false;
                    p.presence_until_ms = self.now + PRESENCE_LEASE_MS;
                    if changed {
                        next.touch(self.now);
                    }
                    self.repository
                        .commit(self.room.storage_version, &mut next, None)
                        .await?;
                }
                let changed = next.revision != self.room.revision;
                self.room = next;
                self.connections.insert(connection, player.clone());
                if changed {
                    self.publish_room();
                }
                if !self.world.contains_key(&player) {
                    self.update_world(
                        &player,
                        "PLAYER_JOINED",
                        self.room
                            .position(&player, self.now)
                            .unwrap_or(json!({"map":"town","x":656,"y":446,"facing":"front"})),
                    )?;
                }
                Ok(json!({"room":self.room.snapshot(after),"world":self.world_snapshot()}))
            }
            Operation::Heartbeat { connection } => {
                let player = self
                    .connections
                    .get(&connection)
                    .cloned()
                    .ok_or(AppError::Forbidden)?;
                if !self.room.terminal() {
                    let mut next = self.room.clone();
                    let p = next
                        .participants
                        .iter_mut()
                        .find(|p| p.player_id == player && p.connected)
                        .ok_or(AppError::Forbidden)?;
                    if p.presence_until_ms < self.now + PRESENCE_LEASE_MS / 2 {
                        p.presence_until_ms = self.now + PRESENCE_LEASE_MS;
                        self.repository
                            .commit(self.room.storage_version, &mut next, None)
                            .await?;
                        self.room = next;
                    }
                }
                Ok(Value::Null)
            }
            Operation::Disconnect { connection } => {
                if let Some(player) = self.connections.remove(&connection)
                    && !self.connections.values().any(|id| id == &player)
                    && !self.room.terminal()
                {
                    let mut next = self.room.clone();
                    if let Some(p) = next
                        .participants
                        .iter_mut()
                        .find(|p| p.player_id == player && p.connected)
                    {
                        p.disconnect_pending = true;
                        p.presence_until_ms = self.now + PRESENCE_LEASE_MS;
                        self.repository
                            .commit(self.room.storage_version, &mut next, None)
                            .await?;
                        self.room = next;
                    }
                }
                Ok(Value::Null)
            }
            Operation::World { .. } => unreachable!(),
        }
    }
    fn emit(&self, event: &str, payload: Value) {
        let _ = self.events.send(json!({"event":event,"payload":payload}));
    }
    fn publish_room(&self) {
        self.emit("room.snapshot", json!({"room":self.room.snapshot(None)}));
    }
    fn cursor(&self) -> Value {
        json!({"roomCode":self.room.room_code,"worldEpoch":self.world_epoch,"worldSeq":self.world_seq})
    }
    fn world_snapshot(&self) -> Value {
        let mut result = self.cursor();
        result["players"] = json!(self.world.values().collect::<Vec<_>>());
        result
    }
    fn update_world(&mut self, player: &str, event: &str, position: Value) -> AppResult<()> {
        if !matches!(
            event,
            "PLAYER_MOVED" | "PLAYER_MOVEMENT_ENDED" | "PLAYER_CHANGED_MAP" | "PLAYER_JOINED"
        ) {
            return Err(AppError::Invalid("Invalid movement event"));
        }
        let p = self
            .room
            .participants
            .iter()
            .find(|p| p.player_id == player && p.connected && p.admitted)
            .ok_or(AppError::Forbidden)?;
        let position = self.room.position(player, self.now).unwrap_or(position);
        let x = position["x"]
            .as_f64()
            .filter(|x| x.is_finite() && (0.0..=8192.0).contains(x))
            .ok_or(AppError::Invalid("Invalid x coordinate"))?;
        let y = position["y"]
            .as_f64()
            .filter(|y| y.is_finite() && (0.0..=8192.0).contains(y))
            .ok_or(AppError::Invalid("Invalid y coordinate"))?;
        let map = position["map"]
            .as_str()
            .filter(|m| {
                !m.is_empty()
                    && m.len() <= 64
                    && m.bytes()
                        .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
            })
            .ok_or(AppError::Invalid("Invalid map"))?;
        let facing = position["facing"]
            .as_str()
            .filter(|f| matches!(*f, "front" | "back" | "left" | "right"))
            .ok_or(AppError::Invalid("Invalid direction"))?;
        let mut snapshot = json!({"sessionId":player,"playerId":player,"displayName":p.display_name,"controller":if p.ai{"ai"}else{"human"},"map":map,"x":x,"y":y,"facing":facing});
        if p.ai
            && let Some(activity) = self
                .room
                .adventures
                .get(player)
                .and_then(|a| a.get("activity"))
        {
            snapshot["activity"] = activity.clone();
        }
        if let Some(party) = self.room.parties.get(player)
            && let Some(active) = party.competitive_party["members"].as_array().and_then(|m| {
                m.iter()
                    .find(|m| m["slotIndex"] == party.competitive_party["activeSlotIndex"])
            })
        {
            snapshot["activePokemon"] =
                json!({"speciesId":active["speciesId"],"level":active["level"]});
        }
        if self.world.get(player) == Some(&snapshot) && event == "PLAYER_MOVED" {
            return Ok(());
        }
        self.world.insert(player.into(), snapshot.clone());
        self.world_seq += 1;
        self.emit("room.player-event",json!({"type":event,"snapshot":snapshot,"roomCode":self.room.room_code,"worldEpoch":self.world_epoch,"worldSeq":self.world_seq}));
        Ok(())
    }
}
