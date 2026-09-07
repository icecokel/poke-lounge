import type { GameStateStore } from "@/features/poke-lounge/contracts/game-state";
import type {
  BattleParticipant,
  BattlePokemon,
  BattleReturnToWorld,
  BattleScreenState,
} from "@poke-lounge/battle/adventure/battle/battle-types";
import { restoreGen4FieldPokemon } from "@poke-lounge/battle/gen4/adventure";
import { isBattleParticipantDefeated } from "../../domain/battle/party-defeat";
import {
  persistBattlePartyToWorld,
  persistCapturedPokemonToWorld,
  toPlayerPokemon,
} from "./battle-world-persistence";
export type BattleSettlementPort = Pick<
  GameStateStore,
  | "getCurrentLocalPlayer"
  | "getState"
  | "upsertLocalPlayer"
  | "setCurrentPlayer"
  | "setActivePartySlot"
  | "updateActivePokemon"
  | "updatePokemonInPartySlot"
  | "addPokemonToParty"
  | "setLocalPlayerPokeDollars"
  | "setLocalPlayerPosition"
  | "completeSoloChallenge"
>;
export function settleBattleToWorld({
  state,
  store,
  completedCompetitiveBattle,
  authoritative,
  persistPosition,
  soloChallenge,
  recoveryPosition,
  nowMs,
}: {
  state: BattleScreenState;
  store: BattleSettlementPort;
  completedCompetitiveBattle: boolean;
  authoritative: boolean;
  persistPosition: boolean;
  soloChallenge: boolean;
  recoveryPosition: BattleReturnToWorld;
  nowMs: number;
}) {
  const returnToWorld = state.returnToWorld;
  if (!returnToWorld) throw new Error("Cannot settle a battle without a return destination");
  if (state.mechanicsVersion === 3 && state.gen4Session) {
    for (const side of [0, 1] as const) {
      const key = side === 0 ? "player" : "opponent",
        old = state[key];
      const party = old.party.map(slot => ({
        ...slot,
        pokemon: slot.pokemon ? restoreGen4FieldPokemon(state, side, slot.slotIndex) : null,
      }));
      state = {
        ...state,
        [key]: {
          ...old,
          party,
          pokemon: party.find(slot => slot.slotIndex === old.activePartySlotIndex)!.pokemon!,
        },
      };
    }
  }
  const localPlayer = store.getCurrentLocalPlayer();
  const previousCurrentPlayerId = store.getState().currentPlayerId;

  if (!completedCompetitiveBattle && state.battleKind === "trainer" && !authoritative) {
    upsertTrainerBattleParticipant(store, state.player);
    upsertTrainerBattleParticipant(store, state.opponent);
    store.setCurrentPlayer(previousCurrentPlayerId);
  } else {
    persistBattlePartyToWorld({
      completedCompetitiveBattle: Boolean(completedCompetitiveBattle),
      gameStateStore: store,
      localPlayer,
      participant: state.player,
    });
  }

  const capturedPokemon =
    state.result?.reason === "capture" ? state.result.capturedPokemon : undefined;
  const placement = persistCapturedPokemonToWorld({ capturedPokemon, gameStateStore: store });

  if (
    state.result?.winnerPlayerId === localPlayer.playerId &&
    (state.result.rewardPokeDollars ?? 0) > 0
  ) {
    const currentLocalPlayer = store.getCurrentLocalPlayer();
    store.setLocalPlayerPokeDollars(
      currentLocalPlayer.wallet.pokeDollars + (state.result.rewardPokeDollars ?? 0),
    );
  }

  const localBattleParticipant = [state.player, state.opponent].find(
    function findItem(participant) {
      return participant.playerId === localPlayer.playerId;
    },
  );
  const destination =
    state.result?.loserPlayerId === localPlayer.playerId &&
    localBattleParticipant &&
    isBattleParticipantDefeated(localBattleParticipant)
      ? recoveryPosition
      : returnToWorld;
  const { mapKey, x, y, facing } = destination;

  if (persistPosition) {
    store.setLocalPlayerPosition({
      mapKey,
      x,
      y,
      facing,
    });
  }

  if (soloChallenge && state.result) {
    store.completeSoloChallenge(state.result.winnerPlayerId === localPlayer.playerId, nowMs);
  }

  return {
    state,
    destination: { mapKey, x, y, facing },
    boxedPokemon: placement?.destination === "box" ? capturedPokemon : null,
  };
}
function upsertTrainerBattleParticipant(
  store: BattleSettlementPort,
  participant: BattleParticipant,
): void {
  const localPlayer = store.getState().playersById[participant.playerId];

  if (!localPlayer) {
    return;
  }

  const participantPartyBySlot = new Map(
    participant.party
      .filter(function filterItem(slot): slot is BattleParticipant["party"][number] & {
        pokemon: BattlePokemon;
      } {
        return Boolean(slot.pokemon);
      })
      .map(function mapItem(slot) {
        return [slot.slotIndex, toPlayerPokemon(slot.pokemon)] as const;
      }),
  );

  store.upsertLocalPlayer({
    ...localPlayer,
    activePartySlotIndex: participant.activePartySlotIndex,
    party: localPlayer.party.map(function mapItem(slot) {
      return {
        ...slot,
        pokemon: participantPartyBySlot.get(slot.slotIndex) ?? slot.pokemon,
      };
    }),
  });
}
