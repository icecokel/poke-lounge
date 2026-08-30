import {
  summarizeActionEvidence,
  summarizeRedisAssertionDocument,
} from '../../scripts/start-poke-lounge-e2e-api';

describe('Poke Lounge E2E assertion evidence', () => {
  it('counts action kinds and exposes only switch match/player/turn evidence', () => {
    expect(
      summarizeActionEvidence([
        {
          matchId: '11111111-1111-4111-8111-111111111111',
          playerId: 'player-4',
          turn: 0,
          kind: 'move',
        },
        {
          matchId: '11111111-1111-4111-8111-111111111111',
          playerId: 'player-5',
          turn: 0,
          kind: 'move',
        },
        {
          matchId: '11111111-1111-4111-8111-111111111111',
          playerId: 'player-4',
          turn: 3,
          kind: 'switch',
        },
      ]),
    ).toEqual({
      actionKindCounts: { move: 2, switch: 1 },
      forcedSwitchTurns: [
        {
          matchId: '11111111-1111-4111-8111-111111111111',
          playerId: 'player-4',
          turn: 3,
        },
      ],
    });
  });

  it('rejects an unknown stored action kind', () => {
    expect(() =>
      summarizeActionEvidence([
        {
          matchId: '11111111-1111-4111-8111-111111111111',
          playerId: 'player-4',
          turn: 0,
          kind: 'unknown',
        },
      ]),
    ).toThrow('Unknown competitive action kind');
  });

  it('summarizes Redis evidence without exposing stored secrets', () => {
    const party = {
      activeSlotIndex: 0,
      members: [
        {
          slotIndex: 0,
          speciesId: 25,
          level: 50,
          moves: [{ moveId: 33 }],
        },
      ],
    };
    const summary = summarizeRedisAssertionDocument(
      JSON.stringify({
        version: 1,
        id: 'room-id-secret',
        room: {
          roomCode: 'ABC123',
          revision: 9,
          tournament: { status: 'completed' },
          participants: [{ sessionId: 'session-secret' }],
          partySnapshots: {
            'player-1': { competitiveParty: party },
          },
        },
        commands: { command: { requestHash: 'request-hash-secret' } },
        seats: [
          { accountId: 'account-secret-1' },
          { accountId: 'account-secret-2' },
        ],
        matches: {
          match: {
            matchId: 'match-1',
            status: 'completed',
            currentTurn: 4,
            bracketMatchId: 'bracket-1',
            kind: 'tournament-unranked',
            rulesetVersion: 1,
            serverSeed: 'server-seed-secret',
            initialState: {
              playersById: {
                'player-1': {
                  activeSlotIndex: party.activeSlotIndex,
                  team: party.members,
                },
              },
            },
          },
        },
        actions: {
          action: {
            matchId: 'match-1',
            actorPlayerId: 'player-1',
            actorAccountId: 'account-secret-1',
            clientCommandId: 'client-command-secret',
            requestHash: 'action-hash-secret',
            turn: 3,
            action: { kind: 'switch', slotIndex: 1 },
          },
        },
      }),
      'ABC123',
    );

    expect(summary).toMatchObject({
      roomCode: 'ABC123',
      revision: 9,
      seatCount: 2,
      distinctAccountCount: 2,
      actionCount: 1,
      actionKindCounts: { move: 0, switch: 1 },
      matches: [{ matchId: 'match-1', status: 'completed' }],
    });
    expect(JSON.stringify(summary)).not.toMatch(
      /room-id-secret|session-secret|account-secret|request-hash-secret|server-seed-secret|client-command-secret|action-hash-secret/,
    );
    expect(() =>
      summarizeRedisAssertionDocument('{"version":1}', 'ABC123'),
    ).toThrow('Redis room is malformed');
  });
});
