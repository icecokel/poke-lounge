/** Rust 서버 응답의 단일 TS 정의. 원본은 domain.rs의 snapshot/public/projection/progression_snapshot. 바꾸면 `pnpm check:rust-room-contract`. */
import type { AiDifficulty } from "@poke-lounge/battle/ai-difficulty";
import type { StarterMode } from "@poke-lounge/battle/starter-selection";
import type { BattleStatStages } from "@poke-lounge/battle/battle-stat-stages";
import type { ResolvedTurnPresentation } from "@poke-lounge/battle/battle-presentation";
import type { NormalizedCompetitiveParty } from "@poke-lounge/battle/competitive-party";
import type { Gen4ActionRequest, Gen4Status } from "@poke-lounge/battle/gen4/types";
import type { TournamentBracketState } from "@poke-lounge/battle/tournament-bracket";

/** Top-level keys of Room::snapshot json! in domain.rs. Checked by scripts/check-rust-room-contract.mjs. */
export const RUST_ROOM_SNAPSHOT_KEYS = [
  "roomCode",
  "roomInstanceId",
  "backend",
  "starterMode",
  "visibility",
  "status",
  "createdAtMs",
  "updatedAtMs",
  "revision",
  "expiresAtMs",
  "hostPlayerId",
  "participants",
  "partySnapshots",
  "round",
  "tournament",
  "finalStandings",
  "competitiveAssignments",
  "competitiveTransitions",
] as const;

/** Keys conditionally added by Room::snapshot; excludes Actor/progression response additions. */
export const RUST_ROOM_SNAPSHOT_OPTIONAL_KEYS = ["competitive", "closeReason"] as const;

/** Always-present keys of Participant::public json!. */
export const RUST_PARTICIPANT_KEYS = [
  "playerId",
  "displayName",
  "controller",
  "role",
  "ready",
  "connected",
  "joinedAtMs",
] as const;

export const RUST_PARTICIPANT_OPTIONAL_KEYS = ["aiDifficulty", "leftAtMs"] as const;

export type RustRoomCloseReason =
  "session-expired" | "lobby-expired" | "no-human-participants" | "not-enough-participants";

export interface RustRoomParticipant {
  playerId: string;
  displayName: string;
  controller: "human" | "ai";
  role: "participant";
  ready: boolean;
  connected: boolean;
  joinedAtMs: number;
  aiDifficulty?: AiDifficulty;
  leftAtMs?: number;
}

export interface RustRoomRound {
  index: number;
  phase: "waiting" | "round-started" | "tournament" | "completed";
  durationMs: number;
  startedAtMs: number | null;
  endsAtMs: number | null;
}

export interface RustRoomTournament {
  version: 2;
  bracket: TournamentBracketState | null;
  activeMatchId: string | null;
  activeMatchAuthority: "server" | null;
  cumulativeScores: Record<string, number>;
}

export interface RustPartySnapshotSummary {
  playerId: string;
  displayName: string;
  representativePokemon: {
    speciesId: number;
    level: number;
    currentHp: number;
    maxHp: number;
  };
  partySize: number;
  updatedAtMs: number;
}

export interface RustFinalStanding {
  playerId: string;
  displayName: string;
  rank: number;
  score: number;
}

export interface RustCompetitiveTerminal {
  winnerPlayerId: string;
  loserPlayerId: string;
  reason: "faint" | "forfeit" | "timeout";
  scoreByPlayerId: Record<string, 50 | 100>;
}

/** Public battle state forwarded by Match::projection from the battle worker. */
export interface RustCompetitiveBattleState {
  rulesetVersion: 2 | 3;
  turn: number;
  participantIds: string[];
  playersById: Record<
    string,
    {
      playerId: string;
      activeSlotIndex: number;
      actionRequest?: Gen4ActionRequest;
      team: Array<{
        speciesId: number;
        slotIndex: number;
        level: number;
        experience?: number;
        experienceGained?: number;
        previousLevel?: number;
        maxHp: number;
        currentHp: number;
        status: Gen4Status;
        statStages: BattleStatStages;
        moves: Array<{ moveId: number; pp: number }>;
      }>;
    }
  >;
  terminal: RustCompetitiveTerminal | null;
  lastTurnPresentation?: ResolvedTurnPresentation;
}

export interface RustCompetitiveProjection {
  matchId: string;
  bracketMatchId: string;
  kind: "tournament-unranked";
  assignmentRevision: number;
  rulesetVersion: 3;
  rulesetHash: string;
  currentTurn: number;
  turnEndsAtMs: number;
  status: "pending" | "active" | "completed";
  terminalEventId: string | null;
  terminalRoomRevision: number | null;
  progressionEndsAtMs: number | null;
  playerIds: string[];
  currentState: RustCompetitiveBattleState;
  stateHash: string;
  submittedPlayerIds: string[];
  terminal: RustCompetitiveTerminal | null;
}

export interface RustCompetitiveTransition {
  terminalEventId: string;
  terminalRoomRevision: number;
  projection: RustCompetitiveProjection;
}

export interface RustCompetitiveAction {
  kind: "move" | "switch" | "continue";
  moveId?: number | string;
  slotIndex?: number;
}

export interface RustRoomSnapshot {
  roomCode: string;
  roomInstanceId: string;
  backend: "rust";
  starterMode: StarterMode;
  visibility: "public" | "private";
  status: "waiting" | "round-started" | "tournament" | "completed" | "closed";
  createdAtMs: number;
  updatedAtMs: number;
  revision: number;
  expiresAtMs: number;
  hostPlayerId: string | null;
  participants: RustRoomParticipant[];
  partySnapshots: Record<string, RustPartySnapshotSummary>;
  round: RustRoomRound;
  tournament: RustRoomTournament;
  finalStandings: RustFinalStanding[];
  competitiveAssignments: RustCompetitiveProjection[];
  competitiveTransitions: RustCompetitiveTransition[];
  competitive?: RustCompetitiveProjection;
  closeReason?: RustRoomCloseReason;
  /** Added by Actor::snapshot for HTTP/socket delivery. */
  serverNowMs?: number;
}

export type RustProgressionSnapshot = RustRoomSnapshot & {
  progressionParty: NormalizedCompetitiveParty;
  serverNowMs: number;
};
