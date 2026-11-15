import type { GameStateStore, PlayerPokemon } from "../../contracts/game-state";
import type { RustPartyAcceptance } from "../../contracts/rust-room";
import { getPokemonIdentityKey } from "../../domain/player/player-helpers";
import { getExperienceForLevel } from "@poke-lounge/battle/adventure/battle/experience";
import { getIndividualValueKey } from "@poke-lounge/battle/adventure/battle/individual-values";
import {
  getRuntimePokemonMoveDetails,
  getRuntimePokemonSpeciesSummary,
} from "@poke-lounge/battle/adventure/data/game-data-json";
import type {
  CompetitivePartyInput,
  NormalizedCompetitivePartyMember,
} from "@poke-lounge/battle/competitive-party";

export function reconcilePartySubmission(
  store: Pick<GameStateStore, "getCurrentLocalPlayer" | "upsertLocalPlayer">,
  {
    submitted,
    party,
    rejections,
    reset,
  }: RustPartyAcceptance & { submitted: CompetitivePartyInput },
): void {
  if (!reset && rejections.length === 0) return;
  const player = store.getCurrentLocalPlayer();
  const corrections = submitted.members
    .filter(
      member => reset || rejections.some(rejection => rejection.slotIndex === member.slotIndex),
    )
    .map(member => ({
      key: getIndividualValueKey(member.individualValues),
      accepted: party.members.find(
        accepted =>
          accepted.slotIndex === member.slotIndex &&
          getIndividualValueKey(accepted.individualValues) ===
            getIndividualValueKey(member.individualValues),
      ),
    }));
  const affectedKeys = new Set(corrections.map(correction => correction.key));
  const restore = (pokemon: PlayerPokemon): PlayerPokemon | null => {
    const index = corrections.findIndex(
      correction => correction.key === getPokemonIdentityKey(pokemon),
    );
    if (index < 0) return pokemon;
    const [correction] = corrections.splice(index, 1);
    return correction.accepted ? toPlayerPokemon(correction.accepted) : null;
  };
  const nextSlots = reset
    ? party.members.map(member => ({
        slotIndex: member.slotIndex,
        pokemon: toPlayerPokemon(member),
      }))
    : player.party.map(slot => ({ ...slot, pokemon: slot.pokemon ? restore(slot.pokemon) : null }));
  const active = nextSlots.find(
    slot => slot.slotIndex === (reset ? party.activeSlotIndex : player.activePartySlotIndex),
  )?.pokemon;
  const nextParty = nextSlots.filter(slot => slot.pokemon);
  const pokemonBox = player.pokemonBox.flatMap(pokemon => {
    if (
      reset &&
      party.members.some(
        member => getIndividualValueKey(member.individualValues) === getPokemonIdentityKey(pokemon),
      )
    )
      return [];
    const restored = restore(pokemon);
    return restored ? [restored] : [];
  });
  store.upsertLocalPlayer({
    ...player,
    party: nextParty,
    pokemonBox,
    activePartySlotIndex:
      (
        nextParty.find(slot => slot.pokemon === active) ??
        nextParty.find(slot => (slot.pokemon?.currentHp ?? 0) > 0) ??
        nextParty[0]
      )?.slotIndex ?? 0,
    deferredMoveLearnings: player.deferredMoveLearnings?.filter(
      learning => !affectedKeys.has(learning.pokemonKey),
    ),
  });
}

function toPlayerPokemon(member: NormalizedCompetitivePartyMember): PlayerPokemon {
  const species = getRuntimePokemonSpeciesSummary(member.speciesId);
  if (!species) throw new Error("Accepted party species is missing");
  return {
    ...member,
    name: species.name,
    growthRate: species.growthRate,
    experience: member.experience ?? getExperienceForLevel(member.level, species.growthRate),
    moves: member.moves.map(move => {
      const detail = getRuntimePokemonMoveDetails(move.moveId);
      if (!detail) throw new Error("Accepted party move is missing");
      return { id: move.moveId, name: detail.name, pp: move.pp, maxPp: detail.pp };
    }),
  };
}
