import { LEAGUE_LEVEL_CAP, type LeagueJudgeOp } from "@poke-lounge/battle/league/contract";
import { LEAGUE_ENGINE_VERSION } from "@poke-lounge/battle/league/engine-version";

function optional(key: string): string | undefined {
  const value = process.env[key];
  return value?.trim() ? value : undefined;
}

function integer(key: string, fallback: number, min: number, max: number): number {
  const raw = optional(key);
  const value = raw === undefined ? fallback : /^\d+$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(key);
  return value;
}

function readConfig() {
  const mode = optional("LEAGUE_TEST_MODE");
  if (mode !== "true") {
    if (
      mode !== undefined ||
      Object.keys(process.env).some(key => key.startsWith("LEAGUE_TEST_") && optional(key))
    )
      throw new Error("LEAGUE_TEST_MODE");
    return null;
  }
  const starterLevel =
    optional("LEAGUE_TEST_STARTER_LEVEL") === undefined
      ? null
      : integer("LEAGUE_TEST_STARTER_LEVEL", 10, 1, 100);
  const badgesRequired = integer("LEAGUE_TEST_BADGES_REQUIRED", 8, 0, 8);
  const opponentLevelDrop = integer("LEAGUE_TEST_OPPONENT_LEVEL_DROP", 0, 0, 49);
  return {
    starterLevel,
    badgesRequired,
    opponentLevelDrop,
    marker: `+test.s${starterLevel ?? "-"}.b${badgesRequired}.d${opponentLevelDrop}`,
  };
}

export const JUDGE_TEST_MODE = (() => {
  try {
    return readConfig();
  } catch (error) {
    process.stderr.write(
      JSON.stringify({
        level: "error",
        event: "league.judge.failed",
        timestamp: new Date().toISOString(),
        code: "test-mode-config",
        key: error instanceof Error ? error.message : "LEAGUE_TEST_MODE",
      }) + "\n",
    );
    process.exit(1);
  }
})();

export const JUDGE_ENGINE_VERSION = LEAGUE_ENGINE_VERSION + (JUDGE_TEST_MODE?.marker ?? "");

export const TEST_MODE_WORKER_ENV: NodeJS.ProcessEnv = JUDGE_TEST_MODE
  ? {
      LEAGUE_TEST_MODE: "true",
      ...(JUDGE_TEST_MODE.starterLevel === null
        ? {}
        : { LEAGUE_TEST_STARTER_LEVEL: String(JUDGE_TEST_MODE.starterLevel) }),
      LEAGUE_TEST_BADGES_REQUIRED: String(JUDGE_TEST_MODE.badgesRequired),
      LEAGUE_TEST_OPPONENT_LEVEL_DROP: String(JUDGE_TEST_MODE.opponentLevelDrop),
    }
  : {};

type Opponents = Extract<LeagueJudgeOp, { kind: "prepare-entry" }>["opponents"];

export function weakenOpponents(opponents: Opponents): Opponents {
  const drop = JUDGE_TEST_MODE?.opponentLevelDrop ?? 0;
  if (drop === 0) return opponents;
  return opponents.map(opponent => ({
    ...opponent,
    composition: {
      ...opponent.composition,
      members: opponent.composition.members.map(member => ({
        ...member,
        level: Math.max(1, Math.min(member.level, LEAGUE_LEVEL_CAP) - drop),
      })),
    },
  }));
}
