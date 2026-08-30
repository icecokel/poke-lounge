import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import type { CanonicalTerminalResult } from '@poke-lounge/battle';
import type { EntityManager } from 'typeorm';
import type { CompetitivePlayerAccount } from '../poke-lounge/competitive/competitive-match.types';
import { GameHistory } from './entities/game-history.entity';
import { GameType } from './enums/game-type.enum';

type VerifiedHistorySource = {
  roomId: string;
  matchId: string;
};

export type WriteVerifiedPokeLoungeHistoryInput = {
  gameType: GameType;
  terminalResult: CanonicalTerminalResult;
  playerAccounts: [CompetitivePlayerAccount, CompetitivePlayerAccount];
  source: VerifiedHistorySource;
};

type PersistedVerifiedHistory = Pick<
  GameHistory,
  | 'id'
  | 'score'
  | 'gameType'
  | 'playTime'
  | 'resultTrust'
  | 'sourceKey'
  | 'userId'
  | 'createdAt'
>;

@Injectable()
export class VerifiedPokeLoungeHistoryWriter {
  async write(
    manager: EntityManager,
    input: WriteVerifiedPokeLoungeHistoryInput,
  ): Promise<PersistedVerifiedHistory[]> {
    if (!manager.queryRunner?.isTransactionActive) {
      throw new Error(
        'Verified Poke Lounge history writer requires an active transaction',
      );
    }

    const entries = validateAndBuildEntries(input);

    await manager.query(
      `
      INSERT INTO "game_history"
        ("userId", score, "gameType", "resultTrust", "sourceKey")
      VALUES
        ($1, $2, 'POKE_LOUNGE', 'verified-room', $3),
        ($4, $5, 'POKE_LOUNGE', 'verified-room', $6)
      ON CONFLICT ("sourceKey") WHERE "sourceKey" IS NOT NULL DO NOTHING
      `,
      entries.flatMap((entry) => [
        entry.accountId,
        entry.score,
        entry.sourceKey,
      ]),
    );

    const histories = await manager.query<PersistedVerifiedHistory[]>(
      `
      SELECT
        id,
        score,
        "gameType",
        "playTime",
        "resultTrust",
        "sourceKey",
        "userId",
        "createdAt"
      FROM "game_history"
      WHERE "sourceKey" = ANY($1::varchar[])
      ORDER BY "sourceKey" ASC
      `,
      [entries.map((entry) => entry.sourceKey)],
    );

    const historyBySourceKey = new Map(
      histories.map((history) => [history.sourceKey, history]),
    );
    const orderedHistories = entries.map((entry) => {
      const history = historyBySourceKey.get(entry.sourceKey);
      if (
        !history ||
        history.userId !== entry.accountId ||
        history.score !== entry.score ||
        history.gameType !== GameType.POKE_LOUNGE ||
        history.resultTrust !== 'verified-room'
      ) {
        throw new ConflictException(
          'Verified Poke Lounge history conflicts with the persisted server result',
        );
      }
      return history;
    });

    return orderedHistories;
  }
}

function validateAndBuildEntries(input: WriteVerifiedPokeLoungeHistoryInput) {
  if (input.gameType !== GameType.POKE_LOUNGE) {
    throw new BadRequestException(
      'Verified history writer only accepts POKE_LOUNGE',
    );
  }

  const [first, second] = input.playerAccounts;
  if (
    !first?.playerId ||
    !second?.playerId ||
    !first.accountId ||
    !second.accountId ||
    first.playerId === second.playerId ||
    first.accountId === second.accountId
  ) {
    throw new BadRequestException(
      'Verified history requires two distinct bound players and accounts',
    );
  }

  const { terminalResult } = input;
  const expectedPlayerIds = new Set([first.playerId, second.playerId]);
  const scorePlayerIds = Object.keys(terminalResult.scoreByPlayerId);
  if (
    terminalResult.winnerPlayerId === terminalResult.loserPlayerId ||
    !expectedPlayerIds.has(terminalResult.winnerPlayerId) ||
    !expectedPlayerIds.has(terminalResult.loserPlayerId) ||
    scorePlayerIds.length !== 2 ||
    scorePlayerIds.some((playerId) => !expectedPlayerIds.has(playerId)) ||
    terminalResult.scoreByPlayerId[terminalResult.winnerPlayerId] !== 100 ||
    terminalResult.scoreByPlayerId[terminalResult.loserPlayerId] !== 50
  ) {
    throw new BadRequestException(
      'Verified Poke Lounge result must contain exact server scores 100 and 50',
    );
  }

  if (!input.source.roomId || !input.source.matchId) {
    throw new BadRequestException(
      'Verified history requires room and match identity',
    );
  }

  return input.playerAccounts.map(({ playerId, accountId }) => ({
    accountId,
    score: terminalResult.scoreByPlayerId[playerId],
    sourceKey: `${input.source.roomId}:${input.source.matchId}:${accountId}`,
  }));
}
