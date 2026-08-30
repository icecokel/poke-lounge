import {
  createTournamentBracketState,
  getReadyTournamentMatches,
  getTournamentStandings,
  recordTournamentMatchResult,
  TOURNAMENT_MAX_PARTICIPANT_COUNT,
  TOURNAMENT_MIN_PARTICIPANT_COUNT,
  type TournamentBracketState,
  type TournamentParticipantInput,
} from "@poke-lounge/battle";

export {
  getReadyTournamentMatches,
  getTournamentStandings,
  recordTournamentMatchResult,
  TOURNAMENT_MAX_PARTICIPANT_COUNT,
  TOURNAMENT_MIN_PARTICIPANT_COUNT,
};

export type {
  TournamentBye,
  TournamentElimination,
  TournamentMatch,
  TournamentMatchResultReason,
  TournamentMatchStatus,
  TournamentParticipant,
  TournamentParticipantInput,
  TournamentRound,
  TournamentRoundSlot,
  TournamentStanding,
  TournamentStatus,
} from "@poke-lounge/battle";

export type TournamentState = TournamentBracketState;

export function createTournamentState(
  participantInputs: ReadonlyArray<TournamentParticipantInput>,
  gameRoundIndex = 1,
): TournamentState {
  return createTournamentBracketState(participantInputs, gameRoundIndex);
}
