import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DelayedError, Worker, type Job } from 'bullmq';
import { PokeLoungeLiveStateService } from '../poke-lounge-live-state.service';
import {
  COMPETITIVE_ACTION_REPOSITORY,
  type CompetitiveActionRepository,
} from './competitive-action.repository';
import {
  COMPETITIVE_TURN_QUEUE,
  COMPETITIVE_TURN_QUEUE_NAME,
  type CompetitiveTurnJobData,
  type CompetitiveTurnJobResult,
  type CompetitiveTurnQueue,
} from './competitive-turn-queue';

const TURN_RECONCILIATION_INTERVAL_MS = 10_000;

@Injectable()
export class CompetitiveTurnWorkerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(CompetitiveTurnWorkerService.name);
  private worker: Worker<
    CompetitiveTurnJobData,
    CompetitiveTurnJobResult
  > | null = null;
  private reconciliationTimer: ReturnType<typeof setInterval> | null = null;
  private isReconciling = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly liveState: PokeLoungeLiveStateService,
    @Inject(COMPETITIVE_ACTION_REPOSITORY)
    private readonly actionRepository: CompetitiveActionRepository,
    @Inject(COMPETITIVE_TURN_QUEUE)
    private readonly turnQueue: CompetitiveTurnQueue,
  ) {}

  async onModuleInit(): Promise<void> {
    const redisUrl = this.configService.get<string>('REDIS_URL')?.trim();
    if (!redisUrl) {
      throw new Error('REDIS_URL is required for competitive turn jobs');
    }
    await this.liveState.connect();
    this.worker = new Worker<CompetitiveTurnJobData, CompetitiveTurnJobResult>(
      COMPETITIVE_TURN_QUEUE_NAME,
      (job) => this.process(job),
      {
        connection: { url: redisUrl, maxRetriesPerRequest: null },
        concurrency: 4,
      },
    );
    this.worker.on('error', (error) => {
      this.logger.error(
        'Competitive turn worker error',
        error instanceof Error ? error.stack : String(error),
      );
    });
    this.worker.on('failed', (job, error) => {
      this.logger.error(
        `Competitive turn job ${job?.id ?? 'unknown'} failed`,
        error.stack,
      );
    });
    await this.worker.waitUntilReady();
    await this.reconcilePendingTurns();
    this.reconciliationTimer = setInterval(
      () => void this.reconcilePendingTurns(),
      TURN_RECONCILIATION_INTERVAL_MS,
    );
    this.reconciliationTimer.unref();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.reconciliationTimer) {
      clearInterval(this.reconciliationTimer);
      this.reconciliationTimer = null;
    }
    await (this.worker?.close() ?? Promise.resolve());
    this.worker = null;
  }

  async process(
    job: Job<CompetitiveTurnJobData, CompetitiveTurnJobResult>,
  ): Promise<CompetitiveTurnJobResult> {
    const result = await this.actionRepository.expirePendingTurn({
      roomCode: job.data.roomCode,
      matchId: job.data.matchId,
      turn: job.data.turn,
      nowMs: Date.now(),
    });
    if (result.outcome === 'not-due') {
      await job.moveToDelayed(result.retryAtMs, job.token);
      throw new DelayedError();
    }
    if (result.outcome === 'ignored') {
      return { outcome: 'ignored' };
    }

    let scheduleFailed = false;
    let scheduleError: unknown;
    try {
      if (result.nextTurn) {
        await this.turnQueue.schedule(result.nextTurn);
      }
    } catch (error) {
      scheduleFailed = true;
      scheduleError = error;
    } finally {
      try {
        await this.liveState.publishRoomCommit({
          roomCode: result.room.roomCode,
          revision: result.room.revision,
        });
      } finally {
        if (scheduleFailed) {
          await this.reconcilePendingTurnsImmediately();
        }
      }
    }
    if (scheduleFailed) {
      throw scheduleError;
    }

    return { outcome: 'resolved' };
  }

  private async reconcilePendingTurns(): Promise<void> {
    if (this.isReconciling || !this.actionRepository.findPendingTurns) {
      return;
    }
    this.isReconciling = true;
    try {
      await this.ensurePendingTurns();
    } catch (error) {
      this.logger.error(
        'Failed to reconcile competitive turn deadlines',
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      this.isReconciling = false;
    }
  }

  private async reconcilePendingTurnsImmediately(): Promise<void> {
    try {
      await this.ensurePendingTurns();
    } catch (error) {
      this.logger.error(
        'Failed to immediately reconcile competitive turn deadlines',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private async ensurePendingTurns(): Promise<void> {
    if (!this.actionRepository.findPendingTurns) {
      return;
    }
    const pendingTurns = await this.actionRepository.findPendingTurns();
    await Promise.all(
      pendingTurns.map((pending) => this.turnQueue.schedule(pending)),
    );
  }
}
