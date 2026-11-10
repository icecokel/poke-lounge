use crate::{
    compute::Compute,
    config::{MAILBOX_CAPACITY, MAX_ACTORS, MAX_LIVE_ROOMS_PER_IP, REQUEST_TIMEOUT},
    domain::{
        CreateRoom, DEFAULT_SPAWN_X, DEFAULT_SPAWN_Y, FIELD_MAP_KEY, GameCommand, MAX_COMMANDS,
        MAX_PARTICIPANTS, PRESENCE_LEASE_MS, ROUND_PHASE_WAITING, Room, RoomFaults, RoomVisibility,
        Status, session_hash,
    },
    error::{AppError, AppResult},
    repository::{Receipt, Repository, fingerprint},
};
use axum::extract::ws::Utf8Bytes;
use serde_json::{Value, json};
use std::{
    collections::{BTreeMap, HashMap},
    net::IpAddr,
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

// Check the stored version periodically; the actor is the sole writer after creation.
const FULL_RELOAD_INTERVAL_MS: u64 = 5_000;
// AI movement does not bump the room revision; persist it periodically so a restart resumes near it.
const AI_CHECKPOINT_INTERVAL_MS: u64 = 2_000;
const CONNECTION_STALE_MS: u64 = 30_000;
const MIN_MOVE_INTERVAL: Duration = Duration::from_millis(50);
// One participant may spend at most a quarter of the room's command budget, so a single client
// cannot exhaust it for everyone. Counted in memory only; a restart resets it.
const MAX_COMMANDS_PER_PARTICIPANT: u32 = (MAX_COMMANDS / 4) as u32;
const TICK_INTERVAL: Duration = Duration::from_millis(250);
// A failing tick repeats the same Redis and compute work; back off instead of retrying 4x/s.
const TICK_BACKOFF_MAX_SHIFT: u32 = 4;
const TICK_FAILURE_LOG_INTERVAL: Duration = Duration::from_secs(10);
/// Delay before the next tick after `failures` consecutive failed ticks: 250ms, then 0.5s to 4s.
fn tick_delay(failures: u32) -> Duration {
    TICK_INTERVAL * (1 << failures.min(TICK_BACKOFF_MAX_SHIFT))
}

pub enum Operation {
    Snapshot {
        after: Option<u64>,
    },
    ReadSnapshot {
        after: Option<u64>,
        requester: Option<(String, String)>,
    },
    ReadProgression {
        player: String,
        session: String,
        match_id: Uuid,
    },
    Command {
        /// `None` resolves the human participant from the session inside the actor.
        player: Option<String>,
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
pub struct RoomEvent {
    pub name: String,
    /// Reference-counted frame text: every subscriber sends the same buffer without copying it.
    pub text: Utf8Bytes,
}
#[derive(Clone)]
pub struct Handle {
    sender: mpsc::Sender<Envelope>,
    events: broadcast::Sender<Arc<RoomEvent>>,
}
impl Handle {
    pub fn subscribe(&self) -> broadcast::Receiver<Arc<RoomEvent>> {
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
    /// Cleanup must not be dropped when the mailbox is momentarily full.
    pub async fn request_reliable(&self, operation: Operation) -> AppResult<Value> {
        let (reply, receiver) = oneshot::channel();
        tokio::time::timeout(
            REQUEST_TIMEOUT,
            self.sender.send(Envelope {
                operation,
                reply,
                span: Span::current(),
            }),
        )
        .await
        .map_err(|_| AppError::Timeout)?
        .map_err(|_| AppError::Unavailable)?;
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
    /// Rooms created per client address, pruned against the active index when a limit is near.
    /// In memory only: a restart forgets it, which errs on the side of letting players in.
    created_by_ip: Arc<std::sync::Mutex<HashMap<IpAddr, Vec<Uuid>>>>,
    pub last_tick_ms: Arc<AtomicU64>,
}
// Bound on tracked addresses before every entry is pruned against the active index.
const CREATOR_TABLE_PRUNE_AT: usize = 512;
static CREATE_LIMIT_LOGGED_S: AtomicU64 = AtomicU64::new(0);
impl Rooms {
    pub fn new(repository: Repository, compute: Compute, shutdown: CancellationToken) -> Self {
        Self {
            repository,
            compute,
            actors: Arc::new(Mutex::new(HashMap::new())),
            shutdown,
            tasks: TaskTracker::new(),
            creation: Arc::new(Mutex::new(())),
            created_by_ip: Arc::new(std::sync::Mutex::new(HashMap::new())),
            last_tick_ms: Arc::new(AtomicU64::new(0)),
        }
    }
    pub async fn handle(&self, id: Uuid) -> AppResult<Handle> {
        if self.shutdown.is_cancelled() {
            return Err(AppError::Unavailable);
        }
        {
            let mut actors = self.actors.lock().await;
            actors.retain(|_, h| !h.sender.is_closed());
            if let Some(h) = actors.get(&id) {
                return Ok(h.clone());
            }
            if actors.len() >= MAX_ACTORS {
                return Err(AppError::Busy);
            }
        }
        // Read without the map lock so one slow Redis read cannot stall requests for every room.
        let (now, room) = self.repository.read(id).await?;
        // Re-check: the insert and spawn below stay under the lock, so a room never gets two
        // actors. An actor started meanwhile is the authority and this read is discarded.
        let mut actors = self.actors.lock().await;
        actors.retain(|_, h| !h.sender.is_closed());
        if let Some(h) = actors.get(&id) {
            return Ok(h.clone());
        }
        if actors.len() >= MAX_ACTORS {
            return Err(AppError::Busy);
        }
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
            last_move_accepted: HashMap::new(),
            commands_by_player: HashMap::new(),
            connections: BTreeMap::new(),
            connection_seen: BTreeMap::new(),
            world_epoch: Uuid::new_v4(),
            world_seq: 0,
            now,
            last_cursor_ms: now,
            last_full_reload_ms: now,
            last_persisted_ms: now,
            unpersisted: false,
            last_tick_ms: self.last_tick_ms.clone(),
            tick_stage: "idle",
            tick_failures: 0,
            tick_failure_logged: None,
            faults: RoomFaults::default(),
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
                tracing::warn!(event="room.restore_failed",room_instance_id=%id,code=e.code(),error=%e,detail=?e.detail());
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
                && room.round.phase == ROUND_PHASE_WAITING
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
                    "starterMode": room.starter_mode,
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
    /// `creator` is the client address the per-address room cap applies to, if any.
    pub async fn create(
        &self,
        input: CreateRoom,
        id: String,
        creator: Option<IpAddr>,
    ) -> AppResult<Value> {
        self.create_internal(input, id, false, creator).await
    }
    pub async fn quick_play(
        &self,
        mut input: CreateRoom,
        id: String,
        creator: Option<IpAddr>,
    ) -> AppResult<Value> {
        input.visibility = RoomVisibility::Public;
        input.room_code = None;
        self.create_internal(input, id, true, creator).await
    }
    /// Rejects a new room when `ip` already has `MAX_LIVE_ROOMS_PER_IP` live rooms it created.
    async fn admit_creator(&self, ip: IpAddr) -> AppResult<()> {
        let needs_prune = {
            let created = self.created_by_ip.lock().unwrap_or_else(|e| e.into_inner());
            created.len() >= CREATOR_TABLE_PRUNE_AT
                || created
                    .get(&ip)
                    .is_some_and(|rooms| rooms.len() >= MAX_LIVE_ROOMS_PER_IP)
        };
        if !needs_prune {
            return Ok(());
        }
        // Closed, completed and expired rooms leave the active index and free their slot here.
        let live = self.repository.active_ids().await?;
        let mut created = self.created_by_ip.lock().unwrap_or_else(|e| e.into_inner());
        created.retain(|_, rooms| {
            rooms.retain(|id| live.contains(id));
            !rooms.is_empty()
        });
        if created
            .get(&ip)
            .is_some_and(|rooms| rooms.len() >= MAX_LIVE_ROOMS_PER_IP)
        {
            if crate::http::first_this_second(&CREATE_LIMIT_LOGGED_S) {
                tracing::warn!(
                    event = "room.create_limited",
                    limit = "live_rooms_per_ip",
                    max = MAX_LIVE_ROOMS_PER_IP
                );
            }
            return Err(AppError::Capacity);
        }
        Ok(())
    }
    async fn create_internal(
        &self,
        input: CreateRoom,
        id: String,
        match_existing_public: bool,
        creator: Option<IpAddr>,
    ) -> AppResult<Value> {
        let public = input.visibility == RoomVisibility::Public;
        let session = session_hash(&input.session_id)?;
        let hash = fingerprint(&("create", public, &input))?;
        let room_id = {
            // Only public rooms are serialized: two quick-play requests must not both miss a
            // joinable room and open two. A private create is atomic in the create script, and the
            // lock is released before the final snapshot request.
            let _guard = if public {
                Some(
                    tokio::time::timeout(REQUEST_TIMEOUT, self.creation.lock())
                        .await
                        .map_err(|_| AppError::Busy)?,
                )
            } else {
                None
            };
            if let Some(receipt) = self.repository.receipt(&session, &id).await? {
                if receipt.request_hash != hash {
                    return Err(AppError::CommandConflict);
                }
                receipt.room_instance_id
            } else {
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
                                    player: Some(input.player_id.clone()),
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
                            Err(AppError::Closed | AppError::RoomFull | AppError::NotFound) => {
                                continue;
                            }
                            Err(e) => return Err(e),
                        }
                    }
                }
                if let Some(ip) = creator {
                    self.admit_creator(ip).await?;
                }
                let (room, _, _) = self.repository.create(input, public, &session, &id).await?;
                if let Some(ip) = creator {
                    let mut created = self.created_by_ip.lock().unwrap_or_else(|e| e.into_inner());
                    let rooms = created.entry(ip).or_default();
                    // A replayed create returns the room it made before; count it once.
                    if !rooms.contains(&room.room_instance_id) {
                        rooms.push(room.room_instance_id);
                    }
                }
                tracing::info!(event="room.created",room_instance_id=%room.room_instance_id,room_code=%room.room_code,command_id=%id,public,revision=room.revision);
                room.room_instance_id
            }
        };
        self.request(room_id, Operation::Snapshot { after: None })
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
    events: broadcast::Sender<Arc<RoomEvent>>,
    shutdown: CancellationToken,
    world: BTreeMap<String, Value>,
    last_move_accepted: HashMap<String, tokio::time::Instant>,
    /// State-changing commands accepted per player, for `MAX_COMMANDS_PER_PARTICIPANT`.
    commands_by_player: HashMap<String, u32>,
    connections: BTreeMap<Uuid, String>,
    connection_seen: BTreeMap<Uuid, u64>,
    world_epoch: Uuid,
    world_seq: u64,
    now: u64,
    last_cursor_ms: u64,
    last_full_reload_ms: u64,
    last_persisted_ms: u64,
    unpersisted: bool,
    last_tick_ms: Arc<AtomicU64>,
    /// Step of `tick` currently running, reported when it fails.
    tick_stage: &'static str,
    /// Consecutive failed ticks, to back off, throttle repeated failure logs and report recovery.
    tick_failures: u32,
    tick_failure_logged: Option<tokio::time::Instant>,
    /// Retry state of AI and tournament match steps that failed; see `Room::advance_game`.
    faults: RoomFaults,
}
impl Actor {
    fn snapshot(&self, after: Option<u64>) -> Value {
        let mut snapshot = self.room.snapshot(after);
        snapshot["serverNowMs"] = json!(self.now);
        snapshot
    }
    async fn run(mut self, mut receiver: mpsc::Receiver<Envelope>) {
        let mut ticker =
            tokio::time::interval_at(tokio::time::Instant::now() + TICK_INTERVAL, TICK_INTERVAL);
        ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
        loop {
            tokio::select! {
                biased;
                _=self.shutdown.cancelled()=>{
                    receiver.close();while let Some(message)=receiver.recv().await{let _=message.reply.send(Err(AppError::Unavailable));}
                    if self.unpersisted && let Err(error) = self.checkpoint().await {
                        tracing::error!(event="room.shutdown_checkpoint_failed",room_instance_id=%self.room.room_instance_id,revision=self.room.revision,code=error.code(),error=%error,detail=?error.detail());
                    }
                    self.emit("server.draining",json!({}));break;
                }
                _=ticker.tick()=>{
                    match self.tick().await {
                        Ok(())=>{
                            if self.tick_failures>0{
                                tracing::info!(event="room.tick_recovered",room_instance_id=%self.room.room_instance_id,revision=self.room.revision,failures=self.tick_failures);
                                self.tick_failures=0;
                                self.tick_failure_logged=None;
                            }
                        }
                        Err(error@(AppError::NotFound|AppError::Unavailable))=>{
                            tracing::info!(event="room.actor_stopped",room_instance_id=%self.room.room_instance_id,revision=self.room.revision,stage=self.tick_stage,code=error.code(),terminal=self.room.terminal());
                            if !self.room.terminal(){self.emit("room.expired",json!({"roomCode":self.room.room_code,"roomInstanceId":self.room.room_instance_id}));}break;
                        }
                        Err(error)=>{
                            if matches!(error,AppError::RevisionConflict|AppError::Storage(_)|AppError::Timeout){
                                self.last_full_reload_ms=0;
                            }
                            self.tick_failures=self.tick_failures.saturating_add(1);
                            // Log the first failure and then about every 10s while it keeps failing.
                            if self.tick_failure_logged.is_none_or(|at|at.elapsed()>=TICK_FAILURE_LOG_INTERVAL){
                                self.tick_failure_logged=Some(tokio::time::Instant::now());
                                tracing::warn!(event="room.tick_failed",room_instance_id=%self.room.room_instance_id,revision=self.room.revision,status=?self.room.status,stage=self.tick_stage,failures=self.tick_failures,code=error.code(),error=%error,detail=?error.detail());
                            }
                        }
                    }
                    ticker.reset_after(tick_delay(self.tick_failures));
                }
                message=receiver.recv()=>{
                    let Some(message)=message else{break;};
                    let result=self.execute(message.operation).instrument(message.span).await;
                    if matches!(result,Err(AppError::RevisionConflict|AppError::Storage(_)|AppError::Timeout)){
                        self.last_full_reload_ms=0;
                    }
                    let _=message.reply.send(result);
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
            self.last_persisted_ms = self.now;
        }
        let changed = room.revision != self.room.revision;
        self.room = room;
        self.unpersisted = false;
        if changed {
            self.publish_room();
        }
        Ok(())
    }
    async fn sync_clock(&mut self) -> AppResult<()> {
        let now = self.repository.now().await?;
        self.sync_clock_at(now).await
    }
    async fn sync_clock_at(&mut self, now: u64) -> AppResult<()> {
        self.now = now;
        let mut room = self.room.clone();
        let previous = room.revision;
        room.prepare_clock(now);
        if room.revision != previous {
            self.repository
                .commit(self.room.storage_version, &mut room, None)
                .await?;
            self.room = room;
            self.last_persisted_ms = self.now;
            self.unpersisted = false;
            self.publish_room();
        } else {
            // Waiting retain only removes participants disconnected in the same call, which bumps the revision.
            self.room = room;
        }
        Ok(())
    }
    async fn checkpoint(&mut self) -> AppResult<()> {
        let mut next = self.room.clone();
        self.repository
            .commit(self.room.storage_version, &mut next, None)
            .await?;
        self.room = next;
        self.last_persisted_ms = self.now;
        self.unpersisted = false;
        Ok(())
    }
    async fn tick(&mut self) -> AppResult<()> {
        self.tick_stage = "clock";
        let now = self.repository.now().await?;
        self.now = now;
        let check_version = now >= self.last_full_reload_ms + FULL_RELOAD_INTERVAL_MS;
        if check_version {
            if self.unpersisted {
                self.tick_stage = "checkpoint";
                match self.checkpoint().await {
                    Ok(()) => {}
                    Err(AppError::RevisionConflict) => {
                        tracing::warn!(event = "room.checkpoint_conflict", room_instance_id = %self.room.room_instance_id, revision = self.room.revision, storage_version = self.room.storage_version);
                    }
                    Err(error) => return Err(error),
                }
            }
            self.tick_stage = "read_version";
            let (now, version) = self
                .repository
                .read_version(self.room.room_instance_id)
                .await?;
            if version != Some(self.room.storage_version) {
                self.tick_stage = "reload";
                self.reload().await?;
            } else if !self.room.terminal() {
                self.tick_stage = "sync_clock";
                self.sync_clock_at(now).await?;
            }
            self.last_full_reload_ms = now;
        }
        if self.room.terminal() {
            if self.now >= self.room.retention_deadline() {
                return Err(AppError::NotFound);
            }
        } else if !check_version {
            self.tick_stage = "sync_clock";
            self.sync_clock_at(now).await?;
        }
        self.tick_stage = "disconnect_stale";
        let stale = self
            .connection_seen
            .iter()
            .filter(|(_, seen)| self.now >= **seen + CONNECTION_STALE_MS)
            .map(|(id, _)| *id)
            .collect::<Vec<_>>();
        for id in stale {
            self.disconnect(id).await?;
            tracing::warn!(event = "room.connection_stale", room_instance_id = %self.room.room_instance_id, connection_id = %id);
        }
        if self.room.terminal() {
            self.last_tick_ms.store(self.now, Ordering::Relaxed);
            return Ok(());
        }
        let mut next = self.room.clone();
        self.tick_stage = "ai_step";
        next.step_ai(self.now, &self.compute, &mut self.faults)
            .await?;
        self.tick_stage = "advance_game";
        next.advance_game(self.now, &self.compute, &mut self.faults)
            .await?;
        self.tick_stage = "commit";
        if next.revision != self.room.revision {
            let expected = self.room.storage_version;
            self.repository.commit(expected, &mut next, None).await?;
            self.room = next;
            self.last_persisted_ms = self.now;
            self.unpersisted = false;
            self.publish_room();
        } else if next.last_ai_step_ms != self.room.last_ai_step_ms {
            self.room = next;
            self.unpersisted = true;
            if self.now >= self.last_persisted_ms + AI_CHECKPOINT_INTERVAL_MS {
                self.checkpoint().await?;
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
            self.last_move_accepted.remove(&id);
            if let Some(snapshot) = self.world.remove(&id) {
                self.world_seq += 1;
                self.emit("room.player-event",json!({"type":"PLAYER_LEFT","roomCode":self.room.room_code,"worldEpoch":self.world_epoch,"worldSeq":self.world_seq,"snapshot":snapshot}));
            }
        }
        self.tick_stage = "world";
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
                Some(json!({"map":FIELD_MAP_KEY,"x":a["position"]["x"],"y":a["position"]["y"],"facing":a["facing"]}))
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
            self.connection_seen.insert(connection, self.now);
            if self.room.terminal() {
                // Rendering may emit one last movement frame while the final-result UI mounts.
                // Terminal rooms are immutable, so drop that stale frame without killing the socket.
                return Ok(Value::Null);
            }
            if event == "PLAYER_MOVED" {
                let now = tokio::time::Instant::now();
                if self
                    .last_move_accepted
                    .get(&player)
                    .is_some_and(|at| now.duration_since(*at) < MIN_MOVE_INTERVAL)
                {
                    return Ok(Value::Null); // Drop silently; the next frame carries the newer position.
                }
                self.last_move_accepted.insert(player.clone(), now);
            }
            self.update_world(&player, &event, position)?;
            return Ok(Value::Null);
        }
        self.sync_clock().await?;
        match operation {
            Operation::Snapshot { after } => Ok(self.snapshot(after)),
            Operation::ReadSnapshot { after, requester } => {
                if !self.room.public {
                    let (player, session) = requester.ok_or(AppError::Forbidden)?;
                    self.room.authorize(&player, &session)?;
                }
                Ok(self.snapshot(after))
            }
            Operation::ReadProgression {
                player,
                session,
                match_id,
            } => {
                self.room.authorize(&player, &session)?;
                self.room
                    .read_progression_snapshot(&player, match_id, self.now)
            }
            Operation::Resync { connection } => {
                if !self.connections.contains_key(&connection) {
                    return Err(AppError::Forbidden);
                }
                self.connection_seen.insert(connection, self.now);
                Ok(json!({"room":self.snapshot(None),"world":self.world_snapshot()}))
            }
            Operation::Command {
                player,
                session,
                id,
                expected,
                command,
                request_hash,
            } => {
                let player = match player {
                    Some(player) => player,
                    None => self
                        .room
                        .participants
                        .iter()
                        .find(|p| p.session_hash == session && !p.ai)
                        .ok_or(AppError::Forbidden)?
                        .player_id
                        .clone(),
                };
                let command_label = command.label();
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
                            Box::new(self.snapshot(None)),
                        ));
                    }
                    tracing::info!(event="room.command_replayed",room_instance_id=%self.room.room_instance_id,command_id=%id,command=command_label,player_id=%player,revision=self.room.revision);
                    return Ok(receipt.response.unwrap_or_else(|| self.snapshot(None)));
                }
                if expected.is_some_and(|r| r != self.room.revision) {
                    if !can_read_snapshot {
                        return Err(AppError::RevisionConflict);
                    }
                    return Err(AppError::Conflict(
                        "POKE_LOUNGE_REVISION_CONFLICT",
                        Box::new(self.snapshot(None)),
                    ));
                }
                // Leaving stays possible so an exhausted participant can still free the seat.
                if !matches!(command, GameCommand::Join { .. } | GameCommand::Leave)
                    && self
                        .commands_by_player
                        .get(&player)
                        .is_some_and(|count| *count >= MAX_COMMANDS_PER_PARTICIPANT)
                {
                    return Err(AppError::CommandLimit);
                }
                let mut next = self.room.clone();
                let response = next
                    .apply(command, &player, &session, self.now, &self.compute)
                    .await?;
                // A command that changed nothing (e.g. a stale round-ready) costs no budget, no
                // Redis write and no receipt; repeating it simply yields the current state again.
                if next.revision == self.room.revision && next == self.room {
                    tracing::debug!(event="room.command_noop",room_instance_id=%self.room.room_instance_id,command_id=%id,command=command_label,player_id=%player,revision=self.room.revision);
                    return Ok(response.unwrap_or_else(|| self.snapshot(None)));
                }
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
                    self.sync_clock().await?;
                    let stored = committed.receipt.ok_or(AppError::Unavailable)?;
                    if stored.request_hash != hash {
                        return Err(AppError::CommandConflict);
                    }
                    return Ok(stored.response.unwrap_or_else(|| self.snapshot(None)));
                }
                let changed = self.room.revision != next.revision;
                self.room = next;
                self.last_persisted_ms = self.now;
                self.unpersisted = false;
                if changed {
                    self.publish_room();
                }
                let spent = self.commands_by_player.entry(player.clone()).or_default();
                *spent += 1;
                if *spent == MAX_COMMANDS_PER_PARTICIPANT {
                    tracing::warn!(event="room.participant_command_budget_exhausted",room_instance_id=%self.room.room_instance_id,player_id=%player,limit=MAX_COMMANDS_PER_PARTICIPANT);
                }
                if command_label == "party" {
                    tracing::debug!(event="room.command",room_instance_id=%self.room.room_instance_id,command_id=%id,command=command_label,player_id=%player,expected_revision=?expected,revision=self.room.revision);
                } else {
                    tracing::info!(event="room.command",room_instance_id=%self.room.room_instance_id,command_id=%id,command=command_label,player_id=%player,expected_revision=?expected,revision=self.room.revision);
                }
                Ok(response.unwrap_or_else(|| self.snapshot(None)))
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
                    self.last_persisted_ms = self.now;
                    self.unpersisted = false;
                }
                let changed = next.revision != self.room.revision;
                self.room = next;
                self.connections.insert(connection, player.clone());
                self.connection_seen.insert(connection, self.now);
                if changed {
                    self.publish_room();
                }
                if !self.world.contains_key(&player) {
                    self.update_world(
                        &player,
                        "PLAYER_JOINED",
                        self.room
                            .position(&player, self.now)
                            .unwrap_or(json!({"map":FIELD_MAP_KEY,"x":DEFAULT_SPAWN_X,"y":DEFAULT_SPAWN_Y,"facing":"front"})),
                    )?;
                }
                Ok(json!({"room":self.snapshot(after),"world":self.world_snapshot()}))
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
                        self.last_persisted_ms = self.now;
                        self.unpersisted = false;
                    }
                }
                self.connection_seen.insert(connection, self.now);
                Ok(Value::Null)
            }
            Operation::Disconnect { connection } => {
                self.disconnect(connection).await?;
                Ok(Value::Null)
            }
            Operation::World { .. } => unreachable!(),
        }
    }
    async fn disconnect(&mut self, connection: Uuid) -> AppResult<()> {
        self.connection_seen.remove(&connection);
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
                self.last_persisted_ms = self.now;
                self.unpersisted = false;
            }
        }
        Ok(())
    }
    fn emit(&self, event: &str, payload: Value) {
        let text = json!({"event":event,"payload":payload}).to_string().into();
        let _ = self.events.send(Arc::new(RoomEvent {
            name: event.to_owned(),
            text,
        }));
    }
    fn publish_room(&self) {
        // Building the snapshot is the expensive part; skip it when no socket is subscribed.
        if self.events.receiver_count() == 0 {
            return;
        }
        self.emit("room.snapshot", json!({"room":self.snapshot(None)}));
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
