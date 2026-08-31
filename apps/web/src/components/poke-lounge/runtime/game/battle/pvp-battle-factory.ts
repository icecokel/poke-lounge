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
  return {
    battleKind: "trainer",
    phase: "intro",
    roundIndex,
    matchIndex,
    turn: 1,
    runAttemptCount: 0,
    player: createBattleParticipant(player, "Player", personalRecords, moveRecords),
    opponent: createBattleParticipant(opponent, "Opponent", personalRecords, moveRecords),
    messageQueue: [
      `${opponent.displayName}가 ${getActivePokemonName(opponent)}을 내보냈다!`,
      `가랏! ${getActivePokemonName(player)}!`,
    ],
    selectedMoveId: null,
    ...(matchId ? { tournamentMatchId: matchId } : {}),
    result: null,
  };
}

function createBattleParticipant(
  localPlayer: LocalPlayerState,
  participantLabel: "Player" | "Opponent",
  personalRecords: RomPersonalRecordCollection,
  moveRecords: RomRefinedMoveCollection,
): BattleParticipant {
  const party = createConvertedParty(localPlayer.party, personalRecords, moveRecords);
  const activePokemon = party.find(function findItem(slot) {
    return slot.slotIndex === localPlayer.activePartySlotIndex;
  })?.pokemon;

  if (!activePokemon) {
    throw new Error(
      `${participantLabel} "${localPlayer.displayName}" has no active Pokemon in slot ${localPlayer.activePartySlotIndex}`,
    );
  }

  if (activePokemon.status === "fainted" || activePokemon.currentHp <= 0) {
    throw new Error(`${participantLabel} "${localPlayer.displayName}" active Pokemon has fainted`);
  }

  return {
    playerId: localPlayer.playerId,
    displayName: localPlayer.displayName,
    pokemon: activePokemon,
    party,
    activePartySlotIndex: localPlayer.activePartySlotIndex,
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

function getActivePokemonName(localPlayer: LocalPlayerState): string {
  return (
    localPlayer.party.find(function findItem(slot) {
      return slot.slotIndex === localPlayer.activePartySlotIndex;
    })?.pokemon?.name ?? localPlayer.displayName
  );
}
