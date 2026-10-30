import {
  COMPETITIVE_MOVE_CATALOG,
  COMPETITIVE_SPECIES_CATALOG,
} from "../competitive-catalog.generated";
import { calculateGen4BattleStats } from "../gen4-pokemon-stats";
import { GEN4_ROM_ITEMS, GEN4_ROM_SPECIES } from "../gen4/rom-catalog.generated";
import { GEN4_STAT_KEYS, validGen4EffortValues, type Gen4Party } from "../gen4/types";
import { LEAGUE_PARTY_SIZE, type LeagueBattleParty, type LeagueComposition } from "./contract";

export class LeaguePartyError extends Error {
  constructor(
    readonly reason: string,
    readonly slotIndex: number,
  ) {
    super(reason);
  }
}

export function materializeLeagueParty(
  composition: LeagueComposition,
  options: { levelCap: number | null; heldItems: "keep" | "none" },
): LeagueBattleParty {
  if (
    composition.version !== 1 ||
    composition.members.length < 1 ||
    composition.members.length > LEAGUE_PARTY_SIZE
  )
    throw new LeaguePartyError("PARTY_SIZE", -1);
  if (
    options.levelCap !== null &&
    (!Number.isInteger(options.levelCap) || options.levelCap < 1 || options.levelCap > 100)
  )
    throw new LeaguePartyError("LEVEL_CAP", -1);
  const slots = new Set<number>();
  const members = composition.members
    .map(member => {
      const fail = (reason: string): never => {
        throw new LeaguePartyError(reason, member.slotIndex);
      };
      if (
        !Number.isInteger(member.slotIndex) ||
        member.slotIndex < 0 ||
        member.slotIndex >= LEAGUE_PARTY_SIZE ||
        slots.has(member.slotIndex)
      )
        fail("SLOT");
      slots.add(member.slotIndex);
      const species = COMPETITIVE_SPECIES_CATALOG[member.speciesId];
      const rom = GEN4_ROM_SPECIES[member.speciesId];
      if (!species || !rom) fail("SPECIES");
      if (!Number.isInteger(member.level) || member.level < 1 || member.level > 100) fail("LEVEL");
      if (!rom.abilities.includes(member.abilityId)) fail("ABILITY");
      if (!Number.isInteger(member.natureId) || member.natureId < 0 || member.natureId > 24)
        fail("NATURE");
      if (
        !member.individualValues ||
        !GEN4_STAT_KEYS.every(
          key =>
            Number.isInteger(member.individualValues[key]) &&
            member.individualValues[key] >= 0 &&
            member.individualValues[key] <= 31,
        )
      )
        fail("IVS");
      if (!validGen4EffortValues(member.effortValues)) fail("EVS");
      if (!["male", "female", "genderless"].includes(member.gender)) fail("GENDER");
      if (!Number.isInteger(member.happiness) || member.happiness < 0 || member.happiness > 255)
        fail("HAPPINESS");
      if (
        member.moves.length < 1 ||
        member.moves.length > 4 ||
        new Set(member.moves.map(move => move.moveId)).size !== member.moves.length
      )
        fail("MOVES");
      for (const move of member.moves) {
        if (
          !COMPETITIVE_MOVE_CATALOG[move.moveId] ||
          !Number.isInteger(move.maxPp) ||
          move.maxPp < 1 ||
          move.maxPp > 64
        )
          fail("MOVE");
      }
      if (
        !Number.isInteger(member.heldItemId) ||
        (member.heldItemId !== 0 && !GEN4_ROM_ITEMS[member.heldItemId])
      )
        fail("HELD_ITEM");
      const level =
        options.levelCap === null ? member.level : Math.min(member.level, options.levelCap);
      const stats = calculateGen4BattleStats(
        species.baseStats,
        level,
        member.individualValues,
        member.effortValues,
        member.natureId,
      );
      if (member.speciesId === 292) stats.maxHp = 1;
      return {
        ...member,
        individualValues: { ...member.individualValues },
        effortValues: { ...member.effortValues },
        level,
        originalLevel: member.level,
        ...stats,
        currentHp: stats.maxHp,
        status: "normal" as const,
        heldItemId: options.heldItems === "keep" ? member.heldItemId : 0,
        moves: member.moves.map(move => ({ ...move, pp: move.maxPp })),
      };
    })
    .sort((a, b) => a.slotIndex - b.slotIndex);
  if (!slots.has(composition.leadSlot))
    throw new LeaguePartyError("LEAD_SLOT", composition.leadSlot);
  return { version: 1, activeSlotIndex: composition.leadSlot, members };
}

export function toGen4Party(party: LeagueBattleParty, activeSlotIndex: number): Gen4Party {
  return {
    activeSlotIndex,
    members: party.members.map(member => ({
      ...member,
      name: GEN4_ROM_SPECIES[member.speciesId]!.name,
      statusTurns: 0,
      moves: member.moves.map(move => ({ ...move })),
    })),
  };
}
