import { COMPETITIVE_SPECIES_CATALOG } from "./competitive-catalog.generated";
import { getRuntimePokemonData } from "./adventure/data/game-data-json";
import { normalizePokemonEvolutionTable } from "./adventure/battle/pokemon-evolution";
import { createSeededRandom } from "./prng";

export const STARTER_MODES = ["classic", "random"] as const;
export type StarterMode = (typeof STARTER_MODES)[number];
export interface StarterSelection {
  mode: StarterMode;
  seed: string;
}
export const STARTER_SPECIES_IDS = [1, 4, 7, 152, 155, 158] as const;

const LEGENDARY_SPECIES_IDS = new Set([
  144, 145, 146, 150, 151, 243, 244, 245, 249, 250, 251, 377, 378, 379, 380, 381, 382, 383, 384,
  385, 386, 480, 481, 482, 483, 484, 485, 486, 487, 488, 489, 490, 491, 492, 493,
]);

export function isStarterMode(value: unknown): value is StarterMode {
  return STARTER_MODES.some(mode => mode === value);
}

export function getStarterSpeciesIds({ mode, seed }: StarterSelection): number[] {
  if (mode === "classic") return [...STARTER_SPECIES_IDS];
  const data = getRuntimePokemonData();
  if (!data) throw new Error("Starter selection requires runtime Pokémon data");
  const evolved = new Set(
    Object.values(normalizePokemonEvolutionTable(data)).flatMap(rules =>
      rules.map(rule => rule.targetSpeciesId),
    ),
  );
  const pool = Object.values(COMPETITIVE_SPECIES_CATALOG)
    .filter(
      species => !evolved.has(species.speciesId) && !LEGENDARY_SPECIES_IDS.has(species.speciesId),
    )
    .sort((a, b) => a.speciesId - b.speciesId);
  const random = createSeededRandom(`starter:${seed}`);
  const selected: number[] = [];
  for (let index = 0; index < 3; index++) {
    const [species] = pool.splice(Math.floor(random.next() * pool.length), 1);
    if (!species) throw new Error("Starter candidate pool is empty");
    selected.push(species.speciesId);
  }
  return selected;
}
