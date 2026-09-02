import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { Queue, Worker, type Job } from 'bullmq';
import {
  appendAiCapturedPokemon,
  chooseAiCompetitiveAction,
} from '@poke-lounge/battle/ai-policy';
import { resolveCaptureAttempt } from '@poke-lounge/battle/capture';
import { hashPokeLoungeRoomCommand } from '../poke-lounge-room-command';
import { PokeLoungeLiveStateService } from '../poke-lounge-live-state.service';
import type { PokeLoungeRoomSnapshot } from '../poke-lounge-room.repository';
import { RedisPokeLoungeRepository } from '../redis-poke-lounge.repository';
import { COMPETITIVE_TURN_DEADLINE_MS } from '../competitive/competitive-action.repository';
import { CompetitiveMatchService } from '../competitive/competitive-match.service';

const AI_QUEUE_NAME = 'poke-lounge-ai';
const AI_JOB_NAME = 'tick';
const AI_SCHEDULER_ID = 'poke-lounge-ai-tick';
const AI_TICK_MS = 1_000;
const AI_HUNT_CYCLE_MS = 20_000;
const AI_HUNT_DURATION_MS = 5_000;
const AI_SPEED_PX_PER_SECOND = 104;
const AI_ROUTE = [
  { x: 640, y: 480 },
  { x: 560, y: 480 },
  { x: 480, y: 480 },
  { x: 480, y: 520 },
  { x: 560, y: 520 },
  { x: 640, y: 520 },
] as const;
const ENCOUNTER_SPECIES_IDS = [
  10, 13, 16, 19, 25, 43, 69, 74, 129, 133, 161, 163, 165, 167, 179, 183, 187,
  194, 209, 231, 263, 265, 276, 285, 293, 304, 309, 396, 399, 403,
] as const;

@Injectable()
export class PokeLoungeAiWorkerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PokeLoungeAiWorkerService.name);
  private queue: Queue | null = null;
  private worker: Worker | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly repository: RedisPokeLoungeRepository,
    private readonly liveState: PokeLoungeLiveStateService,
    private readonly competitiveMatches: CompetitiveMatchService,
  ) {}

  async onModuleInit(): Promise<void> {
    const redisUrl = this.config.get<string>('REDIS_URL')?.trim();
    if (!redisUrl) throw new Error('REDIS_URL is required for AI jobs');
    await this.liveState.connect();
    const connection = { url: redisUrl, maxRetriesPerRequest: null };
    this.queue = new Queue(AI_QUEUE_NAME, { connection });
    this.worker = new Worker(
      AI_QUEUE_NAME,
      function callback(
        this: PokeLoungeAiWorkerService,
        job: Job,
      ): Promise<void> {
        return job.name === AI_JOB_NAME
          ? this.processTick()
          : Promise.resolve();
      }.bind(this),
      { connection, concurrency: 1 },
    );
    this.worker.on(
      'error',
      function handleError(this: PokeLoungeAiWorkerService, error: Error) {
        this.logger.error('Poke Lounge AI worker error', error.stack);
      }.bind(this),
    );
    await Promise.all([
      this.queue.waitUntilReady(),
      this.worker.waitUntilReady(),
    ]);
    await this.queue.upsertJobScheduler(
      AI_SCHEDULER_ID,
      { every: AI_TICK_MS },
      { name: AI_JOB_NAME, data: {} },
    );
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([
      this.worker?.close() ?? Promise.resolve(),
      this.queue?.close() ?? Promise.resolve(),
    ]);
    this.worker = null;
    this.queue = null;
  }

  async processTick(nowMs = Date.now()): Promise<void> {
    const roomCodes = await this.liveState.listRoomStateCodes();
    await Promise.all(
      roomCodes.map(
        async function mapItem(
          this: PokeLoungeAiWorkerService,
          roomCode: string,
        ): Promise<void> {
          try {
            await this.processRoom(roomCode, nowMs);
          } catch (error) {
            this.logger.error(
              `Failed to advance AI room ${roomCode}`,
              error instanceof Error ? error.stack : String(error),
            );
          }
        }.bind(this),
      ),
    );
  }

  private async processRoom(roomCode: string, nowMs: number): Promise<void> {
    const result = await this.repository.getAndAdvance(roomCode, nowMs);
    const room = result.snapshot;
    if (!room) return;
    if (result.committedChange) {
      await this.liveState.publishRoomCommit({
        roomCode,
        revision: room.revision,
      });
    }

    const aiParticipants = room.participants.filter(
      function filterItem(participant) {
        return participant.controller === 'ai' && participant.connected;
      },
    );
    const activeAiIds = new Set(
      aiParticipants.map(function mapItem(participant) {
        return participant.playerId;
      }),
    );
    const world = await this.liveState.getSnapshot(
      room.roomCode,
      room.expiresAtMs,
    );
    await Promise.all(
      world.players
        .filter(function filterItem(player) {
          return (
            player.controller === 'ai' && !activeAiIds.has(player.playerId)
          );
        })
        .map((player) =>
          this.liveState.removePlayer(room.roomCode, player.playerId),
        ),
    );
    if (aiParticipants.length === 0) return;

    await Promise.all(
      aiParticipants.map(
        async function mapItem(
          this: PokeLoungeAiWorkerService,
          participant: (typeof aiParticipants)[number],
        ): Promise<void> {
          await this.publishWorldState(room, participant.playerId, nowMs);
          await this.submitCompetitiveAction(
            room,
            participant.playerId,
            participant.sessionId,
            nowMs,
          );
        }.bind(this),
      ),
    );
    if (room.status === 'round-started') {
      let currentRoom = room;
      for (const participant of aiParticipants) {
        currentRoom =
          (await this.tryCapture(currentRoom, participant.playerId, nowMs)) ??
          currentRoom;
      }
    }
  }

  private async publishWorldState(
    room: PokeLoungeRoomSnapshot,
    playerId: string,
    nowMs: number,
  ): Promise<void> {
    const participant = room.participants.find(function findItem(candidate) {
      return candidate.playerId === playerId;
    })!;
    const party = room.partySnapshots[playerId]?.competitiveParty;
    const active = party?.members.find(function findItem(member) {
      return member.slotIndex === party.activeSlotIndex;
    });
    const elapsedMs = Math.max(0, nowMs - (room.round.startedAtMs ?? nowMs));
    const inPreparation = room.status === 'round-started';
    const cycleOffset = elapsedMs % AI_HUNT_CYCLE_MS;
    const hunting =
      inPreparation && cycleOffset >= AI_HUNT_CYCLE_MS - AI_HUNT_DURATION_MS;
    const position = positionOnRoute(
      hunting
        ? elapsedMs - cycleOffset + AI_HUNT_CYCLE_MS - AI_HUNT_DURATION_MS
        : elapsedMs,
      stableNumber(playerId) % 10_000,
    );
    await this.liveState.upsertPlayer({
      roomCode: room.roomCode,
      expiresAtMs: room.expiresAtMs,
      player: {
        playerId,
        displayName: participant.displayName,
        controller: 'ai',
        activity:
          room.status === 'tournament'
            ? 'tournament'
            : hunting
              ? 'hunting'
              : inPreparation
                ? 'moving'
                : 'idle',
        map: 'town',
        ...position,
        ...(active
          ? {
              activePokemon: {
                speciesId: active.speciesId,
                level: active.level,
              },
            }
          : {}),
        updatedAtMs: nowMs,
      },
    });
  }

  private async tryCapture(
    room: PokeLoungeRoomSnapshot,
    playerId: string,
    nowMs: number,
  ): Promise<PokeLoungeRoomSnapshot | null> {
    const startedAtMs = room.round.startedAtMs;
    const snapshot = room.partySnapshots[playerId];
    if (
      !startedAtMs ||
      !snapshot ||
      snapshot.competitiveParty.members.length >= 6
    )
      return null;
    const cycle = Math.floor((nowMs - startedAtMs) / AI_HUNT_CYCLE_MS);
    const boundaryMs = startedAtMs + cycle * AI_HUNT_CYCLE_MS;
    if (cycle < 1 || snapshot.updatedAtMs >= boundaryMs) return null;
    const seed = stableNumber(`${playerId}:${room.round.index}:${cycle}`);
    let roll = seed;
    const capture = resolveCaptureAttempt({
      maxHp: 100,
      currentHp: 35,
      catchRate: 190,
      random16: function random16() {
        roll = (roll * 1664525 + 1013904223) >>> 0;
        return roll % 65536;
      },
    });
    if (!capture.caught) return null;
    const speciesId =
      ENCOUNTER_SPECIES_IDS[seed % ENCOUNTER_SPECIES_IDS.length];
    const averageLevel = Math.round(
      snapshot.competitiveParty.members.reduce(function reduceItems(
        total,
        member,
      ) {
        return total + member.level;
      }, 0) / snapshot.competitiveParty.members.length,
    );
    const nextParty = appendAiCapturedPokemon(
      snapshot.competitiveParty,
      speciesId,
      Math.max(1, averageLevel - (seed % 6)),
    );
    const idempotencyKey = `ai-capture-r${room.round.index}-c${cycle}`;
    const body = { playerId, speciesId, cycle };
    const result = await this.repository.mutate({
      operation: 'party-snapshot',
      roomCode: room.roomCode,
      actorPlayerId: playerId,
      idempotencyKey,
      requestHash: hashPokeLoungeRoomCommand({
        operation: 'party-snapshot',
        roomCode: room.roomCode,
        body,
      }),
      expectedRevision: room.revision,
      nowMs,
      apply: function apply(current) {
        const currentSnapshot = current.partySnapshots[playerId];
        if (!currentSnapshot || currentSnapshot.updatedAtMs >= boundaryMs)
          return current;
        currentSnapshot.competitiveParty = nextParty;
        currentSnapshot.updatedAtMs = nowMs;
        current.updatedAtMs = nowMs;
        return current;
      },
    });
    if (result?.committedChange) {
      await this.liveState.publishRoomCommit({
        roomCode: room.roomCode,
        revision: result.snapshot.revision,
      });
    }
    return result?.snapshot ?? null;
  }

  private async submitCompetitiveAction(
    room: PokeLoungeRoomSnapshot,
    playerId: string,
    sessionId: string,
    nowMs: number,
  ): Promise<void> {
    const assignment = room.competitiveAssignments?.find(
      function findItem(candidate) {
        return (
          candidate.playerIds.includes(playerId) &&
          candidate.status !== 'completed' &&
          !candidate.submittedPlayerIds.includes(playerId)
        );
      },
    );
    if (!assignment) return;
    const turnStartedAtMs =
      assignment.turnEndsAtMs - COMPETITIVE_TURN_DEADLINE_MS;
    if (
      nowMs <
      turnStartedAtMs +
        800 +
        (stableNumber(`${playerId}:${assignment.currentTurn}`) % 401)
    ) {
      return;
    }
    await this.competitiveMatches.submitSessionAction({
      roomCode: room.roomCode,
      matchId: assignment.matchId,
      sessionId,
      assignmentRevision: assignment.assignmentRevision,
      turn: assignment.currentTurn,
      clientCommandId: `ai:${assignment.matchId}:${assignment.currentTurn}:${playerId}`,
      action: chooseAiCompetitiveAction(assignment.currentState, playerId),
    });
  }
}

function stableNumber(value: string): number {
  return Number.parseInt(
    createHash('sha256').update(value).digest('hex').slice(0, 8),
    16,
  );
}

function positionOnRoute(
  elapsedMs: number,
  offsetMs: number,
): {
  x: number;
  y: number;
  facing: 'front' | 'back' | 'left' | 'right';
} {
  const segmentLengths = AI_ROUTE.map(function mapItem(point, index) {
    const next = AI_ROUTE[(index + 1) % AI_ROUTE.length];
    return Math.hypot(next.x - point.x, next.y - point.y);
  });
  const routeLength = segmentLengths.reduce(function reduceItems(
    total,
    length,
  ) {
    return total + length;
  }, 0);
  let distance =
    (((elapsedMs + offsetMs) / 1_000) * AI_SPEED_PX_PER_SECOND) % routeLength;
  for (let index = 0; index < AI_ROUTE.length; index += 1) {
    const length = segmentLengths[index];
    if (distance > length) {
      distance -= length;
      continue;
    }
    const from = AI_ROUTE[index];
    const to = AI_ROUTE[(index + 1) % AI_ROUTE.length];
    const progress = length === 0 ? 0 : distance / length;
    const deltaX = to.x - from.x;
    const deltaY = to.y - from.y;
    return {
      x: from.x + deltaX * progress,
      y: from.y + deltaY * progress,
      facing:
        Math.abs(deltaX) > Math.abs(deltaY)
          ? deltaX > 0
            ? 'right'
            : 'left'
          : deltaY > 0
            ? 'front'
            : 'back',
    };
  }
  return { ...AI_ROUTE[0], facing: 'front' };
}
