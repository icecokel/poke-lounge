import type { QueryRunner } from 'typeorm';
import { CreatePokeLoungeCompetitiveAssignment1794182400000 } from './1794182400000-create-poke-lounge-competitive-assignment';

describe('CreatePokeLoungeCompetitiveAssignment1794182400000', () => {
  it('creates durable private seats and complete immutable assignments with race-safe uniqueness', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    const migration = new CreatePokeLoungeCompetitiveAssignment1794182400000();

    await migration.up({ query } as unknown as QueryRunner);

    const sql = query.mock.calls.flat().join('\n');
    expect(sql).toContain('poke_lounge_competitive_seat');
    expect(sql).toContain('session_id');
    expect(sql).toContain('account_id');
    expect(sql).toContain('UNIQUE ("room_id", "session_id")');
    expect(sql).toContain('UNIQUE ("room_id", "account_id")');
    expect(sql).toContain('poke_lounge_competitive_match');
    expect(sql).toContain('assignment_revision');
    expect(sql).toContain('player_accounts');
    expect(sql).toContain('ruleset_version');
    expect(sql).toContain('ruleset_hash');
    expect(sql).toContain('server_seed');
    expect(sql).toContain('initial_state');
    expect(sql).toContain('initial_state_hash');
    expect(sql).toContain('current_state');
    expect(sql).toContain('current_state_hash');
    expect(sql).toContain('terminal_result');
    expect(sql).toContain('completed_at');
    expect(sql).toContain('UNIQUE ("room_id")');
    expect(sql).toContain('UNIQUE ("room_id", "match_id")');
  });
});
