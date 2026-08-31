import {
  COMPETITIVE_RULESET_HASH,
  COMPETITIVE_RULESET_VERSION,
} from '@poke-lounge/battle/competitive-ruleset-config';
import {
  createCanonicalIdRecord,
  hashCanonicalState,
} from '@poke-lounge/battle/canonical-state';
import { createTestInitialBattleState } from '../../../test/support/competitive-party.fixture';
import type { CanonicalTerminalResult } from '@poke-lounge/battle/canonical-state';
import {
  toCompetitiveProjection,
  toCompetitiveTerminalTransition,
} from './competitive-projection';
import { CompetitiveProjectionService } from './competitive-projection.service';
import type { RedisPokeLoungeRepository } from '../redis-poke-lounge.repository';

describe('toCompetitiveProjection', function testSuite() {
  it('exposes only the recoverable approved battle state and current submissions', function testCase() {
    const state = createTestInitialBattleState(['player-a', 'player-b']);

    const projection = toCompetitiveProjection(
      {
        matchId: 'match-1',
        bracketMatchId: 'game-round-1-bracket-1-match-1',
        kind: 'tournament-unranked',
        assignmentRevision: 1,
        rulesetVersion: COMPETITIVE_RULESET_VERSION,
        rulesetHash: COMPETITIVE_RULESET_HASH,
        currentTurn: 0,
        turnStartedAtMs: 1_000,
        status: 'active',
        currentState: state,
        currentStateHash: hashCanonicalState(state),
        terminalResult: null,
      },
      ['player-b', 'player-a'],
    );

    expect(projection).toMatchObject({
      matchId: 'match-1',
      bracketMatchId: 'game-round-1-bracket-1-match-1',
      kind: 'tournament-unranked',
      assignmentRevision: 1,
      rulesetVersion: COMPETITIVE_RULESET_VERSION,
      rulesetHash: COMPETITIVE_RULESET_HASH,
      currentTurn: 0,
      turnEndsAtMs: 31_000,
      status: 'active',
      terminalEventId: null,
      terminalRoomRevision: null,
      playerIds: ['player-a', 'player-b'],
      submittedPlayerIds: ['player-a', 'player-b'],
      currentState: {
        playersById: {
          'player-a': {
            activeSlotIndex: 0,
          },
        },
      },
    });
    expect(projection.currentState.playersById['player-a'].team[0]).toEqual({
      speciesId: 7,
      slotIndex: 0,
      level: 11,
      maxHp: 34,
      currentHp: 34,
      status: 'normal',
      statStages: {
        attack: 0,
        defense: 0,
        specialAttack: 0,
        specialDefense: 0,
        speed: 0,
        accuracy: 0,
        evasion: 0,
      },
      moves: [{ moveId: 55, pp: 1 }],
    });
    const publicPokemon =
      projection.currentState.playersById['player-a'].team[0];
    expect(publicPokemon).not.toHaveProperty('attack');
    expect(publicPokemon).not.toHaveProperty('defense');
    expect(publicPokemon).not.toHaveProperty('specialAttack');
    expect(publicPokemon).not.toHaveProperty('individualValues');
    const serialized = JSON.stringify(projection);
    expect(serialized).not.toContain('account');
    expect(serialized).not.toContain('session');
    expect(serialized).not.toContain('seed');
    expect(serialized).not.toContain('history');
    expect(serialized).not.toContain('clientCommandId');
  });

  it('projects completed terminal metadata and creates an exactly matching wrapper', function testCase() {
    const terminalEventId = '00000000-0000-4000-8000-000000000050';
    const terminalRoomRevision = 50;
    const match = terminalMatch({ terminalEventId, terminalRoomRevision });

    const projection = toCompetitiveProjection(match, []);
    const transition = toCompetitiveTerminalTransition(projection);

    expect(projection).toMatchObject({
      status: 'completed',
      terminalEventId,
      terminalRoomRevision,
      terminal: {
        winnerPlayerId: 'player-a',
        loserPlayerId: 'player-b',
        reason: 'faint',
      },
    });
    expect(transition.terminalEventId).toBe(projection.terminalEventId);
    expect(transition.terminalRoomRevision).toBe(
      projection.terminalRoomRevision,
    );
    expect(transition.projection).toEqual(projection);
  });

  it('rejects incomplete metadata pairs, active metadata, and inconsistent terminal state', function testCase() {
    expect(function callback() {
      return toCompetitiveProjection(
        terminalMatch({
          terminalEventId: null,
          terminalRoomRevision: null,
        }),
        [],
      );
    }).toThrow('requires terminal metadata');

    const activeState = createTestInitialBattleState(['player-a', 'player-b']);
    expect(function callback() {
      return toCompetitiveProjection(
        {
          matchId: 'match-active',
          bracketMatchId: 'game-round-1-bracket-1-match-1',
          kind: 'tournament-unranked',
          assignmentRevision: 1,
          rulesetVersion: COMPETITIVE_RULESET_VERSION,
          rulesetHash: COMPETITIVE_RULESET_HASH,
          currentTurn: 0,
          turnStartedAtMs: 1_000,
          status: 'active',
          terminalEventId: '00000000-0000-4000-8000-000000000051',
          terminalRoomRevision: 51,
          currentState: activeState,
          currentStateHash: hashCanonicalState(activeState),
          terminalResult: null,
        },
        [],
      );
    }).toThrow('cannot carry terminal metadata');

    const inconsistent = terminalMatch({
      terminalEventId: '00000000-0000-4000-8000-000000000052',
      terminalRoomRevision: 52,
    });
    inconsistent.currentState.terminal = {
      ...inconsistent.currentState.terminal!,
      winnerPlayerId: 'player-b',
      loserPlayerId: 'player-a',
    };
    expect(function callback() {
      return toCompetitiveProjection(inconsistent, []);
    }).toThrow('terminal projection state is inconsistent');
  });
});

describe('CompetitiveProjectionService', function testSuite() {
  it('delegates the consistent room snapshot read to Redis', async function testCase() {
    const snapshot = {
      roomCode: 'ROOM01',
      revision: 12,
      expiresAtMs: 1_000,
      participants: [],
      phase: 'waiting' as const,
      tournament: null,
    };
    const findRoomSnapshot = jest.fn().mockResolvedValue(snapshot);
    const repository = {
      findRoomSnapshot,
    } as unknown as RedisPokeLoungeRepository;
    const service = new CompetitiveProjectionService(repository);

    await expect(service.findRoomSnapshot('room01', 4)).resolves.toBe(snapshot);
    expect(findRoomSnapshot).toHaveBeenCalledWith('room01', 4);
  });
});

function terminalMatch(metadata: {
  terminalEventId: string | null;
  terminalRoomRevision: number | null;
}) {
  const state = createTestInitialBattleState(['player-a', 'player-b']);
  const terminal: CanonicalTerminalResult = {
    winnerPlayerId: 'player-a',
    loserPlayerId: 'player-b',
    reason: 'faint' as const,
    scoreByPlayerId: createCanonicalIdRecord([
      ['player-a', 100],
      ['player-b', 50],
    ]),
  };
  state.terminal = terminal;

  return {
    matchId: 'match-terminal',
    bracketMatchId: 'game-round-1-bracket-1-match-1',
    kind: 'tournament-unranked' as const,
    assignmentRevision: 1,
    rulesetVersion: COMPETITIVE_RULESET_VERSION,
    rulesetHash: COMPETITIVE_RULESET_HASH,
    currentTurn: 1,
    turnStartedAtMs: 1_000,
    status: 'completed' as const,
    ...metadata,
    currentState: state,
    currentStateHash: hashCanonicalState(state),
    terminalResult: terminal,
  };
}
