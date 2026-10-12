export interface MoveReplacementConfirmation {
  index: number;
  oldMoveId: number;
  newMoveId: number;
}

export interface MoveLearningSummary {
  remainingSeconds?: number;
  pokemonName: string;
  newMoveId?: number;
  newMoveName: string;
  newMovePp?: number;
  newMoveMaxPp?: number;
  newMoveType?: string;
  confirmationIndex?: number | null;
}

export interface MoveLearningChoice {
  id: number;
  index: number;
  name: string;
  pp?: number;
  maxPp?: number;
  type?: string;
  selected?: boolean;
}
