import {
  PLAYER_PARTY_SLOT_COUNT,
  type PlayerFacing,
  type PlayerPokemonSlot,
  type PlayerPosition,
} from "../player/player-types";
import { applyInventoryItemEffect } from "../items/inventory-item-effects";
import {
  getRuntimeGameItem,
  getRuntimeShopItemIds,
  hasRuntimeShopItemIds,
} from "../items/runtime-items";
import { healPokemon } from "@poke-lounge/battle/adventure/player/heal-pokemon";
import { isSupportedPokemonSpeciesId } from "../battle/pokemon-species";
import {
  ROUND_TOTAL_COUNT,
  createDefaultRoundState,
  startPreparationRound as startPreparationRoundState,
  transitionPreparationIfExpired,
  type GameRoundState,
} from "../round/round-state";
import {
  accumulateTournamentScores,
  rankCumulativeTournamentScores,
  scoreTournamentStandings,
  type CumulativeTournamentScoreRank,
  type TournamentRoundScore,
} from "@poke-lounge/battle/tournament-scoring";
import {
  createTournamentSession,
  getCurrentTournamentMatch as getCurrentTournamentSessionMatch,
  getTournamentSessionStandings,
  recordTournamentSessionMatchResult,
  type TournamentSession,
} from "../tournament/tournament-session";
import type {
  TournamentMatch,
  TournamentParticipant,
  TournamentParticipantInput,
} from "@poke-lounge/battle/tournament-bracket";
import {
  findCurrentMatch,
  type TournamentStateRoomPayload,
} from "../network/tournament-projection";
import type {
  PlayerPokemon,
  PlayerPokemonMove,
} from "@poke-lounge/battle/adventure/player/pokemon-types";
export type {
  PlayerPokemon,
  PlayerPokemonMove,
  PlayerPokemonStatus,
} from "@poke-lounge/battle/adventure/player/pokemon-types";

export interface RemotePlayerPokemonSummary {
  speciesId: number;
  name: string;
  level: number;
}

export interface PlayerWallet {
  pokeDollars: number;
}

export type PlayerInventory = Record<string, number>;

export interface PlayerCompetitiveStats {
  rank: number | null;
  score: number;
}

export interface PlayerGuideState {
  shortcutGuideViewed: boolean;
}

export interface LocalPlayerState {
  playerId: string;
  displayName: string;
  party: Array<PlayerPokemonSlot<PlayerPokemon>>;
  pokemonBox: PlayerPokemon[];
  activePartySlotIndex: number;
  wallet: PlayerWallet;
  inventory: PlayerInventory;
  competitive: PlayerCompetitiveStats;
  guide: PlayerGuideState;
  position: PlayerPosition;
}

export interface RemotePlayerState {
  sessionId: string;
  playerId: string;
  displayName?: string;
  mapKey: string;
  x: number;
  y: number;
  facing: PlayerFacing;
  activePokemon?: RemotePlayerPokemonSummary;
}

export interface MultiplayerSessionState {
  sessionId: string | null;
  roomId: string | null;
  connectionStatus: "offline" | "connecting" | "online";
}

export interface GameTournamentState {
  session: TournamentSession | null;
  serverProjection: TournamentStateRoomPayload | null;
  scoresByPlayerId: Record<string, number>;
  lastRoundScores: TournamentRoundScore[];
  standings: CumulativeTournamentScoreRank[];
}

export interface LocalPlayersSaveState {
  currentPlayerId: string;
  playersById: Record<string, LocalPlayerState>;
}

export interface GameState extends LocalPlayersSaveState {
  remotePlayers: Record<string, RemotePlayerState>;
  session: MultiplayerSessionState;
  round: GameRoundState;
  tournament: GameTournamentState;
}

export interface GameStateStorage {
  loadLocalPlayers(): LocalPlayersSaveState | null;
  saveLocalPlayers(localPlayers: LocalPlayersSaveState): void;
  clear(): void;
}

export type GameStateListener = (state: GameState) => void;
export type GameStateUnsubscribe = () => void;

export interface ShopItem {
  id: string;
  displayName: string;
  price: number;
  description: string;
}

export type BuyShopItemResult =
  | { ok: true }
  | {
      ok: false;
      reason: "unknown-item" | "invalid-quantity" | "insufficient-funds";
    };

export interface DiceGambleSettlementInput {
  stakePokeDollars: number;
  rewardPokeDollars: number;
}

export type DiceGambleSettlementResult =
  | { ok: true; walletPokeDollars: number }
  | { ok: false; reason: "invalid-stake" | "invalid-reward" | "insufficient-funds" };

export type ConsumeInventoryItemResult =
  { ok: true } | { ok: false; reason: "invalid-quantity" | "insufficient-quantity" };

export type UseInventoryItemOnPartySlotResult =
  | {
      ok: true;
      itemId: string;
      messages: string[];
      pokemon: PlayerPokemon;
      pendingMoveReplacements: PlayerPokemonMove[];
    }
  | {
      ok: false;
      itemId: string;
      reason:
        | "unknown-item"
        | "invalid-target"
        | "insufficient-quantity"
        | "invalid-move-replacements"
        | "no-effect"
        | "unsupported-item";
      message: string;
    };

export type AddPokemonToPartyResult =
  | { ok: true; destination: "party"; slotIndex: number }
  | { ok: true; destination: "box"; boxIndex: number };

export type MovePartyPokemonToBoxResult =
  | { ok: true; destination: "box"; boxIndex: number }
  | { ok: false; reason: "invalid-slot" | "empty-slot" | "last-pokemon" };

export type MoveBoxPokemonToPartyResult =
  | { ok: true; destination: "party"; slotIndex: number }
  | { ok: false; reason: "invalid-box-index" | "party-full" };

export type SwapPartyPokemonWithBoxResult =
  | { ok: true }
  | {
      ok: false;
      reason: "invalid-slot" | "empty-slot" | "invalid-box-index" | "fainted-active-replacement";
    };

export type SetActivePartySlotResult =
  { ok: true } | { ok: false; reason: "empty-slot" | "invalid-slot" | "fainted" };

export type UpdatePokemonInPartySlotResult =
  { ok: true } | { ok: false; reason: "empty-slot" | "invalid-slot" };

export type ReplacePokemonMoveResult =
  { ok: true } | { ok: false; reason: "empty-slot" | "invalid-slot" | "invalid-move-index" };

export type StartTournamentSessionResult =
  | { ok: true; session: TournamentSession }
  | { ok: false; reason: "round-not-active" | "invalid-participants" };

export type RecordTournamentMatchResultResult =
  | {
      ok: true;
      completed: boolean;
      session: TournamentSession;
      roundScores: TournamentRoundScore[];
      standings: CumulativeTournamentScoreRank[];
    }
  | { ok: false; reason: "no-active-session" | "invalid-result"; message?: string };

export interface ApplyTournamentStartedFromRoomInput {
  roundIndex: number;
  participantIds: string[];
  matchIds?: string[];
}

export interface ApplyTournamentCompletedFromRoomInput {
  roundIndex: number;
  championPlayerId: string;
  standings: Array<{
    playerId: string;
    rank: number;
    score: number;
  }>;
}

export interface ApplyRoundScoreUpdatedFromRoomInput {
  roundIndex: number;
  playerId: string;
  rank: number;
  score: number;
}

export type ApplyTournamentRoomEventResult =
  | { ok: true }
  | { ok: false; reason: "invalid-round" | "invalid-participants" | "invalid-standings" };

export type ApplyTournamentSnapshotFromRoomResult =
  { ok: true } | { ok: false; reason: "invalid-projection" | "stale-revision" };

export function getShopItemById(itemId: string): ShopItem | undefined {
  const item = getRuntimeGameItem(itemId);
  return item
    ? {
        id: itemId,
        displayName: item.name,
        price: item.price,
        description: item.description,
      }
    : undefined;
}

export interface GameStateStore {
  getState(): GameState;
  getCurrentLocalPlayer(): LocalPlayerState;
  canChooseStarter(): boolean;
  hasCurrentLocalPlayerViewedShortcutGuide(): boolean;
  subscribe(listener: GameStateListener): GameStateUnsubscribe;
  reloadLocalPlayersFromStorage(): boolean;
  hydrateLocalPlayers(localPlayers: LocalPlayersSaveState): void;
  setCurrentPlayer(playerId: string): void;
  upsertLocalPlayer(localPlayer: LocalPlayerState): void;
  setLocalPlayerPokeDollars(pokeDollars: number): void;
  setLocalPlayerCompetitiveStats(stats: PlayerCompetitiveStats): void;
  markCurrentLocalPlayerShortcutGuideViewed(): void;
  buyShopItem(itemId: string, quantity: number): BuyShopItemResult;
  buyPremiumShopItem(itemId: string, quantity: number): BuyShopItemResult;
  consumeInventoryItem(itemId: string, quantity: number): ConsumeInventoryItemResult;
  useInventoryItemOnPartySlot(itemId: string, slotIndex: number): UseInventoryItemOnPartySlotResult;
  resolveInventoryItemMoveReplacements(
    itemId: string,
    slotIndex: number,
    decisions: ReadonlyArray<number | null>,
  ): UseInventoryItemOnPartySlotResult;
  healCurrentParty(): void;
  settleDiceGambleResult(input: DiceGambleSettlementInput): DiceGambleSettlementResult;
  setStarterPokemon(pokemon: PlayerPokemon): void;
  updateActivePokemon(pokemon: PlayerPokemon): void;
  addPokemonToParty(pokemon: PlayerPokemon): AddPokemonToPartyResult;
  movePartyPokemonToBox(slotIndex: number): MovePartyPokemonToBoxResult;
  moveBoxPokemonToParty(boxIndex: number): MoveBoxPokemonToPartyResult;
  swapPartyPokemonWithBox(slotIndex: number, boxIndex: number): SwapPartyPokemonWithBoxResult;
  setActivePartySlot(slotIndex: number): SetActivePartySlotResult;
  updatePokemonInPartySlot(
    slotIndex: number,
    pokemon: PlayerPokemon,
  ): UpdatePokemonInPartySlotResult;
  replacePokemonMove(
    slotIndex: number,
    moveIndex: number,
    move: PlayerPokemonMove,
  ): ReplacePokemonMoveResult;
  setLocalPlayerPosition(position: PlayerPosition): void;
  upsertRemotePlayer(player: RemotePlayerState): void;
  removeRemotePlayer(sessionId: string): void;
  setSession(session: MultiplayerSessionState): void;
  startPreparationRound(nowMs: number, preparationDurationMs?: number): void;
  advanceRoundClock(nowMs: number): void;
  setRoundState(round: GameRoundState): void;
  completeSoloChallenge(won: boolean, nowMs: number): void;
  startTournamentSession(
    participants: ReadonlyArray<TournamentParticipantInput>,
  ): StartTournamentSessionResult;
  getCurrentTournamentMatch(): TournamentMatch | null;
  recordTournamentMatchResult(
    matchId: string,
    winnerPlayerId: string,
    nowMs: number,
  ): RecordTournamentMatchResultResult;
  applyTournamentSnapshotFromRoom(
    input: TournamentStateRoomPayload,
    nowMs: number,
  ): ApplyTournamentSnapshotFromRoomResult;
  applyTournamentStartedFromRoom(
    input: ApplyTournamentStartedFromRoomInput,
    nowMs: number,
  ): ApplyTournamentRoomEventResult;
  applyTournamentCompletedFromRoom(
    input: ApplyTournamentCompletedFromRoomInput,
    nowMs: number,
  ): ApplyTournamentRoomEventResult;
  applyRoundScoreUpdatedFromRoom(
    input: ApplyRoundScoreUpdatedFromRoomInput,
  ): ApplyTournamentRoomEventResult;
  continueFromRoundResult(nowMs: number, preparationDurationMs?: number): void;
  resetCompetitiveSession(): void;
  reset(): void;
}

export interface CreateGameStateStoreOptions {
  storage?: GameStateStorage;
  initialState?: GameState;
}

export function createDefaultGameState(): GameState {
  const localPlayer = createDefaultLocalPlayer();

  return {
    currentPlayerId: localPlayer.playerId,
    playersById: {
      [localPlayer.playerId]: localPlayer,
    },
    remotePlayers: {},
    session: {
      sessionId: null,
      roomId: null,
      connectionStatus: "offline",
    },
    round: createDefaultRoundState(),
    tournament: createDefaultGameTournamentState(),
  };
}

export function createGameStateStore(options: CreateGameStateStoreOptions = {}): GameStateStore {
  const { storage } = options;
  const defaultState = options.initialState ?? createDefaultGameState();
  const loadStateFromStorage = (): { state: GameState; restored: boolean } => {
    const persistedLocalPlayers = storage?.loadLocalPlayers() ?? null;

    return {
      state: ensureCurrentPlayerExists({
        ...defaultState,
        ...(persistedLocalPlayers ?? {
          currentPlayerId: defaultState.currentPlayerId,
          playersById: defaultState.playersById,
        }),
        remotePlayers: {},
        round: defaultState.round ?? createDefaultRoundState(),
        tournament: {
          ...createDefaultGameTournamentState(),
          ...(defaultState.tournament ?? {}),
        },
      }),
      restored: persistedLocalPlayers !== null,
    };
  };
  let state = loadStateFromStorage().state;
  const listeners = new Set<GameStateListener>();

  const notify = () => {
    for (const listener of listeners) {
      listener(state);
    }
  };

  const persistLocalPlayers = () => {
    storage?.saveLocalPlayers({
      currentPlayerId: state.currentPlayerId,
      playersById: state.playersById,
    });
  };

  const setLocalPlayers = (localPlayers: LocalPlayersSaveState) => {
    state = ensureCurrentPlayerExists({
      ...state,
      ...localPlayers,
    });
    persistLocalPlayers();
    notify();
  };

  const setCurrentLocalPlayer = (localPlayer: LocalPlayerState) => {
    setLocalPlayers({
      currentPlayerId: localPlayer.playerId,
      playersById: {
        ...state.playersById,
        [localPlayer.playerId]: localPlayer,
      },
    });
  };

  const buyItemFromCatalog = (
    itemIds: readonly string[],
    itemId: string,
    quantity: number,
  ): BuyShopItemResult => {
    const item = itemIds.includes(itemId) ? getShopItemById(itemId) : undefined;

    if (!item) {
      return { ok: false, reason: "unknown-item" };
    }

    if (!isPositiveInteger(quantity)) {
      return { ok: false, reason: "invalid-quantity" };
    }

    const localPlayer = getCurrentLocalPlayer(state);

    const totalPrice = item.price * quantity;

    if (localPlayer.wallet.pokeDollars < totalPrice) {
      return { ok: false, reason: "insufficient-funds" };
    }

    setCurrentLocalPlayer({
      ...localPlayer,
      wallet: {
        ...localPlayer.wallet,
        pokeDollars: localPlayer.wallet.pokeDollars - totalPrice,
      },
      inventory: {
        ...localPlayer.inventory,
        [item.id]: (localPlayer.inventory[item.id] ?? 0) + quantity,
      },
    });

    return { ok: true };
  };

  return {
    getState() {
      return state;
    },
    getCurrentLocalPlayer() {
      return getCurrentLocalPlayer(state);
    },
    canChooseStarter() {
      return getCurrentLocalPlayer(state).party.length === 0;
    },
    hasCurrentLocalPlayerViewedShortcutGuide() {
      return getCurrentLocalPlayer(state).guide.shortcutGuideViewed;
    },
    subscribe(listener) {
      listeners.add(listener);

      return function callback() {
        listeners.delete(listener);
      };
    },
    reloadLocalPlayersFromStorage() {
      const loaded = loadStateFromStorage();
      state = loaded.state;
      notify();
      return loaded.restored;
    },
    hydrateLocalPlayers(localPlayers) {
      setLocalPlayers(localPlayers);
    },
    setCurrentPlayer(playerId) {
      setLocalPlayers({
        currentPlayerId: playerId,
        playersById: {
          ...state.playersById,
          [playerId]: state.playersById[playerId] ?? createDefaultLocalPlayer(playerId),
        },
      });
    },
    upsertLocalPlayer(localPlayer) {
      setCurrentLocalPlayer(localPlayer);
    },
    setLocalPlayerPokeDollars(pokeDollars) {
      const localPlayer = getCurrentLocalPlayer(state);

      setCurrentLocalPlayer({
        ...localPlayer,
        wallet: {
          ...localPlayer.wallet,
          pokeDollars: normalizePokeDollars(pokeDollars),
        },
      });
    },
    setLocalPlayerCompetitiveStats(stats) {
      const localPlayer = getCurrentLocalPlayer(state);

      setCurrentLocalPlayer({
        ...localPlayer,
        competitive: normalizeCompetitiveStats(stats),
      });
    },
    markCurrentLocalPlayerShortcutGuideViewed() {
      const localPlayer = getCurrentLocalPlayer(state);

      if (localPlayer.guide.shortcutGuideViewed) {
        return;
      }

      setCurrentLocalPlayer({
        ...localPlayer,
        guide: {
          ...localPlayer.guide,
          shortcutGuideViewed: true,
        },
      });
    },
    buyShopItem(itemId, quantity) {
      if (!hasRuntimeShopItemIds("basic")) {
        return { ok: false, reason: "unknown-item" };
      }
      return buyItemFromCatalog(getRuntimeShopItemIds("basic"), itemId, quantity);
    },
    buyPremiumShopItem(itemId, quantity) {
      if (!hasRuntimeShopItemIds("premium")) {
        return { ok: false, reason: "unknown-item" };
      }
      return buyItemFromCatalog(getRuntimeShopItemIds("premium"), itemId, quantity);
    },
    consumeInventoryItem(itemId, quantity) {
      if (!isPositiveInteger(quantity)) {
        return { ok: false, reason: "invalid-quantity" };
      }

      const localPlayer = getCurrentLocalPlayer(state);
      const currentQuantity = localPlayer.inventory[itemId] ?? 0;

      if (currentQuantity < quantity) {
        return { ok: false, reason: "insufficient-quantity" };
      }

      const nextQuantity = currentQuantity - quantity;
      const nextInventory = { ...localPlayer.inventory };

      if (nextQuantity > 0) {
        nextInventory[itemId] = nextQuantity;
      } else {
        delete nextInventory[itemId];
      }

      setCurrentLocalPlayer({
        ...localPlayer,
        inventory: nextInventory,
      });

      return { ok: true };
    },
    useInventoryItemOnPartySlot(itemId, slotIndex) {
      const item = getShopItemById(itemId);

      if (!item) {
        return {
          ok: false,
          itemId,
          reason: "unknown-item",
          message: "사용할 수 없는 아이템이다.",
        };
      }

      const localPlayer = getCurrentLocalPlayer(state);
      const quantity = localPlayer.inventory[itemId] ?? 0;

      if (quantity <= 0) {
        return {
          ok: false,
          itemId,
          reason: "insufficient-quantity",
          message: `${item.displayName}이 없다!`,
        };
      }

      const partySlot = localPlayer.party.find(function findItem(slot) {
        return slot.slotIndex === slotIndex;
      });

      if (!partySlot?.pokemon) {
        return {
          ok: false,
          itemId,
          reason: "invalid-target",
          message: "대상 포켓몬이 없다.",
        };
      }

      const itemResult = applyInventoryItemEffect(itemId, partySlot.pokemon);

      if (!itemResult.ok) {
        return {
          ok: false,
          itemId,
          reason: itemResult.reason,
          message: itemResult.message,
        };
      }

      if (itemResult.pendingMoveReplacements.length > 0) {
        return {
          ok: true,
          itemId,
          messages: itemResult.messages,
          pokemon: itemResult.pokemon,
          pendingMoveReplacements: itemResult.pendingMoveReplacements,
        };
      }

      const nextQuantity = quantity - 1;
      const nextInventory = { ...localPlayer.inventory };

      if (nextQuantity > 0) {
        nextInventory[itemId] = nextQuantity;
      } else {
        delete nextInventory[itemId];
      }

      const nextPokemon = itemResult.pokemon;

      setCurrentLocalPlayer({
        ...localPlayer,
        inventory: nextInventory,
        party: localPlayer.party.map(function mapItem(slot) {
          return slot.slotIndex === slotIndex ? { ...slot, pokemon: nextPokemon } : slot;
        }),
      });

      return {
        ok: true,
        itemId,
        messages: itemResult.messages,
        pokemon: nextPokemon,
        pendingMoveReplacements: itemResult.pendingMoveReplacements,
      };
    },
    resolveInventoryItemMoveReplacements(itemId, slotIndex, decisions) {
      const item = getShopItemById(itemId);

      if (!item) {
        return {
          ok: false,
          itemId,
          reason: "unknown-item",
          message: "사용할 수 없는 아이템이다.",
        };
      }

      const localPlayer = getCurrentLocalPlayer(state);
      const quantity = localPlayer.inventory[itemId] ?? 0;

      if (quantity <= 0) {
        return {
          ok: false,
          itemId,
          reason: "insufficient-quantity",
          message: `${item.displayName}이 없다!`,
        };
      }

      const partySlot = localPlayer.party.find(function findItem(slot) {
        return slot.slotIndex === slotIndex;
      });

      if (!partySlot?.pokemon) {
        return {
          ok: false,
          itemId,
          reason: "invalid-target",
          message: "대상 포켓몬이 없다.",
        };
      }

      const itemResult = applyInventoryItemEffect(itemId, partySlot.pokemon);

      if (!itemResult.ok) {
        return {
          ok: false,
          itemId,
          reason: itemResult.reason,
          message: itemResult.message,
        };
      }

      if (
        itemResult.pendingMoveReplacements.length === 0 ||
        decisions.length !== itemResult.pendingMoveReplacements.length ||
        decisions.some(function testItem(decision) {
          return decision !== null && !isValidMoveIndex(decision);
        })
      ) {
        return {
          ok: false,
          itemId,
          reason: "invalid-move-replacements",
          message: "기술 교체 선택을 완료할 수 없다.",
        };
      }

      let nextPokemon = itemResult.pokemon;
      const replacementMessages: string[] = [];

      for (const [index, pendingMove] of itemResult.pendingMoveReplacements.entries()) {
        const moveIndex = decisions[index];

        if (moveIndex === null || moveIndex === undefined) {
          replacementMessages.push(`${pendingMove.name} 습득을 취소했다.`);
          continue;
        }

        const currentMoves = nextPokemon.moves ?? [];
        const replacedMove = currentMoves[moveIndex];

        if (!replacedMove) {
          return {
            ok: false,
            itemId,
            reason: "invalid-move-replacements",
            message: "기술 교체 선택을 완료할 수 없다.",
          };
        }

        nextPokemon = {
          ...nextPokemon,
          moves: currentMoves.map(function mapItem(move, currentIndex) {
            return currentIndex === moveIndex ? pendingMove : move;
          }),
        };
        replacementMessages.push(`기술이 ${replacedMove.name}에서 ${pendingMove.name}로 바뀌었다!`);
      }

      const nextQuantity = quantity - 1;
      const nextInventory = { ...localPlayer.inventory };

      if (nextQuantity > 0) {
        nextInventory[itemId] = nextQuantity;
      } else {
        delete nextInventory[itemId];
      }

      setCurrentLocalPlayer({
        ...localPlayer,
        inventory: nextInventory,
        party: localPlayer.party.map(function mapItem(slot) {
          return slot.slotIndex === slotIndex ? { ...slot, pokemon: nextPokemon } : slot;
        }),
      });

      return {
        ok: true,
        itemId,
        messages: [...itemResult.messages, ...replacementMessages],
        pokemon: nextPokemon,
        pendingMoveReplacements: [],
      };
    },
    healCurrentParty() {
      const localPlayer = getCurrentLocalPlayer(state);

      if (localPlayer.party.length === 0) {
        return;
      }

      setCurrentLocalPlayer(healLocalPlayer(localPlayer));
    },
    settleDiceGambleResult({ stakePokeDollars, rewardPokeDollars }) {
      if (
        !Number.isFinite(stakePokeDollars) ||
        !Number.isInteger(stakePokeDollars) ||
        stakePokeDollars < 1
      ) {
        return { ok: false, reason: "invalid-stake" };
      }

      if (
        !Number.isFinite(rewardPokeDollars) ||
        !Number.isInteger(rewardPokeDollars) ||
        rewardPokeDollars < 0
      ) {
        return { ok: false, reason: "invalid-reward" };
      }

      const localPlayer = getCurrentLocalPlayer(state);

      if (localPlayer.wallet.pokeDollars < stakePokeDollars) {
        return { ok: false, reason: "insufficient-funds" };
      }

      const walletPokeDollars = normalizePokeDollars(
        localPlayer.wallet.pokeDollars - stakePokeDollars + rewardPokeDollars,
      );

      setCurrentLocalPlayer({
        ...localPlayer,
        wallet: {
          ...localPlayer.wallet,
          pokeDollars: walletPokeDollars,
        },
      });

      return { ok: true, walletPokeDollars };
    },
    setStarterPokemon(pokemon) {
      setCurrentLocalPlayer(setActivePartyPokemon(getCurrentLocalPlayer(state), pokemon));
    },
    updateActivePokemon(pokemon) {
      setCurrentLocalPlayer(setActivePartyPokemon(getCurrentLocalPlayer(state), pokemon));
    },
    addPokemonToParty(pokemon) {
      const localPlayer = getCurrentLocalPlayer(state);
      const occupiedSlotIndices = new Set(
        localPlayer.party.map(function mapItem(slot) {
          return slot.slotIndex;
        }),
      );
      const slotIndex = Array.from(
        { length: PLAYER_PARTY_SLOT_COUNT },
        function callback(_, candidateSlotIndex) {
          return candidateSlotIndex;
        },
      ).find(function findItem(candidateSlotIndex) {
        return !occupiedSlotIndices.has(candidateSlotIndex);
      });

      if (slotIndex === undefined) {
        const boxIndex = localPlayer.pokemonBox.length;

        setCurrentLocalPlayer({
          ...localPlayer,
          pokemonBox: [...localPlayer.pokemonBox, pokemon],
        });

        return { ok: true, destination: "box", boxIndex };
      }

      setCurrentLocalPlayer({
        ...localPlayer,
        party: [
          ...localPlayer.party,
          {
            slotIndex,
            pokemon,
          },
        ].sort(function compareItems(left, right) {
          return left.slotIndex - right.slotIndex;
        }),
      });

      return { ok: true, destination: "party", slotIndex };
    },
    movePartyPokemonToBox(slotIndex) {
      if (!isValidPartySlotIndex(slotIndex)) {
        return { ok: false, reason: "invalid-slot" };
      }

      const localPlayer = getCurrentLocalPlayer(state);
      const partySlot = getPartySlot(localPlayer, slotIndex);
      const pokemon = partySlot?.pokemon;

      if (!pokemon) {
        return { ok: false, reason: "empty-slot" };
      }

      const occupiedSlots = localPlayer.party.filter(function filterItem(slot) {
        return slot.pokemon;
      });

      if (occupiedSlots.length <= 1) {
        return { ok: false, reason: "last-pokemon" };
      }

      const nextBoxIndex = localPlayer.pokemonBox.length;
      const activePokemon = getPartySlot(localPlayer, localPlayer.activePartySlotIndex)?.pokemon;
      const nextParty = compactPartySlots(
        localPlayer.party.filter(function filterItem(slot) {
          return slot.slotIndex !== slotIndex;
        }),
      );
      const nextActiveSlotIndex =
        nextParty.find(function findItem(slot) {
          return slot.pokemon === activePokemon;
        })?.slotIndex ??
        nextParty[0]?.slotIndex ??
        0;

      setCurrentLocalPlayer({
        ...localPlayer,
        activePartySlotIndex: nextActiveSlotIndex,
        party: nextParty,
        pokemonBox: [...localPlayer.pokemonBox, pokemon],
      });

      return { ok: true, destination: "box", boxIndex: nextBoxIndex };
    },
    moveBoxPokemonToParty(boxIndex) {
      const localPlayer = getCurrentLocalPlayer(state);
      const normalizedBoxIndex = normalizeBoxIndex(boxIndex);
      const pokemon =
        normalizedBoxIndex === null ? undefined : localPlayer.pokemonBox[normalizedBoxIndex];

      if (!pokemon || normalizedBoxIndex === null) {
        return { ok: false, reason: "invalid-box-index" };
      }

      const nextParty = compactPartySlots(localPlayer.party);

      if (nextParty.length >= PLAYER_PARTY_SLOT_COUNT) {
        return { ok: false, reason: "party-full" };
      }

      const slotIndex = nextParty.length;
      const nextBox = localPlayer.pokemonBox.filter(function filterItem(_, index) {
        return index !== normalizedBoxIndex;
      });

      setCurrentLocalPlayer({
        ...localPlayer,
        party: [
          ...nextParty,
          {
            slotIndex,
            pokemon,
          },
        ],
        pokemonBox: nextBox,
      });

      return { ok: true, destination: "party", slotIndex };
    },
    swapPartyPokemonWithBox(slotIndex, boxIndex) {
      if (!isValidPartySlotIndex(slotIndex)) {
        return { ok: false, reason: "invalid-slot" };
      }

      const localPlayer = getCurrentLocalPlayer(state);
      const normalizedBoxIndex = normalizeBoxIndex(boxIndex);
      const partySlot = getPartySlot(localPlayer, slotIndex);
      const partyPokemon = partySlot?.pokemon;
      const boxPokemon =
        normalizedBoxIndex === null ? undefined : localPlayer.pokemonBox[normalizedBoxIndex];

      if (!partyPokemon) {
        return { ok: false, reason: "empty-slot" };
      }

      if (!boxPokemon || normalizedBoxIndex === null) {
        return { ok: false, reason: "invalid-box-index" };
      }

      if (
        slotIndex === localPlayer.activePartySlotIndex &&
        (boxPokemon.status === "fainted" ||
          (typeof boxPokemon.currentHp === "number" && boxPokemon.currentHp <= 0))
      ) {
        return { ok: false, reason: "fainted-active-replacement" };
      }

      setCurrentLocalPlayer({
        ...localPlayer,
        party: localPlayer.party.map(function mapItem(slot) {
          return slot.slotIndex === slotIndex ? { ...slot, pokemon: boxPokemon } : slot;
        }),
        pokemonBox: localPlayer.pokemonBox.map(function mapItem(pokemon, index) {
          return index === normalizedBoxIndex ? partyPokemon : pokemon;
        }),
      });

      return { ok: true };
    },
    setActivePartySlot(slotIndex) {
      if (!isValidPartySlotIndex(slotIndex)) {
        return { ok: false, reason: "invalid-slot" };
      }

      const localPlayer = getCurrentLocalPlayer(state);
      const partySlot = getPartySlot(localPlayer, slotIndex);

      if (!partySlot?.pokemon) {
        return { ok: false, reason: "empty-slot" };
      }

      if (partySlot.pokemon.status === "fainted") {
        return { ok: false, reason: "fainted" };
      }

      setCurrentLocalPlayer({
        ...localPlayer,
        activePartySlotIndex: slotIndex,
      });

      return { ok: true };
    },
    updatePokemonInPartySlot(slotIndex, pokemon) {
      if (!isValidPartySlotIndex(slotIndex)) {
        return { ok: false, reason: "invalid-slot" };
      }

      const localPlayer = getCurrentLocalPlayer(state);
      const partySlot = getPartySlot(localPlayer, slotIndex);

      if (!partySlot?.pokemon) {
        return { ok: false, reason: "empty-slot" };
      }

      setCurrentLocalPlayer({
        ...localPlayer,
        party: localPlayer.party.map(function mapItem(slot) {
          return slot.slotIndex === slotIndex ? { ...slot, pokemon } : slot;
        }),
      });

      return { ok: true };
    },
    replacePokemonMove(slotIndex, moveIndex, move) {
      if (!isValidPartySlotIndex(slotIndex)) {
        return { ok: false, reason: "invalid-slot" };
      }

      const localPlayer = getCurrentLocalPlayer(state);
      const partySlot = getPartySlot(localPlayer, slotIndex);

      if (!partySlot?.pokemon) {
        return { ok: false, reason: "empty-slot" };
      }

      const pokemon = partySlot.pokemon;
      const moves = partySlot.pokemon.moves ?? [];

      if (!isValidMoveIndex(moveIndex) || !moves[moveIndex]) {
        return { ok: false, reason: "invalid-move-index" };
      }

      setCurrentLocalPlayer({
        ...localPlayer,
        party: localPlayer.party.map(function mapItem(slot) {
          return slot.slotIndex === slotIndex
            ? {
                ...slot,
                pokemon: {
                  ...pokemon,
                  moves: moves.map(function mapItem(candidate, index) {
                    return index === moveIndex ? move : candidate;
                  }),
                },
              }
            : slot;
        }),
      });

      return { ok: true };
    },
    setLocalPlayerPosition(position) {
      setCurrentLocalPlayer({
        ...getCurrentLocalPlayer(state),
        position,
      });
    },
    upsertRemotePlayer(player) {
      state = {
        ...state,
        remotePlayers: {
          ...state.remotePlayers,
          [player.sessionId]: player,
        },
      };
      notify();
    },
    removeRemotePlayer(sessionId) {
      const remotePlayers = { ...state.remotePlayers };
      delete remotePlayers[sessionId];
      state = {
        ...state,
        remotePlayers,
      };
      notify();
    },
    setSession(session) {
      state = {
        ...state,
        session,
      };
      notify();
    },
    startPreparationRound(nowMs, preparationDurationMs) {
      state = {
        ...state,
        round: startPreparationRoundState(state.round, nowMs, preparationDurationMs),
      };
      notify();
    },
    advanceRoundClock(nowMs) {
      if (state.tournament.serverProjection) {
        return;
      }

      const nextRound = transitionPreparationIfExpired(state.round, nowMs);

      if (nextRound === state.round) {
        return;
      }

      state = {
        ...state,
        round: nextRound,
      };
      notify();
    },
    setRoundState(round) {
      state = {
        ...state,
        round,
      };
      notify();
    },
    completeSoloChallenge(won, nowMs) {
      state = {
        ...state,
        round: {
          ...state.round,
          phase: "game-result",
          phaseStartedAtMs: normalizeTimestampMs(nowMs),
          preparationEndsAtMs: null,
        },
        tournament: {
          ...createDefaultGameTournamentState(),
          scoresByPlayerId: {
            [state.currentPlayerId]: won ? 100 : 0,
          },
        },
      };
      notify();
    },
    startTournamentSession(participants) {
      if (
        state.round.phase !== "tournament" ||
        !Number.isInteger(state.round.roundIndex) ||
        state.round.roundIndex < 1 ||
        state.round.roundIndex > state.round.totalRounds
      ) {
        return { ok: false, reason: "round-not-active" };
      }

      let session: TournamentSession;

      try {
        session = createTournamentSession({
          roundIndex: state.round.roundIndex,
          participants,
        });
      } catch {
        return { ok: false, reason: "invalid-participants" };
      }

      state = {
        ...state,
        tournament: {
          ...state.tournament,
          session,
          serverProjection: null,
          lastRoundScores: [],
        },
      };
      notify();

      return { ok: true, session };
    },
    getCurrentTournamentMatch() {
      const session = state.tournament.session;

      if (state.tournament.serverProjection) {
        return findCurrentMatch(
          state.tournament.serverProjection.tournament.bracket,
          state.tournament.serverProjection.tournament.activeMatchId,
        );
      }

      return session && session.status === "in-progress"
        ? getCurrentTournamentSessionMatch(session)
        : null;
    },
    recordTournamentMatchResult(matchId, winnerPlayerId, nowMs) {
      if (state.tournament.serverProjection) {
        return { ok: false, reason: "invalid-result", message: "Server projection is canonical." };
      }

      const session = state.tournament.session;

      if (!session || session.status !== "in-progress") {
        return { ok: false, reason: "no-active-session" };
      }

      let nextSession: TournamentSession;

      try {
        nextSession = recordTournamentSessionMatchResult(session, matchId, winnerPlayerId, nowMs);
      } catch (error) {
        return {
          ok: false,
          reason: "invalid-result",
          message: error instanceof Error ? error.message : undefined,
        };
      }

      if (nextSession.status !== "completed") {
        state = {
          ...state,
          tournament: {
            ...state.tournament,
            session: nextSession,
          },
        };
        notify();

        return {
          ok: true,
          completed: false,
          session: nextSession,
          roundScores: [],
          standings: state.tournament.standings,
        };
      }

      const roundScores = scoreTournamentStandings(getTournamentSessionStandings(nextSession));
      const scoresByPlayerId = accumulateTournamentScores(
        state.tournament.scoresByPlayerId,
        roundScores,
      );
      const standings = rankCumulativeTournamentScores(
        scoresByPlayerId,
        nextSession.tournament.participants,
      );
      const finalRound = state.round.roundIndex >= state.round.totalRounds;
      const playersById = finalRound
        ? applyFinalTournamentCompetitiveStats(state.playersById, standings)
        : state.playersById;

      state = {
        ...state,
        playersById,
        round: {
          ...state.round,
          phase: finalRound ? "game-result" : "round-result",
          phaseStartedAtMs: normalizeTimestampMs(nowMs),
          preparationEndsAtMs: null,
        },
        tournament: {
          ...state.tournament,
          session: nextSession,
          scoresByPlayerId,
          lastRoundScores: roundScores,
          standings,
        },
      };

      if (finalRound) {
        persistLocalPlayers();
      }

      notify();

      return {
        ok: true,
        completed: true,
        session: nextSession,
        roundScores,
        standings,
      };
    },
    applyTournamentSnapshotFromRoom(input, nowMs) {
      const previousProjection = state.tournament.serverProjection;
      const roomChanged =
        previousProjection !== null && previousProjection.roomCode !== input.roomCode;

      if (previousProjection && !roomChanged && input.revision < previousProjection.revision) {
        return { ok: false, reason: "stale-revision" };
      }

      if (
        previousProjection &&
        !roomChanged &&
        input.revision === previousProjection.revision &&
        !hasSameCanonicalTournamentProjection(previousProjection, input)
      ) {
        return { ok: false, reason: "invalid-projection" };
      }

      const bracket = input.tournament.bracket;

      if (
        !Number.isSafeInteger(input.revision) ||
        input.revision < 0 ||
        !Number.isSafeInteger(input.roundIndex) ||
        input.roundIndex < 0 ||
        input.roomRound.index !== input.roundIndex ||
        input.tournament.version !== 2 ||
        (bracket !== null && (bracket.version !== 1 || bracket.gameRoundIndex !== input.roundIndex))
      ) {
        return { ok: false, reason: "invalid-projection" };
      }

      const normalizedNowMs = normalizeTimestampMs(nowMs);
      const session: TournamentSession | null = bracket
        ? {
            roundIndex: input.roundIndex,
            status: bracket.status,
            tournament: bracket,
            completedAtMs: bracket.status === "completed" ? normalizedNowMs : null,
          }
        : null;
      const finalRows = normalizeRoomTournamentStandingRows(
        state,
        input.finalStandings,
        bracket?.participants,
      );

      if (input.finalStandings.length > 0 && !finalRows) {
        return { ok: false, reason: "invalid-projection" };
      }

      const rows =
        finalRows ??
        (input.finalStandings.length === 0 ? createRoomCumulativeStandingRows(input) : null);
      const completedRoundAdvanced =
        input.roomStatus === "round-started" &&
        input.roundIndex === state.round.roundIndex + 1 &&
        (previousProjection?.roomCode === input.roomCode || state.round.phase === "round-result");

      const projectionAdvanced =
        !previousProjection || roomChanged || input.revision > previousProjection.revision;
      const roundPhase = resolveServerTournamentRoundPhase(input);
      const shouldRestoreCurrentParty =
        roundPhase === "tournament" &&
        (state.round.phase !== "tournament" || state.round.roundIndex !== input.roundIndex) &&
        input.participants.some(function testItem(participant) {
          return (
            participant.playerId === state.currentPlayerId && participant.role === "participant"
          );
        });
      const playersById = shouldRestoreCurrentParty
        ? {
            ...state.playersById,
            [state.currentPlayerId]: healLocalPlayer(getCurrentLocalPlayer(state)),
          }
        : state.playersById;

      state = {
        ...state,
        playersById,
        round: {
          ...state.round,
          phase: roundPhase,
          roundIndex: input.roundIndex,
          totalRounds: ROUND_TOTAL_COUNT,
          preparationDurationMs: input.roomRound.durationMs,
          phaseStartedAtMs:
            input.roomRound.startedAtMs ??
            (projectionAdvanced ? normalizedNowMs : state.round.phaseStartedAtMs),
          preparationEndsAtMs:
            input.roomStatus === "round-started" ? input.roomRound.endsAtMs : null,
        },
        tournament: {
          ...state.tournament,
          session,
          serverProjection: input,
          scoresByPlayerId: { ...input.tournament.cumulativeScores },
          standings: rows ?? (roomChanged ? [] : state.tournament.standings),
          lastRoundScores:
            bracket?.status === "completed" && rows
              ? hasAppliedTournamentRoundResult(state, input.roundIndex)
                ? state.tournament.lastRoundScores
                : createRoundScoresFromCumulativeRows(state.tournament.scoresByPlayerId, rows)
              : completedRoundAdvanced && rows
                ? hasAppliedTournamentRoundResult(state, input.roundIndex - 1)
                  ? state.tournament.lastRoundScores
                  : createRoundScoresFromCumulativeRows(state.tournament.scoresByPlayerId, rows)
                : roomChanged
                  ? []
                  : state.tournament.lastRoundScores,
        },
      };
      if (shouldRestoreCurrentParty) {
        persistLocalPlayers();
      }
      notify();

      return { ok: true };
    },
    applyTournamentStartedFromRoom(input, nowMs) {
      const roundIndex = normalizePositiveInteger(input.roundIndex);

      if (roundIndex === null || roundIndex > state.round.totalRounds) {
        return { ok: false, reason: "invalid-round" };
      }

      const participantIds = normalizeUniquePlayerIds(input.participantIds, 2, 8);

      if (!participantIds) {
        return { ok: false, reason: "invalid-participants" };
      }

      let session: TournamentSession;

      try {
        session = createTournamentSession({
          roundIndex,
          participants: participantIds.map(function mapItem(playerId) {
            return {
              playerId,
              displayName: resolvePlayerDisplayName(state, playerId),
            };
          }),
        });
      } catch {
        return { ok: false, reason: "invalid-participants" };
      }

      state = {
        ...state,
        round: {
          ...state.round,
          phase: "tournament",
          roundIndex,
          phaseStartedAtMs: normalizeTimestampMs(nowMs),
          preparationEndsAtMs: null,
        },
        tournament: {
          ...state.tournament,
          session,
          serverProjection: null,
          lastRoundScores: [],
        },
      };
      notify();

      return { ok: true };
    },
    applyTournamentCompletedFromRoom(input, nowMs) {
      const roundIndex = normalizePositiveInteger(input.roundIndex);

      if (roundIndex === null || roundIndex > state.round.totalRounds) {
        return { ok: false, reason: "invalid-round" };
      }

      const rows = normalizeRoomTournamentStandingRows(state, input.standings);

      if (
        !rows ||
        !rows.some(function testItem(row) {
          return row.playerId === input.championPlayerId.trim() && row.rank === 1;
        })
      ) {
        return { ok: false, reason: "invalid-standings" };
      }

      const scoresByPlayerId = Object.fromEntries(
        rows.map(function mapItem(row) {
          return [row.playerId, row.score];
        }),
      );
      const roundScores = hasAppliedTournamentRoundResult(state, roundIndex)
        ? state.tournament.lastRoundScores
        : createRoundScoresFromCumulativeRows(state.tournament.scoresByPlayerId, rows);
      const finalRound = roundIndex >= state.round.totalRounds;
      const playersById = finalRound
        ? applyFinalTournamentCompetitiveStats(state.playersById, rows)
        : state.playersById;

      state = {
        ...state,
        playersById,
        round: {
          ...state.round,
          phase: finalRound ? "game-result" : "round-result",
          roundIndex,
          phaseStartedAtMs: normalizeTimestampMs(nowMs),
          preparationEndsAtMs: null,
        },
        tournament: {
          ...state.tournament,
          session: null,
          serverProjection: null,
          scoresByPlayerId,
          lastRoundScores: roundScores,
          standings: rows,
        },
      };

      if (finalRound) {
        persistLocalPlayers();
      }

      notify();

      return { ok: true };
    },
    applyRoundScoreUpdatedFromRoom(input) {
      const roundIndex = normalizePositiveInteger(input.roundIndex);
      const playerId = input.playerId.trim();
      const rank = normalizePositiveInteger(input.rank);

      if (roundIndex === null || roundIndex > state.round.totalRounds) {
        return { ok: false, reason: "invalid-round" };
      }

      if (!playerId || rank === null) {
        return { ok: false, reason: "invalid-standings" };
      }

      const row = {
        playerId,
        displayName: resolvePlayerDisplayName(state, playerId),
        seed: readExistingTournamentSeed(state, playerId),
        rank,
        score: normalizeScore(input.score),
      };
      const nextScoresByPlayerId = {
        ...state.tournament.scoresByPlayerId,
        [playerId]: row.score,
      };
      const nextStandings = upsertTournamentScoreRow(state.tournament.standings, row).sort(
        function compareItems(left, right) {
          return left.rank - right.rank || left.seed - right.seed;
        },
      );

      state = {
        ...state,
        tournament: {
          ...state.tournament,
          scoresByPlayerId: nextScoresByPlayerId,
          standings: nextStandings,
        },
      };
      notify();

      return { ok: true };
    },
    continueFromRoundResult(nowMs, preparationDurationMs) {
      if (state.round.phase !== "round-result") {
        return;
      }

      state = {
        ...state,
        round: startPreparationRoundState(state.round, nowMs, preparationDurationMs),
        tournament: {
          ...state.tournament,
          session: null,
        },
      };
      notify();
    },
    resetCompetitiveSession() {
      state = {
        ...state,
        round: createDefaultRoundState(),
        tournament: createDefaultGameTournamentState(),
      };
      notify();
    },
    reset() {
      storage?.clear();
      state = createDefaultGameState();
      notify();
    },
  };
}

export function createDefaultGameTournamentState(): GameTournamentState {
  return {
    session: null,
    serverProjection: null,
    scoresByPlayerId: {},
    lastRoundScores: [],
    standings: [],
  };
}

export function createDefaultLocalPlayer(playerId = "player-1"): LocalPlayerState {
  return {
    playerId,
    displayName: formatDefaultPlayerName(playerId),
    party: createEmptyParty(),
    pokemonBox: [],
    activePartySlotIndex: 0,
    wallet: createDefaultPlayerWallet(),
    inventory: createDefaultPlayerInventory(),
    competitive: createDefaultCompetitiveStats(),
    guide: createDefaultPlayerGuideState(),
    position: {
      mapKey: "town",
      x: 656,
      y: 446,
      facing: "front",
    },
  };
}

export function createDefaultCompetitiveStats(): PlayerCompetitiveStats {
  return {
    rank: null,
    score: 0,
  };
}

export function createDefaultPlayerGuideState(): PlayerGuideState {
  return {
    shortcutGuideViewed: false,
  };
}

export function createDefaultPlayerWallet(): PlayerWallet {
  return {
    pokeDollars: 0,
  };
}

export function createDefaultPlayerInventory(): PlayerInventory {
  return {
    pokeball: 10,
  };
}

export function createEmptyParty(): Array<PlayerPokemonSlot<PlayerPokemon>> {
  return [];
}

export function calculateOccupiedPartyAverageLevel(
  party: Array<PlayerPokemonSlot<PlayerPokemon>>,
): number | null {
  const levels = party
    .map(function mapItem(slot) {
      return slot.pokemon?.level;
    })
    .filter(function filterItem(level): level is number {
      return typeof level === "number" && Number.isFinite(level) && level >= 1;
    });

  if (levels.length === 0) {
    return null;
  }

  return Math.round(
    levels.reduce(function reduceItems(total, level) {
      return total + level;
    }, 0) / levels.length,
  );
}

function getCurrentLocalPlayer(state: GameState): LocalPlayerState {
  const localPlayer = state.playersById[state.currentPlayerId];

  if (!localPlayer) {
    throw new Error(`Missing local player ${state.currentPlayerId}`);
  }

  return localPlayer;
}

function ensureCurrentPlayerExists(state: GameState): GameState {
  const playersById = Object.fromEntries(
    Object.entries(state.playersById).map(function mapItem([playerId, localPlayer]) {
      return [playerId, ensureLocalPlayerDefaults(localPlayer)];
    }),
  );

  if (state.playersById[state.currentPlayerId]) {
    return {
      ...state,
      playersById,
    };
  }

  return {
    ...state,
    playersById: {
      ...playersById,
      [state.currentPlayerId]: createDefaultLocalPlayer(state.currentPlayerId),
    },
  };
}

function ensureLocalPlayerDefaults(localPlayer: LocalPlayerState): LocalPlayerState {
  const activePokemon = findSupportedActivePartyPokemon(
    localPlayer.party,
    localPlayer.activePartySlotIndex,
  );
  const party = normalizePokemonParty(localPlayer.party);

  return {
    ...localPlayer,
    party,
    activePartySlotIndex:
      party.find(function findItem(slot) {
        return slot.pokemon === activePokemon;
      })?.slotIndex ??
      party[0]?.slotIndex ??
      0,
    wallet: {
      ...createDefaultPlayerWallet(),
      ...(localPlayer.wallet ?? {}),
      pokeDollars: normalizePokeDollars(localPlayer.wallet?.pokeDollars ?? 0),
    },
    inventory: normalizeInventory(localPlayer.inventory ?? createDefaultPlayerInventory()),
    pokemonBox: normalizePokemonBox(localPlayer.pokemonBox),
    competitive: normalizeCompetitiveStats(
      localPlayer.competitive ?? createDefaultCompetitiveStats(),
    ),
    guide: normalizePlayerGuideState(localPlayer.guide ?? createDefaultPlayerGuideState()),
  };
}

function formatDefaultPlayerName(playerId: string): string {
  const match = /^player-(\d+)$/.exec(playerId);

  return match ? `Player ${match[1]}` : playerId;
}

function normalizePokeDollars(pokeDollars: number): number {
  if (!Number.isFinite(pokeDollars)) {
    return 0;
  }

  return Math.max(0, Math.floor(pokeDollars));
}

function normalizeInventory(inventory: Record<string, unknown>): PlayerInventory {
  return Object.fromEntries(
    Object.entries(inventory)
      .map(function mapItem([itemId, quantity]) {
        return [itemId, typeof quantity === "number" ? quantity : Number(quantity)] as const;
      })
      .filter(function filterItem([, quantity]) {
        return Number.isFinite(quantity) && quantity >= 1;
      })
      .map(function mapItem([itemId, quantity]) {
        return [itemId, Math.floor(quantity)];
      }),
  );
}

function normalizePokemonBox(pokemonBox: unknown): PlayerPokemon[] {
  if (!Array.isArray(pokemonBox)) {
    return [];
  }

  return pokemonBox.filter(function filterItem(pokemon): pokemon is PlayerPokemon {
    return isPlayerPokemonRecord(pokemon);
  });
}

function normalizePokemonParty(party: unknown): Array<PlayerPokemonSlot<PlayerPokemon>> {
  if (!Array.isArray(party)) {
    return [];
  }

  const occupiedSlotIndices = new Set<number>();

  return party
    .flatMap(function mapItem(slot) {
      if (
        typeof slot !== "object" ||
        slot === null ||
        !("slotIndex" in slot) ||
        typeof slot.slotIndex !== "number" ||
        !isValidPartySlotIndex(slot.slotIndex) ||
        occupiedSlotIndices.has(slot.slotIndex) ||
        !("pokemon" in slot) ||
        !isPlayerPokemonRecord(slot.pokemon)
      ) {
        return [];
      }

      occupiedSlotIndices.add(slot.slotIndex);

      return [{ slotIndex: slot.slotIndex, pokemon: slot.pokemon }];
    })
    .sort(function compareItems(left, right) {
      return left.slotIndex - right.slotIndex;
    });
}

function findSupportedActivePartyPokemon(
  party: unknown,
  activePartySlotIndex: unknown,
): PlayerPokemon | null {
  if (!Array.isArray(party)) {
    return null;
  }

  const activeSlot = party.find(function findItem(slot) {
    return (
      typeof slot === "object" &&
      slot !== null &&
      "slotIndex" in slot &&
      slot.slotIndex === activePartySlotIndex
    );
  });

  if (!activeSlot || !("pokemon" in activeSlot)) {
    return null;
  }

  return isPlayerPokemonRecord(activeSlot.pokemon) ? activeSlot.pokemon : null;
}

function isPlayerPokemonRecord(value: unknown): value is PlayerPokemon {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const pokemon = value as Partial<PlayerPokemon>;

  return (
    isSupportedPokemonSpeciesId(pokemon.speciesId) &&
    typeof pokemon.name === "string" &&
    pokemon.name.trim().length > 0 &&
    typeof pokemon.level === "number" &&
    Number.isFinite(pokemon.level)
  );
}

function normalizeCompetitiveStats(
  stats: Partial<{ rank: unknown; score: unknown }>,
): PlayerCompetitiveStats {
  return {
    rank: normalizeRank(stats.rank),
    score: normalizeScore(stats.score),
  };
}

function normalizePlayerGuideState(
  guide: Partial<{ shortcutGuideViewed: unknown }>,
): PlayerGuideState {
  return {
    shortcutGuideViewed: guide.shortcutGuideViewed === true,
  };
}

function normalizeRank(rank: unknown): number | null {
  if (rank === null || rank === undefined || rank === "") {
    return null;
  }

  const parsedRank = typeof rank === "number" ? rank : Number(rank);

  if (!Number.isFinite(parsedRank)) {
    return null;
  }

  const normalizedRank = Math.floor(parsedRank);

  return normalizedRank >= 1 ? normalizedRank : null;
}

function normalizeScore(score: unknown): number {
  const parsedScore = typeof score === "number" ? score : Number(score);

  if (!Number.isFinite(parsedScore)) {
    return 0;
  }

  return Math.max(0, parsedScore);
}

function normalizePositiveInteger(value: unknown): number | null {
  const parsedValue = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(parsedValue)) {
    return null;
  }

  const normalizedValue = Math.floor(parsedValue);

  return normalizedValue >= 1 ? normalizedValue : null;
}

function normalizeTimestampMs(nowMs: number): number {
  return Math.max(0, Math.trunc(Number.isFinite(nowMs) ? nowMs : 0));
}

function resolveServerTournamentRoundPhase(
  input: TournamentStateRoomPayload,
): GameRoundState["phase"] {
  if (input.roomStatus === "tournament") {
    return "tournament";
  }

  if (input.roomStatus === "completed") {
    return "game-result";
  }

  if (input.roomStatus === "round-started") {
    return "preparation";
  }

  return "waiting";
}

function hasSameCanonicalTournamentProjection(
  left: TournamentStateRoomPayload,
  right: TournamentStateRoomPayload,
): boolean {
  return (
    left.roundIndex === right.roundIndex &&
    left.roomCode === right.roomCode &&
    left.hostPlayerId === right.hostPlayerId &&
    left.roomStatus === right.roomStatus &&
    JSON.stringify(left.roomRound) === JSON.stringify(right.roomRound) &&
    JSON.stringify(left.participants) === JSON.stringify(right.participants) &&
    JSON.stringify(left.tournament) === JSON.stringify(right.tournament) &&
    JSON.stringify(left.finalStandings) === JSON.stringify(right.finalStandings)
  );
}

function normalizeUniquePlayerIds(
  playerIds: unknown,
  minCount: number,
  maxCount: number,
): string[] | null {
  if (!Array.isArray(playerIds)) {
    return null;
  }

  const seenPlayerIds = new Set<string>();
  const normalizedPlayerIds: string[] = [];

  for (const playerId of playerIds) {
    if (typeof playerId !== "string") {
      return null;
    }

    const normalizedPlayerId = playerId.trim();

    if (!normalizedPlayerId || seenPlayerIds.has(normalizedPlayerId)) {
      return null;
    }

    seenPlayerIds.add(normalizedPlayerId);
    normalizedPlayerIds.push(normalizedPlayerId);
  }

  if (normalizedPlayerIds.length < minCount || normalizedPlayerIds.length > maxCount) {
    return null;
  }

  return normalizedPlayerIds;
}

function normalizeRoomTournamentStandingRows(
  state: GameState,
  standings: ApplyTournamentCompletedFromRoomInput["standings"],
  canonicalParticipants?: ReadonlyArray<TournamentParticipant>,
): CumulativeTournamentScoreRank[] | null {
  if (!Array.isArray(standings) || standings.length < 2 || standings.length > 8) {
    return null;
  }

  const seenPlayerIds = new Set<string>();
  const rows: CumulativeTournamentScoreRank[] = [];

  for (const [index, standing] of standings.entries()) {
    const playerId = typeof standing.playerId === "string" ? standing.playerId.trim() : "";
    const rank = normalizePositiveInteger(standing.rank);

    if (!playerId || rank === null || seenPlayerIds.has(playerId)) {
      return null;
    }

    const canonicalParticipant = canonicalParticipants?.find(function findItem(participant) {
      return participant.playerId === playerId;
    });

    if (canonicalParticipants && !canonicalParticipant) {
      return null;
    }

    seenPlayerIds.add(playerId);
    rows.push({
      playerId,
      displayName: canonicalParticipant?.displayName ?? resolvePlayerDisplayName(state, playerId),
      seed:
        canonicalParticipant?.seed ?? (readExistingTournamentSeed(state, playerId) || index + 1),
      rank,
      score: normalizeScore(standing.score),
    });
  }

  return rows.sort(function compareItems(left, right) {
    return left.rank - right.rank || left.seed - right.seed;
  });
}

function createRoomCumulativeStandingRows(
  input: TournamentStateRoomPayload,
): CumulativeTournamentScoreRank[] | null {
  const participants = input.participants.filter(function filterItem(participant) {
    return participant.role === "participant";
  });
  const scorePlayerIds = Object.keys(input.tournament.cumulativeScores);
  const participantPlayerIds = new Set(
    participants.map(function mapItem(participant) {
      return participant.playerId;
    }),
  );

  if (
    scorePlayerIds.length < 2 ||
    scorePlayerIds.length !== participants.length ||
    scorePlayerIds.some(function testItem(playerId) {
      return !participantPlayerIds.has(playerId);
    })
  ) {
    return null;
  }

  return rankCumulativeTournamentScores(
    input.tournament.cumulativeScores,
    participants.map(function mapItem(participant, index) {
      return {
        playerId: participant.playerId,
        displayName: participant.displayName,
        seed: participant.seed ?? index + 1,
      };
    }),
  );
}

function createRoundScoresFromCumulativeRows(
  previousScores: Readonly<Record<string, number>>,
  rows: ReadonlyArray<CumulativeTournamentScoreRank>,
): TournamentRoundScore[] {
  return rows.map(function mapItem(row) {
    return {
      playerId: row.playerId,
      displayName: row.displayName,
      seed: row.seed,
      rank: row.rank,
      score: Math.max(0, row.score - normalizeScore(previousScores[row.playerId])),
    };
  });
}

function hasAppliedTournamentRoundResult(state: GameState, roundIndex: number): boolean {
  return (
    state.round.roundIndex === roundIndex &&
    (state.round.phase === "round-result" || state.round.phase === "game-result") &&
    state.tournament.lastRoundScores.length > 0
  );
}

export function resolvePlayerDisplayName(
  state: GameState,
  playerId: string,
  fallback = playerId,
): string {
  const participant = state.tournament.serverProjection?.participants.find(
    participant => participant.playerId === playerId,
  );
  if (participant) return participant.displayName;
  const localDisplayName = state.playersById[playerId]?.displayName;

  if (localDisplayName) {
    return localDisplayName;
  }

  return (
    Object.values(state.remotePlayers).find(function findItem(player) {
      return player.playerId === playerId;
    })?.displayName ?? fallback
  );
}

function readExistingTournamentSeed(state: GameState, playerId: string): number {
  return (
    state.tournament.session?.tournament.participants.find(function findItem(participant) {
      return participant.playerId === playerId;
    })?.seed ?? 0
  );
}

function upsertTournamentScoreRow<T extends TournamentRoundScore | CumulativeTournamentScoreRank>(
  rows: ReadonlyArray<T>,
  row: T,
): T[] {
  const replacedRows = rows.filter(function filterItem(candidate) {
    return candidate.playerId !== row.playerId;
  });
  return [...replacedRows, row].sort(function compareItems(left, right) {
    return left.rank - right.rank || left.seed - right.seed;
  });
}

function applyFinalTournamentCompetitiveStats(
  playersById: Record<string, LocalPlayerState>,
  standings: ReadonlyArray<CumulativeTournamentScoreRank>,
): Record<string, LocalPlayerState> {
  let nextPlayersById = playersById;

  for (const row of standings) {
    if (!Object.hasOwn(playersById, row.playerId)) {
      continue;
    }

    const localPlayer = playersById[row.playerId];

    if (!localPlayer) {
      continue;
    }

    if (nextPlayersById === playersById) {
      nextPlayersById = { ...playersById };
    }

    nextPlayersById[row.playerId] = {
      ...localPlayer,
      competitive: {
        rank: row.rank,
        score: row.score,
      },
    };
  }

  return nextPlayersById;
}

function isPositiveInteger(value: number): boolean {
  return Number.isFinite(value) && Number.isInteger(value) && value >= 1;
}

function isValidPartySlotIndex(slotIndex: number): boolean {
  return (
    Number.isFinite(slotIndex) &&
    Number.isInteger(slotIndex) &&
    slotIndex >= 0 &&
    slotIndex < PLAYER_PARTY_SLOT_COUNT
  );
}

function isValidMoveIndex(moveIndex: number): boolean {
  return (
    Number.isFinite(moveIndex) && Number.isInteger(moveIndex) && moveIndex >= 0 && moveIndex < 4
  );
}

function getPartySlot(
  localPlayer: LocalPlayerState,
  slotIndex: number,
): PlayerPokemonSlot<PlayerPokemon> | undefined {
  return localPlayer.party.find(function findItem(slot) {
    return slot.slotIndex === slotIndex;
  });
}

function compactPartySlots(
  party: Array<PlayerPokemonSlot<PlayerPokemon>>,
): Array<PlayerPokemonSlot<PlayerPokemon>> {
  return party
    .filter(function filterItem(slot): slot is PlayerPokemonSlot<PlayerPokemon> & {
      pokemon: PlayerPokemon;
    } {
      return Boolean(slot.pokemon);
    })
    .slice(0, PLAYER_PARTY_SLOT_COUNT)
    .map(function mapItem(slot, slotIndex) {
      return {
        ...slot,
        slotIndex,
      };
    });
}

function normalizeBoxIndex(boxIndex: number): number | null {
  if (!Number.isFinite(boxIndex) || !Number.isInteger(boxIndex) || boxIndex < 0) {
    return null;
  }

  return boxIndex;
}

export function healLocalPlayer(localPlayer: LocalPlayerState): LocalPlayerState {
  return {
    ...localPlayer,
    party: localPlayer.party.map(function mapItem(slot) {
      return {
        ...slot,
        pokemon: slot.pokemon ? healPokemon(slot.pokemon) : slot.pokemon,
      };
    }),
  };
}

function setActivePartyPokemon(
  localPlayer: LocalPlayerState,
  pokemon: PlayerPokemon,
): LocalPlayerState {
  if (localPlayer.party.length === 0) {
    return {
      ...localPlayer,
      activePartySlotIndex: 0,
      party: [
        {
          slotIndex: 0,
          pokemon,
        },
      ],
    };
  }

  if (localPlayer.party.length > PLAYER_PARTY_SLOT_COUNT) {
    throw new Error(`Local player party exceeds ${PLAYER_PARTY_SLOT_COUNT} slots`);
  }

  return {
    ...localPlayer,
    party: localPlayer.party.map(function mapItem(slot) {
      return slot.slotIndex === localPlayer.activePartySlotIndex ? { ...slot, pokemon } : slot;
    }),
  };
}
