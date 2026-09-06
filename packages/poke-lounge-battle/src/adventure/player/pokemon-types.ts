import type { Gen4Traits } from "../../gen4/types";
import type { PokemonGender } from "../battle/pokemon-gender";
import type { PokemonIndividualValues } from "../battle/individual-values";

export interface PlayerPokemon extends Gen4Traits {
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

export type PlayerPokemonStatus = import("../../gen4/types").Gen4Status;

export interface PlayerPokemonMove {
  id: number;
  name: string;
  pp: number;
  maxPp: number;
}
