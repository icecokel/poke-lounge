import type { PokeLoungeRoomSnapshot } from './poke-lounge-room.repository';
import { createTournamentBracketState } from '@poke-lounge/battle/tournament-bracket';
import {
  POKE_LOUNGE_ACTIVE_ROOM_LEASE_MS,
  POKE_LOUNGE_PENDING_PRESENCE_LEASE_MS,
  advancePokeLoungeRoomClock,
  completePokeLoungeTournamentMatch,
  createTournamentState,
  expirePendingPokeLoungePresence,
  getPokeLoungeRoomHostPlayerId,
  getPokeLoungeRoomExpiresAtMs,
  isPokeLoungeRoomExpired,
  normalizeLegacyPokeLoungeRoomSnapshot,
} from './poke-lounge-room-policy';
import { createTestPartySnapshots } from '../../test/support/competitive-party.fixture';

const MINUTE_MS = 60_000;

describe('PokeLoungeRoomPolicy', function testSuite() {
  it('selects the current host by join time and then player id', function testCase() {
    const room = createSnapshot({
      participants: [
        createParticipant('player-c', 2),
        createParticipant('player-b', 1),
        createParticipant('player-a', 1),
      ],
    });

    expect(getPokeLoungeRoomHostPlayerId(room)).toBe('player-a');
    room.participants = room.participants.filter(
      function filterItem(participant) {
        return participant.playerId !== 'player-a';
      },
    );
    expect(getPokeLoungeRoomHostPlayerId(room)).toBe('player-b');
    expect(
      getPokeLoungeRoomHostPlayerId(createSnapshot({ participants: [] })),
    ).toBeNull();
  });

  it.each([
    ['waiting', 30 * MINUTE_MS],
    ['completed', 10 * MINUTE_MS],
    ['closed', 10 * MINUTE_MS],
  ] as const)(
    'expires %s rooms from their latest update',
    function callback(status, retentionMs) {
      const room = createSnapshot({ status, updatedAtMs: 1_000 });

      expect(getPokeLoungeRoomExpiresAtMs(room)).toBe(1_000 + retentionMs);
    },
  );

  it.each(['round-started', 'tournament'] as const)(
    'expires inactive %s rooms after the active lease',
    function callback(status) {
      expect(
        getPokeLoungeRoomExpiresAtMs(
          createSnapshot({ status, updatedAtMs: 1_000 }),
        ),
      ).toBe(1_000 + POKE_LOUNGE_ACTIVE_ROOM_LEASE_MS);
    },
  );

  it('keeps the active lease longer than the maximum preparation round', function testCase() {
    expect(POKE_LOUNGE_ACTIVE_ROOM_LEASE_MS).toBeGreaterThan(60 * MINUTE_MS);
  });

  it('keeps the waiting room lease while every presence is pending', function testCase() {
    const room = createSnapshot({
      updatedAtMs: 1_000,
      participants: [
        {
          ...createParticipant('player-1', 1_000),
          presencePendingUntilMs: 16_000,
        },
        {
          ...createParticipant('player-2', 1_001),
          presencePendingUntilMs: 17_000,
        },
      ],
    });

    expect(getPokeLoungeRoomExpiresAtMs(room)).toBe(1_000 + 30 * MINUTE_MS);
  });

  it('uses a strict expiry boundary', function testCase() {
    const room = createSnapshot({
      status: 'waiting',
      updatedAtMs: 1_000,
    });
    const expiresAtMs = getPokeLoungeRoomExpiresAtMs(room);

    expect(isPokeLoungeRoomExpired({ ...room, expiresAtMs }, expiresAtMs)).toBe(
      false,
    );
    expect(
      isPokeLoungeRoomExpired({ ...room, expiresAtMs }, expiresAtMs + 1),
    ).toBe(true);
  });

  it('keeps an empty waiting room reclaimable after a pending lease expires', function testCase() {
    const pendingUntilMs = 1_000 + POKE_LOUNGE_PENDING_PRESENCE_LEASE_MS;
    const room = createSnapshot({
      participants: [
        {
          ...createParticipant('player-1', 1_000),
          presencePendingUntilMs: pendingUntilMs,
        },
      ],
    });

    expect(
      expirePendingPokeLoungePresence(room, pendingUntilMs - 1),
    ).toBeNull();
    expect(expirePendingPokeLoungePresence(room, pendingUntilMs)).toMatchObject(
      {
        status: 'waiting',
        revision: 1,
        participants: [],
        round: { phase: 'waiting' },
        expiresAtMs: pendingUntilMs + 30 * MINUTE_MS,
      },
    );
  });

  it('keeps an unacknowledged round resume reclaimable after its pending lease expires', function testCase() {
    const pendingUntilMs = 2_000;
    const room = createSnapshot({
      status: 'round-started',
      participants: [
        {
          ...createParticipant('player-1', 1),
          presencePendingUntilMs: pendingUntilMs,
          presenceEpoch: 'stale-epoch',
        },
        createParticipant('player-2', 2),
      ],
      partySnapshots: createTestPartySnapshots(['player-1', 'player-2']),
      round: {
        index: 1,
        phase: 'round-started',
        durationMs: 300_000,
        startedAtMs: 0,
        endsAtMs: 300_000,
      },
    });

    const expired = expirePendingPokeLoungePresence(room, pendingUntilMs);

    expect(expired).toMatchObject({
      status: 'round-started',
      participants: [
        {
          playerId: 'player-1',
          connected: false,
          ready: false,
          leftAtMs: pendingUntilMs,
        },
        { playerId: 'player-2', connected: true },
      ],
    });
    expect(expired?.partySnapshots['player-1']).toMatchObject({
      playerId: 'player-1',
    });
    expect(expired?.participants[0]).not.toHaveProperty(
      'presencePendingUntilMs',
    );
    expect(expired?.participants[0]).not.toHaveProperty('presenceEpoch');
  });

  it('turns an expired tournament rejoin lease offline and converges its casual match', function testCase() {
    const pendingUntilMs = 2_000;
    const participants = [
      {
        ...createParticipant('player-1', 1),
        presencePendingUntilMs: pendingUntilMs,
      },
      createParticipant('player-2', 2),
    ];
    const bracket = createTournamentBracketState(
      participants.map(function mapItem({ playerId, displayName }) {
        return {
          playerId,
          displayName,
        };
      }),
      1,
    );
    const room = createSnapshot({
      status: 'tournament',
      participants,
      round: {
        index: 1,
        phase: 'tournament',
        durationMs: 1_000,
        startedAtMs: 0,
        endsAtMs: 1_000,
      },
      tournament: {
        version: 2,
        bracket,
        activeMatchId: bracket.currentRound!.matches[0].matchId,
        activeMatchAuthority: 'casual',
        cumulativeScores: {},
      },
    });

    expect(expirePendingPokeLoungePresence(room, pendingUntilMs)).toMatchObject(
      {
        status: 'waiting',
        participants: [
          {
            playerId: 'player-1',
            connected: false,
            ready: false,
            leftAtMs: pendingUntilMs,
          },
          { playerId: 'player-2', connected: true },
        ],
        tournament: {
          activeMatchId: null,
          bracket: null,
          cumulativeScores: { 'player-1': 70, 'player-2': 100 },
        },
        round: { index: 2, phase: 'waiting' },
      },
    );
  });

  it('completes three game rounds and rewards two wins over one regardless of remaining HP', function testCase() {
    let room = createSnapshot({
      status: 'round-started',
      participants: [
        createParticipant('player-1', 1),
        createParticipant('player-2', 2),
      ],
      round: {
        index: 1,
        phase: 'round-started',
        durationMs: 1_000,
        startedAtMs: 0,
        endsAtMs: 1_000,
      },
    });
    const rounds = [
      {
        winnerPlayerId: 'player-1',
      },
      {
        winnerPlayerId: 'player-2',
      },
      {
        winnerPlayerId: 'player-1',
      },
    ] as const;

    for (const [index, round] of rounds.entries()) {
      for (const participant of room.participants) {
        participant.ready = true;
      }
      const advanced = advancePokeLoungeRoomClock(room, room.round.endsAtMs!);
      expect(advanced).not.toBeNull();
      room = advanced!;
      completePokeLoungeTournamentMatch(
        room,
        room.tournament.activeMatchId!,
        round.winnerPlayerId,
        'faint',
        2_000 + index,
      );

      if (index < 2) {
        expect(room).toMatchObject({
          status: 'round-started',
          participants: [
            { playerId: 'player-1', ready: false },
            { playerId: 'player-2', ready: false },
          ],
          round: { index: index + 2, phase: 'round-started' },
          tournament: { bracket: null },
        });
      }
    }

    expect(room).toMatchObject({
      status: 'completed',
      round: { index: 3, phase: 'completed', endsAtMs: null },
      tournament: {
        activeMatchId: null,
        cumulativeScores: { 'player-1': 270, 'player-2': 240 },
      },
      finalStandings: [
        { playerId: 'player-1', rank: 1, score: 270 },
        { playerId: 'player-2', rank: 2, score: 240 },
      ],
    });
  });

  it('applies round ranking scores in the same transition that ends the round', function testCase() {
    const room = createSnapshot({
      status: 'round-started',
      participants: [
        createParticipant('player-1', 1),
        createParticipant('player-2', 2),
      ],
      round: {
        index: 1,
        phase: 'round-started',
        durationMs: 1_000,
        startedAtMs: 0,
        endsAtMs: 1_000,
      },
    });
    const tournament = advancePokeLoungeRoomClock(room, 1_000)!;

    completePokeLoungeTournamentMatch(
      tournament,
      tournament.tournament.activeMatchId!,
      'player-1',
      'faint',
      1_001,
    );

    expect(tournament).toMatchObject({
      status: 'round-started',
      round: { index: 2, phase: 'round-started' },
      tournament: {
        cumulativeScores: { 'player-1': 100, 'player-2': 70 },
      },
    });
  });

  it('scores an eight-player bracket by elimination round exactly once', function testCase() {
    const participants = Array.from({ length: 8 }, (_, index) =>
      createParticipant(`player-${index + 1}`, index + 1),
    );
    const bracket = createTournamentBracketState(participants, 3);
    const room = createSnapshot({
      status: 'tournament',
      participants,
      round: {
        index: 3,
        phase: 'tournament',
        durationMs: 1_000,
        startedAtMs: 0,
        endsAtMs: null,
      },
      tournament: {
        version: 2,
        bracket,
        activeMatchId: bracket.currentRound!.matches[0].matchId,
        activeMatchAuthority: 'casual',
        cumulativeScores: {},
      },
    });
    let lastMatchId = '';
    let lastWinner = '';
    while (room.tournament.bracket?.status !== 'completed') {
      expect(room.tournament.cumulativeScores).toEqual({});
      const match = room.tournament.bracket!.currentRound!.matches.find(
        (candidate) => candidate.status === 'ready',
      )!;
      lastMatchId = match.matchId;
      lastWinner = match.participantIds[0];
      completePokeLoungeTournamentMatch(
        room,
        lastMatchId,
        lastWinner,
        'faint',
        1_000,
      );
    }
    expect(room.finalStandings.map((row) => [row.rank, row.score])).toEqual([
      [1, 100],
      [2, 70],
      [3, 45],
      [3, 45],
      [5, 15],
      [5, 15],
      [5, 15],
      [5, 15],
    ]);
    const scores = { ...room.tournament.cumulativeScores };
    expect(() =>
      completePokeLoungeTournamentMatch(
        room,
        lastMatchId,
        lastWinner,
        'faint',
        1_001,
      ),
    ).toThrow();
    expect(room.tournament.cumulativeScores).toEqual(scores);
  });

  it('advances an elapsed round once with deterministic tournament matches', function testCase() {
    const room = createSnapshot({
      status: 'round-started',
      revision: 7,
      participants: [
        createParticipant('player-c', 30),
        createParticipant('player-a', 10),
        createParticipant('player-b', 20),
      ],
      round: {
        index: 2,
        phase: 'round-started',
        durationMs: 1_000,
        startedAtMs: 100,
        endsAtMs: 1_100,
      },
    });

    const advanced = advancePokeLoungeRoomClock(room, 1_100);

    expect(advanced).toMatchObject({
      status: 'tournament',
      revision: 8,
      updatedAtMs: 1_100,
      expiresAtMs: 1_100 + POKE_LOUNGE_ACTIVE_ROOM_LEASE_MS,
      round: { phase: 'tournament' },
      tournament: {
        version: 2,
        activeMatchId: 'game-round-2-bracket-1-match-1',
        activeMatchAuthority: 'casual',
        bracket: {
          currentRound: {
            matches: [
              {
                matchId: 'game-round-2-bracket-1-match-1',
                participantIds: ['player-b', 'player-c'],
                status: 'ready',
              },
            ],
            byes: [
              {
                entrant: { playerId: 'player-a' },
              },
            ],
          },
        },
      },
    });
    expect(room).toMatchObject({
      status: 'round-started',
      revision: 7,
      tournament: { bracket: null },
    });
  });

  it('restores every participant party when the round enters tournament', function testCase() {
    const room = createSnapshot({
      status: 'round-started',
      participants: [
        createParticipant('player-1', 1),
        createParticipant('player-2', 2),
      ],
      round: {
        index: 1,
        phase: 'round-started',
        durationMs: 1_000,
        startedAtMs: 0,
        endsAtMs: 1_000,
      },
    });
    const damaged = room.partySnapshots['player-1'].competitiveParty;
    room.partySnapshots['player-1'].competitiveParty = {
      ...damaged,
      members: Array.from({ length: 6 }, function mapItem(_, slotIndex) {
        const member = damaged.members[0];
        return {
          ...member,
          slotIndex,
          currentHp: slotIndex === 0 ? 1 : 0,
          status: slotIndex === 0 ? ('burned' as const) : ('fainted' as const),
          moves: member.moves.map(function mapItem(move) {
            return { ...move, pp: 0 };
          }),
        };
      }),
    };

    const advanced = advancePokeLoungeRoomClock(room, 1_000);
    const restored =
      advanced?.partySnapshots['player-1'].competitiveParty.members[0];
    const restoredParty =
      advanced?.partySnapshots['player-1'].competitiveParty.members;
    expect(restoredParty).toHaveLength(6);
    for (const member of restoredParty ?? []) {
      expect(member.currentHp).toBe(member.maxHp);
      expect(member.status).toBe('normal');
      expect(member.moves[0].pp).toBe(25);
    }

    expect(restored).toMatchObject({
      currentHp: restored?.maxHp,
      status: 'normal',
      moves: [{ moveId: 55, pp: 25 }],
    });
    expect(
      room.partySnapshots['player-1'].competitiveParty.members[0],
    ).toMatchObject({
      currentHp: 1,
      status: 'burned',
      moves: [{ moveId: 55, pp: 0 }],
    });
  });

  it('includes all five players as one match and three byes', function testCase() {
    const room = createSnapshot({
      status: 'round-started',
      participants: Array.from({ length: 5 }, function callback(_, index) {
        return createParticipant(`player-${index + 1}`, index + 1);
      }),
      round: {
        index: 1,
        phase: 'round-started',
        durationMs: 1_000,
        startedAtMs: 0,
        endsAtMs: 1_000,
      },
    });

    const advanced = advancePokeLoungeRoomClock(room, 1_000);

    expect(advanced?.tournament.bracket?.currentRound?.matches).toEqual([
      expect.objectContaining({ participantIds: ['player-4', 'player-5'] }),
    ]);
    expect(
      advanced?.tournament.bracket?.currentRound?.byes.map(
        function mapItem(bye) {
          return bye.entrant.playerId;
        },
      ),
    ).toEqual(['player-1', 'player-3', 'player-2']);
  });

  it('closes at the exact deadline when an active participant has no committed party', function testCase() {
    const room = createSnapshot({
      status: 'round-started',
      participants: [
        createParticipant('player-1', 1),
        createParticipant('player-2', 2),
      ],
      partySnapshots: createTestPartySnapshots(['player-1']),
      round: {
        index: 1,
        phase: 'round-started',
        durationMs: 1_000,
        startedAtMs: 0,
        endsAtMs: 1_000,
      },
    });

    expect(advancePokeLoungeRoomClock(room, 1_000)).toMatchObject({
      status: 'closed',
      closeReason: 'competitive-party-not-ready',
      revision: 1,
      round: { phase: 'completed', endsAtMs: null },
      tournament: {
        activeMatchId: null,
        activeMatchAuthority: null,
      },
    });
  });

  it('returns an undersized preparation round to waiting at its deadline', function testCase() {
    const room = createSnapshot({
      status: 'round-started',
      participants: [createParticipant('player-1', 1)],
      partySnapshots: createTestPartySnapshots(['player-1']),
      round: {
        index: 1,
        phase: 'round-started',
        durationMs: 1_000,
        startedAtMs: 0,
        endsAtMs: 1_000,
      },
    });

    expect(advancePokeLoungeRoomClock(room, 1_000)).toMatchObject({
      status: 'waiting',
      revision: 1,
      participants: [{ playerId: 'player-1', ready: false }],
      round: { phase: 'waiting', startedAtMs: null, endsAtMs: null },
      tournament: { bracket: null, activeMatchId: null },
    });
  });

  it('closes progressed legacy rooms with a finite restart-required expiry', function testCase() {
    const legacy = createSnapshot({ status: 'tournament' });
    (legacy as unknown as { tournament: unknown }).tournament = {
      matches: [{ status: 'completed' }],
      cumulativeScores: { 'player-1': 100 },
    };

    const normalized = normalizeLegacyPokeLoungeRoomSnapshot(legacy, 2_000);

    expect(normalized).toMatchObject({
      status: 'closed',
      closeReason: 'legacy-room-restart-required',
      revision: 1,
      expiresAtMs: 2_000 + 10 * MINUTE_MS,
      tournament: {
        version: 2,
        bracket: null,
        activeMatchId: null,
        cumulativeScores: { 'player-1': 100 },
      },
    });
  });

  it('normalizes rooms without visibility to private without resetting a current tournament contract', function testCase() {
    const legacy = createSnapshot();
    delete (legacy as Partial<PokeLoungeRoomSnapshot>).visibility;

    expect(normalizeLegacyPokeLoungeRoomSnapshot(legacy, 2_000)).toMatchObject({
      visibility: 'private',
      status: 'waiting',
      revision: 1,
      tournament: { version: 2 },
    });
  });

  it('does not advance before the round deadline or after advancement', function testCase() {
    const running = createSnapshot({
      status: 'round-started',
      round: {
        index: 1,
        phase: 'round-started',
        durationMs: 1_000,
        startedAtMs: 100,
        endsAtMs: 1_100,
      },
    });

    expect(advancePokeLoungeRoomClock(running, 1_099)).toBeNull();
    expect(
      advancePokeLoungeRoomClock(
        createSnapshot({ status: 'tournament' }),
        1_100,
      ),
    ).toBeNull();
  });

  it('waits at the elapsed round boundary until every participant is ready', function testCase() {
    const room = createSnapshot({
      status: 'round-started',
      participants: [
        createParticipant('player-1', 1),
        { ...createParticipant('player-2', 2), ready: false },
      ],
      round: {
        index: 1,
        phase: 'round-started',
        durationMs: 1_000,
        startedAtMs: 0,
        endsAtMs: 1_000,
      },
    });

    expect(advancePokeLoungeRoomClock(room, 1_000)).toBeNull();
    room.participants[1].ready = true;
    expect(advancePokeLoungeRoomClock(room, 1_000)).toMatchObject({
      status: 'tournament',
      round: { phase: 'tournament' },
    });
  });
});

function createSnapshot(
  overrides: Partial<PokeLoungeRoomSnapshot> = {},
): PokeLoungeRoomSnapshot {
  const snapshot: PokeLoungeRoomSnapshot = {
    roomCode: 'ROOM01',
    visibility: 'private',
    status: 'waiting',
    createdAtMs: 1_000,
    updatedAtMs: 1_000,
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
    expiresAtMs: 1_000 + 30 * MINUTE_MS,
    ...overrides,
  };
  if (!Object.prototype.hasOwnProperty.call(overrides, 'partySnapshots')) {
    snapshot.partySnapshots = createTestPartySnapshots(
      snapshot.participants.map(function mapItem(participant) {
        return participant.playerId;
      }),
    );
  }
  return snapshot;
}

function createParticipant(playerId: string, joinedAtMs: number) {
  return {
    sessionId: `session-${playerId}`,
    playerId,
    displayName: playerId,
    role: 'participant' as const,
    ready: true,
    connected: true,
    joinedAtMs,
  };
}

it('holds countdown for unprepared AI and restarts three seconds only after a disconnected human is truly ready again', () => {
  const humans = [createParticipant('p1', 0), createParticipant('p2', 1)];
  const room = createSnapshot({
    status: 'round-started',
    round: {
      index: 1,
      phase: 'round-started',
      durationMs: 90000,
      startedAtMs: null,
      endsAtMs: null,
    },
    participants: [
      ...humans,
      { ...createParticipant('ai', 2), controller: 'ai', ready: false },
    ],
  });
  expect(advancePokeLoungeRoomClock(room, 1000)).toBeNull();
  room.participants[2].ready = true;
  const countdown = advancePokeLoungeRoomClock(room, 2000)!;
  expect(countdown.round).toMatchObject({ startedAtMs: 5000, endsAtMs: 95000 });
  countdown.participants[1].connected = false;
  const paused = advancePokeLoungeRoomClock(countdown, 3000)!;
  expect(paused.round).toMatchObject({ startedAtMs: null, endsAtMs: null });
  expect(
    paused.participants
      .filter((p) => p.controller !== 'ai')
      .every((p) => !p.ready),
  ).toBe(true);
  paused.participants[1].connected = true;
  expect(advancePokeLoungeRoomClock(paused, 4000)).toBeNull();
  for (const p of paused.participants) p.ready = true;
  expect(advancePokeLoungeRoomClock(paused, 6000)!.round).toMatchObject({
    startedAtMs: 9000,
    endsAtMs: 99000,
  });
});

it('keeps tournament seeds in join-time/server-ID order and excludes ineligible seats', () => {
  const participants = [
    createParticipant('ai-z', 20),
    createParticipant('host-z', 1),
    { ...createParticipant('spectator', 0), role: 'spectator' as const },
    { ...createParticipant('offline', 0), connected: false },
    createParticipant('no-party', 0),
    createParticipant('ai-b', 20),
    createParticipant('ai-a', 20),
  ];
  const room = createSnapshot({
    participants,
    status: 'round-started',
    round: {
      index: 2,
      phase: 'round-started',
      durationMs: 1000,
      startedAtMs: 0,
      endsAtMs: 1000,
    },
  });
  delete room.partySnapshots['no-party'];
  const original = room.participants.map((p) => p.playerId);
  // Test seeding directly; readiness/clock transitions have separate tests.
  const tournament = createTournamentState(room);
  expect(tournament.bracket?.participants.map((p) => p.playerId)).toEqual([
    'host-z',
    'ai-a',
    'ai-b',
    'ai-z',
  ]);
  expect(tournament.bracket?.currentRound?.matches[0]?.participantIds).toEqual([
    'host-z',
    'ai-z',
  ]);
  expect(room.participants.map((p) => p.playerId)).toEqual(original);
});
