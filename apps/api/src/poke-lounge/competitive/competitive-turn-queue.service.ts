import {
  Injectable,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import {
  COMPETITIVE_TURN_JOB_NAME,
  COMPETITIVE_TURN_QUEUE_NAME,
  createCompetitiveTurnJobId,
  type CompetitiveTurnJobData,
  type CompetitiveTurnJobResult,
  type CompetitiveTurnQueue,
} from './competitive-turn-queue';

const RETRY_ATTEMPTS = 720;
const RETRY_DELAY_MS = 5_000;

@Injectable()
export class CompetitiveTurnQueueService
  implements CompetitiveTurnQueue, OnModuleInit, OnModuleDestroy
{
  private queue: Queue<
    CompetitiveTurnJobData,
    CompetitiveTurnJobResult
  > | null = null;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const redisUrl = this.requireRedisUrl();
    this.queue = new Queue(COMPETITIVE_TURN_QUEUE_NAME, {
      connection: {
        url: redisUrl,
        enableOfflineQueue: false,
        maxRetriesPerRequest: 1,
      },
      defaultJobOptions: {
        attempts: RETRY_ATTEMPTS,
        backoff: { type: 'fixed', delay: RETRY_DELAY_MS },
        removeOnComplete: { count: 1_000 },
        removeOnFail: { count: 1_000 },
      },
    });
    await this.queue.waitUntilReady();
  }

  async onModuleDestroy(): Promise<void> {
    await (this.queue?.close() ?? Promise.resolve());
    this.queue = null;
  }

  async schedule(turn: CompetitiveTurnJobData): Promise<void> {
    const queue = this.queue;
    if (!queue) {
      throw new Error('Competitive turn queue is unavailable');
    }
    await queue.add(COMPETITIVE_TURN_JOB_NAME, turn, {
      jobId: createCompetitiveTurnJobId(turn),
      delay: Math.max(0, turn.deadlineMs - Date.now()),
    });
  }

  private requireRedisUrl(): string {
    const redisUrl = this.configService.get<string>('REDIS_URL')?.trim();
    if (!redisUrl) {
      throw new Error('REDIS_URL is required for competitive turn jobs');
    }
    return redisUrl;
  }
}
