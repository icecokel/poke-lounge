import {
  normalizeCompetitiveParty,
  type CompetitivePartyInput,
  type NormalizedCompetitiveParty,
} from "./competitive-party";
import { getLevelUpMovesForSpecies } from "./adventure/battle/level-up-moves";
import { POKEMON_INDIVIDUAL_VALUE_KEYS } from "./adventure/battle/individual-values";
import {
  normalizePokemonEvolutionTable,
  type PokemonEvolutionTable,
} from "./adventure/battle/pokemon-evolution";
import type { RomPersonalRecordCollection } from "./adventure/battle/wild-battle-factory";
import { getStarterSpeciesIds, type StarterSelection } from "./starter-selection";

export const STARTER_SPECIES_IDS = [1, 4, 7, 152, 155, 158] as const;
export const STARTER_LEVEL = 10;
export const PARTY_ROSTER_LIMIT = 120;
export const PARTY_GROWTH_LEVELS_BASE = 5;
export const PARTY_GROWTH_MS_PER_LEVEL = 6_000;

export interface PartyRosterEntry {
  ivKey: string;
  speciesId: number;
  level: number;
  moveIds: number[];
  updatedAtMs: number;
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
      | "catch-species",
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
      party.members[0].level !== STARTER_LEVEL)
  ) {
    throw new PartyAcceptanceError("starter");
  }

  const evolutionTable = trusted ? {} : normalizePokemonEvolutionTable(data);
  const entries = [...previousEntries];
  const partyIndices = new Set<number>();
  for (const member of party.members) {
    const ivKey = POKEMON_INDIVIDUAL_VALUE_KEYS.map(key => member.individualValues[key]).join("-");
    const previousIndex = previousEntries.findIndex(
      (entry, index) => entry.ivKey === ivKey && !partyIndices.has(index),
    );
    const previous = previousEntries[previousIndex];
    const moveIds = member.moves.map(move => move.moveId);
    if (!trusted) {
      let allowedMoves: Set<number> | undefined;
      if (starter) {
        allowedMoves = new Set(
          getLevelUpMovesForSpecies(member.speciesId, 0, STARTER_LEVEL).map(move => move.moveId),
        );
      } else if (previous) {
        if (!isEvolutionDescendant(previous.speciesId, member.speciesId, evolutionTable)) {
          throw new PartyAcceptanceError("species-lineage");
        }
        if (member.level < previous.level) throw new PartyAcceptanceError("level-decrease");
        const growthAllowance =
          PARTY_GROWTH_LEVELS_BASE +
          Math.floor((nowMs - previous.updatedAtMs) / PARTY_GROWTH_MS_PER_LEVEL);
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
    const index = previous ? previousIndex : entries.length;
    entries[index] = {
      ivKey,
      speciesId: member.speciesId,
      level: member.level,
      moveIds,
      updatedAtMs: nowMs,
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
