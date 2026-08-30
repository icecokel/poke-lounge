import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { CompetitiveProjectionService } from './competitive/competitive-projection.service';
import { toPokeLoungePublicRoomState } from './poke-lounge-room-conflict';
import type {
  PokeLoungeRoomCommittedEvent,
  PokeLoungeRoomEventPublisher,
} from './poke-lounge-room-event.publisher';
import {
  PokeLoungeLiveStateService,
  type PokeLoungeRoomCommitNotification,
} from './poke-lounge-live-state.service';
import type { PokeLoungePublicRoomState } from './poke-lounge-room.types';

export type PokeLoungeRoomTransportEvent =
  | { type: 'room.snapshot'; room: PokeLoungePublicRoomState }
  | { type: 'room.revision-conflict'; room: PokeLoungePublicRoomState };

type PokeLoungeRoomTransportListener = (
  event: PokeLoungeRoomTransportEvent,
) => void;

@Injectable()
export class PokeLoungeRoomEventsService
  implements PokeLoungeRoomEventPublisher, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PokeLoungeRoomEventsService.name);
  private readonly listeners = new Set<PokeLoungeRoomTransportListener>();
  private readonly cursors = new Map<
    string,
    { revision: number; expiresAtMs: number }
  >();
  private readonly pendingCommits = new Map<string, Promise<void>>();
  private unsubscribeFromRedis: (() => Promise<void>) | null = null;

  constructor(
    private readonly liveState: PokeLoungeLiveStateService,
    private readonly competitiveProjection: CompetitiveProjectionService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.unsubscribeFromRedis = await this.liveState.subscribeRoomCommits(
      (notification) => this.enqueueRoomCommit(notification),
    );
  }

  async onModuleDestroy(): Promise<void> {
    const unsubscribe = this.unsubscribeFromRedis;
    this.unsubscribeFromRedis = null;
    if (unsubscribe) {
      await unsubscribe();
    }
    await Promise.all(this.pendingCommits.values());
    this.pendingCommits.clear();
    this.cursors.clear();
  }

  subscribe(listener: PokeLoungeRoomTransportListener): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  subscribeSnapshots(
    listener: (snapshot: PokeLoungePublicRoomState) => void,
  ): () => void {
    return this.subscribe((event) => {
      if (event.type === 'room.snapshot') {
        listener(event.room);
      }
    });
  }

  publish(event: PokeLoungeRoomCommittedEvent): Promise<void> {
    return this.liveState.publishRoomCommit({
      roomCode: event.snapshot.roomCode,
      revision: event.snapshot.revision,
    });
  }

  publishCommitted(room: PokeLoungePublicRoomState): void {
    for (const listener of this.listeners) {
      listener({ type: 'room.snapshot', room: structuredClone(room) });
    }
  }

  private enqueueRoomCommit(
    notification: PokeLoungeRoomCommitNotification,
  ): void {
    const previous =
      this.pendingCommits.get(notification.roomCode) ?? Promise.resolve();
    const pending = previous.then(() => this.handleRoomCommit(notification));
    this.pendingCommits.set(notification.roomCode, pending);
    void pending.then(() => {
      if (this.pendingCommits.get(notification.roomCode) === pending) {
        this.pendingCommits.delete(notification.roomCode);
      }
    });
  }

  private async handleRoomCommit(
    notification: PokeLoungeRoomCommitNotification,
  ): Promise<void> {
    try {
      const nowMs = Date.now();
      this.deleteExpiredCursors(nowMs);
      const cursor = this.cursors.get(notification.roomCode);
      if (cursor !== undefined && notification.revision <= cursor.revision) {
        return;
      }

      const afterRevision =
        cursor?.revision ?? Math.max(0, notification.revision - 1);
      const snapshot = await this.competitiveProjection.findRoomSnapshot(
        notification.roomCode,
        afterRevision,
      );
      if (!snapshot || snapshot.revision < notification.revision) {
        return;
      }

      const current = this.cursors.get(notification.roomCode);
      const currentIsActive =
        current !== undefined && current.expiresAtMs > Date.now();
      if (currentIsActive && current.revision >= snapshot.revision) {
        return;
      }

      this.cursors.set(notification.roomCode, {
        revision: snapshot.revision,
        expiresAtMs: snapshot.expiresAtMs,
      });
      this.publishCommitted(toPokeLoungePublicRoomState(snapshot));
    } catch (error) {
      this.logger.error(
        `Failed to relay committed Poke Lounge room revision ${notification.revision}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private deleteExpiredCursors(nowMs: number): void {
    for (const [roomCode, cursor] of this.cursors) {
      if (cursor.expiresAtMs <= nowMs) {
        this.cursors.delete(roomCode);
      }
    }
  }
}
