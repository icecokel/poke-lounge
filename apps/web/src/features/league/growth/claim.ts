import type { LeaguePartyClaim } from "@poke-lounge/battle/league/contract";
import { getPokemonIdentityKey } from "@/features/poke-lounge/domain/player/player-helpers";
import type { LeagueEntryClaimResult } from "../contract";
import type { LeagueSaveEnvelope } from "./league-save";
export function buildLeaguePartyClaim(
  save: LeagueSaveEnvelope,
  exactSix = false,
): LeagueEntryClaimResult {
  const player = save.game.playersById[save.game.currentPlayerId];
  if (!player) return { ok: false, reason: "NO_SAVE" };
  const slots = player.party.filter(s => !!s.pokemon);
  if (slots.length < 1 || (exactSix && slots.length !== 6))
    return { ok: false, reason: "PARTY_SIZE" };
  for (const slot of slots) {
    const key = getPokemonIdentityKey(slot.pokemon!);
    if (key && save.league.rejectedMints.includes(key))
      return { ok: false, reason: "MINT_REJECTED" };
    if (!key || !save.league.monIds[key] || save.league.pendingMints.some(m => m.localKey === key))
      return { ok: false, reason: "PENDING_MINT" };
  }
  const claim: LeaguePartyClaim = {
    version: 1,
    leadSlot: player.activePartySlotIndex,
    members: slots.map(s => {
      const p = s.pokemon!;
      return {
        slotIndex: s.slotIndex,
        monId: save.league.monIds[getPokemonIdentityKey(p)!]!,
        speciesId: p.speciesId,
        level: p.level,
        experience: p.experience ?? 0,
        effortValues: p.effortValues ?? {
          hp: 0,
          attack: 0,
          defense: 0,
          specialAttack: 0,
          specialDefense: 0,
          speed: 0,
        },
        happiness: 70,
        moveIds: (p.moves ?? []).map(m => m.id),
      };
    }),
  };
  return {
    ok: true,
    claim,
    preview: claim.members.map(({ slotIndex, speciesId, level, moveIds }) => ({
      slotIndex,
      speciesId,
      level,
      moveIds,
    })),
  };
}
