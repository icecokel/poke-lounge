import {
  createTournamentState,
  type TournamentMatch,
  type TournamentParticipantInput,
} from "../tournament/tournamentState";
import type { TournamentSession } from "../tournament/tournamentSession";
import {
  normalizeTournamentRoomPayload,
  type RoundScoreUpdatedRoomPayload,
  type TournamentCompletedRoomPayload,
  type TournamentMatchResultRoomPayload,
  type TournamentStartedRoomPayload,
} from "./tournamentRoomProtocol";

export interface TournamentAuthorityParticipant {
  playerId: string;
  displayName?: string | null;
  canBattle?: boolean;
}

export interface TournamentAuthorityRoster {
  hostPlayerId: string;
  participants: TournamentParticipantInput[];
}

export type TournamentAuthorityStanding = {
  playerId: string;
  rank: number;
  score: number;
};

export function createTournamentAuthorityRoster(
  participants: ReadonlyArray<TournamentAuthorityParticipant>,
): TournamentAuthorityRoster | null {
  const participantsById = new Map<string, TournamentParticipantInput>();

  for (const participant of participants) {
    if (participant.canBattle === false) {
      continue;
    }

    const playerId = normalizeId(participant.playerId);

    if (!playerId || participantsById.has(playerId)) {
      continue;
    }

    participantsById.set(playerId, {
      playerId,
      displayName: normalizeDisplayName(participant.displayName, playerId),
    });
  }

  const normalizedParticipants = Array.from(participantsById.values()).sort(comparePlayerId);

  if (normalizedParticipants.length < 2 || normalizedParticipants.length > 6) {
    return null;
  }

  return {
    hostPlayerId: normalizedParticipants[0].playerId,
    participants: normalizedParticipants,
  };
}

export function createTournamentStartedAuthorityPayload({
  roundIndex,
  participants,
}: {
  roundIndex: number;
  participants: ReadonlyArray<TournamentAuthorityParticipant>;
}): TournamentStartedRoomPayload | null {
  const roster = createTournamentAuthorityRoster(participants);

  if (!roster) {
    return null;
  }

  const tournament = createTournamentState(roster.participants, roundIndex);

  return normalizeTournamentRoomPayload("TOURNAMENT_STARTED", {
    roundIndex,
    hostPlayerId: roster.hostPlayerId,
    participantIds: roster.participants.map(participant => participant.playerId),
    matchIds: tournament.currentRound?.matches.map(match => match.matchId) ?? [],
  });
}

export function canApplyTournamentStartedAuthorityPayload(
  payload: TournamentStartedRoomPayload | null | undefined,
  context: {
    roundIndex: number;
    participants: ReadonlyArray<TournamentAuthorityParticipant>;
  },
): boolean {
  const normalizedPayload = normalizeTournamentRoomPayload("TOURNAMENT_STARTED", payload);
  const expectedPayload = createTournamentStartedAuthorityPayload(context);

  return (
    Boolean(normalizedPayload?.hostPlayerId) &&
    Boolean(expectedPayload) &&
    normalizedPayload?.roundIndex === expectedPayload?.roundIndex &&
    normalizedPayload?.hostPlayerId === expectedPayload?.hostPlayerId &&
    sameStringArray(normalizedPayload?.participantIds, expectedPayload?.participantIds) &&
    sameStringArray(normalizedPayload?.matchIds, expectedPayload?.matchIds)
  );
}

export function createTournamentMatchResultAuthorityPayload({
  hostPlayerId,
  session,
  matchId,
  winnerPlayerId,
  reason,
}: {
  hostPlayerId: string;
  session: TournamentSession;
  matchId: string;
  winnerPlayerId: string;
  reason: TournamentMatchResultRoomPayload["reason"];
}): TournamentMatchResultRoomPayload | null {
  const normalizedHostPlayerId = normalizeId(hostPlayerId);
  const normalizedWinnerPlayerId = normalizeId(winnerPlayerId);
  const match = findReadyTournamentMatch(session, matchId);

  if (
    !normalizedHostPlayerId ||
    !normalizedWinnerPlayerId ||
    !isTournamentParticipant(session, normalizedHostPlayerId) ||
    !match ||
    !isMatchParticipant(match, normalizedWinnerPlayerId)
  ) {
    return null;
  }

  return normalizeTournamentRoomPayload("TOURNAMENT_MATCH_RESULT", {
    roundIndex: session.roundIndex,
    hostPlayerId: normalizedHostPlayerId,
    matchId: match.matchId,
    winnerPlayerId: normalizedWinnerPlayerId,
    reason,
  });
}

export function canApplyTournamentMatchResultAuthorityPayload(
  payload: TournamentMatchResultRoomPayload | null | undefined,
  context: {
    hostPlayerId: string;
    session: TournamentSession;
  },
): boolean {
  const normalizedPayload = normalizeTournamentRoomPayload("TOURNAMENT_MATCH_RESULT", payload);

  if (
    !normalizedPayload?.hostPlayerId ||
    normalizedPayload.hostPlayerId !== context.hostPlayerId ||
    normalizedPayload.roundIndex !== context.session.roundIndex
  ) {
    return false;
  }

  const match = findReadyTournamentMatch(context.session, normalizedPayload.matchId);

  return Boolean(match && isMatchParticipant(match, normalizedPayload.winnerPlayerId));
}

export function createTournamentCompletedAuthorityPayload({
  hostPlayerId,
  session,
  standings,
}: {
  hostPlayerId: string;
  session: TournamentSession;
  standings: ReadonlyArray<TournamentAuthorityStanding>;
}): TournamentCompletedRoomPayload | null {
  const normalizedHostPlayerId = normalizeId(hostPlayerId);

  if (
    !normalizedHostPlayerId ||
    !isTournamentParticipant(session, normalizedHostPlayerId) ||
    session.status !== "completed" ||
    !session.tournament.championPlayerId ||
    !standingsCoverTournamentParticipants(standings, session)
  ) {
    return null;
  }

  return normalizeTournamentRoomPayload("TOURNAMENT_COMPLETED", {
    roundIndex: session.roundIndex,
    hostPlayerId: normalizedHostPlayerId,
    championPlayerId: session.tournament.championPlayerId,
    standings,
  });
}

export function canApplyTournamentCompletedAuthorityPayload(
  payload: TournamentCompletedRoomPayload | null | undefined,
  context: {
    hostPlayerId: string;
    session: TournamentSession;
    standings?: ReadonlyArray<TournamentAuthorityStanding>;
  },
): boolean {
  const normalizedPayload = normalizeTournamentRoomPayload("TOURNAMENT_COMPLETED", payload);

  if (
    !normalizedPayload?.hostPlayerId ||
    normalizedPayload.hostPlayerId !== context.hostPlayerId ||
    context.session.status !== "completed" ||
    normalizedPayload.roundIndex !== context.session.roundIndex ||
    normalizedPayload.championPlayerId !== context.session.tournament.championPlayerId ||
    !standingsCoverTournamentParticipants(normalizedPayload.standings, context.session)
  ) {
    return false;
  }

  return context.standings ? sameStandings(normalizedPayload.standings, context.standings) : true;
}

export function createRoundScoreUpdatedAuthorityPayloads({
  roundIndex,
  hostPlayerId,
  standings,
}: {
  roundIndex: number;
  hostPlayerId: string;
  standings: ReadonlyArray<TournamentAuthorityStanding>;
}): RoundScoreUpdatedRoomPayload[] {
  const normalizedHostPlayerId = normalizeId(hostPlayerId);

  if (!normalizedHostPlayerId) {
    return [];
  }

  const payloads: RoundScoreUpdatedRoomPayload[] = [];

  for (const standing of standings) {
    const payload = normalizeTournamentRoomPayload("ROUND_SCORE_UPDATED", {
      roundIndex,
      hostPlayerId: normalizedHostPlayerId,
      playerId: standing.playerId,
      rank: standing.rank,
      score: standing.score,
    });

    if (!payload) {
      return [];
    }

    payloads.push(payload);
  }

  return payloads;
}

export function canApplyRoundScoreUpdatedAuthorityPayload(
  payload: RoundScoreUpdatedRoomPayload | null | undefined,
  context: {
    roundIndex: number;
    hostPlayerId: string;
    participantIds: ReadonlyArray<string>;
    standings?: ReadonlyArray<TournamentAuthorityStanding>;
  },
): boolean {
  const normalizedPayload = normalizeTournamentRoomPayload("ROUND_SCORE_UPDATED", payload);

  if (
    !normalizedPayload?.hostPlayerId ||
    normalizedPayload.hostPlayerId !== context.hostPlayerId ||
    normalizedPayload.roundIndex !== context.roundIndex ||
    !context.participantIds.includes(normalizedPayload.playerId)
  ) {
    return false;
  }

  if (!context.standings) {
    return true;
  }

  const expectedStanding = context.standings.find(
    standing => standing.playerId === normalizedPayload.playerId,
  );

  return Boolean(
    expectedStanding &&
    expectedStanding.rank === normalizedPayload.rank &&
    expectedStanding.score === normalizedPayload.score,
  );
}

function findReadyTournamentMatch(
  session: TournamentSession,
  matchId: string,
): TournamentMatch | null {
  if (session.status !== "in-progress") {
    return null;
  }

  const normalizedMatchId = normalizeId(matchId);

  if (!normalizedMatchId) {
    return null;
  }

  return (
    session.tournament.currentRound?.matches.find(
      match => match.matchId === normalizedMatchId && match.status === "ready",
    ) ?? null
  );
}

function isTournamentParticipant(session: TournamentSession, playerId: string): boolean {
  return session.tournament.participants.some(participant => participant.playerId === playerId);
}

function isMatchParticipant(match: TournamentMatch, playerId: string): boolean {
  return match.participantA.playerId === playerId || match.participantB.playerId === playerId;
}

function standingsCoverTournamentParticipants(
  standings: ReadonlyArray<TournamentAuthorityStanding>,
  session: TournamentSession,
): boolean {
  const expectedParticipantIds = session.tournament.participants.map(
    participant => participant.playerId,
  );
  const standingPlayerIds = standings.map(standing => standing.playerId);

  return sameStringSet(expectedParticipantIds, standingPlayerIds);
}

function sameStandings(
  left: ReadonlyArray<TournamentAuthorityStanding>,
  right: ReadonlyArray<TournamentAuthorityStanding>,
): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return left.every(leftStanding =>
    right.some(
      rightStanding =>
        rightStanding.playerId === leftStanding.playerId &&
        rightStanding.rank === leftStanding.rank &&
        rightStanding.score === leftStanding.score,
    ),
  );
}

function sameStringArray(
  left: ReadonlyArray<string> | null | undefined,
  right: ReadonlyArray<string> | null | undefined,
): boolean {
  if (!left || !right || left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
}

function sameStringSet(left: ReadonlyArray<string>, right: ReadonlyArray<string>): boolean {
  if (left.length !== right.length) {
    return false;
  }

  const rightValues = new Set(right);

  return left.every(value => rightValues.has(value));
}

function comparePlayerId(
  left: TournamentParticipantInput,
  right: TournamentParticipantInput,
): number {
  return left.playerId.localeCompare(right.playerId, undefined, { numeric: true });
}

function normalizeId(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const id = value.trim();

  return id.length > 0 ? id : null;
}

function normalizeDisplayName(value: string | null | undefined, fallback: string): string {
  const displayName = typeof value === "string" ? value.trim() : "";

  return displayName || fallback;
}
