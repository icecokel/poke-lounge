import type { PokemonGender } from "../battle/pokemon-gender";
import type { PokemonIndividualValues } from "../battle/individual-values";

export interface PlayerPokemon {
  speciesId: number;
  name: string;
  level: number;
  gender?: PokemonGender;
  maxHp?: number;
  currentHp?: number;
  attack?: number;
  defense?: number;
  speed?: number;
  experience?: number;
  growthRate?: number;
  status?: PlayerPokemonStatus;
  individualValues?: PokemonIndividualValues;
  moves?: PlayerPokemonMove[];
}

export type PlayerPokemonStatus = "normal" | "poisoned" | "burned" | "paralyzed" | "fainted";

export interface PlayerPokemonMove {
  id: number;
  name: string;
  pp: number;
  maxPp: number;
}
