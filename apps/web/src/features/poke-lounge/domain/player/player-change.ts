import type { LocalPlayerState } from "../../contracts/game-state";
/** A domain operation proposes a state change; storage/notification happen only at the boundary. */
export interface PlayerChange<Result> {
  player: LocalPlayerState;
  changed: boolean;
  result: Result;
}
