import type { LeagueGrowthData } from "./data";

export function levelUpEvolutionChain(
  data: LeagueGrowthData,
  fromSpecies: number,
  toSpecies: number,
  level: number,
): number[] | null {
  const queue = [{ path: [fromSpecies], threshold: 0 }];
  let best: { path: number[]; threshold: number } | undefined;
  while (queue.length) {
    const current = queue.shift()!;
    const species = current.path[current.path.length - 1]!;
    if (species === toSpecies && (!best || current.threshold < best.threshold)) best = current;
    if (current.path.length > 3) continue;
    for (const evolution of data.species[species]?.evolutions ?? []) {
      if (
        evolution.method !== 4 ||
        evolution.parameter > level ||
        current.path.includes(evolution.targetSpeciesId)
      )
        continue;
      queue.push({
        path: [...current.path, evolution.targetSpeciesId],
        threshold: Math.max(current.threshold, evolution.parameter),
      });
    }
  }
  return best?.path ?? null;
}
