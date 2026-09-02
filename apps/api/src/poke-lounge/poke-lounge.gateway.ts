import {
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Namespace, Socket } from 'socket.io';
import { getCorsOptions } from '../common/utils/cors.util';
import {
  PokeLoungeRoomEventsService,
  type PokeLoungeRoomTransportEvent,
} from './poke-lounge-room-events.service';
import { PokeLoungeLiveStateService } from './poke-lounge-live-state.service';
import { POKE_LOUNGE_ACTIVE_ROOM_LEASE_MS } from './poke-lounge-room-policy';
import { PokeLoungeRoomService } from './poke-lounge-room.service';

const MAX_SUBSCRIPTION_IDENTITY_LENGTH = 256;
const MAX_LIVE_MAP_KEY_LENGTH = 64;
const MAX_LIVE_COORDINATE = 1_000_000;
const PARTICIPANT_DISCONNECT_GRACE_MS = 60_000;
const WORLD_CURSOR_INTERVAL_MS = 1_000;
const SERVER_ROOM_METADATA_EVENT = 'poke-lounge.room-metadata';
const ROOM_CODE_PATTERN = /^[A-Z0-9]{6}$/;
const SUBSCRIPTION_ERROR = {
  code: 'POKE_LOUNGE_SUBSCRIPTION_REJECTED',
  message: 'Poke Lounge room subscription rejected',
} as const;

type PokeLoungeRoomSubscription = {
  roomCode: string;
  playerId: string;
  sessionId: string;
  afterRevision?: number;
};

type PokeLoungeSocketData = {
  pokeLoungeRoomName?: string;
  pokeLoungePlayerId?: string;
  pokeLoungeSessionId?: string;
  pokeLoungePresenceKey?: string;
  pokeLoungeDisplayName?: string;
  pokeLoungeSubscribed?: boolean;
  pokeLoungeExpiresAtMs?: number;
};

type PokeLoungeLivePlayerEventType =
  'PLAYER_MOVED' | 'PLAYER_MOVEMENT_ENDED' | 'PLAYER_CHANGED_MAP';

type PokeLoungeLivePlayerEvent = {
  type: PokeLoungeLivePlayerEventType;
  snapshot: {
    map: string;
    x: number;
    y: number;
    facing: 'front' | 'back' | 'left' | 'right';
  };
};

type PendingPresenceExpiry = {
  controller: AbortController;
  timer: ReturnType<typeof setTimeout>;
};

type PresenceGroup = {
  controller: AbortController;
  epoch: string;
};

type PresenceExpiryInput = PokeLoungeRoomSubscription & {
  presenceEpoch: string;
  expiresAtMs: number;
};

type PokeLoungeServerRoomMetadata = {
  roomCode: string;
  revision: number;
  expiresAtMs: number;
  closed: boolean;
};

@WebSocketGateway({
  namespace: '/poke-lounge',
  cors: getCorsOptions(process.env.CORS_ORIGINS),
})
export class PokeLoungeGateway
  implements
    OnApplicationBootstrap,
    OnGatewayInit,
    OnGatewayDisconnect,
    OnModuleDestroy
{
  private readonly logger = new Logger(PokeLoungeGateway.name);
  @WebSocketServer()
  private server!: Namespace;

  private unsubscribeFromRoomEvents: (() => void) | null = null;
  private readonly socketsByPresence = new Map<string, Set<Socket>>();
  private readonly disconnectTimers = new Map<string, PendingPresenceExpiry>();
  private readonly presenceGroups = new Map<string, PresenceGroup>();
  private readonly closedRooms = new Set<string>();
  private readonly roomMetadataRevisions = new Map<string, number>();
  private worldCursorTimer: ReturnType<typeof setInterval> | null = null;
  private worldCursorInFlight = false;
  private readonly handleServerRoomMetadata = (input: unknown): void => {
    const metadata = parseServerRoomMetadata(input);
    if (metadata) {
      this.applyRoomMetadata(metadata);
    }
  };

  constructor(
    private readonly roomService: PokeLoungeRoomService,
    private readonly roomEvents: PokeLoungeRoomEventsService,
    private readonly liveState: PokeLoungeLiveStateService,
  ) {}

  afterInit(server: Namespace): void {
    this.server?.off(SERVER_ROOM_METADATA_EVENT, this.handleServerRoomMetadata);
    this.server = server;
    this.server.on(SERVER_ROOM_METADATA_EVENT, this.handleServerRoomMetadata);
    this.unsubscribeFromRoomEvents?.();
    if (this.worldCursorTimer) {
      clearInterval(this.worldCursorTimer);
    }
    this.unsubscribeFromRoomEvents = this.roomEvents.subscribe(
      function callback(
        this: PokeLoungeGateway,
        event: PokeLoungeRoomTransportEvent,
      ): void {
        if (event.type !== 'room.snapshot') {
          return;
        }

        this.server.local
          .to(roomName(event.room.roomCode))
          .emit('room.snapshot', { room: event.room });
        const metadata = {
          roomCode: event.room.roomCode,
          revision: event.room.revision,
          expiresAtMs: event.room.expiresAtMs,
          closed: event.room.status === 'closed',
        };
        this.applyRoomMetadata(metadata);
      }.bind(this),
    );
    this.worldCursorTimer = setInterval(
      function handleInterval(this: PokeLoungeGateway): undefined {
        return void this.publishWorldCursors();
      }.bind(this),
      WORLD_CURSOR_INTERVAL_MS,
    );
    this.worldCursorTimer.unref();
  }

  async onApplicationBootstrap(): Promise<void> {
    try {
      const roomCodes = await this.liveState.listRoomStateCodes();
      for (const roomCode of roomCodes) {
        try {
          const room = await this.roomService.getRoom(roomCode);
          const clusterSockets = await this.server
            .in(roomName(room.roomCode))
            .fetchSockets();
          for (const participant of room.participants) {
            if (
              !participant.connected ||
              participant.presencePendingUntilMs !== undefined ||
              participant.presenceEpoch === undefined
            ) {
              continue;
            }
            const hasPersistedDeadline =
              participant.disconnectPendingUntilMs !== undefined;
            if (
              !hasPersistedDeadline &&
              hasMatchingPresence(clusterSockets, participant)
            ) {
              continue;
            }
            const expiry = {
              roomCode: room.roomCode,
              playerId: participant.playerId,
              sessionId: participant.sessionId,
              presenceEpoch: participant.presenceEpoch,
              expiresAtMs:
                participant.disconnectPendingUntilMs ??
                Date.now() + PARTICIPANT_DISCONNECT_GRACE_MS,
            };
            const controller = this.schedulePresenceExpiry(expiry);
            if (!hasPersistedDeadline && controller) {
              await this.persistPresenceExpiry(
                expiry,
                controller.signal,
                false,
              );
            }
          }
        } catch (error) {
          this.logLiveStateError('restore room presence expiry', error);
        }
      }
    } catch (error) {
      this.logLiveStateError('list room presence expiries', error);
    }
  }

  onModuleDestroy(): void {
    this.server?.off(SERVER_ROOM_METADATA_EVENT, this.handleServerRoomMetadata);
    this.unsubscribeFromRoomEvents?.();
    this.unsubscribeFromRoomEvents = null;
    if (this.worldCursorTimer) {
      clearInterval(this.worldCursorTimer);
      this.worldCursorTimer = null;
    }
    for (const pending of this.disconnectTimers.values()) {
      clearTimeout(pending.timer);
      pending.controller.abort();
    }
    this.disconnectTimers.clear();
    this.socketsByPresence.clear();
    for (const group of this.presenceGroups.values()) {
      group.controller.abort();
    }
    this.presenceGroups.clear();
    this.closedRooms.clear();
    this.roomMetadataRevisions.clear();
  }

  handleDisconnect(socket: Socket): void {
    this.unregisterPresence(socket, true);
  }

  @SubscribeMessage('room.subscribe')
  async subscribe(
    @ConnectedSocket() socket: Socket,
    @MessageBody() input: unknown,
  ): Promise<void> {
    const subscription = parseSubscription(input);
    const socketData = socket.data as PokeLoungeSocketData;
    const previousRoomName = socketData.pokeLoungeRoomName ?? null;
    let attemptedRoomName: string | null = null;

    if (!subscription) {
      rejectSubscription(socket);
      return;
    }

    try {
      const room = await this.roomService.authorizeSubscription(
        subscription.roomCode,
        subscription.playerId,
        subscription.sessionId,
        subscription.afterRevision,
      );
      const nextRoomName = roomName(room.roomCode);

      if (
        previousRoomName &&
        (previousRoomName !== nextRoomName ||
          (subscription.afterRevision !== undefined &&
            room.revision < subscription.afterRevision))
      ) {
        this.unregisterPresence(socket, true);
        await socket.leave(previousRoomName);
        delete socketData.pokeLoungeRoomName;
        delete socketData.pokeLoungePlayerId;
        delete socketData.pokeLoungeSessionId;
        delete socketData.pokeLoungePresenceKey;
        delete socketData.pokeLoungeDisplayName;
        delete socketData.pokeLoungeSubscribed;
      }

      if (
        subscription.afterRevision !== undefined &&
        room.revision < subscription.afterRevision
      ) {
        socket.emit('room.revision-conflict', { room });
        return;
      }

      // Register before replacing the stored identity so an identity switch
      // expires the participant that actually owned the previous presence.
      // Registration also makes a disconnect during room join or durable
      // acknowledgement observable by handleDisconnect.
      delete socketData.pokeLoungeDisplayName;
      delete socketData.pokeLoungeSubscribed;
      const presenceGroup = this.registerPresence(socket, subscription);
      socketData.pokeLoungeRoomName = nextRoomName;
      socketData.pokeLoungePlayerId = subscription.playerId;
      socketData.pokeLoungeSessionId = subscription.sessionId;
      attemptedRoomName = nextRoomName;
      await socket.join(nextRoomName);
      if (socket.connected === false) {
        throw new Error('Socket disconnected before room subscription');
      }
      const committedRoom =
        await this.roomService.acknowledgeParticipantPresence(
          subscription.roomCode,
          subscription.playerId,
          subscription.sessionId,
          subscription.afterRevision,
          presenceGroup.epoch,
          presenceGroup.controller.signal,
        );
      const participant = committedRoom.participants.find(
        function findItem(candidate) {
          return candidate.playerId === subscription.playerId;
        },
      );
      socketData.pokeLoungeDisplayName =
        participant?.displayName ?? subscription.playerId;
      socketData.pokeLoungeSubscribed = true;
      socketData.pokeLoungeExpiresAtMs = committedRoom.expiresAtMs;
      socket.emit('room.snapshot', { room: committedRoom });
      socket.emit(
        'room.world-snapshot',
        await this.liveState.getSnapshot(
          committedRoom.roomCode,
          liveStateExpiresAtMs(committedRoom.expiresAtMs),
        ),
      );
    } catch {
      for (const roomNameToLeave of new Set(
        [attemptedRoomName, previousRoomName].filter(
          function filterItem(value): value is string {
            return value !== null;
          },
        ),
      )) {
        try {
          await socket.leave(roomNameToLeave);
        } catch {
          // The generic rejection below must still reach the client.
        }
      }
      this.unregisterPresence(socket, true);
      delete socketData.pokeLoungeRoomName;
      delete socketData.pokeLoungePlayerId;
      delete socketData.pokeLoungeSessionId;
      delete socketData.pokeLoungePresenceKey;
      delete socketData.pokeLoungeDisplayName;
      delete socketData.pokeLoungeSubscribed;
      delete socketData.pokeLoungeExpiresAtMs;
      rejectSubscription(socket);
    }
  }

  @SubscribeMessage('room.player-event')
  async relayPlayerEvent(
    @ConnectedSocket() socket: Socket,
    @MessageBody() input: unknown,
  ): Promise<void> {
    const socketData = socket.data as PokeLoungeSocketData;
    const event = parseLivePlayerEvent(input);
    const room = socketData.pokeLoungeRoomName;
    const playerId = socketData.pokeLoungePlayerId;
    const displayName = socketData.pokeLoungeDisplayName;
    const expiresAtMs = socketData.pokeLoungeExpiresAtMs;

    if (
      !event ||
      !room ||
      !playerId ||
      !displayName ||
      !expiresAtMs ||
      this.closedRooms.has(room.replace(/^room:/, '')) ||
      socketData.pokeLoungeSubscribed !== true
    ) {
      return;
    }

    try {
      const stored = await this.liveState.upsertPlayer({
        roomCode: room.replace(/^room:/, ''),
        expiresAtMs: liveStateExpiresAtMs(expiresAtMs),
        player: {
          playerId,
          displayName,
          controller: 'human',
          ...event.snapshot,
          updatedAtMs: Date.now(),
        },
      });
      if (this.closedRooms.has(stored.roomCode)) {
        await this.liveState.deleteRoom(stored.roomCode);
        return;
      }
      this.server.to(room).emit('room.player-event', {
        type: event.type,
        roomCode: stored.roomCode,
        worldEpoch: stored.worldEpoch,
        worldSeq: stored.worldSeq,
        snapshot: {
          sessionId: stored.playerId,
          playerId: stored.playerId,
          displayName: stored.displayName,
          ...(stored.controller ? { controller: stored.controller } : {}),
          ...(stored.activity ? { activity: stored.activity } : {}),
          ...(stored.activePokemon
            ? { activePokemon: stored.activePokemon }
            : {}),
          map: stored.map,
          x: stored.x,
          y: stored.y,
          facing: stored.facing,
        },
      });
    } catch (error) {
      this.logLiveStateError('store player movement', error);
      rejectSubscription(socket);
    }
  }

  @SubscribeMessage('room.world-resync')
  async resyncWorld(@ConnectedSocket() socket: Socket): Promise<void> {
    const socketData = socket.data as PokeLoungeSocketData;
    const roomCode = socketData.pokeLoungeRoomName?.replace(/^room:/, '');
    const expiresAtMs = socketData.pokeLoungeExpiresAtMs;
    if (!roomCode || !expiresAtMs || socketData.pokeLoungeSubscribed !== true) {
      return;
    }

    try {
      socket.emit(
        'room.world-snapshot',
        await this.liveState.getSnapshot(
          roomCode,
          liveStateExpiresAtMs(expiresAtMs),
        ),
      );
    } catch (error) {
      this.logLiveStateError('resync world snapshot', error);
      rejectSubscription(socket);
    }
  }

  private registerPresence(
    socket: Socket,
    subscription: PokeLoungeRoomSubscription,
  ): PresenceGroup {
    const socketData = socket.data as PokeLoungeSocketData;
    const key = presenceKey(subscription);
    if (socketData.pokeLoungePresenceKey !== key) {
      this.unregisterPresence(socket, true);
    }

    const existingSockets = this.socketsByPresence.get(key);
    let presenceGroup = this.presenceGroups.get(key);
    if (
      !presenceGroup ||
      presenceGroup.controller.signal.aborted ||
      !existingSockets ||
      existingSockets.size === 0
    ) {
      presenceGroup?.controller.abort();
      presenceGroup = {
        controller: new AbortController(),
        epoch: randomUUID(),
      };
      this.presenceGroups.set(key, presenceGroup);
    }

    const sockets = existingSockets ?? new Set<Socket>();
    sockets.add(socket);
    this.socketsByPresence.set(key, sockets);
    socketData.pokeLoungePresenceKey = key;
    const pendingDisconnect = this.disconnectTimers.get(key);
    if (pendingDisconnect) {
      clearTimeout(pendingDisconnect.timer);
      pendingDisconnect.controller.abort();
      this.disconnectTimers.delete(key);
    }
    return presenceGroup;
  }

  private unregisterPresence(socket: Socket, scheduleExpiry: boolean): void {
    const socketData = socket.data as PokeLoungeSocketData;
    const key = socketData.pokeLoungePresenceKey;
    if (!key) {
      return;
    }

    const sockets = this.socketsByPresence.get(key);
    sockets?.delete(socket);
    delete socketData.pokeLoungePresenceKey;
    if (sockets && sockets.size > 0) {
      return;
    }

    this.socketsByPresence.delete(key);
    const presenceGroup = this.presenceGroups.get(key);
    presenceGroup?.controller.abort();
    if (!scheduleExpiry || this.disconnectTimers.has(key)) {
      if (!scheduleExpiry) {
        this.presenceGroups.delete(key);
      }
      return;
    }

    const roomCode = socketData.pokeLoungeRoomName?.replace(/^room:/, '');
    const playerId = socketData.pokeLoungePlayerId;
    const sessionId = socketData.pokeLoungeSessionId;
    if (!roomCode || !playerId || !sessionId) {
      this.presenceGroups.delete(key);
      return;
    }
    if (!presenceGroup) {
      return;
    }
    const presenceEpoch = presenceGroup.epoch;
    const expiresAtMs = Date.now() + PARTICIPANT_DISCONNECT_GRACE_MS;
    const expiry = {
      roomCode,
      playerId,
      sessionId,
      presenceEpoch,
      expiresAtMs,
    };
    const controller = this.schedulePresenceExpiry(expiry);
    if (!controller) {
      return;
    }
    void this.persistPresenceExpiry(expiry, controller.signal);
  }

  private async persistPresenceExpiry(
    input: PresenceExpiryInput,
    signal: AbortSignal,
    verifyConnected = true,
  ): Promise<void> {
    try {
      if (verifyConnected && (await this.hasConnectedPresence(input))) {
        return;
      }
      await this.roomService.markParticipantDisconnectPending(
        input.roomCode,
        input.playerId,
        input.sessionId,
        input.presenceEpoch,
        input.expiresAtMs,
        signal,
      );
    } catch (error) {
      this.logLiveStateError('persist disconnected player grace', error);
    }
  }

  private schedulePresenceExpiry(
    input: PresenceExpiryInput,
  ): AbortController | null {
    const key = presenceKey(input);
    if (
      this.disconnectTimers.has(key) ||
      (this.socketsByPresence.get(key)?.size ?? 0) > 0
    ) {
      return null;
    }
    const controller = new AbortController();
    const timer = setTimeout(
      function handleTimeout(this: PokeLoungeGateway): void {
        void async function callback(this: PokeLoungeGateway): Promise<void> {
          const pending = this.disconnectTimers.get(key);
          if (!pending || pending.timer !== timer) {
            return;
          }
          const presenceGroup = this.presenceGroups.get(key);
          if (
            (this.socketsByPresence.get(key)?.size ?? 0) > 0 ||
            (presenceGroup !== undefined &&
              presenceGroup.epoch !== input.presenceEpoch)
          ) {
            this.disconnectTimers.delete(key);
            controller.abort();
            return;
          }

          try {
            if (await this.hasConnectedPresence(input)) {
              this.disconnectTimers.delete(key);
              this.presenceGroups.delete(key);
              controller.abort();
              return;
            }
          } catch (error) {
            this.logLiveStateError('verify disconnected player', error);
            this.disconnectTimers.delete(key);
            this.presenceGroups.delete(key);
            controller.abort();
            return;
          }

          await Promise.all([
            this.liveState.removePlayer(input.roomCode, input.playerId).catch(
              function handleRejected(
                this: PokeLoungeGateway,
                error: any,
              ): void {
                return this.logLiveStateError(
                  'remove disconnected player',
                  error,
                );
              }.bind(this),
            ),
            this.roomService
              .expireParticipantPresence(
                input.roomCode,
                input.playerId,
                input.sessionId,
                input.presenceEpoch,
                controller.signal,
              )
              .catch(function handleRejected() {
                return undefined;
              }),
          ]).finally(
            function handleSettled(this: PokeLoungeGateway): void {
              const current = this.disconnectTimers.get(key);
              if (current?.timer === timer) {
                this.disconnectTimers.delete(key);
              }
              if (
                (this.socketsByPresence.get(key)?.size ?? 0) === 0 &&
                this.presenceGroups.get(key)?.epoch === input.presenceEpoch
              ) {
                this.presenceGroups.delete(key);
              }
            }.bind(this),
          );
        }.bind(this)();
      }.bind(this),
      Math.max(0, input.expiresAtMs - Date.now()),
    );
    timer.unref();
    this.disconnectTimers.set(key, { controller, timer });
    return controller;
  }

  private async hasConnectedPresence(
    input: Pick<
      PokeLoungeRoomSubscription,
      'roomCode' | 'playerId' | 'sessionId'
    >,
  ): Promise<boolean> {
    const clusterSockets = await this.server
      .in(roomName(input.roomCode))
      .fetchSockets();
    return hasMatchingPresence(clusterSockets, input);
  }

  private updateRoomMetadata(roomCode: string, expiresAtMs: number): void {
    const targetRoomName = roomName(roomCode);
    for (const sockets of this.socketsByPresence.values()) {
      for (const socket of sockets) {
        const socketData = socket.data as PokeLoungeSocketData;
        if (socketData.pokeLoungeRoomName === targetRoomName) {
          socketData.pokeLoungeExpiresAtMs = expiresAtMs;
        }
      }
    }
  }

  private applyRoomMetadata(metadata: PokeLoungeServerRoomMetadata): void {
    const currentRevision = this.roomMetadataRevisions.get(metadata.roomCode);
    if (
      (currentRevision !== undefined && metadata.revision < currentRevision) ||
      (currentRevision === metadata.revision &&
        this.closedRooms.has(metadata.roomCode) &&
        !metadata.closed)
    ) {
      return;
    }
    this.roomMetadataRevisions.set(metadata.roomCode, metadata.revision);
    this.updateRoomMetadata(metadata.roomCode, metadata.expiresAtMs);
    if (!metadata.closed) {
      this.closedRooms.delete(metadata.roomCode);
      void this.liveState
        .extendRoomExpiry(
          metadata.roomCode,
          liveStateExpiresAtMs(metadata.expiresAtMs),
        )
        .catch(
          function handleRejected(this: PokeLoungeGateway, error: any): void {
            return this.logLiveStateError('extend active room expiry', error);
          }.bind(this),
        );
      return;
    }

    this.closedRooms.add(metadata.roomCode);
    void this.liveState.deleteRoom(metadata.roomCode).catch(
      function handleRejected(this: PokeLoungeGateway, error: any): void {
        return this.logLiveStateError('delete closed room', error);
      }.bind(this),
    );
  }

  private async publishWorldCursors(): Promise<void> {
    if (this.worldCursorInFlight) {
      return;
    }
    this.worldCursorInFlight = true;
    try {
      const roomCodes = new Set<string>();
      for (const sockets of this.socketsByPresence.values()) {
        for (const socket of sockets) {
          const roomCode = (
            socket.data as PokeLoungeSocketData
          ).pokeLoungeRoomName?.replace(/^room:/, '');
          if (roomCode && !this.closedRooms.has(roomCode)) {
            roomCodes.add(roomCode);
          }
        }
      }
      await Promise.all(
        [...roomCodes].map(
          async function mapItem(
            this: PokeLoungeGateway,
            roomCode: string,
          ): Promise<void> {
            const cursor = await this.liveState.getCursor(roomCode);
            this.server
              .to(roomName(roomCode))
              .emit('room.world-cursor', cursor);
          }.bind(this),
        ),
      );
    } catch (error) {
      this.logLiveStateError('publish world cursor', error);
    } finally {
      this.worldCursorInFlight = false;
    }
  }

  private logLiveStateError(action: string, error: unknown): void {
    this.logger.error(
      `Failed to ${action}`,
      error instanceof Error ? error.stack : String(error),
    );
  }
}

function parseSubscription(input: unknown): PokeLoungeRoomSubscription | null {
  if (!input || typeof input !== 'object') {
    return null;
  }

  const record = input as Record<string, unknown>;
  const roomCode = normalizeBoundedString(record.roomCode)?.toUpperCase();
  const playerId = normalizeBoundedString(record.playerId);
  const sessionId = normalizeBoundedString(record.sessionId);
  const afterRevision = record.afterRevision;

  if (
    !roomCode ||
    !ROOM_CODE_PATTERN.test(roomCode) ||
    !playerId ||
    !sessionId ||
    (afterRevision !== undefined &&
      (!Number.isSafeInteger(afterRevision) || (afterRevision as number) < 0))
  ) {
    return null;
  }

  return {
    roomCode,
    playerId,
    sessionId,
    ...(afterRevision === undefined
      ? {}
      : { afterRevision: afterRevision as number }),
  };
}

function parseLivePlayerEvent(
  input: unknown,
): PokeLoungeLivePlayerEvent | null {
  if (!input || typeof input !== 'object') {
    return null;
  }

  const event = input as Record<string, unknown>;
  const type = event.type;
  const snapshot = event.snapshot;
  if (
    (type !== 'PLAYER_MOVED' &&
      type !== 'PLAYER_MOVEMENT_ENDED' &&
      type !== 'PLAYER_CHANGED_MAP') ||
    !snapshot ||
    typeof snapshot !== 'object'
  ) {
    return null;
  }

  const candidate = snapshot as Record<string, unknown>;
  const map = normalizeBoundedString(candidate.map);
  const x = candidate.x;
  const y = candidate.y;
  const facing = candidate.facing;
  if (
    !map ||
    map.length > MAX_LIVE_MAP_KEY_LENGTH ||
    typeof x !== 'number' ||
    !Number.isFinite(x) ||
    Math.abs(x) > MAX_LIVE_COORDINATE ||
    typeof y !== 'number' ||
    !Number.isFinite(y) ||
    Math.abs(y) > MAX_LIVE_COORDINATE ||
    (facing !== 'front' &&
      facing !== 'back' &&
      facing !== 'left' &&
      facing !== 'right')
  ) {
    return null;
  }

  return {
    type,
    snapshot: { map, x, y, facing },
  };
}

function normalizeBoundedString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();

  if (
    normalized.length === 0 ||
    normalized.length > MAX_SUBSCRIPTION_IDENTITY_LENGTH
  ) {
    return null;
  }

  return normalized;
}

function parseServerRoomMetadata(
  input: unknown,
): PokeLoungeServerRoomMetadata | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return null;
  }
  const metadata = input as Record<string, unknown>;
  if (
    typeof metadata.roomCode !== 'string' ||
    !ROOM_CODE_PATTERN.test(metadata.roomCode) ||
    !Number.isSafeInteger(metadata.revision) ||
    (metadata.revision as number) < 0 ||
    !Number.isSafeInteger(metadata.expiresAtMs) ||
    (metadata.expiresAtMs as number) <= 0 ||
    typeof metadata.closed !== 'boolean'
  ) {
    return null;
  }

  return metadata as PokeLoungeServerRoomMetadata;
}

function liveStateExpiresAtMs(roomExpiresAtMs: number): number {
  return Math.max(
    roomExpiresAtMs,
    Date.now() + POKE_LOUNGE_ACTIVE_ROOM_LEASE_MS,
  );
}

function roomName(roomCode: string): string {
  return `room:${roomCode}`;
}

function presenceKey(subscription: PokeLoungeRoomSubscription): string {
  return JSON.stringify([
    subscription.roomCode,
    subscription.playerId,
    subscription.sessionId,
  ]);
}

function hasMatchingPresence(
  sockets: ReadonlyArray<Pick<Socket, 'data'>>,
  input: Pick<PokeLoungeRoomSubscription, 'playerId' | 'sessionId'>,
): boolean {
  return sockets.some(function testItem(candidate) {
    const data = candidate.data as PokeLoungeSocketData;
    return (
      data.pokeLoungePlayerId === input.playerId &&
      data.pokeLoungeSessionId === input.sessionId &&
      data.pokeLoungeSubscribed === true
    );
  });
}

function rejectSubscription(socket: Socket): void {
  socket.emit('room.subscription-error', SUBSCRIPTION_ERROR);
}
