import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { Queue, Worker, type Job } from 'bullmq';
import { chooseAiCompetitiveAction } from '@poke-lounge/battle/ai-policy';
import { getCompetitiveActionPlayerIds } from '@poke-lounge/battle/actions';
import { sharesPartyExperience } from '@poke-lounge/battle/round-settings';
import {
  advanceAiAdventure,
  aiCompetitiveParty,
  createAiAdventure,
} from '@poke-lounge/battle/adventure/ai-world';
import { AI_REMOTE_PLAYER_INTERPOLATION_MS } from '@poke-lounge/battle/adventure/world/player-motion';
import { canonicalize } from '@poke-lounge/battle/canonical-state';
import { PokeLoungeAiRuntimeService } from './poke-lounge-ai-runtime.service';
import { hashPokeLoungeRoomCommand } from '../poke-lounge-room-command';
import { PokeLoungeLiveStateService } from '../poke-lounge-live-state.service';
import type { PokeLoungeRoomSnapshot } from '../poke-lounge-room.repository';
import { RedisPokeLoungeRepository } from '../redis-poke-lounge.repository';
import { COMPETITIVE_TURN_DEADLINE_MS } from '../competitive/competitive-action.repository';
import { CompetitiveMatchService } from '../competitive/competitive-match.service';

const AI_QUEUE_NAME = 'poke-lounge-ai';
const AI_JOB_NAME = 'tick';
const AI_SCHEDULER_ID = 'poke-lounge-ai-tick';
const AI_TICK_MS = AI_REMOTE_PLAYER_INTERPOLATION_MS;

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
    private readonly runtime: PokeLoungeAiRuntimeService,
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
    if (room.status === 'closed') {
      await this.liveState.deleteRoom(roomCode);
      return;
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
        .filter(
          (player) =>
            player.controller === 'ai' && !activeAiIds.has(player.playerId),
        )
        .map((player) =>
          this.liveState.removePlayer(room.roomCode, player.playerId),
        ),
    );
    if (aiParticipants.length > 0) {
      const context = {
        ...(await this.runtime.getContext()),
        sharePartyExperience: sharesPartyExperience(room.round.durationMs),
      };
      const saved = await this.liveState.getAiAdventures(roomCode);
      const states: typeof saved = {};
      const parties: typeof room.partySnapshots = {};
      for (const participant of aiParticipants) {
        const snapshot = room.partySnapshots[participant.playerId];
        if (!snapshot) throw new Error('AI party snapshot is missing');
        const state =
          saved[participant.playerId] ??
          createAiAdventure(snapshot.competitiveParty, nowMs, context);
        // Private world parties, like human parties, are not overwritten by PvP damage.
        advanceAiAdventure(
          state,
          nowMs,
          room.round.index,
          room.status === 'round-started',
          context,
        );
        states[participant.playerId] = state;
        // Tournament parties belong to the competitive authority until the next preparation.
        if (room.status === 'round-started' || room.status === 'waiting') {
          const competitiveParty = aiCompetitiveParty(state);
          if (
            competitiveParty &&
            canonicalize(competitiveParty) !==
              canonicalize(snapshot.competitiveParty)
          ) {
            parties[participant.playerId] = {
              ...snapshot,
              competitiveParty,
              updatedAtMs: nowMs,
            };
          }
        }
      }
      let currentRoom = room;
      if (Object.keys(parties).length > 0) {
        const result = await this.repository.mutate({
          operation: 'party-snapshot',
          roomCode,
          actorPlayerId: aiParticipants[0].playerId,
          idempotencyKey: `ai-party:${nowMs}`,
          requestHash: hashPokeLoungeRoomCommand({
            operation: 'party-snapshot',
            roomCode,
            body: parties,
          }),
          expectedRevision: room.revision,
          nowMs,
          apply(current) {
            Object.assign(current.partySnapshots, parties);
            current.updatedAtMs = nowMs;
            return current;
          },
        });
        if (!result) return;
        if (
          result.outcome === 'revision-conflict' ||
          result.outcome === 'idempotency-conflict'
        ) {
          if (result.committedChange)
            await this.liveState.publishRoomCommit({
              roomCode,
              revision: result.snapshot.revision,
            });
          return;
        }
        currentRoom = result.snapshot;
        if (result.committedChange)
          await this.liveState.publishRoomCommit({
            roomCode,
            revision: currentRoom.revision,
          });
      }
      // The queue has one active tick. Persist private simulation separately from public room revisions.
      await this.liveState.saveAiAdventures(
        roomCode,
        currentRoom.expiresAtMs,
        states,
      );
      for (const participant of aiParticipants) {
        const state = states[participant.playerId];
        const active = state.party.find(
          (slot) => slot.slotIndex === state.activeSlotIndex,
        )?.pokemon;
        await this.liveState.upsertPlayer({
          roomCode,
          expiresAtMs: currentRoom.expiresAtMs,
          player: {
            playerId: participant.playerId,
            displayName: participant.displayName,
            controller: 'ai',
            activity: state.activity,
            map: 'town',
            ...state.position,
            facing: state.facing,
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
        await this.submitCompetitiveAction(
          currentRoom,
          participant.playerId,
          participant.sessionId,
          nowMs,
        );
      }
    }
    const latest = await this.repository.getAndAdvance(roomCode, nowMs);
    if (latest.committedChange && latest.snapshot) {
      await this.liveState.publishRoomCommit({
        roomCode,
        revision: latest.snapshot.revision,
      });
    }
    if (!latest.snapshot || latest.snapshot.status === 'closed')
      await this.liveState.deleteRoom(roomCode);
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
          getCompetitiveActionPlayerIds(candidate.currentState).includes(
            playerId,
          ) &&
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
