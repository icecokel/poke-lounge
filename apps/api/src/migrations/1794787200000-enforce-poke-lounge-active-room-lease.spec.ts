import type { QueryRunner } from 'typeorm';
import { EnforcePokeLoungeActiveRoomLease1794787200000 } from './1794787200000-enforce-poke-lounge-active-room-lease';

describe('EnforcePokeLoungeActiveRoomLease1794787200000', () => {
  it('recomputes every room status lease from the server-owned database timestamp', async () => {
    const query = jest.fn().mockResolvedValue(undefined);
    const migration = new EnforcePokeLoungeActiveRoomLease1794787200000();

    await migration.up({ query } as unknown as QueryRunner);

    const sql = query.mock.calls.flat().join('\n');
    expect(migration.name).toBe(
      'EnforcePokeLoungeActiveRoomLease1794787200000',
    );
    expect(sql).toContain(
      'SET "expires_at" = "updated_at" + CASE "state" ->> \'status\'',
    );
    expect(sql).toContain("WHEN 'waiting' THEN INTERVAL '30 minutes'");
    expect(sql).toContain("WHEN 'round-started' THEN INTERVAL '2 hours'");
    expect(sql).toContain("WHEN 'tournament' THEN INTERVAL '2 hours'");
    expect(sql).toContain("WHEN 'completed' THEN INTERVAL '10 minutes'");
    expect(sql).toContain("WHEN 'closed' THEN INTERVAL '10 minutes'");
    expect(sql).not.toContain('9999-12-31');
    expect(sql).not.toContain('DELETE FROM');
  });

  it('restores the legacy sentinel only for active room statuses on rollback', async () => {
    const query = jest.fn().mockResolvedValue(undefined);

    await new EnforcePokeLoungeActiveRoomLease1794787200000().down({
      query,
    } as unknown as QueryRunner);

    const sql = query.mock.calls.flat().join('\n');
    expect(sql).toContain(
      'SET "expires_at" = TIMESTAMPTZ \'9999-12-31 23:59:59.999+00\'',
    );
    expect(sql).toMatch(
      /"state" ->> 'status'\) IN \('round-started', 'tournament'\)/,
    );
    expect(sql).not.toContain('waiting');
    expect(sql).not.toContain('completed');
    expect(sql).not.toContain('closed');
  });
});
