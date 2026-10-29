import type { LeagueMintedMon, LeaguePartyClaim } from "../contract";
import { LeaguePlausibilityError } from "../plausibility";
import {
  LEAGUE_HAPPINESS,
  LEAGUE_GROWTH_GRACE_LEVELS,
  LEAGUE_GROWTH_MS_PER_LEVEL_AT_DEFAULT,
  LEAGUE_DEFAULT_EXP_MULTIPLIER_PERMILLE,
  type LeagueGrowthJudgeOp,
  type LeagueCheckPartyResult,
} from "./contract";
import type { LeagueGrowthData } from "./data";
import { levelUpEvolutionChain } from "./chain";

export function checkLeaguePartyContextFree(
  claim: LeaguePartyClaim,
  mons: readonly LeagueMintedMon[],
  data: LeagueGrowthData,
): string[] {
  const reasons: string[] = [];
  const add = (rule: string, slot: number | string) => reasons.push(`${rule}:${slot}`);
  if (
    claim.version !== 1 ||
    claim.members.length < 1 ||
    claim.members.length > 6 ||
    new Set(claim.members.map(m => m.slotIndex)).size !== claim.members.length ||
    new Set(claim.members.map(m => m.monId)).size !== claim.members.length ||
    !claim.members.some(m => m.slotIndex === claim.leadSlot)
  )
    add("R10_PARTY_SIZE", "-");
  for (const member of claim.members) {
    const slot = member.slotIndex;
    if (!Number.isInteger(slot) || slot < 0 || slot > 5) add("R10_PARTY_SIZE", slot);
    const mon = mons.find(m => m.monId === member.monId);
    if (!mon) {
      add("R1_OWNERSHIP", slot);
      continue;
    }
    const chain = levelUpEvolutionChain(data, mon.speciesId, member.speciesId, member.level);
    if (!chain || !data.species[member.speciesId]) add("R2_SPECIES_CHAIN", slot);
    if (!Number.isInteger(member.level) || member.level < mon.level || member.level > 100)
      add("R3_LEVEL_RANGE", slot);
    const table = data.growthTable[data.species[member.speciesId]?.growthRate ?? -1];
    if (
      !table ||
      !Number.isSafeInteger(member.experience) ||
      member.experience < (table[member.level] ?? Infinity) ||
      (member.level === 100
        ? member.experience !== table[100]
        : member.experience >= (table[member.level + 1] ?? -1))
    )
      add("R4_EXPERIENCE", slot);
    const evs = Object.values(member.effortValues);
    if (
      evs.length !== 6 ||
      evs.some(v => !Number.isInteger(v) || v < 0 || v > 255) ||
      evs.reduce((a, b) => a + b, 0) > 510
    )
      add("R5_EFFORT", slot);
    if (member.happiness !== LEAGUE_HAPPINESS) add("R6_HAPPINESS", slot);
    const allowed = new Set(
      (chain ?? []).flatMap(id => [
        ...(data.levelUpMoves[id] ?? []).filter(m => m.level <= member.level).map(m => m.moveId),
        ...(data.wildMoveSets[id] ?? []),
      ]),
    );
    if (
      member.moveIds.length < 1 ||
      member.moveIds.length > 4 ||
      new Set(member.moveIds).size !== member.moveIds.length ||
      member.moveIds.some(id => !allowed.has(id))
    )
      add("R7_MOVES", slot);
  }
  return reasons.slice(0, 24);
}
export function growthMsPerLevel(multiplier: number): number {
  return (
    (LEAGUE_GROWTH_MS_PER_LEVEL_AT_DEFAULT * LEAGUE_DEFAULT_EXP_MULTIPLIER_PERMILLE) / multiplier
  );
}
export function checkLeagueParty(
  input: Extract<LeagueGrowthJudgeOp, { kind: "check-party" }>,
  data: LeagueGrowthData,
): LeagueCheckPartyResult {
  const reasons = checkLeaguePartyContextFree(input.claim, input.mons, data);
  if (input.purpose === "entry" && input.claim.members.length !== 6)
    reasons.push("R10_PARTY_SIZE:-");
  const checkpoint = structuredClone(input.checkpoint);
  for (const member of input.claim.members) {
    const previous = input.checkpoint.mons[member.monId];
    const mon = input.mons.find(m => m.monId === member.monId);
    if (!mon) continue;
    if (
      previous &&
      (member.level < previous.level ||
        member.experience < previous.experience ||
        Object.entries(previous.effortValues).some(
          ([key, value]) => member.effortValues[key as keyof typeof member.effortValues] < value,
        ) ||
        !levelUpEvolutionChain(data, previous.speciesId, member.speciesId, member.level))
    )
      reasons.push(`R8_REGRESSION:${member.slotIndex}`);
    const base = previous ?? { level: mon.level, atMs: mon.mintedAtMs };
    if (
      member.level >
      Math.min(
        100,
        base.level +
          LEAGUE_GROWTH_GRACE_LEVELS +
          Math.floor(
            Math.max(0, input.nowMs - base.atMs) /
              growthMsPerLevel(checkpoint.growth.expMultiplierPermille),
          ),
      )
    )
      reasons.push(`R9_GROWTH_SPEED:${member.slotIndex}`);
    checkpoint.mons[member.monId] = {
      speciesId: member.speciesId,
      level: member.level,
      experience: member.experience,
      effortValues: { ...member.effortValues },
      atMs: input.nowMs,
    };
  }
  if (reasons.length) throw new LeaguePlausibilityError(reasons.slice(0, 24));
  return { checkpoint };
}
