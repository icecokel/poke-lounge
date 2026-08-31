import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CompetitiveMatchService } from './competitive/competitive-match.service';
import { COMPETITIVE_MATCH_REPOSITORY } from './competitive/competitive-match.repository';
import { COMPETITIVE_ACTION_REPOSITORY } from './competitive/competitive-action.repository';
import { PokeLoungeRoomEventsService } from './poke-lounge-room-events.service';
import { POKE_LOUNGE_ROOM_EVENT_PUBLISHER } from './poke-lounge-room-event.publisher';
import { POKE_LOUNGE_ROOM_REPOSITORY } from './poke-lounge-room.repository';
import { PokeLoungeGateway } from './poke-lounge.gateway';
import { PokeLoungeController } from './poke-lounge.controller';
import { PokeLoungeRoomService } from './poke-lounge-room.service';
import { PokeLoungeRomDataService } from './poke-lounge-rom-data.service';
import { CompetitiveProjectionService } from './competitive/competitive-projection.service';
import { RedisPokeLoungeRepository } from './redis-poke-lounge.repository';
import { PokeLoungeRedisModule } from './poke-lounge-redis.module';
import { CompetitiveTurnQueueService } from './competitive/competitive-turn-queue.service';
import { COMPETITIVE_TURN_QUEUE } from './competitive/competitive-turn-queue';

@Module({
  imports: [AuthModule, PokeLoungeRedisModule],
  controllers: [PokeLoungeController],
  providers: [
    RedisPokeLoungeRepository,
    CompetitiveProjectionService,
    {
      provide: COMPETITIVE_ACTION_REPOSITORY,
      useExisting: RedisPokeLoungeRepository,
    },
    {
      provide: COMPETITIVE_MATCH_REPOSITORY,
      useExisting: RedisPokeLoungeRepository,
    },
    {
      provide: POKE_LOUNGE_ROOM_REPOSITORY,
      useExisting: RedisPokeLoungeRepository,
    },
    PokeLoungeRoomEventsService,
    {
      provide: POKE_LOUNGE_ROOM_EVENT_PUBLISHER,
      useExisting: PokeLoungeRoomEventsService,
    },
    PokeLoungeRoomService,
    PokeLoungeRomDataService,
    CompetitiveTurnQueueService,
    {
      provide: COMPETITIVE_TURN_QUEUE,
      useExisting: CompetitiveTurnQueueService,
    },
    CompetitiveMatchService,
    PokeLoungeGateway,
  ],
  exports: [PokeLoungeRoomService],
})
export class PokeLoungeModule {}
