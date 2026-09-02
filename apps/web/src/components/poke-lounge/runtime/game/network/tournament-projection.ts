import type { components } from "@/types/api";
import type {
  TournamentBye,
  TournamentElimination,
  TournamentMatch,
  TournamentParticipant,
  TournamentRound,
  TournamentRoundSlot,
} from "@poke-lounge/battle/tournament-bracket";
import type { TournamentState } from "../tournament/tournament-state";

type ApiTournamentState = components["schemas"]["PokeLoungeTournamentDto"];
type ApiRoomStatus = components["schemas"]["PokeLoungeRoomResponseDto"]["status"];
type ApiRoomParticipant = components["schemas"]["PokeLoungeRoomParticipantDto"];
type ApiRoomRound = components["schemas"]["PokeLoungeRoundDto"];

const MAX_PARTICIPANTS = 6;
const MAX_BRACKET_ROUNDS = 4;
const MAX_ROUND_ENTRIES = 4;
const MAX_ID_LENGTH = 128;
const MAX_DISPLAY_NAME_LENGTH = 80;

export type TournamentResultReason = "faint" | "timeout" | "forfeit" | "run" | "capture";

export type TournamentProjectionMatch = TournamentMatch;
export type TournamentProjectionRound = TournamentRound;
export type TournamentBracketProjection = TournamentState;

export interface ServerTournamentState {
  version: ApiTournamentState["version"];
  bracket: TournamentBracketProjection | null;
  activeMatchId: string | null;
  activeMatchAuthority: ApiTournamentState["activeMatchAuthority"];
  cumulativeScores: Record<string, number>;
}

export type TournamentMatchTransport = "casual" | "authority" | "awaiting-authority";
export type TournamentResultSyncStatus = "idle" | "submitting" | "recovering" | "error";
export type TournamentCompetitionKind =
  "ranked-head-to-head" | "tournament-unranked" | "casual-unranked" | null;

export interface TournamentRoomParticipant {
  playerId: string;
  displayName: string;
  controller?: ApiRoomParticipant["controller"];
  role: ApiRoomParticipant["role"];
  ready: boolean;
  partyReady: boolean;
  connected: boolean;
  seed: number | null;
}

export interface TournamentRoomRound {
  index: number;
  phase: ApiRoomRound["phase"];
  durationMs: number;
  startedAtMs: number | null;
  endsAtMs: number | null;
}

export interface TournamentStateRoomPayload {
  revision: number;
  roomCode: string;
  hostPlayerId: string | null;
  roundIndex: number;
  roomStatus: ApiRoomStatus;
  roomRound: TournamentRoomRound;
  participants: TournamentRoomParticipant[];
  tournament: ServerTournamentState;
  ownPlayerId: string;
  activeMatchTransport: TournamentMatchTransport;
  competitionKind: TournamentCompetitionKind;
  finalStandings: Array<{
    playerId: string;
    displayName: string;
    rank: number;
    score: number;
  }>;
  resultSync: {
    matchId: string | null;
    status: TournamentResultSyncStatus;
  };
}

export function isRoundReadinessDue(
  roomStatus: TournamentStateRoomPayload["roomStatus"],
  round: Pick<TournamentRoomRound, "phase" | "endsAtMs">,
  nowMs: number,
): boolean {
  return (
    roomStatus === "round-started" &&
    round.phase === "round-started" &&
    round.endsAtMs !== null &&
    nowMs >= round.endsAtMs
  );
}

export class TournamentProjectionSchemaError extends Error {
  constructor() {
    super("Poke Lounge tournament projection is malformed");
  }
}

export function parseServerTournamentState(
  value: unknown,
  expectedGameRoundIndex: number,
): ServerTournamentState {
  const tournament = requireRecord(value);

  if (tournament.version !== 2) {
    throw new TournamentProjectionSchemaError();
  }

  const bracket =
    tournament.bracket === null
      ? null
      : parseTournamentBracket(tournament.bracket, expectedGameRoundIndex);
  const activeMatchId = parseOptionalId(tournament.activeMatchId);
  const activeMatchAuthority = parseActiveMatchAuthority(tournament.activeMatchAuthority);
  const cumulativeScores = parseCumulativeScores(tournament.cumulativeScores, bracket);
  const activeMatch = findCurrentMatch(bracket, activeMatchId);

  if (activeMatchId && activeMatch?.status !== "ready") {
    throw new TournamentProjectionSchemaError();
  }

  if (bracket?.status === "completed" && activeMatchId !== null) {
    throw new TournamentProjectionSchemaError();
  }

  if ((activeMatchId === null) !== (activeMatchAuthority === null)) {
    throw new TournamentProjectionSchemaError();
  }

  return {
    version: 2,
    bracket,
    activeMatchId,
    activeMatchAuthority,
    cumulativeScores,
  };
}

export function mapServerTournamentPlayerIds(
  tournament: ServerTournamentState,
  mapPlayerId: (playerId: string) => string,
): ServerTournamentState {
  const bracket = tournament.bracket;

  if (!bracket) {
    return {
      ...tournament,
      cumulativeScores: Object.fromEntries(
        Object.entries(tournament.cumulativeScores).map(function mapItem([playerId, score]) {
          return [mapPlayerId(playerId), score];
        }),
      ),
    };
  }

  const participants = bracket.participants.map(function mapItem(participant) {
    return {
      ...participant,
      playerId: mapPlayerId(participant.playerId),
    };
  });
  const participantsById = new Map(
    bracket.participants.map(function mapItem(participant, index) {
      return [participant.playerId, participants[index]];
    }),
  );
  const mapParticipant = (participant: TournamentParticipant): TournamentParticipant => {
    const mapped = participantsById.get(participant.playerId);

    if (!mapped) {
      throw new TournamentProjectionSchemaError();
    }

    return mapped;
  };
  const mapRound = (round: TournamentProjectionRound): TournamentProjectionRound => ({
    ...round,
    matches: round.matches.map(function mapItem(match) {
      return {
        ...match,
        participantA: mapParticipant(match.participantA),
        participantB: mapParticipant(match.participantB),
        participantIds: [
          mapPlayerId(match.participantIds[0]),
          mapPlayerId(match.participantIds[1]),
        ],
        winnerPlayerId: match.winnerPlayerId ? mapPlayerId(match.winnerPlayerId) : null,
        loserPlayerId: match.loserPlayerId ? mapPlayerId(match.loserPlayerId) : null,
      };
    }),
    byes: round.byes.map(function mapItem(bye) {
      return {
        ...bye,
        entrant: mapParticipant(bye.entrant),
      };
    }),
    slots: round.slots.map(function mapItem(slot) {
      return { ...slot };
    }),
  });

  return {
    ...tournament,
    bracket: {
      ...bracket,
      participants,
      currentRound: bracket.currentRound ? mapRound(bracket.currentRound) : null,
      completedRounds: bracket.completedRounds.map(mapRound),
      eliminations: bracket.eliminations.map(function mapItem(elimination) {
        return {
          ...elimination,
          playerId: mapPlayerId(elimination.playerId),
        };
      }),
      championPlayerId: bracket.championPlayerId ? mapPlayerId(bracket.championPlayerId) : null,
    },
    cumulativeScores: Object.fromEntries(
      Object.entries(tournament.cumulativeScores).map(function mapItem([playerId, score]) {
        return [mapPlayerId(playerId), score];
      }),
    ),
  };
}

export function findCurrentMatch(
  bracket: TournamentBracketProjection | null,
  matchId: string | null,
): TournamentProjectionMatch | null {
  if (!bracket?.currentRound || !matchId) {
    return null;
  }

  return (
    bracket.currentRound.matches.find(function findItem(match) {
      return match.matchId === matchId;
    }) ?? null
  );
}

function parseTournamentBracket(
  value: unknown,
  expectedGameRoundIndex: number,
): TournamentBracketProjection {
  const bracket = requireRecord(value);

  if (
    bracket.version !== 1 ||
    bracket.gameRoundIndex !== expectedGameRoundIndex ||
    (bracket.status !== "in-progress" && bracket.status !== "completed")
  ) {
    throw new TournamentProjectionSchemaError();
  }

  const participants = parseParticipants(bracket.participants);
  const participantsById = new Map(
    participants.map(function mapItem(participant) {
      return [participant.playerId, participant];
    }),
  );
  const currentRound =
    bracket.currentRound === null
      ? null
      : parseRound(bracket.currentRound, participantsById, false);

  if (
    !Array.isArray(bracket.completedRounds) ||
    bracket.completedRounds.length > MAX_BRACKET_ROUNDS
  ) {
    throw new TournamentProjectionSchemaError();
  }

  const completedRounds = bracket.completedRounds.map(function mapItem(round) {
    return parseRound(round, participantsById, true);
  });
  const eliminations = parseEliminations(bracket.eliminations, participantsById);
  const championPlayerId = parseOptionalId(bracket.championPlayerId);
  const completedRoundOrderValid = completedRounds.every(function testItem(round, index) {
    return round.roundNumber === index + 1;
  });

  if (
    !completedRoundOrderValid ||
    (currentRound !== null && currentRound.roundNumber !== completedRounds.length + 1) ||
    (bracket.status === "in-progress" && (!currentRound || championPlayerId !== null)) ||
    (bracket.status === "completed" &&
      (currentRound !== null ||
        !championPlayerId ||
        !participantsById.has(championPlayerId) ||
        eliminations.length !== participants.length - 1 ||
        eliminations.some(function testItem(elimination) {
          return elimination.playerId === championPlayerId;
        })))
  ) {
    throw new TournamentProjectionSchemaError();
  }

  return {
    version: 1,
    gameRoundIndex: expectedGameRoundIndex,
    status: bracket.status,
    participants,
    currentRound,
    completedRounds,
    eliminations,
    championPlayerId,
  };
}

function parseParticipants(value: unknown): TournamentParticipant[] {
  if (!Array.isArray(value) || value.length < 2 || value.length > MAX_PARTICIPANTS) {
    throw new TournamentProjectionSchemaError();
  }

  const playerIds = new Set<string>();
  const seeds = new Set<number>();

  return value.map(function mapItem(item) {
    const participant = requireRecord(item);
    const playerId = parseId(participant.playerId);
    const displayName = parseDisplayName(participant.displayName);
    const seed = parsePositiveInteger(participant.seed);

    if (playerIds.has(playerId) || seeds.has(seed)) {
      throw new TournamentProjectionSchemaError();
    }

    playerIds.add(playerId);
    seeds.add(seed);

    return { playerId, displayName, seed };
  });
}

function parseRound(
  value: unknown,
  participantsById: ReadonlyMap<string, TournamentParticipant>,
  requireCompleted: boolean,
): TournamentProjectionRound {
  const round = requireRecord(value);
  const roundNumber = parsePositiveInteger(round.roundNumber);

  if (
    !Array.isArray(round.matches) ||
    !Array.isArray(round.byes) ||
    !Array.isArray(round.slots) ||
    round.matches.length > MAX_ROUND_ENTRIES ||
    round.byes.length > MAX_ROUND_ENTRIES ||
    round.slots.length < 1 ||
    round.slots.length > MAX_ROUND_ENTRIES ||
    round.slots.length !== round.matches.length + round.byes.length
  ) {
    throw new TournamentProjectionSchemaError();
  }

  const matches = round.matches.map(function mapItem(item) {
    return parseMatch(item, roundNumber, participantsById, requireCompleted);
  });
  const byes = round.byes.map(function mapItem(item) {
    return parseBye(item, roundNumber, participantsById);
  });
  const slots = round.slots.map(parseSlot);
  const matchIds = new Set(
    matches.map(function mapItem(match) {
      return match.matchId;
    }),
  );
  const byeIds = new Set(
    byes.map(function mapItem(bye) {
      return bye.byeId;
    }),
  );
  const matchNumbers = new Set(
    matches.map(function mapItem(match) {
      return match.matchNumber;
    }),
  );
  const byeSlotNumbers = new Set(
    byes.map(function mapItem(bye) {
      return bye.slotNumber;
    }),
  );
  const entrantPlayerIds = [
    ...matches.flatMap(function mapItem(match) {
      return match.participantIds;
    }),
    ...byes.map(function mapItem(bye) {
      return bye.entrant.playerId;
    }),
  ];

  if (
    matchIds.size !== matches.length ||
    byeIds.size !== byes.length ||
    matchNumbers.size !== matches.length ||
    byeSlotNumbers.size !== byes.length ||
    new Set(entrantPlayerIds).size !== entrantPlayerIds.length ||
    new Set(
      slots.map(function mapItem(slot) {
        return slot.kind === "match" ? slot.matchId : slot.byeId;
      }),
    ).size !== slots.length ||
    slots.some(function testItem(slot) {
      return slot.kind === "match" ? !matchIds.has(slot.matchId) : !byeIds.has(slot.byeId);
    })
  ) {
    throw new TournamentProjectionSchemaError();
  }

  return { roundNumber, matches, byes, slots };
}

function parseMatch(
  value: unknown,
  expectedRoundNumber: number,
  participantsById: ReadonlyMap<string, TournamentParticipant>,
  requireCompleted: boolean,
): TournamentProjectionMatch {
  const match = requireRecord(value);
  const matchId = parseId(match.matchId);
  const roundNumber = parsePositiveInteger(match.roundNumber);
  const matchNumber = parsePositiveInteger(match.matchNumber);
  const participantA = parseParticipantReference(match.participantA, participantsById);
  const participantB = parseParticipantReference(match.participantB, participantsById);

  if (
    roundNumber !== expectedRoundNumber ||
    participantA.playerId === participantB.playerId ||
    !Array.isArray(match.participantIds) ||
    match.participantIds.length !== 2 ||
    match.participantIds[0] !== participantA.playerId ||
    match.participantIds[1] !== participantB.playerId ||
    (match.status !== "ready" && match.status !== "completed") ||
    (requireCompleted && match.status !== "completed")
  ) {
    throw new TournamentProjectionSchemaError();
  }

  const winnerPlayerId = parseOptionalId(match.winnerPlayerId);
  const loserPlayerId = parseOptionalId(match.loserPlayerId);
  const participantIds = [participantA.playerId, participantB.playerId] as const;

  if (
    (match.status === "ready" && (winnerPlayerId !== null || loserPlayerId !== null)) ||
    (match.status === "completed" &&
      (!winnerPlayerId ||
        !loserPlayerId ||
        winnerPlayerId === loserPlayerId ||
        !(participantIds as readonly string[]).includes(winnerPlayerId) ||
        !(participantIds as readonly string[]).includes(loserPlayerId)))
  ) {
    throw new TournamentProjectionSchemaError();
  }

  const resultReason = parseResultReason(match.resultReason);
  const completedAtMs = parseTimestamp(match.completedAtMs);

  if (
    (match.status === "ready" && (resultReason !== null || completedAtMs !== null)) ||
    (resultReason === null) !== (completedAtMs === null)
  ) {
    throw new TournamentProjectionSchemaError();
  }

  return {
    matchId,
    roundNumber,
    matchNumber,
    participantA,
    participantB,
    participantIds: [participantA.playerId, participantB.playerId],
    status: match.status,
    winnerPlayerId,
    loserPlayerId,
    resultReason,
    completedAtMs,
  };
}

function parseBye(
  value: unknown,
  expectedRoundNumber: number,
  participantsById: ReadonlyMap<string, TournamentParticipant>,
): TournamentBye {
  const bye = requireRecord(value);
  const roundNumber = parsePositiveInteger(bye.roundNumber);

  if (roundNumber !== expectedRoundNumber) {
    throw new TournamentProjectionSchemaError();
  }

  return {
    byeId: parseId(bye.byeId),
    roundNumber,
    slotNumber: parsePositiveInteger(bye.slotNumber),
    entrant: parseParticipantReference(bye.entrant, participantsById),
  };
}

function parseSlot(value: unknown): TournamentRoundSlot {
  const slot = requireRecord(value);

  if (slot.kind === "match") {
    return { kind: "match", matchId: parseId(slot.matchId) };
  }

  if (slot.kind === "bye") {
    return { kind: "bye", byeId: parseId(slot.byeId) };
  }

  throw new TournamentProjectionSchemaError();
}

function parseEliminations(
  value: unknown,
  participantsById: ReadonlyMap<string, TournamentParticipant>,
): TournamentElimination[] {
  if (!Array.isArray(value) || value.length > participantsById.size - 1) {
    throw new TournamentProjectionSchemaError();
  }

  const eliminatedPlayerIds = new Set<string>();

  return value.map(function mapItem(item) {
    const elimination = requireRecord(item);
    const playerId = parseId(elimination.playerId);
    const participant = participantsById.get(playerId);

    if (
      !participant ||
      eliminatedPlayerIds.has(playerId) ||
      elimination.displayName !== participant.displayName ||
      elimination.seed !== participant.seed
    ) {
      throw new TournamentProjectionSchemaError();
    }

    eliminatedPlayerIds.add(playerId);

    return {
      playerId,
      displayName: participant.displayName,
      seed: participant.seed,
      roundNumber: parsePositiveInteger(elimination.roundNumber),
      matchId: parseId(elimination.matchId),
      order: parsePositiveInteger(elimination.order),
    };
  });
}

function parseParticipantReference(
  value: unknown,
  participantsById: ReadonlyMap<string, TournamentParticipant>,
): TournamentParticipant {
  const participant = requireRecord(value);
  const playerId = parseId(participant.playerId);
  const canonical = participantsById.get(playerId);

  if (
    !canonical ||
    participant.displayName !== canonical.displayName ||
    participant.seed !== canonical.seed
  ) {
    throw new TournamentProjectionSchemaError();
  }

  return canonical;
}

function parseCumulativeScores(
  value: unknown,
  bracket: TournamentBracketProjection | null,
): Record<string, number> {
  const scores = requireRecord(value);
  const participantIds = new Set(
    bracket?.participants.map(function mapItem(participant) {
      return participant.playerId;
    }),
  );
  const entries = Object.entries(scores);

  if (entries.length > MAX_PARTICIPANTS) {
    throw new TournamentProjectionSchemaError();
  }

  return Object.fromEntries(
    entries.map(function mapItem([playerId, score]) {
      if (
        !parseId(playerId) ||
        (bracket && !participantIds.has(playerId)) ||
        typeof score !== "number" ||
        !Number.isFinite(score) ||
        score < 0
      ) {
        throw new TournamentProjectionSchemaError();
      }

      return [playerId, score];
    }),
  );
}

function parseId(value: unknown): string {
  if (typeof value !== "string") {
    throw new TournamentProjectionSchemaError();
  }

  const id = value.trim();

  if (!id || id.length > MAX_ID_LENGTH) {
    throw new TournamentProjectionSchemaError();
  }

  return id;
}

function parseOptionalId(value: unknown): string | null {
  return value === null ? null : parseId(value);
}

function parseDisplayName(value: unknown): string {
  if (typeof value !== "string") {
    throw new TournamentProjectionSchemaError();
  }

  const displayName = value.trim();

  if (!displayName || displayName.length > MAX_DISPLAY_NAME_LENGTH) {
    throw new TournamentProjectionSchemaError();
  }

  return displayName;
}

function parsePositiveInteger(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new TournamentProjectionSchemaError();
  }

  return value;
}

function parseTimestamp(value: unknown): number | null {
  if (value === null) {
    return null;
  }

  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new TournamentProjectionSchemaError();
  }

  return value;
}

function parseResultReason(value: unknown): TournamentResultReason | null {
  if (value === null) {
    return null;
  }

  if (
    value !== "faint" &&
    value !== "timeout" &&
    value !== "forfeit" &&
    value !== "run" &&
    value !== "capture"
  ) {
    throw new TournamentProjectionSchemaError();
  }

  return value;
}

function parseActiveMatchAuthority(value: unknown): "casual" | "server" | null {
  if (value === null || value === "casual" || value === "server") {
    return value;
  }

  throw new TournamentProjectionSchemaError();
}

function requireRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TournamentProjectionSchemaError();
  }

  return value as Record<string, unknown>;
}
