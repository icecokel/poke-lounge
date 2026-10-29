import { COMPETITIVE_MOVE_CATALOG } from "../competitive-catalog.generated";
import { evolvedGen4Ability } from "../gen4/traits";
import {
  LEAGUE_LEVEL_CAP,
  LEAGUE_PARTY_SIZE,
  LEAGUE_MATCH_COUNT,
  type LeagueComposition,
  type LeagueMintedMon,
  type LeaguePartyClaim,
  type LeagueJudgeOp,
  type LeaguePrepareEntryResult,
} from "./contract";
import { leagueHash } from "./hash";
import { LeaguePartyError, materializeLeagueParty } from "./party";
import { assertLeaguePartyPlausible } from "./plausibility";
import { defenseComposition } from "./roster/index";

export function prepareEntry(
  claim: LeaguePartyClaim,
  mons: readonly LeagueMintedMon[],
  opponents: Extract<LeagueJudgeOp, { kind: "prepare-entry" }>["opponents"],
): LeaguePrepareEntryResult {
  if (
    claim.version !== 1 ||
    claim.members.length !== LEAGUE_PARTY_SIZE ||
    mons.length > LEAGUE_PARTY_SIZE ||
    new Set(claim.members.map(member => member.monId)).size !== LEAGUE_PARTY_SIZE ||
    new Set(mons.map(mon => mon.monId)).size !== mons.length ||
    opponents.length !== LEAGUE_MATCH_COUNT
  )
    throw new LeaguePartyError("ENTRY_STRUCTURE", -1);
  const composition: LeagueComposition = {
    version: 1,
    leadSlot: claim.leadSlot,
    members: claim.members.map(member => {
      const mon = mons.find(candidate => candidate.monId === member.monId);
      if (!mon) throw new LeaguePartyError("MON_NOT_MINTED", member.slotIndex);
      return {
        slotIndex: member.slotIndex,
        monId: member.monId,
        speciesId: member.speciesId,
        level: member.level,
        natureId: mon.natureId,
        abilityId: evolvedGen4Ability(mon.speciesId, member.speciesId, mon.abilityId),
        gender: mon.gender,
        happiness: member.happiness,
        individualValues: { ...mon.individualValues },
        effortValues: { ...member.effortValues },
        heldItemId: 0,
        moves: member.moveIds.map(moveId => {
          const move = COMPETITIVE_MOVE_CATALOG[moveId];
          if (!move) throw new LeaguePartyError("MOVE", member.slotIndex);
          return { moveId, maxPp: move.maxPp };
        }),
      };
    }),
  };
  // Validate structure before the F2 trust check; never accept a party while that check is unavailable.
  const challengerParty = materializeLeagueParty(composition, {
    levelCap: LEAGUE_LEVEL_CAP,
    heldItems: "none",
  });
  assertLeaguePartyPlausible(claim, mons);
  return {
    composition,
    challengerParty,
    carryHash: leagueHash(challengerParty),
    opponents: opponents.map(({ meta, composition: opponent }) => {
      if (opponent.members.length !== LEAGUE_PARTY_SIZE)
        throw new LeaguePartyError("OPPONENT_SIZE", -1);
      return {
        meta,
        party: materializeLeagueParty(
          meta.kind === "player" ? defenseComposition(opponent) : opponent,
          {
            levelCap: LEAGUE_LEVEL_CAP,
            heldItems: meta.kind === "npc" ? "keep" : "none",
          },
        ),
      };
    }),
  };
}
