import type { LeagueComposition } from "../contract";

export function defenseComposition(record: LeagueComposition): LeagueComposition {
  const composition = structuredClone(record);
  for (const member of composition.members) member.heldItemId = 0;
  return composition;
}
