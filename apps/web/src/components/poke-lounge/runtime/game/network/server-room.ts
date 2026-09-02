import { getApiBaseUrl } from "@/lib/constants";
import type { components } from "@/types/api";
import { io } from "socket.io-client";
import type {
  CompetitiveProjection,
  CompetitiveTerminalTransition,
  MultiplayerRoom,
  PlayerSnapshot,
  RoomEvent,
  RoomMessage,
} from "./local-preview-room";
import {
  CompetitiveProjectionSchemaError,
  parseCompetitiveProjection,
  parseCompetitiveProjectionContract,
  parseCompetitiveRoomSnapshotContract,
  selectCompetitiveAssignment,
  selectCompetitiveViewPlayerId,
} from "./competitive-projection";
import { createCompetitivePartySnapshot } from "./competitive-party-snapshot";
import {
  findCurrentMatch,
  isRoundReadinessDue,
  mapServerTournamentPlayerIds,
  parseServerTournamentState,
  type ServerTournamentState,
  type TournamentCompetitionKind,
  TournamentProjectionSchemaError,
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
type ServerParticipant = ApiServerRoom["participants"][number];
type ServerPartySnapshot = components["schemas"]["PokeLoungePartySnapshotDto"];

interface ServerRoomState {
  roomCode: string;
  visibility: ApiServerRoom["visibility"];
  hostPlayerId: string | null;
  revision: number;
  expiresAtMs: number;
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
  sessionId?: string;
  playerId?: string;
  createRoom?: boolean;
  quickPlay?: boolean;
  resumeRoom?: boolean;
  roundDurationMs?: number;
  persistRoomCodeInUrl?: boolean;
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

export interface PokeLoungeServerRoomErrorDetail {
  code:
    | "ROOM_CREATE_FAILED"
    | "ROOM_JOIN_FAILED"
    | "ROOM_PARTY_SYNC_FAILED"
    | "ROOM_READY_FAILED"
    | "ROOM_TRANSPORT_FAILED"
    | "ROOM_FULL"
    | "CURSOR_REGRESSION";
  message: string;
  recoverable: boolean;
  retry?: () => void;
  cancel: () => void;
}

interface ServerRoomSocket {
  readonly connected: boolean;
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

export type ServerRoomTransportDiagnostics = {
  socketConnected: boolean;
  transportState: "not-created" | "connected" | "disconnected";
  activeTransport: "polling" | "websocket" | "unknown" | null;
  recoveryAttempt: number;
  recoveryInFlight: boolean;
  recoveryTimerScheduled: boolean;
  subscriptionFailed: boolean;
  lastAppliedTerminalRevision: number | null;
  lastAppliedWorldSeq: number | null;
  worldEpoch: string | null;
  lastSocketErrorKind:
    "connect_error" | "disconnect" | "subscription_error" | "invalid_snapshot" | null;
  lastSocketConnectErrorClass:
    "websocket_error" | "timeout" | "server_reject" | "cors" | "unknown" | null;
  lastRecoveryFailureKind:
    "canonical_mismatch" | "transition_merge" | "recovery_parse" | "unknown" | null;
};

type RecoveryFailureKind = NonNullable<ServerRoomTransportDiagnostics["lastRecoveryFailureKind"]>;
type RecoveryOrigin = "transport" | "online-probe";

interface ServerRoomE2eDiagnosticsReader {
  getRoomTransportDiagnosticsForE2e?(): ServerRoomTransportDiagnostics;
}

export function getServerRoomTransportDiagnosticsForE2e(
  room: MultiplayerRoom | undefined,
): ServerRoomTransportDiagnostics | null {
  if (!isE2eEnabled()) {
    return null;
  }

  const reader = room as (MultiplayerRoom & ServerRoomE2eDiagnosticsReader) | undefined;

  return reader?.getRoomTransportDiagnosticsForE2e?.() ?? null;
}

const SERVER_IDENTITY_STORAGE_KEY = "poke-lounge:server-room-identity";
const SERVER_ROOM_CODE_PATTERN = /^[A-Z0-9]{6}$/;
const RECOVERY_INITIAL_DELAY_MS = 250;
const RECOVERY_MAX_DELAY_MS = 5000;
const ONLINE_STALE_RECOVERY_DELAY_MS = 3000;
const ROOM_CLOCK_RETRY_INITIAL_DELAY_MS = 250;
const ROOM_CLOCK_RETRY_MAX_DELAY_MS = 5000;
const ROOM_CLOCK_MAX_WAIT_MS = 30_000;
const SERVER_ROOM_REQUEST_TIMEOUT_MS = 10_000;
const INITIAL_WORKFLOW_RETRY_MAX_DELAY_MS = 5000;
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
  sessionId: string;
  playerId: string;
  activeRoom?: {
    roomCode: string;
    expiresAtMs: number;
  };
}

export interface StoredServerRoomResume {
  roomCode: string;
}

type InitialWorkflowStage = "open" | "competitive-seat" | "party" | "complete";

class ServerRoomRequestError extends Error {
  constructor(
    readonly status: number,
    readonly responseBody: unknown,
  ) {
    super(`Poke Lounge server room request failed: ${status}`);
  }
}

class ServerRoomTransportError extends Error {
  constructor(readonly transportCause: unknown) {
    super("Poke Lounge server room transport failed");
  }
}

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
  const identity = resolveServerIdentity(options);
  const sessionId = identity.sessionId;
  const serverPlayerId = identity.playerId;
  let localPlayerId = serverPlayerId;
  let activeRoomId = options.roomId ?? PENDING_ROOM_ID;
  const fetchImpl = options.fetch ?? fetch;
  const requestTimeoutMs = options.requestTimeoutMs ?? SERVER_ROOM_REQUEST_TIMEOUT_MS;
  const fetchResponseWithTimeout = async (
    url: string,
    init?: RequestInit,
  ): Promise<{ response: Response; responseText: string }> => {
    const controller = new AbortController();
    let timeoutHandle: number | null = null;
    const timeout = new Promise<never>(function resolvePromise(_resolve, reject) {
      timeoutHandle = window.setTimeout(function handleTimeout() {
        controller.abort();
        reject(new Error("Poke Lounge server room request timed out"));
      }, requestTimeoutMs);
    });

    try {
      const request = (async function callback() {
        const response = await fetchImpl(url, { ...init, signal: controller.signal });
        const responseText = await readResponseBody(response);

        return { response, responseText };
      })();

      return await Promise.race([request, timeout]);
    } finally {
      if (timeoutHandle !== null) {
        window.clearTimeout(timeoutHandle);
      }
    }
  };
  const socketFactory = options.socketFactory ?? resolveServerRoomSocketFactory();
  const readIdToken = () => options.getIdToken?.() ?? options.idToken;
  const handlers = new Map<RoomMessage, Set<Handler<RoomMessage>>>();
  let disposed = false;
  let recoveryTimer: number | null = null;
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
  let initialOpenIdempotencyKey = createIdempotencyKey();
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
  let currentAssignmentProjection: CompetitiveProjection | null = null;
  let recentTerminalProjections: CompetitiveTerminalTransition[] = [];
  const terminalEventIds = new Set<string>();
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
  let lastSocketErrorKind: ServerRoomTransportDiagnostics["lastSocketErrorKind"] = null;
  let lastSocketConnectErrorClass: ServerRoomTransportDiagnostics["lastSocketConnectErrorClass"] =
    null;
  let lastRecoveryFailureKind: ServerRoomTransportDiagnostics["lastRecoveryFailureKind"] = null;
  let cursorRegression = false;
  let connectStarted = false;
  let hasSynchronizedPartySnapshot = false;
  let mutationQueue: Promise<void> = Promise.resolve();
  let announcedCompetitiveAssignmentKey: string | null = null;
  let latestCompetitionKind: TournamentCompetitionKind = null;
  let resultSync: TournamentStateRoomPayload["resultSync"] = {
    matchId: null,
    status: "idle",
  };
  let leaveSent = false;
  let leavePromise: Promise<void> | null = null;

  const emit = <T extends RoomMessage>(type: T, payload: RoomEvent[T]) => {
    for (const handler of handlers.get(type) ?? []) {
      handler(payload as RoomEvent[RoomMessage]);
    }
  };

  const emitConnectionStatus = (nextStatus: RoomEvent["CONNECTION_STATUS"]["connectionStatus"]) => {
    if (connectionStatusAnnounced && connectionStatus === nextStatus) {
      return;
    }

    connectionStatus = nextStatus;
    connectionStatusAnnounced = true;
    emit("CONNECTION_STATUS", { connectionStatus });
  };

  const returnToRoomEntry = () => {
    if (disposed) {
      return;
    }

    clearStoredServerRoomSession(options.accountId);
    dispatchWindowEvent(POKE_LOUNGE_FRESH_SESSION_REQUIRED_EVENT, {
      roomCode: activeRoomId === PENDING_ROOM_ID ? null : activeRoomId,
    });
  };

  const dispatchServerRoomError = (detail: Omit<PokeLoungeServerRoomErrorDetail, "cancel">) => {
    dispatchWindowEvent<PokeLoungeServerRoomErrorDetail>(POKE_LOUNGE_SERVER_ROOM_ERROR_EVENT, {
      ...detail,
      cancel: returnToRoomEntry,
    });
  };

  const reportTransportError = (error: Error) => {
    if (options.onTransportError) {
      options.onTransportError(error);
    } else {
      console.error(error);
    }

    dispatchServerRoomError({
      code: "ROOM_TRANSPORT_FAILED",
      message: error.message,
      recoverable: true,
    });
  };

  const requestRoom = async (path: string, init?: RequestInit): Promise<ServerRoomState> => {
    let httpResponse: { response: Response; responseText: string };

    try {
      httpResponse = await fetchResponseWithTimeout(`${getApiBaseUrl()}${path}`, {
        ...init,
        headers: {
          ...(init?.body !== undefined ? { "Content-Type": "application/json" } : {}),
          ...init?.headers,
        },
      });
    } catch (error) {
      throw new ServerRoomFetchError(error);
    }
    const responseBody = parseResponseJson(httpResponse.responseText);
    const unwrapped = unwrapApiResponse<unknown>(responseBody);

    if (!httpResponse.response.ok) {
      throw new ServerRoomRequestError(httpResponse.response.status, unwrapped);
    }

    return parseServerRoomState(unwrapped);
  };

  const requestCompetitiveSeat = async (): Promise<CompetitiveProjection | null> => {
    const idToken = readIdToken();
    if (!idToken) {
      return null;
    }

    let httpResponse: { response: Response; responseText: string };
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

    const responseBody = unwrapApiResponse<unknown>(parseResponseJson(httpResponse.responseText));
    if (!httpResponse.response.ok) {
      throw new ServerRoomRequestError(httpResponse.response.status, responseBody);
    }
    if (responseBody === null) {
      return null;
    }

    return parseCompetitiveProjection(responseBody);
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

    const recoverable = isRecoverableInitialWorkflowError(error);
    const detail = createInitialWorkflowErrorDetail(
      initialWorkflowStage,
      error,
      recoverable,
      (options.createRoom === true || options.quickPlay === true) && options.resumeRoom !== true,
    );
    emitConnectionStatus("offline");
    dispatchServerRoomError({
      ...detail,
      ...(recoverable ? { retry: retryInitialWorkflow } : {}),
    });

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
        isRoundReadinessDue(room.status, room.round, Date.now()) &&
        ownParticipant?.role === "participant" &&
        ownParticipant.connected &&
        !ownParticipant.ready
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

    const deadlineDelayMs = Math.max(0, roomClockTarget.endsAtMs - Date.now());
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

  const emitRoomSubscription = () => {
    if (!roomSocket || !socketConnected || activeRoomId === PENDING_ROOM_ID) {
      return;
    }

    roomSocket.emit("room.subscribe", {
      roomCode: activeRoomId,
      playerId: serverPlayerId,
      sessionId,
      afterRevision: Math.max(0, lastAppliedTerminalRevision),
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
    recoveryInFlight = true;
    try {
      const terminalRevisionBeforeRecovery = lastAppliedTerminalRevision;
      const room = await requestRoom(
        `/poke-lounge/rooms/${activeRoomId}?afterRevision=${Math.max(0, lastAppliedTerminalRevision)}`,
      );
      const applied = applySnapshot(room);
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
        lastRecoveryFailureKind = null;
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
      lastRecoveryFailureKind = classifyRecoveryFailure(error);
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
    const deadlineRecoveryDelayMs = Math.max(0, projection.turnEndsAtMs - Date.now());
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

    scheduleOnlineStaleRecovery(0);
  };

  const registerVisibilityRecovery = () => {
    if (visibilityRecoveryDocument || typeof document === "undefined") {
      return;
    }

    visibilityRecoveryDocument = document;
    visibilityRecoveryDocument.addEventListener("visibilitychange", handleVisibilityRecovery);
  };

  const requestTerminalRecovery = (failureKind: RecoveryFailureKind = "unknown") => {
    if (disposed || cursorRegression || activeRoomId === PENDING_ROOM_ID) {
      return;
    }

    lastRecoveryFailureKind = failureKind;
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
    emitConnectionStatus("online");
    subscriptionFailed = false;
    subscriptionRetryRequired = false;
    clearRecoveryTimer();
    emitRoomSubscription();
    void runRecovery();
    scheduleOnlineStaleRecovery();
  };

  const handleSocketDisconnect = () => {
    socketConnected = false;
    subscriptionRetryRequired = false;
    worldResyncRequested = false;
    emitConnectionStatus("offline");
    lastSocketErrorKind = "disconnect";
    clearOnlineStaleRecovery();
    scheduleRecovery();
  };

  const handleSocketConnectError = (error: unknown) => {
    socketConnected = false;
    subscriptionRetryRequired = false;
    worldResyncRequested = false;
    emitConnectionStatus("offline");
    subscriptionFailed = true;
    lastSocketErrorKind = "connect_error";
    lastSocketConnectErrorClass = classifySocketConnectError(error);
    clearOnlineStaleRecovery();
    scheduleRecovery();
  };

  const publishSharedWorldSnapshot = (
    type: "PLAYER_MOVED" | "PLAYER_MOVEMENT_ENDED" | "PLAYER_CHANGED_MAP",
  ) => {
    if (!socketConnected || !roomSocket || !latestSharedWorldSnapshot) {
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
    worldPlayers.clear();
    for (const player of snapshot.players) {
      worldPlayers.set(player.sessionId, structuredClone(player));
      previousPlayerIds.delete(player.sessionId);
      if (player.playerId !== serverPlayerId) {
        emit("PLAYER_CHANGED_MAP", player);
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
    } catch {
      subscriptionFailed = true;
      lastSocketErrorKind = "invalid_snapshot";
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
      subscriptionFailed = false;
      subscriptionRetryRequired = false;
      lastRecoveryFailureKind = null;
      emitConnectionStatus("online");
      clearRecoveryTimer();
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
    lastSocketErrorKind = "subscription_error";
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
    dispatchServerRoomError({
      code: "CURSOR_REGRESSION",
      message: cursorError.message,
      recoverable: false,
    });
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
    const acceptsCreatedRoom = activeRoomId === PENDING_ROOM_ID;

    if (!acceptsCreatedRoom && state.roomCode !== activeRoomId) {
      return false;
    }

    if (
      latestState &&
      state.revision === lastAppliedRoomRevision &&
      !hasSameCanonicalRoomProjection(latestState, state)
    ) {
      requestTerminalRecovery("canonical_mismatch");
      return false;
    }

    if (!freshTerminalBaselineInitialized) {
      lastAppliedTerminalRevision = state.revision;
      freshTerminalBaselineInitialized = true;
    }

    try {
      applyTerminalTransitions(state.competitiveTransitions);
    } catch {
      requestTerminalRecovery("transition_merge");
      return false;
    }

    if (state.revision < lastAppliedRoomRevision) {
      return false;
    }

    const previousState = latestState;
    const previousAssignment = currentAssignmentProjection;
    latestState = state;
    lastAppliedRoomRevision = state.revision;
    activeRoomId = state.roomCode;
    latestCompetitionKind = resolveCompetitionKind(state, latestCompetitionKind);

    if (state.status === "closed") {
      clearStoredServerRoomSession(options.accountId);
    } else if (
      state.participants.some(function testItem(participant) {
        return participant.playerId === serverPlayerId;
      })
    ) {
      writeStoredIdentity(
        {
          sessionId,
          playerId: serverPlayerId,
          activeRoom: {
            roomCode: state.roomCode,
            expiresAtMs: state.expiresAtMs,
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
      roomRound: { ...state.round },
      participants: state.participants.map(function mapItem(participant) {
        const playerId = mapServerPlayerIdForLocalStore(participant.playerId);

        return {
          playerId,
          displayName: participant.displayName,
          ...(participant.controller === "ai" ? { controller: "ai" as const } : {}),
          role: participant.role,
          ready: participant.ready,
          partyReady: Object.hasOwn(state.partySnapshots, participant.playerId),
          connected: participant.connected,
          seed: seedByPlayerId.get(playerId) ?? null,
        };
      }),
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
      projection,
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

  const submitPartySnapshot = async (snapshot: PlayerSnapshot, idempotencyKey?: string) => {
    const isLocked =
      latestState?.status === "tournament" ||
      latestState?.status === "completed" ||
      latestState?.status === "closed";
    if (
      isLocked &&
      (hasSynchronizedPartySnapshot ||
        (latestState && Object.hasOwn(latestState.partySnapshots, serverPlayerId)))
    ) {
      return;
    }

    const nextState = await mutateRoom(
      `/poke-lounge/rooms/${activeRoomId}/party-snapshot`,
      {
        playerId: serverPlayerId,
        sessionId,
        displayName: snapshot.displayName,
        competitiveParty: createCompetitivePartySnapshot(snapshot),
      },
      getLatestRevision,
      idempotencyKey,
    );

    applyExpectedTransitionSnapshot(nextState);
    hasSynchronizedPartySnapshot = true;
  };

  const submitCompetitiveAction = async (
    command: RoomEvent["COMPETITIVE_ACTION"],
  ): Promise<void> => {
    const projection = currentAssignmentProjection;
    if (
      projection?.matchId === command.matchId &&
      projection.assignmentRevision === command.assignmentRevision &&
      projection.currentTurn === command.turn &&
      Date.now() >= projection.turnEndsAtMs
    ) {
      emit("COMPETITIVE_ACTION_FAILED", {
        matchId: command.matchId,
        status: null,
        message: "서버 상태를 다시 불러오는 중...",
      });
      requestOnlineRecovery();
      return;
    }

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

      let httpResponse: { response: Response; responseText: string };
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
        );
      } catch (error) {
        throw new ServerRoomFetchError(error);
      }

      const responseBody = unwrapApiResponse<unknown>(parseResponseJson(httpResponse.responseText));
      if (!httpResponse.response.ok) {
        throw new ServerRoomRequestError(httpResponse.response.status, responseBody);
      }
      return parseCompetitiveProjectionContract(responseBody);
    };

    try {
      const parsed = await retryOneNetworkFailure(send);
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

  const getRoomTransportDiagnosticsForE2e = (): ServerRoomTransportDiagnostics => ({
    socketConnected,
    transportState:
      roomSocket === null ? "not-created" : socketConnected ? "connected" : "disconnected",
    activeTransport: readActiveSocketTransport(roomSocket, socketConnected),
    recoveryAttempt,
    recoveryInFlight,
    recoveryTimerScheduled: recoveryTimer !== null,
    subscriptionFailed,
    lastAppliedTerminalRevision: freshTerminalBaselineInitialized
      ? lastAppliedTerminalRevision
      : null,
    lastAppliedWorldSeq: worldSnapshotInitialized ? lastAppliedWorldSeq : null,
    worldEpoch,
    lastSocketErrorKind,
    lastSocketConnectErrorClass,
    lastRecoveryFailureKind,
  });

  return {
    get roomId() {
      return activeRoomId;
    },
    sessionId,
    async setLobbyReady(ready) {
      await updateReady(ready);
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
    async removeAiParticipant(aiPlayerId) {
      const state = await mutateRoom(
        `/poke-lounge/rooms/${activeRoomId}/ai-participants/${encodeURIComponent(aiPlayerId)}/remove`,
        { playerId: serverPlayerId, sessionId },
        getLatestRevision,
      );
      applyExpectedTransitionSnapshot(state);
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
            void submitPartySnapshot(initialSnapshot).catch(function handleRejected() {});
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
        clearStoredServerRoomSession(options.accountId);
      });
    },
    dispose() {
      if (disposed) {
        return;
      }

      disposed = true;
      emitConnectionStatus("offline");
      clearRecoveryTimer();
      clearInitialWorkflowTimer();
      clearOnlineStaleRecovery();
      clearRoomClockRefresh();
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
    },
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
          void submitPartySnapshot(payload as PlayerSnapshot).catch(function handleRejected() {});
        }
        return;
      }

      if (type === "PLAYER_CHANGED_MAP") {
        void submitPartySnapshot(payload as PlayerSnapshot).catch(function handleRejected() {});
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
    ...(isE2eEnabled() ? { getRoomTransportDiagnosticsForE2e } : {}),
  };

  async function openServerRoom(snapshot: PlayerSnapshot): Promise<ServerRoomState> {
    const participantBody = {
      playerId: serverPlayerId,
      sessionId,
      displayName: snapshot.displayName,
    };

    if (options.resumeRoom) {
      const current = await requestRoom(`/poke-lounge/rooms/${activeRoomId}`);
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
      ).then(function handleResolved(state) {
        if (!disposed && options.persistRoomCodeInUrl !== false) {
          applyCreatedRoomToLocation(state.roomCode);
        }
        return state;
      });
    }

    const body = {
      ...participantBody,
      ...(options.createRoom && activeRoomId !== PENDING_ROOM_ID ? { roomCode: activeRoomId } : {}),
      ...(options.createRoom && options.roundDurationMs
        ? { roundDurationMs: options.roundDurationMs }
        : {}),
    };

    if (options.createRoom) {
      return mutateRoom(
        "/poke-lounge/rooms",
        body,
        function callback() {
          return 0;
        },
        initialOpenIdempotencyKey,
      ).then(function handleResolved(state) {
        if (!disposed && options.persistRoomCodeInUrl !== false) {
          applyCreatedRoomToLocation(state.roomCode);
        }

        return state;
      });
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
    clearInitialWorkflowTimer();
    if (socketConnected) {
      emitConnectionStatus("online");
    }

    return true;
  }

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

      clearInitialWorkflowTimer();
      if (socketConnected) {
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
    if (stage === "open") {
      initialOpenIdempotencyKey = createIdempotencyKey();
    } else if (stage === "party") {
      initialPartyIdempotencyKey = createIdempotencyKey();
    }
  }

  function requestLeave(): Promise<void> {
    if (leaveSent || activeRoomId === PENDING_ROOM_ID || !latestState) {
      return leavePromise ?? Promise.resolve();
    }

    leaveSent = true;
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

function isE2eEnabled(): boolean {
  return typeof window !== "undefined" && new URLSearchParams(window.location.search).has("e2e");
}

function readActiveSocketTransport(
  socket: ServerRoomSocket | null,
  isConnected: boolean,
): ServerRoomTransportDiagnostics["activeTransport"] {
  if (!socket || !isConnected) {
    return null;
  }

  const name = socket.io?.engine?.transport?.name;
  return name === "polling" || name === "websocket" ? name : "unknown";
}

function classifySocketConnectError(
  error: unknown,
): NonNullable<ServerRoomTransportDiagnostics["lastSocketConnectErrorClass"]> {
  const record = error && typeof error === "object" ? (error as Record<string, unknown>) : null;
  const details = [
    error instanceof Error ? error.name : undefined,
    error instanceof Error ? error.message : undefined,
    record?.name,
    record?.message,
    record?.description,
  ]
    .filter(function filterItem(value): value is string {
      return typeof value === "string";
    })
    .join(" ")
    .toLowerCase();

  if (details.includes("cors") || details.includes("cross-origin") || details.includes("origin")) {
    return "cors";
  }

  if (details.includes("timeout") || details.includes("timed out")) {
    return "timeout";
  }

  if (details.includes("websocket")) {
    return "websocket_error";
  }

  if (
    details.includes("reject") ||
    details.includes("forbidden") ||
    details.includes("unauthorized") ||
    details.includes("invalid namespace")
  ) {
    return "server_reject";
  }

  return "unknown";
}

function classifyRecoveryFailure(error: unknown): RecoveryFailureKind {
  if (
    error instanceof ServerRoomJsonParseError ||
    error instanceof ServerRoomSchemaError ||
    error instanceof TournamentProjectionSchemaError ||
    error instanceof CompetitiveProjectionSchemaError
  ) {
    return "recovery_parse";
  }

  return "unknown";
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

export function clearStoredServerRoomSession(accountId?: string): void {
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
    typeof room.roomCode !== "string" ||
    (room.visibility !== "public" && room.visibility !== "private") ||
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
    participants,
    round,
    tournament,
    competitiveTransitions: competitiveContract.competitiveTransitions,
    competitiveAssignments: competitiveContract.competitiveAssignments,
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
      !isNonnegativeTimestamp(participant.joinedAtMs) ||
      (participant.leftAtMs !== undefined && !isNonnegativeTimestamp(participant.leftAtMs))
    ) {
      throw new ServerRoomSchemaError();
    }

    playerIds.add(participant.playerId);
    return candidate as ServerParticipant;
  });
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
  if (typeof window !== "undefined" && isE2eEnabled()) {
    const e2eFactory = (
      window as Window & {
        __POKE_LOUNGE_E2E_SOCKET_FACTORY__?: ServerRoomSocketFactory;
      }
    ).__POKE_LOUNGE_E2E_SOCKET_FACTORY__;

    if (e2eFactory) {
      return e2eFactory;
    }
  }

  return function callback(url, options) {
    return io(url, options) as unknown as ServerRoomSocket;
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
  const searchParams =
    typeof window === "undefined" ? null : new URLSearchParams(window.location.search);
  const sessionIdOverride = options.sessionId ?? searchParams?.get("serverSessionId") ?? undefined;
  const playerIdOverride = options.playerId ?? searchParams?.get("serverPlayerId") ?? undefined;

  if (sessionIdOverride && playerIdOverride) {
    return {
      sessionId: sessionIdOverride,
      playerId: playerIdOverride,
    };
  }

  const stored = readStoredIdentity(options.accountId);
  const identity = {
    sessionId: sessionIdOverride ?? stored?.sessionId ?? `server-session-${createIdentityToken()}`,
    playerId: playerIdOverride ?? stored?.playerId ?? `server-player-${createIdentityToken()}`,
  };

  writeStoredIdentity(
    stored?.sessionId === identity.sessionId && stored.playerId === identity.playerId
      ? { ...stored, ...identity }
      : identity,
    options.accountId,
  );

  return identity;
}

function readStoredIdentity(accountId?: string): StoredServerRoomIdentity | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const storageKey = getServerIdentityStorageKey(accountId);
    let stored = window.localStorage?.getItem(storageKey) ?? null;

    if (!stored) {
      stored =
        window.sessionStorage?.getItem(storageKey) ??
        (accountId?.trim()
          ? (window.localStorage?.getItem(SERVER_IDENTITY_STORAGE_KEY) ?? null)
          : null) ??
        (accountId?.trim()
          ? (window.sessionStorage?.getItem(SERVER_IDENTITY_STORAGE_KEY) ?? null)
          : null);
      if (stored) {
        window.localStorage?.setItem(storageKey, stored);
        window.sessionStorage?.removeItem(storageKey);
        if (accountId?.trim()) {
          window.localStorage?.removeItem(SERVER_IDENTITY_STORAGE_KEY);
          window.sessionStorage?.removeItem(SERVER_IDENTITY_STORAGE_KEY);
        }
      }
    }

    if (!stored) {
      return null;
    }

    const parsed = JSON.parse(stored) as Partial<{
      sessionId: unknown;
      playerId: unknown;
      activeRoom: unknown;
    }>;

    if (typeof parsed.sessionId === "string" && typeof parsed.playerId === "string") {
      const activeRoom = parseStoredActiveRoom(parsed.activeRoom);

      return {
        sessionId: parsed.sessionId,
        playerId: parsed.playerId,
        ...(activeRoom ? { activeRoom } : {}),
      };
    }
  } catch {
    return null;
  }

  return null;
}

function writeStoredIdentity(identity: StoredServerRoomIdentity, accountId?: string): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(getServerIdentityStorageKey(accountId), JSON.stringify(identity));
  } catch {
    // Ignore storage failures; generated identities still work for the current page lifetime.
  }
}

export function readStoredServerRoomResume(accountId?: string): StoredServerRoomResume | null {
  const identity = readStoredIdentity(accountId);
  const activeRoom = identity?.activeRoom;

  if (!identity || !activeRoom) {
    return null;
  }

  if (activeRoom.expiresAtMs <= Date.now()) {
    writeStoredIdentity(
      {
        sessionId: identity.sessionId,
        playerId: identity.playerId,
      },
      accountId,
    );
    return null;
  }

  return { roomCode: activeRoom.roomCode };
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
    !Number.isFinite(activeRoom.expiresAtMs)
  ) {
    return null;
  }

  return {
    roomCode: activeRoom.roomCode,
    expiresAtMs: activeRoom.expiresAtMs,
  };
}

function getServerIdentityStorageKey(accountId?: string): string {
  const normalizedAccountId = accountId?.trim();

  return normalizedAccountId
    ? `${SERVER_IDENTITY_STORAGE_KEY}:${encodeURIComponent(normalizedAccountId)}`
    : SERVER_IDENTITY_STORAGE_KEY;
}

function createIdentityToken(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return Math.random().toString(36).slice(2);
}

function applyCreatedRoomToLocation(roomCode: string): void {
  if (typeof window === "undefined") {
    return;
  }

  const url = new URL(window.location.href);
  url.searchParams.delete("create");
  url.searchParams.delete("quick");
  url.searchParams.set("network", "server");
  url.searchParams.set("room", roomCode);
  window.history.replaceState(window.history.state, "", url);
}
