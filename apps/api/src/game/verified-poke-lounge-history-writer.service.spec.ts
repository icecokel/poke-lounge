import { ConflictException } from '@nestjs/common';
import type { CanonicalTerminalResult } from '@poke-lounge/battle';
import type { EntityManager } from 'typeorm';
import { GameType } from './enums/game-type.enum';
import { VerifiedPokeLoungeHistoryWriter } from './verified-poke-lounge-history-writer.service';

const terminalResult: CanonicalTerminalResult = {
  winnerPlayerId: 'player-a',
  loserPlayerId: 'player-b',
  reason: 'faint',
  scoreByPlayerId: { 'player-a': 100, 'player-b': 50 },
};

describe('VerifiedPokeLoungeHistoryWriter', () => {
  const writer = new VerifiedPokeLoungeHistoryWriter();

  it('derives server source keys and writes both bound accounts through the supplied transaction', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        history('room-1:match-1:account-a', 'account-a', 100),
        history('room-1:match-1:account-b', 'account-b', 50),
      ]);

    const result = await writer.write(queryManager(query), {
      gameType: GameType.POKE_LOUNGE,
      terminalResult,
      playerAccounts: [
        { playerId: 'player-a', accountId: 'account-a' },
        { playerId: 'player-b', accountId: 'account-b' },
      ],
      source: { roomId: 'room-1', matchId: 'match-1' },
    });

    const [insertSql, insertParams] = query.mock.calls[0] as unknown as [
      string,
      unknown[],
    ];
    expect(insertSql).toContain('ON CONFLICT ("sourceKey")');
    expect(insertParams).toEqual([
      'account-a',
      100,
      'room-1:match-1:account-a',
      'account-b',
      50,
      'room-1:match-1:account-b',
    ]);
    expect(result.map((row) => row.score)).toEqual([100, 50]);
  });

  it.each([
    {
      name: 'non-Poke game',
      input: { gameType: GameType.SKY_DROP },
    },
    {
      name: 'duplicate account',
      input: {
        playerAccounts: [
          { playerId: 'player-a', accountId: 'account-a' },
          { playerId: 'player-b', accountId: 'account-a' },
        ],
      },
    },
    {
      name: 'wrong score',
      input: {
        terminalResult: {
          ...terminalResult,
          scoreByPlayerId: { 'player-a': 100, 'player-b': 100 },
        },
      },
    },
  ])('rejects $name before querying', async ({ input }) => {
    const query = jest.fn();

    await expect(
      writer.write(queryManager(query), {
        gameType: GameType.POKE_LOUNGE,
        terminalResult,
        playerAccounts: [
          { playerId: 'player-a', accountId: 'account-a' },
          { playerId: 'player-b', accountId: 'account-b' },
        ],
        source: { roomId: 'room-1', matchId: 'match-1' },
        ...input,
      }),
    ).rejects.toThrow();
    expect(query).not.toHaveBeenCalled();
  });

  it('fails when an existing source key has a changed score', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        history('room-1:match-1:account-a', 'account-a', 50),
        history('room-1:match-1:account-b', 'account-b', 50),
      ]);

    await expect(
      writer.write(queryManager(query), {
        gameType: GameType.POKE_LOUNGE,
        terminalResult,
        playerAccounts: [
          { playerId: 'player-a', accountId: 'account-a' },
          { playerId: 'player-b', accountId: 'account-b' },
        ],
        source: { roomId: 'room-1', matchId: 'match-1' },
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects an EntityManager outside an active caller transaction', async () => {
    const query = jest.fn();

    await expect(
      writer.write(queryManager(query, false), {
        gameType: GameType.POKE_LOUNGE,
        terminalResult,
        playerAccounts: [
          { playerId: 'player-a', accountId: 'account-a' },
          { playerId: 'player-b', accountId: 'account-b' },
        ],
        source: { roomId: 'room-1', matchId: 'match-1' },
      }),
    ).rejects.toThrow(/active transaction/);
    expect(query).not.toHaveBeenCalled();
  });
});

function queryManager(
  query: jest.Mock,
  isTransactionActive = true,
): EntityManager {
  return {
    query,
    queryRunner: { isTransactionActive },
  } as unknown as EntityManager;
}

function history(sourceKey: string, userId: string, score: number) {
  return {
    id: `${userId}-history`,
    score,
    gameType: GameType.POKE_LOUNGE,
    playTime: null,
    resultTrust: 'verified-room',
    sourceKey,
    userId,
    createdAt: new Date('2026-07-11T00:00:00.000Z'),
  };
}
