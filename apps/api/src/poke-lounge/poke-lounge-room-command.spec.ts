import {
  canonicalizePokeLoungeCommand,
  hashPokeLoungeRoomCommand,
} from './poke-lounge-room-command';

describe('Poke Lounge room command hashing', () => {
  it('sorts object keys recursively, preserves arrays, and omits undefined object fields', () => {
    expect(
      canonicalizePokeLoungeCommand({
        zebra: 1,
        alpha: {
          omitted: undefined,
          list: [{ beta: 2, alpha: 1 }, 3],
        },
      }),
    ).toBe('{"alpha":{"list":[{"alpha":1,"beta":2},3]},"zebra":1}');
  });

  it('normalizes existing room codes and returns a SHA-256 request hash', () => {
    const first = hashPokeLoungeRoomCommand({
      operation: 'join',
      roomCode: ' room01 ',
      body: { sessionId: 'session-a', playerId: 'player-a' },
    });
    const reordered = hashPokeLoungeRoomCommand({
      body: { playerId: 'player-a', sessionId: 'session-a' },
      roomCode: 'ROOM01',
      operation: 'join',
    });

    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(reordered).toBe(first);
  });

  it('changes when any domain or authorization field changes', () => {
    const base = {
      operation: 'result' as const,
      roomCode: 'ROOM01',
      body: {
        reportingPlayerId: 'player-a',
        reportingSessionId: 'session-a',
        matchId: 'match-1',
        winnerPlayerId: 'player-a',
        loserPlayerId: 'player-b',
        reason: 'faint',
        nowMs: 10,
      },
    };

    expect(
      hashPokeLoungeRoomCommand({
        ...base,
        body: { ...base.body, reportingSessionId: 'session-b' },
      }),
    ).not.toBe(hashPokeLoungeRoomCommand(base));
    expect(
      hashPokeLoungeRoomCommand({
        ...base,
        body: { ...base.body, nowMs: 11 },
      }),
    ).not.toBe(hashPokeLoungeRoomCommand(base));
  });

  it('includes the host session identity in start command hashes', () => {
    const first = hashPokeLoungeRoomCommand({
      operation: 'start',
      roomCode: 'ROOM01',
      body: { playerId: 'player-a', sessionId: 'session-a' },
    });
    const otherSession = hashPokeLoungeRoomCommand({
      operation: 'start',
      roomCode: 'ROOM01',
      body: { playerId: 'player-a', sessionId: 'session-b' },
    });

    expect(otherSession).not.toBe(first);
  });
});
