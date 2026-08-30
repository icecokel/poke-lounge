import {
  COMPETITIVE_CATALOG_HASH,
  COMPETITIVE_MOVE_CATALOG,
  type CompetitiveMoveDefinition,
} from "./competitive-catalog.generated";
import { canUseCompetitiveStruggle } from "./competitive-party";
import {
  APPROVED_COMPETITIVE_RULESET_V2,
  COMPETITIVE_RULESET_HASH,
  COMPETITIVE_RULESET_V2,
  COMPETITIVE_RULESET_VERSION,
  COMPETITIVE_STRUGGLE_MOVE_ID,
} from "./competitive-ruleset-config";

export interface CompetitiveStruggleDefinition {
  moveId: "struggle";
  typeId: 0;
  category: "physical";
  power: 50;
  accuracy: 100;
  effectCode: 0;
  effectChance: 0;
  priority: 0;
  maxPp: 0;
}

export type CompetitiveResolvedMoveDefinition =
  CompetitiveMoveDefinition | CompetitiveStruggleDefinition;

export function getCompetitiveMoveDefinition(
  moveId: number | "struggle",
): CompetitiveResolvedMoveDefinition | undefined {
  if (moveId === COMPETITIVE_STRUGGLE_MOVE_ID) {
    return COMPETITIVE_RULESET_V2.struggle;
  }
  return COMPETITIVE_MOVE_CATALOG[moveId];
}

export { canUseCompetitiveStruggle };
export { COMPETITIVE_CATALOG_HASH };
export {
  APPROVED_COMPETITIVE_RULESET_V2,
  COMPETITIVE_RULESET_HASH,
  COMPETITIVE_RULESET_V2,
  COMPETITIVE_RULESET_VERSION,
  COMPETITIVE_STRUGGLE_MOVE_ID,
};
