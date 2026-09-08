import type { TournamentParticipant, TournamentStanding } from "./tournament-bracket";

export type TournamentScoreByRank = Readonly<Partial<Record<number, number | null | undefined>>>;
export type TournamentScoreByPlayerId = Readonly<Record<string, number | null | undefined>>;

export interface TournamentRoundScore {
  playerId: string;
  displayName: string;
  seed: number;
  rank: number;
  score: number;
}

export interface CumulativeTournamentScoreRank {
  playerId: string;
  displayName: string;
  seed: number;
  score: number;
  rank: number;
}

export const DEFAULT_TOURNAMENT_SCORE_BY_RANK = {
  1: 100,
  2: 70,
  3: 45,
  4: 30,
  5: 15,
  6: 5,
} as const satisfies TournamentScoreByRank;

export function scoreTournamentStandings(
  standings: ReadonlyArray<TournamentStanding>,
  scoreByRank: TournamentScoreByRank = DEFAULT_TOURNAMENT_SCORE_BY_RANK,
): TournamentRoundScore[] {
  return standings
    .map(function mapItem(standing) {
      return {
        playerId: standing.playerId,
        displayName: standing.displayName,
        seed: standing.seed,
        rank: standing.rank,
        score: normalizeScore(scoreByRank[standing.rank]),
      };
    })
    .sort(compareRankThenSeed);
}

export function accumulateTournamentScores(
  previousScores: TournamentScoreByPlayerId,
  roundScores: ReadonlyArray<TournamentRoundScore>,
): Record<string, number> {
  const cumulativeScores = new Map<string, number>();
  for (const [playerId, score] of Object.entries(previousScores)) {
    cumulativeScores.set(playerId, normalizeScore(score));
  }
  for (const roundScore of roundScores) {
    cumulativeScores.set(
      roundScore.playerId,
      (cumulativeScores.get(roundScore.playerId) ?? 0) + normalizeScore(roundScore.score),
    );
  }
  return Object.fromEntries(cumulativeScores);
}

export function rankCumulativeTournamentScores(
  cumulativeScores: TournamentScoreByPlayerId,
  participants: ReadonlyArray<TournamentParticipant>,
): CumulativeTournamentScoreRank[] {
  const ranked = participants
    .map(function mapItem(participant) {
      return {
        playerId: participant.playerId,
        displayName: participant.displayName,
        seed: participant.seed,
        score: normalizeScore(cumulativeScores[participant.playerId]),
        rank: 0,
      };
    })
    .sort(function compareItems(left, right) {
      return right.score - left.score || left.seed - right.seed;
    });

  return ranked.map(function mapItem(row, index) {
    const previous = ranked[index - 1];
    row.rank = previous && previous.score === row.score ? previous.rank : index + 1;
    return row;
  });
}

function normalizeScore(score: number | null | undefined): number {
  return typeof score === "number" && Number.isFinite(score) && score >= 0 ? score : 0;
}

function compareRankThenSeed(left: TournamentRoundScore, right: TournamentRoundScore): number {
  return left.rank - right.rank || left.seed - right.seed;
}
