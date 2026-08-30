import type { PokeLoungeRoomSnapshot } from './poke-lounge-room.repository';
import { createTournamentBracketState } from '@poke-lounge/battle';
import {
  POKE_LOUNGE_ACTIVE_ROOM_LEASE_MS,
  POKE_LOUNGE_PENDING_PRESENCE_LEASE_MS,
  advancePokeLoungeRoomClock,
  completePokeLoungeTournamentMatch,
  expirePendingPokeLoungePresence,
  getPokeLoungeRoomHostPlayerId,
  getPokeLoungeRoomExpiresAtMs,
  isPokeLoungeRoomExpired,
  normalizeLegacyPokeLoungeRoomSnapshot,
} from './poke-lounge-room-policy';
import { createTestPartySnapshots } from '../../test/support/competitive-party.fixture';

const MINUTE_MS = 60_000;

describe('PokeLoungeRoomPolicy', () => {
  it('selects the current host by join time and then player id', () => {
    const room = createSnapshot({
      participants: [
        createParticipant('player-c', 2),
        createParticipant('player-b', 1),
        createParticipant('player-a', 1),
      ],
    });

    expect(getPokeLoungeRoomHostPlayerId(room)).toBe('player-a');
    room.participants = room.participants.filter(
      (participant) => participant.playerId !== 'player-a',
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
    (status, retentionMs) => {
      const room = createSnapshot({ status, updatedAtMs: 1_000 });

      expect(getPokeLoungeRoomExpiresAtMs(room)).toBe(1_000 + retentionMs);
    },
  );

  it.each(['round-started', 'tournament'] as const)(
    'expires inactive %s rooms after the active lease',
    (status) => {
      expect(
        getPokeLoungeRoomExpiresAtMs(
          createSnapshot({ status, updatedAtMs: 1_000 }),
        ),
      ).toBe(1_000 + POKE_LOUNGE_ACTIVE_ROOM_LEASE_MS);
    },
  );

  it('keeps the active lease longer than the maximum preparation round', () => {
    expect(POKE_LOUNGE_ACTIVE_ROOM_LEASE_MS).toBeGreaterThan(60 * MINUTE_MS);
  });

  it('expires a waiting room with only pending presence at the earliest lease', () => {
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

    expect(getPokeLoungeRoomExpiresAtMs(room)).toBe(16_000);
    expect(
      getPokeLoungeRoomExpiresAtMs({
        ...room,
        participants: [
          ...room.participants,
          createParticipant('player-3', 1_002),
        ],
      }),
    ).toBe(1_000 + 30 * MINUTE_MS);
  });

  it('uses a strict expiry boundary', () => {
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

  it('removes an unacknowledged ready participant when its pending lease expires', () => {
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
        status: 'closed',
        revision: 1,
        participants: [],
        round: { phase: 'completed' },
      },
    );
  });

  it('keeps an unacknowledged round resume reclaimable after its pending lease expires', () => {
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

  it('turns an expired tournament rejoin lease offline and converges its casual match', () => {
    const pendingUntilMs = 2_000;
    const participants = [
      {
        ...createParticipant('player-1', 1),
        presencePendingUntilMs: pendingUntilMs,
      },
      createParticipant('player-2', 2),
    ];
    const bracket = createTournamentBracketState(
      participants.map(({ playerId, displayName }) => ({
        playerId,
        displayName,
      })),
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
          cumulativeScores: { 'player-1': 100, 'player-2': 100 },
        },
        round: { index: 2, phase: 'waiting' },
      },
    );
  });

  it('completes three game rounds and ranks the champion by cumulative HP ratio', () => {
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
        scores: { 'player-1': 150, 'player-2': 50 },
      },
      {
        winnerPlayerId: 'player-2',
        scores: { 'player-1': 100, 'player-2': 200 },
      },
      {
        winnerPlayerId: 'player-1',
        scores: { 'player-1': 75.5, 'player-2': 25 },
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
        round.scores,
      );

      if (index < 2) {
        expect(room).toMatchObject({
          status: 'round-started',
          participants: [
            { playerId: 'player-1', ready: false },
            { playerId: 'player-2', ready: false },
          ],
          round: { index: index + 2, phase: 'round-started' },
          tournament: { bracket: null, roundScores: {} },
        });
      }
    }

    expect(room).toMatchObject({
      status: 'completed',
      round: { index: 3, phase: 'completed', endsAtMs: null },
      tournament: {
        activeMatchId: null,
        roundScores: {},
        cumulativeScores: { 'player-1': 325.5, 'player-2': 275 },
      },
      finalStandings: [
        { playerId: 'player-1', rank: 1, score: 325.5 },
        { playerId: 'player-2', rank: 2, score: 275 },
      ],
    });
  });

  it('applies round ranking scores in the same transition that ends the round', () => {
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
      { 'player-1': 75, 'player-2': 25 },
    );

    expect(tournament).toMatchObject({
      status: 'round-started',
      round: { index: 2, phase: 'round-started' },
      tournament: {
        cumulativeScores: { 'player-1': 75, 'player-2': 25 },
      },
    });
  });

  it('advances an elapsed round once with deterministic tournament matches', () => {
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

  it('restores every participant party when the round enters tournament', () => {
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
      members: damaged.members.map((member) => ({
        ...member,
        currentHp: 1,
        status: 'burned' as const,
        moves: member.moves.map((move) => ({ ...move, pp: 0 })),
      })),
    };

    const advanced = advancePokeLoungeRoomClock(room, 1_000);
    const restored =
      advanced?.partySnapshots['player-1'].competitiveParty.members[0];

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

  it('includes all five players as one match and three byes', () => {
    const room = createSnapshot({
      status: 'round-started',
      participants: Array.from({ length: 5 }, (_, index) =>
        createParticipant(`player-${index + 1}`, index + 1),
      ),
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
        (bye) => bye.entrant.playerId,
      ),
    ).toEqual(['player-1', 'player-3', 'player-2']);
  });

  it('closes at the exact deadline when an active participant has no committed party', () => {
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

  it('returns an undersized preparation round to waiting at its deadline', () => {
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

  it('closes progressed legacy rooms with a finite restart-required expiry', () => {
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

  it('does not advance before the round deadline or after advancement', () => {
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

  it('waits at the elapsed round boundary until every participant is ready', () => {
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
      snapshot.participants.map((participant) => participant.playerId),
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
