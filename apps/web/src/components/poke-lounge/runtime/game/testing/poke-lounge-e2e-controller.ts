import type { PokeLoungeAudioPlaybackSnapshot } from "../audio/poke-lounge-audio";
import type { BattleRect } from "../battle/battle-layout";
import type { BattleCommand, BattlePokemonStatus, BattleScreenState } from "../battle/battle-types";
import type { VirtualGamepadButton } from "../input/virtual-gamepad";
import type { PlayerFacing, PlayerSnapshot } from "../network/local-preview-room";
import type { ServerRoomTransportDiagnostics } from "../network/server-room";
import type { GameState, LocalPlayerState, PlayerPokemon } from "../state/game-state-store";
import type { WildBattleStartInput } from "../world/wild-encounters";

export type BattleE2eScenario =
  | "wild-victory"
  | "wild-defeat"
  | "wild-evolution"
  | "wild-move-learning"
  | "wild-status-badge"
  | "wild-paralysis";

export interface CompetitiveBattleE2eSnapshot {
  matchId: string;
  bracketMatchId: string;
  assignmentRevision: number;
  currentTurn: number;
  status: string;
  terminal: unknown;
  submittedPlayerIds: string[];
}

export interface BattleE2eSnapshot {
  battleKind: BattleScreenState["battleKind"];
  phase: BattleScreenState["phase"];
  turn: number;
  message: string | null;
  messageQueue: string[];
  selectedCommandIndex: number;
  selectedCommand: BattleCommand;
  selectedCommandLabel: string;
  selectedMoveIndex: number;
  selectedMoveName: string | null;
  selectedBagItemIndex: number;
  selectedPartySlotIndex: number;
  isForcedPartySwitch: boolean;
  partySlots: Array<{
    slotIndex: number;
    rect: BattleRect;
    name: string | null;
    level: number | null;
    currentHp: number | null;
    maxHp: number | null;
    status: string | null;
    isSelected: boolean;
    isCurrent: boolean;
    isFainted: boolean;
    isEmpty: boolean;
    canSwitch: boolean;
  }>;
  moveReplacement: {
    pokemonName: string;
    newMoveName: string;
    selectedMoveIndex: number;
    confirmationIndex?: number | null;
  } | null;
  result: BattleScreenState["result"];
  returnToWorld: BattleScreenState["returnToWorld"];
  battleEntrancePlaying: boolean;
  battleEntrancePlayed: boolean;
  authoritativeInputPending: boolean;
  competitive: CompetitiveBattleE2eSnapshot | null;
  fullRenderCount: number;
  animationFrameUpdateCount: number;
  hpAnimationPlaying: boolean;
  hpAnimationStartedCount: number;
  hitAnimationPlaying: boolean;
  hitAnimationStartedCount: number;
  captureAnimationPlaying: boolean;
  captureAnimationStartedCount: number;
  captureAnimationShakes: number | null;
  evolutionAnimationPlaying: boolean;
  evolutionAnimationStartedCount: number;
  evolutionFromSpeciesId: number | null;
  evolutionToSpeciesId: number | null;
  player: {
    name: string;
    level: number;
    currentHp: number;
    maxHp: number;
    displayedCurrentHp: number;
    hitAnimationStartedCount: number;
    status: BattlePokemonStatus;
    displayedStatus: BattlePokemonStatus;
    statusTextLabel: string | null;
    activePartySlotIndex: number;
    moves: Array<{ id: number; name: string }>;
  };
  opponent: {
    name: string;
    level: number;
    currentHp: number;
    maxHp: number;
    displayedCurrentHp: number;
    hitAnimationStartedCount: number;
    status: BattlePokemonStatus;
    displayedStatus: BattlePokemonStatus;
    statusTextLabel: string | null;
  };
}

export interface WorldE2eSnapshot {
  player: {
    x: number;
    y: number;
    facing: PlayerFacing;
    displayWidth: number;
    displayHeight: number;
  } | null;
  camera: {
    zoom: number;
    scrollX: number;
    scrollY: number;
    width: number;
    height: number;
  };
  shortcutGuideOpen: boolean;
  encounterLocked: boolean;
  battleIntroPlaying: boolean;
  partyHudVisible: boolean;
  pokemonStatusPanel: {
    slotIndex: number;
    name: string;
    level: number;
    currentHp: number | null;
    maxHp: number | null;
    status: NonNullable<PlayerPokemon["status"]>;
  } | null;
  pcBox: {
    open: boolean;
    focus: "party" | "box";
    partySlotIndex: number;
    boxIndex: number;
    message: string;
    partyCount: number;
    boxCount: number;
  };
  nurseHealing: { active: boolean; effectCount: number };
  nurseMessage: string;
  interactionPrompt: string | null;
  surface: "help" | "shop" | "inventory" | "pc" | "dice" | "party" | null;
  shopKind: "basic" | "premium" | null;
}

export interface PokeLoungeBattleLaunchSnapshot {
  matchId: string;
  bracketMatchId: string;
  assignmentRevision: number;
}

export function readPokeLoungeBattleLaunchSnapshot(
  value: unknown,
): PokeLoungeBattleLaunchSnapshot | null {
  const candidate = value as {
    battleKind?: unknown;
    projection?: {
      matchId?: unknown;
      bracketMatchId?: unknown;
      assignmentRevision?: unknown;
    };
  } | null;
  const projection = candidate?.projection;

  return candidate?.battleKind === "authoritative" &&
    typeof projection?.matchId === "string" &&
    typeof projection.bracketMatchId === "string" &&
    typeof projection.assignmentRevision === "number"
    ? {
        matchId: projection.matchId,
        bracketMatchId: projection.bracketMatchId,
        assignmentRevision: projection.assignmentRevision,
      }
    : null;
}

export interface PokeLoungeGameSurfaceSnapshot {
  width: number;
  height: number;
  clientWidth: number;
  clientHeight: number;
}

export interface PokeLoungeE2eController {
  getActiveSceneKey(): string | null;
  getAudioPlaybackSnapshot(): PokeLoungeAudioPlaybackSnapshot;
  getBattleSnapshot(): BattleE2eSnapshot | null;
  setBattleScenario(scenario: BattleE2eScenario): BattleE2eSnapshot | null;
  setBattleCommand(command: BattleE2eSnapshot["selectedCommand"]): BattleE2eSnapshot | null;
  setBattleMoveIndex(index: number): BattleE2eSnapshot | null;
  setBattleBagItemIndex(index: number): BattleE2eSnapshot | null;
  setBattlePartySlotIndex(index: number): BattleE2eSnapshot | null;
  confirmBattle(): BattleE2eSnapshot | null;
  drainBattleMessages(maxMessages?: number): BattleE2eSnapshot | null;
  getWorldSnapshot(): WorldE2eSnapshot | null;
  healAtNurseForTest(): WorldE2eSnapshot | null;
  startWildBattleForTest(input: WildBattleStartInput): WorldE2eSnapshot | null;
  startSoloChallengeForTest(): WorldE2eSnapshot | null;
  closeWorldShortcutGuide(): void;
  openWorldSurfaceForTest(surface: "shop" | "pc" | "dice"): WorldE2eSnapshot | null;
  setWorldPlayerPositionForTest(position: {
    x: number;
    y: number;
    facing?: PlayerFacing;
  }): WorldE2eSnapshot | null;
  openPcBoxForTest(): WorldE2eSnapshot | null;
  movePcBoxSelectionForTest(delta: number): WorldE2eSnapshot | null;
  togglePcBoxFocusForTest(): WorldE2eSnapshot | null;
  confirmPcBoxSelectionForTest(): WorldE2eSnapshot | null;
  closePcBoxForTest(): WorldE2eSnapshot | null;
  setCurrentLocalPlayerForTest(player: LocalPlayerState): void;
  sendCurrentPlayerChangedMapForTest(overrides?: Partial<PlayerSnapshot>): boolean;
  disposeRoomForTest(): void;
  reconnectRoomForTest(): boolean;
  beginWorldBattleLaunchTracking(): void;
  getWorldBattleLaunches(): PokeLoungeBattleLaunchSnapshot[];
  pressVirtualGamepad(button: VirtualGamepadButton): void;
  releaseVirtualGamepad(button: VirtualGamepadButton): void;
  getGameSurfaceSnapshot(): PokeLoungeGameSurfaceSnapshot | null;
  getGameStateSnapshot(): GameState;
  getRoomSnapshot(): { roomId: string | null; sessionId: string | null };
  getRoomTransportDiagnostics?(): ServerRoomTransportDiagnostics | null;
  completeTournamentForTest(): void;
}
