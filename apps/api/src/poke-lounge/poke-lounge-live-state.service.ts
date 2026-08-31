import { Injectable, Logger, OnModuleDestroy, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createAdapter } from '@socket.io/redis-adapter';
import { createHash, randomUUID } from 'node:crypto';
import { createClient } from 'redis';

const WORLD_EPOCH_FIELD = '_epoch';
const WORLD_SEQUENCE_FIELD = '_seq';
const WORLD_KEY_PREFIX = 'poke-lounge:room:';
const WORLD_KEY_SUFFIX = ':world';
const ROOM_STATE_KEY_SUFFIX = ':state';
const ROOM_INDEX_KEY = 'poke-lounge:rooms';
const ROOM_COMMIT_CHANNEL = 'poke-lounge:room-committed';
const PLAYER_STATE_KEY_PREFIX = 'poke-lounge:player:';
const PLAYER_STATE_KEY_SUFFIX = ':state';
const CREATE_COMMAND_KEY_PREFIX = 'poke-lounge:create-command:';
const CREATE_ROOM_STATE_SCRIPT = `
local receipt = redis.call('GET', KEYS[3])
if receipt then
  return {3, receipt}
end
redis.call('ZREMRANGEBYSCORE', KEYS[2], '-inf', ARGV[1])
if redis.call('ZCARD', KEYS[2]) >= tonumber(ARGV[2]) then
  return {2, ''}
end
if redis.call('EXISTS', KEYS[1]) == 1 then
  return {1, ''}
end
redis.call('HSET', KEYS[1], 'version', '0', 'document', ARGV[3])
redis.call('PEXPIREAT', KEYS[1], ARGV[4])
redis.call('SET', KEYS[3], ARGV[5], 'PXAT', ARGV[4])
redis.call('ZADD', KEYS[2], ARGV[4], ARGV[6])
return {0, ''}
`;
const COMPARE_AND_SET_ROOM_STATE_SCRIPT = `
if redis.call('EXISTS', KEYS[1]) == 0 then
  return 0
end
local version = tonumber(redis.call('HGET', KEYS[1], 'version'))
if version ~= tonumber(ARGV[1]) then
  return -1
end
redis.call('HSET', KEYS[1], 'version', tostring(version + 1), 'document', ARGV[2])
redis.call('PEXPIREAT', KEYS[1], ARGV[3])
redis.call('ZADD', KEYS[2], ARGV[3], ARGV[4])
return 1
`;
const PURGE_ROOM_STATES_SCRIPT = `
local count = redis.call('ZCOUNT', KEYS[1], '-inf', ARGV[1])
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', ARGV[1])
return count
`;
const SAVE_PLAYER_STATE_SCRIPT = `
local currentRevision = redis.call('HGET', KEYS[1], 'revision')
local expectedRevision = tonumber(ARGV[1])
local nextRevision = 1
local createdAt = ARGV[4]
if currentRevision then
  if expectedRevision < 0 and tonumber(currentRevision) ~= 0 then
    return -1
  end
  if expectedRevision >= 0 and tonumber(currentRevision) ~= expectedRevision then
    return -1
  end
  nextRevision = tonumber(currentRevision) + 1
  createdAt = redis.call('HGET', KEYS[1], 'createdAt') or createdAt
elseif expectedRevision > 0 then
  return -1
end
redis.call(
  'HSET',
  KEYS[1],
  'revision', tostring(nextRevision),
  'state', ARGV[2],
  'clientUpdatedAt', ARGV[3],
  'createdAt', createdAt,
  'updatedAt', ARGV[4]
)
redis.call('PEXPIREAT', KEYS[1], ARGV[5])
return nextRevision
`;
const UPSERT_PLAYER_SCRIPT = `
local epoch = redis.call('HGET', KEYS[1], '${WORLD_EPOCH_FIELD}')
if not epoch then
  epoch = ARGV[1]
  redis.call('HSET', KEYS[1], '${WORLD_EPOCH_FIELD}', epoch)
end
local sequence = redis.call('HINCRBY', KEYS[1], '${WORLD_SEQUENCE_FIELD}', 1)
redis.call('HSET', KEYS[1], ARGV[2], ARGV[3])
local ttl = redis.call('TTL', KEYS[1])
if ttl == -1 then
  redis.call('EXPIREAT', KEYS[1], ARGV[4])
else
  redis.call('EXPIREAT', KEYS[1], ARGV[4], 'GT')
end
return { epoch, sequence }
`;
const ENSURE_WORLD_SCRIPT = `
local epoch = redis.call('HGET', KEYS[1], '${WORLD_EPOCH_FIELD}')
if not epoch then
  epoch = ARGV[1]
  redis.call('HSET', KEYS[1], '${WORLD_EPOCH_FIELD}', epoch)
end
local ttl = redis.call('TTL', KEYS[1])
if ttl == -1 then
  redis.call('EXPIREAT', KEYS[1], ARGV[2])
else
  redis.call('EXPIREAT', KEYS[1], ARGV[2], 'GT')
end
return epoch
`;
const REMOVE_PLAYER_SCRIPT = `
if redis.call('HEXISTS', KEYS[1], ARGV[1]) == 0 then
  return 0
end
redis.call('HDEL', KEYS[1], ARGV[1])
redis.call('HINCRBY', KEYS[1], '${WORLD_SEQUENCE_FIELD}', 1)
return 1
`;
const EXTEND_WORLD_EXPIRY_SCRIPT = `
if redis.call('EXISTS', KEYS[1]) == 0 then
  return 0
end
local ttl = redis.call('TTL', KEYS[1])
if ttl == -1 then
  redis.call('EXPIREAT', KEYS[1], ARGV[1])
else
  redis.call('EXPIREAT', KEYS[1], ARGV[1], 'GT')
end
return 1
`;

type RedisClient = ReturnType<typeof createClient>;
type RedisClientFactory = (url: string) => RedisClient;

export type PokeLoungeWorldFacing = 'front' | 'back' | 'left' | 'right';

export interface PokeLoungeWorldPlayerState {
  playerId: string;
  displayName: string;
  map: string;
  x: number;
  y: number;
  facing: PokeLoungeWorldFacing;
  updatedAtMs: number;
}

export interface PokeLoungeWorldSnapshot {
  roomCode: string;
  worldEpoch: string;
  worldSeq: number;
  players: PokeLoungeWorldPlayerState[];
}

export interface PokeLoungeWorldPlayerEvent extends PokeLoungeWorldPlayerState {
  roomCode: string;
  worldEpoch: string;
  worldSeq: number;
}

export interface PokeLoungeRedisRoomRecord {
  version: number;
  document: string;
}

export interface PokeLoungeRoomCommitNotification {
  roomCode: string;
  revision: number;
}

export type CreatePokeLoungeRedisRoomResult =
  | { outcome: 'created' | 'capacity-reached' | 'room-code-collision' }
  | { outcome: 'command-exists'; receipt: string };

export interface PokeLoungeRedisPlayerState {
  revision: number;
  state: Record<string, unknown>;
  clientUpdatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class PokeLoungeLiveStateService implements OnModuleDestroy {
  private readonly logger = new Logger(PokeLoungeLiveStateService.name);
  private commandClient: RedisClient | null = null;
  private subscriberClient: RedisClient | null = null;
  private roomCommitSubscriberClient: RedisClient | null = null;
  private connectPromise: Promise<void> | null = null;
  private roomCommitConnectPromise: Promise<void> | null = null;

  constructor(
    private readonly configService: ConfigService,
    @Optional()
    private readonly clientFactory: RedisClientFactory = function callback(
      url,
    ) {
      return createClient({ url, disableOfflineQueue: true });
    },
  ) {}

  async connect(): Promise<void> {
    if (this.commandClient?.isReady && this.subscriberClient?.isReady) {
      return;
    }
    if (this.connectPromise) {
      return this.connectPromise;
    }

    const redisUrl = this.configService.get<string>('REDIS_URL')?.trim();
    if (!redisUrl) {
      throw new Error('REDIS_URL is required for Poke Lounge multiplayer');
    }

    const commandClient = this.clientFactory(redisUrl);
    const subscriberClient = commandClient.duplicate();
    commandClient.on(
      'error',
      function handleEvent(this: PokeLoungeLiveStateService, error: any): void {
        return this.logger.error(
          'Poke Lounge Redis command client error',
          error,
        );
      }.bind(this),
    );
    subscriberClient.on(
      'error',
      function handleEvent(this: PokeLoungeLiveStateService, error: any): void {
        return this.logger.error(
          'Poke Lounge Redis subscriber client error',
          error,
        );
      }.bind(this),
    );
    this.commandClient = commandClient;
    this.subscriberClient = subscriberClient;
    this.connectPromise = Promise.all([
      commandClient.connect(),
      subscriberClient.connect(),
    ])
      .then(function handleResolved() {
        return undefined;
      })
      .catch(
        function handleRejected(
          this: PokeLoungeLiveStateService,
          error: unknown,
        ): never {
          commandClient.destroy();
          subscriberClient.destroy();
          this.commandClient = null;
          this.subscriberClient = null;
          throw error;
        }.bind(this),
      )
      .finally(
        function handleSettled(this: PokeLoungeLiveStateService): void {
          this.connectPromise = null;
        }.bind(this),
      );

    return this.connectPromise;
  }

  createSocketAdapter(): ReturnType<typeof createAdapter> {
    const commandClient = this.requireCommandClient();
    const subscriberClient = this.subscriberClient;
    if (!subscriberClient?.isReady) {
      throw new Error('Poke Lounge Redis subscriber is unavailable');
    }

    return createAdapter(commandClient, subscriberClient);
  }

  async publishRoomCommit(
    input: PokeLoungeRoomCommitNotification,
  ): Promise<void> {
    const notification = {
      roomCode: normalizeRoomCode(input.roomCode),
      revision: requireNonNegativeInteger(input.revision, 'room revision'),
    };
    await this.requireCommandClient().publish(
      ROOM_COMMIT_CHANNEL,
      JSON.stringify(notification),
    );
  }

  async subscribeRoomCommits(
    listener: (notification: PokeLoungeRoomCommitNotification) => void,
  ): Promise<() => Promise<void>> {
    await this.connect();
    const subscriber = await this.requireRoomCommitSubscriber();
    const handleMessage = (message: string): void => {
      try {
        listener(parseRoomCommitNotification(message));
      } catch (error) {
        this.logger.error(
          'Failed to handle Poke Lounge room commit notification',
          error instanceof Error ? error.stack : String(error),
        );
      }
    };
    await subscriber.subscribe(ROOM_COMMIT_CHANNEL, handleMessage);

    return async function callback() {
      if (subscriber.isOpen) {
        await subscriber.unsubscribe(ROOM_COMMIT_CHANNEL, handleMessage);
      }
    };
  }

  async createRoomState(input: {
    roomCode: string;
    document: string;
    expiresAtMs: number;
    nowMs: number;
    capacity: number;
    actorPlayerId: string;
    idempotencyKey: string;
    requestHash: string;
  }): Promise<CreatePokeLoungeRedisRoomResult> {
    const client = this.requireCommandClient();
    const roomCode = normalizeRoomCode(input.roomCode);
    const receipt = JSON.stringify({
      requestHash: input.requestHash,
      roomCode,
    });
    const result = await client.eval(CREATE_ROOM_STATE_SCRIPT, {
      keys: [
        roomStateKey(roomCode),
        ROOM_INDEX_KEY,
        createCommandKey(input.actorPlayerId, input.idempotencyKey),
      ],
      arguments: [
        String(normalizeTimestampMs(input.nowMs)),
        String(input.capacity),
        input.document,
        String(normalizeTimestampMs(input.expiresAtMs)),
        receipt,
        roomCode,
      ],
    });
    const [status, existingReceipt] = parseRedisTuple(result);

    if (status === 0) {
      return { outcome: 'created' };
    }
    if (status === 1) {
      return { outcome: 'room-code-collision' };
    }
    if (status === 2) {
      return { outcome: 'capacity-reached' };
    }
    if (status === 3 && typeof existingReceipt === 'string') {
      return { outcome: 'command-exists', receipt: existingReceipt };
    }

    throw new Error('Poke Lounge Redis create result is malformed');
  }

  async getRoomState(
    roomCode: string,
  ): Promise<PokeLoungeRedisRoomRecord | null> {
    const client = this.requireCommandClient();
    const values = await client.hmGet(
      roomStateKey(normalizeRoomCode(roomCode)),
      ['version', 'document'],
    );
    if (values[0] === null && values[1] === null) {
      return null;
    }
    const version = parseNonNegativeInteger(values[0]);
    if (version === null || typeof values[1] !== 'string') {
      throw new Error('Poke Lounge Redis room state is malformed');
    }

    return { version, document: values[1] };
  }

  async compareAndSetRoomState(input: {
    roomCode: string;
    expectedVersion: number;
    document: string;
    expiresAtMs: number;
  }): Promise<'committed' | 'conflict' | 'missing'> {
    const client = this.requireCommandClient();
    const roomCode = normalizeRoomCode(input.roomCode);
    const result = await client.eval(COMPARE_AND_SET_ROOM_STATE_SCRIPT, {
      keys: [roomStateKey(roomCode), ROOM_INDEX_KEY],
      arguments: [
        String(input.expectedVersion),
        input.document,
        String(normalizeTimestampMs(input.expiresAtMs)),
        roomCode,
      ],
    });

    if (result === 1) {
      return 'committed';
    }
    if (result === -1) {
      return 'conflict';
    }
    if (result === 0) {
      return 'missing';
    }
    throw new Error('Poke Lounge Redis compare-and-set result is malformed');
  }

  async purgeExpiredRoomStates(nowMs: number): Promise<number> {
    const result = await this.requireCommandClient().eval(
      PURGE_ROOM_STATES_SCRIPT,
      {
        keys: [ROOM_INDEX_KEY],
        arguments: [String(normalizeTimestampMs(nowMs))],
      },
    );
    const count = parseNonNegativeInteger(result);
    if (count === null) {
      throw new Error('Poke Lounge Redis purge result is malformed');
    }
    return count;
  }

  async listRoomStateCodes(): Promise<string[]> {
    return this.requireCommandClient().zRange(ROOM_INDEX_KEY, 0, -1);
  }

  async getPlayerState(
    userId: string,
  ): Promise<PokeLoungeRedisPlayerState | null> {
    const values = await this.requireCommandClient().hGetAll(
      playerStateKey(userId),
    );
    if (Object.keys(values).length === 0) {
      return null;
    }
    const revision = parseNonNegativeInteger(values.revision);
    if (
      revision === null ||
      typeof values.state !== 'string' ||
      typeof values.createdAt !== 'string' ||
      typeof values.updatedAt !== 'string'
    ) {
      throw new Error('Poke Lounge Redis player state is malformed');
    }
    const state = JSON.parse(values.state) as unknown;
    if (!isRecord(state)) {
      throw new Error('Poke Lounge Redis player snapshot is malformed');
    }

    return {
      revision,
      state,
      clientUpdatedAt: values.clientUpdatedAt || null,
      createdAt: values.createdAt,
      updatedAt: values.updatedAt,
    };
  }

  async savePlayerState(input: {
    userId: string;
    state: Record<string, unknown>;
    expectedRevision?: number;
    clientUpdatedAt: string | null;
    nowMs: number;
    expiresAtMs: number;
  }): Promise<number | null> {
    const result = await this.requireCommandClient().eval(
      SAVE_PLAYER_STATE_SCRIPT,
      {
        keys: [playerStateKey(input.userId)],
        arguments: [
          String(input.expectedRevision ?? -1),
          JSON.stringify(input.state),
          input.clientUpdatedAt ?? '',
          new Date(input.nowMs).toISOString(),
          String(normalizeTimestampMs(input.expiresAtMs)),
        ],
      },
    );
    if (result === -1) {
      return null;
    }
    const revision = parseNonNegativeInteger(result);
    if (revision === null) {
      throw new Error('Poke Lounge Redis player save result is malformed');
    }
    return revision;
  }

  async upsertPlayer(input: {
    roomCode: string;
    player: PokeLoungeWorldPlayerState;
    expiresAtMs: number;
  }): Promise<PokeLoungeWorldPlayerEvent> {
    const client = this.requireCommandClient();
    const roomCode = normalizeRoomCode(input.roomCode);
    const expiresAtSeconds = normalizeExpiresAtSeconds(input.expiresAtMs);
    const result = await client.eval(UPSERT_PLAYER_SCRIPT, {
      keys: [worldKey(roomCode)],
      arguments: [
        randomUUID(),
        input.player.playerId,
        JSON.stringify(input.player),
        String(expiresAtSeconds),
      ],
    });
    const [worldEpoch, worldSeq] = parseUpsertResult(result);

    return {
      roomCode,
      worldEpoch,
      worldSeq,
      ...structuredClone(input.player),
    };
  }

  async getSnapshot(
    roomCode: string,
    expiresAtMs: number,
  ): Promise<PokeLoungeWorldSnapshot> {
    const client = this.requireCommandClient();
    const normalizedRoomCode = normalizeRoomCode(roomCode);
    const key = worldKey(normalizedRoomCode);
    await client.eval(ENSURE_WORLD_SCRIPT, {
      keys: [key],
      arguments: [randomUUID(), String(normalizeExpiresAtSeconds(expiresAtMs))],
    });
    const values = await client.hGetAll(key);

    return parseWorldSnapshot(normalizedRoomCode, values);
  }

  async getCursor(
    roomCode: string,
  ): Promise<
    Pick<PokeLoungeWorldSnapshot, 'roomCode' | 'worldEpoch' | 'worldSeq'>
  > {
    const client = this.requireCommandClient();
    const normalizedRoomCode = normalizeRoomCode(roomCode);
    const values = await client.hmGet(worldKey(normalizedRoomCode), [
      WORLD_EPOCH_FIELD,
      WORLD_SEQUENCE_FIELD,
    ]);
    const worldEpoch = values[0];
    if (!worldEpoch) {
      throw new Error('Poke Lounge world state is unavailable');
    }

    return {
      roomCode: normalizedRoomCode,
      worldEpoch,
      worldSeq: parseWorldSequence(values[1], true),
    };
  }

  async removePlayer(roomCode: string, playerId: string): Promise<void> {
    const client = this.requireCommandClient();
    await client.eval(REMOVE_PLAYER_SCRIPT, {
      keys: [worldKey(normalizeRoomCode(roomCode))],
      arguments: [playerId],
    });
  }

  async extendRoomExpiry(roomCode: string, expiresAtMs: number): Promise<void> {
    const client = this.requireCommandClient();
    await client.eval(EXTEND_WORLD_EXPIRY_SCRIPT, {
      keys: [worldKey(normalizeRoomCode(roomCode))],
      arguments: [String(normalizeExpiresAtSeconds(expiresAtMs))],
    });
  }

  async deleteRoom(roomCode: string): Promise<void> {
    const client = this.requireCommandClient();
    await client.del(worldKey(normalizeRoomCode(roomCode)));
  }

  async onModuleDestroy(): Promise<void> {
    const clients = [
      this.roomCommitSubscriberClient,
      this.subscriberClient,
      this.commandClient,
    ].filter(function filterItem(client): client is RedisClient {
      return client !== null;
    });
    this.roomCommitSubscriberClient = null;
    this.subscriberClient = null;
    this.commandClient = null;
    await Promise.all(
      clients.map(async function mapItem(client) {
        if (client.isOpen) {
          await client.close();
        }
      }),
    );
  }

  private requireCommandClient(): RedisClient {
    if (!this.commandClient?.isReady) {
      throw new Error('Poke Lounge Redis command client is unavailable');
    }
    return this.commandClient;
  }

  private async requireRoomCommitSubscriber(): Promise<RedisClient> {
    if (this.roomCommitSubscriberClient?.isReady) {
      return this.roomCommitSubscriberClient;
    }
    if (!this.roomCommitConnectPromise) {
      const subscriber = this.requireCommandClient().duplicate();
      subscriber.on(
        'error',
        function handleEvent(
          this: PokeLoungeLiveStateService,
          error: any,
        ): void {
          return this.logger.error(
            'Poke Lounge Redis room commit subscriber error',
            error,
          );
        }.bind(this),
      );
      this.roomCommitSubscriberClient = subscriber;
      this.roomCommitConnectPromise = subscriber
        .connect()
        .then(function handleResolved() {
          return undefined;
        })
        .catch(
          function handleRejected(
            this: PokeLoungeLiveStateService,
            error: unknown,
          ): never {
            subscriber.destroy();
            this.roomCommitSubscriberClient = null;
            throw error;
          }.bind(this),
        )
        .finally(
          function handleSettled(this: PokeLoungeLiveStateService): void {
            this.roomCommitConnectPromise = null;
          }.bind(this),
        );
    }
    await this.roomCommitConnectPromise;
    if (!this.roomCommitSubscriberClient?.isReady) {
      throw new Error(
        'Poke Lounge Redis room commit subscriber is unavailable',
      );
    }
    return this.roomCommitSubscriberClient;
  }
}

function worldKey(roomCode: string): string {
  return `${WORLD_KEY_PREFIX}${roomCode}${WORLD_KEY_SUFFIX}`;
}

function roomStateKey(roomCode: string): string {
  return `${WORLD_KEY_PREFIX}${roomCode}${ROOM_STATE_KEY_SUFFIX}`;
}

function playerStateKey(userId: string): string {
  return `${PLAYER_STATE_KEY_PREFIX}${createHash('sha256').update(userId).digest('hex')}${PLAYER_STATE_KEY_SUFFIX}`;
}

function createCommandKey(
  actorPlayerId: string,
  idempotencyKey: string,
): string {
  return `${CREATE_COMMAND_KEY_PREFIX}${createHash('sha256')
    .update(actorPlayerId)
    .update('\0')
    .update(idempotencyKey)
    .digest('hex')}`;
}

function normalizeRoomCode(roomCode: string): string {
  const normalized = roomCode.trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(normalized)) {
    throw new Error('Poke Lounge room code is invalid');
  }
  return normalized;
}

function normalizeExpiresAtSeconds(expiresAtMs: number): number {
  if (!Number.isSafeInteger(expiresAtMs) || expiresAtMs <= Date.now()) {
    throw new Error('Poke Lounge world expiry is invalid');
  }
  return Math.ceil(expiresAtMs / 1000);
}

function normalizeTimestampMs(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error('Poke Lounge Redis timestamp is invalid');
  }
  return value;
}

function parseNonNegativeInteger(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function requireNonNegativeInteger(value: unknown, name: string): number {
  const parsed = parseNonNegativeInteger(value);
  if (parsed === null) {
    throw new Error(`Poke Lounge Redis ${name} is invalid`);
  }
  return parsed;
}

function parseRoomCommitNotification(
  value: string,
): PokeLoungeRoomCommitNotification {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch {
    throw new Error('Poke Lounge room commit notification is malformed');
  }
  if (!isRecord(parsed) || typeof parsed.roomCode !== 'string') {
    throw new Error('Poke Lounge room commit notification is malformed');
  }
  return {
    roomCode: normalizeRoomCode(parsed.roomCode),
    revision: requireNonNegativeInteger(parsed.revision, 'room revision'),
  };
}

function parseRedisTuple(value: unknown): [number, unknown] {
  if (!Array.isArray(value) || value.length < 2) {
    throw new Error('Poke Lounge Redis tuple is malformed');
  }
  const status = Number(value[0]);
  if (!Number.isSafeInteger(status)) {
    throw new Error('Poke Lounge Redis tuple status is malformed');
  }
  return [status, value[1]];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseUpsertResult(value: unknown): [string, number] {
  if (
    !Array.isArray(value) ||
    value.length !== 2 ||
    typeof value[0] !== 'string'
  ) {
    throw new Error('Poke Lounge Redis update result is malformed');
  }
  return [value[0], parseWorldSequence(value[1])];
}

function parseWorldSnapshot(
  roomCode: string,
  values: Record<string, string>,
): PokeLoungeWorldSnapshot {
  const worldEpoch = values[WORLD_EPOCH_FIELD];
  if (!worldEpoch) {
    throw new Error('Poke Lounge world epoch is missing');
  }
  const players = Object.entries(values)
    .filter(function filterItem([field]) {
      return field !== WORLD_EPOCH_FIELD && field !== WORLD_SEQUENCE_FIELD;
    })
    .map(function mapItem([playerId, value]) {
      return parseWorldPlayer(playerId, value);
    })
    .sort(function compareItems(left, right) {
      return left.playerId.localeCompare(right.playerId);
    });

  return {
    roomCode,
    worldEpoch,
    worldSeq: parseWorldSequence(values[WORLD_SEQUENCE_FIELD], true),
    players,
  };
}

function parseWorldPlayer(
  playerId: string,
  serialized: string,
): PokeLoungeWorldPlayerState {
  let value: unknown;
  try {
    value = JSON.parse(serialized);
  } catch {
    throw new Error('Poke Lounge world player state is malformed');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Poke Lounge world player state is malformed');
  }
  const player = value as Record<string, unknown>;
  if (
    player.playerId !== playerId ||
    typeof player.displayName !== 'string' ||
    player.displayName.length === 0 ||
    typeof player.map !== 'string' ||
    player.map.length === 0 ||
    typeof player.x !== 'number' ||
    !Number.isFinite(player.x) ||
    typeof player.y !== 'number' ||
    !Number.isFinite(player.y) ||
    (player.facing !== 'front' &&
      player.facing !== 'back' &&
      player.facing !== 'left' &&
      player.facing !== 'right') ||
    !Number.isSafeInteger(player.updatedAtMs) ||
    (player.updatedAtMs as number) < 0
  ) {
    throw new Error('Poke Lounge world player state is malformed');
  }

  return player as unknown as PokeLoungeWorldPlayerState;
}

function parseWorldSequence(value: unknown, allowMissing = false): number {
  if (allowMissing && (value === undefined || value === null)) {
    return 0;
  }
  const sequence =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && /^\d+$/.test(value)
        ? Number(value)
        : Number.NaN;
  if (!Number.isSafeInteger(sequence) || sequence < 0) {
    throw new Error('Poke Lounge world sequence is malformed');
  }
  return sequence;
}
