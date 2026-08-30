import { PokeLoungeRoomEventsService } from './poke-lounge-room-events.service';
import { CompetitiveMatchService } from './competitive/competitive-match.service';
import { COMPETITIVE_MATCH_REPOSITORY } from './competitive/competitive-match.repository';
import { COMPETITIVE_ACTION_REPOSITORY } from './competitive/competitive-action.repository';
import { POKE_LOUNGE_ROOM_EVENT_PUBLISHER } from './poke-lounge-room-event.publisher';
import { POKE_LOUNGE_ROOM_REPOSITORY } from './poke-lounge-room.repository';
import { PokeLoungeGateway } from './poke-lounge.gateway';
import { PokeLoungeModule } from './poke-lounge.module';
import { PokeLoungeRedisModule } from './poke-lounge-redis.module';
import { RedisPokeLoungeRepository } from './redis-poke-lounge.repository';
import { CompetitiveTurnQueueService } from './competitive/competitive-turn-queue.service';
import { COMPETITIVE_TURN_QUEUE } from './competitive/competitive-turn-queue';

describe('PokeLoungeModule', () => {
  it('imports the shared Redis connection module', () => {
    const imports = Reflect.getMetadata(
      'imports',
      PokeLoungeModule,
    ) as object[];

    expect(imports).toContain(PokeLoungeRedisModule);
  });

  it('binds all transient repositories to one Redis implementation', () => {
    const providers = Reflect.getMetadata(
      'providers',
      PokeLoungeModule,
    ) as Array<object | (new (...args: never[]) => unknown)>;

    expect(providers).toContain(PokeLoungeRoomEventsService);
    expect(providers).toContain(PokeLoungeGateway);
    expect(providers).toContain(CompetitiveMatchService);
    expect(providers).toContain(CompetitiveTurnQueueService);
    expect(providers).toContain(RedisPokeLoungeRepository);
    expect(providers).toContainEqual({
      provide: COMPETITIVE_ACTION_REPOSITORY,
      useExisting: RedisPokeLoungeRepository,
    });
    expect(providers).toContainEqual({
      provide: COMPETITIVE_MATCH_REPOSITORY,
      useExisting: RedisPokeLoungeRepository,
    });
    expect(providers).toContainEqual({
      provide: POKE_LOUNGE_ROOM_REPOSITORY,
      useExisting: RedisPokeLoungeRepository,
    });
    expect(providers).toContainEqual({
      provide: POKE_LOUNGE_ROOM_EVENT_PUBLISHER,
      useExisting: PokeLoungeRoomEventsService,
    });
    expect(providers).toContainEqual({
      provide: COMPETITIVE_TURN_QUEUE,
      useExisting: CompetitiveTurnQueueService,
    });
  });
});
