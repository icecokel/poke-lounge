import type { QueryRunner } from 'typeorm';
import { CloseLegacyPokeLoungeCompetitiveRooms1794960000000 } from './1794960000000-close-legacy-poke-lounge-competitive-rooms';

describe('CloseLegacyPokeLoungeCompetitiveRooms1794960000000', function testSuite() {
  it('closes active rooms and removes only unfinished V1 matches', async function testCase() {
    const query = jest.fn().mockResolvedValue(undefined);

    await new CloseLegacyPokeLoungeCompetitiveRooms1794960000000().up({
      query,
    } as unknown as QueryRunner);

    const sql = query.mock.calls.flat().join('\n');
    expect(query).toHaveBeenCalledTimes(3);
    expect(sql).toContain("'{partySnapshots}'");
    expect(sql).toContain("'{}'::jsonb");
    expect(sql).toContain('legacy-room-restart-required');
    expect(sql).toContain("IN ('waiting', 'round-started', 'tournament')");
    expect(sql).toContain('"ruleset_version" = 1');
    expect(sql).toContain("IN ('pending', 'active')");
    expect(sql).not.toContain("'completed')");
  });
});
