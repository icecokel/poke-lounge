import {
  COMPETITIVE_RULESET_HASH,
  COMPETITIVE_RULESET_VERSION,
} from "@poke-lounge/battle/competitive-ruleset-config";
import type {
  CompetitiveProjection,
  CompetitiveProjectionParseResult,
  CompetitiveRoomSnapshotContract,
  CompetitiveTerminalMetadataState,
  CompetitiveTerminalTransition,
} from "./local-preview-room";

const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const BRACKET_MATCH_ID_PATTERN = /^game-round-[1-9]\d*-bracket-[1-9]\d*-match-[1-9]\d*$/;
const HASH_PATTERN = /^[0-9a-f]{64}$/;
const PLAYER_ID_MAX_LENGTH = 256;
const MAX_COMPETITIVE_PROJECTION_DEPTH = 6;
const MAX_COMPETITIVE_RECORD_KEYS = 16;
const MAX_COMPETITIVE_ARRAY_ITEMS = 2;
const MAX_COMPETITIVE_TEAM_ITEMS = 6;
const MAX_COMPETITIVE_TRANSITIONS = 8;
const MAX_COMPETITIVE_ASSIGNMENTS = 4;
const MAX_ROOM_SNAPSHOT_KEYS = 32;

const COMPETITIVE_PROJECTION_KEYS = [
  "assignmentRevision",
  "bracketMatchId",
  "currentState",
  "currentTurn",
  "turnEndsAtMs",
  "kind",
  "matchId",
  "playerIds",
  "rulesetHash",
  "rulesetVersion",
  "stateHash",
  "status",
  "submittedPlayerIds",
  "terminal",
] as const;
const COMPETITIVE_TERMINAL_METADATA_KEYS = ["terminalEventId", "terminalRoomRevision"] as const;

type CompetitiveTerminal = NonNullable<CompetitiveProjection["terminal"]>;

export class CompetitiveProjectionSchemaError extends Error {
  constructor() {
    super("Poke Lounge competitive projection is malformed");
  }
}

export function parseCompetitiveProjection(value: unknown): CompetitiveProjection {
  return parseCompetitiveProjectionContract(value).projection;
}

export function parseCompetitiveProjectionContract(
  value: unknown,
): CompetitiveProjectionParseResult {
  const projection = requireCompetitiveProjectionRecord(value);
  const matchId = requireString(projection.matchId);
  const bracketMatchId = requireString(projection.bracketMatchId);
  const kind = projection.kind;
  const assignmentRevision = requireNonnegativeSafeInteger(projection.assignmentRevision);
  const currentTurn = requireNonnegativeSafeInteger(projection.currentTurn);
  const turnEndsAtMs = requireNonnegativeSafeInteger(projection.turnEndsAtMs);
  const rulesetVersion = projection.rulesetVersion;
  const rulesetHash = requireString(projection.rulesetHash);
  const stateHash = requireHash(projection.stateHash);
  const status = projection.status;
  const playerIds = parsePlayerIds(projection.playerIds);
  const submittedPlayerIds = parseSubmittedPlayerIds(projection.submittedPlayerIds, playerIds);

  if (
    !UUID_V4_PATTERN.test(matchId) ||
    !BRACKET_MATCH_ID_PATTERN.test(bracketMatchId) ||
    (kind !== "ranked-head-to-head" && kind !== "tournament-unranked") ||
    rulesetVersion !== COMPETITIVE_RULESET_VERSION ||
    rulesetHash !== COMPETITIVE_RULESET_HASH ||
    !isCompetitiveStatus(status)
  ) {
    throw schemaError();
  }

  const currentState = parseCurrentState(projection.currentState, playerIds, currentTurn);
  const terminal = parseTerminal(projection.terminal, playerIds, 1);
  const stateTerminal = parseTerminal(currentState.terminal, playerIds, 1);

  if (
    JSON.stringify(terminal) !== JSON.stringify(stateTerminal) ||
    (status === "completed") !== Boolean(terminal)
  ) {
    throw schemaError();
  }

  const terminalMetadata = parseTerminalMetadata(projection, status);

  return {
    projection: {
      matchId,
      bracketMatchId,
      kind,
      assignmentRevision,
      rulesetVersion,
      rulesetHash,
      currentTurn,
      turnEndsAtMs,
      status,
      playerIds,
      stateHash,
      currentState: { ...currentState, terminal },
      submittedPlayerIds,
      terminal,
      terminalEventId: terminalMetadata.terminalEventId,
      terminalRoomRevision: terminalMetadata.terminalRoomRevision,
    },
    terminalMetadataState: terminalMetadata.state,
  };
}

export function parseCompetitiveRoomSnapshotContract(
  value: unknown,
): CompetitiveRoomSnapshotContract {
  const snapshot = requireOpenRecord(value, MAX_ROOM_SNAPSHOT_KEYS);
  const revision = requireNonnegativeSafeInteger(snapshot.revision);
  const competitiveTransitions = hasOwn(snapshot, "competitiveTransitions")
    ? parseCompetitiveTransitions(snapshot.competitiveTransitions, revision)
    : [];
  const result: CompetitiveRoomSnapshotContract = {
    revision,
    competitiveTransitions,
    competitiveAssignments: [],
  };

  if (hasOwn(snapshot, "competitive")) {
    if (snapshot.competitive === null) {
      throw schemaError();
    }
    const parsed = parseCompetitiveProjectionContract(snapshot.competitive);
    if (
      parsed.projection.status === "completed" ||
      parsed.terminalMetadataState !== "not-terminal"
    ) {
      throw schemaError();
    }
    result.competitive = parsed.projection;
  }

  result.competitiveAssignments = hasOwn(snapshot, "competitiveAssignments")
    ? parseCompetitiveAssignments(snapshot.competitiveAssignments)
    : result.competitive
      ? [result.competitive]
      : [];
  if (
    result.competitive &&
    !result.competitiveAssignments.some(function testItem(assignment) {
      return assignment.matchId === result.competitive?.matchId;
    })
  ) {
    throw schemaError();
  }

  return result;
}

export function selectCompetitiveAssignment(
  assignments: readonly CompetitiveProjection[],
  playerId: string,
  roundIndex: number,
): CompetitiveProjection | null {
  const ownAssignment = assignments.find(function findItem(assignment) {
    return assignment.playerIds.includes(playerId);
  });
  if (ownAssignment) {
    return ownAssignment;
  }
  if (assignments.length === 0) {
    return null;
  }

  const ordered = [...assignments].sort(function compareItems(left, right) {
    return left.bracketMatchId.localeCompare(right.bracketMatchId);
  });
  return selectStableValue(
    ordered,
    `${playerId}:${roundIndex}:${ordered
      .map(function mapItem(assignment) {
        return assignment.matchId;
      })
      .join(":")}`,
  );
}

export function selectCompetitiveViewPlayerId(
  projection: CompetitiveProjection,
  playerId: string,
): string {
  return projection.playerIds.includes(playerId)
    ? playerId
    : selectStableValue(projection.playerIds, `${playerId}:${projection.matchId}`);
}

function selectStableValue<T>(values: readonly T[], key: string): T {
  let hash = 2166136261;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return values[Math.abs(hash) % values.length]!;
}

function parseCompetitiveAssignments(value: unknown): CompetitiveProjection[] {
  if (!Array.isArray(value) || value.length > MAX_COMPETITIVE_ASSIGNMENTS) {
    throw schemaError();
  }

  const matchIds = new Set<string>();
  const bracketMatchIds = new Set<string>();
  return value.map(function mapItem(item) {
    const parsed = parseCompetitiveProjectionContract(item);
    const projection = parsed.projection;
    if (
      projection.status === "completed" ||
      parsed.terminalMetadataState !== "not-terminal" ||
      matchIds.has(projection.matchId) ||
      bracketMatchIds.has(projection.bracketMatchId)
    ) {
      throw schemaError();
    }
    matchIds.add(projection.matchId);
    bracketMatchIds.add(projection.bracketMatchId);
    return projection;
  });
}

function parseTerminalMetadata(
  projection: Record<string, unknown>,
  status: CompetitiveProjection["status"],
): {
  terminalEventId: string | null;
  terminalRoomRevision: number | null;
  state: CompetitiveTerminalMetadataState;
} {
  const hasEventId = hasOwn(projection, "terminalEventId");
  const hasRoomRevision = hasOwn(projection, "terminalRoomRevision");

  if (hasEventId !== hasRoomRevision) {
    throw schemaError();
  }

  const terminalEventId = hasEventId ? projection.terminalEventId : null;
  const terminalRoomRevision = hasRoomRevision ? projection.terminalRoomRevision : null;
  const hasNullMetadata = terminalEventId === null && terminalRoomRevision === null;

  if (!hasNullMetadata) {
    if (
      status !== "completed" ||
      typeof terminalEventId !== "string" ||
      terminalEventId.trim() !== terminalEventId ||
      terminalEventId.length === 0 ||
      terminalEventId.length > PLAYER_ID_MAX_LENGTH
    ) {
      throw schemaError();
    }

    return {
      terminalEventId,
      terminalRoomRevision: requireNonnegativeSafeInteger(terminalRoomRevision),
      state: "stable",
    };
  }

  if (terminalEventId !== null || terminalRoomRevision !== null) {
    throw schemaError();
  }

  return {
    terminalEventId: null,
    terminalRoomRevision: null,
    state: status === "completed" ? "legacy-recovery-required" : "not-terminal",
  };
}

function parseCompetitiveTransitions(
  value: unknown,
  roomRevision: number,
): CompetitiveTerminalTransition[] {
  if (!Array.isArray(value) || value.length > MAX_COMPETITIVE_TRANSITIONS) {
    throw schemaError();
  }

  const transitions: CompetitiveTerminalTransition[] = [];
  const eventIds = new Set<string>();
  const matchIds = new Set<string>();

  for (const valueItem of value) {
    const item = requireRecord(
      valueItem,
      ["projection", "terminalEventId", "terminalRoomRevision"],
      0,
    );
    const terminalEventId = requireStableTerminalEventId(item.terminalEventId);
    const terminalRoomRevision = requireNonnegativeSafeInteger(item.terminalRoomRevision);
    const parsed = parseCompetitiveProjectionContract(item.projection);

    if (
      parsed.projection.status !== "completed" ||
      parsed.terminalMetadataState !== "stable" ||
      parsed.projection.terminalEventId !== terminalEventId ||
      parsed.projection.terminalRoomRevision !== terminalRoomRevision ||
      terminalRoomRevision > roomRevision ||
      eventIds.has(terminalEventId) ||
      matchIds.has(parsed.projection.matchId)
    ) {
      throw schemaError();
    }

    const previous = transitions.at(-1);
    if (
      previous &&
      (previous.terminalRoomRevision > terminalRoomRevision ||
        (previous.terminalRoomRevision === terminalRoomRevision &&
          previous.terminalEventId >= terminalEventId))
    ) {
      throw schemaError();
    }

    eventIds.add(terminalEventId);
    matchIds.add(parsed.projection.matchId);
    transitions.push({
      terminalEventId,
      terminalRoomRevision,
      projection: parsed.projection,
    });
  }

  return transitions;
}

function parseCurrentState(
  value: unknown,
  playerIds: [string, string],
  currentTurn: number,
): CompetitiveProjection["currentState"] {
  const state = requireRecord(
    value,
    ["participantIds", "playersById", "rulesetVersion", "terminal", "turn"],
    1,
  );
  const participantIds = parsePlayerIds(state.participantIds);
  const turn = requireNonnegativeSafeInteger(state.turn);
  if (
    state.rulesetVersion !== COMPETITIVE_RULESET_VERSION ||
    turn !== currentTurn ||
    participantIds[0] !== playerIds[0] ||
    participantIds[1] !== playerIds[1]
  ) {
    throw schemaError();
  }

  const playersById = requireRecord(state.playersById, playerIds, 2);
  const parsedPlayers = Object.fromEntries(
    playerIds.map(function mapItem(playerId) {
      return [playerId, parsePlayer(playersById[playerId], playerId)] as const;
    }),
  );

  return {
    rulesetVersion: COMPETITIVE_RULESET_VERSION,
    turn,
    participantIds,
    playersById: parsedPlayers,
    terminal: state.terminal as CompetitiveProjection["currentState"]["terminal"],
  };
}

function parsePlayer(
  value: unknown,
  expectedPlayerId: string,
): CompetitiveProjection["currentState"]["playersById"][string] {
  const player = requireRecord(value, ["activeSlotIndex", "playerId", "team"], 3);
  const playerId = requireString(player.playerId);
  const activeSlotIndex = requireNonnegativeSafeInteger(player.activeSlotIndex);
  if (
    playerId !== expectedPlayerId ||
    !Array.isArray(player.team) ||
    player.team.length < 1 ||
    player.team.length > MAX_COMPETITIVE_TEAM_ITEMS ||
    activeSlotIndex >= 6
  ) {
    throw schemaError();
  }

  return {
    playerId,
    activeSlotIndex,
    team: parseTeam(player.team, activeSlotIndex),
  };
}

function parseTeam(
  team: unknown[],
  activeSlotIndex: number,
): CompetitiveProjection["currentState"]["playersById"][string]["team"] {
  const parsed = team.map(function mapItem(pokemon) {
    return parsePokemon(pokemon);
  });
  const slots = new Set(
    parsed.map(function mapItem(pokemon) {
      return pokemon.slotIndex;
    }),
  );
  if (slots.size !== parsed.length || !slots.has(activeSlotIndex)) {
    throw schemaError();
  }
  return parsed;
}

function parsePokemon(
  value: unknown,
): CompetitiveProjection["currentState"]["playersById"][string]["team"][number] {
  const pokemon = requireRecord(
    value,
    ["currentHp", "level", "maxHp", "moves", "slotIndex", "speciesId", "statStages", "status"],
    4,
  );
  const speciesId = requireNonnegativeSafeInteger(pokemon.speciesId);
  const slotIndex = requireNonnegativeSafeInteger(pokemon.slotIndex);
  const level = requireNonnegativeSafeInteger(pokemon.level);
  const maxHp = requireNonnegativeSafeInteger(pokemon.maxHp);
  const currentHp = requireNonnegativeSafeInteger(pokemon.currentHp);
  const statStages = parseStatStages(pokemon.statStages);
  if (
    speciesId < 1 ||
    slotIndex > 5 ||
    level < 1 ||
    level > 100 ||
    maxHp < 1 ||
    currentHp > maxHp ||
    !isCompetitivePokemonStatus(pokemon.status, currentHp) ||
    !Array.isArray(pokemon.moves) ||
    pokemon.moves.length < 1 ||
    pokemon.moves.length > 4
  ) {
    throw schemaError();
  }

  return {
    speciesId,
    slotIndex,
    level,
    maxHp,
    currentHp,
    status: pokemon.status,
    statStages,
    moves: parseMoves(pokemon.moves),
  };
}

function parseStatStages(
  value: unknown,
): CompetitiveProjection["currentState"]["playersById"][string]["team"][number]["statStages"] {
  const keys = [
    "accuracy",
    "attack",
    "defense",
    "evasion",
    "specialAttack",
    "specialDefense",
    "speed",
  ] as const;
  const stages = requireRecord(value, keys, 5);
  return Object.fromEntries(
    keys.map(function mapItem(key) {
      const stage = requireSafeInteger(stages[key]);
      if (stage < -6 || stage > 6) {
        throw schemaError();
      }
      return [key, stage];
    }),
  ) as CompetitiveProjection["currentState"]["playersById"][string]["team"][number]["statStages"];
}

function parseMoves(
  moves: unknown[],
): CompetitiveProjection["currentState"]["playersById"][string]["team"][number]["moves"] {
  const parsed = moves.map(function mapItem(move) {
    return parseMove(move);
  });
  if (
    new Set(
      parsed.map(function mapItem(move) {
        return move.moveId;
      }),
    ).size !== parsed.length
  ) {
    throw schemaError();
  }
  return parsed;
}

function parseMove(
  value: unknown,
): CompetitiveProjection["currentState"]["playersById"][string]["team"][number]["moves"][number] {
  const move = requireRecord(value, ["moveId", "pp"], 5);
  const moveId = requireNonnegativeSafeInteger(move.moveId);
  const pp = requireNonnegativeSafeInteger(move.pp);
  if (moveId < 1 || moveId > 470 || pp > 99) {
    throw schemaError();
  }

  return { moveId, pp };
}

function parsePlayerIds(value: unknown): [string, string] {
  if (!Array.isArray(value) || value.length !== 2) {
    throw schemaError();
  }
  const playerIds = value.map(requirePlayerId) as [string, string];
  if (playerIds[0] === playerIds[1]) {
    throw schemaError();
  }
  return playerIds;
}

function parseSubmittedPlayerIds(value: unknown, playerIds: [string, string]): string[] {
  if (!Array.isArray(value) || value.length > MAX_COMPETITIVE_ARRAY_ITEMS) {
    throw schemaError();
  }
  const submitted = value.map(requirePlayerId);
  if (
    new Set(submitted).size !== submitted.length ||
    submitted.some(function testItem(playerId) {
      return !playerIds.includes(playerId);
    })
  ) {
    throw schemaError();
  }
  return submitted;
}

function parseTerminal(
  value: unknown,
  playerIds: [string, string],
  depth: number,
): CompetitiveTerminal | null {
  if (value === null) {
    return null;
  }
  const terminal = requireRecord(
    value,
    ["loserPlayerId", "reason", "scoreByPlayerId", "winnerPlayerId"],
    depth,
  );
  const winnerPlayerId = requirePlayerId(terminal.winnerPlayerId);
  const loserPlayerId = requirePlayerId(terminal.loserPlayerId);
  const scoreByPlayerId = requireRecord(terminal.scoreByPlayerId, playerIds, depth + 1);
  if (
    winnerPlayerId === loserPlayerId ||
    !playerIds.includes(winnerPlayerId) ||
    !playerIds.includes(loserPlayerId) ||
    (terminal.reason !== "faint" &&
      terminal.reason !== "forfeit" &&
      terminal.reason !== "timeout") ||
    scoreByPlayerId[winnerPlayerId] !== 100 ||
    scoreByPlayerId[loserPlayerId] !== 50
  ) {
    throw schemaError();
  }

  return {
    winnerPlayerId,
    loserPlayerId,
    reason: terminal.reason,
    scoreByPlayerId: {
      [playerIds[0]]: scoreByPlayerId[playerIds[0]] as 50 | 100,
      [playerIds[1]]: scoreByPlayerId[playerIds[1]] as 50 | 100,
    },
  };
}

function requireCompetitiveProjectionRecord(value: unknown): Record<string, unknown> {
  const projection = requireOpenRecord(value, MAX_COMPETITIVE_RECORD_KEYS);
  const hasTerminalMetadata = COMPETITIVE_TERMINAL_METADATA_KEYS.some(function testItem(key) {
    return hasOwn(projection, key);
  });
  const exactKeys = hasTerminalMetadata
    ? [...COMPETITIVE_PROJECTION_KEYS, ...COMPETITIVE_TERMINAL_METADATA_KEYS]
    : COMPETITIVE_PROJECTION_KEYS;
  const keys = Object.keys(projection).sort();
  const sortedExpectedKeys = [...exactKeys].sort();

  if (
    keys.length !== sortedExpectedKeys.length ||
    keys.some(function testItem(key, index) {
      return key !== sortedExpectedKeys[index];
    })
  ) {
    throw schemaError();
  }

  return projection;
}

function requireRecord(
  value: unknown,
  exactKeys: readonly string[],
  depth: number,
): Record<string, unknown> {
  if (depth > MAX_COMPETITIVE_PROJECTION_DEPTH || exactKeys.length > MAX_COMPETITIVE_RECORD_KEYS) {
    throw schemaError();
  }
  const record = requireOpenRecord(value, MAX_COMPETITIVE_RECORD_KEYS);
  const keys = Object.keys(record);
  if (keys.length !== exactKeys.length) {
    throw schemaError();
  }
  keys.sort();
  const sortedExpectedKeys = [...exactKeys].sort();
  if (
    keys.some(function testItem(key, index) {
      return key !== sortedExpectedKeys[index];
    })
  ) {
    throw schemaError();
  }
  return record;
}

function requireOpenRecord(value: unknown, maxKeys: number): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw schemaError();
  }
  const prototype = Object.getPrototypeOf(value) as object | null;
  const keys = Object.keys(value);
  if ((prototype !== Object.prototype && prototype !== null) || keys.length > maxKeys) {
    throw schemaError();
  }
  return value as Record<string, unknown>;
}

function requireString(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) {
    throw schemaError();
  }
  return value;
}

function requirePlayerId(value: unknown): string {
  const playerId = requireString(value);
  if (playerId.trim() !== playerId || playerId.length > PLAYER_ID_MAX_LENGTH) {
    throw schemaError();
  }
  return playerId;
}

function requireStableTerminalEventId(value: unknown): string {
  const eventId = requireString(value);
  if (eventId.trim() !== eventId || eventId.length > PLAYER_ID_MAX_LENGTH) {
    throw schemaError();
  }
  return eventId;
}

function requireHash(value: unknown): string {
  const hash = requireString(value);
  if (!HASH_PATTERN.test(hash)) {
    throw schemaError();
  }
  return hash;
}

function requireNonnegativeSafeInteger(value: unknown): number {
  const integer = requireSafeInteger(value);
  if (integer < 0) {
    throw schemaError();
  }
  return integer;
}

function requireSafeInteger(value: unknown): number {
  if (!Number.isSafeInteger(value)) {
    throw schemaError();
  }
  return value as number;
}

function isCompetitivePokemonStatus(
  value: unknown,
  currentHp: number,
): value is CompetitiveProjection["currentState"]["playersById"][string]["team"][number]["status"] {
  return currentHp === 0
    ? value === "fainted"
    : value === "normal" || value === "poisoned" || value === "burned" || value === "paralyzed";
}

function isCompetitiveStatus(value: unknown): value is CompetitiveProjection["status"] {
  return value === "pending" || value === "active" || value === "completed";
}

function hasOwn(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function schemaError(): Error {
  return new CompetitiveProjectionSchemaError();
}
