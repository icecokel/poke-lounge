export interface MoveReplacementConfirmation {
  index: number;
  oldMoveId: number;
  newMoveId: number;
}

export interface MoveLearningSummary {
  pokemonName: string;
  newMoveName: string;
  newMovePp?: number;
  newMoveMaxPp?: number;
  newMoveType?: string;
  confirmationIndex?: number | null;
}

export interface MoveLearningChoice {
  index: number;
  name: string;
  pp?: number;
  maxPp?: number;
  type?: string;
  selected?: boolean;
}
