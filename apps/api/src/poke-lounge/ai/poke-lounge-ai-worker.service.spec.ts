import type { ConfigService } from '@nestjs/config';
import type { CompetitiveMatchService } from '../competitive/competitive-match.service';
import type { PokeLoungeLiveStateService } from '../poke-lounge-live-state.service';
import type { PokeLoungeRoomSnapshot } from '../poke-lounge-room.repository';
import type { RedisPokeLoungeRepository } from '../redis-poke-lounge.repository';
import type { PokeLoungeAiRuntimeService } from './poke-lounge-ai-runtime.service';
import { PokeLoungeAiWorkerService } from './poke-lounge-ai-worker.service';
import * as adventure from '@poke-lounge/battle/adventure/ai-world';
import { createAiStarterParty } from '@poke-lounge/battle/ai-policy';
import { createTestInitialBattleState } from '../../../test/support/competitive-party.fixture';
import { toCompetitiveProjection } from '../competitive/competitive-projection';

afterEach(() => jest.restoreAllMocks());
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function setup() {
  const party = createAiStarterParty(() => 0.5);
  const room = {
    roomCode: 'ROOM01',
    revision: 1,
    expiresAtMs: 30_000,
    status: 'round-started',
    round: { startedAtMs: 1_000, index: 1 },
    participants: [
      {
        playerId: 'ai-1',
        sessionId: 'ai-session-1',
        displayName: 'AI 1',
        controller: 'ai',
        connected: true,
      },
    ],
    partySnapshots: {
      'ai-1': {
        version: 2,
        playerId: 'ai-1',
        competitiveParty: party,
        updatedAtMs: 1_000,
      },
    },
    competitiveAssignments: [],
  } as unknown as PokeLoungeRoomSnapshot;
  const state = {
    position: { x: 656, y: 446 },
    facing: 'front',
    activity: 'moving',
    updatedAtMs: 1_000,
    party: [],
    activeSlotIndex: 0,
  } as unknown as adventure.AiAdventureState;
  jest.spyOn(adventure, 'createAiAdventure').mockReturnValue(state);
  const advance = jest
    .spyOn(adventure, 'advanceAiAdventure')
    .mockImplementation((s) => {
      s.position.x += 26;
      s.activity = 'moving';
    });
  const projection = jest
    .spyOn(adventure, 'aiCompetitiveParty')
    .mockReturnValue(party);
  const getAndAdvance = jest.fn().mockImplementation(() =>
    Promise.resolve({
      snapshot: clone(room),
      committedChange: false,
    }),
  );
  const mutate = jest
    .fn()
    .mockImplementation(
      (input: Parameters<RedisPokeLoungeRepository['mutate']>[0]) =>
        Promise.resolve({
          snapshot: input.apply(clone(room)),
          outcome: 'committed',
          committedChange: true,
        }),
    );
  let saved: Record<string, adventure.AiAdventureState> = {};
  const liveState = {
    listRoomStateCodes: jest.fn().mockResolvedValue(['ROOM01']),
    getSnapshot: jest.fn().mockResolvedValue({ players: [] }),
    getAiAdventures: jest
      .fn()
      .mockImplementation(() => Promise.resolve(clone(saved))),
    saveAiAdventures: jest
      .fn()
      .mockImplementation(
        (_room: string, _expires: number, states: typeof saved) => {
          saved = clone(states);
          return Promise.resolve();
        },
      ),
    removePlayer: jest.fn(),
    upsertPlayer: jest.fn(),
    deleteRoom: jest.fn(),
    publishRoomCommit: jest.fn(),
  };
  const runtime = { getContext: jest.fn().mockResolvedValue({}) };
  const chooseAiAction = jest
    .fn()
    .mockResolvedValue({ kind: 'move', moveId: 55 });
  const submitSessionAction = jest.fn().mockResolvedValue({});
  const service = new PokeLoungeAiWorkerService(
    {} as ConfigService,
    {
      getAndAdvance,
      mutate,
      chooseAiAction,
    } as unknown as RedisPokeLoungeRepository,
    liveState as unknown as PokeLoungeLiveStateService,
    { submitSessionAction } as unknown as CompetitiveMatchService,
    runtime as unknown as PokeLoungeAiRuntimeService,
  );
  return {
    service,
    room,
    state,
    liveState,
    runtime,
    getAndAdvance,
    mutate,
    projection,
    advance,
    chooseAiAction,
    submitSessionAction,
  };
}

it('submits the server-selected action and skips an outdated assignment', async () => {
  const t = setup();
  t.room.status = 'tournament';
  const currentState = createTestInitialBattleState(['ai-1', 'player-2']);
  t.room.competitiveAssignments = [
    toCompetitiveProjection(
      {
        matchId: 'match-1',
        bracketMatchId: 'bracket-1',
        kind: 'tournament-unranked',
        assignmentRevision: 1,
        rulesetVersion: 3,
        rulesetHash: 'test',
        currentTurn: currentState.turn,
        status: 'active',
        currentState,
        currentStateHash: 'test',
        terminalResult: null,
        turnStartedAtMs: 0,
      },
      [],
    ),
  ];
  expect(
    t.room.competitiveAssignments[0].currentState.playersById['ai-1'].team[0],
  ).not.toHaveProperty('attack');
  await t.service.processTick(2_000);
  expect(t.chooseAiAction).toHaveBeenCalledWith({
    roomCode: 'ROOM01',
    matchId: 'match-1',
    playerId: 'ai-1',
    turn: currentState.turn,
    assignmentRevision: 1,
  });
  expect(t.submitSessionAction).toHaveBeenCalledWith(
    expect.objectContaining({ action: { kind: 'move', moveId: 55 } }),
  );
  t.chooseAiAction.mockResolvedValueOnce(null);
  await t.service.processTick(2_250);
  expect(t.submitSessionAction).toHaveBeenCalledTimes(1);
});

it('advances without waiting for a human move and does not revise the room for movement alone', async () => {
  const t = setup();
  await t.service.processTick(1_250);
  await t.service.processTick(1_500);
  expect(t.advance).toHaveBeenCalledWith(expect.anything(), 1_500, 1, true, {
    sharePartyExperience: false,
    partyExperienceRatio: 0,
  });
  expect(t.liveState.upsertPlayer).toHaveBeenLastCalledWith(
    expect.objectContaining({
      player: expect.objectContaining({
        x: 644,
        y: 368,
        activity: 'moving',
      }) as unknown,
    }),
  );
  expect(t.liveState.saveAiAdventures).toHaveBeenCalledTimes(2);
  expect(t.mutate).not.toHaveBeenCalled();
});

it.each([90_000, 180_000, 300_000])(
  'uses the same party experience rule as humans in %s ms rooms',
  async (duration) => {
    const t = setup();
    t.room.round.durationMs = duration;
    await t.service.processTick(1_250);
    expect(t.advance).toHaveBeenCalledWith(expect.anything(), 1_250, 1, true, {
      sharePartyExperience: duration !== 300_000,
      partyExperienceRatio:
        duration === 90_000 ? 1 : duration === 180_000 ? 0.5 : 0,
    });
  },
);

it('commits changed parties and does not publish uncommitted simulation on a revision conflict', async () => {
  const t = setup();
  const changed = clone(t.room.partySnapshots['ai-1'].competitiveParty);
  changed.members[0].currentHp -= 1;
  t.projection.mockReturnValue(changed);
  t.mutate.mockResolvedValueOnce({
    snapshot: t.room,
    outcome: 'revision-conflict',
    committedChange: false,
  });
  await t.service.processTick(1_250);
  expect(t.liveState.saveAiAdventures).not.toHaveBeenCalled();
  expect(t.liveState.upsertPlayer).not.toHaveBeenCalled();
  await t.service.processTick(1_500);
  expect(t.mutate).toHaveBeenCalledTimes(2);
  expect(t.liveState.publishRoomCommit).toHaveBeenCalledWith({
    roomCode: 'ROOM01',
    revision: 1,
  });
  expect(t.liveState.saveAiAdventures).toHaveBeenCalledTimes(1);
});

it('persists recovery and movement when a fainted party cannot be submitted yet', async () => {
  const t = setup();
  t.projection.mockReturnValue(null);
  await t.service.processTick(1_250);
  expect(t.liveState.saveAiAdventures).toHaveBeenCalledTimes(1);
  expect(t.liveState.upsertPlayer).toHaveBeenCalledTimes(1);
  expect(t.mutate).not.toHaveBeenCalled();
});

it('cleans up a room closed during the tick and never advances with unavailable ROM data', async () => {
  const t = setup();
  t.getAndAdvance
    .mockResolvedValueOnce({ snapshot: t.room, committedChange: false })
    .mockResolvedValueOnce({
      snapshot: { ...t.room, status: 'closed' },
      committedChange: false,
    });
  await t.service.processTick(1_250);
  expect(t.liveState.deleteRoom).toHaveBeenCalledWith('ROOM01');
  t.runtime.getContext.mockRejectedValueOnce(new Error('ROM unavailable'));
  t.liveState.upsertPlayer.mockClear();
  await t.service.processTick(1_500);
  expect(t.liveState.upsertPlayer).not.toHaveBeenCalled();
});

it('stops AI exploration at the bracket announcement and publishes its stable healer slot', async () => {
  const t = setup();
  t.room.round = {
    index: 1,
    phase: 'round-started',
    startedAtMs: 1000,
    endsAtMs: 7000,
    durationMs: 6000,
  };
  await t.service.processTick(2000);
  expect(t.advance).toHaveBeenCalledWith(expect.anything(), 2000, 1, false, {
    sharePartyExperience: false,
    partyExperienceRatio: 0,
  });
  expect(t.liveState.upsertPlayer).toHaveBeenLastCalledWith(
    expect.objectContaining({
      player: expect.objectContaining({
        playerId: 'ai-1',
        x: 592,
        y: 304,
        facing: 'back',
      }) as unknown,
    }),
  );
  const saved = t.liveState.saveAiAdventures.mock.calls.at(-1) as
    [string, number, Record<string, adventure.AiAdventureState>] | undefined;
  expect(saved?.[2]['ai-1'].battle).toBeNull();
  t.room.round = {
    index: 2,
    phase: 'round-started',
    startedAtMs: 8000,
    endsAtMs: 68000,
    durationMs: 60000,
  };
  await t.service.processTick(9000);
  expect(t.advance).toHaveBeenLastCalledWith(expect.anything(), 9000, 2, true, {
    sharePartyExperience: false,
    partyExperienceRatio: 0,
  });
});

it.each(['waiting'] as const)(
  'does not publish or advance AI before the game is playable (%s)',
  async (phase) => {
    const t = setup();
    t.room.status = phase === 'waiting' ? 'waiting' : 'round-started';
    t.room.round = {
      index: 1,
      phase: phase === 'waiting' ? 'waiting' : 'round-started',
      durationMs: 90_000,
      startedAtMs: null,
      endsAtMs: null,
    };
    await t.service.processTick(5_000);
    await t.service.processTick(10_000);
    expect(t.advance).not.toHaveBeenCalled();
    expect(t.runtime.getContext).not.toHaveBeenCalled();
    expect(t.liveState.upsertPlayer).not.toHaveBeenCalled();
    expect(t.liveState.saveAiAdventures).not.toHaveBeenCalled();
  },
);

it('publishes AI at the same central slot throughout 3/2/1 without simulation or party rewards', async () => {
  const t = setup();
  t.room.round = {
    index: 1,
    phase: 'round-started',
    durationMs: 90000,
    startedAtMs: 4000,
    endsAtMs: 94000,
  };
  for (const now of [1000, 2000, 3000, 3999]) await t.service.processTick(now);
  expect(t.advance).not.toHaveBeenCalled();
  expect(t.mutate).not.toHaveBeenCalled();
  for (const call of t.liveState.upsertPlayer.mock.calls as Array<
    Parameters<PokeLoungeLiveStateService['upsertPlayer']>
  >)
    expect(call[0]).toMatchObject({
      player: { x: 592, y: 368, activity: 'idle' },
    });
  await t.service.processTick(4000);
  expect(t.advance).toHaveBeenCalledTimes(1);
  expect(t.advance.mock.calls[0][3]).toBe(true);
});

it('warms and persists AI before acknowledging readiness, so a slow AI load cannot consume the countdown', async () => {
  const t = setup();
  t.room.round = {
    index: 1,
    phase: 'round-started',
    durationMs: 90000,
    startedAtMs: null,
    endsAtMs: null,
  };
  t.room.participants[0].role = 'participant';
  t.room.participants[0].ready = false;
  const human = {
    ...t.room.participants[0],
    playerId: 'human-1',
    sessionId: 'human-session',
    controller: 'human' as const,
    ready: true,
  };
  t.room.participants.push(human);
  t.room.partySnapshots['human-1'] = {
    ...t.room.partySnapshots['ai-1'],
    playerId: 'human-1',
  };
  jest.spyOn(Date, 'now').mockReturnValue(1000);
  let completeLoad: ((context: object) => void) | undefined;
  t.runtime.getContext.mockImplementation(
    () =>
      new Promise((resolve) => {
        completeLoad = resolve;
      }),
  );
  const pending = t.service.processTick(1000);
  for (let i = 0; i < 15 && !completeLoad; i++) await Promise.resolve();
  expect(completeLoad).toBeDefined();
  expect(t.mutate).not.toHaveBeenCalled();
  expect(t.advance).not.toHaveBeenCalled();
  jest.spyOn(Date, 'now').mockReturnValue(6000);
  completeLoad!({});
  await pending;
  expect(t.advance).not.toHaveBeenCalled();
  expect(t.liveState.saveAiAdventures.mock.invocationCallOrder[0]).toBeLessThan(
    t.mutate.mock.invocationCallOrder[0],
  );
  const result = await (t.mutate.mock.results[0].value as Promise<{
    snapshot: PokeLoungeRoomSnapshot;
  }>);
  expect(result.snapshot.round).toMatchObject({
    startedAtMs: 9000,
    endsAtMs: 99000,
  });
  expect(result.snapshot.participants[0].ready).toBe(true);
});

it('publishes idle activity and never advances or submits actions after championship completion', async () => {
  const t = setup();
  t.room.status = 'completed';
  t.room.round.index = 3;
  const saved = {
    ...t.state,
    activity: 'tournament' as const,
    path: [{ x: 800, y: 400 }],
    battle: null,
  };
  t.liveState.getAiAdventures.mockResolvedValue({ 'ai-1': saved });
  // Even stale active assignments cannot cause another competitive submission.
  const currentState = createTestInitialBattleState(['ai-1', 'player-2']);
  t.room.competitiveAssignments = [
    toCompetitiveProjection(
      {
        matchId: 'stale-match',
        bracketMatchId: 'last-bracket',
        kind: 'tournament-unranked',
        assignmentRevision: 1,
        rulesetVersion: 3,
        rulesetHash: 'test',
        currentTurn: currentState.turn,
        status: 'active',
        currentState,
        currentStateHash: 'test',
        terminalResult: null,
        turnStartedAtMs: 0,
      },
      [],
    ),
  ];
  for (const now of [2000, 2500]) await t.service.processTick(now);
  expect(t.advance).not.toHaveBeenCalled();
  expect(t.mutate).not.toHaveBeenCalled();
  expect(t.chooseAiAction).not.toHaveBeenCalled();
  expect(t.submitSessionAction).not.toHaveBeenCalled();
  expect(t.liveState.upsertPlayer).toHaveBeenLastCalledWith(
    expect.objectContaining({
      player: expect.objectContaining({
        x: 656,
        y: 446,
        activity: 'idle',
      }) as unknown,
    }),
  );
  expect(t.liveState.saveAiAdventures).toHaveBeenLastCalledWith(
    'ROOM01',
    t.room.expiresAtMs,
    expect.objectContaining({
      'ai-1': expect.objectContaining({
        activity: 'idle',
        path: [],
        battle: null,
        updatedAtMs: 2500,
        party: saved.party,
      }) as unknown,
    }),
  );
});
