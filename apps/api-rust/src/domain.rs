use crate::{
    compute::{BattlePack, Compute, ENGINE_VERSION},
    error::{AppError, AppResult},
    repository::hash_bytes,
    tournament::{Bracket, Entrant},
};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::collections::{BTreeMap, BTreeSet};
use uuid::Uuid;

pub const SCHEMA_VERSION: u32 = 2;
pub const SESSION_MAX_MS: u64 = 7_200_000;
pub const LOBBY_MAX_MS: u64 = 600_000;
pub const PRESENCE_LEASE_MS: u64 = 60_000;
pub const ADMISSION_MS: u64 = 15_000;
pub const COMPLETED_RETENTION_MS: u64 = 15 * 60_000;
pub const CLOSED_RETENTION_MS: u64 = 60_000;
pub const TURN_MS: u64 = 30_000;
pub const MAX_PARTICIPANTS: usize = 8;
pub const MAX_COMMANDS: u64 = 16_384;
const ROOM_CODE_ALPHABET: &[u8; 32] = b"ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const AI_DISPLAY_NAMES: [&str; 18] = [
    "반바지 꼬마 오성",
    "반바지 꼬마 강철",
    "반바지 꼬마 정수",
    "곤충채집소년 미키",
    "곤충채집소년 광일",
    "피크닉걸 은향",
    "캠프보이 고광",
    "낚시꾼 세형",
    "낚시꾼 주원",
    "낚시꾼 태명",
    "새조련사 선정",
    "등산가 스톰",
    "애호가클럽 동휘",
    "쌍둥이 아롱&다롱",
    "불놀이꾼 다인",
    "선원 시현",
    "저글러 죤",
    "피크닉걸 진미",
];

#[derive(Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Status {
    Waiting,
    RoundStarted,
    Tournament,
    Completed,
    Closed,
}
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum AiDifficulty {
    #[default]
    Easy,
    Normal,
    Hard,
}
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RoomVisibility {
    #[default]
    Private,
    Public,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CreateRoom {
    pub session_id: String,
    pub player_id: String,
    #[serde(default)]
    pub display_name: Option<String>,
    #[serde(default)]
    pub room_code: Option<String>,
    #[serde(default)]
    pub round_duration_ms: Option<u64>,
    #[serde(default)]
    pub visibility: RoomVisibility,
}
impl CreateRoom {
    pub fn normalize(mut self) -> AppResult<Self> {
        session_hash(&self.session_id)?;
        validate_player_id(&self.player_id)?;
        self.display_name = Some(normalize_name(
            self.display_name.as_deref().unwrap_or("플레이어"),
        )?);
        if let Some(code) = &self.room_code {
            self.room_code = Some(normalize_code(code)?);
        }
        if ![90_000, 180_000, 300_000].contains(&self.round_duration_ms.unwrap_or(90_000)) {
            return Err(AppError::Invalid("Invalid round duration"));
        }
        Ok(self)
    }
}
#[derive(Clone, Serialize)]
#[serde(tag = "type", rename_all = "kebab-case")]
pub enum GameCommand {
    Join {
        display_name: String,
    },
    Ready {
        ready: bool,
        round_index: Option<u8>,
    },
    RoundReady {
        round_index: u8,
    },
    Start,
    AddAi,
    SetAiDifficulty {
        player_id: String,
        difficulty: AiDifficulty,
    },
    RemoveAi {
        player_id: String,
    },
    Party {
        party: Value,
    },
    Leave,
    Action {
        match_id: Uuid,
        assignment_revision: u64,
        turn: u64,
        action: Value,
    },
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Participant {
    pub player_id: String,
    pub display_name: String,
    pub session_hash: String,
    pub ai: bool,
    #[serde(default)]
    pub ai_difficulty: AiDifficulty,
    pub ready: bool,
    pub connected: bool,
    pub admitted: bool,
    pub disconnect_pending: bool,
    pub presence_until_ms: u64,
    pub joined_at_ms: u64,
    pub left_at_ms: Option<u64>,
}
impl Participant {
    pub fn human(input: &CreateRoom, now: u64) -> AppResult<Self> {
        Ok(Self {
            player_id: input.player_id.clone(),
            display_name: input
                .display_name
                .clone()
                .unwrap_or_else(|| "플레이어".into()),
            session_hash: session_hash(&input.session_id)?,
            ai: false,
            ai_difficulty: AiDifficulty::Easy,
            ready: true,
            connected: true,
            admitted: false,
            disconnect_pending: false,
            presence_until_ms: now + ADMISSION_MS,
            joined_at_ms: now,
            left_at_ms: None,
        })
    }
    pub fn public(&self) -> Value {
        let mut value = json!({"playerId":self.player_id,"displayName":self.display_name,"controller":if self.ai {"ai"} else {"human"},"role":"participant","ready":self.ready,"connected":self.connected&&self.admitted,"joinedAtMs":self.joined_at_ms});
        if self.ai {
            value["aiDifficulty"] = json!(self.ai_difficulty);
        }
        if let Some(left) = self.left_at_ms {
            value["leftAtMs"] = json!(left);
        }
        value
    }
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Round {
    pub index: u8,
    pub phase: String,
    pub duration_ms: u64,
    pub started_at_ms: Option<u64>,
    pub ends_at_ms: Option<u64>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Party {
    pub competitive_party: Value,
    pub updated_at_ms: u64,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Match {
    pub match_id: Uuid,
    pub bracket_match_id: String,
    pub assignment_revision: u64,
    pub seed: String,
    pub players: [String; 2],
    pub pack: BattlePack,
    pub turn_started_at_ms: u64,
    pub actions: BTreeMap<String, Value>,
    pub terminal_event_id: Option<Uuid>,
    pub terminal_room_revision: Option<u64>,
}
impl Match {
    pub fn completed(&self) -> bool {
        !self.pack.state["terminal"].is_null()
    }
    pub fn turn(&self) -> u64 {
        self.pack.state["turn"].as_u64().unwrap_or(0)
    }
    pub fn projection(&self) -> Value {
        json!({"matchId":self.match_id,"bracketMatchId":self.bracket_match_id,"kind":"tournament-unranked","assignmentRevision":self.assignment_revision,
            "rulesetVersion":3,"rulesetHash":ENGINE_VERSION.trim().rsplit(':').next().unwrap_or(""),"currentTurn":self.turn(),"turnEndsAtMs":self.turn_started_at_ms+TURN_MS,
            "status":if self.completed(){"completed"}else if self.actions.is_empty()&&self.turn()==0{"pending"}else{"active"},
            "terminalEventId":self.terminal_event_id,"terminalRoomRevision":self.terminal_room_revision,"playerIds":self.pack.state["participantIds"],
            "currentState":self.pack.public_state,"stateHash":self.pack.state_hash,"submittedPlayerIds":self.actions.keys().collect::<Vec<_>>(),"terminal":self.pack.state["terminal"]})
    }
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Room {
    pub schema_version: u32,
    pub storage_version: u64,
    pub room_instance_id: Uuid,
    pub room_code: String,
    pub public: bool,
    pub revision: u64,
    pub accepted_commands: u64,
    pub created_at_ms: u64,
    pub updated_at_ms: u64,
    pub hard_expires_at_ms: u64,
    pub lobby_ends_at_ms: u64,
    pub terminal_at_ms: Option<u64>,
    pub status: Status,
    pub close_reason: Option<String>,
    pub participants: Vec<Participant>,
    pub parties: BTreeMap<String, Party>,
    pub round: Round,
    pub bracket: Option<Bracket>,
    pub cumulative_scores: BTreeMap<String, u64>,
    pub final_standings: Vec<Value>,
    pub matches: BTreeMap<Uuid, Match>,
    pub adventures: BTreeMap<String, Value>,
    pub last_ai_step_ms: u64,
}
impl Room {
    pub fn new(input: CreateRoom, public: bool, now: u64) -> AppResult<Self> {
        let participant = Participant::human(&input, now)?;
        Ok(Self {
            schema_version: SCHEMA_VERSION,
            storage_version: 0,
            room_instance_id: Uuid::new_v4(),
            room_code: input.room_code.unwrap_or_else(|| {
                let random = Uuid::new_v4();
                random.as_bytes()[..6]
                    .iter()
                    .map(|byte| ROOM_CODE_ALPHABET[(*byte & 31) as usize] as char)
                    .collect()
            }),
            public,
            revision: 0,
            accepted_commands: 1,
            created_at_ms: now,
            updated_at_ms: now,
            hard_expires_at_ms: now + SESSION_MAX_MS,
            lobby_ends_at_ms: now + LOBBY_MAX_MS,
            terminal_at_ms: None,
            status: Status::Waiting,
            close_reason: None,
            participants: vec![participant],
            parties: BTreeMap::new(),
            round: Round {
                index: 1,
                phase: "waiting".into(),
                duration_ms: input.round_duration_ms.unwrap_or(90_000),
                started_at_ms: None,
                ends_at_ms: None,
            },
            bracket: None,
            cumulative_scores: BTreeMap::new(),
            final_standings: vec![],
            matches: BTreeMap::new(),
            adventures: BTreeMap::new(),
            last_ai_step_ms: 0,
        })
    }
    pub fn validate(&self, id: Uuid) -> AppResult<()> {
        if self.schema_version != SCHEMA_VERSION
            || self.room_instance_id != id
            || normalize_code(&self.room_code).ok().as_deref() != Some(&self.room_code)
            || self.participants.len() > MAX_PARTICIPANTS
            || self.matches.len() > 21
            || self.accepted_commands > MAX_COMMANDS
            || self.created_at_ms.checked_add(SESSION_MAX_MS) != Some(self.hard_expires_at_ms)
            || !(1..=3).contains(&self.round.index)
            || ![90_000, 180_000, 300_000].contains(&self.round.duration_ms)
        {
            return Err(AppError::Configuration("Invalid stored room invariants"));
        }
        let mut players = BTreeSet::new();
        let mut sessions = BTreeSet::new();
        for p in &self.participants {
            if !players.insert(&p.player_id)
                || !sessions.insert(&p.session_hash)
                || p.session_hash.len() != 64
            {
                return Err(AppError::Configuration("Invalid stored participants"));
            }
        }
        Ok(())
    }
    pub fn terminal(&self) -> bool {
        matches!(self.status, Status::Completed | Status::Closed)
    }
    pub fn retention_deadline(&self) -> u64 {
        match self.status {
            Status::Completed => {
                self.terminal_at_ms.unwrap_or(self.hard_expires_at_ms) + COMPLETED_RETENTION_MS
            }
            Status::Closed => {
                self.terminal_at_ms.unwrap_or(self.hard_expires_at_ms) + CLOSED_RETENTION_MS
            }
            _ => self.hard_expires_at_ms + COMPLETED_RETENTION_MS,
        }
    }
    pub fn receipt_deadline(&self) -> u64 {
        self.hard_expires_at_ms + COMPLETED_RETENTION_MS
    }
    pub fn active_deadline(&self) -> u64 {
        if self.status == Status::Waiting {
            self.lobby_ends_at_ms.min(self.hard_expires_at_ms)
        } else {
            self.hard_expires_at_ms
        }
    }
    pub fn authorize(&self, player: &str, session: &str) -> AppResult<usize> {
        self.participants
            .iter()
            .position(|p| p.player_id == player && p.session_hash == session && !p.ai)
            .ok_or(AppError::Forbidden)
    }
    pub fn host(&self) -> Option<&str> {
        self.participants
            .iter()
            .find(|p| !p.ai && p.connected)
            .map(|p| p.player_id.as_str())
    }
    pub fn touch(&mut self, now: u64) {
        self.revision += 1;
        self.updated_at_ms = now;
    }
    pub fn close(&mut self, now: u64, reason: &str) {
        if self.terminal() {
            return;
        }
        self.status = Status::Closed;
        self.close_reason = Some(reason.into());
        self.terminal_at_ms = Some(now);
        self.round.phase = "completed".into();
        self.round.ends_at_ms = None;
        self.touch(now);
    }
    pub fn prepare_clock(&mut self, now: u64) {
        if self.terminal() {
            return;
        }
        if now >= self.hard_expires_at_ms {
            self.close(now, "session-expired");
            return;
        }
        if self.status == Status::Waiting && now >= self.lobby_ends_at_ms {
            self.close(now, "lobby-expired");
            return;
        }
        let mut changed = false;
        for p in &mut self.participants {
            if !p.ai && p.connected && p.presence_until_ms <= now {
                p.connected = false;
                p.admitted = false;
                p.ready = false;
                p.left_at_ms = Some(now);
                changed = true;
            }
        }
        if self.status == Status::Waiting {
            let removed = self
                .participants
                .iter()
                .filter(|p| !p.connected)
                .map(|p| p.player_id.clone())
                .collect::<Vec<_>>();
            self.participants.retain(|p| p.connected);
            for id in removed {
                self.parties.remove(&id);
                self.adventures.remove(&id);
            }
        }
        if changed {
            self.touch(now);
        }
        if !self.participants.iter().any(|p| !p.ai && p.connected) {
            self.close(now, "no-human-participants");
            return;
        }
        if self.status == Status::RoundStarted
            && self.round.started_at_ms.is_some_and(|at| now < at)
            && self
                .participants
                .iter()
                .any(|p| !p.ai && (!p.connected || !p.admitted || p.disconnect_pending))
        {
            self.round.started_at_ms = None;
            self.round.ends_at_ms = None;
            for p in &mut self.participants {
                if !p.ai {
                    p.ready = false;
                }
            }
            self.touch(now);
        }
    }
    pub async fn apply(
        &mut self,
        command: GameCommand,
        player: &str,
        session: &str,
        now: u64,
        compute: &Compute,
    ) -> AppResult<Option<Value>> {
        if self.accepted_commands >= MAX_COMMANDS {
            return Err(AppError::CommandLimit);
        }
        if let GameCommand::Join { display_name } = &command {
            if self.terminal() {
                return Err(AppError::Closed);
            }
            if let Some(p) = self
                .participants
                .iter_mut()
                .find(|p| p.player_id == player || p.session_hash == session)
            {
                if p.player_id != player || p.session_hash != session || p.ai {
                    return Err(AppError::Forbidden);
                }
                if !p.connected && self.status != Status::Waiting {
                    return Err(AppError::Closed);
                }
                p.connected = true;
                p.presence_until_ms = now + PRESENCE_LEASE_MS;
            } else {
                if self.status != Status::Waiting {
                    return Err(AppError::Invalid("Room is not joinable"));
                }
                if self.participants.len() >= MAX_PARTICIPANTS {
                    return Err(AppError::RoomFull);
                }
                self.participants.push(Participant {
                    player_id: player.into(),
                    session_hash: session.into(),
                    display_name: normalize_name(display_name)?,
                    ai: false,
                    ai_difficulty: AiDifficulty::Easy,
                    ready: false,
                    connected: true,
                    admitted: false,
                    disconnect_pending: false,
                    presence_until_ms: now + ADMISSION_MS,
                    joined_at_ms: now,
                    left_at_ms: None,
                });
            }
            self.touch(now);
            return Ok(None);
        }
        let index = self.authorize(player, session)?;
        if self.terminal() && !matches!(command, GameCommand::Leave) {
            return Err(AppError::Closed);
        }
        if !self.participants[index].connected && !matches!(command, GameCommand::Leave) {
            return Err(AppError::Forbidden);
        }
        match command {
            GameCommand::Join { .. } => unreachable!(),
            GameCommand::Ready { ready, round_index } => {
                if let Some(round) = round_index {
                    if round != self.round.index || self.status != Status::RoundStarted || !ready {
                        return Err(AppError::Invalid("Field readiness is not due"));
                    }
                    if !self.participants[index].admitted || !self.parties.contains_key(player) {
                        return Err(AppError::Invalid("Choose a starter and connect first"));
                    }
                    if self.round.started_at_ms.is_some() {
                        return Ok(None);
                    }
                } else if self.status != Status::Waiting {
                    return Err(AppError::Invalid("Room is not waiting"));
                }
                self.participants[index].ready = ready;
                self.touch(now);
            }
            GameCommand::RoundReady { round_index } => {
                if self.round.index > round_index
                    || (self.round.index == round_index
                        && matches!(self.status, Status::Tournament | Status::Completed))
                {
                    return Ok(None);
                }
                if self.round.index != round_index
                    || self.status != Status::RoundStarted
                    || !self.round.ends_at_ms.is_some_and(|at| now >= at)
                    || !self.parties.contains_key(player)
                {
                    return Err(AppError::Invalid("Round readiness is not due"));
                }
                self.participants[index].ready = true;
                self.touch(now);
            }
            GameCommand::Start => {
                if self.status != Status::Waiting || self.host() != Some(player) {
                    return Err(AppError::Forbidden);
                }
                if self.participants.iter().any(|p| {
                    !p.connected || !p.admitted || p.disconnect_pending || (!p.ai && !p.ready)
                }) {
                    return Err(AppError::Invalid(
                        "All participants must connect and become ready",
                    ));
                }
                let target = if self.participants.len() < 4 { 4 } else { 8 };
                while self.participants.len() < target {
                    self.add_ai(now, compute).await?;
                }
                self.status = Status::RoundStarted;
                self.round.phase = "round-started".into();
                self.round.started_at_ms = None;
                self.round.ends_at_ms = None;
                for p in &mut self.participants {
                    p.ready = false;
                }
                self.touch(now);
            }
            GameCommand::AddAi => {
                if self.status != Status::Waiting || self.host() != Some(player) {
                    return Err(AppError::Forbidden);
                }
                self.add_ai(now, compute).await?;
            }
            GameCommand::SetAiDifficulty {
                player_id,
                difficulty,
            } => {
                if self.status != Status::Waiting || self.host() != Some(player) {
                    return Err(AppError::Forbidden);
                }
                let participant = self
                    .participants
                    .iter_mut()
                    .find(|p| p.player_id == player_id && p.ai)
                    .ok_or(AppError::Invalid("AI participant not found"))?;
                if participant.ai_difficulty != difficulty {
                    participant.ai_difficulty = difficulty;
                    self.touch(now);
                }
            }
            GameCommand::RemoveAi { player_id } => {
                if self.status != Status::Waiting || self.host() != Some(player) {
                    return Err(AppError::Forbidden);
                }
                if !self
                    .participants
                    .iter()
                    .any(|p| p.player_id == player_id && p.ai)
                {
                    return Err(AppError::Invalid("AI participant not found"));
                }
                self.participants.retain(|p| p.player_id != player_id);
                self.parties.remove(&player_id);
                self.adventures.remove(&player_id);
                self.touch(now);
            }
            GameCommand::Party { party } => {
                if self.status == Status::Tournament {
                    return Err(AppError::PartyLocked);
                }
                let value = compute
                    .run(
                        self.room_instance_id,
                        self.storage_version,
                        json!({"kind":"normalize-party","party":party,"restore":false}),
                    )
                    .await?;
                if self
                    .parties
                    .get(player)
                    .is_none_or(|old| old.competitive_party != value)
                {
                    self.parties.insert(
                        player.into(),
                        Party {
                            competitive_party: value,
                            updated_at_ms: now,
                        },
                    );
                    self.touch(now);
                }
            }
            GameCommand::Leave => {
                let p = &mut self.participants[index];
                p.connected = false;
                p.admitted = false;
                p.ready = false;
                p.left_at_ms = Some(now);
                if self.status == Status::Waiting {
                    self.participants.remove(index);
                    self.parties.remove(player);
                }
                self.touch(now);
                if !self.participants.iter().any(|p| !p.ai && p.connected) {
                    self.close(now, "no-human-participants");
                }
            }
            GameCommand::Action {
                match_id,
                assignment_revision,
                turn,
                action,
            } => {
                if self.status != Status::Tournament {
                    return Err(AppError::Invalid("Room has no active battle"));
                }
                let battle = self
                    .matches
                    .get(&match_id)
                    .ok_or(AppError::Invalid("Competitive match not found"))?;
                if battle.completed()
                    || battle.assignment_revision != assignment_revision
                    || battle.turn() != turn
                    || now >= battle.turn_started_at_ms + TURN_MS
                    || !battle.pack.required_player_ids.iter().any(|p| p == player)
                    || battle.actions.contains_key(player)
                {
                    return Err(AppError::ActionConflict);
                }
                compute.run(self.room_instance_id,self.storage_version,json!({"kind":"validate","state":battle.pack.state,"playerId":player,"action":action})).await?;
                self.matches
                    .get_mut(&match_id)
                    .ok_or(AppError::ActionConflict)?
                    .actions
                    .insert(player.into(), action);
                self.touch(now);
                self.resolve_if_due(match_id, now, compute).await?;
                return Ok(self.matches.get(&match_id).map(Match::projection));
            }
        }
        Ok(None)
    }
    async fn add_ai(&mut self, now: u64, compute: &Compute) -> AppResult<()> {
        if self.participants.len() >= MAX_PARTICIPANTS {
            return Err(AppError::RoomFull);
        }
        let id = format!("ai-{}", Uuid::new_v4());
        let seed = Uuid::new_v4().to_string();
        let party = compute
            .run(
                self.room_instance_id,
                self.storage_version,
                json!({"kind":"initial-party","seed":seed}),
            )
            .await?;
        let start_index = (Uuid::new_v4().as_u128() as usize) % AI_DISPLAY_NAMES.len();
        let display_name = (0..AI_DISPLAY_NAMES.len())
            .map(|offset| AI_DISPLAY_NAMES[(start_index + offset) % AI_DISPLAY_NAMES.len()])
            .find(|name| !self.participants.iter().any(|p| p.display_name == *name))
            .ok_or(AppError::Invalid("AI display name pool exhausted"))?;
        self.participants.push(Participant {
            player_id: id.clone(),
            display_name: display_name.to_owned(),
            session_hash: hash_bytes(Uuid::new_v4().as_bytes()),
            ai: true,
            ai_difficulty: AiDifficulty::Easy,
            ready: true,
            connected: true,
            admitted: true,
            disconnect_pending: false,
            presence_until_ms: self.hard_expires_at_ms,
            joined_at_ms: now,
            left_at_ms: None,
        });
        self.parties.insert(
            id,
            Party {
                competitive_party: party,
                updated_at_ms: now,
            },
        );
        self.touch(now);
        Ok(())
    }
    pub async fn advance_game(&mut self, now: u64, compute: &Compute) -> AppResult<()> {
        self.prepare_clock(now);
        if self.terminal() {
            return Ok(());
        }
        if self.status == Status::RoundStarted
            && self.round.started_at_ms.is_none()
            && self.participants.iter().all(|p| {
                p.connected
                    && p.admitted
                    && !p.disconnect_pending
                    && p.ready
                    && self.parties.contains_key(&p.player_id)
            })
        {
            self.round.started_at_ms = Some(now + 3_000);
            self.round.ends_at_ms = Some(now + 3_000 + self.round.duration_ms);
            for p in &mut self.participants {
                if !p.ai {
                    p.ready = false;
                }
            }
            self.touch(now);
        }
        if self.status == Status::RoundStarted
            && self.round.ends_at_ms.is_some_and(|at| now >= at)
            && self
                .participants
                .iter()
                .filter(|p| p.connected)
                .all(|p| p.ai || p.ready)
        {
            let participants = self
                .participants
                .iter()
                .filter(|p| p.connected)
                .enumerate()
                .map(|(i, p)| Entrant {
                    player_id: p.player_id.clone(),
                    display_name: p.display_name.clone(),
                    seed: i + 1,
                })
                .collect::<Vec<_>>();
            if participants.len() < 2 {
                self.close(now, "not-enough-participants");
                return Ok(());
            }
            for p in &participants {
                let party = self
                    .parties
                    .get(&p.player_id)
                    .ok_or(AppError::Invalid("Party is not ready"))?;
                let normalized=compute.run(self.room_instance_id,self.storage_version,json!({"kind":"normalize-party","party":party.competitive_party,"restore":true})).await?;
                self.parties.insert(
                    p.player_id.clone(),
                    Party {
                        competitive_party: normalized,
                        updated_at_ms: now,
                    },
                );
            }
            self.bracket = Some(Bracket::new(participants, self.round.index)?);
            self.status = Status::Tournament;
            self.round.phase = "tournament".into();
            self.touch(now);
        }
        if self.status != Status::Tournament {
            return Ok(());
        }
        self.ensure_matches(now, compute).await?;
        let ids = self.active_matches();
        for id in ids {
            let missing = self.matches[&id]
                .players
                .iter()
                .find(|id| {
                    !self
                        .participants
                        .iter()
                        .any(|p| &p.player_id == *id && p.connected)
                })
                .cloned();
            if let Some(loser) = missing {
                let m = &self.matches[&id];
                let pack = compute
                    .battle(
                        self.room_instance_id,
                        self.storage_version,
                        json!({"kind":"forfeit","state":m.pack.state,"loserPlayerId":loser}),
                        &m.players,
                    )
                    .await?;
                self.matches
                    .get_mut(&id)
                    .ok_or(AppError::ActionConflict)?
                    .pack = pack;
                self.finish_match(id, now)?;
            } else {
                let m = &self.matches[&id];
                if now >= m.turn_started_at_ms + 1_000 && now < m.turn_started_at_ms + TURN_MS {
                    let ais = m
                        .pack
                        .required_player_ids
                        .iter()
                        .filter(|id| {
                            !m.actions.contains_key(*id)
                                && self
                                    .participants
                                    .iter()
                                    .any(|p| p.player_id == **id && p.ai && p.connected)
                        })
                        .cloned()
                        .collect::<Vec<_>>();
                    for player in ais {
                        let difficulty = self
                            .participants
                            .iter()
                            .find(|p| p.player_id == player)
                            .map(|p| p.ai_difficulty)
                            .unwrap_or_default();
                        let decision_seed = format!(
                            "{}:{}:{}",
                            self.matches[&id].seed,
                            player,
                            self.matches[&id].turn()
                        );
                        let action=compute.run(self.room_instance_id,self.storage_version,json!({"kind":"choose-ai","state":self.matches[&id].pack.state,"playerId":player,"difficulty":difficulty,"seed":decision_seed})).await?;
                        self.matches
                            .get_mut(&id)
                            .ok_or(AppError::ActionConflict)?
                            .actions
                            .insert(player, action);
                        self.touch(now);
                    }
                }
                self.resolve_if_due(id, now, compute).await?;
            }
            if self.status != Status::Tournament {
                break;
            }
        }
        if self.status == Status::Tournament {
            self.ensure_matches(now, compute).await?;
        }
        Ok(())
    }
    async fn ensure_matches(&mut self, now: u64, compute: &Compute) -> AppResult<()> {
        let ready = self
            .bracket
            .as_ref()
            .map(Bracket::ready)
            .unwrap_or_default();
        for bracket in ready {
            if self
                .matches
                .values()
                .any(|m| m.bracket_match_id == bracket.match_id)
            {
                continue;
            }
            let mut players = bracket.participant_ids.clone();
            players.sort();
            let parties = players
                .iter()
                .map(|id| {
                    self.parties
                        .get(id)
                        .map(|p| json!({"playerId":id,"party":p.competitive_party}))
                        .ok_or(AppError::Invalid("Missing competitive party"))
                })
                .collect::<AppResult<Vec<_>>>()?;
            let seed = Uuid::new_v4().to_string();
            let id = Uuid::new_v4();
            let pack = compute
                .battle(
                    self.room_instance_id,
                    self.storage_version,
                    json!({"kind":"initialize","players":parties,"seed":seed}),
                    &players,
                )
                .await?;
            self.touch(now);
            self.matches.insert(
                id,
                Match {
                    match_id: id,
                    bracket_match_id: bracket.match_id,
                    assignment_revision: self.revision,
                    seed,
                    players,
                    pack,
                    turn_started_at_ms: now,
                    actions: BTreeMap::new(),
                    terminal_event_id: None,
                    terminal_room_revision: None,
                },
            );
        }
        Ok(())
    }
    async fn resolve_if_due(&mut self, id: Uuid, now: u64, compute: &Compute) -> AppResult<()> {
        let m = self.matches.get(&id).ok_or(AppError::ActionConflict)?;
        if m.completed() {
            return Ok(());
        }
        if now < m.turn_started_at_ms + TURN_MS
            && !m
                .pack
                .required_player_ids
                .iter()
                .all(|p| m.actions.contains_key(p))
        {
            return Ok(());
        }
        let pack = compute
            .battle(
                self.room_instance_id,
                self.storage_version,
                json!({"kind":"resolve","state":m.pack.state,"actions":m.actions,"seed":m.seed}),
                &m.players,
            )
            .await?;
        if pack.state["terminal"].is_null() && pack.state["turn"].as_u64().unwrap_or(0) <= m.turn()
        {
            return Err(AppError::ComputeUnavailable);
        }
        let m = self.matches.get_mut(&id).ok_or(AppError::ActionConflict)?;
        m.pack = pack;
        m.actions.clear();
        m.turn_started_at_ms = now;
        self.touch(now);
        if self.matches[&id].completed() {
            self.finish_match(id, now)?;
        }
        Ok(())
    }
    fn finish_match(&mut self, id: Uuid, now: u64) -> AppResult<()> {
        if self.status != Status::Tournament {
            return Err(AppError::Closed);
        }
        let m = self.matches.get_mut(&id).ok_or(AppError::ActionConflict)?;
        if m.terminal_event_id.is_some() {
            return Ok(());
        }
        let winner = m.pack.state["terminal"]["winnerPlayerId"]
            .as_str()
            .ok_or(AppError::ComputeUnavailable)?
            .to_owned();
        let reason = m.pack.state["terminal"]["reason"]
            .as_str()
            .ok_or(AppError::ComputeUnavailable)?
            .to_owned();
        if !m.players.contains(&winner)
            || !matches!(reason.as_str(), "faint" | "forfeit" | "timeout")
        {
            return Err(AppError::ComputeUnavailable);
        }
        self.revision += 1;
        self.updated_at_ms = now;
        m.terminal_event_id = Some(Uuid::new_v4());
        m.terminal_room_revision = Some(self.revision);
        let bracket = self
            .bracket
            .as_mut()
            .ok_or(AppError::Invalid("Missing bracket"))?;
        bracket.record(&m.bracket_match_id, &winner, &reason, now)?;
        if bracket.status == "completed" {
            for (player, score) in bracket.scores()? {
                *self.cumulative_scores.entry(player).or_default() += score;
            }
            if self.round.index < 3 {
                self.round.index += 1;
                self.bracket = None;
                self.status = Status::RoundStarted;
                self.round.phase = "round-started".into();
                self.round.started_at_ms = Some(now);
                self.round.ends_at_ms = Some(now + self.round.duration_ms);
                for p in &mut self.participants {
                    p.ready = false;
                }
            } else {
                self.status = Status::Completed;
                self.terminal_at_ms = Some(now);
                self.round.phase = "completed".into();
                self.round.ends_at_ms = None;
                let mut ranked = bracket
                    .participants
                    .iter()
                    .map(|p| {
                        (
                            p.clone(),
                            *self.cumulative_scores.get(&p.player_id).unwrap_or(&0),
                        )
                    })
                    .collect::<Vec<_>>();
                ranked.sort_by(|(a, sa), (b, sb)| sb.cmp(sa).then(a.seed.cmp(&b.seed)));
                let mut last = None;
                let mut rank = 0;
                self.final_standings=ranked.iter().enumerate().map(|(i,(p,score))|{if last!=Some(*score){rank=i+1;last=Some(*score);}json!({"playerId":p.player_id,"displayName":p.display_name,"score":score,"rank":rank})}).collect();
            }
        }
        Ok(())
    }
    pub async fn step_ai(&mut self, now: u64, compute: &Compute) -> AppResult<()> {
        if self.terminal() || self.status == Status::Waiting || now < self.last_ai_step_ms + 250 {
            return Ok(());
        }
        let ids = self
            .participants
            .iter()
            .filter(|p| p.connected)
            .map(|p| p.player_id.clone())
            .collect::<Vec<_>>();
        let starting = self.status == Status::RoundStarted
            && self.round.started_at_ms.is_none_or(|at| now < at);
        let gathering = self.status == Status::Tournament
            || self
                .round
                .ends_at_ms
                .is_some_and(|at| now >= at.saturating_sub(5_000));
        let jobs=self.participants.iter().filter(|p|p.ai&&p.connected).map(|p|{
            let id=p.player_id.clone();let difficulty=p.ai_difficulty;let party=self.parties.get(&id).map(|p|p.competitive_party.clone()).unwrap_or(Value::Null);
            let operation=json!({"kind":"ai-step","party":party,"adventure":self.adventures.get(&id),"nowMs":now,"roundIndex":self.round.index,"preparing":self.status==Status::RoundStarted&&!gathering&&!starting,"starting":starting,"gathering":gathering,"playerId":id,"playerIds":ids,"difficulty":difficulty,"startAtMs":self.round.started_at_ms,"roundDurationMs":self.round.duration_ms,"seed":format!("{}:{id}:{now}",self.room_instance_id)});
            let revision=self.storage_version;let room=self.room_instance_id;
            async move {compute.run(room,revision,operation).await.map(|value|(id,value))}
        });
        let results = futures_util::future::join_all(jobs).await;
        let mut failures = 0;
        for result in results {
            let (id, value) = match result {
                Ok(v) => v,
                Err(_) => {
                    failures += 1;
                    continue;
                }
            };
            if let Some(adventure) = value.get("adventure").filter(|v| v.is_object()) {
                self.adventures.insert(id.clone(), adventure.clone());
            } else {
                failures += 1;
                continue;
            }
            if self.status == Status::RoundStarted {
                if let Some(party) = value.get("party").filter(|p| !p.is_null())
                    && self
                        .parties
                        .get(&id)
                        .is_none_or(|p| &p.competitive_party != party)
                {
                    self.parties.insert(
                        id.clone(),
                        Party {
                            competitive_party: party.clone(),
                            updated_at_ms: now,
                        },
                    );
                    self.touch(now);
                }
                if starting
                    && let Some(p) = self
                        .participants
                        .iter_mut()
                        .find(|p| p.player_id == id && !p.ready)
                {
                    p.ready = true;
                    self.touch(now);
                }
            }
        }
        if failures > 0 {
            tracing::warn!(event="room.ai_step_failed",room_instance_id=%self.room_instance_id,failures);
        }
        self.last_ai_step_ms = now;
        Ok(())
    }
    pub fn active_matches(&self) -> Vec<Uuid> {
        if self.status != Status::Tournament {
            return Vec::new();
        }
        let ids = self
            .bracket
            .as_ref()
            .map(Bracket::ready)
            .unwrap_or_default()
            .into_iter()
            .map(|m| m.match_id)
            .collect::<BTreeSet<_>>();
        self.matches
            .values()
            .filter(|m| !m.completed() && ids.contains(&m.bracket_match_id))
            .map(|m| m.match_id)
            .collect()
    }
    pub fn snapshot(&self, after: Option<u64>) -> Value {
        let mut terminal = self
            .matches
            .values()
            .filter(|m| {
                m.terminal_room_revision
                    .is_some_and(|r| after.is_none_or(|a| r > a))
            })
            .collect::<Vec<_>>();
        terminal.sort_by_key(|m| (m.terminal_room_revision, m.terminal_event_id));
        let terminal = if after.is_none() {
            terminal
                .into_iter()
                .rev()
                .take(8)
                .collect::<Vec<_>>()
                .into_iter()
                .rev()
                .collect::<Vec<_>>()
        } else {
            terminal.into_iter().take(8).collect()
        };
        let assignments = self
            .active_matches()
            .iter()
            .filter_map(|id| self.matches.get(id))
            .map(Match::projection)
            .collect::<Vec<_>>();
        let ready = if self.status == Status::Tournament {
            self.bracket
                .as_ref()
                .map(Bracket::ready)
                .unwrap_or_default()
        } else {
            Vec::new()
        };
        let parties=self.parties.iter().filter_map(|(id,p)| {
            let members=p.competitive_party["members"].as_array()?;let active=members.iter().find(|m|m["slotIndex"]==p.competitive_party["activeSlotIndex"])?;
            Some((id.clone(),json!({"playerId":id,"displayName":self.participants.iter().find(|p|&p.player_id==id).map(|p|p.display_name.as_str()).unwrap_or(id),"representativePokemon":{"speciesId":active["speciesId"],"level":active["level"],"currentHp":active["currentHp"],"maxHp":active["maxHp"]},"partySize":members.len(),"updatedAtMs":p.updated_at_ms})))
        }).collect::<BTreeMap<_,_>>();
        let mut result = json!({"roomCode":self.room_code,"roomInstanceId":self.room_instance_id,"backend":"rust","visibility":if self.public{"public"}else{"private"},"status":self.status,"createdAtMs":self.created_at_ms,"updatedAtMs":self.updated_at_ms,"revision":self.revision,"expiresAtMs":if self.terminal(){self.retention_deadline()}else{self.hard_expires_at_ms},"hostPlayerId":self.host(),"participants":self.participants.iter().map(Participant::public).collect::<Vec<_>>(),"partySnapshots":parties,"round":self.round,"tournament":{"version":2,"bracket":self.bracket,"activeMatchId":ready.first().map(|m|m.match_id.as_str()),"activeMatchAuthority":if self.status==Status::Tournament{Some("server")}else{None},"cumulativeScores":self.cumulative_scores},"finalStandings":self.final_standings,"competitiveAssignments":assignments,"competitiveTransitions":terminal.iter().map(|m|json!({"terminalEventId":m.terminal_event_id,"terminalRoomRevision":m.terminal_room_revision,"projection":m.projection()})).collect::<Vec<_>>()});
        if let Some(projection) = assignments.first() {
            result["competitive"] = projection.clone();
        }
        if let Some(reason) = &self.close_reason {
            result["closeReason"] = json!(reason);
        }
        result
    }
    pub fn position(&self, player: &str, now: u64) -> Option<Value> {
        let starting = self.status == Status::RoundStarted
            && self.round.started_at_ms.is_none_or(|at| now < at);
        let gathering = self.status == Status::Tournament
            || self
                .round
                .ends_at_ms
                .is_some_and(|at| now >= at.saturating_sub(5_000));
        if !starting && !gathering {
            return None;
        }
        let mut ids = self
            .participants
            .iter()
            .map(|p| p.player_id.as_str())
            .collect::<Vec<_>>();
        ids.sort();
        let i = ids.iter().position(|id| *id == player)?;
        Some(
            json!({"map":"town","x":592+(i%4)*32,"y":304+if starting{64}else{0}+(i/4)*32,"facing":if starting{"front"}else{"back"}}),
        )
    }
}
pub fn normalize_name(value: &str) -> AppResult<String> {
    let value = value.trim();
    if value.is_empty() || value.chars().count() > 24 || value.chars().any(char::is_control) {
        return Err(AppError::Invalid("Name must contain 1..24 characters"));
    }
    Ok(value.into())
}
pub fn normalize_code(value: &str) -> AppResult<String> {
    let code = value.trim().to_ascii_uppercase();
    if code.len() != 6 || !code.bytes().all(|b| b.is_ascii_alphanumeric()) {
        return Err(AppError::Invalid("Invalid room code"));
    }
    Ok(code)
}
pub fn validate_player_id(value: &str) -> AppResult<()> {
    if value.is_empty()
        || value.len() > 80
        || value.starts_with("ai-")
        || !value
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
    {
        return Err(AppError::Invalid("Invalid player ID"));
    }
    Ok(())
}
pub fn session_hash(value: &str) -> AppResult<String> {
    if value.len() < 24
        || value.len() > 128
        || !value
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
    {
        return Err(AppError::Unauthorized);
    }
    Ok(hash_bytes(value.as_bytes()))
}
