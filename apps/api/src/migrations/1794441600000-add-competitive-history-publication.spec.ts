import type { QueryRunner } from 'typeorm';
import { AddCompetitiveHistoryPublication1794441600000 } from './1794441600000-add-competitive-history-publication';

describe('AddCompetitiveHistoryPublication1794441600000', () => {
  it('uses the unique later timestamp and adds a nullable JSONB audit mapping', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    const migration = new AddCompetitiveHistoryPublication1794441600000();

    await migration.up({ query } as unknown as QueryRunner);

    expect(migration.name).toBe(
      'AddCompetitiveHistoryPublication1794441600000',
    );
    expect(query.mock.calls.flat().join('\n')).toMatch(
      /ADD COLUMN "history_publication" jsonb/,
    );
  });

  it('fails closed before dropping a populated history publication column', async () => {
    const query = jest.fn().mockResolvedValue(undefined);

    await new AddCompetitiveHistoryPublication1794441600000().down({
      query,
    } as unknown as QueryRunner);

    const sql = query.mock.calls.flat().join('\n');
    expect(sql).toMatch(
      /IF EXISTS[\s\S]*"history_publication" IS NOT NULL[\s\S]*RAISE EXCEPTION/,
    );
    const [guardSql] = query.mock.calls[0] as unknown as [string];
    const [dropSql] = query.mock.calls.at(-1) as unknown as [string];
    expect(guardSql).toContain('history_publication');
    expect(dropSql).toContain('DROP COLUMN "history_publication"');
  });
});
