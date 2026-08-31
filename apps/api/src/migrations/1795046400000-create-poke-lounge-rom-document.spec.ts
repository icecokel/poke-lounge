import type { QueryRunner } from 'typeorm';
import { CreatePokeLoungeRomDocument1795046400000 } from './1795046400000-create-poke-lounge-rom-document';

describe('CreatePokeLoungeRomDocument1795046400000 SQL contract', function testSuite() {
  it('creates a versioned and content-addressed ROM document table', async function testCase() {
    const migration = new CreatePokeLoungeRomDocument1795046400000();
    const queries = await captureQueries(migration, 'up');
    const query = queries.join('\n');

    expect(migration.name).toBe('CreatePokeLoungeRomDocument1795046400000');
    expect(query).toContain('CREATE TABLE "poke_lounge_rom_document"');
    expect(query).toContain('"document_key" varchar(32) PRIMARY KEY');
    expect(query).toContain('"schema_version" smallint NOT NULL');
    expect(query).toContain('"rom_sha1" char(40) NOT NULL');
    expect(query).toContain('"content_sha256" char(64) NOT NULL');
    expect(query).toContain('"payload" jsonb NOT NULL');
    expect(query).toContain('jsonb_typeof("payload") = \'object\'');
    expect(query).not.toContain('IF NOT EXISTS');
  });

  it('drops only the ROM document table on rollback', async function testCase() {
    const queries = await captureQueries(
      new CreatePokeLoungeRomDocument1795046400000(),
      'down',
    );

    expect(queries).toEqual(['DROP TABLE "poke_lounge_rom_document"']);
  });
});

async function captureQueries(
  migration: CreatePokeLoungeRomDocument1795046400000,
  direction: 'up' | 'down',
): Promise<string[]> {
  const queries: string[] = [];
  const queryRunner = {
    query: (query: string): Promise<void> => {
      queries.push(query.trim());

      return Promise.resolve();
    },
  } as unknown as QueryRunner;

  await migration[direction](queryRunner);

  return queries;
}
