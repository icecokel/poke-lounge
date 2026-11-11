import { resolveGen4CompetitiveTurn, validateGen4CompetitiveAction } from "./gen4/canonical";
import type { CanonicalCompetitiveAction } from "./actions";
import type {
  CanonicalBattleState,
  CanonicalIdRecord,
  CanonicalTerminalResult,
} from "./canonical-state";
import { COMPETITIVE_RULESET_VERSION } from "./competitive-ruleset-config";
import type { SeededRandom } from "./prng";

export interface ResolvedTurn {
  turn: number;
  state: CanonicalBattleState;
  stateHash: string;
  terminal: CanonicalTerminalResult | null;
}

// 4세대(v3) 엔진만 지원한다. 워커 스키마도 다른 버전의 상태를 받지 않는다.
function assertSupportedRuleset(state: CanonicalBattleState): void {
  if (state.rulesetVersion !== COMPETITIVE_RULESET_VERSION) {
    throw new Error("Unsupported competitive ruleset version");
  }
}

export function validateCompetitiveAction(input: {
  state: CanonicalBattleState;
  playerId: string;
  action: CanonicalCompetitiveAction;
}): void {
  assertSupportedRuleset(input.state);
  validateGen4CompetitiveAction(input);
}

export function resolveTurn(input: {
  state: CanonicalBattleState;
  actionsByPlayerId: CanonicalIdRecord<CanonicalCompetitiveAction>;
  random: SeededRandom;
}): ResolvedTurn {
  assertSupportedRuleset(input.state);
  return resolveGen4CompetitiveTurn(input);
}
