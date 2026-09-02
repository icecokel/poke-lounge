import type { PokeLoungeRoomState } from '../poke-lounge-room.types';
import { createTournamentBracketState } from '@poke-lounge/battle/tournament-bracket';
import { planCompetitiveSeatBinding } from './competitive-match.repository';

describe('planCompetitiveSeatBinding', function testSuite() {
  it('rejects forged, anonymous, inactive, overwrite, and duplicate-account binding', function testCase() {
    const room = roomState();

    expect(plan(room, [], 'forged', 'account-a')).toEqual({
      outcome: 'seat-not-found',
    });
    expect(
      plan(
        {
          ...room,
          participants: [{ ...room.participants[0], connected: false }],
        },
        [],
        'session-a',
        'account-a',
      ),
    ).toEqual({ outcome: 'inactive-seat' });
    expect(
      plan(
        room,
        [seat('session-a', 'player-a', 'account-other')],
        'session-a',
        'account-a',
      ),
    ).toEqual({ outcome: 'seat-account-conflict' });
    expect(
      plan(
        room,
        [seat('session-b', 'player-b', 'account-a')],
        'session-a',
        'account-a',
      ),
    ).toEqual({ outcome: 'duplicate-account' });
  });

  it('is idempotent and keeps lobby seat binding assignment-free', function testCase() {
    const room = roomState();
    const first = plan(room, [], 'session-a', 'account-a');

    expect(first).toMatchObject({ outcome: 'bind', assignmentPlayers: null });

    const second = plan(
      room,
      [seat('session-a', 'player-a', 'account-a')],
      'session-b',
      'account-b',
    );
    expect(second).toEqual({
      outcome: 'bind',
      seat: seat('session-b', 'player-b', 'account-b'),
      assignmentPlayers: null,
      assignmentBracketMatchId: null,
      assignmentKind: null,
    });

    const replay = plan(
      room,
      [
        seat('session-a', 'player-a', 'account-a'),
        seat('session-b', 'player-b', 'account-b'),
      ],
      'session-a',
      'account-a',
    );
    expect(replay.outcome).toBe('already-bound');
    expect(
      'assignmentPlayers' in replay && replay.assignmentPlayers,
    ).toBeNull();
  });

  it('keeps rooms with more than two active participants casual', function testCase() {
    const room = roomState();
    room.participants.push({
      sessionId: 'session-c',
      playerId: 'player-c',
      displayName: 'C',
      role: 'participant',
      ready: false,
      connected: true,
      joinedAtMs: 2,
    });

    expect(
      plan(
        room,
        [seat('session-a', 'player-a', 'account-a')],
        'session-b',
        'account-b',
      ),
    ).toMatchObject({ outcome: 'bind', assignmentPlayers: null });
  });

  it('keeps an activated two-player dynamic-party bracket unranked', function testCase() {
    const room = roomState();
    const bracket = createTournamentBracketState(
      room.participants.map(function mapItem({ playerId, displayName }) {
        return {
          playerId,
          displayName,
        };
      }),
      room.round.index,
    );
    room.status = 'tournament';
    room.round.phase = 'tournament';
    room.tournament = {
      version: 2,
      bracket,
      activeMatchId: bracket.currentRound!.matches[0].matchId,
      activeMatchAuthority: 'casual',
      cumulativeScores: {},
    };
    const seats = [
      seat('session-a', 'player-a', 'account-a'),
      seat('session-b', 'player-b', 'account-b'),
    ];

    expect(plan(room, seats, 'session-a', 'account-a')).toMatchObject({
      assignmentPlayers: [
        { playerId: 'player-a', accountId: 'account-a' },
        { playerId: 'player-b', accountId: 'account-b' },
      ],
      assignmentBracketMatchId: 'game-round-1-bracket-1-match-1',
      assignmentKind: 'tournament-unranked',
    });
  });

  it('assigns only the requested player active bracket pair when all five seats are bound', function testCase() {
    const room = roomState();
    room.participants.push(
      participant('c'),
      participant('d'),
      participant('e'),
    );
    room.status = 'tournament';
    room.round.phase = 'tournament';
    room.tournament = {
      version: 2,
      bracket: {
        version: 1,
        gameRoundIndex: 1,
        status: 'in-progress',
        participants: room.participants.map(function mapItem(row, index) {
          return {
            playerId: row.playerId,
            displayName: row.displayName,
            seed: index + 1,
          };
        }),
        currentRound: {
          roundNumber: 1,
          matches: [
            {
              matchId: 'game-round-1-bracket-1-match-1',
              roundNumber: 1,
              matchNumber: 1,
              participantA: { playerId: 'player-d', displayName: 'D', seed: 4 },
              participantB: { playerId: 'player-e', displayName: 'E', seed: 5 },
              participantIds: ['player-d', 'player-e'],
              status: 'ready',
              winnerPlayerId: null,
              loserPlayerId: null,
              resultReason: null,
              completedAtMs: null,
            },
          ],
          byes: [],
          slots: [{ kind: 'match', matchId: 'game-round-1-bracket-1-match-1' }],
        },
        completedRounds: [],
        eliminations: [],
        championPlayerId: null,
      },
      activeMatchId: 'game-round-1-bracket-1-match-1',
      activeMatchAuthority: 'casual',
      cumulativeScores: {},
    };
    const seats = ['a', 'b', 'c', 'd', 'e'].map(function mapItem(suffix) {
      return seat(`session-${suffix}`, `player-${suffix}`, `account-${suffix}`);
    });

    expect(plan(room, seats, 'session-a', 'account-a')).toMatchObject({
      assignmentPlayers: null,
      assignmentBracketMatchId: null,
      assignmentKind: null,
    });
    expect(plan(room, seats, 'session-d', 'account-d')).toMatchObject({
      assignmentPlayers: [
        { playerId: 'player-d', accountId: 'account-d' },
        { playerId: 'player-e', accountId: 'account-e' },
      ],
      assignmentBracketMatchId: 'game-round-1-bracket-1-match-1',
      assignmentKind: 'tournament-unranked',
    });
  });
});

function participant(suffix: string) {
  return {
    sessionId: `session-${suffix}`,
    playerId: `player-${suffix}`,
    displayName: suffix.toUpperCase(),
    role: 'participant' as const,
    ready: true,
    connected: true,
    joinedAtMs: suffix.charCodeAt(0),
  };
}

function plan(
  room: PokeLoungeRoomState,
  seats: ReturnType<typeof seat>[],
  sessionId: string,
  accountId: string,
) {
  return planCompetitiveSeatBinding({ room, seats, sessionId, accountId });
}

function seat(sessionId: string, playerId: string, accountId: string) {
  return { sessionId, playerId, accountId };
}

function roomState(): PokeLoungeRoomState {
  return {
    roomCode: 'ROOM01',
    visibility: 'private',
    status: 'waiting',
    createdAtMs: 0,
    updatedAtMs: 0,
    participants: [
      {
        sessionId: 'session-a',
        playerId: 'player-a',
        displayName: 'A',
        role: 'participant',
        ready: false,
        connected: true,
        joinedAtMs: 0,
      },
      {
        sessionId: 'session-b',
        playerId: 'player-b',
        displayName: 'B',
        role: 'participant',
        ready: false,
        connected: true,
        joinedAtMs: 1,
      },
    ],
    partySnapshots: {},
    round: {
      index: 1,
      phase: 'waiting',
      durationMs: 1000,
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
  };
}
