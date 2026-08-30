import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  COMPETITIVE_RULESET_HASH,
  COMPETITIVE_RULESET_VERSION,
  hashCanonicalState,
} from '@poke-lounge/battle';
import {
  createTestCompetitiveParty,
  createTestInitialBattleState,
} from '../../../test/support/competitive-party.fixture';
import type { CompetitiveMatchRepository } from './competitive-match.repository';
import { createSessionCompetitiveAccountId } from './competitive-match.repository';
import type { CompetitiveActionRepository } from './competitive-action.repository';
import type { PokeLoungeRoomEventPublisher } from '../poke-lounge-room-event.publisher';
import { CompetitiveMatchService } from './competitive-match.service';
import type { CompetitiveTurnQueue } from './competitive-turn-queue';

describe('CompetitiveMatchService', () => {
  let repository: jest.Mocked<CompetitiveMatchRepository>;
  let actionRepository: jest.Mocked<CompetitiveActionRepository>;
  let publisher: jest.Mocked<PokeLoungeRoomEventPublisher>;
  let turnQueue: jest.Mocked<CompetitiveTurnQueue>;
  let service: CompetitiveMatchService;

  beforeEach(() => {
    repository = {
      bindSeatAndAssign: jest.fn(),
    };
    actionRepository = {
      submit: jest.fn(),
      findPendingTurns: jest.fn().mockResolvedValue([]),
      expirePendingTurn: jest.fn(),
    };
    publisher = { publish: jest.fn().mockResolvedValue(undefined) };
    turnQueue = { schedule: jest.fn().mockResolvedValue(undefined) };
    service = new CompetitiveMatchService(
      repository,
      actionRepository,
      publisher,
      turnQueue,
    );
  });

  it('creates a full approved assignment and returns only its public projection', async () => {
    repository.bindSeatAndAssign.mockImplementation((input) => {
      const match = input.createAssignment({
        roomId: 'room-id',
        roomCode: 'ROOM01',
        bracketMatchId: 'game-round-1-bracket-1-match-1',
        kind: 'tournament-unranked',
        assignmentRevision: 1,
        players: [
          { playerId: 'player-a', accountId: 'account-a' },
          { playerId: 'player-b', accountId: 'account-b' },
        ],
        parties: {
          'player-a': createTestCompetitiveParty(),
          'player-b': createTestCompetitiveParty(),
        },
      });

      expect(match.initialState).toEqual(
        createTestInitialBattleState(['player-a', 'player-b']),
      );
      expect(match.initialStateHash).toBe(
        hashCanonicalState(match.initialState),
      );
      expect(match.currentState).toEqual(match.initialState);
      expect(match.rulesetVersion).toBe(COMPETITIVE_RULESET_VERSION);
      expect(match.rulesetHash).toBe(COMPETITIVE_RULESET_HASH);
      expect(match.serverSeed).toMatch(/^[0-9a-f]{64}$/);
      expect(match.playerAccounts).toEqual([
        { playerId: 'player-a', accountId: 'account-a' },
        { playerId: 'player-b', accountId: 'account-b' },
      ]);

      return Promise.resolve({
        outcome: 'assigned',
        assignment: match,
        eligible: true,
      });
    });

    const result = await service.bindSeat('room01', ' session-a ', 'account-a');

    expect(typeof result?.matchId).toBe('string');
    expect(result).toMatchObject({
      assignmentRevision: 1,
      rulesetVersion: COMPETITIVE_RULESET_VERSION,
      rulesetHash: COMPETITIVE_RULESET_HASH,
      currentTurn: 0,
      status: 'pending',
      playerIds: ['player-a', 'player-b'],
      submittedPlayerIds: [],
      currentState: {
        turn: 0,
        participantIds: ['player-a', 'player-b'],
      },
    });
    expect(JSON.stringify(result)).not.toContain('account-a');
    expect(JSON.stringify(result)).not.toContain('session-a');
    expect(JSON.stringify(result)).not.toContain('serverSeed');
    expect(JSON.stringify(result)).not.toContain('clientCommandId');
    expect(repository.bindSeatAndAssign.mock.calls[0]?.[0]).toMatchObject({
      roomCode: 'ROOM01',
      sessionId: 'session-a',
      accountId: 'account-a',
    });
  });

  it('publishes the durable assignment projection after the second seat commits', async () => {
    const state = createTestInitialBattleState(['player-a', 'player-b']);
    repository.bindSeatAndAssign.mockResolvedValue({
      outcome: 'assigned',
      eligible: true,
      committed: true,
      room: roomSnapshot(),
      projection: {
        ...actionProjection(),
        status: 'pending',
        submittedPlayerIds: [],
      },
      assignment: {
        roomId: 'room-id',
        roomCode: 'ROOM01',
        matchId: 'match-1',
        assignmentRevision: 1,
        playerAccounts: [
          { playerId: 'player-a', accountId: 'account-a' },
          { playerId: 'player-b', accountId: 'account-b' },
        ],
        rulesetVersion: COMPETITIVE_RULESET_VERSION,
        rulesetHash: COMPETITIVE_RULESET_HASH,
        serverSeed: 'secret-seed',
        initialState: state,
        initialStateHash: hashCanonicalState(state),
        currentState: state,
        currentStateHash: hashCanonicalState(state),
        currentTurn: 0,
        turnStartedAtMs: 0,
        status: 'pending',
        terminalResult: null,
        completedAt: null,
      },
    } as never);

    await service.bindSeat('ROOM01', 'session-b', 'account-b');

    expect(publisher.publish.mock.calls).toHaveLength(1);
    expect(publisher.publish.mock.calls[0]?.[0]).toMatchObject({
      type: 'competitive-assignment-committed',
      snapshot: {
        competitive: {
          matchId: 'match-1',
          currentState: state,
          submittedPlayerIds: [],
        },
      },
    });
    const serialized = JSON.stringify(publisher.publish.mock.calls);
    expect(serialized).not.toContain('account-a');
    expect(serialized).not.toContain('session-b');
    expect(serialized).not.toContain('secret-seed');
  });

  it.each([
    ['room-not-found', BadRequestException],
    ['seat-not-found', BadRequestException],
    ['inactive-seat', BadRequestException],
    ['seat-account-conflict', ConflictException],
    ['duplicate-account', ConflictException],
  ] as const)('rejects repository outcome %s', async (outcome, errorType) => {
    repository.bindSeatAndAssign.mockResolvedValue({ outcome });

    await expect(
      service.bindSeat('ROOM01', 'session-a', 'account-a'),
    ).rejects.toBeInstanceOf(errorType);
  });

  it('returns null while anonymous or extra active participants keep the room casual', async () => {
    repository.bindSeatAndAssign.mockResolvedValue({
      outcome: 'bound-casual',
      assignment: null,
      eligible: false,
    });

    await expect(
      service.bindSeat('ROOM01', 'session-a', 'account-a'),
    ).resolves.toBeNull();
  });

  it('returns an eligible false conflict without exposing an existing assignment to a third participant', async () => {
    repository.bindSeatAndAssign.mockResolvedValue({
      outcome: 'bound-ineligible',
      assignment: null,
      eligible: false,
    });

    try {
      await service.bindSeat('ROOM01', 'session-c', 'account-c');
      throw new Error('Expected third participant binding to conflict');
    } catch (error) {
      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toEqual({
        statusCode: 409,
        code: 'POKE_LOUNGE_COMPETITIVE_ASSIGNMENT_INELIGIBLE',
        message: 'Account is not eligible for this competitive assignment',
        eligible: false,
      });
    }
  });

  it('publishes a sanitized competitive projection only after a committed action', async () => {
    const response = actionProjection();
    const order: string[] = [];
    actionRepository.submit.mockImplementation(() => {
      order.push('transaction-committed');
      return Promise.resolve({
        outcome: 'accepted',
        response,
        room: roomSnapshot(),
        committed: true,
      });
    });
    publisher.publish.mockImplementation(() => {
      order.push('event-published');
      return Promise.resolve();
    });

    await expect(
      service.submitAction({
        roomCode: 'room01',
        matchId: 'match-1',
        accountId: 'account-a',
        assignmentRevision: 1,
        turn: 0,
        clientCommandId: '00000000-0000-4000-8000-000000000001',
        action: { kind: 'move', moveId: 55 },
      }),
    ).resolves.toEqual(response);

    expect(publisher.publish.mock.calls[0]?.[0]).toMatchObject({
      type: 'competitive-action-committed',
      snapshot: {
        roomCode: 'ROOM01',
        competitive: response,
      },
    });
    expect(actionRepository.submit.mock.calls[0]?.[0]).toMatchObject({
      roomCode: 'ROOM01',
    });
    expect(JSON.stringify(publisher.publish.mock.calls)).not.toContain(
      'account-a',
    );
    expect(JSON.stringify(publisher.publish.mock.calls)).not.toContain('seed');
    expect(JSON.stringify(publisher.publish.mock.calls)).not.toContain(
      'clientCommandId',
    );
    expect(order).toEqual(['transaction-committed', 'event-published']);
  });

  it('maps a private room session to its server assignment actor', async () => {
    const response = actionProjection();
    actionRepository.submit.mockResolvedValue({
      outcome: 'accepted',
      response,
      room: roomSnapshot(),
      committed: false,
    });

    await service.submitSessionAction({
      roomCode: 'room01',
      matchId: 'match-1',
      sessionId: ' session-a ',
      assignmentRevision: 1,
      turn: 0,
      clientCommandId: '00000000-0000-4000-8000-000000000001',
      action: { kind: 'move', moveId: 55 },
    });

    expect(actionRepository.submit.mock.calls[0]?.[0]).toMatchObject({
      roomCode: 'ROOM01',
      accountId: createSessionCompetitiveAccountId('ROOM01', 'session-a'),
    });
  });

  it('queues the canonical committed turn deadline without changing it on replay', async () => {
    const next = {
      ...actionProjection(),
      currentTurn: 1,
      turnEndsAtMs: 61_000,
    };
    actionRepository.submit.mockResolvedValue({
      outcome: 'accepted',
      response: actionProjection(),
      room: { ...roomSnapshot(), competitive: next },
      committed: true,
    });
    await service.submitAction(actionInput());
    actionRepository.submit.mockResolvedValue({
      outcome: 'replayed',
      response: actionProjection(),
      room: roomSnapshot(),
      committed: false,
    });
    await service.submitAction(actionInput());

    expect(turnQueue.schedule.mock.calls).toEqual([
      [
        {
          roomCode: 'ROOM01',
          matchId: 'match-1',
          turn: 1,
          deadlineMs: 61_000,
        },
      ],
    ]);
  });

  it('publishes one composite snapshot with the completed old match before the next tournament assignment', async () => {
    const terminalEventId = '00000000-0000-4000-8000-000000000050';
    const terminalRoomRevision = 50;
    const completed = {
      ...actionProjection('match-1', 'game-round-1-bracket-1-match-1'),
      status: 'completed' as const,
      terminalEventId,
      terminalRoomRevision,
      terminal: {
        winnerPlayerId: 'player-a',
        loserPlayerId: 'player-b',
        reason: 'faint' as const,
        scoreByPlayerId: { 'player-a': 100, 'player-b': 50 },
      },
    };
    const next = actionProjection('match-2', 'game-round-1-bracket-2-match-1');
    actionRepository.submit.mockResolvedValue({
      outcome: 'accepted',
      response: completed,
      room: {
        ...roomSnapshot(),
        status: 'tournament',
        round: {
          ...roomSnapshot().round,
          phase: 'tournament',
        },
        tournament: {
          ...roomSnapshot().tournament,
          activeMatchId: next.bracketMatchId,
          activeMatchAuthority: 'server',
        },
        revision: terminalRoomRevision,
        competitiveTransitions: [
          {
            terminalEventId,
            terminalRoomRevision,
            projection: completed,
          },
        ],
        competitive: next,
      },
      committed: true,
    } as never);

    await expect(service.submitAction(actionInput())).resolves.toEqual(
      completed,
    );
    expect(publisher.publish.mock.calls).toHaveLength(1);
    expect(publisher.publish.mock.calls[0]?.[0]).toMatchObject({
      type: 'competitive-action-committed',
      snapshot: {
        revision: terminalRoomRevision,
        tournament: { activeMatchId: next.bracketMatchId },
        competitiveTransitions: [
          {
            terminalEventId,
            terminalRoomRevision,
            projection: {
              matchId: completed.matchId,
              status: 'completed',
              terminalEventId,
              terminalRoomRevision,
              terminal: {
                winnerPlayerId: 'player-a',
                loserPlayerId: 'player-b',
                reason: 'faint',
                scoreByPlayerId: { 'player-a': 100, 'player-b': 50 },
              },
            },
          },
        ],
        competitive: next,
      },
    });
    expect(turnQueue.schedule.mock.calls).toContainEqual([
      {
        roomCode: 'ROOM01',
        matchId: 'match-2',
        turn: 0,
        deadlineMs: 30_000,
      },
    ]);
  });

  it('does not publish replayed receipts or failed transactions', async () => {
    actionRepository.submit.mockResolvedValueOnce({
      outcome: 'replayed',
      response: actionProjection(),
      room: roomSnapshot(),
      committed: false,
    });
    await service.submitAction(actionInput());
    expect(publisher.publish.mock.calls).toHaveLength(0);

    actionRepository.submit.mockRejectedValueOnce(new Error('rollback'));
    await expect(service.submitAction(actionInput())).rejects.toThrow(
      'rollback',
    );
    expect(publisher.publish.mock.calls).toHaveLength(0);
  });

  it.each([
    'actor-not-assigned',
    'ruleset-mismatch',
    'assignment-revision-conflict',
    'turn-conflict',
    'command-conflict',
    'actor-turn-conflict',
    'terminal',
    'illegal-action',
  ] as const)('rejects competitive action outcome %s', async (outcome) => {
    actionRepository.submit.mockResolvedValue({ outcome });

    await expect(service.submitAction(actionInput())).rejects.toBeInstanceOf(
      outcome === 'illegal-action' ? BadRequestException : ConflictException,
    );
    expect(publisher.publish.mock.calls).toHaveLength(0);
  });
});

function actionInput() {
  return {
    roomCode: 'ROOM01',
    matchId: 'match-1',
    accountId: 'account-a',
    assignmentRevision: 1,
    turn: 0,
    clientCommandId: '00000000-0000-4000-8000-000000000001',
    action: { kind: 'move' as const, moveId: 55 },
  };
}

function actionProjection(
  matchId = 'match-1',
  bracketMatchId = 'game-round-1-bracket-1-match-1',
) {
  const currentState = createTestInitialBattleState(['player-a', 'player-b']);
  return {
    matchId,
    bracketMatchId,
    kind: 'tournament-unranked' as const,
    assignmentRevision: 1,
    rulesetVersion: COMPETITIVE_RULESET_VERSION,
    rulesetHash: COMPETITIVE_RULESET_HASH,
    currentTurn: 0,
    turnEndsAtMs: 30_000,
    status: 'active' as const,
    terminalEventId: null,
    terminalRoomRevision: null,
    playerIds: ['player-a', 'player-b'] as [string, string],
    currentState,
    stateHash: 'a'.repeat(64),
    submittedPlayerIds: ['player-a'],
    terminal: null,
  };
}

function roomSnapshot() {
  return {
    roomCode: 'ROOM01',
    status: 'waiting' as const,
    createdAtMs: 0,
    updatedAtMs: 0,
    participants: [],
    partySnapshots: {},
    round: {
      index: 1,
      phase: 'waiting' as const,
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
    revision: 1,
    expiresAtMs: 60_000,
  };
}
