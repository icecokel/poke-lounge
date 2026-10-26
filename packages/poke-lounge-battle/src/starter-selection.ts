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
export const STARTER_LEVEL = 10;
export const RANDOM_STARTER_VISIBLE_COUNT = 5;
/** Choosing the hidden candidate is a gamble, so it starts a few levels ahead. */
export const MYSTERY_STARTER_LEVEL_BONUS = 5;

const LEGENDARY_SPECIES_IDS = new Set([
  144, 145, 146, 150, 151, 243, 244, 245, 249, 250, 251, 377, 378, 379, 380, 381, 382, 383, 384,
  385, 386, 480, 481, 482, 483, 484, 485, 486, 487, 488, 489, 490, 491, 492, 493,
]);

export function isStarterMode(value: unknown): value is StarterMode {
  return STARTER_MODES.some(mode => mode === value);
}

/**
 * Random mode returns RANDOM_STARTER_VISIBLE_COUNT unevolved candidates followed
 * by one mystery candidate drawn from every evolution stage. The UI hides the
 * species of every candidate at or after RANDOM_STARTER_VISIBLE_COUNT.
 */
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
    .filter(species => !LEGENDARY_SPECIES_IDS.has(species.speciesId))
    .sort((a, b) => a.speciesId - b.speciesId);
  const unevolved = pool.filter(species => !evolved.has(species.speciesId));
  const random = createSeededRandom(`starter:${seed}`);
  const selected: number[] = [];
  const draw = (candidates: typeof pool) => {
    const species = candidates[Math.floor(random.next() * candidates.length)];
    if (!species) throw new Error("Starter candidate pool is empty");
    selected.push(species.speciesId);
  };
  for (let index = 0; index < RANDOM_STARTER_VISIBLE_COUNT; index++) {
    draw(unevolved.filter(species => !selected.includes(species.speciesId)));
  }
  draw(pool.filter(species => !selected.includes(species.speciesId)));
  return selected;
}

export function isHiddenStarterCandidate(selection: StarterSelection, index: number): boolean {
  return selection.mode !== "classic" && index >= RANDOM_STARTER_VISIBLE_COUNT;
}

export function getStarterLevel(
  selection: StarterSelection | null | undefined,
  speciesId: number,
): number {
  if (!selection) return STARTER_LEVEL;
  const index = getStarterSpeciesIds(selection).indexOf(speciesId);
  return index >= 0 && isHiddenStarterCandidate(selection, index)
    ? STARTER_LEVEL + MYSTERY_STARTER_LEVEL_BONUS
    : STARTER_LEVEL;
}
