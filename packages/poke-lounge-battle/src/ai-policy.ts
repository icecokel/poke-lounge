import type { CanonicalCompetitiveAction } from "./actions";
import {
  COMPETITIVE_MOVE_CATALOG,
  COMPETITIVE_SPECIES_CATALOG,
} from "./competitive-catalog.generated";
import { COMPETITIVE_STRUGGLE_MOVE_ID } from "./competitive-ruleset-config";
import { getGen4FixedDamage } from "./gen4-battle-math";
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
  state: {
    playersById: Readonly<
      Record<
        string,
        {
          activeSlotIndex: number;
          team: readonly {
            slotIndex: number;
            speciesId: number;
            maxHp: number;
            currentHp: number;
            moves: readonly { moveId: number; pp: number }[];
          }[];
        }
      >
    >;
  },
  playerId: string,
): CanonicalCompetitiveAction {
  const player = state.playersById[playerId];
  if (!player) throw new Error("AI is not a battle participant");
  const active = player.team.find(function findItem(member) {
    return member.slotIndex === player.activeSlotIndex;
  });
  if (!active) throw new Error("AI active Pokemon is missing");

  if (active.currentHp <= 0) {
    const replacement = player.team
      .filter(function filterItem(member) {
        return member.currentHp > 0;
      })
      .sort(function compareItems(left, right) {
        return (
          right.currentHp / right.maxHp - left.currentHp / left.maxHp ||
          left.slotIndex - right.slotIndex
        );
      })[0];
    if (!replacement) throw new Error("AI has no battle-ready Pokemon");
    return { kind: "switch", slotIndex: replacement.slotIndex };
  }

  const move = [...active.moves]
    .filter(function filterItem(candidate) {
      return candidate.pp > 0 && isCompetitiveMoveSelectable(candidate.moveId);
    })
    .sort(function compareItems(left, right) {
      return (
        expectedMoveValue(right.moveId, active.speciesId) -
          expectedMoveValue(left.moveId, active.speciesId) || left.moveId - right.moveId
      );
    })[0];

  return { kind: "move", moveId: move?.moveId ?? COMPETITIVE_STRUGGLE_MOVE_ID };
}

function expectedMoveValue(moveId: number, speciesId: number): number {
  const move = COMPETITIVE_MOVE_CATALOG[moveId]!;
  const fixedDamage = getGen4FixedDamage(move.effectCode);
  const typeIds = COMPETITIVE_SPECIES_CATALOG[speciesId]?.typeIds ?? [];
  return (
    (fixedDamage ?? move.power * (typeIds.includes(move.typeId) ? 1.5 : 1)) * (move.accuracy || 100)
  );
}
