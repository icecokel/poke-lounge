import { createTestPartySnapshot } from '../../test/support/competitive-party.fixture';
import { toPokeLoungePublicRoomState } from './poke-lounge-room-conflict';
import type { PokeLoungeRoomSnapshot } from './poke-lounge-room.repository';

describe('toPokeLoungePublicRoomState', () => {
  it('exposes only the active representative summary before a match', () => {
    const snapshot = roomSnapshot();
    snapshot.participants = [
      {
        sessionId: 'session-b',
        playerId: 'player-b',
        displayName: 'Player B',
        role: 'participant',
        ready: false,
        connected: true,
        joinedAtMs: 2,
      },
      {
        sessionId: 'session-a',
        playerId: 'player-a',
        displayName: 'Player A',
        role: 'participant',
        ready: false,
        connected: true,
        presencePendingUntilMs: 15_000,
        joinedAtMs: 1,
      },
    ];
    snapshot.partySnapshots['player-a'] = {
      ...createTestPartySnapshot('player-a'),
      displayName: 'Player A',
    };
    snapshot.tournament.roundScores = { 'player-a': 75 };

    const publicRoom = toPokeLoungePublicRoomState(snapshot);

    expect(publicRoom.partySnapshots['player-a']).toEqual({
      playerId: 'player-a',
      displayName: 'Player A',
      representativePokemon: {
        speciesId: 7,
        level: 11,
        currentHp: 34,
        maxHp: 34,
      },
      partySize: 1,
      updatedAtMs: 1,
    });
    expect(publicRoom.hostPlayerId).toBe('player-a');
    expect(publicRoom.participants[1]).toMatchObject({ connected: false });
    expect(JSON.stringify(publicRoom.partySnapshots)).not.toMatch(
      /individualValues|moves|attack|defense|speed/,
    );
    expect(publicRoom.tournament).not.toHaveProperty('roundScores');
  });
});

function roomSnapshot(): PokeLoungeRoomSnapshot {
  return {
    roomCode: 'ROOM01',
    status: 'waiting',
    createdAtMs: 0,
    updatedAtMs: 0,
    participants: [],
    partySnapshots: {},
    round: {
      index: 1,
      phase: 'waiting',
      durationMs: 1_000,
      startedAtMs: null,
      endsAtMs: null,
    },
    tournament: {
      version: 2,
      bracket: null,
      activeMatchId: null,
      activeMatchAuthority: null,
      cumulativeScores: {},
    },
    finalStandings: [],
    revision: 0,
    expiresAtMs: 1_800_000,
  };
}
