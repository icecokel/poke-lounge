import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { WinstonModule } from 'nest-winston';
import { winstonConfig } from '../common/utils/winston.config';
import { COMPETITIVE_ACTION_REPOSITORY } from './competitive/competitive-action.repository';
import { COMPETITIVE_TURN_QUEUE } from './competitive/competitive-turn-queue';
import { CompetitiveTurnQueueService } from './competitive/competitive-turn-queue.service';
import { CompetitiveTurnWorkerService } from './competitive/competitive-turn-worker.service';
import { PokeLoungeRedisModule } from './poke-lounge-redis.module';
import { RedisPokeLoungeRepository } from './redis-poke-lounge.repository';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    WinstonModule.forRoot(winstonConfig),
    PokeLoungeRedisModule,
  ],
  providers: [
    RedisPokeLoungeRepository,
    {
      provide: COMPETITIVE_ACTION_REPOSITORY,
      useExisting: RedisPokeLoungeRepository,
    },
    CompetitiveTurnQueueService,
    {
      provide: COMPETITIVE_TURN_QUEUE,
      useExisting: CompetitiveTurnQueueService,
    },
    CompetitiveTurnWorkerService,
  ],
})
export class PokeLoungeTurnWorkerModule {}
