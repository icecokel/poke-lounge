import {
  createTournamentBracketState,
  type TournamentBracketState,
  type TournamentParticipantInput,
} from "@poke-lounge/battle/tournament-bracket";

export type TournamentState = TournamentBracketState;

export function createTournamentState(
  participantInputs: ReadonlyArray<TournamentParticipantInput>,
  gameRoundIndex = 1,
): TournamentState {
  return createTournamentBracketState(participantInputs, gameRoundIndex);
}
