import type { LeagueComposition, LeaguePublicMember } from "../contract";

export function publicPartyOf(
  composition: LeagueComposition,
  levelCap: number,
): LeaguePublicMember[] {
  return [...composition.members]
    .sort((a, b) => a.slotIndex - b.slotIndex)
    .map(member => ({
      speciesId: member.speciesId,
      level: Math.min(member.level, levelCap),
      moveIds: member.moves.map(move => move.moveId),
    }));
}
