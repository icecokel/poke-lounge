import { withSubjectParticle } from "@poke-lounge/battle/battle-message-text";
import { initializeGen4Adventure } from "@poke-lounge/battle/gen4/adventure";
import { findBattleReadyPartySlot } from "@poke-lounge/battle/adventure/player/battle-ready-party";
import type { LocalPlayerState } from "../state/game-state-store";
import { BATTLE_PARTY_SLOT_COUNT } from "./battle-party";
import type { BattleParticipant, BattlePartySlot, BattleScreenState } from "./battle-types";
import {
  createStoredBattlePokemon,
  type RomPersonalRecordCollection,
  type RomRefinedMoveCollection,
} from "./wild-battle-factory";

export interface CreatePvpBattleStateInput {
  roundIndex: number;
  matchIndex: number;
  matchId?: string;
  player: LocalPlayerState;
  opponent: LocalPlayerState;
  personalRecords: RomPersonalRecordCollection;
  moveRecords: RomRefinedMoveCollection;
}

export function createPvpBattleState({
  roundIndex,
  matchIndex,
  matchId,
  player,
  opponent,
  personalRecords,
  moveRecords,
}: CreatePvpBattleStateInput): BattleScreenState {
  const playerParticipant = createBattleParticipant(player, "Player", personalRecords, moveRecords);
  const opponentParticipant = createBattleParticipant(
    opponent,
    "Opponent",
    personalRecords,
    moveRecords,
  );
  return initializeGen4Adventure({
    battleKind: "trainer",
    phase: "intro",
    roundIndex,
    matchIndex,
    turn: 1,
    runAttemptCount: 0,
    player: playerParticipant,
    opponent: opponentParticipant,
    messageQueue: [
      `${withSubjectParticle(opponent.displayName)} ${opponentParticipant.pokemon.name}을 내보냈다!`,
      `가랏! ${playerParticipant.pokemon.name}!`,
    ],
    selectedMoveId: null,
    ...(matchId ? { tournamentMatchId: matchId } : {}),
    result: null,
  });
}

function createBattleParticipant(
  localPlayer: LocalPlayerState,
  participantLabel: "Player" | "Opponent",
  personalRecords: RomPersonalRecordCollection,
  moveRecords: RomRefinedMoveCollection,
): BattleParticipant {
  const party = createConvertedParty(localPlayer.party, personalRecords, moveRecords);
  const activeSlot = findBattleReadyPartySlot(party, localPlayer.activePartySlotIndex);
  const activePokemon = activeSlot?.pokemon;

  if (!activePokemon) {
    throw new Error(
      `${participantLabel} "${localPlayer.displayName}" has no battle-ready Pokemon in the party`,
    );
  }

  return {
    playerId: localPlayer.playerId,
    displayName: localPlayer.displayName,
    pokemon: activePokemon,
    party,
    activePartySlotIndex: activeSlot!.slotIndex,
  };
}

function createConvertedParty(
  storedParty: LocalPlayerState["party"],
  personalRecords: RomPersonalRecordCollection,
  moveRecords: RomRefinedMoveCollection,
): BattlePartySlot[] {
  return Array.from({ length: BATTLE_PARTY_SLOT_COUNT }, function callback(_, slotIndex) {
    const storedPokemon = storedParty.find(function findItem(slot) {
      return slot.slotIndex === slotIndex;
    })?.pokemon;

    return {
      slotIndex,
      pokemon: storedPokemon
        ? createStoredBattlePokemon({ pokemon: storedPokemon, personalRecords, moveRecords })
        : null,
    };
  });
}
