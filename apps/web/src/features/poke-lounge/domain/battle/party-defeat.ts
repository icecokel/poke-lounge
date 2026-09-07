import type { BattleParticipant } from "@poke-lounge/battle/adventure/battle/battle-types";
export function isBattleParticipantDefeated(participant: BattleParticipant): boolean {
  const occupiedParty = participant.party.flatMap(function mapItem(slot) {
    return slot.pokemon ? [slot.pokemon] : [];
  });
  const pokemon = occupiedParty.length > 0 ? occupiedParty : [participant.pokemon];

  return pokemon.every(function testItem(candidate) {
    return candidate.status === "fainted" || candidate.currentHp <= 0;
  });
}
