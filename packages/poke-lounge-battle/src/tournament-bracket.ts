export const TOURNAMENT_MIN_PARTICIPANT_COUNT = 2;
export const TOURNAMENT_MAX_PARTICIPANT_COUNT = 6;

export type TournamentStatus = "in-progress" | "completed";
export type TournamentMatchStatus = "ready" | "completed";
export type TournamentMatchResultReason = "faint" | "timeout" | "forfeit" | "run" | "capture";

export interface TournamentParticipantInput {
  playerId: string;
  displayName: string;
}

export interface TournamentParticipant extends TournamentParticipantInput {
  seed: number;
}

export interface TournamentMatch {
  matchId: string;
  roundNumber: number;
  matchNumber: number;
  participantA: TournamentParticipant;
  participantB: TournamentParticipant;
  participantIds: [string, string];
  status: TournamentMatchStatus;
  winnerPlayerId: string | null;
  loserPlayerId: string | null;
  resultReason: TournamentMatchResultReason | null;
  completedAtMs: number | null;
}

export interface TournamentBye {
  byeId: string;
  roundNumber: number;
  slotNumber: number;
  entrant: TournamentParticipant;
}

export type TournamentRoundSlot =
  { kind: "match"; matchId: string } | { kind: "bye"; byeId: string };

export interface TournamentRound {
  roundNumber: number;
  matches: TournamentMatch[];
  byes: TournamentBye[];
  slots: TournamentRoundSlot[];
}

export interface TournamentElimination {
  playerId: string;
  displayName: string;
  seed: number;
  roundNumber: number;
  matchId: string;
  order: number;
}

export interface TournamentBracketState {
  version: 1;
  gameRoundIndex: number;
  status: TournamentStatus;
  participants: TournamentParticipant[];
  currentRound: TournamentRound | null;
  completedRounds: TournamentRound[];
  eliminations: TournamentElimination[];
  championPlayerId: string | null;
}

export interface TournamentStanding {
  playerId: string;
  displayName: string;
  seed: number;
  rank: number;
  champion: boolean;
  eliminatedRoundNumber: number | null;
}

export function createTournamentBracketState(
  participantInputs: ReadonlyArray<TournamentParticipantInput>,
  gameRoundIndex = 1,
): TournamentBracketState {
  const participants = normalizeTournamentParticipants(participantInputs);
  const normalizedGameRoundIndex = normalizePositiveInteger(gameRoundIndex, "game round index");

  return {
    version: 1,
    gameRoundIndex: normalizedGameRoundIndex,
    status: "in-progress",
    participants,
    currentRound: createTournamentRound(
      normalizedGameRoundIndex,
      1,
      createOpeningRoundEntrants(participants),
    ),
    completedRounds: [],
    eliminations: [],
    championPlayerId: null,
  };
}

export function recordTournamentMatchResult(
  state: TournamentBracketState,
  matchId: string,
  winnerPlayerId: string,
  result?: {
    reason?: TournamentMatchResultReason;
    completedAtMs?: number;
  },
): TournamentBracketState {
  if (state.status === "completed") {
    throw new Error("Tournament is already completed.");
  }
  if (!state.currentRound) {
    throw new Error("Tournament has no active round.");
  }

  const match = state.currentRound.matches.find(function findItem(candidate) {
    return candidate.matchId === matchId;
  });
  if (!match) {
    throw new Error(`Unknown tournament match: ${matchId}`);
  }
  if (match.status === "completed") {
    throw new Error(`Tournament match is already completed: ${matchId}`);
  }

  const loser = getMatchLoser(match, winnerPlayerId);
  const completedMatch: TournamentMatch = {
    ...match,
    status: "completed",
    winnerPlayerId,
    loserPlayerId: loser.playerId,
    resultReason: result?.reason ?? null,
    completedAtMs: result?.completedAtMs ?? null,
  };
  const currentRound: TournamentRound = {
    ...state.currentRound,
    matches: state.currentRound.matches.map(function mapItem(candidate) {
      return candidate.matchId === matchId ? completedMatch : candidate;
    }),
  };
  const updatedState: TournamentBracketState = {
    ...state,
    currentRound,
    eliminations: [
      ...state.eliminations,
      {
        playerId: loser.playerId,
        displayName: loser.displayName,
        seed: loser.seed,
        roundNumber: currentRound.roundNumber,
        matchId,
        order: state.eliminations.length + 1,
      },
    ],
  };

  if (
    currentRound.matches.some(function testItem(candidate) {
      return candidate.status !== "completed";
    })
  ) {
    return updatedState;
  }

  return advanceTournamentRound(updatedState, currentRound);
}

export function getReadyTournamentMatches(state: TournamentBracketState): TournamentMatch[] {
  return (
    state.currentRound?.matches.filter(function filterItem(match) {
      return match.status === "ready";
    }) ?? []
  );
}

export function getTournamentStandings(state: TournamentBracketState): TournamentStanding[] {
  if (state.status !== "completed" || !state.championPlayerId) {
    return [];
  }

  const champion = getParticipantById(state.participants, state.championPlayerId);
  const standings: TournamentStanding[] = [
    {
      ...champion,
      rank: 1,
      champion: true,
      eliminatedRoundNumber: null,
    },
  ];
  const eliminatedRoundNumbers = Array.from(
    new Set(
      state.eliminations.map(function mapItem(elimination) {
        return elimination.roundNumber;
      }),
    ),
  ).sort(function compareItems(left, right) {
    return right - left;
  });

  for (const roundNumber of eliminatedRoundNumbers) {
    const rank = standings.length + 1;
    const eliminations = state.eliminations
      .filter(function filterItem(elimination) {
        return elimination.roundNumber === roundNumber;
      })
      .sort(function compareItems(left, right) {
        return left.order - right.order;
      });

    standings.push(
      ...eliminations.map(function mapItem(elimination) {
        return {
          playerId: elimination.playerId,
          displayName: elimination.displayName,
          seed: elimination.seed,
          rank,
          champion: false,
          eliminatedRoundNumber: elimination.roundNumber,
        };
      }),
    );
  }

  return standings;
}

function advanceTournamentRound(
  state: TournamentBracketState,
  completedRound: TournamentRound,
): TournamentBracketState {
  const entrants = completedRound.slots.map(function mapItem(slot) {
    return slot.kind === "bye"
      ? getByeEntrant(completedRound, slot.byeId)
      : getMatchWinner(state.participants, completedRound, slot.matchId);
  });
  const completedRounds = [...state.completedRounds, completedRound];

  if (entrants.length === 1) {
    return {
      ...state,
      status: "completed",
      currentRound: null,
      completedRounds,
      championPlayerId: entrants[0].playerId,
    };
  }

  return {
    ...state,
    currentRound: createTournamentRound(
      state.gameRoundIndex,
      completedRound.roundNumber + 1,
      entrants,
    ),
    completedRounds,
  };
}

function createTournamentRound(
  gameRoundIndex: number,
  roundNumber: number,
  entrants: ReadonlyArray<TournamentParticipant | null>,
): TournamentRound {
  const matches: TournamentMatch[] = [];
  const byes: TournamentBye[] = [];
  const slots: TournamentRoundSlot[] = [];

  for (let index = 0; index < entrants.length; index += 2) {
    const participantA = entrants[index] ?? null;
    const participantB = entrants[index + 1] ?? null;
    const slotNumber = slots.length + 1;

    if (participantA && participantB) {
      const matchNumber = matches.length + 1;
      const matchId = createMatchId(gameRoundIndex, roundNumber, matchNumber);
      matches.push({
        matchId,
        roundNumber,
        matchNumber,
        participantA,
        participantB,
        participantIds: [participantA.playerId, participantB.playerId],
        status: "ready",
        winnerPlayerId: null,
        loserPlayerId: null,
        resultReason: null,
        completedAtMs: null,
      });
      slots.push({ kind: "match", matchId });
      continue;
    }

    const byeEntrant = participantA ?? participantB;
    if (!byeEntrant) {
      throw new Error(`Tournament round ${roundNumber} has an empty bracket slot.`);
    }

    const byeId = createByeId(gameRoundIndex, roundNumber, byes.length + 1);
    byes.push({
      byeId,
      roundNumber,
      slotNumber,
      entrant: byeEntrant,
    });
    slots.push({ kind: "bye", byeId });
  }

  return { roundNumber, matches, byes, slots };
}

function createOpeningRoundEntrants(
  participants: ReadonlyArray<TournamentParticipant>,
): Array<TournamentParticipant | null> {
  return getBracketSeedOrder(participants.length).map(function mapItem(seed) {
    return participants[seed - 1] ?? null;
  });
}

function getBracketSeedOrder(participantCount: number): readonly number[] {
  if (participantCount <= 2) return [1, 2];
  if (participantCount <= 4) return [1, 4, 2, 3];
  return [1, 8, 4, 5, 3, 6, 2, 7];
}

function normalizeTournamentParticipants(
  inputs: ReadonlyArray<TournamentParticipantInput>,
): TournamentParticipant[] {
  if (
    inputs.length < TOURNAMENT_MIN_PARTICIPANT_COUNT ||
    inputs.length > TOURNAMENT_MAX_PARTICIPANT_COUNT
  ) {
    throw new RangeError(
      `Tournament participant count must be between ${TOURNAMENT_MIN_PARTICIPANT_COUNT} and ${TOURNAMENT_MAX_PARTICIPANT_COUNT}: ${inputs.length}`,
    );
  }

  const playerIds = new Set<string>();
  return inputs.map(function mapItem(input, index) {
    const playerId = input.playerId.trim();
    if (!playerId) {
      throw new Error(`Tournament participant ${index + 1} has an empty player id.`);
    }
    if (playerIds.has(playerId)) {
      throw new Error(`Duplicate tournament participant: ${playerId}`);
    }
    playerIds.add(playerId);
    return {
      playerId,
      displayName: input.displayName.trim() || playerId,
      seed: index + 1,
    };
  });
}

function getMatchLoser(match: TournamentMatch, winnerPlayerId: string): TournamentParticipant {
  if (match.participantA.playerId === winnerPlayerId) return match.participantB;
  if (match.participantB.playerId === winnerPlayerId) return match.participantA;
  throw new Error(`Winner must belong to tournament match ${match.matchId}: ${winnerPlayerId}`);
}

function getMatchWinner(
  participants: ReadonlyArray<TournamentParticipant>,
  round: TournamentRound,
  matchId: string,
): TournamentParticipant {
  const match = round.matches.find(function findItem(candidate) {
    return candidate.matchId === matchId;
  });
  if (!match?.winnerPlayerId) {
    throw new Error(`Tournament match has no winner: ${matchId}`);
  }
  return getParticipantById(participants, match.winnerPlayerId);
}

function getByeEntrant(round: TournamentRound, byeId: string): TournamentParticipant {
  const bye = round.byes.find(function findItem(candidate) {
    return candidate.byeId === byeId;
  });
  if (!bye) throw new Error(`Unknown tournament bye: ${byeId}`);
  return bye.entrant;
}

function getParticipantById(
  participants: ReadonlyArray<TournamentParticipant>,
  playerId: string,
): TournamentParticipant {
  const participant = participants.find(function findItem(candidate) {
    return candidate.playerId === playerId;
  });
  if (!participant) throw new Error(`Unknown tournament participant: ${playerId}`);
  return participant;
}

function createMatchId(gameRoundIndex: number, roundNumber: number, matchNumber: number): string {
  return `game-round-${gameRoundIndex}-bracket-${roundNumber}-match-${matchNumber}`;
}

function createByeId(gameRoundIndex: number, roundNumber: number, byeNumber: number): string {
  return `game-round-${gameRoundIndex}-bracket-${roundNumber}-bye-${byeNumber}`;
}

function normalizePositiveInteger(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError(`${label} must be a positive integer: ${value}`);
  }
  return value;
}
