import type { TournamentStanding } from "@poke-lounge/battle/tournament-bracket";
import { DEFAULT_TOURNAMENT_SCORE_BY_RANK } from "@poke-lounge/battle/tournament-scoring";

export type TournamentResultScoreLookup =
  | Readonly<Record<string, number | null | undefined>>
  | ReadonlyMap<string, number | null | undefined>
  | ReadonlyArray<{ playerId: string; score: number | null | undefined }>;

/** One table row. Labels are rendered by the panel per locale; this carries only data. */
export interface TournamentResultRow {
  displayName: string;
  rank: number;
  tied: boolean;
  roundScore: number;
  cumulativeScore: number;
  champion: boolean;
  final: boolean;
}

export interface CreateTournamentResultRowsInput {
  final: boolean;
  standings: ReadonlyArray<TournamentStanding>;
  roundScores?: TournamentResultScoreLookup;
  cumulativeScores?: TournamentResultScoreLookup;
}

export interface CreateTournamentResultTitleInput {
  roundIndex: number;
  totalRounds: number;
  final: boolean;
}

export type CreateTournamentResultPanelViewModelInput = CreateTournamentResultRowsInput &
  CreateTournamentResultTitleInput;

/**
 * Text fields are Korean source strings that the panel localizes with
 * localizeRuntimeText; rows are structured so nothing is parsed back out of text.
 */
export interface TournamentResultPanelViewModel {
  title: string;
  final: boolean;
  nextActionLabel: string;
  rankingLabel: string;
  rows: TournamentResultRow[];
  roundWinnerLabel: string | null;
}

export function createTournamentResultRows({
  final,
  standings,
  roundScores,
  cumulativeScores,
}: CreateTournamentResultRowsInput): TournamentResultRow[] {
  const sortedStandings = [...standings].sort(function compareItems(left, right) {
    return left.rank - right.rank || left.seed - right.seed;
  });
  const tiedRanks = createTiedRankSet(sortedStandings);

  return sortedStandings.map(function mapItem(standing) {
    return {
      displayName: standing.displayName,
      rank: standing.rank,
      tied: tiedRanks.has(standing.rank),
      roundScore: readScore(roundScores, standing.playerId),
      cumulativeScore: readScore(cumulativeScores, standing.playerId),
      champion: final && standing.champion,
      final,
    };
  });
}

export function createTournamentResultPanelViewModel({
  roundIndex,
  totalRounds,
  final,
  standings,
  roundScores,
  cumulativeScores,
}: CreateTournamentResultPanelViewModelInput): TournamentResultPanelViewModel {
  return {
    title: createTournamentResultTitle({ roundIndex, totalRounds, final }),
    final,
    nextActionLabel: final ? "챔피언십 종료" : "다음 라운드 시작",
    rankingLabel: "현재 게임 누적 점수",
    rows: createTournamentResultRows({ final, standings, roundScores, cumulativeScores }),
    roundWinnerLabel: final ? null : createRoundWinnerLabel(standings, roundScores),
  };
}

export function createTournamentResultTitle({
  roundIndex,
  totalRounds,
  final,
}: CreateTournamentResultTitleInput): string {
  if (final) {
    return "최종 결과";
  }

  const visibleRound = Math.max(1, roundIndex);

  return `라운드 ${visibleRound}/${totalRounds} 결과`;
}

export function formatTournamentScore(score: number): string {
  const rounded = Math.round(score * 100) / 100;

  return String(rounded);
}

function createRoundWinnerLabel(
  standings: ReadonlyArray<TournamentStanding>,
  roundScores: TournamentResultScoreLookup | undefined,
): string | null {
  // These standings are CUMULATIVE. Their rank/champion (and server roundScore.rank)
  // cannot identify this round's winner. Only the unique rank-1 award can do so.
  const winners = standings.filter(
    standing => readScore(roundScores, standing.playerId) === DEFAULT_TOURNAMENT_SCORE_BY_RANK[1],
  );
  // Missing/legacy/incomplete scores must not create a speculative winner.
  return winners.length === 1
    ? `이번 라운드 우승 · ${truncateDisplayName(winners[0]!.displayName)}`
    : null;
}

function truncateDisplayName(displayName: string): string {
  const characters = Array.from(displayName);

  return characters.length <= 12 ? displayName : `${characters.slice(0, 11).join("")}…`;
}

function createTiedRankSet(standings: ReadonlyArray<TournamentStanding>): ReadonlySet<number> {
  const rankCounts = new Map<number, number>();

  for (const standing of standings) {
    rankCounts.set(standing.rank, (rankCounts.get(standing.rank) ?? 0) + 1);
  }

  return new Set(
    [...rankCounts.entries()]
      .filter(function filterItem([, count]) {
        return count > 1;
      })
      .map(function mapItem([rank]) {
        return rank;
      }),
  );
}

function readScore(scores: TournamentResultScoreLookup | undefined, playerId: string): number {
  if (!scores) {
    return 0;
  }

  const score = Array.isArray(scores)
    ? scores.find(function findItem(row) {
        return row.playerId === playerId;
      })?.score
    : typeof (scores as ReadonlyMap<string, number | null | undefined>).get === "function"
      ? (scores as ReadonlyMap<string, number | null | undefined>).get(playerId)
      : (scores as Readonly<Record<string, number | null | undefined>>)[playerId];

  if (typeof score !== "number" || !Number.isFinite(score)) {
    return 0;
  }

  return Math.max(0, score);
}
