import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { WinstonModule } from 'nest-winston';
import { winstonConfig } from '../common/utils/winston.config';
import { COMPETITIVE_ACTION_REPOSITORY } from './competitive/competitive-action.repository';
import { COMPETITIVE_MATCH_REPOSITORY } from './competitive/competitive-match.repository';
import { COMPETITIVE_TURN_QUEUE } from './competitive/competitive-turn-queue';
import { CompetitiveTurnQueueService } from './competitive/competitive-turn-queue.service';
import { CompetitiveTurnWorkerService } from './competitive/competitive-turn-worker.service';
import { PokeLoungeRedisModule } from './poke-lounge-redis.module';
import { RedisPokeLoungeRepository } from './redis-poke-lounge.repository';
import { CompetitiveMatchService } from './competitive/competitive-match.service';
import { CompetitiveProjectionService } from './competitive/competitive-projection.service';
import { PokeLoungeRoomEventsService } from './poke-lounge-room-events.service';
import { POKE_LOUNGE_ROOM_EVENT_PUBLISHER } from './poke-lounge-room-event.publisher';
import { PokeLoungeAiWorkerService } from './ai/poke-lounge-ai-worker.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    WinstonModule.forRoot(winstonConfig),
    PokeLoungeRedisModule,
  ],
  providers: [
    RedisPokeLoungeRepository,
    CompetitiveProjectionService,
    PokeLoungeRoomEventsService,
    {
      provide: POKE_LOUNGE_ROOM_EVENT_PUBLISHER,
      useExisting: PokeLoungeRoomEventsService,
    },
    {
      provide: COMPETITIVE_ACTION_REPOSITORY,
      useExisting: RedisPokeLoungeRepository,
    },
    {
      provide: COMPETITIVE_MATCH_REPOSITORY,
      useExisting: RedisPokeLoungeRepository,
    },
    CompetitiveTurnQueueService,
    {
      provide: COMPETITIVE_TURN_QUEUE,
      useExisting: CompetitiveTurnQueueService,
    },
    CompetitiveTurnWorkerService,
    CompetitiveMatchService,
    PokeLoungeAiWorkerService,
  ],
})
export class PokeLoungeTurnWorkerModule {}
