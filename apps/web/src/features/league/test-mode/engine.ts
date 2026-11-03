import { LEAGUE_ENGINE_VERSION } from "@poke-lounge/battle/league/engine-version";

export const TEST_BUILD = process.env.NEXT_PUBLIC_LEAGUE_TEST_MODE === "1";

export function sameLeagueEngine(version: string | null | undefined): boolean {
  return (
    version === LEAGUE_ENGINE_VERSION ||
    (TEST_BUILD && version?.startsWith(LEAGUE_ENGINE_VERSION + "+test.") === true)
  );
}
