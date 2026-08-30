import { QueryFailedError, type DataSource, type EntityManager } from 'typeorm';
import {
  createTournamentBracketState,
  hashCanonicalState,
} from '@poke-lounge/battle';
import { PokeLoungeCompetitiveMatch } from './entities/poke-lounge-competitive-match.entity';
import { PokeLoungeCompetitiveSeat } from './entities/poke-lounge-competitive-seat.entity';
import { PokeLoungeCompetitiveAction } from './competitive/competitive-action.entity';
import { PokeLoungeRoomCommand } from './entities/poke-lounge-room-command.entity';
import { PokeLoungeRoom } from './entities/poke-lounge-room.entity';
import {
  PostgresPokeLoungeRoomRepository,
  completeServerAuthorityParticipantLeave,
  ensureActiveTournamentAssignment,
} from './postgres-poke-lounge-room.repository';
import { createCompetitiveAssignment } from './competitive/competitive-match.service';
import type {
  PokeLoungeRepositoryResult,
  PokeLoungeRoomSnapshot,
} from './poke-lounge-room.repository';
import { createTestPartySnapshots } from '../../test/support/competitive-party.fixture';

const ACTOR_KEY_CONSTRAINT = 'UQ_poke_lounge_room_command_actor_key';
const ROOM_ACTOR_KEY_CONSTRAINT = 'UQ_poke_lounge_room_command_room_actor_key';
const IDEMPOTENCY_KEY = '11111111-1111-4111-8111-111111111111';
type CreateInput = Parameters<PostgresPokeLoungeRoomRepository['create']>[0];

describe('PostgresPokeLoungeRoomRepository locking', () => {
  it('persists a closed room reason in the stored state', async () => {
    const savedStates: PokeLoungeRoom['state'][] = [];
    const roomRepository = {
      count: jest.fn().mockResolvedValue(0),
      createQueryBuilder: jest
        .fn()
        .mockReturnValue(new FakeDeleteQueryBuilder()),
      create: jest.fn((value: PokeLoungeRoom) => value),
      save: jest.fn((value: PokeLoungeRoom) => {
        savedStates.push(value.state);
        return Promise.resolve({
          ...value,
          id: '00000000-0000-4000-8000-000000000001',
        });
      }),
    };
    const commandRepository = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((value: PokeLoungeRoomCommand) => value),
      save: jest.fn().mockResolvedValue(undefined),
    };
    const manager = {
      query: jest.fn().mockResolvedValue([]),
      getRepository: jest.fn((entity: unknown) => {
        if (entity === PokeLoungeRoom) {
          return roomRepository;
        }
        if (entity === PokeLoungeRoomCommand) {
          return commandRepository;
        }
        throw new Error('Unexpected repository requested');
      }),
    } as unknown as EntityManager;
    const repository = new PostgresPokeLoungeRoomRepository(
      managerDataSource(manager),
    );
    const room = snapshot();
    room.status = 'closed';
    room.closeReason = 'legacy-room-restart-required';

    await repository.create(createInput({ room }));

    expect(savedStates).toEqual([
      expect.objectContaining({
        status: 'closed',
        closeReason: 'legacy-room-restart-required',
      }),
    ]);
  });

  it('acquires the same actor/key lock before creation and room locks', async () => {
    const createEvents: string[] = [];
    const createCommandLockParameters: unknown[][] = [];
    const createManager = createReplayManager(
      createEvents,
      createCommandLockParameters,
    );
    const createRepository = new PostgresPokeLoungeRoomRepository(
      managerDataSource(createManager),
    );
    const mutateEvents: string[] = [];
    const mutateCommandLockParameters: unknown[][] = [];
    const mutateManager = createMissingRoomManager(
      mutateEvents,
      mutateCommandLockParameters,
    );
    const mutateRepository = new PostgresPokeLoungeRoomRepository(
      managerDataSource(mutateManager),
    );

    await createRepository.create(createInput());
    await mutateRepository.mutate(mutateInput());

    expect(createEvents.slice(0, 2)).toEqual(['command-lock', 'creation-lock']);
    expect(mutateEvents.slice(0, 3)).toEqual([
      'command-lock',
      'purge',
      'room-lock',
    ]);
    expect(createCommandLockParameters[0]).toEqual(
      mutateCommandLockParameters[0],
    );
    expect(createCommandLockParameters[0]).toHaveLength(2);
    expect(
      createCommandLockParameters[0].every((value) => Number.isInteger(value)),
    ).toBe(true);
  });

  it('derives the command lock from both actor and idempotency key', async () => {
    const base = await captureCreateCommandLock(createInput());
    const changedActor = await captureCreateCommandLock(
      createInput({ actorPlayerId: 'player-b' }),
    );
    const changedKey = await captureCreateCommandLock(
      createInput({
        idempotencyKey: '22222222-2222-4222-8222-222222222222',
      }),
    );

    expect(changedActor).not.toEqual(base);
    expect(changedKey).not.toEqual(base);
  });

  it.each([ACTOR_KEY_CONSTRAINT, ROOM_ACTOR_KEY_CONSTRAINT])(
    're-reads a creation receipt after residual %s conflicts',
    async (constraint) => {
      const replayed = repositoryResult('replayed');
      const { dataSource, transaction } = scriptedDataSource([
        uniqueViolation(constraint),
        replayed,
      ]);
      const repository = new PostgresPokeLoungeRoomRepository(dataSource);

      await expect(repository.create(createInput())).resolves.toEqual(replayed);
      expect(transaction).toHaveBeenCalledTimes(2);
    },
  );

  it('re-reads a mutation receipt after a residual global actor/key conflict', async () => {
    const conflict = repositoryResult('idempotency-conflict');
    const { dataSource, transaction } = scriptedDataSource([
      uniqueViolation(ACTOR_KEY_CONSTRAINT),
      conflict,
    ]);
    const repository = new PostgresPokeLoungeRoomRepository(dataSource);

    await expect(repository.mutate(mutateInput())).resolves.toEqual(conflict);
    expect(transaction).toHaveBeenCalledTimes(2);
  });

  it('replays a stored leave room-command receipt without running terminal finalization again', async () => {
    const terminalSnapshot = fivePlayerTournamentSnapshot();
    terminalSnapshot.revision = 51;
    const { manager, commandSave, requestedEntities } =
      createLeaveReceiptReplayManager(terminalSnapshot);
    const repository = new PostgresPokeLoungeRoomRepository(
      managerDataSource(manager),
    );

    await expect(
      repository.mutate({
        ...mutateInput(),
        operation: 'leave',
        actorPlayerId: 'player-5',
        expectedRevision: 50,
      }),
    ).resolves.toEqual({
      snapshot: terminalSnapshot,
      outcome: 'replayed',
      committedChange: false,
    });
    expect(commandSave).not.toHaveBeenCalled();
    expect(requestedEntities).not.toContain(PokeLoungeCompetitiveMatch);
    expect(requestedEntities).not.toContain(PokeLoungeCompetitiveAction);
  });
});

describe('ensureActiveTournamentAssignment', () => {
  it('creates a tournament-unranked UUID assignment for the active five-player pair', async () => {
    const bracket = createTournamentBracketState(
      Array.from({ length: 5 }, (_, index) => ({
        playerId: `player-${index + 1}`,
        displayName: `Player ${index + 1}`,
      })),
      1,
    );
    const activeMatchId = bracket.currentRound!.matches[0].matchId;
    const roomSnapshot = snapshot();
    roomSnapshot.status = 'tournament';
    roomSnapshot.tournament = {
      version: 2,
      bracket,
      activeMatchId,
      activeMatchAuthority: 'casual',
      cumulativeScores: {},
    };
    const matchSave = jest.fn((value: PokeLoungeCompetitiveMatch) => value);
    const matchRepository = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((value: PokeLoungeCompetitiveMatch) => value),
      save: matchSave,
      delete: jest.fn(),
    };
    const seatRepository = {
      find: jest.fn().mockResolvedValue(
        Array.from({ length: 5 }, (_, index) => ({
          playerId: `player-${index + 1}`,
          accountId: `account-${index + 1}`,
        })),
      ),
    };
    const manager = {
      getRepository: jest.fn((entity) =>
        entity === PokeLoungeCompetitiveMatch
          ? matchRepository
          : entity === PokeLoungeCompetitiveSeat
            ? seatRepository
            : null,
      ),
    } as unknown as EntityManager;

    await ensureActiveTournamentAssignment(
      manager,
      {
        id: '00000000-0000-4000-8000-000000000001',
        roomCode: 'ROOM01',
      } as PokeLoungeRoom,
      roomSnapshot,
    );

    expect(roomSnapshot.tournament.activeMatchAuthority).toBe('server');
    expect(matchSave).toHaveBeenCalledTimes(1);
    const savedMatch = matchSave.mock.calls[0]?.[0];
    expect(savedMatch?.matchId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(savedMatch).toMatchObject({
      bracketMatchId: activeMatchId,
      kind: 'tournament-unranked',
      playerAccounts: [
        { playerId: 'player-4', accountId: 'account-4' },
        { playerId: 'player-5', accountId: 'account-5' },
      ],
    });
  });

  it('creates an unranked assignment after a two-player dynamic-party bracket activates', async () => {
    const bracket = createTournamentBracketState(
      [
        { playerId: 'player-1', displayName: 'Player 1' },
        { playerId: 'player-2', displayName: 'Player 2' },
      ],
      1,
    );
    const roomSnapshot = snapshot();
    roomSnapshot.status = 'tournament';
    roomSnapshot.round.phase = 'tournament';
    roomSnapshot.tournament = {
      version: 2,
      bracket,
      activeMatchId: bracket.currentRound!.matches[0].matchId,
      activeMatchAuthority: 'casual',
      cumulativeScores: {},
    };
    const matchSave = jest.fn((value: PokeLoungeCompetitiveMatch) => value);
    const manager = {
      getRepository: jest.fn((entity) => {
        if (entity === PokeLoungeCompetitiveSeat) {
          return {
            find: jest.fn().mockResolvedValue([
              { playerId: 'player-1', accountId: 'account-1' },
              { playerId: 'player-2', accountId: 'account-2' },
            ]),
          };
        }
        if (entity === PokeLoungeCompetitiveMatch) {
          return {
            findOne: jest.fn().mockResolvedValue(null),
            create: jest.fn((value: PokeLoungeCompetitiveMatch) => value),
            save: matchSave,
            delete: jest.fn(),
          };
        }
        throw new Error('Unexpected repository');
      }),
    } as unknown as EntityManager;

    await ensureActiveTournamentAssignment(
      manager,
      {
        id: '00000000-0000-4000-8000-000000000001',
        roomCode: 'ROOM01',
      } as PokeLoungeRoom,
      roomSnapshot,
    );

    expect(matchSave).toHaveBeenCalledTimes(1);
    expect(matchSave.mock.calls[0]?.[0]).toMatchObject({
      kind: 'tournament-unranked',
      playerAccounts: [
        { playerId: 'player-1', accountId: 'account-1' },
        { playerId: 'player-2', accountId: 'account-2' },
      ],
    });
  });

  it('creates a server assignment from private participant sessions without login seats', async () => {
    const bracket = createTournamentBracketState(
      [
        { playerId: 'player-1', displayName: 'Player 1' },
        { playerId: 'player-2', displayName: 'Player 2' },
      ],
      1,
    );
    const roomSnapshot = snapshot();
    roomSnapshot.status = 'tournament';
    roomSnapshot.round.phase = 'tournament';
    roomSnapshot.participants = [
      {
        sessionId: 'session-1',
        playerId: 'player-1',
        displayName: 'Player 1',
        role: 'participant',
        ready: true,
        connected: true,
        joinedAtMs: 1,
      },
      {
        sessionId: 'session-2',
        playerId: 'player-2',
        displayName: 'Player 2',
        role: 'participant',
        ready: true,
        connected: true,
        joinedAtMs: 2,
      },
    ];
    roomSnapshot.tournament = {
      version: 2,
      bracket,
      activeMatchId: bracket.currentRound!.matches[0].matchId,
      activeMatchAuthority: 'casual',
      cumulativeScores: {},
    };
    const matchSave = jest.fn((value: PokeLoungeCompetitiveMatch) => value);
    const manager = {
      getRepository: jest.fn((entity) => {
        if (entity === PokeLoungeCompetitiveSeat) {
          return { find: jest.fn().mockResolvedValue([]) };
        }
        if (entity === PokeLoungeCompetitiveMatch) {
          return {
            findOne: jest.fn().mockResolvedValue(null),
            create: jest.fn((value: PokeLoungeCompetitiveMatch) => value),
            save: matchSave,
            delete: jest.fn(),
          };
        }
        throw new Error('Unexpected repository');
      }),
    } as unknown as EntityManager;

    await ensureActiveTournamentAssignment(
      manager,
      {
        id: '00000000-0000-4000-8000-000000000001',
        roomCode: 'ROOM01',
      } as PokeLoungeRoom,
      roomSnapshot,
    );

    expect(roomSnapshot.tournament.activeMatchAuthority).toBe('server');
    const accounts = matchSave.mock.calls[0]?.[0].playerAccounts;
    expect(accounts?.map(({ accountId }) => accountId)).toEqual([
      expect.stringMatching(/^session:[0-9a-f]{64}$/),
      expect.stringMatching(/^session:[0-9a-f]{64}$/),
    ]);
    expect(accounts?.[0].accountId).not.toBe(accounts?.[1].accountId);
  });

  it('replaces a stale pre-bracket ranked assignment before activating five players', async () => {
    const bracket = createTournamentBracketState(
      Array.from({ length: 5 }, (_, index) => ({
        playerId: `player-${index + 1}`,
        displayName: `Player ${index + 1}`,
      })),
      1,
    );
    const activeMatchId = bracket.currentRound!.matches[0].matchId;
    const roomSnapshot = snapshot();
    roomSnapshot.status = 'tournament';
    roomSnapshot.round.phase = 'tournament';
    roomSnapshot.tournament = {
      version: 2,
      bracket,
      activeMatchId,
      activeMatchAuthority: 'casual',
      cumulativeScores: {},
    };
    const matchDelete = jest.fn().mockResolvedValue({ affected: 1 });
    const matchSave = jest.fn((value: PokeLoungeCompetitiveMatch) => value);
    const manager = {
      getRepository: jest.fn((entity) => {
        if (entity === PokeLoungeCompetitiveSeat) {
          return {
            find: jest.fn().mockResolvedValue(
              Array.from({ length: 5 }, (_, index) => ({
                playerId: `player-${index + 1}`,
                accountId: `account-${index + 1}`,
              })),
            ),
          };
        }
        if (entity === PokeLoungeCompetitiveMatch) {
          return {
            findOne: jest.fn().mockResolvedValue({
              matchId: '00000000-0000-4000-8000-000000000002',
              bracketMatchId: activeMatchId,
              kind: 'ranked-head-to-head',
              playerAccounts: [
                { playerId: 'player-1', accountId: 'account-1' },
                { playerId: 'player-2', accountId: 'account-2' },
              ],
              status: 'pending',
              terminalResult: null,
              completedAt: null,
            }),
            create: jest.fn((value: PokeLoungeCompetitiveMatch) => value),
            save: matchSave,
            delete: matchDelete,
          };
        }
        throw new Error('Unexpected repository');
      }),
    } as unknown as EntityManager;

    await ensureActiveTournamentAssignment(
      manager,
      {
        id: '00000000-0000-4000-8000-000000000001',
        roomCode: 'ROOM01',
      } as PokeLoungeRoom,
      roomSnapshot,
    );

    expect(matchDelete).toHaveBeenCalledWith({
      matchId: '00000000-0000-4000-8000-000000000002',
    });
    expect(matchSave.mock.calls[0]?.[0]).toMatchObject({
      bracketMatchId: activeMatchId,
      kind: 'tournament-unranked',
      playerAccounts: [
        { playerId: 'player-4', accountId: 'account-4' },
        { playerId: 'player-5', accountId: 'account-5' },
      ],
    });
  });

  it('rejects a completed legacy ranked result in a V2 dynamic-party bracket', async () => {
    const bracket = createTournamentBracketState(
      [
        { playerId: 'player-1', displayName: 'Player 1' },
        { playerId: 'player-2', displayName: 'Player 2' },
      ],
      1,
    );
    const activeMatchId = bracket.currentRound!.matches[0].matchId;
    const roomSnapshot = snapshot();
    roomSnapshot.status = 'tournament';
    roomSnapshot.round.phase = 'tournament';
    roomSnapshot.tournament = {
      version: 2,
      bracket,
      activeMatchId,
      activeMatchAuthority: 'casual',
      cumulativeScores: {},
    };
    const manager = {
      getRepository: jest.fn((entity) => {
        if (entity === PokeLoungeCompetitiveSeat) {
          return {
            find: jest.fn().mockResolvedValue([
              { playerId: 'player-1', accountId: 'account-1' },
              { playerId: 'player-2', accountId: 'account-2' },
            ]),
          };
        }
        if (entity === PokeLoungeCompetitiveMatch) {
          return {
            findOne: jest
              .fn()
              .mockResolvedValueOnce(null)
              .mockResolvedValue({
                matchId: '00000000-0000-4000-8000-000000000002',
                bracketMatchId: activeMatchId,
                kind: 'ranked-head-to-head',
                playerAccounts: [
                  { playerId: 'player-1', accountId: 'account-1' },
                  { playerId: 'player-2', accountId: 'account-2' },
                ],
                status: 'completed',
                completedAt: new Date(2_000),
                terminalResult: {
                  winnerPlayerId: 'player-1',
                  loserPlayerId: 'player-2',
                  reason: 'faint',
                },
              }),
          };
        }
        throw new Error('Unexpected repository');
      }),
    } as unknown as EntityManager;

    await expect(
      ensureActiveTournamentAssignment(
        manager,
        {
          id: '00000000-0000-4000-8000-000000000001',
          roomCode: 'ROOM01',
        } as PokeLoungeRoom,
        roomSnapshot,
      ),
    ).rejects.toThrow(
      'Completed competitive match does not match the activated bracket',
    );
  });

  it('deletes a stale active row before creating the canonical active assignment', async () => {
    const bracket = createTournamentBracketState(
      Array.from({ length: 5 }, (_, index) => ({
        playerId: `player-${index + 1}`,
        displayName: `Player ${index + 1}`,
      })),
      1,
    );
    const activeMatchId = bracket.currentRound!.matches[0].matchId;
    const roomSnapshot = snapshot();
    roomSnapshot.status = 'tournament';
    roomSnapshot.tournament = {
      version: 2,
      bracket,
      activeMatchId,
      activeMatchAuthority: 'server',
      cumulativeScores: {},
    };
    const matchDelete = jest.fn().mockResolvedValue({ affected: 1 });
    const matchSave = jest.fn((value: PokeLoungeCompetitiveMatch) => value);
    const matchRepository = {
      findOne: jest
        .fn()
        .mockResolvedValueOnce({
          matchId: '00000000-0000-4000-8000-000000000099',
          bracketMatchId: 'stale-bracket-match',
          status: 'active',
        })
        .mockResolvedValueOnce(null),
      create: jest.fn((value: PokeLoungeCompetitiveMatch) => value),
      save: matchSave,
      delete: matchDelete,
    };
    const manager = {
      getRepository: jest.fn((entity) => {
        if (entity === PokeLoungeCompetitiveSeat) {
          return {
            find: jest.fn().mockResolvedValue(
              Array.from({ length: 5 }, (_, index) => ({
                playerId: `player-${index + 1}`,
                accountId: `account-${index + 1}`,
              })),
            ),
          };
        }
        if (entity === PokeLoungeCompetitiveMatch) {
          return matchRepository;
        }
        throw new Error('Unexpected repository');
      }),
    } as unknown as EntityManager;

    await ensureActiveTournamentAssignment(
      manager,
      {
        id: '00000000-0000-4000-8000-000000000001',
        roomCode: 'ROOM01',
      } as PokeLoungeRoom,
      roomSnapshot,
    );

    expect(matchDelete).toHaveBeenCalledWith({
      matchId: '00000000-0000-4000-8000-000000000099',
    });
    expect(matchSave).toHaveBeenCalledTimes(1);
    expect(matchSave.mock.calls[0]?.[0]).toMatchObject({
      bracketMatchId: activeMatchId,
    });
  });
});

describe('completeServerAuthorityParticipantLeave', () => {
  it.each([0, 1] as const)(
    'terminals the exact active match, advances the bracket, and resolves exactly %i pending action receipt',
    async (pendingReceiptCount) => {
      const currentSnapshot = fivePlayerTournamentSnapshot();
      const nextSnapshot = structuredClone(currentSnapshot);
      nextSnapshot.revision = currentSnapshot.revision + 1;
      const activeMatchId = currentSnapshot.tournament.activeMatchId!;
      const assignment = createCompetitiveAssignment({
        roomId: '00000000-0000-4000-8000-000000000001',
        roomCode: 'ROOM01',
        bracketMatchId: activeMatchId,
        kind: 'tournament-unranked',
        assignmentRevision: 1,
        players: [
          { playerId: 'player-4', accountId: 'account-4' },
          { playerId: 'player-5', accountId: 'account-5' },
        ],
        parties: {
          'player-4':
            currentSnapshot.partySnapshots['player-4'].competitiveParty,
          'player-5':
            currentSnapshot.partySnapshots['player-5'].competitiveParty,
        },
      });
      const match = {
        ...assignment,
        currentState: assignment.initialState,
        terminalResult: null,
        completedAt: null,
      } as PokeLoungeCompetitiveMatch;
      const matchSave = jest.fn((value: PokeLoungeCompetitiveMatch) => value);
      const matchQuery = {
        setLock: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(match),
      };
      const matchRepository = {
        createQueryBuilder: jest.fn().mockReturnValue(matchQuery),
        create: jest.fn((value: PokeLoungeCompetitiveMatch) => value),
        save: matchSave,
      };
      const pendingAction = {
        matchId: assignment.matchId,
        roomId: '00000000-0000-4000-8000-000000000001',
        turn: 0,
        actorPlayerId: 'player-4',
        actorAccountId: 'account-4',
        clientCommandId: '00000000-0000-4000-8000-000000000004',
        status: 'pending',
        response: { matchId: assignment.matchId, status: 'active' },
        resolvedAt: null,
      } as PokeLoungeCompetitiveAction;
      const pendingActions = pendingReceiptCount === 1 ? [pendingAction] : [];
      const actionSave = jest.fn((value: PokeLoungeCompetitiveAction[]) =>
        Promise.resolve(value),
      );
      const actionRepository = {
        find: jest.fn().mockResolvedValue(pendingActions),
        findBy: jest.fn().mockResolvedValue(pendingActions),
        create: jest.fn((value: PokeLoungeCompetitiveAction) => value),
        save: actionSave,
        createQueryBuilder: jest.fn(() => ({
          addSelect: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          getMany: jest.fn().mockResolvedValue(pendingActions),
        })),
      };
      const manager = {
        getRepository: jest.fn((entity) => {
          if (entity === PokeLoungeCompetitiveMatch) {
            return matchRepository;
          }
          if (entity === PokeLoungeCompetitiveSeat) {
            return {
              find: jest.fn().mockResolvedValue(
                Array.from({ length: 5 }, (_, index) => ({
                  playerId: `player-${index + 1}`,
                  accountId: `account-${index + 1}`,
                })),
              ),
            };
          }
          if (entity === PokeLoungeCompetitiveAction) {
            return actionRepository;
          }
          throw new Error('Unexpected repository');
        }),
      } as unknown as EntityManager;

      await completeServerAuthorityParticipantLeave(
        manager,
        {
          id: '00000000-0000-4000-8000-000000000001',
          roomCode: 'ROOM01',
        } as PokeLoungeRoom,
        currentSnapshot,
        nextSnapshot,
        'player-5',
        2_000,
      );

      expect(matchSave).toHaveBeenCalledTimes(2);
      const completedMatch = matchSave.mock.calls[0]?.[0];
      expect(completedMatch).toMatchObject({
        bracketMatchId: activeMatchId,
        status: 'completed',
        terminalResult: {
          winnerPlayerId: 'player-4',
          loserPlayerId: 'player-5',
          reason: 'forfeit',
          scoreByPlayerId: { 'player-4': 100, 'player-5': 50 },
        },
        completedAt: new Date(2_000),
      });
      expect(completedMatch?.currentStateHash).toBe(
        hashCanonicalState(completedMatch.currentState),
      );
      expect(nextSnapshot.tournament).toMatchObject({
        activeMatchId: 'game-round-1-bracket-2-match-1',
        activeMatchAuthority: 'server',
      });
      expect(matchSave.mock.calls[1]?.[0]).toMatchObject({
        bracketMatchId: 'game-round-1-bracket-2-match-1',
        playerAccounts: [
          { playerId: 'player-1', accountId: 'account-1' },
          { playerId: 'player-4', accountId: 'account-4' },
        ],
      });
      if (pendingReceiptCount === 0) {
        expect(actionRepository.create).not.toHaveBeenCalled();
        expect(actionSave).not.toHaveBeenCalled();
        return;
      }

      const terminalEventId = pendingAction.response.terminalEventId;
      const resolvedAt = pendingAction.resolvedAt;
      if (
        typeof terminalEventId !== 'string' ||
        !(resolvedAt instanceof Date)
      ) {
        throw new Error(
          'Expected the pending receipt to resolve with terminal metadata',
        );
      }

      expect(pendingAction).toMatchObject({
        status: 'resolved',
        response: {
          matchId: assignment.matchId,
          status: 'completed',
          terminalEventId,
          terminalRoomRevision: nextSnapshot.revision,
          terminal: {
            winnerPlayerId: 'player-4',
            loserPlayerId: 'player-5',
            reason: 'forfeit',
          },
        },
        resolvedAt,
      });
      expect(actionSave).toHaveBeenCalledTimes(1);
    },
  );

  it('does not invent a winner when a bye participant leaves', async () => {
    const currentSnapshot = fivePlayerTournamentSnapshot();
    const getRepository = jest.fn();
    const manager = { getRepository } as unknown as EntityManager;

    await completeServerAuthorityParticipantLeave(
      manager,
      {
        id: '00000000-0000-4000-8000-000000000001',
        roomCode: 'ROOM01',
      } as PokeLoungeRoom,
      currentSnapshot,
      structuredClone(currentSnapshot),
      'player-1',
      2_000,
    );

    expect(getRepository).not.toHaveBeenCalled();
  });
});

function createReplayManager(
  events: string[],
  commandLockParameters: unknown[][],
): EntityManager {
  const manager = {
    query(sql: string, parameters: unknown[] = []) {
      const event = sql.includes('$1, $2') ? 'command-lock' : 'creation-lock';
      events.push(event);
      if (event === 'command-lock') {
        commandLockParameters.push(parameters);
      }

      return Promise.resolve([]);
    },
    getRepository(entity: unknown) {
      if (entity !== PokeLoungeRoomCommand) {
        throw new Error('Unexpected repository requested');
      }

      return {
        findOne() {
          return Promise.resolve(receipt());
        },
      };
    },
  };

  return manager as unknown as EntityManager;
}

function createMissingRoomManager(
  events: string[],
  commandLockParameters: unknown[][],
): EntityManager {
  let queryBuilderCount = 0;
  const manager = {
    query(sql: string, parameters: unknown[] = []) {
      events.push(sql.includes('$1, $2') ? 'command-lock' : 'other-lock');
      commandLockParameters.push(parameters);

      return Promise.resolve([]);
    },
    getRepository(entity: unknown) {
      if (entity !== PokeLoungeRoom) {
        throw new Error('Unexpected repository requested');
      }

      return {
        createQueryBuilder() {
          queryBuilderCount += 1;
          if (queryBuilderCount === 1) {
            events.push('purge');
            return new FakeDeleteQueryBuilder();
          }

          events.push('room-lock');
          return new FakeRoomQueryBuilder();
        },
      };
    },
  };

  return manager as unknown as EntityManager;
}

function createLeaveReceiptReplayManager(
  responseSnapshot: PokeLoungeRoomSnapshot,
): {
  manager: EntityManager;
  commandSave: jest.Mock;
  requestedEntities: unknown[];
} {
  const requestedEntities: unknown[] = [];
  const commandSave = jest.fn();
  const { revision, expiresAtMs, ...state } = responseSnapshot;
  const room = {
    id: '00000000-0000-4000-8000-000000000001',
    roomCode: responseSnapshot.roomCode,
    state,
    revision,
    expiresAt: new Date(expiresAtMs),
  } as PokeLoungeRoom;
  const storedReceipt = {
    roomId: room.id,
    actorPlayerId: 'player-5',
    idempotencyKey: IDEMPOTENCY_KEY,
    requestHash: mutateInput().requestHash,
    responseState: structuredClone(responseSnapshot),
    responseRevision: responseSnapshot.revision,
  } as PokeLoungeRoomCommand;
  let roomQueryCount = 0;
  const roomRepository = {
    createQueryBuilder: jest.fn(() => {
      roomQueryCount += 1;
      if (roomQueryCount === 1) {
        return new FakeDeleteQueryBuilder();
      }
      return {
        setLock: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(room),
      };
    }),
  };
  const commandRepository = {
    findOne: jest.fn().mockResolvedValue(storedReceipt),
    save: commandSave,
  };
  const manager = {
    query: jest.fn().mockResolvedValue([]),
    getRepository: jest.fn((entity: unknown) => {
      requestedEntities.push(entity);
      if (entity === PokeLoungeRoom) {
        return roomRepository;
      }
      if (entity === PokeLoungeRoomCommand) {
        return commandRepository;
      }
      throw new Error('Unexpected repository requested');
    }),
  } as unknown as EntityManager;

  return { manager, commandSave, requestedEntities };
}

class FakeDeleteQueryBuilder {
  delete(): this {
    return this;
  }

  where(): this {
    return this;
  }

  execute(): Promise<{ affected: number }> {
    return Promise.resolve({ affected: 0 });
  }
}

class FakeRoomQueryBuilder {
  setLock(): this {
    return this;
  }

  where(): this {
    return this;
  }

  getOne(): Promise<null> {
    return Promise.resolve(null);
  }
}

function managerDataSource(manager: EntityManager): DataSource {
  return {
    transaction<T>(runInTransaction: (value: EntityManager) => Promise<T>) {
      return runInTransaction(manager);
    },
  } as unknown as DataSource;
}

async function captureCreateCommandLock(
  input: CreateInput,
): Promise<unknown[]> {
  const events: string[] = [];
  const commandLockParameters: unknown[][] = [];
  const repository = new PostgresPokeLoungeRoomRepository(
    managerDataSource(createReplayManager(events, commandLockParameters)),
  );

  await repository.create(input);

  if (!commandLockParameters[0]) {
    throw new Error('Command advisory lock was not acquired');
  }

  return commandLockParameters[0];
}

function scriptedDataSource(steps: unknown[]): {
  dataSource: DataSource;
  transaction: jest.Mock<Promise<unknown>, []>;
} {
  const transaction = jest.fn<Promise<unknown>, []>(() => {
    const step = steps.shift();

    if (step instanceof Error) {
      return Promise.reject(step);
    }

    if (step === undefined) {
      return Promise.reject(new Error('Transaction script exhausted'));
    }

    return Promise.resolve(step);
  });

  return {
    dataSource: { transaction } as unknown as DataSource,
    transaction,
  };
}

function uniqueViolation(constraint: string): QueryFailedError {
  const driverError = Object.assign(new Error('duplicate key'), {
    code: '23505',
    constraint,
  });

  return new QueryFailedError('INSERT', [], driverError);
}

function createInput(overrides: Partial<CreateInput> = {}): CreateInput {
  return {
    room: snapshot(),
    actorPlayerId: 'player-a',
    idempotencyKey: IDEMPOTENCY_KEY,
    requestHash: 'a'.repeat(64),
    nowMs: 1_000,
    ...overrides,
  };
}

function mutateInput() {
  return {
    roomCode: 'ROOM01',
    actorPlayerId: 'player-a',
    idempotencyKey: IDEMPOTENCY_KEY,
    requestHash: 'b'.repeat(64),
    expectedRevision: 0,
    nowMs: 2_000,
    apply: (room: PokeLoungeRoomSnapshot) => room,
  };
}

function receipt(): PokeLoungeRoomCommand {
  return {
    roomId: '00000000-0000-4000-8000-000000000001',
    actorPlayerId: 'player-a',
    idempotencyKey: IDEMPOTENCY_KEY,
    requestHash: 'a'.repeat(64),
    responseState: snapshot(),
    responseRevision: 0,
  } as PokeLoungeRoomCommand;
}

function repositoryResult(
  outcome: PokeLoungeRepositoryResult['outcome'],
): PokeLoungeRepositoryResult {
  return {
    snapshot: snapshot(),
    outcome,
    committedChange: false,
  };
}

function snapshot(): PokeLoungeRoomSnapshot {
  return {
    roomCode: 'ROOM01',
    status: 'waiting',
    createdAtMs: 1_000,
    updatedAtMs: 1_000,
    participants: [],
    partySnapshots: createTestPartySnapshots([
      'player-1',
      'player-2',
      'player-3',
      'player-4',
      'player-5',
    ]),
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
    expiresAtMs: 1_801_000,
  };
}

function fivePlayerTournamentSnapshot(): PokeLoungeRoomSnapshot {
  const room = snapshot();
  room.status = 'tournament';
  room.round.phase = 'tournament';
  room.participants = Array.from({ length: 5 }, (_, index) => ({
    sessionId: `session-${index + 1}`,
    playerId: `player-${index + 1}`,
    displayName: `Player ${index + 1}`,
    role: 'participant' as const,
    ready: true,
    connected: true,
    joinedAtMs: 1_000 + index,
  }));
  const bracket = createTournamentBracketState(
    room.participants.map(({ playerId, displayName }) => ({
      playerId,
      displayName,
    })),
    room.round.index,
  );
  room.tournament = {
    version: 2,
    bracket,
    activeMatchId: bracket.currentRound!.matches[0].matchId,
    activeMatchAuthority: 'server',
    cumulativeScores: {},
  };

  return room;
}
