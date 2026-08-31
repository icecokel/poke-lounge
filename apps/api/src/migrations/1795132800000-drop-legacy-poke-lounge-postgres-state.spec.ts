import type { QueryRunner } from 'typeorm';
import { DropLegacyPokeLoungePostgresState1795132800000 } from './1795132800000-drop-legacy-poke-lounge-postgres-state';

describe('DropLegacyPokeLoungePostgresState1795132800000 SQL contract', () => {
  it('fails closed, locks the legacy tables, and drops them child first', async () => {
    const migration = new DropLegacyPokeLoungePostgresState1795132800000();
    const queries = await captureQueries(migration, 'up');
    const sql = queries.join('\n');

    expect(migration.name).toBe(
      'DropLegacyPokeLoungePostgresState1795132800000',
    );
    expect(queries[0]).toContain('pg_catalog.to_regclass');
    expect(queries[1]).toContain('IN ACCESS EXCLUSIVE MODE');
    expect(queries[2]).toContain('Refusing to drop non-empty');
    expect(sql.match(/SELECT 1 FROM "[^"]+" LIMIT 1/g)).toHaveLength(6);
    expect(queries.slice(3)).toEqual([
      'DROP TABLE "poke_lounge_competitive_action"',
      'DROP TABLE "poke_lounge_competitive_match"',
      'DROP TABLE "poke_lounge_competitive_seat"',
      'DROP TABLE "poke_lounge_room_command"',
      'DROP TABLE "poke_lounge_room"',
      'DROP TABLE "game_poke_lounge_state"',
    ]);
    expect(sql).not.toMatch(/\bCASCADE\b|\bIF EXISTS\b/);
  });

  it('marks rollback as irreversible', async () => {
    const queries = await captureQueries(
      new DropLegacyPokeLoungePostgresState1795132800000(),
      'down',
    );

    expect(queries).toHaveLength(1);
    expect(queries[0]).toContain(
      'Legacy Poke Lounge PostgreSQL state cleanup is irreversible',
    );
    expect(queries[0]).not.toContain('CREATE TABLE');
  });
});

async function captureQueries(
  migration: DropLegacyPokeLoungePostgresState1795132800000,
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
