import type { QueryRunner } from 'typeorm';
import { AddGameResultTrust1794355200000 } from './1794355200000-add-game-result-trust';

describe('AddGameResultTrust1794355200000', () => {
  it('runs after the reserved competitive action migration timestamp', () => {
    const migration = new AddGameResultTrust1794355200000();

    expect(Number(migration.name.match(/(\d{13})$/)?.[1])).toBeGreaterThan(
      1794268800000,
    );
  });

  it('adds constrained trust, server source uniqueness, scoped backfill, and ranking index', async () => {
    const query = jest.fn().mockResolvedValue(undefined);

    await new AddGameResultTrust1794355200000().up({
      query,
    } as unknown as QueryRunner);

    const sql = query.mock.calls.flat().join('\n');
    expect(sql).toContain('"resultTrust" varchar(32)');
    expect(sql).toContain('"sourceKey" varchar(512)');
    expect(sql).toContain("IN ('client-asserted', 'verified-room')");
    expect(sql).toMatch(
      /UPDATE "game_history"[\s\S]*"gameType"::text = 'POKE_LOUNGE'[\s\S]*"resultTrust" IS NULL/,
    );
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX[\s\S]*\("sourceKey"\)[\s\S]*WHERE "sourceKey" IS NOT NULL/,
    );
    expect(sql).toMatch(
      /CREATE INDEX[\s\S]*\("gameType", "resultTrust", "userId", score DESC, "createdAt" ASC, id ASC\)/,
    );
  });

  it('fails closed before dropping columns that contain trust or source identity', async () => {
    const query = jest.fn().mockResolvedValue(undefined);

    await new AddGameResultTrust1794355200000().down({
      query,
    } as unknown as QueryRunner);

    const [guardSql] = query.mock.calls[0] as unknown as [string];
    expect(guardSql).toMatch(
      /IF EXISTS[\s\S]*"resultTrust" IS NOT NULL[\s\S]*"sourceKey" IS NOT NULL[\s\S]*RAISE EXCEPTION/,
    );
  });
});
