import {
  advancePokeLoungeRoomClock,
  expirePendingPokeLoungePresence,
  getPokeLoungeRoomExpiresAtMs,
  POKE_LOUNGE_ROOM_CAPACITY,
} from '../../src/poke-lounge/poke-lounge-room-policy';
import type {
  PokeLoungeCreateResult,
  PokeLoungeRepositoryResult,
  PokeLoungeRoomRepository,
  PokeLoungeRoomSnapshot,
} from '../../src/poke-lounge/poke-lounge-room.repository';

type CommandReceipt = {
  requestHash: string;
  snapshot: PokeLoungeRoomSnapshot;
};

export class FakePokeLoungeRoomRepository implements PokeLoungeRoomRepository {
  private readonly rooms = new Map<string, PokeLoungeRoomSnapshot>();
  private readonly receipts = new Map<string, CommandReceipt>();

  async create(
    input: Parameters<PokeLoungeRoomRepository['create']>[0],
  ): Promise<PokeLoungeCreateResult> {
    const receipt = this.receipts.get(commandKey(input));

    if (receipt) {
      return result(
        receipt.requestHash === input.requestHash
          ? receipt.snapshot
          : this.findCurrentSnapshot(receipt.snapshot),
        receipt.requestHash === input.requestHash
          ? 'replayed'
          : 'idempotency-conflict',
        false,
      );
    }

    await this.purgeExpired(input.nowMs);

    if (this.rooms.size >= POKE_LOUNGE_ROOM_CAPACITY) {
      return { outcome: 'capacity-reached' };
    }

    const roomCode = normalizeRoomCode(input.room.roomCode);

    if (this.rooms.has(roomCode)) {
      return { outcome: 'room-code-collision' };
    }

    const snapshot = structuredClone(input.room);
    snapshot.roomCode = roomCode;
    snapshot.revision = 0;
    snapshot.expiresAtMs = getPokeLoungeRoomExpiresAtMs(snapshot);
    this.rooms.set(roomCode, structuredClone(snapshot));
    this.receipts.set(commandKey(input), {
      requestHash: input.requestHash,
      snapshot: structuredClone(snapshot),
    });

    return result(snapshot, 'committed', true);
  }

  async getAndAdvance(
    roomCode: string,
    nowMs: number,
  ): Promise<{
    snapshot: PokeLoungeRoomSnapshot | null;
    committedChange: boolean;
  }> {
    await this.purgeExpired(nowMs);
    const current = this.rooms.get(normalizeRoomCode(roomCode));

    if (!current) {
      return { snapshot: null, committedChange: false };
    }

    const presenceExpired = expirePendingPokeLoungePresence(current, nowMs);
    const advanced = advancePokeLoungeRoomClock(
      presenceExpired
        ? { ...presenceExpired, revision: current.revision }
        : current,
      nowMs,
    );
    const committed = advanced ?? presenceExpired;

    if (!committed) {
      return { snapshot: structuredClone(current), committedChange: false };
    }

    this.rooms.set(committed.roomCode, structuredClone(committed));

    return { snapshot: structuredClone(committed), committedChange: true };
  }

  async listRoomCodes(nowMs: number): Promise<string[]> {
    await this.purgeExpired(nowMs);
    return [...this.rooms.keys()];
  }

  async mutate(
    input: Parameters<PokeLoungeRoomRepository['mutate']>[0],
  ): Promise<PokeLoungeRepositoryResult | null> {
    await this.purgeExpired(input.nowMs);
    const normalizedRoomCode = normalizeRoomCode(input.roomCode);
    const current = this.rooms.get(normalizedRoomCode);

    if (!current) {
      return null;
    }

    const receipt = this.receipts.get(commandKey(input));
    const replaysRoundReady =
      input.operation === 'round-ready' &&
      receipt?.requestHash === input.requestHash;

    if (receipt?.requestHash === input.requestHash && !replaysRoundReady) {
      return result(receipt.snapshot, 'replayed', false);
    }

    const presenceExpired = expirePendingPokeLoungePresence(
      current,
      input.nowMs,
    );
    const advanced = advancePokeLoungeRoomClock(
      presenceExpired
        ? { ...presenceExpired, revision: current.revision }
        : current,
      input.nowMs,
    );
    const lifecycleAdvanced = advanced ?? presenceExpired;

    if (lifecycleAdvanced) {
      this.rooms.set(normalizedRoomCode, structuredClone(lifecycleAdvanced));

      return result(
        lifecycleAdvanced,
        replaysRoundReady
          ? 'replayed'
          : receipt
            ? 'idempotency-conflict'
            : 'revision-conflict',
        true,
      );
    }

    if (replaysRoundReady) {
      return result(current, 'replayed', false);
    }

    if (receipt) {
      return result(current, 'idempotency-conflict', false);
    }

    if (
      input.expectedRevision !== undefined &&
      current.revision !== input.expectedRevision
    ) {
      return result(current, 'revision-conflict', false);
    }

    const applied = input.apply(structuredClone(current));
    const snapshot = structuredClone(applied);
    snapshot.roomCode = current.roomCode;
    snapshot.revision = current.revision + 1;
    snapshot.expiresAtMs = getPokeLoungeRoomExpiresAtMs(snapshot);
    this.rooms.set(normalizedRoomCode, structuredClone(snapshot));
    this.receipts.set(commandKey(input), {
      requestHash: input.requestHash,
      snapshot: structuredClone(snapshot),
    });

    return result(snapshot, 'committed', true);
  }

  purgeExpired(nowMs: number): Promise<number> {
    let deleted = 0;

    for (const [roomCode, snapshot] of this.rooms) {
      if (snapshot.expiresAtMs < nowMs) {
        this.rooms.delete(roomCode);
        for (const [key, receipt] of this.receipts) {
          if (normalizeRoomCode(receipt.snapshot.roomCode) === roomCode) {
            this.receipts.delete(key);
          }
        }
        deleted += 1;
      }
    }

    return Promise.resolve(deleted);
  }

  seed(snapshot: PokeLoungeRoomSnapshot): void {
    this.rooms.set(
      normalizeRoomCode(snapshot.roomCode),
      structuredClone(snapshot),
    );
  }

  snapshot(roomCode: string): PokeLoungeRoomSnapshot | null {
    const snapshot = this.rooms.get(normalizeRoomCode(roomCode));

    return snapshot ? structuredClone(snapshot) : null;
  }

  private findCurrentSnapshot(
    receiptSnapshot: PokeLoungeRoomSnapshot,
  ): PokeLoungeRoomSnapshot {
    return structuredClone(
      this.rooms.get(normalizeRoomCode(receiptSnapshot.roomCode)) ??
        receiptSnapshot,
    );
  }
}

function result(
  snapshot: PokeLoungeRoomSnapshot,
  outcome: PokeLoungeRepositoryResult['outcome'],
  committedChange: boolean,
): PokeLoungeRepositoryResult {
  return {
    snapshot: structuredClone(snapshot),
    outcome,
    committedChange,
  };
}

function commandKey(input: {
  actorPlayerId: string;
  idempotencyKey: string;
}): string {
  return `${input.actorPlayerId}:${input.idempotencyKey}`;
}

function normalizeRoomCode(roomCode: string): string {
  return roomCode.trim().toUpperCase();
}
