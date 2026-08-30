import type { QueryRunner } from 'typeorm';
import { SupportPokeLoungeTournamentMatches1794528000000 } from './1794528000000-support-poke-lounge-tournament-matches';

describe('SupportPokeLoungeTournamentMatches1794528000000', () => {
  it('replaces room uniqueness with bracket uniqueness and match kind', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    const migration = new SupportPokeLoungeTournamentMatches1794528000000();

    await migration.up({ query } as unknown as QueryRunner);

    const sql = query.mock.calls.flat().join('\n');
    expect(sql).toContain(
      'DROP CONSTRAINT "UQ_poke_lounge_competitive_match_room"',
    );
    expect(sql).toContain(
      'DROP CONSTRAINT "UQ_poke_lounge_competitive_match_room_match"',
    );
    expect(sql).toContain('"bracket_match_id"');
    expect(sql).toContain("'tournament-unranked'");
    expect(sql).toContain('UQ_poke_lounge_competitive_match_room_bracket');
    expect(sql).toContain('UQ_poke_lounge_competitive_match_active_room');
  });

  it('refuses down migration when tournament data exists', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    const migration = new SupportPokeLoungeTournamentMatches1794528000000();

    await migration.down({ query } as unknown as QueryRunner);

    expect(query.mock.calls.flat().join('\n')).toContain(
      'Cannot remove tournament match support while tournament data exists',
    );
    expect(query.mock.calls.flat().join('\n')).toContain(
      'ADD CONSTRAINT "UQ_poke_lounge_competitive_match_room_match"',
    );
  });
});
