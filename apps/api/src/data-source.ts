import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { DataSource } from 'typeorm';

const envPath = join(process.cwd(), '.env');

if (existsSync(envPath)) {
  process.loadEnvFile(envPath);
}

const parseDbPort = () => {
  const port = Number.parseInt(process.env.DB_PORT ?? '', 10);

  return Number.isNaN(port) ? 5432 : port;
};

const nodeEnv = process.env.NODE_ENV ?? 'development';

if (nodeEnv === 'production' && process.env.DB_SYNCHRONIZE === 'true') {
  throw new Error('DB_SYNCHRONIZE=true is not allowed in production');
}

export default new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: parseDbPort(),
  username: process.env.DB_USERNAME ?? 'postgres',
  password: process.env.DB_PASSWORD ?? 'postgres',
  database: process.env.DB_DATABASE ?? 'poke_lounge',
  entities: [join(__dirname, '**', '*.entity{.ts,.js}')],
  migrations: [join(__dirname, 'migrations', '*.{ts,js}')],
  synchronize: false,
});
