import type { CanonicalBattleState } from "./canonical-state";
import {
  COMPETITIVE_MOVE_CATALOG,
  COMPETITIVE_SPECIES_CATALOG,
} from "./competitive-catalog.generated";
import { calculateGen4BattleStats } from "./gen4-pokemon-stats";
import {
  normalizeCompetitiveParty,
  type CompetitivePartyInput,
  type NormalizedCompetitiveParty,
} from "./competitive-party";
import { getRuntimePokemonSpeciesGrowthRate } from "./adventure/data/game-data-json";
import {
  applyExperienceGain,
  calculateWildBattleExpGain,
  getExperienceForLevel,
} from "./adventure/battle/experience";
import { getRuntimePokemonSpeciesSummary } from "./adventure/data/game-data-json";
import { getLevelUpMovesForSpecies } from "./adventure/battle/level-up-moves";

/** The room commits this result with the match's terminal event, never from a browser reward. */
export function settleTournamentExperience(input: CanonicalBattleState): CanonicalBattleState {
  if (!input.terminal) throw new Error("Cannot reward an unfinished tournament match");
  if (input.tournamentRewardsSettled) return input;
  const state = structuredClone(input);
  for (const id of state.participantIds) {
    const reward = input.tournamentRewards?.[id];
    const opponent = input.playersById[input.participantIds.find(other => other !== id)!]!;
    const total = (reward?.defeatedSlots ?? []).reduce((sum, slot) => {
      const defeated = opponent.team.find(member => member.slotIndex === slot);
      if (!defeated) throw new Error("Unknown defeated tournament slot");
      const species = getRuntimePokemonSpeciesSummary(defeated.speciesId);
      if (!species) throw new Error("Missing tournament species data");
      return (
        sum +
        calculateWildBattleExpGain({
          baseExpYield: species.baseExpYield,
          defeatedLevel: defeated.level,
        })
      );
    }, 0);
    const slots = [...new Set(reward?.participatedSlots ?? [])].filter(slot =>
      state.playersById[id]!.team.some(member => member.slotIndex === slot),
    );
    const gain = slots.length ? Math.floor(total / slots.length) : 0;
    const player = state.playersById[id]!;
    state.playersById = {
      ...state.playersById,
      [id]: {
        ...player,
        team: player.team.map(member => {
          const growthRate = getRuntimePokemonSpeciesGrowthRate(member.speciesId);
          if (growthRate === null || !member.individualValues)
            throw new Error("Incomplete tournament growth data");
          const before = member.experience ?? getExperienceForLevel(member.level, growthRate);
          const next = applyExperienceGain({
            currentExperience: before,
            currentLevel: member.level,
            growthRate,
            gainedExperience: slots.includes(member.slotIndex) ? gain : 0,
          });
          const experience = Math.min(next.experience, getExperienceForLevel(100, growthRate));
          const stats = calculateGen4BattleStats(
            COMPETITIVE_SPECIES_CATALOG[member.speciesId]!.baseStats,
            next.level,
            member.individualValues,
            member.effortValues,
            member.natureId,
          );
          return {
            ...member,
            ...stats,
            level: next.level,
            experience,
            previousLevel: member.level,
            experienceGained: experience - before,
            currentHp:
              member.currentHp === 0
                ? 0
                : Math.min(stats.maxHp, member.currentHp + stats.maxHp - member.maxHp),
          };
        }),
      },
    };
  }
  state.tournamentRewardsSettled = true;
  return state;
}

export function getTournamentRewardParty(
  state: CanonicalBattleState,
  id: string,
): NormalizedCompetitiveParty {
  const player = state.playersById[id];
  if (!player || !state.tournamentRewardsSettled)
    throw new Error("Tournament reward is not settled");
  return normalizeCompetitiveParty({
    version: 2,
    activeSlotIndex: player.activeSlotIndex,
    members: player.team.map(member => ({
      ...member,
      individualValues: member.individualValues!,
      currentHp: member.maxHp,
      status: "normal",
      moves: member.moves.map(move => ({
        ...move,
        pp: COMPETITIVE_MOVE_CATALOG[move.moveId]!.maxPp,
      })),
    })),
  });
}

/** Only move choices can change here. Levels, experience, IVs and health remain server-owned. */
export function completeTournamentProgression(
  party: NormalizedCompetitiveParty,
  proposed: CompetitivePartyInput,
  previousLevels: Record<string, number>,
): NormalizedCompetitiveParty {
  if (proposed.members.length !== party.members.length)
    throw new Error("Tournament party cannot change");
  const slots = new Set<number>();
  const members = party.members.map(member => {
    const choice = proposed.members.find(candidate => candidate.slotIndex === member.slotIndex);
    if (
      !choice ||
      slots.has(choice.slotIndex) ||
      choice.speciesId !== member.speciesId ||
      choice.level !== member.level ||
      choice.experience !== member.experience ||
      choice.moves.length < 1 ||
      choice.moves.length > 4
    )
      throw new Error("Invalid tournament progression");
    slots.add(choice.slotIndex);
    const allowed = new Set([
      ...member.moves.map(move => move.moveId),
      ...getLevelUpMovesForSpecies(
        member.speciesId,
        previousLevels[member.slotIndex] ?? member.level,
        member.level,
      ).map(move => move.moveId),
    ]);
    if (
      new Set(choice.moves.map(move => move.moveId)).size !== choice.moves.length ||
      choice.moves.some(move => !allowed.has(move.moveId))
    )
      throw new Error("Invalid learned tournament move");
    return {
      ...member,
      moves: choice.moves.map(move => ({
        moveId: move.moveId,
        pp: COMPETITIVE_MOVE_CATALOG[move.moveId]!.maxPp,
      })),
    };
  });
  return { ...party, members };
}

export function learnAvailableTournamentMoves(
  party: NormalizedCompetitiveParty,
  previousLevels: Record<string, number>,
  replace: boolean,
): NormalizedCompetitiveParty {
  return {
    ...party,
    members: party.members.map(member => {
      let moves = [...member.moves];
      for (const move of getLevelUpMovesForSpecies(
        member.speciesId,
        previousLevels[member.slotIndex] ?? member.level,
        member.level,
      )) {
        if (moves.some(known => known.moveId === move.moveId)) continue;
        if (moves.length === 4 && !replace) continue;
        moves = [
          ...moves,
          { moveId: move.moveId, pp: COMPETITIVE_MOVE_CATALOG[move.moveId]!.maxPp },
        ].slice(-4);
      }
      return { ...member, moves };
    }),
  };
}
