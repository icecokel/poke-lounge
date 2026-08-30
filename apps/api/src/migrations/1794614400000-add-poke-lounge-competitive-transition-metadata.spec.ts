import type { QueryRunner } from 'typeorm';
import { AddPokeLoungeCompetitiveTransitionMetadata1794614400000 } from './1794614400000-add-poke-lounge-competitive-transition-metadata';

describe('AddPokeLoungeCompetitiveTransitionMetadata1794614400000', () => {
  it('adds nullable paired terminal metadata with durable uniqueness and recovery indexes', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    const migration =
      new AddPokeLoungeCompetitiveTransitionMetadata1794614400000();

    await migration.up({ query } as unknown as QueryRunner);

    const sql = query.mock.calls.flat().join('\n');
    expect(migration.name).toBe(
      'AddPokeLoungeCompetitiveTransitionMetadata1794614400000',
    );
    expect(sql).toContain('ADD COLUMN "terminal_event_id" uuid');
    expect(sql).toContain('ADD COLUMN "terminal_room_revision" bigint');
    expect(sql).not.toMatch(/"terminal_event_id" uuid NOT NULL/);
    expect(sql).not.toMatch(/"terminal_room_revision" bigint NOT NULL/);
    expect(sql).toMatch(
      /CHECK[\s\S]*"terminal_event_id" IS NULL[\s\S]*"terminal_room_revision" IS NULL[\s\S]*OR[\s\S]*"terminal_event_id" IS NOT NULL[\s\S]*"terminal_room_revision" IS NOT NULL/,
    );
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX "UQ_poke_lounge_competitive_match_terminal_event"[\s\S]*\("terminal_event_id"\)[\s\S]*WHERE "terminal_event_id" IS NOT NULL/,
    );
    expect(sql).toMatch(
      /CREATE INDEX "IDX_poke_lounge_competitive_match_terminal_recovery"[\s\S]*\("room_id", "terminal_room_revision"\)[\s\S]*WHERE "terminal_event_id" IS NOT NULL/,
    );
  });

  it('drops only the transition indexes, pair constraint, and nullable metadata columns', async () => {
    const query = jest.fn().mockResolvedValue(undefined);

    await new AddPokeLoungeCompetitiveTransitionMetadata1794614400000().down({
      query,
    } as unknown as QueryRunner);

    const sql = query.mock.calls.flat().join('\n');
    expect(sql).toContain(
      'DROP INDEX "IDX_poke_lounge_competitive_match_terminal_recovery"',
    );
    expect(sql).toContain(
      'DROP INDEX "UQ_poke_lounge_competitive_match_terminal_event"',
    );
    expect(sql).toContain(
      'DROP CONSTRAINT "CHK_poke_lounge_competitive_match_terminal_metadata_pair"',
    );
    expect(sql).toContain('DROP COLUMN "terminal_room_revision"');
    expect(sql).toContain('DROP COLUMN "terminal_event_id"');
    expect(sql).not.toContain('poke_lounge_competitive_action');
    expect(sql).not.toContain('history_publication');
  });
});
