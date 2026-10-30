import type { LeagueMintResult, LeagueGrowthJudgeOp } from "./contract";
import type { LeagueGrowthData } from "./data";
import { LeaguePlausibilityError } from "../plausibility";
import { growthMsPerLevel } from "./plausibility";

export function mintLeagueMon(
  op: Extract<LeagueGrowthJudgeOp, { kind: "mint" }>,
  data: LeagueGrowthData,
): LeagueMintResult {
  const species = data.species[op.speciesId];
  const reasons: string[] = [];
  if (!species || (op.origin === "capture" && !species.encounterable)) reasons.push("M1_SPECIES:-");
  if (op.origin === "capture") {
    const hw = Object.values(op.checkpoint.mons).reduce(
      (best, mon) => (mon.level > best.level ? mon : best),
      { level: op.run.starterLevel, atMs: op.run.createdAtMs },
    );
    if (
      op.level >
      Math.min(
        100,
        hw.level +
          5 +
          Math.floor(
            Math.max(0, op.nowMs - hw.atMs) /
              growthMsPerLevel(op.checkpoint.growth.expMultiplierPermille),
          ),
      )
    )
      reasons.push("M2_LEVEL:-");
  }
  if (reasons.length || !species) throw new LeaguePlausibilityError(reasons);
  if (!/^[a-f0-9]{64}$/i.test(op.random)) throw new Error("Invalid mint randomness");
  const b = op.random.match(/../g)!.map(value => parseInt(value, 16));
  const [hp, attack, defense, specialAttack, specialDefense, speed] = b
    .slice(0, 6)
    .map(value => value & 31) as [number, number, number, number, number, number];
  const r = species.genderRatio;
  return {
    speciesId: op.speciesId,
    level: op.level,
    individualValues: { hp, attack, defense, specialAttack, specialDefense, speed },
    natureId: ((b[6]! << 8) | b[7]!) % 25,
    abilityId: species.abilities[species.abilities.length > 1 ? b[8]! & 1 : 0]!,
    gender:
      r === 255
        ? "genderless"
        : r === 254
          ? "female"
          : r === 0
            ? "male"
            : b[9]! < r
              ? "female"
              : "male",
  };
}
