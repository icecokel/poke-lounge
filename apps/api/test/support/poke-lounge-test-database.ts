import type { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { DataSource, type DataSourceOptions } from 'typeorm';
import { PokeLoungeCompetitiveAction } from '../../src/poke-lounge/competitive/competitive-action.entity';
import { PokeLoungeCompetitiveMatch } from '../../src/poke-lounge/entities/poke-lounge-competitive-match.entity';
import { PokeLoungeCompetitiveSeat } from '../../src/poke-lounge/entities/poke-lounge-competitive-seat.entity';
import { PokeLoungeRoomCommand } from '../../src/poke-lounge/entities/poke-lounge-room-command.entity';
import { PokeLoungeRoom } from '../../src/poke-lounge/entities/poke-lounge-room.entity';
import { requireTestDatabaseUrl } from '../../src/test-data-source';

const testDatabaseUrl = requireTestDatabaseUrl();
const pokeLoungeEntities = [
  PokeLoungeRoom,
  PokeLoungeRoomCommand,
  PokeLoungeCompetitiveSeat,
  PokeLoungeCompetitiveMatch,
  PokeLoungeCompetitiveAction,
];

export function getPokeLoungeTestTypeOrmOptions(): TypeOrmModuleOptions {
  return {
    type: 'postgres',
    url: testDatabaseUrl,
    entities: pokeLoungeEntities,
    synchronize: false,
  };
}

export function createPokeLoungeTestDataSource(): DataSource {
  const options: DataSourceOptions = {
    type: 'postgres',
    url: testDatabaseUrl,
    entities: pokeLoungeEntities,
    synchronize: false,
  };

  return new DataSource(options);
}

export async function truncatePokeLoungeRoomStorage(
  dataSource: DataSource,
): Promise<void> {
  await dataSource.query(
    'TRUNCATE TABLE "poke_lounge_room_command", "poke_lounge_room" RESTART IDENTITY CASCADE',
  );
}
