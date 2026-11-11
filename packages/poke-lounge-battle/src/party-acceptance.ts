import {
  normalizeCompetitiveParty,
  type CompetitivePartyInput,
  type NormalizedCompetitiveParty,
} from "./competitive-party";
import { getLevelUpMovesForSpecies } from "./adventure/battle/level-up-moves";
import { getIndividualValueKey } from "./adventure/battle/individual-values";
import {
  normalizePokemonEvolutionTable,
  type PokemonEvolutionTable,
} from "./adventure/battle/pokemon-evolution";
import type { RomPersonalRecordCollection } from "./adventure/battle/wild-battle-factory";
import {
  getStarterLevel,
  getStarterSpeciesIds,
  STARTER_LEVEL,
  STARTER_SPECIES_IDS,
  type StarterSelection,
} from "./starter-selection";
import { evolvedGen4Ability } from "./gen4/traits";
import { GEN4_ROM_SPECIES } from "./gen4/rom-catalog.generated";
import { GEN4_STAT_KEYS, type Gen4StatValues } from "./gen4/types";

export { STARTER_LEVEL, STARTER_SPECIES_IDS };

export const PARTY_ROSTER_LIMIT = 120;
export const PARTY_GROWTH_LEVELS_BASE = 5;
export const PARTY_GROWTH_MS_PER_LEVEL = 6_000;
/**
 * Effort values only grow by one wild victory's yield at a time. The budget is a token bucket:
 * it holds at most PARTY_EV_BUDGET_MAX points (covering victories a delayed publication had not
 * reported yet) and refills by one victory's yield per PARTY_EV_BUDGET_MS_PER_VICTORY.
 */
export const PARTY_EV_BUDGET_MAX = 60;
export const PARTY_EV_BUDGET_MS_PER_VICTORY = 2_000;

const EV_YIELD_PER_VICTORY_MAX = Math.max(
  ...Object.values(GEN4_ROM_SPECIES).map(species => totalEffortValues(species.evYield)),
);
/** Items are no longer handed out; a party Pokémon can only hold what a wild Pokémon carried. */
const WILD_HELD_ITEM_IDS = new Set(
  Object.values(GEN4_ROM_SPECIES).flatMap(species => species.heldItems),
);

export interface PartyRosterEntry {
  ivKey: string;
  speciesId: number;
  level: number;
  moveIds: number[];
  /** Last time this Pokémon was part of an accepted party. */
  updatedAtMs: number;
  // The fields below are absent on entries stored before they existed. Such an entry is accepted
  // as-is once and that submission becomes its baseline.
  /** Last time the level changed; the growth allowance accrues from here. */
  levelUpdatedAtMs?: number;
  natureId?: number;
  abilityId?: number;
  heldItemId?: number;
  effortValues?: Gen4StatValues;
  evBudget?: number;
  evBudgetAtMs?: number;
}

export interface PartyRoster {
  version: 1;
  highWaterLevel: number;
  entries: PartyRosterEntry[];
}

export class PartyAcceptanceError extends Error {
  constructor(
    readonly rule:
      | "starter"
      | "species-lineage"
      | "level-decrease"
      | "level-growth"
      | "move"
      | "catch-level"
      | "catch-species"
      | "nature"
      | "ability"
      | "held-item"
      | "effort-values",
  ) {
    super("Party submission rejected: " + rule);
    this.name = "PartyAcceptanceError";
  }
}

export function acceptPartySubmission(
  {
    proposed,
    roster,
    nowMs,
    trusted,
    starterSelection,
  }: {
    proposed: CompetitivePartyInput;
    roster: PartyRoster | null;
    nowMs: number;
    trusted: boolean;
    starterSelection?: StarterSelection | null;
  },
  data: RomPersonalRecordCollection,
): { party: NormalizedCompetitiveParty; roster: PartyRoster } {
  const party = normalizeCompetitiveParty(proposed, { requireBattleReady: false });
  const previousEntries = roster?.entries ?? [];
  const highWaterLevel = roster?.highWaterLevel ?? 0;
  const starter = previousEntries.length === 0;
  if (
    !trusted &&
    starter &&
    (party.members.length !== 1 ||
      !(starterSelection ? getStarterSpeciesIds(starterSelection) : STARTER_SPECIES_IDS).some(
        id => id === party.members[0].speciesId,
      ) ||
      party.members[0].level !== getStarterLevel(starterSelection, party.members[0].speciesId))
  ) {
    throw new PartyAcceptanceError("starter");
  }

  const evolutionTable = trusted ? {} : getEvolutionTable(data);
  const entries = [...previousEntries];
  const partyIndices = new Set<number>();
  for (const member of party.members) {
    const ivKey = getIndividualValueKey(member.individualValues);
    const previousIndex = previousEntries.findIndex(
      (entry, index) => entry.ivKey === ivKey && !partyIndices.has(index),
    );
    const previous = previousEntries[previousIndex];
    const moveIds = member.moves.map(move => move.moveId);
    if (!trusted) {
      let allowedMoves: Set<number> | undefined;
      if (starter) {
        allowedMoves = new Set(
          getLevelUpMovesForSpecies(
            member.speciesId,
            0,
            getStarterLevel(starterSelection, member.speciesId),
          ).map(move => move.moveId),
        );
      } else if (previous) {
        if (!isEvolutionDescendant(previous.speciesId, member.speciesId, evolutionTable)) {
          throw new PartyAcceptanceError("species-lineage");
        }
        if (member.level < previous.level) throw new PartyAcceptanceError("level-decrease");
        const growthAllowance =
          PARTY_GROWTH_LEVELS_BASE +
          Math.floor(
            (nowMs - (previous.levelUpdatedAtMs ?? previous.updatedAtMs)) /
              PARTY_GROWTH_MS_PER_LEVEL,
          );
        if (member.level > Math.min(100, previous.level + growthAllowance)) {
          throw new PartyAcceptanceError("level-growth");
        }
        allowedMoves = new Set([
          ...previous.moveIds,
          ...getLevelUpMovesForSpecies(previous.speciesId, 0, member.level).map(
            move => move.moveId,
          ),
          ...getLevelUpMovesForSpecies(member.speciesId, 0, member.level).map(move => move.moveId),
        ]);
      } else {
        if (member.level > highWaterLevel) throw new PartyAcceptanceError("catch-level");
        const species = data.species?.[member.speciesId];
        if (
          !species ||
          typeof species !== "object" ||
          !("encounterable" in species) ||
          species.encounterable !== true
        ) {
          throw new PartyAcceptanceError("catch-species");
        }
      }
      if (allowedMoves && moveIds.some(moveId => !allowedMoves.has(moveId))) {
        throw new PartyAcceptanceError("move");
      }
    }
    const natureId = member.natureId ?? 0;
    const abilityId = member.abilityId ?? 0;
    const heldItemId = member.heldItemId ?? 0;
    const effortValues = pickEffortValues(member.effortValues);
    const evBudget = refillEffortValueBudget(previous, nowMs);
    const evGrowth = previous?.effortValues
      ? GEN4_STAT_KEYS.reduce(
          (sum, key) => sum + Math.max(0, effortValues[key] - previous.effortValues![key]),
          0,
        )
      : previous
        ? 0
        : totalEffortValues(effortValues);
    if (!trusted) {
      // A reloaded client restores its Pokémon without stored traits, so every trait may fall
      // back to its default (nature 0, first ability, no item, no effort values) at any time.
      if (previous?.natureId !== undefined && natureId !== previous.natureId && natureId !== 0) {
        throw new PartyAcceptanceError("nature");
      }
      if (
        previous?.abilityId !== undefined &&
        abilityId !== (GEN4_ROM_SPECIES[member.speciesId]?.abilities[0] ?? 0) &&
        !evolvedAbilityIds(previous.speciesId, previous.abilityId, evolutionTable).some(
          candidate =>
            candidate.speciesId === member.speciesId && candidate.abilityId === abilityId,
        )
      ) {
        throw new PartyAcceptanceError("ability");
      }
      if (
        heldItemId !== 0 &&
        heldItemId !== previous?.heldItemId &&
        !WILD_HELD_ITEM_IDS.has(heldItemId)
      ) {
        throw new PartyAcceptanceError("held-item");
      }
      if (evGrowth > evBudget.evBudget) throw new PartyAcceptanceError("effort-values");
    }
    const index = previous ? previousIndex : entries.length;
    entries[index] = {
      ivKey,
      speciesId: member.speciesId,
      level: member.level,
      moveIds,
      updatedAtMs: nowMs,
      levelUpdatedAtMs:
        previous && previous.level === member.level
          ? (previous.levelUpdatedAtMs ?? previous.updatedAtMs)
          : nowMs,
      natureId,
      abilityId,
      heldItemId,
      effortValues,
      evBudget: trusted ? evBudget.evBudget : evBudget.evBudget - evGrowth,
      evBudgetAtMs: evBudget.evBudgetAtMs,
    };
    partyIndices.add(index);
  }

  const oldestUnused = entries
    .map((entry, index) => ({ entry, index }))
    .filter(({ index }) => !partyIndices.has(index))
    .sort((left, right) => left.entry.updatedAtMs - right.entry.updatedAtMs);
  const removed = new Set(
    oldestUnused
      .slice(0, Math.max(0, entries.length - PARTY_ROSTER_LIMIT))
      .map(({ index }) => index),
  );
  return {
    party,
    roster: {
      version: 1,
      highWaterLevel: Math.max(highWaterLevel, ...party.members.map(member => member.level)),
      entries: entries.filter((_entry, index) => !removed.has(index)),
    },
  };
}

function isEvolutionDescendant(
  previous: number,
  current: number,
  table: PokemonEvolutionTable,
): boolean {
  const pending = [previous];
  const seen = new Set<number>();
  while (pending.length > 0) {
    const species = pending.pop()!;
    if (species === current) return true;
    if (seen.has(species)) continue;
    seen.add(species);
    for (const rule of table[species] ?? []) pending.push(rule.targetSpeciesId);
  }
  return false;
}

/** Every (species, ability) an evolution line can reach, including the starting pair. */
function evolvedAbilityIds(
  speciesId: number,
  abilityId: number,
  table: PokemonEvolutionTable,
): Array<{ speciesId: number; abilityId: number }> {
  const reached = [{ speciesId, abilityId }];
  for (let index = 0; index < reached.length; index++) {
    const from = reached[index]!;
    for (const rule of table[from.speciesId] ?? []) {
      const next = {
        speciesId: rule.targetSpeciesId,
        abilityId: evolvedGen4Ability(from.speciesId, rule.targetSpeciesId, from.abilityId),
      };
      if (
        !reached.some(
          seen => seen.speciesId === next.speciesId && seen.abilityId === next.abilityId,
        )
      ) {
        reached.push(next);
      }
    }
  }
  return reached;
}

function refillEffortValueBudget(
  previous: PartyRosterEntry | undefined,
  nowMs: number,
): { evBudget: number; evBudgetAtMs: number } {
  if (previous?.evBudget === undefined || previous.evBudgetAtMs === undefined) {
    return { evBudget: PARTY_EV_BUDGET_MAX, evBudgetAtMs: nowMs };
  }
  const victories = Math.max(
    0,
    Math.floor((nowMs - previous.evBudgetAtMs) / PARTY_EV_BUDGET_MS_PER_VICTORY),
  );
  const evBudget = previous.evBudget + victories * EV_YIELD_PER_VICTORY_MAX;
  return evBudget >= PARTY_EV_BUDGET_MAX
    ? { evBudget: PARTY_EV_BUDGET_MAX, evBudgetAtMs: nowMs }
    : {
        evBudget,
        evBudgetAtMs: previous.evBudgetAtMs + victories * PARTY_EV_BUDGET_MS_PER_VICTORY,
      };
}

function pickEffortValues(values: Gen4StatValues | undefined): Gen4StatValues {
  return {
    hp: values?.hp ?? 0,
    attack: values?.attack ?? 0,
    defense: values?.defense ?? 0,
    speed: values?.speed ?? 0,
    specialAttack: values?.specialAttack ?? 0,
    specialDefense: values?.specialDefense ?? 0,
  };
}

function totalEffortValues(values: Gen4StatValues): number {
  return GEN4_STAT_KEYS.reduce((sum, key) => sum + values[key], 0);
}

const evolutionTableByData = new WeakMap<object, PokemonEvolutionTable>();

/** The loaded Pokémon data never changes, so its evolution table is derived once. */
function getEvolutionTable(data: RomPersonalRecordCollection): PokemonEvolutionTable {
  let table = evolutionTableByData.get(data);
  if (!table) {
    table = normalizePokemonEvolutionTable(data);
    evolutionTableByData.set(data, table);
  }
  return table;
}
