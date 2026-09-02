import type { ConfigService } from '@nestjs/config';
import type { CompetitiveMatchService } from '../competitive/competitive-match.service';
import type { PokeLoungeLiveStateService } from '../poke-lounge-live-state.service';
import type { PokeLoungeRoomSnapshot } from '../poke-lounge-room.repository';
import type { RedisPokeLoungeRepository } from '../redis-poke-lounge.repository';
import { PokeLoungeAiWorkerService } from './poke-lounge-ai-worker.service';

describe('PokeLoungeAiWorkerService', () => {
  it('AI 월드 갱신 중 방이 닫히면 다시 생성된 월드 상태를 제거한다', async () => {
    const activeRoom = {
      roomCode: 'ROOM01',
      revision: 1,
      expiresAtMs: 10_000,
      status: 'tournament',
      round: { startedAtMs: 1_000 },
      participants: [
        {
          playerId: 'ai-1',
          sessionId: 'ai-session-1',
          displayName: 'AI 1',
          controller: 'ai',
          connected: true,
        },
      ],
      partySnapshots: {},
      competitiveAssignments: [],
    } as unknown as PokeLoungeRoomSnapshot;
    const closedRoom = { ...activeRoom, status: 'closed' } as const;
    const getAndAdvance = jest
      .fn()
      .mockResolvedValueOnce({ snapshot: activeRoom, committedChange: false })
      .mockResolvedValueOnce({ snapshot: closedRoom, committedChange: false });
    const listRoomStateCodes = jest.fn().mockResolvedValue(['ROOM01']);
    const getSnapshot = jest.fn().mockResolvedValue({
      roomCode: 'ROOM01',
      worldEpoch: 'epoch-1',
      worldSeq: 1,
      players: [],
    });
    const upsertPlayer = jest.fn().mockResolvedValue(undefined);
    const deleteRoom = jest.fn().mockResolvedValue(undefined);
    const service = new PokeLoungeAiWorkerService(
      {} as ConfigService,
      { getAndAdvance } as unknown as RedisPokeLoungeRepository,
      {
        listRoomStateCodes,
        getSnapshot,
        removePlayer: jest.fn(),
        upsertPlayer,
        deleteRoom,
      } as unknown as PokeLoungeLiveStateService,
      {} as CompetitiveMatchService,
    );

    await service.processTick(5_000);

    expect(upsertPlayer).toHaveBeenCalledTimes(1);
    expect(deleteRoom).toHaveBeenCalledWith('ROOM01');
  });
});
