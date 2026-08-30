import { join } from 'node:path';
import { DataSource, type DataSourceOptions } from 'typeorm';

export function requireTestDatabaseUrl(
  environment: NodeJS.ProcessEnv = process.env,
): string {
  const testDatabaseUrl = environment.TEST_DATABASE_URL?.trim();

  if (!testDatabaseUrl) {
    throw new Error('TEST_DATABASE_URL is required for PostgreSQL tests');
  }

  const parsedTestUrl = parsePostgresUrl(testDatabaseUrl);
  const databaseName = decodeURIComponent(
    parsedTestUrl.pathname.replace(/^\/+|\/+$/g, ''),
  );

  if (!databaseName || databaseName.includes('/')) {
    throw new Error('TEST_DATABASE_URL must include one database name');
  }

  if (!databaseName.endsWith('_test')) {
    throw new Error('TEST_DATABASE_URL database name must end in _test');
  }

  const regularDatabaseUrls = [
    environment.DATABASE_URL,
    environment.DB_URL,
  ].filter((value): value is string => Boolean(value?.trim()));

  regularDatabaseUrls.forEach(assertRegularDatabaseUrlHasNoQuery);

  const testDatabaseTarget = databaseTarget(parsedTestUrl);

  if (
    regularDatabaseUrls.some((value) => {
      return regularDatabaseTarget(value) === testDatabaseTarget;
    })
  ) {
    throw new Error(
      'TEST_DATABASE_URL must not equal the regular database URL',
    );
  }

  if (environment.DB_DATABASE?.trim() === databaseName) {
    throw new Error('TEST_DATABASE_URL must not target DB_DATABASE');
  }

  return testDatabaseUrl;
}

export function createTestDataSourceOptions(
  environment: NodeJS.ProcessEnv = process.env,
): DataSourceOptions {
  return {
    type: 'postgres',
    url: requireTestDatabaseUrl(environment),
    entities: [join(__dirname, '**', '*.entity{.ts,.js}')],
    migrations: [join(__dirname, 'migrations', '*.{ts,js}')],
    synchronize: false,
  };
}

function parsePostgresUrl(value: string): URL {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(value);
  } catch {
    throw new Error('TEST_DATABASE_URL must be a valid PostgreSQL URL');
  }

  if (
    parsedUrl.protocol !== 'postgres:' &&
    parsedUrl.protocol !== 'postgresql:'
  ) {
    throw new Error('TEST_DATABASE_URL must be a PostgreSQL URL');
  }

  if (parsedUrl.search) {
    throw new Error('TEST_DATABASE_URL must not include query parameters');
  }

  if (!parsedUrl.hostname) {
    throw new Error('TEST_DATABASE_URL must include a database host');
  }

  if (!parsedUrl.username) {
    throw new Error('TEST_DATABASE_URL must include a database user');
  }

  return parsedUrl;
}

function assertRegularDatabaseUrlHasNoQuery(value: string): void {
  if (value.trim().includes('?')) {
    throw new Error('Regular database URLs must not include query parameters');
  }
}

function regularDatabaseTarget(value: string): string {
  try {
    const parsedUrl = new URL(value.trim());

    if (
      parsedUrl.protocol !== 'postgres:' &&
      parsedUrl.protocol !== 'postgresql:'
    ) {
      return value.trim();
    }

    return databaseTarget(parsedUrl);
  } catch {
    return value.trim();
  }
}

function databaseTarget(parsedUrl: URL): string {
  return `${parsedUrl.hostname}:${parsedUrl.port || '5432'}${parsedUrl.pathname}`;
}

export default new DataSource(createTestDataSourceOptions());
