import type {
  LeagueGrowthJudgeOp,
  LeaguePrepareBadgeResult,
  LeagueJudgeBadgeResult,
} from "./growth/contract";
import { buildChallengerComposition } from "./entry";
import { materializeLeagueParty } from "./party";
import { leagueHash } from "./hash";
import { LEAGUE_MATCH_RULES, replayLeagueMatch, measureLeagueMatch } from "./match";

export function prepareBadge(
  op: Extract<LeagueGrowthJudgeOp, { kind: "prepare-badge" }>,
): LeaguePrepareBadgeResult {
  const composition = buildChallengerComposition(op.claim, op.mons);
  const challengerParty = materializeLeagueParty(composition, {
    levelCap: null,
    heldItems: "none",
  });
  const npcParty = materializeLeagueParty(op.npc.composition, {
    levelCap: null,
    heldItems: "keep",
  });
  return { composition, challengerParty, npcParty, carryHash: leagueHash(challengerParty) };
}
export function judgeBadge(
  op: Extract<LeagueGrowthJudgeOp, { kind: "judge-badge" }>,
): LeagueJudgeBadgeResult {
  const progress = replayLeagueMatch(
    {
      seed: op.seed,
      challenger: op.challengerParty,
      opponent: op.npcParty,
      leadSlot: op.leadSlot,
      rules: LEAGUE_MATCH_RULES,
    },
    op.inputs,
  );
  return { measure: measureLeagueMatch(progress) };
}
