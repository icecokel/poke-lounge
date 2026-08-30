import {
  createTournamentState,
  getReadyTournamentMatches,
  getTournamentStandings,
  recordTournamentMatchResult,
  type TournamentMatch,
  type TournamentParticipantInput,
  type TournamentStanding,
  type TournamentState,
} from "./tournamentState";

export type TournamentSession = {
  roundIndex: number;
  status: "in-progress" | "completed";
  tournament: TournamentState;
  completedAtMs: number | null;
};

export function createTournamentSession({
  roundIndex,
  participants,
}: {
  roundIndex: number;
  participants: ReadonlyArray<TournamentParticipantInput>;
}): TournamentSession {
  if (!Number.isInteger(roundIndex) || roundIndex < 1) {
    throw new RangeError(
      `Tournament session round index must be a positive integer: ${roundIndex}`,
    );
  }

  return {
    roundIndex,
    status: "in-progress",
    tournament: createTournamentState(participants, roundIndex),
    completedAtMs: null,
  };
}

export function getCurrentTournamentMatch(session: TournamentSession): TournamentMatch | null {
  return getReadyTournamentMatches(session.tournament)[0] ?? null;
}

export function recordTournamentSessionMatchResult(
  session: TournamentSession,
  matchId: string,
  winnerPlayerId: string,
  nowMs: number,
): TournamentSession {
  const tournament = recordTournamentMatchResult(session.tournament, matchId, winnerPlayerId);

  if (tournament.status === "completed") {
    return {
      ...session,
      status: "completed",
      tournament,
      completedAtMs: normalizeTimestampMs(nowMs),
    };
  }

  return {
    ...session,
    status: "in-progress",
    tournament,
    completedAtMs: null,
  };
}

export function getTournamentSessionStandings(session: TournamentSession): TournamentStanding[] {
  if (session.status !== "completed") {
    return [];
  }

  return getTournamentStandings(session.tournament);
}

function normalizeTimestampMs(nowMs: number): number {
  return Math.max(0, Math.trunc(Number.isFinite(nowMs) ? nowMs : 0));
}
