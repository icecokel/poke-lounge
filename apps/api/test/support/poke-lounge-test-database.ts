import type { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { User } from '../../src/auth/entities/user.entity';
import { requireTestDatabaseUrl } from '../../src/test-data-source';

const testDatabaseUrl = requireTestDatabaseUrl();

export function getPokeLoungeTestTypeOrmOptions(): TypeOrmModuleOptions {
  return {
    type: 'postgres',
    url: testDatabaseUrl,
    entities: [User],
    synchronize: false,
  };
}
