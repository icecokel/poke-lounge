import type { QueryRunner } from 'typeorm';
import { AddGamePokeLoungeStateRevision1794700800000 } from './1794700800000-add-game-poke-lounge-state-revision';

describe('AddGamePokeLoungeStateRevision1794700800000', () => {
  it('adds a non-negative server-owned revision to existing saves', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    const migration = new AddGamePokeLoungeStateRevision1794700800000();

    await migration.up({ query } as unknown as QueryRunner);

    const sql = query.mock.calls.flat().join('\n');
    expect(migration.name).toBe('AddGamePokeLoungeStateRevision1794700800000');
    expect(sql).toContain('ADD COLUMN "revision" integer NOT NULL DEFAULT 0');
    expect(sql).toMatch(/CHECK \("revision" >= 0\)/);
  });

  it('drops only the revision constraint and column', async () => {
    const query = jest.fn().mockResolvedValue(undefined);

    await new AddGamePokeLoungeStateRevision1794700800000().down({
      query,
    } as unknown as QueryRunner);

    const sql = query.mock.calls.flat().join('\n');
    expect(sql).toContain(
      'DROP CONSTRAINT "CHK_game_poke_lounge_state_revision"',
    );
    expect(sql).toContain('DROP COLUMN "revision"');
    expect(sql).not.toContain('DROP TABLE');
  });
});
