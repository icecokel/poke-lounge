import { type TournamentStateRoomPayload } from "@/components/poke-lounge/runtime/game/network/tournament-projection";
import { type GameRoundState } from "@/components/poke-lounge/runtime/game/round/round-state";
import { type TournamentSession } from "@/components/poke-lounge/runtime/game/tournament/tournament-session";
import {
  type PlayerFacing,
  type PlayerPokemonSlot,
  type PlayerPosition,
} from "@poke-lounge/battle/adventure/player/player-types";
import type {
  PlayerPokemon,
  PlayerPokemonMove,
} from "@poke-lounge/battle/adventure/player/pokemon-types";
import type {
  TournamentMatch,
  TournamentParticipantInput,
} from "@poke-lounge/battle/tournament-bracket";
import {
  type CumulativeTournamentScoreRank,
  type TournamentRoundScore,
} from "@poke-lounge/battle/tournament-scoring";
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
export type {
  PlayerPokemon,
  PlayerPokemonMove,
  PlayerPokemonStatus,
} from "@poke-lounge/battle/adventure/player/pokemon-types";
