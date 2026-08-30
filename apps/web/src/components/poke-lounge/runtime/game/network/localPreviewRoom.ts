import {
  normalizeTournamentRoomPayload,
  type RoundScoreUpdatedRoomPayload,
  type TournamentCompletedRoomPayload,
  type TournamentMatchResultRoomPayload,
  type TournamentRoomMessageType,
  type TournamentStartedRoomPayload,
} from "./tournamentRoomProtocol";
import type { PlayerPokemonSlot } from "../player/playerTypes";
import type { PlayerPokemon } from "../state/gameStateStore";
import type { components } from "@/types/api";
import type { TournamentStateRoomPayload } from "./tournament-projection";

type GeneratedCompetitiveProjection = components["schemas"]["CompetitiveActionResponseDto"];

export type CompetitiveProjection = Omit<
  GeneratedCompetitiveProjection,
  "terminalEventId" | "terminalRoomRevision"
> & {
  terminalEventId?: string | null;
  terminalRoomRevision?: number | null;
};
export type CompetitiveTerminalMetadataState =
  "not-terminal" | "stable" | "legacy-recovery-required";
export interface CompetitiveProjectionParseResult {
  projection: CompetitiveProjection;
  terminalMetadataState: CompetitiveTerminalMetadataState;
}
export interface CompetitiveTerminalTransition {
  terminalEventId: string;
  terminalRoomRevision: number;
  projection: CompetitiveProjection;
}
export interface CompetitiveRoomSnapshotContract {
  revision: number;
  competitiveTransitions: CompetitiveTerminalTransition[];
  competitiveAssignments: CompetitiveProjection[];
  competitive?: CompetitiveProjection;
}
export type CompetitiveAction = components["schemas"]["CompetitiveActionDto"];
export interface CompetitiveActionCommand {
  matchId: string;
  assignmentRevision: number;
  turn: number;
  clientCommandId: string;
  action: CompetitiveAction;
}

export interface CompetitiveRoomProjectionEvent {
  projection: CompetitiveProjection;
  ownPlayerId: string;
  viewPlayerId?: string;
  spectating?: boolean;
}

export type PlayerFacing = "front" | "back" | "left" | "right";

export interface PlayerSnapshot {
  sessionId: string;
  playerId?: string;
  displayName?: string;
  map: string;
  x: number;
  y: number;
  facing: PlayerFacing;
  activePartySlotIndex?: number;
  party?: Array<PlayerPokemonSlot<PlayerPokemon>>;
  activePokemon?: {
    speciesId: number;
    name: string;
    level: number;
  };
}

export interface RoomEvent {
  CONNECTION_STATUS: {
    connectionStatus: "offline" | "connecting" | "online";
  };
  CURRENT_PLAYERS: { players: Record<string, PlayerSnapshot> };
  PLAYER_JOINED: PlayerSnapshot;
  PLAYER_MOVED: PlayerSnapshot;
  PLAYER_MOVEMENT_ENDED: PlayerSnapshot;
  PLAYER_CHANGED_MAP: PlayerSnapshot;
  PLAYER_LEFT: { sessionId: string };
  TOURNAMENT_STARTED: TournamentStartedRoomPayload;
  TOURNAMENT_STATE: TournamentStateRoomPayload;
  TOURNAMENT_MATCH_RESULT: TournamentMatchResultRoomPayload;
  TOURNAMENT_COMPLETED: TournamentCompletedRoomPayload;
  ROUND_SCORE_UPDATED: RoundScoreUpdatedRoomPayload;
  COMPETITIVE_ASSIGNMENT: CompetitiveRoomProjectionEvent;
  COMPETITIVE_STATE: CompetitiveRoomProjectionEvent;
  COMPETITIVE_ACTION: CompetitiveActionCommand;
  COMPETITIVE_ACTION_FAILED: { matchId: string; status: number | null; message: string };
}

export type RoomMessage = keyof RoomEvent;
export type RoomUnsubscribe = () => void;

export interface MultiplayerRoom {
  roomId: string;
  sessionId: string;
  connect(initialSnapshot?: PlayerSnapshot): void;
  setLobbyReady(ready: boolean): Promise<void>;
  startChampionship(): Promise<void>;
  leave?(): Promise<void>;
  dispose(): void;
  send<T extends RoomMessage>(type: T, payload: RoomEvent[T]): void;
  on<T extends RoomMessage>(type: T, handler: (payload: RoomEvent[T]) => void): RoomUnsubscribe;
}

type Handler<T extends RoomMessage> = (payload: RoomEvent[T]) => void;

export interface LocalPreviewRoomOptions {
  roomId?: string;
  sessionId?: string;
  channelFactory?: (name: string) => BroadcastChannel;
}

type LocalPreviewChannelMessageBody =
  | {
      kind: "HELLO";
      payload: PlayerSnapshot;
    }
  | {
      kind: "HELLO_ECHO";
      targetSessionId: string;
      payload: PlayerSnapshot;
    }
  | {
      kind: "ROOM_EVENT";
      eventType: RoomMessage;
      payload: RoomEvent[RoomMessage];
    };

type LocalPreviewChannelMessage = LocalPreviewChannelMessageBody & {
  protocol: typeof LOCAL_PREVIEW_PROTOCOL;
  roomId: string;
  sourceSessionId: string;
};

interface LocalPreviewMessageTransport {
  postMessage(message: LocalPreviewChannelMessage): void;
  close(): void;
}

const LOCAL_PREVIEW_PROTOCOL = "poke-lounge-local-preview";
const DEFAULT_LOCAL_ROOM_ID = "local-preview";
const ROOM_MESSAGES = new Set<RoomMessage>([
  "CURRENT_PLAYERS",
  "PLAYER_JOINED",
  "PLAYER_MOVED",
  "PLAYER_MOVEMENT_ENDED",
  "PLAYER_CHANGED_MAP",
  "PLAYER_LEFT",
  "TOURNAMENT_STARTED",
  "TOURNAMENT_STATE",
  "TOURNAMENT_MATCH_RESULT",
  "TOURNAMENT_COMPLETED",
  "ROUND_SCORE_UPDATED",
  "COMPETITIVE_ASSIGNMENT",
  "COMPETITIVE_STATE",
  "COMPETITIVE_ACTION",
  "COMPETITIVE_ACTION_FAILED",
]);
const SNAPSHOT_EVENTS = new Set<RoomMessage>([
  "PLAYER_JOINED",
  "PLAYER_MOVED",
  "PLAYER_MOVEMENT_ENDED",
  "PLAYER_CHANGED_MAP",
]);
const TOURNAMENT_ROOM_MESSAGES = new Set<TournamentRoomMessageType>([
  "TOURNAMENT_STARTED",
  "TOURNAMENT_MATCH_RESULT",
  "TOURNAMENT_COMPLETED",
  "ROUND_SCORE_UPDATED",
]);

export function createLocalPreviewRoom(options: LocalPreviewRoomOptions = {}): MultiplayerRoom {
  const roomId = options.roomId ?? readRoomIdFromLocation() ?? DEFAULT_LOCAL_ROOM_ID;
  const channelName = `poke-lounge:${roomId}`;
  const sessionId = options.sessionId ?? `local-${Math.random().toString(16).slice(2, 6)}`;
  const handlers = new Map<RoomMessage, Set<Handler<RoomMessage>>>();
  const players: Record<string, PlayerSnapshot> = {};
  let transport: LocalPreviewMessageTransport | null = null;
  let connected = false;
  let disposed = false;
  let localSnapshot: PlayerSnapshot | null = null;
  let connectionStatus: RoomEvent["CONNECTION_STATUS"]["connectionStatus"] = "offline";
  let connectionStatusAnnounced = false;

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

  const postChannelMessage = (message: LocalPreviewChannelMessageBody) => {
    if (disposed) {
      return;
    }

    transport?.postMessage({
      protocol: LOCAL_PREVIEW_PROTOCOL,
      roomId,
      sourceSessionId: sessionId,
      ...message,
    });
  };

  const upsertRemoteSnapshot = (snapshot: PlayerSnapshot): PlayerSnapshot => {
    const nextSnapshot = mergeSnapshot(players[snapshot.sessionId], snapshot, snapshot.sessionId);
    players[nextSnapshot.sessionId] = nextSnapshot;

    return nextSnapshot;
  };

  const handleChannelMessage = (event: MessageEvent<unknown>) => {
    const message = toLocalPreviewChannelMessage(event.data);

    if (!message || message.roomId !== roomId || message.sourceSessionId === sessionId) {
      return;
    }

    if (message.kind === "HELLO") {
      const snapshot = upsertRemoteSnapshot({
        ...message.payload,
        sessionId: message.sourceSessionId,
      });
      emit("PLAYER_JOINED", snapshot);

      if (connected && localSnapshot) {
        postChannelMessage({
          kind: "HELLO_ECHO",
          targetSessionId: message.sourceSessionId,
          payload: cloneSnapshot(localSnapshot),
        });
      }
      return;
    }

    if (message.kind === "HELLO_ECHO") {
      if (message.targetSessionId !== sessionId) {
        return;
      }

      const snapshot = upsertRemoteSnapshot({
        ...message.payload,
        sessionId: message.sourceSessionId,
      });
      emit("PLAYER_JOINED", snapshot);
      return;
    }

    if (message.kind === "ROOM_EVENT") {
      if (!ROOM_MESSAGES.has(message.eventType)) {
        return;
      }

      if (message.eventType === "PLAYER_LEFT") {
        const payload = { sessionId: message.sourceSessionId };
        delete players[payload.sessionId];
        emit("PLAYER_LEFT", payload);
        return;
      }

      if (SNAPSHOT_EVENTS.has(message.eventType)) {
        const snapshot = upsertRemoteSnapshot({
          ...(message.payload as PlayerSnapshot),
          sessionId: message.sourceSessionId,
        });
        emit(message.eventType, snapshot);
        return;
      }

      if (message.eventType === "CURRENT_PLAYERS") {
        emit("CURRENT_PLAYERS", message.payload as RoomEvent["CURRENT_PLAYERS"]);
        return;
      }

      if (isTournamentRoomMessage(message.eventType)) {
        const payload = normalizeTournamentRoomPayload(message.eventType, message.payload);

        if (payload) {
          emit(message.eventType, payload as RoomEvent[typeof message.eventType]);
        }
      }
    }
  };

  const ensureTransport = (): LocalPreviewMessageTransport => {
    transport ??= createMessageTransport(channelName, options.channelFactory, handleChannelMessage);

    return transport;
  };

  return {
    roomId,
    sessionId,
    setLobbyReady: async () => undefined,
    startChampionship: async () => undefined,
    connect(initialSnapshot) {
      if (disposed || connected) {
        return;
      }

      emitConnectionStatus("connecting");
      ensureTransport();
      connected = true;
      emitConnectionStatus("online");
      localSnapshot = normalizeLocalSnapshot(sessionId, initialSnapshot);
      players[sessionId] = localSnapshot;
      emit("CURRENT_PLAYERS", { players: clonePlayers(players) });
      postChannelMessage({
        kind: "HELLO",
        payload: cloneSnapshot(localSnapshot),
      });
    },
    dispose() {
      if (disposed) {
        return;
      }

      const wasConnected = connected;
      connected = false;

      if (wasConnected) {
        const payload = { sessionId };
        postChannelMessage({
          kind: "ROOM_EVENT",
          eventType: "PLAYER_LEFT",
          payload,
        });
        emit("PLAYER_LEFT", payload);
      }

      emitConnectionStatus("offline");
      disposed = true;
      delete players[sessionId];
      transport?.close();
      handlers.clear();
    },
    send(type, payload) {
      if (disposed) {
        return;
      }

      let outboundPayload: RoomEvent[RoomMessage] = payload;

      if (SNAPSHOT_EVENTS.has(type)) {
        localSnapshot = mergeSnapshot(
          localSnapshot ?? undefined,
          payload as PlayerSnapshot,
          sessionId,
        );
        players[sessionId] = localSnapshot;
        outboundPayload = cloneSnapshot(localSnapshot);
      } else if (type === "PLAYER_LEFT") {
        outboundPayload = { sessionId };
      }

      if (connected) {
        postChannelMessage({
          kind: "ROOM_EVENT",
          eventType: type,
          payload: outboundPayload,
        });
      }
    },
    on(type, handler) {
      const typedHandler = handler as Handler<RoomMessage>;
      const nextHandlers = handlers.get(type) ?? new Set<Handler<RoomMessage>>();
      nextHandlers.add(typedHandler);
      handlers.set(type, nextHandlers);

      if (type === "CONNECTION_STATUS" && connectionStatusAnnounced) {
        typedHandler({ connectionStatus } as RoomEvent[RoomMessage]);
      }

      return () => {
        nextHandlers.delete(typedHandler);
      };
    },
  };
}

function createMessageTransport(
  name: string,
  channelFactory?: (name: string) => BroadcastChannel,
  onMessage?: (event: MessageEvent<unknown>) => void,
): LocalPreviewMessageTransport {
  const channel = createChannel(name, channelFactory);

  if (onMessage) {
    channel.addEventListener("message", onMessage);
  }

  return {
    postMessage(message) {
      channel.postMessage(message);
    },
    close() {
      if (onMessage) {
        channel.removeEventListener("message", onMessage);
      }
      channel.close();
    },
  };
}

function createChannel(
  name: string,
  channelFactory?: (name: string) => BroadcastChannel,
): BroadcastChannel {
  if (channelFactory) {
    return channelFactory(name);
  }

  if (typeof BroadcastChannel !== "undefined") {
    return new BroadcastChannel(name);
  }

  return new InMemoryBroadcastChannel(name) as unknown as BroadcastChannel;
}

function readRoomIdFromLocation(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const roomId = new URL(window.location.href).searchParams.get("room")?.trim();

    return roomId || null;
  } catch {
    return null;
  }
}

function normalizeLocalSnapshot(sessionId: string, snapshot?: PlayerSnapshot): PlayerSnapshot {
  return mergeSnapshot(undefined, snapshot ?? createDefaultSnapshot(sessionId), sessionId);
}

function createDefaultSnapshot(sessionId: string): PlayerSnapshot {
  return {
    sessionId,
    map: "town",
    x: 656,
    y: 446,
    facing: "front",
  };
}

function mergeSnapshot(
  previous: PlayerSnapshot | undefined,
  snapshot: PlayerSnapshot,
  sessionId: string,
): PlayerSnapshot {
  const base = previous ?? createDefaultSnapshot(sessionId);

  return {
    ...base,
    ...snapshot,
    sessionId,
    activePokemon: snapshot.activePokemon ?? base.activePokemon,
    party: cloneParty(snapshot.party ?? base.party),
  };
}

function clonePlayers(players: Record<string, PlayerSnapshot>): Record<string, PlayerSnapshot> {
  return Object.fromEntries(
    Object.entries(players).map(([sessionId, snapshot]) => [sessionId, cloneSnapshot(snapshot)]),
  );
}

function cloneSnapshot(snapshot: PlayerSnapshot): PlayerSnapshot {
  return {
    ...snapshot,
    activePokemon: snapshot.activePokemon ? { ...snapshot.activePokemon } : undefined,
    party: cloneParty(snapshot.party),
  };
}

function cloneParty(
  party: PlayerSnapshot["party"] | undefined,
): PlayerSnapshot["party"] | undefined {
  return party?.map(slot => ({
    slotIndex: slot.slotIndex,
    pokemon: slot.pokemon
      ? {
          ...slot.pokemon,
          moves: slot.pokemon.moves?.map(move => ({ ...move })),
        }
      : null,
  }));
}

function toLocalPreviewChannelMessage(value: unknown): LocalPreviewChannelMessage | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const message = value as Partial<LocalPreviewChannelMessage>;

  if (
    message.protocol !== LOCAL_PREVIEW_PROTOCOL ||
    typeof message.roomId !== "string" ||
    typeof message.sourceSessionId !== "string"
  ) {
    return null;
  }

  if (message.kind === "HELLO") {
    return message.payload ? (message as LocalPreviewChannelMessage) : null;
  }

  if (message.kind === "HELLO_ECHO") {
    return typeof message.targetSessionId === "string" && message.payload
      ? (message as LocalPreviewChannelMessage)
      : null;
  }

  if (message.kind === "ROOM_EVENT") {
    return message.eventType && ROOM_MESSAGES.has(message.eventType)
      ? (message as LocalPreviewChannelMessage)
      : null;
  }

  return null;
}

function isTournamentRoomMessage(type: RoomMessage): type is TournamentRoomMessageType {
  return TOURNAMENT_ROOM_MESSAGES.has(type as TournamentRoomMessageType);
}

type InMemoryBroadcastHandler = (event: MessageEvent<unknown>) => void;

class InMemoryBroadcastChannel {
  private static channels = new Map<string, Set<InMemoryBroadcastChannel>>();

  onmessage: InMemoryBroadcastHandler | null = null;
  private readonly listeners = new Set<InMemoryBroadcastHandler>();
  private closed = false;

  constructor(readonly name: string) {
    const channels = InMemoryBroadcastChannel.channels.get(name) ?? new Set();
    channels.add(this);
    InMemoryBroadcastChannel.channels.set(name, channels);
  }

  postMessage(data: unknown): void {
    for (const channel of InMemoryBroadcastChannel.channels.get(this.name) ?? []) {
      if (channel !== this) {
        channel.dispatch(data);
      }
    }
  }

  addEventListener(type: "message", listener: InMemoryBroadcastHandler): void {
    if (type === "message") {
      this.listeners.add(listener);
    }
  }

  removeEventListener(type: "message", listener: InMemoryBroadcastHandler): void {
    if (type === "message") {
      this.listeners.delete(listener);
    }
  }

  close(): void {
    this.closed = true;
    InMemoryBroadcastChannel.channels.get(this.name)?.delete(this);
  }

  private dispatch(data: unknown): void {
    if (this.closed) {
      return;
    }

    const event = new MessageEvent("message", { data });
    this.onmessage?.(event);
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}
