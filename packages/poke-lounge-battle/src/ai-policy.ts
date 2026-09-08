import type { CanonicalCompetitiveAction } from "./actions";
import {
  COMPETITIVE_MOVE_CATALOG,
  COMPETITIVE_SPECIES_CATALOG,
} from "./competitive-catalog.generated";
import { COMPETITIVE_STRUGGLE_MOVE_ID } from "./competitive-ruleset-config";
import { calculateGen4Damage, getGen4FixedDamage } from "./gen4-battle-math";
import { calculateGen4TypeEffectiveness } from "./gen4-type-chart";
import { calculateBattleStageModifiedStat } from "./battle-stat-stages";
import type { CanonicalBattleState, CanonicalCombatantState } from "./canonical-state";
import { calculateGen4BattleStats } from "./gen4-pokemon-stats";
import {
  isCompetitiveMoveSelectable,
  normalizeCompetitiveParty,
  type NormalizedCompetitiveParty,
} from "./competitive-party";

import { createRandomIndividualValues } from "./adventure/battle/individual-values";

const STARTER_SPECIES_IDS = [152, 155, 158] as const;

export function createAiStarterParty(random: () => number): NormalizedCompetitiveParty {
  const speciesId = STARTER_SPECIES_IDS[Math.floor(random() * STARTER_SPECIES_IDS.length)]!;
  const species = COMPETITIVE_SPECIES_CATALOG[speciesId]!;
  const individualValues = createRandomIndividualValues(random);
  const stats = calculateGen4BattleStats(species.baseStats, 10, individualValues);
  const moveId = speciesId === 158 ? 10 : 33;

  return normalizeCompetitiveParty({
    version: 2,
    activeSlotIndex: 0,
    members: [
      {
        slotIndex: 0,
        speciesId,
        level: 10,
        currentHp: stats.maxHp,
        status: "normal",
        individualValues,
        moves: [{ moveId, pp: COMPETITIVE_MOVE_CATALOG[moveId]!.maxPp }],
      },
    ],
  });
}

export function chooseAiCompetitiveAction(
  state: Pick<CanonicalBattleState, "playersById">,
  playerId: string,
): CanonicalCompetitiveAction {
  const player = state.playersById[playerId];
  if (!player) throw new Error("AI is not a battle participant");
  const active = player.team.find(function findItem(member) {
    return member.slotIndex === player.activeSlotIndex;
  });
  if (!active) throw new Error("AI active Pokemon is missing");

  const request = player.actionRequest;
  if (request?.kind === "wait" || request?.kind === "ended")
    throw Error("AI is not being asked to act");
  if (request?.recharge || request?.forcedMoveId != null) return { kind: "continue" };
  const opponent = Object.entries(state.playersById).find(([id]) => id !== playerId)?.[1];
  const target = opponent?.team.find(member => member.slotIndex === opponent.activeSlotIndex);
  if (!target) throw new Error("AI opponent Pokemon is missing");

  const move = [...(request?.moves ?? active.moves)]
    .filter(function filterItem(candidate) {
      return (
        candidate.pp > 0 &&
        (!("disabled" in candidate) || !candidate.disabled) &&
        (request || isCompetitiveMoveSelectable(candidate.moveId))
      );
    })
    .sort(function compareItems(left, right) {
      return (
        estimateAiMoveDamage(active, target, right.moveId) -
          estimateAiMoveDamage(active, target, left.moveId) || left.moveId - right.moveId
      );
    })[0];
  const forcedSwitch = request?.kind === "switch" || active.currentHp <= 0;
  const replacements = player.team
    .filter(
      member =>
        member.slotIndex !== active.slotIndex &&
        member.currentHp > 0 &&
        (!request ||
          (request.switchSlots.includes(member.slotIndex) && (forcedSwitch || !request.trapped))),
    )
    .sort(
      (left, right) =>
        matchupValue(right, target) - matchupValue(left, target) ||
        right.currentHp / right.maxHp - left.currentHp / left.maxHp ||
        left.slotIndex - right.slotIndex,
    );
  if (forcedSwitch) {
    if (!replacements[0]) throw new Error("AI has no legal replacement");
    return { kind: "switch", slotIndex: replacements[0].slotIndex };
  }

  const outgoing = estimateAiMoveDamage(
    active,
    target,
    move?.moveId ?? COMPETITIVE_STRUGGLE_MOVE_ID,
  );
  const risk = bestDamage(target, active) / active.currentHp;
  // ponytail: one-turn heuristic, not a battle search. Switch only for a clear defensive gain.
  const safer = replacements.find(
    member =>
      risk >= 0.5 &&
      outgoing < target.currentHp * 0.5 &&
      bestDamage(target, member) / member.currentHp < risk * 0.5 &&
      bestDamage(member, target) > outgoing,
  );
  if (safer) return { kind: "switch", slotIndex: safer.slotIndex };
  return { kind: "move", moveId: move?.moveId ?? COMPETITIVE_STRUGGLE_MOVE_ID };
}

type AiDamagePokemon = Pick<
  CanonicalCombatantState,
  | "level"
  | "currentHp"
  | "attack"
  | "defense"
  | "specialAttack"
  | "specialDefense"
  | "statStages"
  | "status"
> & { typeIds: readonly number[] };

/** Expected direct damage only; multi-turn setup, abilities and weather are not simulated. */
export function estimateAiMoveDamage(
  attacker: AiDamagePokemon,
  defender: AiDamagePokemon,
  moveId: number | typeof COMPETITIVE_STRUGGLE_MOVE_ID,
): number {
  const isStruggle = moveId === COMPETITIVE_STRUGGLE_MOVE_ID || moveId === 165;
  const move = COMPETITIVE_MOVE_CATALOG[typeof moveId === "number" ? moveId : 165]!;
  const effectiveness = isStruggle
    ? 1
    : calculateGen4TypeEffectiveness(move.typeId, defender.typeIds);
  if (effectiveness === 0) return 0;
  const fixedDamage = getGen4FixedDamage(move.effectCode);
  const attackKey = move.category === "special" ? "specialAttack" : "attack";
  const defenseKey = move.category === "special" ? "specialDefense" : "defense";
  const attack = calculateBattleStageModifiedStat(
    attacker[attackKey],
    attacker.statStages[attackKey],
  );
  const damage =
    fixedDamage ??
    calculateGen4Damage({
      level: attacker.level,
      power: move.power,
      attack: move.category === "physical" && attacker.status === "burned" ? attack / 2 : attack,
      defense: calculateBattleStageModifiedStat(
        defender[defenseKey],
        defender.statStages[defenseKey],
      ),
      moveTypeId: move.typeId,
      attackerTypeIds: isStruggle ? [] : attacker.typeIds,
      typeEffectiveness: effectiveness,
      randomFactor: 92.5,
      critical: false,
      category: move.category,
    });
  return (Math.min(damage, defender.currentHp) * (move.accuracy || 100)) / 100;
}

function bestDamage(attacker: CanonicalCombatantState, defender: CanonicalCombatantState): number {
  const moves = attacker.moves.filter(
    move => move.pp > 0 && isCompetitiveMoveSelectable(move.moveId),
  );
  return Math.max(
    0,
    ...(moves.length ? moves : [{ moveId: COMPETITIVE_STRUGGLE_MOVE_ID }]).map(move =>
      estimateAiMoveDamage(attacker, defender, move.moveId),
    ),
  );
}

function matchupValue(
  attacker: CanonicalCombatantState,
  defender: CanonicalCombatantState,
): number {
  return (
    bestDamage(attacker, defender) / Math.max(1, defender.currentHp) -
    bestDamage(defender, attacker) / attacker.currentHp
  );
}
