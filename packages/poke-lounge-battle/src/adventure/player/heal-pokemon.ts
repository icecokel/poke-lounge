import type { PlayerPokemon } from "./pokemon-types";

export function healPokemon<T extends PlayerPokemon>(pokemon: T): T {
  return {
    ...pokemon,
    ...(typeof pokemon.maxHp === "number" && Number.isFinite(pokemon.maxHp)
      ? { currentHp: Math.max(0, Math.floor(pokemon.maxHp)) }
      : {}),
    status: "normal",
    ...(pokemon.moves ? { moves: pokemon.moves.map(move => ({ ...move, pp: move.maxPp })) } : {}),
  };
}
