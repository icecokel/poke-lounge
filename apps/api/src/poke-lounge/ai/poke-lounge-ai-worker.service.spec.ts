import type { ConfigService } from '@nestjs/config';
import type { CompetitiveMatchService } from '../competitive/competitive-match.service';
import type { PokeLoungeLiveStateService } from '../poke-lounge-live-state.service';
import type { PokeLoungeRoomSnapshot } from '../poke-lounge-room.repository';
import type { RedisPokeLoungeRepository } from '../redis-poke-lounge.repository';
import type { PokeLoungeAiRuntimeService } from './poke-lounge-ai-runtime.service';
import { PokeLoungeAiWorkerService } from './poke-lounge-ai-worker.service';
import * as adventure from '@poke-lounge/battle/adventure/ai-world';
import { createAiStarterParty } from '@poke-lounge/battle/ai-policy';

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
  const service = new PokeLoungeAiWorkerService(
    {} as ConfigService,
    { getAndAdvance, mutate } as unknown as RedisPokeLoungeRepository,
    liveState as unknown as PokeLoungeLiveStateService,
    {} as CompetitiveMatchService,
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
  };
}

it('advances without waiting for a human move and does not revise the room for movement alone', async () => {
  const t = setup();
  await t.service.processTick(1_250);
  await t.service.processTick(1_500);
  expect(t.advance).toHaveBeenCalledWith(expect.anything(), 1_500, 1, true, {});
  expect(t.liveState.upsertPlayer).toHaveBeenLastCalledWith(
    expect.objectContaining({
      player: expect.objectContaining({
        x: 708,
        y: 446,
        activity: 'moving',
      }) as unknown,
    }),
  );
  expect(t.liveState.saveAiAdventures).toHaveBeenCalledTimes(2);
  expect(t.mutate).not.toHaveBeenCalled();
});

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
