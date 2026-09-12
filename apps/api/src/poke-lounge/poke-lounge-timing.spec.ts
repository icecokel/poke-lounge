import * as timing from '@poke-lounge/battle/timing';
import { COMPETITIVE_TURN_DEADLINE_MS } from './competitive/competitive-action.repository';
import {
  getPokeLoungeRoomExpiresAtMs,
  POKE_LOUNGE_ACTIVE_ROOM_LEASE_MS,
  POKE_LOUNGE_PENDING_PRESENCE_LEASE_MS,
} from './poke-lounge-room-policy';
import type { PokeLoungeRoomState } from './poke-lounge-room.types';

describe('API shared timing integration', () => {
  it('uses shared settings through existing API public exports', () => {
    expect(COMPETITIVE_TURN_DEADLINE_MS).toBe(
      timing.COMPETITIVE_TURN_DEADLINE_MS,
    );
    expect(POKE_LOUNGE_ACTIVE_ROOM_LEASE_MS).toBe(
      timing.POKE_LOUNGE_ACTIVE_ROOM_LEASE_MS,
    );
    expect(POKE_LOUNGE_PENDING_PRESENCE_LEASE_MS).toBe(
      timing.POKE_LOUNGE_PENDING_PRESENCE_LEASE_MS,
    );
  });

  it.each<[PokeLoungeRoomState['status'], number]>([
    ['waiting', 1_800_000],
    ['round-started', 7_200_000],
    ['tournament', 7_200_000],
    ['completed', 600_000],
    ['closed', 600_000],
  ])('preserves the %s room lease', (status, leaseMs) => {
    const updatedAtMs = 1_000_000;
    expect(getPokeLoungeRoomExpiresAtMs({ status, updatedAtMs })).toBe(
      updatedAtMs + leaseMs,
    );
  });
});
