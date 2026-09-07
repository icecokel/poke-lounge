import type { LocalPlayersSaveState } from "./game-state";
export interface PokeLoungeSaveSnapshot {
  version: 1;
  game: "poke-lounge";
  state: LocalPlayersSaveState;
}
