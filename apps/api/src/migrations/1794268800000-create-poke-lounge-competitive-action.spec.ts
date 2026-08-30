import type { QueryRunner } from 'typeorm';
import { CreatePokeLoungeCompetitiveAction1794268800000 } from './1794268800000-create-poke-lounge-competitive-action';

describe('CreatePokeLoungeCompetitiveAction1794268800000', () => {
  it('creates durable exactly-once action receipts with private audit fields', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    const migration = new CreatePokeLoungeCompetitiveAction1794268800000();

    await migration.up({ query } as unknown as QueryRunner);

    const sql = query.mock.calls.flat().join('\n');
    expect(sql).toContain('poke_lounge_competitive_action');
    expect(sql).toContain('actor_player_id');
    expect(sql).toContain('actor_account_id');
    expect(sql).toContain('client_command_id');
    expect(sql).toContain('canonical_action');
    expect(sql).toContain('request_hash');
    expect(sql).toContain('response');
    expect(sql).toContain('resolved_at');
    expect(sql).toContain('UNIQUE ("match_id", "turn", "actor_player_id")');
    expect(sql).toContain(
      'UNIQUE ("match_id", "actor_player_id", "client_command_id")',
    );
  });
});
