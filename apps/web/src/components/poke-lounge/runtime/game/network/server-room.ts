import { isStarterMode, type StarterMode } from "@poke-lounge/battle/starter-selection";
import { acknowledgePreparation } from "@/features/poke-lounge/application/round/acknowledge-preparation";
import { getApiBaseUrl } from "@/lib/constants";
import {
  captureClientDiagnosticFailure,
  captureClientDiagnosticSnapshot,
  clientDiagnosticOperation,
  createDiagnosticRequestId,
  recordClientBreadcrumb,
  reportClientDiagnostic,
  resetClientDiagnosticContext,
  updateClientDiagnosticContext,
  type DiagnosticSnapshot,
} from "@/lib/client-diagnostics";
import { ROOM_ERROR_CODES } from "../../../poke-lounge-error-codes";
import { getServerRoomErrorMessage } from "../server-room-error-copy";
import type { components } from "@/types/api";
import { DEFAULT_AI_DIFFICULTY, type AiDifficulty } from "@poke-lounge/battle/ai-difficulty";
import { getRoundStartPosition } from "@poke-lounge/battle/round-start";
import {
  INITIAL_WORKFLOW_RETRY_MAX_DELAY_MS,
  ONLINE_STALE_RECOVERY_DELAY_MS,
  PARTY_PUBLICATION_RETRY_DELAY_MS,
  RECOVERY_INITIAL_DELAY_MS,
  RECOVERY_MAX_DELAY_MS,
  ROOM_CLOCK_MAX_WAIT_MS,
  ROOM_CLOCK_RETRY_INITIAL_DELAY_MS,
  ROOM_CLOCK_RETRY_MAX_DELAY_MS,
  SERVER_ROOM_REQUEST_TIMEOUT_MS,
  SERVER_ROOM_LIVENESS_INTERVAL_MS,
  TOURNAMENT_PROGRESSION_DEADLINE_MS,
} from "@poke-lounge/battle/timing";
import { sortTournamentParticipantsByJoinOrder } from "@poke-lounge/battle/tournament-seeding";
import { io } from "socket.io-client";
import { createRustRoomSocket, RUST_BACKEND_ENABLED } from "./rust-room-socket";
import { createRoomRunId, isRoomRunId } from "../room-run-id";
import {
  clearPendingRoomEntry,
  clearRoomResumeCookie,
  readRoomResumeCookie,
  writeRoomResumeCookie,
} from "./room-entry-cookie";
import { createCompetitivePartySnapshot } from "./competitive-party-snapshot";
import {
  normalizeCompetitiveParty,
  type CompetitivePartyInput,
} from "@poke-lounge/battle/competitive-party";
import {
  CompetitiveProjectionSchemaError,
  parseCompetitiveProjection,
  parseCompetitiveProjectionContract,
  parseCompetitiveRoomSnapshotContract,
  selectCompetitiveAssignment,
  selectCompetitiveViewPlayerId,
} from "./competitive-projection";
import type {
  CompetitiveProjection,
  CompetitiveTerminalTransition,
  MultiplayerRoom,
  PlayerSnapshot,
  RoomEvent,
  RoomMessage,
} from "./local-preview-room";
import {
  findCurrentMatch,
  isRoundReadinessDue,
  mapServerTournamentPlayerIds,
  parseServerTournamentState,
  type ServerTournamentState,
  type TournamentCompetitionKind,
  type TournamentStateRoomPayload,
} from "./tournament-projection";

type Handler<T extends RoomMessage> = (payload: RoomEvent[T]) => void;
type SharedWorldPlayerEventType = "PLAYER_MOVED" | "PLAYER_MOVEMENT_ENDED" | "PLAYER_CHANGED_MAP";
type SharedWorldCursor = {
  roomCode: string;
  worldEpoch: string;
  worldSeq: number;
};
type SharedWorldSnapshot = SharedWorldCursor & { players: PlayerSnapshot[] };
type SharedWorldPlayerEvent = {
  type: SharedWorldPlayerEventType;
  snapshot: PlayerSnapshot;
  cursor: SharedWorldCursor | null;
};

type ApiServerRoom = components["schemas"]["PokeLoungeRoomResponseDto"];
type ServerParticipant = ApiServerRoom["participants"][number] & {
  aiDifficulty?: AiDifficulty;
};
type ServerPartySnapshot = components["schemas"]["PokeLoungePartySnapshotDto"];

interface ServerRoomState {
  starterMode: StarterMode;
  progressionParty?: import("@poke-lounge/battle/competitive-party").NormalizedCompetitiveParty;
  roomCode: string;
  roomInstanceId?: string;
  visibility: ApiServerRoom["visibility"];
  hostPlayerId: string | null;
  revision: number;
  expiresAtMs: number;
  serverNowMs?: number;
  status: ApiServerRoom["status"];
  participants: ServerParticipant[];
  partySnapshots: Record<string, ServerPartySnapshot>;
  round: ApiServerRoom["round"];
  tournament: ServerTournamentState;
  finalStandings: ApiServerRoom["finalStandings"];
  competitiveTransitions: CompetitiveTerminalTransition[];
  competitiveAssignments: CompetitiveProjection[];
  competitive?: CompetitiveProjection;
}

export interface ServerRoomOptions {
  accountId?: string;
  roomId?: string;
  roomInstanceId?: string;
  roomRunId?: string;
  createRoom?: boolean;
  quickPlay?: boolean;
  visibility?: "private" | "public";
  resumeRoom?: boolean;
  initialOpenCommandId?: string;
  roundDurationMs?: number;
  starterMode?: StarterMode;
  sharedWorldOnly?: boolean;
  competitiveRoundsEnabled?: boolean;
  fetch?: typeof fetch;
  idToken?: string;
  getIdToken?: () => string | undefined;
  onTransportError?: (error: Error) => void;
  socketFactory?: ServerRoomSocketFactory;
  requestTimeoutMs?: number;
}

export const POKE_LOUNGE_FRESH_SESSION_REQUIRED_EVENT =
  "poke-lounge:server-room-fresh-session-required";
export const POKE_LOUNGE_SERVER_ROOM_ERROR_EVENT = "poke-lounge:server-room-error";

export interface PokeLoungeFreshSessionRequiredDetail {
  roomCode: string | null;
  reason?: "room-expired";
}

export interface PokeLoungeServerRoomErrorDetail {
  code:
    | "ROOM_CREATE_FAILED"
    | "ROOM_JOIN_FAILED"
    | "ROOM_PARTY_SYNC_FAILED"
    | "ROOM_READY_FAILED"
    | "ROOM_TRANSPORT_FAILED"
    | "ROOM_FULL"
    | "ROOM_EXPIRED"
    | "ROOM_ALREADY_STARTED"
    | "ROOM_NOT_FOUND"
    | "ROOM_SESSION_INVALID"
    | "ROOM_ACCESS_DENIED"
    | "ROOM_IDENTITY_MISMATCH"
    | "ROOM_REJOIN_BLOCKED"
    | "ROOM_REQUEST_INVALID"
    | "ROOM_REQUEST_CONFLICT"
    | "ROOM_SERVER_BUSY"
    | "ROOM_SERVER_UNAVAILABLE"
    | "ROOM_REQUEST_TIMEOUT"
    | "ROOM_NETWORK_FAILED"
    | "ROOM_RESPONSE_INVALID"
    | "CURSOR_REGRESSION";
  message: string;
  recoverable: boolean;
  entryOperation?: "join";
  disconnected?: boolean;
  retryKind?: "reconnect";
  retry?: () => void | Promise<boolean>;
  cancel: () => void;
}

interface ServerRoomSocket {
  readonly connected: boolean;
  connect?(): unknown;
  readonly io?: {
    readonly engine?: {
      readonly transport?: { readonly name?: unknown };
    };
  };
  on(eventName: string, listener: ServerRoomSocketListener): ServerRoomSocket;
  off(eventName: string, listener: ServerRoomSocketListener): ServerRoomSocket;
  emit(eventName: string, payload: unknown): ServerRoomSocket;
  disconnect(): ServerRoomSocket;
}

type ServerRoomSocketListener = (() => void) | ((event: unknown) => void);

type ServerRoomSocketFactory = (
  url: string,
  options: {
    path: "/socket.io";
    transports: ["polling", "websocket"];
    tryAllTransports: true;
    reconnection: true;
  },
) => ServerRoomSocket;
type RecoveryOrigin = "transport" | "online-probe";

const SERVER_IDENTITY_STORAGE_KEY = RUST_BACKEND_ENABLED
  ? "poke-lounge:rust-room-identity:v3"
  : "poke-lounge:server-room-identity";
const USAGE_VISITOR_STORAGE_KEY = "poke-lounge:usage-visitor:v1";
let memoryUsageVisitorId: string | null = null;
const LEGACY_RUST_IDENTITY_STORAGE_KEY = "poke-lounge:rust-room-identity:v2";
const RUST_IDENTITY_STORAGE_VERSION = 3;
const RUST_IDENTITY_UUID_PATTERN =
  "[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const RUST_USAGE_VISITOR_PATTERN = new RegExp(`^${RUST_IDENTITY_UUID_PATTERN}$`, "i");
const RUST_SESSION_ID_PATTERN = new RegExp(`^server-session-${RUST_IDENTITY_UUID_PATTERN}$`, "i");
const RUST_PLAYER_ID_PATTERN = new RegExp(`^server-player-${RUST_IDENTITY_UUID_PATTERN}$`, "i");
const SERVER_ROOM_CODE_PATTERN = /^[A-Z0-9]{6}$/;

const MAX_RECENT_TERMINAL_PROJECTIONS = 8;
const PENDING_ROOM_ID = "server-pending";
const REVISION_CONFLICT_CODE = "POKE_LOUNGE_REVISION_CONFLICT";
const IDEMPOTENCY_CONFLICT_CODE = "POKE_LOUNGE_IDEMPOTENCY_CONFLICT";
const ROOM_FULL_CODE = "POKE_LOUNGE_ROOM_FULL";

interface ServerRoomConflictResponse {
  statusCode: 409;
  code: typeof REVISION_CONFLICT_CODE | typeof IDEMPOTENCY_CONFLICT_CODE;
  message: string;
  snapshot: ServerRoomState;
}

interface StoredServerRoomIdentity {
  version?: number;
  sessionId: string;
  playerId: string;
  activeRoom?: {
    roomCode: string;
    roomInstanceId?: string;
    expiresAtMs: number;
    cookieVersion?: 1;
    runId: string;
  };
}

export interface StoredServerRoomResume {
  roomCode: string;
  roomInstanceId?: string;
  runId: string;
}

type InitialWorkflowStage = "open" | "competitive-seat" | "party" | "complete";

class ServerRoomRequestError extends Error {
  readonly serverCode: string | null;

  constructor(
    readonly status: number,
    readonly responseBody: unknown,
  ) {
    const code =
      responseBody !== null && typeof responseBody === "object" && "code" in responseBody
        ? responseBody.code
        : null;
    const serverCode =
      typeof code === "string" && /^[A-Z][A-Z0-9_]{0,63}$/.test(code) ? code : null;
    super(
      `Poke Lounge server room request failed: ${status}${serverCode ? ` (${serverCode})` : ""}`,
    );
    this.serverCode = serverCode;
  }
}

class ServerRoomTimeoutError extends Error {
  constructor() {
    super("Poke Lounge server room request timed out");
  }
}

class ServerRoomTransportError extends Error {
  constructor(readonly transportCause: unknown) {
    super("Poke Lounge server room transport failed");
  }
}

class DeferredPartySnapshot extends Error {}

class ServerRoomFetchError extends ServerRoomTransportError {}

class ServerRoomBodyReadError extends ServerRoomTransportError {}

class ServerRoomJsonParseError extends Error {
  constructor(readonly parseCause: unknown) {
    super("Poke Lounge server room response JSON is malformed");
  }
}

class ServerRoomSchemaError extends Error {
  constructor() {
    super("Poke Lounge room response is malformed");
  }
}

export function createServerRoom(options: ServerRoomOptions): MultiplayerRoom {
  resetClientDiagnosticContext();
  const identity = resolveServerIdentity(options);
  const usageVisitorId = RUST_BACKEND_ENABLED ? resolveUsageVisitorId(identity.playerId) : null;
  const sessionId = identity.sessionId;
  const serverPlayerId = identity.playerId;
  const roomRunId = resolveServerRoomRunId(options);
  let localPlayerId = serverPlayerId;
  let activeRoomId = options.roomId ?? PENDING_ROOM_ID;
  let roomInstanceId: string | undefined =
    options.roomInstanceId ??
    (options.resumeRoom
      ? readStoredIdentity(options.accountId)?.activeRoom?.roomInstanceId
      : undefined);
  updateClientDiagnosticContext({ roomInstanceId });
  const fetchImpl = options.fetch ?? fetch;
  const requestTimeoutMs = options.requestTimeoutMs ?? SERVER_ROOM_REQUEST_TIMEOUT_MS;
  type RoomHttpResponse = {
    response: Response;
    responseText: string;
    trace: NonNullable<DiagnosticSnapshot["request"]>;
  };
  const fetchResponseWithTimeout = async (
    url: string,
    init?: RequestInit,
    commandId?: string,
  ): Promise<RoomHttpResponse> => {
    const headers = new Headers(init?.headers);
    const trace: NonNullable<DiagnosticSnapshot["request"]> = {
      requestId: createDiagnosticRequestId(),
      commandId: commandId ?? headers.get("X-Idempotency-Key") ?? undefined,
      operation: clientDiagnosticOperation(new URL(url).pathname, init?.method),
      stage: "fetch",
    };
    const meaningful = init?.method && init.method !== "GET";
    if (meaningful && !disposed) recordClientBreadcrumb("command.sent", trace);
    const controller = new AbortController();
    let timedOut = false;
    let timeoutHandle: number | null = null;
    const timeout = new Promise<never>(function resolvePromise(_resolve, reject) {
      timeoutHandle = window.setTimeout(function handleTimeout() {
        timedOut = true;
        controller.abort();
        reject(new ServerRoomTimeoutError());
      }, requestTimeoutMs);
    });

    try {
      const request = (async function callback() {
        headers.set("X-Request-Id", trace.requestId!);
        if (usageVisitorId) headers.set("X-Usage-Visitor", usageVisitorId);
        if (
          RUST_BACKEND_ENABLED &&
          roomInstanceId &&
          new URL(url).pathname.startsWith(`/poke-lounge/rooms/${activeRoomId}`)
        )
          headers.set("X-Room-Instance", roomInstanceId);
        const response = await fetchImpl(url, { ...init, headers, signal: controller.signal });
        trace.status = response.status;
        trace.stage = "body";
        const responseText = await readResponseBody(response);
        return { response, responseText, trace: { ...trace } };
      })();
      return await Promise.race([request, timeout]);
    } catch (error) {
      const thrown =
        error !== null && typeof error === "object" ? error : new ServerRoomTransportError(error);
      const failure = {
        ...trace,
        causeType: timedOut
          ? ("timeout" as const)
          : trace.stage === "body"
            ? ("body_read" as const)
            : ("fetch_failure" as const),
      };
      if (!disposed) {
        recordClientBreadcrumb("request.failed", failure);
        const snapshot = captureClientDiagnosticFailure(thrown, failure);
        reportClientDiagnostic({
          kind: "api",
          code: timedOut ? "TIMEOUT" : "REQUEST_FAILED",
          error: thrown,
          snapshot,
        });
      }
      throw thrown;
    } finally {
      if (timeoutHandle !== null) window.clearTimeout(timeoutHandle);
    }
  };

  const decodeRoomResponse = <T>(http: RoomHttpResponse, parse: (body: unknown) => T): T => {
    let stage: NonNullable<DiagnosticSnapshot["request"]>["stage"] = "json";
    try {
      const body = unwrapApiResponse<unknown>(parseResponseJson(http.responseText));
      stage = "http";
      if (!http.response.ok) throw new ServerRoomRequestError(http.response.status, body);
      stage = "schema";
      const result = parse(body);
      if (!disposed && http.trace.operation?.startsWith("POST"))
        recordClientBreadcrumb("command.response", http.trace);
      return result;
    } catch (error) {
      const trace = {
        ...http.trace,
        stage,
        causeType:
          stage === "json"
            ? ("json_parse" as const)
            : stage === "http"
              ? ("http" as const)
              : ("schema" as const),
      };
      if (!disposed) {
        recordClientBreadcrumb("request.failed", trace);
        const snapshot = captureClientDiagnosticFailure(error, trace);
        reportClientDiagnostic({
          kind: "api",
          code: stage === "http" ? `HTTP_${http.response.status}` : "INVALID_RESPONSE",
          error,
          snapshot,
          priority: http.response.status === 409 ? "background" : "error",
        });
      }
      throw error;
    }
  };
  const socketFactory = options.socketFactory ?? resolveServerRoomSocketFactory();
  const readIdToken = () => options.getIdToken?.() ?? options.idToken;
  const handlers = new Map<RoomMessage, Set<Handler<RoomMessage>>>();
  let disposed = false;
  const reportedStateApplyFailures = new Set<string>();
  const reportStateApplyFailure = (code: string, error: unknown) => {
    if (disposed || leaveSent || reportedStateApplyFailures.has(code)) return;
    // Recovery can repeat indefinitely; keep only the first exception per code in this room.
    reportedStateApplyFailures.add(code);
    recordClientBreadcrumb("room.apply_failed", { stage: "apply", causeType: "client" });
    const snapshot = captureClientDiagnosticFailure(error, { stage: "apply", causeType: "client" });
    reportClientDiagnostic({ kind: "room", code, error, snapshot, priority: "background" });
  };
  let recoveryTimer: number | null = null;
  let roomLivenessTimer: number | null = null;
  let recoveryAttempt = 0;
  let recoveryInFlight = false;
  let recoveryRetryQueued = false;
  let recoveryDrainQueued = false;
  let onlineRecoveryQueued = false;
  let initialWorkflowTimer: number | null = null;
  let initialWorkflowAttempt = 0;
  let initialWorkflowInFlight = false;
  let initialWorkflowRetryQueued = false;
  let initialWorkflowStage: InitialWorkflowStage = "open";
  let initialWorkflowSnapshot: PlayerSnapshot | null = null;
  let resumeRejoinedParticipant = false;
  let latestSharedWorldSnapshot: PlayerSnapshot | null = null;
  if (options.initialOpenCommandId !== undefined && !isRoomRunId(options.initialOpenCommandId)) {
    throw new Error("Poke Lounge room command requires a UUID");
  }
  const initialOpenIdempotencyKey = options.initialOpenCommandId ?? createIdempotencyKey();
  let initialPartyIdempotencyKey = createIdempotencyKey();
  let onlineStaleRecoveryTimer: number | null = null;
  let onlineStaleRecoveryFingerprint: string | null = null;
  let onlineStaleRecoveryDueAtMs: number | null = null;
  let onlineStaleRecoveryAttempt = 0;
  let onlineStaleRecoveryRepeats = false;
  let onlineStaleRecoveryGeneration = 0;
  let visibilityRecoveryDocument: Document | null = null;
  let roomClockTimer: number | null = null;
  let roomClockAttempt = 0;
  let roomClockInFlight = false;
  let moveLearningPending = false;
  let roomClockTarget: {
    roomCode: string;
    revision: number;
    endsAtMs: number;
  } | null = null;
  let roundReadyCommand: {
    roomCode: string;
    roundIndex: number;
    idempotencyKey: string;
  } | null = null;
  let latestState: ServerRoomState | null = null;
  let serverClockOffsetMs: number | null = null;
  const getServerNowMs = () => Date.now() + (serverClockOffsetMs ?? 0);
  let currentAssignmentProjection: CompetitiveProjection | null = null;
  let recentTerminalProjections: CompetitiveTerminalTransition[] = [];
  const terminalEventIds = new Set<string>();
  const hydratedTournamentRewards = new Set<string>();
  const terminalMatchIds = new Set<string>();
  const completedBracketRecoveryMatchIds = new Set<string>();
  let lastAppliedRoomRevision = -1;
  let lastAppliedTerminalRevision = -1;
  let lastAppliedWorldSeq = 0;
  let worldEpoch: string | null = null;
  let worldSnapshotInitialized = false;
  let worldResyncRequested = false;
  const worldPlayers = new Map<string, PlayerSnapshot>();
  let freshTerminalBaselineInitialized = false;
  let roomSocket: ServerRoomSocket | null = null;
  let socketConnected = false;
  let connectionStatus: RoomEvent["CONNECTION_STATUS"]["connectionStatus"] = "offline";
  let connectionStatusAnnounced = false;
  let subscriptionFailed = false;
  let subscriptionRetryRequired = false;
  let cursorRegression = false;
  let connectStarted = false;
  let hasSynchronizedPartySnapshot = false;
  type PendingPartyPublication = {
    snapshot: PlayerSnapshot;
    idempotencyKey: string;
    publishing: boolean;
    waitForUnlock: boolean;
    recoveryAttempts: number;
  };
  let pendingPartyPublication: PendingPartyPublication | null = null;
  let partyRetryTimer: number | null = null;
  let mutationQueue: Promise<void> = Promise.resolve();
  let announcedCompetitiveAssignmentKey: string | null = null;
  let latestCompetitionKind: TournamentCompetitionKind = null;
  let resultSync: TournamentStateRoomPayload["resultSync"] = {
    matchId: null,
    status: "idle",
  };
  let leaveSent = false;
  let leavePromise: Promise<void> | null = null;
  let reconnectAttempt: Promise<boolean> | null = null;
  let finishReconnect: ((success: boolean) => void) | null = null;

  const emit = <T extends RoomMessage>(type: T, payload: RoomEvent[T]) => {
    for (const handler of handlers.get(type) ?? []) {
      handler(payload as RoomEvent[RoomMessage]);
    }
  };

  const emitConnectionStatus = (nextStatus: RoomEvent["CONNECTION_STATUS"]["connectionStatus"]) => {
    if (connectionStatusAnnounced && connectionStatus === nextStatus) {
      return;
    }

    recordClientBreadcrumb("connection." + nextStatus);
    connectionStatus = nextStatus;
    connectionStatusAnnounced = true;
    emit("CONNECTION_STATUS", { connectionStatus });
  };

  const returnToRoomEntry = () => {
    if (disposed) {
      return;
    }

    clearStoredServerRoomSession(options.accountId);
    resetClientDiagnosticContext();
    dispatchWindowEvent(POKE_LOUNGE_FRESH_SESSION_REQUIRED_EVENT, {
      roomCode: activeRoomId === PENDING_ROOM_ID ? null : activeRoomId,
    });
  };

  const dispatchServerRoomError = (
    detail: Omit<PokeLoungeServerRoomErrorDetail, "cancel">,
    error?: unknown,
    snapshot = captureClientDiagnosticSnapshot(),
  ) => {
    if (disposed) return;
    reportClientDiagnostic({
      kind: "room",
      code: detail.code,
      roomInstanceId,
      roomCode: activeRoomId === PENDING_ROOM_ID ? undefined : activeRoomId,
      sessionId,
      userCode: ROOM_ERROR_CODES[detail.code],
      error,
      snapshot,
    });
    dispatchWindowEvent<PokeLoungeServerRoomErrorDetail>(POKE_LOUNGE_SERVER_ROOM_ERROR_EVENT, {
      ...detail,
      cancel: returnToRoomEntry,
    });
  };

  const reportTransportError = (error: Error) => {
    if (disposed) return;
    const snapshot = captureClientDiagnosticSnapshot();
    if (options.onTransportError) {
      options.onTransportError(error);
    } else {
      console.error(error);
    }

    const invalidParticipant =
      error instanceof ServerRoomRequestError && (error.status === 401 || error.status === 403);
    const recoverable =
      !invalidParticipant &&
      isRecoverableInitialWorkflowError(error) &&
      !leaveSent &&
      !cursorRegression &&
      latestState !== null &&
      !isTerminalState() &&
      latestState.participants.some(p => p.playerId === serverPlayerId && p.connected);
    dispatchServerRoomError(
      {
        code: invalidParticipant ? "CURSOR_REGRESSION" : "ROOM_TRANSPORT_FAILED",
        message: error.message,
        disconnected: !socketConnected,
        recoverable,
        ...(recoverable ? { retry: reconnectToRoom, retryKind: "reconnect" as const } : {}),
      },
      error,
      snapshot,
    );
  };

  const reconnectToRoom = (): Promise<boolean> => {
    if (reconnectAttempt) return reconnectAttempt;
    if (disposed || leaveSent || cursorRegression || !latestState || isTerminalState())
      return Promise.resolve(false);
    reconnectAttempt = (async () => {
      emitConnectionStatus("connecting");
      try {
        const room = await requestRoom(
          `/poke-lounge/rooms/${activeRoomId}?afterRevision=${Math.max(0, lastAppliedTerminalRevision)}`,
        );
        if (disposed || leaveSent || cursorRegression) return false;
        if (room.status === "closed") {
          handleMissingRoom();
          return false;
        }
        const own = room.participants.find(p => p.playerId === serverPlayerId);
        if (!own?.connected && room.status !== "completed") {
          dispatchServerRoomError({
            code: "CURSOR_REGRESSION",
            message: "The room participant is no longer connected",
            recoverable: false,
          });
          return false;
        }
        if (!applySnapshot(room))
          throw new ServerRoomTransportError(
            new Error("Room snapshot changed during reconnection"),
          );
        if (room.status === "completed") return true;

        // Confirm the existing socket subscription; never recreate a room or replay a battle action.
        const confirmation = new Promise<boolean>(resolve => {
          const timeout = window.setTimeout(() => finish(false), SERVER_ROOM_REQUEST_TIMEOUT_MS);
          const finish = (success: boolean) => {
            window.clearTimeout(timeout);
            finishReconnect = null;
            resolve(success);
          };
          finishReconnect = finish;
        });
        subscriptionFailed = true;
        subscriptionRetryRequired = true;
        const existingSocket = roomSocket;
        ensureSocket();
        existingSocket?.connect?.();
        if (socketConnected) emitRoomSubscription();
        const confirmed = await confirmation;
        if (disposed || leaveSent || cursorRegression) return false;
        if (!confirmed) throw new ServerRoomTransportError(new Error("Room reconnection failed"));
        if (pendingPartyPublication) pendingPartyPublication.recoveryAttempts = 0;
        resumePendingPartyPublication();
        return true;
      } catch (error) {
        if (!disposed && !leaveSent) {
          reportTransportError(
            error instanceof Error ? error : new ServerRoomTransportError(error),
          );
        }
        return false;
      }
    })().finally(() => {
      reconnectAttempt = null;
    });
    return reconnectAttempt;
  };

  const handleMissingRoom = () => {
    // Preserve final standings and the explicit leave flow after normal cleanup.
    // A local clock or a transport failure alone must never evict a live player.
    if (disposed || leaveSent || !latestState || isTerminalState()) return;
    disposeRoom();
    clearStoredServerRoomSession(options.accountId);
    dispatchWindowEvent<PokeLoungeFreshSessionRequiredDetail>(
      POKE_LOUNGE_FRESH_SESSION_REQUIRED_EVENT,
      { roomCode: activeRoomId, reason: "room-expired" },
    );
  };

  const requestRoom = async (path: string, init?: RequestInit): Promise<ServerRoomState> => {
    let httpResponse: RoomHttpResponse;

    try {
      httpResponse = await fetchResponseWithTimeout(`${getApiBaseUrl()}${path}`, {
        ...init,
        cache: "no-store",
        headers: {
          ...(init?.body !== undefined ? { "Content-Type": "application/json" } : {}),
          ...init?.headers,
          ...(RUST_BACKEND_ENABLED && (!init?.method || init.method === "GET")
            ? { "X-Player-Id": serverPlayerId, "X-Session-Id": sessionId }
            : {}),
        },
      });
    } catch (error) {
      throw new ServerRoomFetchError(error);
    }
    try {
      return decodeRoomResponse(httpResponse, parseServerRoomState);
    } catch (error) {
      if (isRoomNotFoundRequestError(error)) handleMissingRoom();
      throw error;
    }
  };

  const requestCompetitiveSeat = async (): Promise<CompetitiveProjection | null> => {
    const idToken = readIdToken();
    if (!idToken) {
      return null;
    }

    let httpResponse: RoomHttpResponse;
    try {
      httpResponse = await fetchResponseWithTimeout(
        `${getApiBaseUrl()}/poke-lounge/rooms/${activeRoomId}/competitive-seat`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${idToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ sessionId }),
        },
      );
    } catch (error) {
      throw new ServerRoomFetchError(error);
    }

    return decodeRoomResponse(httpResponse, body =>
      body === null ? null : parseCompetitiveProjection(body),
    );
  };

  const enqueueMutation = <T>(operation: () => Promise<T>): Promise<T> => {
    const pending = mutationQueue.then(operation);
    mutationQueue = pending.then(
      function handleResolved() {
        return undefined;
      },
      function handleResolved() {
        return undefined;
      },
    );

    return pending;
  };

  const mutateRoom = (
    path: string,
    body: unknown | (() => unknown | Promise<unknown>),
    revisionResolver: () => number | Promise<number>,
    idempotencyKey = createIdempotencyKey(),
  ): Promise<ServerRoomState> => {
    return enqueueMutation(async function callback() {
      const resolvedBody = typeof body === "function" ? await body() : body;
      const expectedRevision = await revisionResolver();
      const send = (revision: number) =>
        requestRoom(path, {
          method: "POST",
          headers: {
            "X-Idempotency-Key": idempotencyKey,
            "If-Match-Revision": String(revision),
          },
          body: JSON.stringify(resolvedBody),
        });

      try {
        return await retryOneNetworkFailure(function callback() {
          return send(expectedRevision);
        });
      } catch (error) {
        const conflict = getServerRoomConflict(error);

        if (!conflict) {
          throw error;
        }

        applySnapshot(conflict.snapshot);

        throw error;
      }
    });
  };

  const mutateIdempotentRoom = (
    path: string,
    body: unknown,
    idempotencyKey: string,
  ): Promise<ServerRoomState> => {
    return enqueueMutation(async function callback() {
      try {
        return await retryOneNetworkFailure(function callback() {
          return requestRoom(path, {
            method: "POST",
            headers: { "X-Idempotency-Key": idempotencyKey },
            body: JSON.stringify(body),
          });
        });
      } catch (error) {
        const conflict = getServerRoomConflict(error);
        if (conflict) {
          applySnapshot(conflict.snapshot);
        }
        throw error;
      }
    });
  };

  const clearRecoveryTimer = (resetAttempt = true) => {
    if (recoveryTimer !== null) {
      window.clearTimeout(recoveryTimer);
      recoveryTimer = null;
    }

    if (resetAttempt) {
      recoveryAttempt = 0;
    }
  };

  const clearInitialWorkflowTimer = (resetAttempt = true) => {
    if (initialWorkflowTimer !== null) {
      window.clearTimeout(initialWorkflowTimer);
      initialWorkflowTimer = null;
    }

    if (resetAttempt) {
      initialWorkflowAttempt = 0;
    }
  };

  const retryInitialWorkflow = () => {
    if (disposed || initialWorkflowStage === "complete") {
      return;
    }

    clearInitialWorkflowTimer(false);
    emitConnectionStatus("connecting");
    if (initialWorkflowInFlight) {
      initialWorkflowRetryQueued = true;
      return;
    }

    void runInitialWorkflow();
  };

  const scheduleInitialWorkflowRetry = (error: unknown) => {
    if (disposed || initialWorkflowStage === "complete") {
      return;
    }

    const recoverable =
      !(
        initialWorkflowStage === "open" &&
        getServerRoomConflict(error)?.code === IDEMPOTENCY_CONFLICT_CODE
      ) && isRecoverableInitialWorkflowError(error);
    if (!recoverable) clearPendingRoomEntry(initialOpenIdempotencyKey);
    const creatingRoom =
      (options.createRoom === true || options.quickPlay === true) && options.resumeRoom !== true;
    const detail = createInitialWorkflowErrorDetail(
      initialWorkflowStage,
      error,
      recoverable,
      creatingRoom,
    );
    emitConnectionStatus("offline");
    dispatchServerRoomError(
      {
        ...detail,
        ...(initialWorkflowStage === "open" && !creatingRoom ? { entryOperation: "join" } : {}),
        ...(recoverable ? { retry: retryInitialWorkflow } : {}),
      },
      error,
    );

    if (!recoverable || initialWorkflowTimer !== null) {
      return;
    }

    const delayMs = Math.min(
      RECOVERY_INITIAL_DELAY_MS * 2 ** initialWorkflowAttempt,
      INITIAL_WORKFLOW_RETRY_MAX_DELAY_MS,
    );
    initialWorkflowAttempt += 1;
    initialWorkflowTimer = window.setTimeout(function handleTimeout() {
      initialWorkflowTimer = null;
      retryInitialWorkflow();
    }, delayMs);
  };

  const clearOnlineStaleRecovery = () => {
    if (onlineStaleRecoveryTimer !== null) {
      window.clearTimeout(onlineStaleRecoveryTimer);
      onlineStaleRecoveryTimer = null;
    }

    onlineStaleRecoveryFingerprint = null;
    onlineStaleRecoveryDueAtMs = null;
    onlineStaleRecoveryAttempt = 0;
    onlineStaleRecoveryRepeats = false;
    onlineStaleRecoveryGeneration += 1;
  };

  const clearRoomClockRefresh = () => {
    if (roomClockTimer !== null) {
      window.clearTimeout(roomClockTimer);
      roomClockTimer = null;
    }

    roomClockAttempt = 0;
    roomClockTarget = null;
  };

  const hasCurrentRoomClockTarget = (target: NonNullable<typeof roomClockTarget>) =>
    latestState?.roomCode === target.roomCode &&
    latestState.revision === target.revision &&
    latestState.status === "round-started" &&
    latestState.round.phase === "round-started" &&
    latestState.round.endsAtMs === target.endsAtMs;

  const applyExpectedTransitionSnapshot = (
    state: ServerRoomState,
    repeatUntilProgress = false,
  ): boolean => {
    const applied = applySnapshot(state);
    if (applied) {
      scheduleOnlineStaleRecovery(ONLINE_STALE_RECOVERY_DELAY_MS, true, repeatUntilProgress);
    }

    return applied;
  };

  const updateReady = async (ready: boolean) => {
    const state = await mutateRoom(
      `/poke-lounge/rooms/${activeRoomId}/ready`,
      { playerId: serverPlayerId, sessionId, ready },
      getLatestRevision,
    );
    applyExpectedTransitionSnapshot(state);
  };

  const updateRoundReady = async (roundIndex: number) => {
    if (moveLearningPending || pendingPartyPublication) return;
    if (
      !roundReadyCommand ||
      roundReadyCommand.roomCode !== activeRoomId ||
      roundReadyCommand.roundIndex !== roundIndex
    ) {
      roundReadyCommand = {
        roomCode: activeRoomId,
        roundIndex,
        idempotencyKey: createIdempotencyKey(),
      };
    }

    const command = roundReadyCommand;
    const state = await enqueueMutation(function callback() {
      return retryOneNetworkFailure(function callback() {
        return requestRoom(`/poke-lounge/rooms/${activeRoomId}/round-ready`, {
          method: "POST",
          headers: { "X-Idempotency-Key": command.idempotencyKey },
          body: JSON.stringify({ playerId: serverPlayerId, sessionId, roundIndex }),
        });
      });
    });
    applyExpectedTransitionSnapshot(state, true);
  };

  const runRoomClockRefresh = async (target: NonNullable<typeof roomClockTarget>) => {
    if (disposed || roomClockInFlight || !hasCurrentRoomClockTarget(target)) {
      return;
    }

    roomClockInFlight = true;
    try {
      const room = await requestRoom(`/poke-lounge/rooms/${target.roomCode}`);
      applySnapshot(room);
      const ownParticipant = room.participants.find(function findItem(participant) {
        return participant.playerId === serverPlayerId;
      });
      if (
        isRoundReadinessDue(room.status, room.round, getServerNowMs()) &&
        ownParticipant?.role === "participant" &&
        ownParticipant.connected &&
        !ownParticipant.ready &&
        !moveLearningPending &&
        !pendingPartyPublication
      ) {
        await updateRoundReady(room.round.index);
      }
      if (hasCurrentRoomClockTarget(target)) {
        roomClockAttempt += 1;
      }
    } catch {
      if (hasCurrentRoomClockTarget(target)) {
        roomClockAttempt += 1;
      }
    } finally {
      roomClockInFlight = false;
      scheduleRoomClockRefresh();
    }
  };

  const scheduleRoomClockRefresh = () => {
    const state = latestState;
    if (
      disposed ||
      state?.status !== "round-started" ||
      state.round.phase !== "round-started" ||
      state.round.endsAtMs === null
    ) {
      clearRoomClockRefresh();
      return;
    }

    const nextTarget = {
      roomCode: state.roomCode,
      revision: state.revision,
      endsAtMs: state.round.endsAtMs,
    };
    if (!roomClockTarget || !hasCurrentRoomClockTarget(roomClockTarget)) {
      if (roomClockTimer !== null) {
        window.clearTimeout(roomClockTimer);
        roomClockTimer = null;
      }
      roomClockAttempt = 0;
      roomClockTarget = nextTarget;
    }

    if (roomClockTimer !== null || roomClockInFlight || !roomClockTarget) {
      return;
    }

    const deadlineDelayMs = Math.max(0, roomClockTarget.endsAtMs - getServerNowMs());
    const retryDelayMs =
      roomClockAttempt === 0
        ? 0
        : Math.min(
            ROOM_CLOCK_RETRY_INITIAL_DELAY_MS * 2 ** (roomClockAttempt - 1),
            ROOM_CLOCK_RETRY_MAX_DELAY_MS,
          );
    const target = roomClockTarget;
    roomClockTimer = window.setTimeout(
      function handleTimeout() {
        roomClockTimer = null;
        void runRoomClockRefresh(target);
      },
      Math.min(Math.max(deadlineDelayMs, retryDelayMs), ROOM_CLOCK_MAX_WAIT_MS),
    );
  };

  const isTerminalState = () =>
    latestState?.status === "completed" || latestState?.status === "closed";

  const clearRoomLivenessCheck = () => {
    if (roomLivenessTimer !== null) window.clearTimeout(roomLivenessTimer);
    roomLivenessTimer = null;
  };

  const scheduleRoomLivenessCheck = (immediate = false) => {
    clearRoomLivenessCheck();
    if (disposed || leaveSent || cursorRegression || !latestState || isTerminalState()) return;
    // Socket connectivity is not proof that the Redis room still exists.
    // Probe even when eliminated/spectating with no personal turn deadline.
    // Bound retries after expiry and confirm with the server to tolerate clock skew.
    const delayMs = immediate
      ? 0
      : Math.min(
          SERVER_ROOM_LIVENESS_INTERVAL_MS,
          Math.max(RECOVERY_MAX_DELAY_MS, latestState.expiresAtMs - getServerNowMs()),
        );
    roomLivenessTimer = window.setTimeout(function handleTimeout() {
      roomLivenessTimer = null;
      void runRecovery("online-probe").finally(() => scheduleRoomLivenessCheck());
    }, delayMs);
  };

  const emitRoomSubscription = () => {
    if (!roomSocket || !socketConnected || activeRoomId === PENDING_ROOM_ID) {
      return;
    }

    roomSocket.emit("room.subscribe", {
      roomCode: activeRoomId,
      playerId: serverPlayerId,
      sessionId,
      ...(usageVisitorId ? { visitorId: usageVisitorId } : {}),
      afterRevision: Math.max(0, lastAppliedTerminalRevision),
      ...(RUST_BACKEND_ENABLED && roomInstanceId ? { roomInstanceId } : {}),
    });
  };

  const shouldContinueRecovery = () =>
    !disposed &&
    !cursorRegression &&
    !isTerminalState() &&
    (!socketConnected || subscriptionFailed);

  const scheduleRecovery = () => {
    if (!shouldContinueRecovery() || recoveryTimer !== null || recoveryInFlight) {
      return;
    }

    const delayMs = Math.min(
      RECOVERY_INITIAL_DELAY_MS * 2 ** recoveryAttempt,
      RECOVERY_MAX_DELAY_MS,
    );
    recoveryAttempt += 1;
    recoveryTimer = window.setTimeout(function handleTimeout() {
      recoveryTimer = null;
      if (!shouldContinueRecovery()) {
        return;
      }
      void runRecovery();
    }, delayMs);
  };

  const runRecovery = async (origin: RecoveryOrigin = "transport") => {
    if (disposed || cursorRegression || activeRoomId === PENDING_ROOM_ID) {
      return;
    }

    if (recoveryInFlight) {
      recoveryRetryQueued = true;
      return;
    }

    const onlineExpectationBeforeRecovery = onlineStaleRecoveryFingerprint;
    const repeatOnlineExpectation = onlineStaleRecoveryRepeats;
    const onlineExpectationGeneration = onlineStaleRecoveryGeneration;
    let recoverySucceeded = false;
    let onlineProbeFailed = false;
    let retryOnlineExpectation = false;
    let applyingSnapshot = false;
    recoveryInFlight = true;
    try {
      const terminalRevisionBeforeRecovery = lastAppliedTerminalRevision;
      const room = await requestRoom(
        `/poke-lounge/rooms/${activeRoomId}?afterRevision=${Math.max(0, lastAppliedTerminalRevision)}`,
      );
      applyingSnapshot = true;
      const applied = applySnapshot(room);
      applyingSnapshot = false;
      recoverySucceeded = true;
      const terminalCursorAdvanced = lastAppliedTerminalRevision > terminalRevisionBeforeRecovery;
      retryOnlineExpectation =
        repeatOnlineExpectation &&
        onlineExpectationBeforeRecovery !== null &&
        createOnlineRecoveryFingerprint() === onlineExpectationBeforeRecovery &&
        !isTerminalState();

      if (socketConnected && subscriptionRetryRequired) {
        emitRoomSubscription();
      } else if ((applied || terminalCursorAdvanced) && !recoveryRetryQueued) {
        subscriptionFailed = false;
        if (!shouldContinueRecovery()) {
          clearRecoveryTimer();
        }
      }
      if (
        !recoveryRetryQueued &&
        room.competitiveTransitions.length === MAX_RECENT_TERMINAL_PROJECTIONS &&
        terminalCursorAdvanced
      ) {
        recoveryDrainQueued = true;
      }
    } catch (error) {
      if (applyingSnapshot) reportStateApplyFailure("RECOVERY_SNAPSHOT_APPLY_FAILED", error);
      if (origin === "online-probe") {
        onlineProbeFailed = true;
      } else {
        subscriptionFailed = socketConnected;
      }
    } finally {
      recoveryInFlight = false;

      if (recoveryDrainQueued) {
        recoveryDrainQueued = false;
        void runRecovery(origin);
        return;
      }

      if (recoveryRetryQueued) {
        recoveryRetryQueued = false;
      }

      if (onlineRecoveryQueued) {
        onlineRecoveryQueued = false;
        if (
          !onlineProbeFailed &&
          socketConnected &&
          !disposed &&
          !cursorRegression &&
          !isTerminalState()
        ) {
          void runRecovery("online-probe");
          return;
        }
      }

      if (
        onlineStaleRecoveryGeneration === onlineExpectationGeneration &&
        ((recoverySucceeded && retryOnlineExpectation) ||
          (onlineProbeFailed && !shouldContinueRecovery()))
      ) {
        const delayMs = Math.min(
          ONLINE_STALE_RECOVERY_DELAY_MS * 2 ** onlineStaleRecoveryAttempt,
          RECOVERY_MAX_DELAY_MS,
        );
        scheduleOnlineStaleRecovery(delayMs, false, true);
      } else if (
        recoverySucceeded &&
        onlineStaleRecoveryGeneration === onlineExpectationGeneration &&
        onlineExpectationBeforeRecovery !== null &&
        onlineStaleRecoveryFingerprint === onlineExpectationBeforeRecovery
      ) {
        clearOnlineStaleRecovery();
      }

      if (recoverySucceeded && !retryOnlineExpectation) {
        scheduleCurrentTurnDeadlineRecovery();
      }

      scheduleRecovery();
    }
  };

  const createOnlineRecoveryFingerprint = (): string =>
    stableJsonStringify({
      roomCode: latestState?.roomCode ?? activeRoomId,
      roomRevision: lastAppliedRoomRevision,
      terminalRevision: lastAppliedTerminalRevision,
      roomStatus: latestState?.status ?? null,
      round: latestState?.round ?? null,
      competitive: currentAssignmentProjection
        ? {
            matchId: currentAssignmentProjection.matchId,
            assignmentRevision: currentAssignmentProjection.assignmentRevision,
            currentTurn: currentAssignmentProjection.currentTurn,
            turnEndsAtMs: currentAssignmentProjection.turnEndsAtMs,
            stateHash: currentAssignmentProjection.stateHash,
            status: currentAssignmentProjection.status,
            submittedPlayerIds: currentAssignmentProjection.submittedPlayerIds,
          }
        : null,
    }) ?? "";

  const requestOnlineRecovery = () => {
    if (disposed || cursorRegression || isTerminalState() || activeRoomId === PENDING_ROOM_ID) {
      return;
    }

    if (recoveryInFlight) {
      onlineRecoveryQueued = true;
      return;
    }

    void runRecovery("online-probe");
  };

  const scheduleOnlineStaleRecovery = (
    delayMs = ONLINE_STALE_RECOVERY_DELAY_MS,
    resetAttempt = true,
    repeatUntilProgress = false,
  ) => {
    const recoveryDocument = typeof document === "undefined" ? null : document;
    if (
      !recoveryDocument ||
      recoveryDocument.visibilityState === "hidden" ||
      disposed ||
      cursorRegression ||
      isTerminalState() ||
      !socketConnected ||
      !latestState ||
      activeRoomId === PENDING_ROOM_ID
    ) {
      return;
    }

    const fingerprint = createOnlineRecoveryFingerprint();
    const normalizedDelayMs = Math.max(0, delayMs);
    const dueAtMs = Date.now() + normalizedDelayMs;
    if (resetAttempt) {
      onlineStaleRecoveryAttempt = 0;
    }
    if (
      onlineStaleRecoveryTimer !== null &&
      onlineStaleRecoveryFingerprint === fingerprint &&
      onlineStaleRecoveryDueAtMs !== null &&
      onlineStaleRecoveryDueAtMs <= dueAtMs
    ) {
      return;
    }

    if (onlineStaleRecoveryFingerprint !== fingerprint) {
      clearOnlineStaleRecovery();
    } else if (onlineStaleRecoveryTimer !== null) {
      window.clearTimeout(onlineStaleRecoveryTimer);
      onlineStaleRecoveryTimer = null;
    }
    onlineStaleRecoveryFingerprint = fingerprint;
    onlineStaleRecoveryRepeats = repeatUntilProgress;
    onlineStaleRecoveryDueAtMs = dueAtMs;
    onlineStaleRecoveryGeneration += 1;
    onlineStaleRecoveryTimer = window.setTimeout(function handleTimeout() {
      onlineStaleRecoveryTimer = null;
      onlineStaleRecoveryDueAtMs = null;
      if (createOnlineRecoveryFingerprint() !== fingerprint) {
        clearOnlineStaleRecovery();
        return;
      }

      onlineStaleRecoveryAttempt += 1;
      requestOnlineRecovery();
    }, normalizedDelayMs);
  };

  const scheduleCurrentTurnDeadlineRecovery = () => {
    const projection = currentAssignmentProjection;
    if (!projection || projection.status === "completed") {
      return;
    }

    const allPlayersSubmitted = projection.playerIds.every(function testItem(playerId) {
      return projection.submittedPlayerIds.includes(playerId);
    });
    if (allPlayersSubmitted && !onlineStaleRecoveryRepeats) {
      clearOnlineStaleRecovery();
    }
    const deadlineRecoveryDelayMs = Math.max(0, projection.turnEndsAtMs - getServerNowMs());
    scheduleOnlineStaleRecovery(
      allPlayersSubmitted
        ? ONLINE_STALE_RECOVERY_DELAY_MS
        : deadlineRecoveryDelayMs + ONLINE_STALE_RECOVERY_DELAY_MS,
      true,
      true,
    );
  };

  const handleVisibilityRecovery = () => {
    if (visibilityRecoveryDocument?.visibilityState !== "visible") {
      clearOnlineStaleRecovery();
      return;
    }

    scheduleRoomLivenessCheck(true);
  };

  const registerVisibilityRecovery = () => {
    if (visibilityRecoveryDocument || typeof document === "undefined") {
      return;
    }

    visibilityRecoveryDocument = document;
    visibilityRecoveryDocument.addEventListener("visibilitychange", handleVisibilityRecovery);
  };

  const requestTerminalRecovery = () => {
    if (disposed || cursorRegression || activeRoomId === PENDING_ROOM_ID) {
      return;
    }
    subscriptionFailed = true;
    if (recoveryInFlight) {
      recoveryRetryQueued = true;
      return;
    }
    void runRecovery();
  };

  const handleSocketConnect = () => {
    if (disposed || cursorRegression || !roomSocket || activeRoomId === PENDING_ROOM_ID) {
      return;
    }

    socketConnected = true;
    emitConnectionStatus("connecting");
    subscriptionFailed = true;
    subscriptionRetryRequired = true;
    clearRecoveryTimer();
    emitRoomSubscription();
    void runRecovery();
    scheduleOnlineStaleRecovery();
  };

  const handleSocketDisconnect = () => {
    finishReconnect?.(false);
    socketConnected = false;
    subscriptionRetryRequired = false;
    worldResyncRequested = false;
    emitConnectionStatus("offline");
    clearOnlineStaleRecovery();
    scheduleRecovery();
  };

  const handleSocketConnectError = () => {
    socketConnected = false;
    subscriptionRetryRequired = false;
    worldResyncRequested = false;
    emitConnectionStatus("offline");
    subscriptionFailed = true;
    clearOnlineStaleRecovery();
    scheduleRecovery();
  };

  const publishSharedWorldSnapshot = (
    type: "PLAYER_MOVED" | "PLAYER_MOVEMENT_ENDED" | "PLAYER_CHANGED_MAP",
  ) => {
    if (!socketConnected || !roomSocket || !latestSharedWorldSnapshot || isTerminalState()) {
      return;
    }

    const { map, x, y, facing } = latestSharedWorldSnapshot;
    roomSocket.emit("room.player-event", {
      type,
      snapshot: {
        map,
        x,
        y,
        facing,
      },
    });
  };

  const requestWorldResync = () => {
    if (
      worldResyncRequested ||
      !socketConnected ||
      !roomSocket ||
      activeRoomId === PENDING_ROOM_ID
    ) {
      return;
    }
    worldResyncRequested = true;
    roomSocket.emit("room.world-resync", { roomCode: activeRoomId });
  };

  const applyWorldPlayerEvent = (type: SharedWorldPlayerEventType, snapshot: PlayerSnapshot) => {
    worldPlayers.set(snapshot.sessionId, structuredClone(snapshot));
    if (snapshot.playerId === serverPlayerId) {
      return;
    }
    emit(type, snapshot);
  };

  const handleWorldSnapshot = (event: unknown) => {
    let snapshot: SharedWorldSnapshot;
    try {
      snapshot = parseSharedWorldSnapshot(event);
    } catch {
      worldResyncRequested = false;
      requestWorldResync();
      return;
    }
    if (snapshot.roomCode !== activeRoomId) {
      return;
    }
    if (
      worldSnapshotInitialized &&
      snapshot.worldEpoch === worldEpoch &&
      snapshot.worldSeq < lastAppliedWorldSeq
    ) {
      return;
    }

    const previousPlayerIds = new Set(worldPlayers.keys());
    const previousPlayers = new Map(worldPlayers);
    worldPlayers.clear();
    for (const player of snapshot.players) {
      worldPlayers.set(player.sessionId, structuredClone(player));
      previousPlayerIds.delete(player.sessionId);
      if (player.playerId !== serverPlayerId) {
        const previous = previousPlayers.get(player.sessionId);
        emit(
          player.controller === "ai" &&
            previous &&
            (previous.x !== player.x || previous.y !== player.y)
            ? "PLAYER_MOVED"
            : "PLAYER_CHANGED_MAP",
          player,
        );
      }
    }
    if (worldSnapshotInitialized) {
      for (const playerId of previousPlayerIds) {
        if (playerId !== serverPlayerId) {
          emit("PLAYER_LEFT", { sessionId: playerId });
        }
      }
    }
    worldEpoch = snapshot.worldEpoch;
    lastAppliedWorldSeq = snapshot.worldSeq;
    worldSnapshotInitialized = true;
    worldResyncRequested = false;
  };

  const handleWorldCursor = (event: unknown) => {
    let cursor: SharedWorldCursor;
    try {
      cursor = parseSharedWorldCursor(event);
    } catch {
      return;
    }
    if (cursor.roomCode !== activeRoomId) {
      return;
    }
    if (
      !worldSnapshotInitialized ||
      cursor.worldEpoch !== worldEpoch ||
      cursor.worldSeq > lastAppliedWorldSeq
    ) {
      requestWorldResync();
    }
  };

  const handleSocketSnapshot = (event: unknown) => {
    let room: ServerRoomState;

    try {
      room = parseSocketRoomEvent(event);
    } catch (error) {
      recordClientBreadcrumb("socket.snapshot_failed", { stage: "socket", causeType: "schema" });
      const snapshot = captureClientDiagnosticFailure(error, {
        stage: "socket",
        causeType: "schema",
      });
      reportClientDiagnostic({ kind: "room", code: "WS_SNAPSHOT_SCHEMA_FAILED", error, snapshot });
      subscriptionFailed = true;
      scheduleRecovery();
      return;
    }

    const terminalRevisionBeforeSnapshot = lastAppliedTerminalRevision;
    const applied = applySnapshot(room);

    if (
      socketConnected &&
      room.roomCode === activeRoomId &&
      (applied || lastAppliedTerminalRevision > terminalRevisionBeforeSnapshot)
    ) {
      const canResume =
        room.status === "completed" ||
        (room.status !== "closed" &&
          room.participants.some(p => p.playerId === serverPlayerId && p.connected));
      finishReconnect?.(canResume);
      if (canResume) {
        subscriptionFailed = false;
        subscriptionRetryRequired = false;
        emitConnectionStatus("online");
        clearRecoveryTimer();
      }
    }

    if (options.sharedWorldOnly && room.roomCode === activeRoomId) {
      publishSharedWorldSnapshot("PLAYER_CHANGED_MAP");
    }
  };

  const handleSharedWorldEvent = (event: unknown) => {
    const parsed = parseSharedWorldPlayerEvent(event);

    if (!parsed) {
      return;
    }
    if (!parsed.cursor) {
      if (!worldSnapshotInitialized) {
        applyWorldPlayerEvent(parsed.type, parsed.snapshot);
      }
      return;
    }
    if (
      parsed.cursor.roomCode !== activeRoomId ||
      parsed.cursor.worldEpoch !== worldEpoch ||
      parsed.cursor.worldSeq > lastAppliedWorldSeq + 1
    ) {
      requestWorldResync();
      return;
    }
    if (parsed.cursor.worldSeq <= lastAppliedWorldSeq) {
      return;
    }

    lastAppliedWorldSeq = parsed.cursor.worldSeq;
    applyWorldPlayerEvent(parsed.type, parsed.snapshot);
  };

  const handleSubscriptionError = () => {
    if (disposed || cursorRegression) {
      return;
    }

    subscriptionFailed = true;
    subscriptionRetryRequired = true;
    worldResyncRequested = false;
    emitConnectionStatus("connecting");
    clearOnlineStaleRecovery();
    scheduleRecovery();
  };

  const handleRevisionConflict = (event: unknown) => {
    let room: ServerRoomState;

    try {
      room = parseSocketRoomEvent(event);
    } catch {
      return;
    }

    if (room.roomCode !== activeRoomId || room.revision >= lastAppliedRoomRevision) {
      return;
    }

    cursorRegression = true;
    finishReconnect?.(false);
    subscriptionFailed = false;
    clearRecoveryTimer();
    clearOnlineStaleRecovery();
    clearRoomClockRefresh();
    roomSocket?.disconnect();
    clearStoredServerRoomSession(options.accountId);
    const cursorError = new Error(
      "Poke Lounge room cursor regressed; a fresh room session is required",
    );
    if (options.onTransportError) {
      options.onTransportError(cursorError);
    } else {
      console.error(cursorError);
    }
    dispatchServerRoomError(
      {
        code: "CURSOR_REGRESSION",
        message: cursorError.message,
        recoverable: false,
      },
      cursorError,
    );
    dispatchWindowEvent(POKE_LOUNGE_FRESH_SESSION_REQUIRED_EVENT, {
      roomCode: activeRoomId,
    });
    void requestLeave().catch(function handleRejected() {});
  };

  const ensureSocket = () => {
    if (roomSocket || disposed || cursorRegression || activeRoomId === PENDING_ROOM_ID) {
      return;
    }

    roomSocket = socketFactory(`${getApiBaseUrl().replace(/\/$/, "")}/poke-lounge`, {
      path: "/socket.io",
      transports: ["polling", "websocket"],
      tryAllTransports: true,
      reconnection: true,
    });
    roomSocket.on("connect", handleSocketConnect);
    roomSocket.on("connect_error", handleSocketConnectError);
    roomSocket.on("disconnect", handleSocketDisconnect);
    roomSocket.on("room.snapshot", handleSocketSnapshot);
    roomSocket.on("room.player-event", handleSharedWorldEvent);
    roomSocket.on("room.world-snapshot", handleWorldSnapshot);
    roomSocket.on("room.world-cursor", handleWorldCursor);
    roomSocket.on("room.subscription-error", handleSubscriptionError);
    roomSocket.on("room.revision-conflict", handleRevisionConflict);

    if (roomSocket.connected) {
      handleSocketConnect();
    }
  };

  const applySnapshot = (state: ServerRoomState): boolean => {
    // Ignore in-flight responses from an expired/disposed session.
    if (disposed) return false;
    if (RUST_BACKEND_ENABLED) {
      if (!state.roomInstanceId || (roomInstanceId && state.roomInstanceId !== roomInstanceId))
        return false;
      roomInstanceId = state.roomInstanceId;
    }
    const acceptsCreatedRoom = activeRoomId === PENDING_ROOM_ID;

    if (!acceptsCreatedRoom && state.roomCode !== activeRoomId) {
      return false;
    }

    // Keep one offset per room so network jitter cannot move an unchanged revision's deadlines.
    if (serverClockOffsetMs === null && state.serverNowMs !== undefined) {
      serverClockOffsetMs = state.serverNowMs - Date.now();
    }

    if (
      latestState &&
      state.revision === lastAppliedRoomRevision &&
      !hasSameCanonicalRoomProjection(latestState, state)
    ) {
      requestTerminalRecovery();
      return false;
    }

    if (!freshTerminalBaselineInitialized) {
      lastAppliedTerminalRevision = state.revision;
      freshTerminalBaselineInitialized = true;
    }

    try {
      applyTerminalTransitions(state.competitiveTransitions);
    } catch (error) {
      reportStateApplyFailure("TERMINAL_TRANSITIONS_APPLY_FAILED", error);
      requestTerminalRecovery();
      return false;
    }

    if (state.revision < lastAppliedRoomRevision) {
      return false;
    }

    const previousState = latestState;
    const previousAssignment = currentAssignmentProjection;
    latestState = state;
    const reward = [...state.competitiveTransitions]
      .reverse()
      .find(
        transition =>
          transition.projection.playerIds.includes(serverPlayerId) &&
          transition.projection.currentState.playersById[serverPlayerId]?.team.some(
            member => (member.experienceGained ?? 0) > 0,
          ),
      );
    if (reward && !hydratedTournamentRewards.has(reward.terminalEventId)) {
      hydratedTournamentRewards.add(reward.terminalEventId);
      void room.completeTournamentProgression!(reward.projection.matchId)
        .then(party => {
          if (!disposed) emit("TOURNAMENT_REWARD", { party });
        })
        .catch(error => {
          hydratedTournamentRewards.delete(reward.terminalEventId);
          reportPartyPublicationFailure(error);
        });
    }
    lastAppliedRoomRevision = state.revision;
    activeRoomId = state.roomCode;
    updateClientDiagnosticContext({
      roomInstanceId: state.roomInstanceId ?? roomInstanceId,
      round: state.round.index,
      phase: state.round.phase,
      revision: state.revision,
    });
    if (
      previousState?.round.index !== state.round.index ||
      previousState?.round.phase !== state.round.phase
    ) {
      recordClientBreadcrumb("round.changed");
    }
    latestCompetitionKind = resolveCompetitionKind(state, latestCompetitionKind);

    if (state.status === "closed") {
      clearStoredServerRoomSession(options.accountId);
    } else if (
      state.participants.some(function testItem(participant) {
        return participant.playerId === serverPlayerId;
      })
    ) {
      const activeRoom = {
        roomCode: state.roomCode,
        expiresAtMs: state.expiresAtMs,
        runId: roomRunId,
        ...(roomInstanceId ? { roomInstanceId } : {}),
      };
      const cookieWritten =
        state.serverNowMs !== undefined &&
        writeRoomResumeCookie({ ...activeRoom, playerId: serverPlayerId }, state.serverNowMs);
      writeStoredIdentity(
        {
          sessionId,
          playerId: serverPlayerId,
          activeRoom: {
            ...activeRoom,
            ...(cookieWritten ? { cookieVersion: 1 as const } : {}),
          },
        },
        options.accountId,
      );
    }

    if (
      resultSync.matchId &&
      !getReadyMatchIds(state.tournament).has(resultSync.matchId) &&
      resultSync.status !== "error"
    ) {
      resultSync = { matchId: null, status: "idle" };
    }

    emit("CURRENT_PLAYERS", createCurrentPlayersPayload());
    if (options.sharedWorldOnly && previousState) {
      const connectedPlayerIds = new Set(
        state.participants
          .filter(function filterItem(participant) {
            return participant.connected;
          })
          .map(function mapItem(participant) {
            return participant.playerId;
          }),
      );
      for (const participant of previousState.participants) {
        if (
          participant.connected &&
          participant.playerId !== serverPlayerId &&
          !connectedPlayerIds.has(participant.playerId)
        ) {
          emit("PLAYER_LEFT", { sessionId: participant.playerId });
          worldPlayers.delete(participant.playerId);
        }
      }
    }

    const selectedAssignment = selectCompetitiveAssignment(
      state.competitiveAssignments,
      serverPlayerId,
      state.round.index,
    );
    if (selectedAssignment) {
      applyCurrentAssignmentProjection(selectedAssignment);
    } else if (
      currentAssignmentProjection &&
      !canReplayCompetitiveAssignment(currentAssignmentProjection)
    ) {
      currentAssignmentProjection = null;
    }

    emitTournamentProjection(state);

    if (
      previousAssignment &&
      !terminalMatchIds.has(previousAssignment.matchId) &&
      hasCompletedBracketMatch(state, previousAssignment.bracketMatchId) &&
      !completedBracketRecoveryMatchIds.has(previousAssignment.matchId)
    ) {
      completedBracketRecoveryMatchIds.add(previousAssignment.matchId);
      requestTerminalRecovery();
    }

    if (
      onlineStaleRecoveryFingerprint !== null &&
      onlineStaleRecoveryFingerprint !== createOnlineRecoveryFingerprint()
    ) {
      clearOnlineStaleRecovery();
    }

    if (isTerminalState()) {
      clearRecoveryTimer();
      clearOnlineStaleRecovery();
    }
    scheduleRoomClockRefresh();
    scheduleRoomLivenessCheck();
    if (previousState && previousState.status !== state.status && !isPartySnapshotLocked()) {
      resumePendingPartyPublication();
    }

    return true;
  };

  const applyTerminalTransitions = (transitions: CompetitiveTerminalTransition[]) => {
    for (const transition of transitions) {
      if (transition.terminalRoomRevision <= lastAppliedTerminalRevision) {
        continue;
      }

      mergeTerminalTransition(transition);
      lastAppliedTerminalRevision = transition.terminalRoomRevision;
    }
  };

  const mergeTerminalTransition = (transition: CompetitiveTerminalTransition): boolean => {
    const cachedByEvent = recentTerminalProjections.find(function findItem(cached) {
      return cached.terminalEventId === transition.terminalEventId;
    });
    const cachedByMatch = recentTerminalProjections.find(function findItem(cached) {
      return cached.projection.matchId === transition.projection.matchId;
    });

    if (cachedByEvent || cachedByMatch) {
      if (
        cachedByEvent?.projection.matchId !== transition.projection.matchId ||
        cachedByMatch?.terminalEventId !== transition.terminalEventId
      ) {
        throw new CompetitiveProjectionSchemaError();
      }
      return false;
    }

    const previousCache = recentTerminalProjections;
    recentTerminalProjections = [...recentTerminalProjections, transition]
      .sort(compareTerminalTransitions)
      .slice(-MAX_RECENT_TERMINAL_PROJECTIONS);
    rebuildTerminalCacheKeys();

    try {
      emit("COMPETITIVE_STATE", createCompetitivePayload(transition.projection));
    } catch (error) {
      recentTerminalProjections = previousCache;
      rebuildTerminalCacheKeys();
      throw error;
    }

    return true;
  };

  const rebuildTerminalCacheKeys = () => {
    terminalEventIds.clear();
    terminalMatchIds.clear();
    for (const transition of recentTerminalProjections) {
      terminalEventIds.add(transition.terminalEventId);
      terminalMatchIds.add(transition.projection.matchId);
    }
  };

  const createCurrentPlayersPayload = (): RoomEvent["CURRENT_PLAYERS"] => ({
    players: Object.fromEntries(
      [...worldPlayers.entries()]
        .filter(function filterItem([, snapshot]) {
          return snapshot.playerId !== serverPlayerId;
        })
        .map(function mapItem([playerId, snapshot]) {
          return [playerId, structuredClone(snapshot)];
        }),
    ),
  });

  const applyCurrentAssignmentProjection = (projection: CompetitiveProjection) => {
    if (
      !canApplyCurrentAssignmentProjection(projection) ||
      !isCompetitiveProjectionAtLeastAsCurrent(currentAssignmentProjection, projection)
    ) {
      return;
    }

    const previousCompetitionKind = latestCompetitionKind;
    latestCompetitionKind = projection.kind;
    currentAssignmentProjection = projection;
    const payload = createCompetitivePayload(projection);
    const assignmentKey = `${projection.matchId}:${projection.assignmentRevision}`;

    if (announcedCompetitiveAssignmentKey !== assignmentKey) {
      announcedCompetitiveAssignmentKey = assignmentKey;
      emit("COMPETITIVE_ASSIGNMENT", payload);
    }
    emit("COMPETITIVE_STATE", payload);
    if (!recoveryInFlight) {
      scheduleCurrentTurnDeadlineRecovery();
    }

    if (latestState && previousCompetitionKind !== latestCompetitionKind) {
      emitTournamentProjection(latestState);
    }
  };

  const canApplyCurrentAssignmentProjection = (projection: CompetitiveProjection): boolean =>
    projection.status !== "completed" &&
    latestState?.tournament.activeMatchAuthority === "server" &&
    getReadyMatchIds(latestState.tournament).has(projection.bracketMatchId);

  const createTournamentProjectionPayload = (
    state: ServerRoomState,
  ): RoomEvent["TOURNAMENT_STATE"] => {
    const tournament = mapServerTournamentPlayerIds(
      state.tournament,
      mapServerPlayerIdForLocalStore,
    );
    const activeMatchTransport =
      tournament.activeMatchAuthority === "casual"
        ? "casual"
        : tournament.activeMatchAuthority === "server" &&
            currentAssignmentProjection &&
            getReadyMatchIds(tournament).has(currentAssignmentProjection.bracketMatchId)
          ? "authority"
          : "awaiting-authority";
    const seedByPlayerId = new Map(
      tournament.bracket?.participants.map(function mapItem(participant) {
        return [participant.playerId, participant.seed];
      }) ?? [],
    );

    return {
      revision: state.revision,
      roomCode: state.roomCode,
      hostPlayerId: state.hostPlayerId ? mapServerPlayerIdForLocalStore(state.hostPlayerId) : null,
      roundIndex: state.round.index,
      roomStatus: state.status,
      starterSelection: {
        mode: state.starterMode,
        seed: `${state.roomInstanceId}:${serverPlayerId}`,
      },
      roomRound: {
        ...state.round,
        startedAtMs:
          state.round.startedAtMs === null
            ? null
            : state.round.startedAtMs - (serverClockOffsetMs ?? 0),
        endsAtMs:
          state.round.endsAtMs === null ? null : state.round.endsAtMs - (serverClockOffsetMs ?? 0),
      },
      // Seed order must use server IDs, not the local-save alias assigned below.
      participants: sortTournamentParticipantsByJoinOrder(state.participants).map(
        function mapItem(participant) {
          const playerId = mapServerPlayerIdForLocalStore(participant.playerId);

          return {
            playerId,
            startPosition: getRoundStartPosition(
              participant.playerId,
              state.participants.filter(p => p.role === "participant").map(p => p.playerId),
            ),
            displayName: participant.displayName,
            ...(participant.controller === "ai"
              ? {
                  controller: "ai" as const,
                  aiDifficulty: participant.aiDifficulty ?? DEFAULT_AI_DIFFICULTY,
                }
              : {}),
            role: participant.role,
            ready: participant.ready,
            partyReady: Object.hasOwn(state.partySnapshots, participant.playerId),
            connected: participant.connected,
            seed: seedByPlayerId.get(playerId) ?? null,
          };
        },
      ),
      tournament,
      ownPlayerId: localPlayerId,
      activeMatchTransport,
      competitionKind: latestCompetitionKind,
      finalStandings: state.finalStandings.map(function mapItem(standing) {
        return {
          ...standing,
          playerId: mapServerPlayerIdForLocalStore(standing.playerId),
        };
      }),
      resultSync,
    };
  };

  const emitTournamentProjection = (state: ServerRoomState) => {
    emit("TOURNAMENT_STATE", createTournamentProjectionPayload(state));
  };

  const createCompetitivePayload = (
    projection: CompetitiveProjection,
  ): RoomEvent["COMPETITIVE_STATE"] => {
    const spectating = !projection.playerIds.includes(serverPlayerId);
    return {
      projection: {
        ...projection,
        turnEndsAtMs: projection.turnEndsAtMs - (serverClockOffsetMs ?? 0),
      },
      ownPlayerId: serverPlayerId,
      viewPlayerId: selectCompetitiveViewPlayerId(projection, serverPlayerId),
      spectating,
    };
  };

  const canReplayCompetitiveAssignment = (projection: CompetitiveProjection): boolean =>
    projection.status !== "completed" &&
    latestState?.tournament.activeMatchAuthority === "server" &&
    getReadyMatchIds(latestState.tournament).has(projection.bracketMatchId);

  const replayLatestEvent = (type: RoomMessage, handler: Handler<RoomMessage>) => {
    if (type === "CONNECTION_STATUS" && connectionStatusAnnounced) {
      handler({ connectionStatus });
      return;
    }

    if (latestState && type === "CURRENT_PLAYERS") {
      handler(createCurrentPlayersPayload());
      return;
    }

    if (latestState && type === "TOURNAMENT_STATE") {
      handler(createTournamentProjectionPayload(latestState));
      return;
    }

    if (type === "COMPETITIVE_STATE") {
      for (const transition of recentTerminalProjections) {
        handler(createCompetitivePayload(transition.projection));
      }
      if (currentAssignmentProjection) {
        handler(createCompetitivePayload(currentAssignmentProjection));
      }
      return;
    }

    if (
      currentAssignmentProjection &&
      type === "COMPETITIVE_ASSIGNMENT" &&
      canReplayCompetitiveAssignment(currentAssignmentProjection)
    ) {
      handler(createCompetitivePayload(currentAssignmentProjection));
    }
  };

  function isPartySnapshotLocked(): boolean {
    return (
      latestState?.status === "tournament" ||
      (latestState?.status === "round-started" && latestState.tournament.bracket != null) ||
      latestState?.status === "completed" ||
      latestState?.status === "closed"
    );
  }

  function canPublishParty(entry: PendingPartyPublication): boolean {
    if (disposed || leaveSent || pendingPartyPublication !== entry) return false;
    if (!isPartySnapshotLocked()) return true;
    // Preserve the initial reconciliation probe for an incomplete server snapshot.
    // Once a party or a lock response is known, never POST while locked.
    return (
      !entry.waitForUnlock &&
      !hasSynchronizedPartySnapshot &&
      !(latestState && Object.hasOwn(latestState.partySnapshots, serverPlayerId))
    );
  }

  function clearPartyRetryTimer(): void {
    if (partyRetryTimer !== null) window.clearTimeout(partyRetryTimer);
    partyRetryTimer = null;
  }

  function reportPartyPublicationFailure(error: unknown): void {
    reportTransportError(
      error instanceof Error ? error : new Error("Party synchronization failed"),
    );
  }

  function resumePendingPartyPublication(): void {
    const entry = pendingPartyPublication;
    if (!entry || entry.publishing || !canPublishParty(entry)) return;
    clearPartyRetryTimer();
    void publishPartyEntry(entry).catch(reportPartyPublicationFailure);
  }

  async function publishPartyEntry(entry: PendingPartyPublication): Promise<void> {
    if (entry.publishing) return;
    entry.publishing = true;
    try {
      // Each attempt is still serialized with ready/start/leave mutations. Recheck
      // inside the queue, not just when the UI originally requested a publication.
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const nextState = await mutateRoom(
            `/poke-lounge/rooms/${activeRoomId}/party-snapshot`,
            () => {
              if (!canPublishParty(entry)) throw new DeferredPartySnapshot();
              return {
                playerId: serverPlayerId,
                sessionId,
                displayName: entry.snapshot.displayName,
                competitiveParty: createCompetitivePartySnapshot(entry.snapshot),
              };
            },
            getLatestRevision,
            entry.idempotencyKey,
          );
          hasSynchronizedPartySnapshot = true;
          if (pendingPartyPublication === entry) pendingPartyPublication = null;
          applyExpectedTransitionSnapshot(nextState);
          return;
        } catch (error) {
          if (error instanceof DeferredPartySnapshot) {
            entry.waitForUnlock = isPartySnapshotLocked();
            return;
          }
          const response = error instanceof ServerRoomRequestError ? error.responseBody : null;
          if (
            error instanceof ServerRoomRequestError &&
            error.status === 409 &&
            response &&
            typeof response === "object" &&
            "code" in response &&
            response.code === "POKE_LOUNGE_PARTY_SNAPSHOT_LOCKED"
          ) {
            // This conflict has no embedded snapshot. Refresh it, retain the
            // latest local party, and defer instead of treating rejection as saved.
            entry.waitForUnlock = true;
            const recovered = await requestRoom(`/poke-lounge/rooms/${activeRoomId}`);
            applySnapshot(recovered);
            if (isPartySnapshotLocked() || disposed || leaveSent) return;
            if (attempt < 2) continue;
          }
          if (getServerRoomConflict(error)?.code === REVISION_CONFLICT_CODE) {
            // mutateRoom already applied the newer server revision. The exact
            // same body/key can retry, unless a newer local party superseded it.
            if (attempt < 2) continue;
          }
          throw error;
        }
      }
    } catch (error) {
      const revisionConflict = getServerRoomConflict(error)?.code === REVISION_CONFLICT_CODE;
      const retryable = error instanceof ServerRoomTransportError || revisionConflict;
      if (retryable && pendingPartyPublication !== entry) return;
      if (
        retryable &&
        pendingPartyPublication === entry &&
        !disposed &&
        !leaveSent &&
        (revisionConflict || entry.recoveryAttempts < 2)
      ) {
        clearPartyRetryTimer();
        entry.recoveryAttempts = Math.min(2, entry.recoveryAttempts + 1);
        partyRetryTimer = window.setTimeout(() => {
          partyRetryTimer = null;
          resumePendingPartyPublication();
        }, entry.recoveryAttempts * PARTY_PUBLICATION_RETRY_DELAY_MS);
        // A live room's revision contention must not replace gameplay while recovery is pending.
        return;
      }
      throw error;
    } finally {
      entry.publishing = false;
    }
  }

  const submitPartySnapshot = async (
    snapshot: PlayerSnapshot,
    idempotencyKey = createIdempotencyKey(),
  ) => {
    if (disposed || leaveSent || !(snapshot.party ?? []).some(slot => slot.pokemon != null)) return;
    clearPartyRetryTimer();
    const entry: PendingPartyPublication = {
      snapshot: structuredClone(snapshot),
      idempotencyKey,
      publishing: false,
      waitForUnlock: false,
      recoveryAttempts: 0,
    };
    pendingPartyPublication = entry;
    await publishPartyEntry(entry);
  };

  const submitCompetitiveAction = async (
    command: RoomEvent["COMPETITIVE_ACTION"],
  ): Promise<void> => {
    const projection = currentAssignmentProjection;
    if (
      projection?.matchId === command.matchId &&
      projection.assignmentRevision === command.assignmentRevision &&
      projection.currentTurn === command.turn &&
      getServerNowMs() >= projection.turnEndsAtMs
    ) {
      emit("COMPETITIVE_ACTION_FAILED", {
        matchId: command.matchId,
        status: null,
        message: "서버 상태를 다시 불러오는 중...",
      });
      requestOnlineRecovery();
      return;
    }

    let actionTrace: DiagnosticSnapshot["request"];
    const send = async () => {
      const idToken = readIdToken();
      const actionPath = idToken ? "actions" : "session-actions";
      const body = JSON.stringify({
        assignmentRevision: command.assignmentRevision,
        turn: command.turn,
        clientCommandId: command.clientCommandId,
        action: command.action,
        ...(!idToken ? { sessionId } : {}),
      });

      let httpResponse: RoomHttpResponse;
      try {
        httpResponse = await fetchResponseWithTimeout(
          `${getApiBaseUrl()}/poke-lounge/rooms/${activeRoomId}/matches/${command.matchId}/${actionPath}`,
          {
            method: "POST",
            headers: {
              ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
              "Content-Type": "application/json",
            },
            body,
          },
          command.clientCommandId,
        );
      } catch (error) {
        throw new ServerRoomFetchError(error);
      }

      actionTrace = { ...httpResponse.trace, stage: "apply", causeType: "client" };
      return decodeRoomResponse(httpResponse, parseCompetitiveProjectionContract);
    };

    try {
      const parsed = await retryOneNetworkFailure(send);
      if (disposed || leaveSent) return;
      const projection = parsed.projection;

      if (
        projection.matchId !== command.matchId ||
        projection.assignmentRevision !== command.assignmentRevision
      ) {
        throw new CompetitiveProjectionSchemaError();
      }

      if (projection.status !== "completed") {
        applyCurrentAssignmentProjection(projection);
        clearOnlineStaleRecovery();
        scheduleOnlineStaleRecovery(ONLINE_STALE_RECOVERY_DELAY_MS, true, true);
        return;
      }

      if (parsed.terminalMetadataState === "legacy-recovery-required") {
        requestTerminalRecovery();
        return;
      }

      if (
        parsed.terminalMetadataState !== "stable" ||
        typeof projection.terminalEventId !== "string" ||
        typeof projection.terminalRoomRevision !== "number"
      ) {
        throw new CompetitiveProjectionSchemaError();
      }

      mergeTerminalTransition({
        terminalEventId: projection.terminalEventId,
        terminalRoomRevision: projection.terminalRoomRevision,
        projection,
      });
      lastAppliedTerminalRevision = Math.max(
        lastAppliedTerminalRevision,
        projection.terminalRoomRevision,
      );
      clearOnlineStaleRecovery();
      scheduleOnlineStaleRecovery(ONLINE_STALE_RECOVERY_DELAY_MS, true, true);
    } catch (error) {
      if (disposed || leaveSent) return;
      const snapshot = captureClientDiagnosticSnapshot(actionTrace);
      reportClientDiagnostic({ kind: "room", code: "COMPETITIVE_ACTION_FAILED", error, snapshot });
      emit("COMPETITIVE_ACTION_FAILED", {
        matchId: command.matchId,
        status: error instanceof ServerRoomRequestError ? error.status : null,
        message: "서버 상태를 다시 불러오는 중...",
      });
      requestOnlineRecovery();
    }
  };

  const submitCasualTournamentResult = async (
    command: RoomEvent["TOURNAMENT_MATCH_RESULT"],
  ): Promise<void> => {
    const state = latestState;
    const activeMatch = findCurrentMatch(
      state?.tournament.bracket ?? null,
      state?.tournament.activeMatchId ?? null,
    );

    if (
      !state ||
      !activeMatch ||
      state.tournament.activeMatchAuthority !== "casual" ||
      command.matchId !== activeMatch.matchId ||
      !activeMatch.participantIds.includes(serverPlayerId)
    ) {
      return;
    }

    const winnerPlayerId =
      command.winnerPlayerId === localPlayerId ? serverPlayerId : command.winnerPlayerId;
    const loserPlayerId = activeMatch.participantIds.find(function findItem(playerId) {
      return playerId !== winnerPlayerId;
    });

    if (!activeMatch.participantIds.includes(winnerPlayerId) || !loserPlayerId) {
      return;
    }

    const body = {
      reportingPlayerId: serverPlayerId,
      reportingSessionId: sessionId,
      matchId: activeMatch.matchId,
      winnerPlayerId,
      loserPlayerId,
      reason: command.reason,
    };
    const idempotencyKey = createIdempotencyKey();
    resultSync = { matchId: activeMatch.matchId, status: "submitting" };
    emitTournamentProjection(state);

    try {
      const nextState = await mutateRoom(
        `/poke-lounge/rooms/${activeRoomId}/result`,
        body,
        getLatestRevision,
        idempotencyKey,
      );
      resultSync = { matchId: null, status: "idle" };
      applyExpectedTransitionSnapshot(nextState);
    } catch (error) {
      resultSync = { matchId: activeMatch.matchId, status: "recovering" };
      if (latestState) {
        emitTournamentProjection(latestState);
      }

      try {
        const recovered = await requestRoom(`/poke-lounge/rooms/${activeRoomId}`);
        applySnapshot(recovered);
      } catch {
        scheduleRecovery();
      }

      const currentState = latestState;
      if (
        error instanceof ServerRoomTransportError &&
        currentState?.tournament.activeMatchId === activeMatch.matchId
      ) {
        try {
          const retriedState = await mutateRoom(
            `/poke-lounge/rooms/${activeRoomId}/result`,
            body,
            getLatestRevision,
            idempotencyKey,
          );
          resultSync = { matchId: null, status: "idle" };
          applyExpectedTransitionSnapshot(retriedState);
          return;
        } catch {
          // Fall through to the explicit error projection below.
        }
      }

      if (latestState?.tournament.activeMatchId === activeMatch.matchId) {
        resultSync = { matchId: activeMatch.matchId, status: "error" };
        emitTournamentProjection(latestState);
      }

      throw error;
    }
  };

  const room: MultiplayerRoom = {
    get roomId() {
      return activeRoomId;
    },
    get roomInstanceId() {
      return roomInstanceId;
    },
    sessionId,
    async setLobbyReady(ready) {
      await updateReady(ready);
    },
    async setPreparationReady(roundIndex) {
      return acknowledgePreparation({
        isNeeded: () =>
          !disposed &&
          latestState?.status === "round-started" &&
          latestState.round.index === roundIndex &&
          latestState.round.startedAtMs === null &&
          !latestState.participants.find(p => p.playerId === serverPlayerId)?.ready,
        submit: () =>
          mutateRoom(
            `/poke-lounge/rooms/${activeRoomId}/ready`,
            { playerId: serverPlayerId, sessionId, ready: true, roundIndex },
            getLatestRevision,
          ),
        apply: applyExpectedTransitionSnapshot,
        isRevisionConflict: error => getServerRoomConflict(error)?.code === REVISION_CONFLICT_CODE,
      });
    },
    async startChampionship() {
      const state = await mutateRoom(
        `/poke-lounge/rooms/${activeRoomId}/start`,
        { playerId: serverPlayerId, sessionId },
        getLatestRevision,
      );
      applyExpectedTransitionSnapshot(state);
    },
    async addAiParticipant() {
      const state = await mutateRoom(
        `/poke-lounge/rooms/${activeRoomId}/ai-participants`,
        { playerId: serverPlayerId, sessionId },
        getLatestRevision,
      );
      applyExpectedTransitionSnapshot(state);
    },
    async setAiDifficulty(aiPlayerId, difficulty) {
      const state = await mutateRoom(
        `/poke-lounge/rooms/${activeRoomId}/ai-participants/${encodeURIComponent(aiPlayerId)}/difficulty`,
        { playerId: serverPlayerId, sessionId, difficulty },
        getLatestRevision,
      );
      applyExpectedTransitionSnapshot(state);
    },
    async removeAiParticipant(aiPlayerId) {
      const state = await mutateRoom(
        `/poke-lounge/rooms/${activeRoomId}/ai-participants/${encodeURIComponent(aiPlayerId)}/remove`,
        { playerId: serverPlayerId, sessionId },
        getLatestRevision,
      );
      applyExpectedTransitionSnapshot(state);
    },
    getServerNowMs,
    setMoveLearningPending(pending) {
      moveLearningPending = pending;
      if (!pending) scheduleRoomClockRefresh();
    },
    async synchronizePartyForTournament(snapshot) {
      if (
        isPartySnapshotLocked() ||
        (latestState?.status === "round-started" &&
          latestState.round.endsAtMs != null &&
          getServerNowMs() >= latestState.round.endsAtMs + TOURNAMENT_PROGRESSION_DEADLINE_MS)
      )
        return;
      await submitPartySnapshot(snapshot);
      if (pendingPartyPublication && !isPartySnapshotLocked())
        throw new Error("Party synchronization is pending");
    },
    async completeTournamentProgression(matchId, party) {
      if (party == null) {
        const current = await requestRoom(
          `/poke-lounge/rooms/${activeRoomId}/matches/${matchId}/progression-party`,
        );
        applyExpectedTransitionSnapshot(current);
        if (!current.progressionParty)
          throw new Error("Missing authoritative tournament reward party");
        return current.progressionParty;
      }
      const commandId = crypto.randomUUID();
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const next = await mutateRoom(
            `/poke-lounge/rooms/${activeRoomId}/party-snapshot`,
            {
              playerId: serverPlayerId,
              sessionId,
              competitiveParty: party,
              progressionMatchId: matchId,
            },
            getLatestRevision,
            commandId,
          );
          applyExpectedTransitionSnapshot(next);
          const value = next.progressionParty;
          if (!value) throw new Error("Missing authoritative tournament reward party");
          return value;
        } catch (error) {
          if (getServerRoomConflict(error)?.code === REVISION_CONFLICT_CODE && attempt < 2)
            continue;
          throw error;
        }
      }
      throw new Error("Tournament progression could not be saved");
    },
    connect(initialSnapshot) {
      if (disposed) {
        return;
      }

      if (connectStarted) {
        if (initialSnapshot && activeRoomId !== PENDING_ROOM_ID) {
          if (options.sharedWorldOnly) {
            latestSharedWorldSnapshot = structuredClone(initialSnapshot);
            publishSharedWorldSnapshot("PLAYER_CHANGED_MAP");
          }
          if (!options.sharedWorldOnly || options.competitiveRoundsEnabled) {
            void submitPartySnapshot(initialSnapshot).catch(reportPartyPublicationFailure);
          }
        }
        return;
      }

      connectStarted = true;
      registerVisibilityRecovery();
      emitConnectionStatus("connecting");
      const snapshot = initialSnapshot ?? createDefaultSnapshot(sessionId, localPlayerId);
      localPlayerId = snapshot.playerId?.trim() || localPlayerId;
      initialWorkflowSnapshot = structuredClone(snapshot);
      latestSharedWorldSnapshot = structuredClone(snapshot);
      void runInitialWorkflow();
    },
    leave() {
      return requestLeave().then(function handleResolved() {
        clearOnlineStaleRecovery();
        clearRoomLivenessCheck();
        clearStoredServerRoomSession(options.accountId);
      });
    },
    dispose: disposeRoom,
    send(type, payload) {
      if (disposed) {
        return;
      }

      if (
        options.sharedWorldOnly &&
        (type === "PLAYER_MOVED" ||
          type === "PLAYER_MOVEMENT_ENDED" ||
          type === "PLAYER_CHANGED_MAP")
      ) {
        latestSharedWorldSnapshot = structuredClone(payload as PlayerSnapshot);
        publishSharedWorldSnapshot(type);
        if (type === "PLAYER_CHANGED_MAP" && options.competitiveRoundsEnabled) {
          void submitPartySnapshot(payload as PlayerSnapshot).catch(reportPartyPublicationFailure);
        }
        return;
      }

      if (type === "PLAYER_CHANGED_MAP") {
        void submitPartySnapshot(payload as PlayerSnapshot).catch(reportPartyPublicationFailure);
        return;
      }

      if (type === "COMPETITIVE_ACTION") {
        void submitCompetitiveAction(payload as RoomEvent["COMPETITIVE_ACTION"]).catch(
          function handleRejected(error) {
            reportTransportError(
              error instanceof Error ? error : new ServerRoomTransportError(error),
            );
          },
        );
        return;
      }

      if (type === "TOURNAMENT_MATCH_RESULT") {
        void submitCasualTournamentResult(payload as RoomEvent["TOURNAMENT_MATCH_RESULT"]).catch(
          function handleRejected(error) {
            reportTransportError(
              error instanceof Error ? error : new ServerRoomTransportError(error),
            );
          },
        );
      }
    },
    on(type, handler) {
      const typedHandler = handler as Handler<RoomMessage>;
      const nextHandlers = handlers.get(type) ?? new Set<Handler<RoomMessage>>();
      nextHandlers.add(typedHandler);
      handlers.set(type, nextHandlers);
      replayLatestEvent(type, typedHandler);

      return function callback() {
        nextHandlers.delete(typedHandler);
      };
    },
  };

  function disposeRoom(): void {
    if (disposed) {
      return;
    }

    disposed = true;
    finishReconnect?.(false);
    clearPartyRetryTimer();
    pendingPartyPublication = null;
    emitConnectionStatus("offline");
    clearRecoveryTimer();
    clearInitialWorkflowTimer();
    clearOnlineStaleRecovery();
    clearRoomClockRefresh();
    clearRoomLivenessCheck();
    visibilityRecoveryDocument?.removeEventListener("visibilitychange", handleVisibilityRecovery);
    visibilityRecoveryDocument = null;
    if (roomSocket) {
      roomSocket.off("connect", handleSocketConnect);
      roomSocket.off("connect_error", handleSocketConnectError);
      roomSocket.off("disconnect", handleSocketDisconnect);
      roomSocket.off("room.snapshot", handleSocketSnapshot);
      roomSocket.off("room.player-event", handleSharedWorldEvent);
      roomSocket.off("room.world-snapshot", handleWorldSnapshot);
      roomSocket.off("room.world-cursor", handleWorldCursor);
      roomSocket.off("room.subscription-error", handleSubscriptionError);
      roomSocket.off("room.revision-conflict", handleRevisionConflict);
      roomSocket.disconnect();
      roomSocket = null;
    }
    handlers.clear();
    resetClientDiagnosticContext();
  }

  async function openServerRoom(snapshot: PlayerSnapshot): Promise<ServerRoomState> {
    const participantBody = {
      playerId: serverPlayerId,
      sessionId,
      displayName: snapshot.displayName,
    };

    if (options.resumeRoom) {
      let current: ServerRoomState;
      try {
        current = await requestRoom(`/poke-lounge/rooms/${activeRoomId}`);
      } catch (error) {
        if (
          !RUST_BACKEND_ENABLED ||
          !(error instanceof ServerRoomRequestError) ||
          error.status !== 403
        ) {
          throw error;
        }
        const rejoined = await mutateIdempotentRoom(
          `/poke-lounge/rooms/${activeRoomId}/join`,
          participantBody,
          initialOpenIdempotencyKey,
        );
        resumeRejoinedParticipant = true;
        return rejoined;
      }
      if (
        current.participants.some(function testItem(participant) {
          return participant.playerId === serverPlayerId;
        })
      ) {
        return current;
      }
      if (current.status !== "waiting") {
        throw new ServerRoomRequestError(410, null);
      }

      applySnapshot(current);
      const rejoined = await mutateRoom(
        `/poke-lounge/rooms/${activeRoomId}/join`,
        participantBody,
        getLatestRevision,
        initialOpenIdempotencyKey,
      );
      resumeRejoinedParticipant = true;
      return rejoined;
    }

    if (options.quickPlay) {
      return mutateIdempotentRoom(
        "/poke-lounge/rooms/quick-play",
        participantBody,
        initialOpenIdempotencyKey,
      );
    }

    const body = {
      ...participantBody,
      ...(options.createRoom && activeRoomId !== PENDING_ROOM_ID ? { roomCode: activeRoomId } : {}),
      ...(options.createRoom && options.roundDurationMs
        ? { roundDurationMs: options.roundDurationMs }
        : {}),
      ...(options.createRoom ? { visibility: options.visibility ?? "private" } : {}),
      ...(options.createRoom ? { starterMode: options.starterMode ?? "classic" } : {}),
    };

    if (options.createRoom) {
      return mutateRoom(
        "/poke-lounge/rooms",
        body,
        function callback() {
          return 0;
        },
        initialOpenIdempotencyKey,
      );
    }

    if (RUST_BACKEND_ENABLED) {
      return mutateIdempotentRoom(
        `/poke-lounge/rooms/${activeRoomId}/join`,
        body,
        initialOpenIdempotencyKey,
      );
    }

    return mutateRoom(
      `/poke-lounge/rooms/${activeRoomId}/join`,
      body,
      async function callback() {
        const current = await requestRoom(`/poke-lounge/rooms/${activeRoomId}`);
        applySnapshot(current);

        return getLatestRevision();
      },
      initialOpenIdempotencyKey,
    );
  }

  function finishInitialWorkflowForTerminalRoom(): boolean {
    if (!isTerminalState()) {
      return false;
    }

    initialWorkflowStage = "complete";
    clearPendingRoomEntry(initialOpenIdempotencyKey);
    clearInitialWorkflowTimer();
    if (socketConnected) {
      emitConnectionStatus("online");
    }

    return true;
  }

  return room;

  async function runInitialWorkflow(): Promise<void> {
    if (disposed || initialWorkflowStage === "complete" || !initialWorkflowSnapshot) {
      return;
    }

    if (initialWorkflowInFlight) {
      initialWorkflowRetryQueued = true;
      return;
    }

    initialWorkflowInFlight = true;
    try {
      emitConnectionStatus("connecting");

      if (initialWorkflowStage === "open") {
        const opened = await openServerRoom(initialWorkflowSnapshot);
        applySnapshot(opened);
        if (initialWorkflowStage === "open") {
          initialWorkflowStage =
            (options.resumeRoom && !resumeRejoinedParticipant) ||
            (options.sharedWorldOnly && !options.competitiveRoundsEnabled)
              ? "complete"
              : readIdToken()
                ? "competitive-seat"
                : "party";
        }
      }

      if (disposed) {
        return;
      }

      ensureSocket();

      if (initialWorkflowStage === "competitive-seat") {
        try {
          const assignment = await requestCompetitiveSeat();
          if (assignment) {
            applyCurrentAssignmentProjection(assignment);
          }
        } catch (error) {
          if (error instanceof CompetitiveProjectionSchemaError) {
            const recovered = await requestRoom(`/poke-lounge/rooms/${activeRoomId}`);
            applySnapshot(recovered);
          } else if (
            !(error instanceof ServerRoomRequestError) ||
            ![401, 403, 409].includes(error.status)
          ) {
            throw error;
          }
        }
        initialWorkflowStage = "party";
      }

      if (initialWorkflowStage === "party") {
        await submitPartySnapshot(initialWorkflowSnapshot, initialPartyIdempotencyKey);
        if (initialWorkflowStage === "party") {
          initialWorkflowStage = "complete";
        }
      }

      if (disposed) {
        return;
      }

      clearPendingRoomEntry(initialOpenIdempotencyKey);
      clearInitialWorkflowTimer();
      if (socketConnected && !subscriptionFailed) {
        emitConnectionStatus("online");
      }
    } catch (error) {
      if (finishInitialWorkflowForTerminalRoom()) {
        return;
      }
      if (getServerRoomConflict(error)) {
        rotateInitialWorkflowIdempotencyKey(initialWorkflowStage);
      }
      scheduleInitialWorkflowRetry(error);
    } finally {
      initialWorkflowInFlight = false;
      if (initialWorkflowRetryQueued) {
        initialWorkflowRetryQueued = false;
        retryInitialWorkflow();
      }
    }
  }

  function rotateInitialWorkflowIdempotencyKey(stage: InitialWorkflowStage): void {
    // Opening a room keeps the same command across retries and reloads.
    if (stage === "party") {
      initialPartyIdempotencyKey = createIdempotencyKey();
    }
  }

  function requestLeave(): Promise<void> {
    if (leaveSent || activeRoomId === PENDING_ROOM_ID || !latestState) {
      return leavePromise ?? Promise.resolve();
    }

    leaveSent = true;
    clearPartyRetryTimer();
    const send = () =>
      mutateRoom(
        `/poke-lounge/rooms/${activeRoomId}/leave`,
        { playerId: serverPlayerId, sessionId },
        getLatestRevision,
      );
    leavePromise = (async function callback() {
      try {
        try {
          await send();
        } catch (error) {
          if (getServerRoomConflict(error)?.code !== REVISION_CONFLICT_CODE) {
            throw error;
          }
          await send();
        }
      } catch (error) {
        // The session may have expired while its result screen was still open.
        // Only a room-not-found response completes leave; routing/auth/network
        // errors must remain failures so a live participant is not abandoned.
        if (isRoomNotFoundRequestError(error)) {
          return;
        }
        leaveSent = false;
        leavePromise = null;
        throw error;
      }
    })();

    return leavePromise;
  }

  function getLatestRevision(): number {
    if (!latestState) {
      throw new Error("Poke Lounge room revision is unavailable");
    }

    return latestState.revision;
  }

  function mapServerPlayerIdForLocalStore(playerId: string): string {
    return playerId === serverPlayerId ? localPlayerId : playerId;
  }
}

function isRoomNotFoundRequestError(error: unknown): boolean {
  return (
    error instanceof ServerRoomRequestError &&
    error.status === 404 &&
    error.responseBody !== null &&
    typeof error.responseBody === "object" &&
    "message" in error.responseBody &&
    error.responseBody.message === "Poke Lounge room not found"
  );
}

function createDefaultSnapshot(sessionId: string, playerId: string): PlayerSnapshot {
  return {
    sessionId,
    playerId,
    displayName: "Player 1",
    map: "new-bark-town",
    x: 656,
    y: 446,
    facing: "front",
  };
}

function isRecoverableInitialWorkflowError(error: unknown): boolean {
  if (isRoomFullRequestError(error)) {
    return false;
  }

  if (error instanceof ServerRoomTransportError) {
    return true;
  }

  return (
    error instanceof ServerRoomRequestError &&
    (error.status === 408 ||
      error.status === 409 ||
      error.status === 425 ||
      error.status === 429 ||
      error.status >= 500)
  );
}

function createInitialWorkflowErrorDetail(
  stage: InitialWorkflowStage,
  error: unknown,
  recoverable: boolean,
  creatingRoom: boolean,
): Omit<PokeLoungeServerRoomErrorDetail, "cancel" | "retry"> {
  const status = error instanceof ServerRoomRequestError ? error.status : null;
  const statusMessage = status ? ` (HTTP ${status})` : "";

  if (stage === "open" && isRoomFullRequestError(error)) {
    return {
      code: "ROOM_FULL",
      message: "멀티플레이 방의 최대 인원 8명이 모두 접속 중입니다.",
      recoverable: false,
    };
  }

  if (stage === "open" && !creatingRoom) {
    const code = getRoomJoinFailureCode(error);
    if (code) return { code, message: getServerRoomErrorMessage("ko-KR", code), recoverable };
  }

  switch (stage) {
    case "open":
      return {
        code: creatingRoom ? "ROOM_CREATE_FAILED" : "ROOM_JOIN_FAILED",
        message: creatingRoom
          ? `서버 방을 만들지 못했습니다${statusMessage}. 연결을 확인한 뒤 다시 시도해 주세요.`
          : `서버 방에 참가하지 못했습니다${statusMessage}. 방 코드와 연결을 확인해 주세요.`,
        recoverable,
      };
    case "competitive-seat":
      return {
        code: "ROOM_JOIN_FAILED",
        message: `서버 경기 참가 정보를 확인하지 못했습니다${statusMessage}. 다시 시도해 주세요.`,
        recoverable,
      };
    case "party":
      return {
        code: "ROOM_PARTY_SYNC_FAILED",
        message: `파티 정보를 서버와 동기화하지 못했습니다${statusMessage}. 다시 시도해 주세요.`,
        recoverable,
      };
    case "complete":
      return {
        code: "ROOM_TRANSPORT_FAILED",
        message: `서버 방 연결을 복구하지 못했습니다${statusMessage}. 다시 시도해 주세요.`,
        recoverable,
      };
  }
}

function getRoomJoinFailureCode(error: unknown): PokeLoungeServerRoomErrorDetail["code"] | null {
  if (error instanceof ServerRoomTimeoutError) return "ROOM_REQUEST_TIMEOUT";
  if (error instanceof ServerRoomTransportError) return "ROOM_NETWORK_FAILED";
  if (
    error instanceof ServerRoomJsonParseError ||
    error instanceof ServerRoomSchemaError ||
    error instanceof CompetitiveProjectionSchemaError
  )
    return "ROOM_RESPONSE_INVALID";
  if (!(error instanceof ServerRoomRequestError)) return null;
  switch (error.status) {
    case 400:
      return error.serverCode === "POKE_LOUNGE_ROOM_ALREADY_STARTED"
        ? "ROOM_ALREADY_STARTED"
        : "ROOM_REQUEST_INVALID";
    case 401:
      return "ROOM_SESSION_INVALID";
    case 403:
      return error.serverCode === "POKE_LOUNGE_ROOM_IDENTITY_MISMATCH"
        ? "ROOM_IDENTITY_MISMATCH"
        : "ROOM_ACCESS_DENIED";
    case 404:
      return error.serverCode === "ROOM_NOT_FOUND" ? "ROOM_NOT_FOUND" : "ROOM_RESPONSE_INVALID";
    case 410:
      return error.serverCode === "POKE_LOUNGE_ROOM_REJOIN_BLOCKED"
        ? "ROOM_REJOIN_BLOCKED"
        : "ROOM_EXPIRED";
    case 408:
    case 504:
      return "ROOM_REQUEST_TIMEOUT";
    case 409:
      return "ROOM_REQUEST_CONFLICT";
    case 429:
      return "ROOM_SERVER_BUSY";
    default:
      return error.status >= 500 ? "ROOM_SERVER_UNAVAILABLE" : null;
  }
}

function isRoomFullRequestError(error: unknown): boolean {
  if (!(error instanceof ServerRoomRequestError) || error.status !== 409) {
    return false;
  }

  const value = error.responseBody;
  return (
    Boolean(value) &&
    typeof value === "object" &&
    (value as Record<string, unknown>).code === ROOM_FULL_CODE
  );
}

async function retryOneNetworkFailure<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (!(error instanceof ServerRoomTransportError)) {
      throw error;
    }

    return operation();
  }
}

async function readResponseBody(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch (error) {
    throw new ServerRoomBodyReadError(error);
  }
}

function parseResponseJson(responseText: string): unknown {
  try {
    return JSON.parse(responseText) as unknown;
  } catch (error) {
    throw new ServerRoomJsonParseError(error);
  }
}

function dispatchWindowEvent<T>(eventName: string, detail: T): void {
  if (
    typeof window === "undefined" ||
    typeof window.dispatchEvent !== "function" ||
    typeof CustomEvent === "undefined"
  ) {
    return;
  }

  window.dispatchEvent(new CustomEvent<T>(eventName, { detail }));
}

export function clearStoredServerRoomResume(accountId?: string): void {
  clearRoomResumeCookie();
  clearPendingRoomEntry();
  const identity = readStoredIdentity(accountId);
  if (!identity) {
    return;
  }

  writeStoredIdentity(
    {
      sessionId: identity.sessionId,
      playerId: identity.playerId,
    },
    accountId,
  );
}

export function clearStoredServerRoomSession(accountId?: string): void {
  clearRoomResumeCookie();
  clearPendingRoomEntry();
  if (typeof window === "undefined") {
    return;
  }

  try {
    for (const storage of [window.localStorage, window.sessionStorage]) {
      storage?.removeItem(getServerIdentityStorageKey(accountId));
      if (accountId?.trim()) {
        storage?.removeItem(SERVER_IDENTITY_STORAGE_KEY);
      }
    }
  } catch {
    // A fresh identity is still generated when storage is unavailable.
  }
}

export function consumeLegacyServerRoomIdentity(accountId?: string): boolean {
  if (!RUST_BACKEND_ENABLED || typeof window === "undefined") {
    return false;
  }

  try {
    // v2 could contain URL-selected credentials, so only retire it; never copy it into v3.
    const hadCurrentIdentity = readStoredIdentity(accountId) !== null;
    const legacyKeys = new Set([
      getServerIdentityStorageKeyFor(LEGACY_RUST_IDENTITY_STORAGE_KEY, accountId),
      LEGACY_RUST_IDENTITY_STORAGE_KEY,
    ]);
    let hadLegacyIdentity = false;
    for (const storage of [window.localStorage, window.sessionStorage]) {
      for (const key of legacyKeys) {
        if (storage.getItem(key) !== null) {
          storage.removeItem(key);
          hadLegacyIdentity = true;
        }
      }
    }
    return hadLegacyIdentity && !hadCurrentIdentity;
  } catch {
    return false;
  }
}

function getServerRoomConflict(error: unknown): ServerRoomConflictResponse | null {
  if (!(error instanceof ServerRoomRequestError) || error.status !== 409) {
    return null;
  }

  const value = error.responseBody;

  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;

  if (
    record.statusCode !== 409 ||
    (record.code !== REVISION_CONFLICT_CODE && record.code !== IDEMPOTENCY_CONFLICT_CODE) ||
    typeof record.message !== "string"
  ) {
    return null;
  }

  return {
    statusCode: 409,
    code: record.code,
    message: record.message,
    snapshot: parseServerRoomState(record.snapshot),
  };
}

function parseServerRoomState(value: unknown): ServerRoomState {
  if (!value || typeof value !== "object") {
    throw new ServerRoomSchemaError();
  }

  const room = value as Record<string, unknown>;
  if (
    RUST_BACKEND_ENABLED &&
    (typeof room.roomInstanceId !== "string" || !isRoomRunId(room.roomInstanceId))
  )
    throw new ServerRoomSchemaError();

  if (
    (room.serverNowMs !== undefined &&
      (!Number.isSafeInteger(room.serverNowMs) || (room.serverNowMs as number) < 0)) ||
    typeof room.roomCode !== "string" ||
    (room.visibility !== "public" && room.visibility !== "private") ||
    (room.starterMode !== undefined && !isStarterMode(room.starterMode)) ||
    (room.hostPlayerId !== null && typeof room.hostPlayerId !== "string") ||
    !Number.isSafeInteger(room.revision) ||
    (room.revision as number) < 0 ||
    typeof room.expiresAtMs !== "number" ||
    !Number.isFinite(room.expiresAtMs) ||
    !isServerRoomStatus(room.status) ||
    !Array.isArray(room.participants) ||
    !room.partySnapshots ||
    typeof room.partySnapshots !== "object" ||
    !room.round ||
    typeof room.round !== "object" ||
    !room.tournament ||
    typeof room.tournament !== "object" ||
    !Array.isArray(room.finalStandings)
  ) {
    throw new ServerRoomSchemaError();
  }

  const participants = parseServerRoomParticipants(room.participants);
  if (
    room.hostPlayerId !== null &&
    !participants.some(function testItem(participant) {
      return participant.playerId === room.hostPlayerId;
    })
  ) {
    throw new ServerRoomSchemaError();
  }
  const round = parseServerRoomRound(room.round);
  const tournament = parseServerTournamentState(room.tournament, round.index);
  const competitiveContract = parseCompetitiveRoomSnapshotContract(room);
  const parsed: ServerRoomState = {
    ...(value as ServerRoomState),
    starterMode: room.starterMode === undefined ? "classic" : (room.starterMode as StarterMode),
    participants,
    round,
    tournament,
    competitiveTransitions: competitiveContract.competitiveTransitions,
    competitiveAssignments: competitiveContract.competitiveAssignments,
    ...(room.progressionParty
      ? {
          progressionParty: normalizeCompetitiveParty(
            room.progressionParty as CompetitivePartyInput,
          ),
        }
      : {}),
  };

  if (competitiveContract.competitive) {
    parsed.competitive = competitiveContract.competitive;
  } else {
    delete parsed.competitive;
  }

  if (
    parsed.competitiveAssignments.some(function testItem(projection) {
      return !isCompetitiveAssignmentConsistentWithRoom(parsed, projection);
    }) ||
    (parsed.competitive &&
      !isCompetitiveAssignmentConsistentWithRoom(parsed, parsed.competitive)) ||
    parsed.competitiveTransitions.some(function testItem(transition) {
      return !isTerminalTransitionConsistentWithRoom(parsed, transition);
    })
  ) {
    throw new ServerRoomSchemaError();
  }

  return parsed;
}

function isServerRoomStatus(value: unknown): value is ServerRoomState["status"] {
  return (
    value === "waiting" ||
    value === "round-started" ||
    value === "tournament" ||
    value === "completed" ||
    value === "closed"
  );
}

function parseServerRoomParticipants(value: unknown[]): ServerParticipant[] {
  const playerIds = new Set<string>();

  return value.map(function mapItem(candidate) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      throw new ServerRoomSchemaError();
    }

    const participant = candidate as Record<string, unknown>;

    if (
      typeof participant.playerId !== "string" ||
      !participant.playerId.trim() ||
      playerIds.has(participant.playerId) ||
      typeof participant.displayName !== "string" ||
      !participant.displayName.trim() ||
      (participant.role !== "participant" && participant.role !== "spectator") ||
      typeof participant.ready !== "boolean" ||
      typeof participant.connected !== "boolean" ||
      (participant.aiDifficulty !== undefined && !isAiDifficulty(participant.aiDifficulty)) ||
      !isNonnegativeTimestamp(participant.joinedAtMs) ||
      (participant.leftAtMs !== undefined && !isNonnegativeTimestamp(participant.leftAtMs))
    ) {
      throw new ServerRoomSchemaError();
    }

    playerIds.add(participant.playerId);
    return candidate as ServerParticipant;
  });
}

function isAiDifficulty(value: unknown): value is AiDifficulty {
  return value === "normal" || value === "hard";
}

function parseServerRoomRound(value: unknown): ServerRoomState["round"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ServerRoomSchemaError();
  }

  const round = value as Record<string, unknown>;
  const validPhase =
    round.phase === "waiting" ||
    round.phase === "round-started" ||
    round.phase === "tournament" ||
    round.phase === "completed";

  if (
    !Number.isSafeInteger(round.index) ||
    (round.index as number) < 1 ||
    !validPhase ||
    !Number.isSafeInteger(round.durationMs) ||
    (round.durationMs as number) < 1 ||
    (round.startedAtMs !== null && !isNonnegativeTimestamp(round.startedAtMs)) ||
    (round.endsAtMs !== null && !isNonnegativeTimestamp(round.endsAtMs))
  ) {
    throw new ServerRoomSchemaError();
  }

  return value as ServerRoomState["round"];
}

function isNonnegativeTimestamp(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function parseSocketRoomEvent(value: unknown): ServerRoomState {
  if (!value || typeof value !== "object" || !("room" in value)) {
    throw new Error("Poke Lounge socket room event is malformed");
  }

  return parseServerRoomState((value as { room: unknown }).room);
}

function parseSharedWorldPlayerEvent(value: unknown): SharedWorldPlayerEvent | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const event = value as Record<string, unknown>;
  const type = event.type;
  const snapshot = event.snapshot;
  if (
    (type !== "PLAYER_MOVED" &&
      type !== "PLAYER_MOVEMENT_ENDED" &&
      type !== "PLAYER_CHANGED_MAP") ||
    !snapshot ||
    typeof snapshot !== "object"
  ) {
    return null;
  }

  const candidate = snapshot as Record<string, unknown>;
  const parsedSnapshot = parseSharedWorldPlayer(candidate, true);
  if (!parsedSnapshot) {
    return null;
  }
  const hasCursor =
    event.roomCode !== undefined || event.worldEpoch !== undefined || event.worldSeq !== undefined;
  let cursor: SharedWorldCursor | null = null;
  if (hasCursor) {
    try {
      cursor = parseSharedWorldCursor(event);
    } catch {
      return null;
    }
  }

  return { type, snapshot: parsedSnapshot, cursor };
}

function parseSharedWorldSnapshot(value: unknown): SharedWorldSnapshot {
  const cursor = parseSharedWorldCursor(value);
  if (!value || typeof value !== "object") {
    throw new Error("Poke Lounge world snapshot is malformed");
  }
  const players = (value as Record<string, unknown>).players;
  if (!Array.isArray(players)) {
    throw new Error("Poke Lounge world snapshot is malformed");
  }
  const playerIds = new Set<string>();
  const parsedPlayers = players.map(function mapItem(player) {
    if (!player || typeof player !== "object" || Array.isArray(player)) {
      throw new Error("Poke Lounge world snapshot is malformed");
    }
    const parsed = parseSharedWorldPlayer(player as Record<string, unknown>, false);
    if (!parsed || !parsed.playerId || playerIds.has(parsed.playerId)) {
      throw new Error("Poke Lounge world snapshot is malformed");
    }
    playerIds.add(parsed.playerId);
    return parsed;
  });

  return { ...cursor, players: parsedPlayers };
}

function parseSharedWorldCursor(value: unknown): SharedWorldCursor {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Poke Lounge world cursor is malformed");
  }
  const cursor = value as Record<string, unknown>;
  if (
    typeof cursor.roomCode !== "string" ||
    !cursor.roomCode ||
    typeof cursor.worldEpoch !== "string" ||
    !cursor.worldEpoch ||
    !Number.isSafeInteger(cursor.worldSeq) ||
    (cursor.worldSeq as number) < 0
  ) {
    throw new Error("Poke Lounge world cursor is malformed");
  }

  return {
    roomCode: cursor.roomCode,
    worldEpoch: cursor.worldEpoch,
    worldSeq: cursor.worldSeq as number,
  };
}

function parseSharedWorldPlayer(
  candidate: Record<string, unknown>,
  requiresSessionId: boolean,
): PlayerSnapshot | null {
  const playerId = candidate.playerId;
  const sessionId = requiresSessionId ? candidate.sessionId : playerId;
  if (
    typeof sessionId !== "string" ||
    !sessionId ||
    typeof playerId !== "string" ||
    !playerId ||
    typeof candidate.displayName !== "string" ||
    !candidate.displayName ||
    typeof candidate.map !== "string" ||
    !candidate.map ||
    typeof candidate.x !== "number" ||
    !Number.isFinite(candidate.x) ||
    typeof candidate.y !== "number" ||
    !Number.isFinite(candidate.y) ||
    (candidate.facing !== "front" &&
      candidate.facing !== "back" &&
      candidate.facing !== "left" &&
      candidate.facing !== "right")
  ) {
    return null;
  }

  return {
    sessionId,
    playerId,
    displayName: candidate.displayName,
    map: candidate.map,
    x: candidate.x,
    y: candidate.y,
    facing: candidate.facing,
    ...(candidate.controller === "ai" ? { controller: "ai" as const } : {}),
    ...(candidate.activity === "idle" ||
    candidate.activity === "moving" ||
    candidate.activity === "hunting" ||
    candidate.activity === "recovering" ||
    candidate.activity === "tournament"
      ? { activity: candidate.activity }
      : {}),
    ...(candidate.activePokemon &&
    typeof candidate.activePokemon === "object" &&
    Number.isSafeInteger((candidate.activePokemon as Record<string, unknown>).speciesId) &&
    Number.isSafeInteger((candidate.activePokemon as Record<string, unknown>).level)
      ? {
          activePokemon: {
            speciesId: (candidate.activePokemon as { speciesId: number }).speciesId,
            name: `Pokémon #${(candidate.activePokemon as { speciesId: number }).speciesId}`,
            level: (candidate.activePokemon as { level: number }).level,
          },
        }
      : {}),
  };
}

function hasSameCanonicalRoomProjection(left: ServerRoomState, right: ServerRoomState): boolean {
  return (
    left.roomCode === right.roomCode &&
    left.visibility === right.visibility &&
    left.hostPlayerId === right.hostPlayerId &&
    left.status === right.status &&
    stableJsonStringify(left.participants) === stableJsonStringify(right.participants) &&
    stableJsonStringify(left.partySnapshots) === stableJsonStringify(right.partySnapshots) &&
    stableJsonStringify(left.round) === stableJsonStringify(right.round) &&
    stableJsonStringify(left.tournament) === stableJsonStringify(right.tournament) &&
    stableJsonStringify(left.finalStandings) === stableJsonStringify(right.finalStandings)
  );
}

function getReadyMatchIds(tournament: ServerTournamentState): Set<string> {
  return new Set(
    tournament.bracket?.currentRound?.matches
      .filter(function filterItem(match) {
        return match.status === "ready";
      })
      .map(function mapItem(match) {
        return match.matchId;
      }) ?? [],
  );
}

function isCompetitiveProjectionAtLeastAsCurrent(
  current: CompetitiveProjection | null,
  candidate: CompetitiveProjection,
): boolean {
  if (candidate.status === "completed" || candidate.terminal !== null) {
    return false;
  }

  if (!current) {
    return true;
  }

  if (candidate.bracketMatchId !== current.bracketMatchId) {
    return true;
  }

  if (
    candidate.matchId !== current.matchId ||
    candidate.assignmentRevision !== current.assignmentRevision
  ) {
    return candidate.assignmentRevision > current.assignmentRevision;
  }

  if (candidate.currentTurn !== current.currentTurn) {
    return candidate.currentTurn > current.currentTurn;
  }

  if (candidate.turnEndsAtMs !== current.turnEndsAtMs) {
    return false;
  }

  if (candidate.stateHash !== current.stateHash) {
    return false;
  }

  const statusDifference =
    getCompetitiveStatusOrder(candidate.status) - getCompetitiveStatusOrder(current.status);
  if (statusDifference < 0) {
    return false;
  }

  const candidateSubmittedPlayerIds = new Set(candidate.submittedPlayerIds);

  return current.submittedPlayerIds.every(function testItem(playerId) {
    return candidateSubmittedPlayerIds.has(playerId);
  });
}

function getCompetitiveStatusOrder(status: CompetitiveProjection["status"]): number {
  switch (status) {
    case "pending":
      return 0;
    case "active":
      return 1;
    case "completed":
      return 2;
  }
}

function stableJsonStringify(value: unknown): string | undefined {
  const sortedObjects = new WeakMap<object, Record<string, unknown>>();

  return JSON.stringify(value, function callback(_key, nestedValue: unknown) {
    if (!isPlainJsonObject(nestedValue)) {
      return nestedValue;
    }

    const existing = sortedObjects.get(nestedValue);
    if (existing) {
      return existing;
    }

    const sorted = Object.create(null) as Record<string, unknown>;
    sortedObjects.set(nestedValue, sorted);
    for (const key of Object.keys(nestedValue).sort()) {
      sorted[key] = nestedValue[key];
    }
    return sorted;
  });
}

function isPlainJsonObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);

  return prototype === Object.prototype || prototype === null;
}

function compareTerminalTransitions(
  left: CompetitiveTerminalTransition,
  right: CompetitiveTerminalTransition,
): number {
  return (
    left.terminalRoomRevision - right.terminalRoomRevision ||
    left.terminalEventId.localeCompare(right.terminalEventId)
  );
}

function resolveCompetitionKind(
  state: ServerRoomState,
  previousKind: TournamentCompetitionKind,
): TournamentCompetitionKind {
  const projectedKind =
    state.competitiveAssignments[0]?.kind ??
    state.competitive?.kind ??
    state.competitiveTransitions.at(-1)?.projection.kind;

  if (projectedKind) {
    return projectedKind;
  }

  if (state.tournament.activeMatchAuthority === "casual") {
    return "casual-unranked";
  }

  if (state.tournament.activeMatchAuthority === "server") {
    return state.tournament.bracket?.participants.length === 2
      ? "ranked-head-to-head"
      : "tournament-unranked";
  }

  return previousKind;
}

function hasCompletedBracketMatch(state: ServerRoomState, bracketMatchId: string): boolean {
  return findBracketMatch(state, bracketMatchId)?.status === "completed";
}

function isCompetitiveAssignmentConsistentWithRoom(
  state: ServerRoomState,
  projection: CompetitiveProjection,
): boolean {
  const activeMatch = state.tournament.bracket?.currentRound?.matches.find(
    function findItem(match) {
      return match.matchId === projection.bracketMatchId && match.status === "ready";
    },
  );

  return Boolean(
    state.tournament.activeMatchAuthority === "server" &&
    activeMatch &&
    projection.bracketMatchId === activeMatch.matchId &&
    hasSamePlayerIds(projection.playerIds, activeMatch.participantIds),
  );
}

function isTerminalTransitionConsistentWithRoom(
  state: ServerRoomState,
  transition: CompetitiveTerminalTransition,
): boolean {
  const projection = transition.projection;
  const terminal = projection.terminal;
  const bracketMatch = findBracketMatch(state, projection.bracketMatchId);

  if (!terminal) {
    return false;
  }

  if (!bracketMatch) {
    return Number(projection.bracketMatchId.split("-")[2]) < state.round.index;
  }

  return (
    bracketMatch.status === "completed" &&
    hasSamePlayerIds(projection.playerIds, bracketMatch.participantIds) &&
    terminal.winnerPlayerId === bracketMatch.winnerPlayerId &&
    terminal.loserPlayerId === bracketMatch.loserPlayerId &&
    terminal.reason === bracketMatch.resultReason
  );
}

function findBracketMatch(state: ServerRoomState, bracketMatchId: string) {
  const bracket = state.tournament.bracket;

  return (
    bracket?.currentRound?.matches.find(function findItem(match) {
      return match.matchId === bracketMatchId;
    }) ??
    bracket?.completedRounds
      .flatMap(function mapItem(round) {
        return round.matches;
      })
      .find(function findItem(match) {
        return match.matchId === bracketMatchId;
      }) ??
    null
  );
}

function hasSamePlayerIds(left: ReadonlyArray<string>, right: ReadonlyArray<string>): boolean {
  return (
    left.length === right.length &&
    left.every(function testItem(playerId) {
      return right.includes(playerId);
    }) &&
    right.every(function testItem(playerId) {
      return left.includes(playerId);
    })
  );
}

function resolveServerRoomSocketFactory(): ServerRoomSocketFactory {
  return function callback(url, options) {
    return RUST_BACKEND_ENABLED
      ? createRustRoomSocket(url)
      : (io(url, options) as unknown as ServerRoomSocket);
  };
}

function createIdempotencyKey(): string {
  if (typeof crypto === "undefined" || !("randomUUID" in crypto)) {
    throw new Error("crypto.randomUUID is required for Poke Lounge room commands");
  }

  return crypto.randomUUID();
}

function unwrapApiResponse<T>(value: unknown): T {
  if (value && typeof value === "object" && "data" in value) {
    return (value as { data: T }).data;
  }

  return value as T;
}

function resolveServerIdentity(options: ServerRoomOptions): {
  sessionId: string;
  playerId: string;
} {
  const stored = readStoredIdentity(options.accountId);
  const identity = {
    sessionId: stored?.sessionId ?? `server-session-${createIdentityToken()}`,
    playerId: stored?.playerId ?? `server-player-${createIdentityToken()}`,
  };

  writeStoredIdentity(stored ? { ...stored, ...identity } : identity, options.accountId);

  return identity;
}

function readStoredIdentity(accountId?: string): StoredServerRoomIdentity | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const storageKey = getServerIdentityStorageKey(accountId);
    const sources: Array<{ storage: Storage; key: string }> = [
      { storage: window.localStorage, key: storageKey },
      { storage: window.sessionStorage, key: storageKey },
      ...(accountId?.trim()
        ? [
            { storage: window.localStorage, key: SERVER_IDENTITY_STORAGE_KEY },
            { storage: window.sessionStorage, key: SERVER_IDENTITY_STORAGE_KEY },
          ]
        : []),
    ];

    for (const source of sources) {
      const identity = parseStoredIdentity(source.storage.getItem(source.key));
      if (!identity) {
        continue;
      }
      if (source.storage !== window.localStorage || source.key !== storageKey) {
        writeStoredIdentity(identity, accountId);
        try {
          const migrated = parseStoredIdentity(window.localStorage.getItem(storageKey));
          if (
            migrated?.sessionId === identity.sessionId &&
            migrated.playerId === identity.playerId
          ) {
            source.storage.removeItem(source.key);
            if (accountId?.trim()) {
              window.localStorage.removeItem(SERVER_IDENTITY_STORAGE_KEY);
              window.sessionStorage.removeItem(SERVER_IDENTITY_STORAGE_KEY);
            }
          }
        } catch {
          // The source identity is still usable when old storage cannot be removed.
        }
      }
      return identity;
    }
  } catch {
    return null;
  }

  return null;
}

function parseStoredIdentity(stored: string | null): StoredServerRoomIdentity | null {
  if (!stored) {
    return null;
  }

  try {
    const parsed = JSON.parse(stored) as Partial<StoredServerRoomIdentity>;
    if (typeof parsed.sessionId !== "string" || typeof parsed.playerId !== "string") {
      return null;
    }
    if (
      RUST_BACKEND_ENABLED &&
      // Earlier v3 builds did not write a version field, but did generate UUID v4 credentials.
      ((parsed.version !== undefined && parsed.version !== RUST_IDENTITY_STORAGE_VERSION) ||
        !RUST_SESSION_ID_PATTERN.test(parsed.sessionId) ||
        !RUST_PLAYER_ID_PATTERN.test(parsed.playerId))
    ) {
      return null;
    }

    const activeRoom = parseStoredActiveRoom(parsed.activeRoom);
    return {
      sessionId: parsed.sessionId,
      playerId: parsed.playerId,
      ...(activeRoom ? { activeRoom } : {}),
    };
  } catch {
    return null;
  }
}

function writeStoredIdentity(identity: StoredServerRoomIdentity, accountId?: string): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(
      getServerIdentityStorageKey(accountId),
      JSON.stringify(
        RUST_BACKEND_ENABLED ? { ...identity, version: RUST_IDENTITY_STORAGE_VERSION } : identity,
      ),
    );
  } catch {
    // Ignore storage failures; generated identities still work for the current page lifetime.
  }
}

export function readStoredServerRoomResume(accountId?: string): StoredServerRoomResume | null {
  const identity = readStoredIdentity(accountId);
  if (!identity) return null;
  const resumeCookie = readRoomResumeCookie();
  if (resumeCookie?.playerId === identity.playerId) {
    return {
      roomCode: resumeCookie.roomCode,
      runId: resumeCookie.runId,
      ...(resumeCookie.roomInstanceId ? { roomInstanceId: resumeCookie.roomInstanceId } : {}),
    };
  }

  const activeRoom = identity.activeRoom;
  // The cookie owns expiry for new sessions; another tab's localStorage must not revive it.
  if (!activeRoom || activeRoom.cookieVersion === 1) return null;
  if (activeRoom.expiresAtMs <= Date.now()) {
    writeStoredIdentity({ sessionId: identity.sessionId, playerId: identity.playerId }, accountId);
    return null;
  }
  return {
    roomCode: activeRoom.roomCode,
    runId: activeRoom.runId,
    ...(activeRoom.roomInstanceId ? { roomInstanceId: activeRoom.roomInstanceId } : {}),
  };
}

function parseStoredActiveRoom(value: unknown): StoredServerRoomIdentity["activeRoom"] | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const activeRoom = value as Record<string, unknown>;

  if (
    typeof activeRoom.roomCode !== "string" ||
    !SERVER_ROOM_CODE_PATTERN.test(activeRoom.roomCode) ||
    typeof activeRoom.expiresAtMs !== "number" ||
    !Number.isFinite(activeRoom.expiresAtMs) ||
    !isRoomRunId(activeRoom.runId)
  ) {
    return null;
  }

  return {
    roomCode: activeRoom.roomCode,
    expiresAtMs: activeRoom.expiresAtMs,
    runId: activeRoom.runId,
    ...(activeRoom.cookieVersion === 1 ? { cookieVersion: 1 as const } : {}),
    ...(typeof activeRoom.roomInstanceId === "string" && isRoomRunId(activeRoom.roomInstanceId)
      ? { roomInstanceId: activeRoom.roomInstanceId }
      : {}),
  };
}

function resolveServerRoomRunId(options: ServerRoomOptions): string {
  if (options.roomRunId !== undefined) {
    if (!isRoomRunId(options.roomRunId)) {
      throw new Error("Poke Lounge server room requires a room run UUID");
    }
    return options.roomRunId;
  }

  if (options.resumeRoom) {
    const activeRoom = readStoredIdentity(options.accountId)?.activeRoom;
    if (activeRoom && (!options.roomId || activeRoom.roomCode === options.roomId)) {
      return activeRoom.runId;
    }
  }

  return createRoomRunId();
}

function getServerIdentityStorageKey(accountId?: string): string {
  return getServerIdentityStorageKeyFor(SERVER_IDENTITY_STORAGE_KEY, accountId);
}

function getServerIdentityStorageKeyFor(baseKey: string, accountId?: string): string {
  const normalizedAccountId = accountId?.trim();

  return normalizedAccountId ? `${baseKey}:${encodeURIComponent(normalizedAccountId)}` : baseKey;
}

function createIdentityToken(): string {
  if (typeof crypto === "undefined" || !("randomUUID" in crypto)) {
    throw new Error("crypto.randomUUID is required for Poke Lounge room identity");
  }
  return crypto.randomUUID();
}

function resolveUsageVisitorId(playerId: string): string {
  if (memoryUsageVisitorId) return memoryUsageVisitorId;
  const previousPlayerId = playerId.slice("server-player-".length);
  const visitorId = RUST_USAGE_VISITOR_PATTERN.test(previousPlayerId)
    ? previousPlayerId
    : createIdentityToken();
  try {
    const stored = window.localStorage.getItem(USAGE_VISITOR_STORAGE_KEY);
    if (stored && RUST_USAGE_VISITOR_PATTERN.test(stored)) return (memoryUsageVisitorId = stored);
    window.localStorage.setItem(USAGE_VISITOR_STORAGE_KEY, visitorId);
    return (memoryUsageVisitorId = visitorId);
  } catch {
    return (memoryUsageVisitorId = visitorId);
  }
}
