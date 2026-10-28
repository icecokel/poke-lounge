import type { LeagueBattleParty } from "./contract";
import type { LeagueMatchProgress } from "./match";

export function recoverBetweenMatches(
  party: LeagueMatchProgress,
  leadSlot: number,
): LeagueBattleParty {
  if (party.outcome !== "won") throw new Error("Recovery requires a won match");
  const start = party.init.challenger;
  const end = party.frame.parties[0];
  if (start.members.length !== end.members.length) throw new Error("Carry party changed");
  const members = [...start.members]
    .sort((a, b) => a.slotIndex - b.slotIndex)
    .map(member => {
      const final = end.members.find(candidate => candidate.slotIndex === member.slotIndex);
      if (
        !final ||
        final.maxHp !== member.maxHp ||
        final.currentHp === undefined ||
        final.currentHp < 0 ||
        final.currentHp > member.maxHp ||
        final.moves.length !== member.moves.length ||
        final.moves.some((move, index) => move.moveId !== member.moves[index]!.moveId)
      )
        throw new Error("Carry member changed");
      const alive = final.currentHp > 0;
      return {
        ...member,
        individualValues: { ...member.individualValues },
        effortValues: { ...member.effortValues },
        heldItemId: 0,
        currentHp: alive ? final.currentHp + Math.ceil((member.maxHp - final.currentHp) / 2) : 0,
        status: alive ? ("normal" as const) : ("fainted" as const),
        moves: member.moves.map((move, index) => {
          const pp = final.moves[index]!.pp;
          if (!Number.isInteger(pp) || pp < 0 || pp > move.maxPp)
            throw new Error("Carry PP changed");
          return { ...move, pp: alive ? pp + Math.ceil((move.maxPp - pp) / 2) : pp };
        }),
      };
    });
  const lead =
    members.find(member => member.slotIndex === leadSlot && member.currentHp > 0) ??
    members.find(member => member.currentHp > 0);
  if (!lead) throw new Error("Winning party has no survivors");
  return { version: 1, activeSlotIndex: lead.slotIndex, members };
}
