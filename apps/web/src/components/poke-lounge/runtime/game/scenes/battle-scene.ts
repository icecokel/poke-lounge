import { COMPETITIVE_STRUGGLE_MOVE_ID } from "@poke-lounge/battle/competitive-ruleset-config";
import {
  BATTLE_LAYOUT,
  getBattleOptionIndexAtPoint,
  getBattleStatusTextView,
  type BattleRect,
  type BattleSpriteBox,
} from "../battle/battle-layout";
import {
  createBattlePartySlotViews,
  getFirstSwitchableBattlePartySlotIndex,
  moveBattlePartySelection,
  type BattlePartySlotView,
} from "../battle/battle-party-select";
import { createSampleBattleState } from "../battle/battle-sample-state";
import {
  BATTLE_POKEMON_FRAME_SIZE,
  getBattlePokemonAlphaBounds,
} from "../battle/battle-pokemon-assets";
import {
  createWildBattleState,
  type RomPersonalRecordCollection,
  type RomRefinedMoveCollection,
} from "../battle/wild-battle-factory";
import { createPvpBattleState } from "../battle/pvp-battle-factory";
import {
  BATTLE_BACKGROUND_ASSET_KEY,
  BATTLE_WINDOW_FRAME_ASSET_KEY,
  ROM_BATTLE_WINDOW_STYLE,
} from "../battle/battle-design";
import {
  playBattleCancelSound,
  playBattleConfirmSound,
  playBattleHitSound,
  playPokemonFaintSound,
  playWildBattleBgm,
  stopWildBattleBgm,
} from "../battle/battle-audio";
import { getExperienceForLevel, WILD_BATTLE_EXPERIENCE_MULTIPLIER } from "../battle/experience";
import {
  BATTLE_END_CONFIRM_MESSAGE,
  chooseBattleBagItem,
  chooseBattleCommand,
  choosePartySlot,
  choosePlayerMove,
  isForcedPartySwitch,
  popBattleMessage,
} from "../battle/battle-logic";
import type {
  BattleCaptureAttempt,
  BattleCommand,
  BattleMove,
  BattleParticipant,
  BattlePartySlot,
  BattlePokemon,
  BattlePokemonStatus,
  BattleScreenState,
} from "../battle/battle-types";
import { formatReplacedMoveMessage, formatSkippedMoveMessage } from "../battle/level-up-moves";
import {
  planLevelUpBattleProgression,
  type PendingBattleMoveLearning,
} from "../battle/level-up-progression";
import { normalizePokemonEvolutionTable } from "../battle/pokemon-evolution";
import {
  formatRomEvolutionStartMessage,
  resolveRomEvolutionAnimationFrame,
  ROM_EVOLUTION_ANIMATION_DURATION_MS,
} from "../battle/evolution-presentation";
import {
  resolveRomCaptureAnimationFrame,
  ROM_CAPTURE_ANIMATION_DURATION_MS,
} from "../battle/capture-presentation";
import type { PokeLoungeRuntimeAssets } from "../assets/poke-lounge-runtime-assets";
import { getDefaultGameStateStore } from "../state/default-game-state-store";
import {
  getShopItemById,
  resolvePlayerDisplayName,
  type GameStateStore,
  type LocalPlayerState,
  type PlayerPokemon,
} from "../state/game-state-store";
import type { RuntimeItemId } from "../items/runtime-items";
import {
  dispatchPokeLoungeAccessibleStatus,
  dispatchPokeLoungeNotice,
} from "../ui/poke-lounge-ui-events";
import { setBattleSceneMarker } from "../ui/active-game-scene-marker";
import { FIELD_MAP } from "../world/field-map";
import {
  isMobileBattleMoveDisabled,
  type MobileBattleUiAction,
  type MobileBattleUiState,
} from "../ui/mobile-battle-ui";
import type {
  BattlePresentationState,
  BattleSpritePresentation,
  BattleUiStore,
} from "../battle/battle-ui-store";
import {
  hasPokeLoungeMobileFullscreenScene,
  usesPokeLoungeMobileShell,
} from "../ui/mobile-ui-capability";
import type { ShortcutGuideInputMode } from "../ui/shortcut-guide";
import { consumeVirtualGamepadPress, resetVirtualGamepad } from "../input/virtual-gamepad";
import { setShortcutGuideTouchControlsSuppressed } from "../input/mobile-touch-controls-visibility";
import type { WildEncounterCandidate } from "../world/wild-encounters";
import { getPokeLoungeCopyForUrl } from "../../../poke-lounge-copy";
import {
  canUseAuthoritativeStruggle,
  isLegalAuthoritativeAction,
  toAuthoritativeBattleState,
} from "../battle/authoritative-battle-adapter";
import {
  persistBattlePartyToWorld,
  persistCapturedPokemonToWorld,
  toPlayerPokemon,
} from "../battle/battle-world-persistence";
import type {
  CompetitiveProjection,
  CompetitiveRoomProjectionEvent,
  MultiplayerRoom,
  RoomEvent,
  RoomUnsubscribe,
} from "../network/local-preview-room";
import type { CompetitiveBattleLaunchKey } from "./competitive-battle-launch";
import type { BattleE2eScenario, BattleE2eSnapshot } from "../testing/poke-lounge-e2e-controller";
import {
  isCompetitiveAssignmentForPlayer,
  shouldPreemptLocalBattleForRound,
} from "./competitive-battle-launch";
import {
  isRoundReadinessDue,
  type TournamentStateRoomPayload,
} from "../network/tournament-projection";
import {
  animateRuntimeValue,
  clampUnit,
  lerp,
  scheduleRuntimeTask,
  type RuntimeAnimation,
} from "../runtime-animation";
import type { RuntimeKeyboard } from "../runtime-input";

export const BATTLE_COMMAND_LABELS = ["싸운다", "가방", "포켓몬", "도망"] as const;
export const BATTLE_SPRITE_CROP = { x: 0, y: 0, ...BATTLE_POKEMON_FRAME_SIZE } as const;
export const BATTLE_SPRITE_SOURCE_SIZE = BATTLE_POKEMON_FRAME_SIZE;
export const BATTLE_SPRITE_VISIBLE_ALPHA_THRESHOLD = 8;
export const BATTLE_SCENE_BACKGROUND_KEY = BATTLE_BACKGROUND_ASSET_KEY;
export const BATTLE_SCENE_WINDOW_FRAME_KEY = BATTLE_WINDOW_FRAME_ASSET_KEY;
export const BATTLE_SCENE_WINDOW_STYLE = ROM_BATTLE_WINDOW_STYLE;
export const BATTLE_HP_PANEL_WINDOW_OPTIONS = { radius: 4, includeFrameMarker: false } as const;
export const BATTLE_CONFIRM_KEY_CODES = ["Enter", "Space", "KeyZ"] as const;
const BATTLE_HP_DECREASE_TWEEN_MS = 560;
const BATTLE_HIT_TWEEN_MS = 300;
const BATTLE_MESSAGE_AUTO_ADVANCE_MS = 850;
const BATTLE_HIT_SHAKE_PIXELS = 4;
const BATTLE_ENTRANCE_TWEEN_MS = 640;
const E2E_SINGLE_LEVEL_BASE_EXP_YIELD = Math.ceil(500 / WILD_BATTLE_EXPERIENCE_MULTIPLIER);
const BATTLE_BAG_ITEM_IDS = [
  "potion",
  "pokeball",
  "antidote",
  "superPotion",
  "hyperPotion",
  "revive",
  "ultraBall",
] as const satisfies readonly RuntimeItemId[];

type BattleBagItemId = (typeof BATTLE_BAG_ITEM_IDS)[number];
interface PendingMoveLearning {
  slotIndex: number;
  pokemonName: string;
  newMove: BattleMove;
}

interface BattleEvolutionTransition {
  fromPokemon: BattlePokemon;
  toPokemon: BattlePokemon;
}

type AuthoritativeTerminalTransition = {
  key: CompetitiveBattleLaunchKey;
  status: "visible" | "acknowledged" | "transitioned";
};

interface BattleWorldPositionPolicy {
  persistWorldPosition?: boolean;
}

export interface WildBattleSceneData extends BattleWorldPositionPolicy {
  battleKind: "wild";
  encounter: WildEncounterCandidate;
  returnToWorld: BattleScreenState["returnToWorld"];
}

export interface TrainerBattleSceneData extends BattleWorldPositionPolicy {
  battleKind: "trainer";
  soloChallenge?: boolean;
  matchId: string;
  roundIndex: number;
  matchIndex: number;
  player: LocalPlayerState;
  opponent: LocalPlayerState;
  returnToWorld: BattleScreenState["returnToWorld"];
}

interface BattleE2eSceneData {
  e2eScenario: BattleE2eScenario;
}

export interface AuthoritativeBattleSceneData extends BattleWorldPositionPolicy {
  battleKind: "authoritative";
  ownPlayerId: string;
  spectating?: boolean;
  projection: CompetitiveProjection;
  returnToWorld: BattleScreenState["returnToWorld"];
}

type BattleHpSide = "player" | "opponent";
type BattleDisplayedHp = Record<BattleHpSide, number>;
type BattleDisplayedStatus = Record<BattleHpSide, BattlePokemonStatus>;
const BATTLE_HP_SIDES = ["player", "opponent"] as const satisfies readonly BattleHpSide[];

interface BattleHitEffectState {
  progress: number;
  startedCount: number;
  tween: RuntimeAnimation | null;
}

type BattleHitEffects = Record<BattleHpSide, BattleHitEffectState>;

export interface BattleSpriteVisibleBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function isWildBattleSceneData(data: unknown): data is WildBattleSceneData {
  return (
    isRecord(data) &&
    data.battleKind === "wild" &&
    isRecord(data.encounter) &&
    isRecord(data.returnToWorld)
  );
}

export function isTrainerBattleSceneData(data: unknown): data is TrainerBattleSceneData {
  return (
    isRecord(data) &&
    data.battleKind === "trainer" &&
    typeof data.matchId === "string" &&
    Number.isInteger(data.roundIndex) &&
    Number.isInteger(data.matchIndex) &&
    isRecord(data.player) &&
    isRecord(data.opponent) &&
    isRecord(data.returnToWorld)
  );
}

function isBattleE2eSceneData(data: unknown): data is BattleE2eSceneData {
  return (
    isRecord(data) &&
    (data.e2eScenario === "wild-victory" ||
      data.e2eScenario === "wild-defeat" ||
      data.e2eScenario === "wild-evolution" ||
      data.e2eScenario === "wild-move-learning" ||
      data.e2eScenario === "wild-status-badge" ||
      data.e2eScenario === "wild-paralysis")
  );
}

function isAuthoritativeBattleSceneData(data: unknown): data is AuthoritativeBattleSceneData {
  return (
    isRecord(data) &&
    data.battleKind === "authoritative" &&
    typeof data.ownPlayerId === "string" &&
    (data.spectating === undefined || typeof data.spectating === "boolean") &&
    isRecord(data.projection) &&
    isRecord(data.returnToWorld)
  );
}

export function getCroppedBattleSpriteDisplaySize(
  sprite: Pick<BattleSpriteBox, "width" | "height">,
): Pick<BattleSpriteBox, "width" | "height"> {
  return {
    width: Math.round(sprite.width * (BATTLE_SPRITE_SOURCE_SIZE.width / BATTLE_SPRITE_CROP.width)),
    height: Math.round(
      sprite.height * (BATTLE_SPRITE_SOURCE_SIZE.height / BATTLE_SPRITE_CROP.height),
    ),
  };
}

export function getCroppedBattleSpriteRenderBox(
  sprite: Pick<BattleSpriteBox, "x" | "y" | "width" | "height">,
): BattleRect {
  const displaySize = getCroppedBattleSpriteDisplaySize(sprite);

  return {
    x: sprite.x + (displaySize.width - sprite.width) / 2,
    y: sprite.y + (displaySize.height - sprite.height) / 2,
    width: displaySize.width,
    height: displaySize.height,
  };
}

export function getSingleFrameBattleSpriteRenderBox(
  sprite: Pick<BattleSpriteBox, "x" | "y" | "width" | "height">,
): BattleRect {
  return {
    x: sprite.x,
    y: sprite.y,
    width: sprite.width,
    height: sprite.height,
  };
}

export function getVisibleBoundsAlignedBattleSpriteRenderBox(
  sprite: Pick<BattleSpriteBox, "x" | "y" | "width" | "height">,
  visibleBounds: BattleSpriteVisibleBounds,
  crop: BattleSpriteVisibleBounds = BATTLE_SPRITE_CROP,
): BattleRect {
  const displaySize = getCroppedBattleSpriteDisplaySize(sprite);
  const scaleX = sprite.width / crop.width;
  const scaleY = sprite.height / crop.height;
  const visibleCenterX = visibleBounds.x + visibleBounds.width / 2;
  const visibleBottomY = visibleBounds.y + visibleBounds.height;
  const slotBottomY = sprite.y + sprite.height / 2;

  return {
    x: Math.round(sprite.x + displaySize.width / 2 - visibleCenterX * scaleX),
    y: Math.round(slotBottomY + displaySize.height / 2 - visibleBottomY * scaleY),
    width: displaySize.width,
    height: displaySize.height,
  };
}

export function getVisibleBoundsContainedBattleSpriteRenderBox(
  container: BattleRect,
  visibleBounds: BattleSpriteVisibleBounds,
): BattleRect {
  const visibleWidth = Math.max(1, visibleBounds.width);
  const visibleHeight = Math.max(1, visibleBounds.height);
  const scale = Math.min(container.width / visibleWidth, container.height / visibleHeight);
  const sourceCenterX = BATTLE_SPRITE_SOURCE_SIZE.width / 2;
  const sourceCenterY = BATTLE_SPRITE_SOURCE_SIZE.height / 2;
  const visibleCenterX = visibleBounds.x + visibleBounds.width / 2;
  const visibleBottomY = visibleBounds.y + visibleBounds.height;

  return {
    x: Math.round(container.x + container.width / 2 + (sourceCenterX - visibleCenterX) * scale),
    y: Math.round(container.y + container.height + (sourceCenterY - visibleBottomY) * scale),
    width: Math.max(1, Math.round(BATTLE_SPRITE_SOURCE_SIZE.width * scale)),
    height: Math.max(1, Math.round(BATTLE_SPRITE_SOURCE_SIZE.height * scale)),
  };
}

export function formatBattleMoveMeta(move: BattleMove): string {
  if (move.competitiveEffectSupport === "unsupported-primary") {
    return "효과 미지원";
  }
  if (move.competitiveEffectSupport === "unsupported-secondary") {
    return "부가 효과 미지원";
  }
  return `PP ${move.pp}/${move.maxPp} ${move.type}`;
}

export const getBattleCommandIndexAtPoint = getBattleOptionIndexAtPoint;

const COMMANDS: Array<{ label: (typeof BATTLE_COMMAND_LABELS)[number]; command: BattleCommand }> = [
  { label: "싸운다", command: "fight" },
  { label: "가방", command: "bag" },
  { label: "포켓몬", command: "pokemon" },
  { label: "도망", command: "run" },
];

export interface BattleControllerOptions {
  battleUiStore: BattleUiStore;
  gameStateStore?: GameStateStore;
  keyboard: RuntimeKeyboard;
  multiplayerRoom?: MultiplayerRoom;
  parent: HTMLElement;
  runtimeAssets: PokeLoungeRuntimeAssets;
  onRestart(data: unknown): void;
  onReturnToWorld(data: unknown): void;
}

export class BattleController {
  private state: BattleScreenState = createSampleBattleState();
  private selectedCommandIndex = 0;
  private selectedMoveIndex = 0;
  private selectedPartySlotIndex = 0;
  private selectedBagItemIndex = 0;
  private shortcutGuideOpen = false;
  private returningToWorld = false;
  private displayedHp: BattleDisplayedHp = { player: 0, opponent: 0 };
  private displayedStatus: BattleDisplayedStatus = { player: "normal", opponent: "normal" };
  private readonly hpTweens: Partial<Record<BattleHpSide, RuntimeAnimation>> = {};
  private readonly statusCommitTweens: Partial<Record<BattleHpSide, RuntimeAnimation>> = {};
  private hitEffects: BattleHitEffects = createBattleHitEffects();
  private battleEntrancePlaying = false;
  private battleEntranceProgress = 1;
  private battleEntrancePlayed = false;
  private battleEntranceTween: RuntimeAnimation | null = null;
  private captureAnimationPlaying = false;
  private captureAnimationProgress = 1;
  private captureAnimationTween: RuntimeAnimation | null = null;
  private captureAnimationStartedCount = 0;
  private captureAnimationAttempt: BattleCaptureAttempt | null = null;
  private evolutionAnimationPlaying = false;
  private evolutionAnimationProgress = 1;
  private evolutionAnimationTween: RuntimeAnimation | null = null;
  private evolutionAnimationStartedCount = 0;
  private evolutionTransition: BattleEvolutionTransition | null = null;
  private evolutionAnimationPending = false;
  private hpAnimationStartedCount = 0;
  private hitAnimationStartedCount = 0;
  private fullRenderCount = 0;
  private animationFrameUpdateCount = 0;
  private pendingMoveLearnings: PendingMoveLearning[] = [];
  private levelUpMoveLearningApplied = false;
  private persistWorldPositionOnReturn = true;
  private authoritativeProjection: CompetitiveProjection | null = null;
  private authoritativeOwnPlayerId: string | null = null;
  private authoritativeSpectating = false;
  private authoritativeInputPending = false;
  private authoritativeTerminalTransition: AuthoritativeTerminalTransition | null = null;
  private authoritativeConnectionStatus: RoomEvent["CONNECTION_STATUS"]["connectionStatus"] =
    "offline";
  private soloChallenge = false;
  private authoritativeUnsubscribers: RoomUnsubscribe[] = [];
  private competitivePreemptionQueued = false;
  private lastAccessibleStatus = "";
  private messageAutoAdvanceTimer: RuntimeAnimation | null = null;
  private sceneLifecycleActive = false;
  private sceneGeneration = 0;

  private readonly battleUiStore: BattleUiStore;
  private readonly gameStateStore: GameStateStore;
  private readonly keyboard: RuntimeKeyboard;
  private readonly multiplayerRoom?: MultiplayerRoom;
  private readonly ownerDocument: Document;
  private readonly runtimeAssets: PokeLoungeRuntimeAssets;

  constructor(private readonly options: BattleControllerOptions) {
    this.battleUiStore = options.battleUiStore;
    this.gameStateStore = options.gameStateStore ?? getDefaultGameStateStore();
    this.keyboard = options.keyboard;
    this.multiplayerRoom = options.multiplayerRoom;
    this.ownerDocument = options.parent.ownerDocument;
    this.runtimeAssets = options.runtimeAssets;
  }

  start(data: unknown = {}): void {
    this.cleanupSceneLifecycle();
    this.sceneLifecycleActive = true;
    this.sceneGeneration += 1;
    this.competitivePreemptionQueued = false;
    this.selectedCommandIndex = 0;
    this.selectedMoveIndex = 0;
    this.selectedPartySlotIndex = 0;
    this.selectedBagItemIndex = 0;
    this.state = this.createInitialState(data);
    this.soloChallenge = isTrainerBattleSceneData(data) && data.soloChallenge === true;
    this.persistWorldPositionOnReturn = !isRecord(data) || data.persistWorldPosition !== false;
    if (isAuthoritativeBattleSceneData(data)) {
      this.authoritativeProjection = data.projection;
      this.authoritativeOwnPlayerId = data.ownPlayerId;
      this.authoritativeSpectating = data.spectating === true;
      this.authoritativeInputPending =
        data.projection.status !== "completed" &&
        (this.authoritativeSpectating ||
          data.projection.submittedPlayerIds.includes(data.ownPlayerId));
      this.authoritativeTerminalTransition =
        data.projection.status === "completed"
          ? {
              key: {
                matchId: data.projection.matchId,
                assignmentRevision: data.projection.assignmentRevision,
              },
              status: "visible",
            }
          : null;
      this.authoritativeConnectionStatus = "offline";
      this.bindAuthoritativeRoom();
    } else {
      this.authoritativeProjection = null;
      this.authoritativeOwnPlayerId = null;
      this.authoritativeSpectating = false;
      this.authoritativeInputPending = false;
      this.authoritativeTerminalTransition = null;
      this.authoritativeConnectionStatus = "offline";
      this.bindCompetitiveAssignmentPreemption();
    }
    this.returningToWorld = false;
    this.battleEntrancePlayed = false;
    this.hpAnimationStartedCount = 0;
    this.hitAnimationStartedCount = 0;
    this.fullRenderCount = 0;
    this.animationFrameUpdateCount = 0;
    this.captureAnimationStartedCount = 0;
    this.captureAnimationProgress = 1;
    this.captureAnimationPlaying = false;
    this.captureAnimationAttempt = null;
    this.captureAnimationTween?.stop();
    this.captureAnimationTween = null;
    this.evolutionAnimationStartedCount = 0;
    this.evolutionAnimationProgress = 1;
    this.evolutionAnimationPlaying = false;
    this.evolutionAnimationTween?.stop();
    this.evolutionAnimationTween = null;
    this.evolutionTransition = null;
    this.evolutionAnimationPending = false;
    this.pendingMoveLearnings = [];
    this.levelUpMoveLearningApplied = false;
    this.lastAccessibleStatus = "";
    this.cancelHpTweens();
    this.cancelStatusCommitTweens();
    this.resetHitEffects();
    this.syncDisplayedHpToState();
    this.syncDisplayedStatusToState();
    this.setBattleUiSceneMarker(true);
    this.battleUiStore.setActionHandler(
      function callback(this: BattleController, action: MobileBattleUiAction): void {
        return this.handleBattleUiAction(action);
      }.bind(this),
    );
    this.render();
    playWildBattleBgm();
    if (this.authoritativeProjection?.status === "completed") {
      this.finishBattleEntranceAnimation();
      this.render();
    } else {
      this.playBattleEntranceAnimation();
    }
    this.scheduleBattleMessageAutoAdvance();
  }

  update(): void {
    if (
      usesPokeLoungeMobileShell(this.ownerDocument) &&
      hasPokeLoungeMobileFullscreenScene(this.ownerDocument)
    ) {
      this.keyboard.clearPresses();
      resetVirtualGamepad();
      return;
    }

    if (this.battleEntrancePlaying) {
      this.keyboard.clearPresses();
      resetVirtualGamepad();
      return;
    }

    if (this.captureAnimationPlaying || this.evolutionAnimationPlaying) {
      this.keyboard.clearPresses();
      resetVirtualGamepad();
      return;
    }

    if (
      this.isHpAnimationPlaying() ||
      this.isHitAnimationPlaying() ||
      this.isStatusCommitPlaying()
    ) {
      this.keyboard.clearPresses();
      resetVirtualGamepad();
      return;
    }

    if (consumeVirtualGamepadPress("help") || this.keyboard.consume("KeyH")) {
      playBattleConfirmSound();
      this.toggleShortcutGuide();
      return;
    }

    if (this.shortcutGuideOpen) {
      if (
        this.consumeKeyboardConfirm() ||
        consumeVirtualGamepadPress("confirm") ||
        consumeVirtualGamepadPress("back") ||
        this.keyboard.consume("Escape", "Backspace")
      ) {
        playBattleCancelSound();
        this.closeShortcutGuide();
      }

      return;
    }

    if (
      consumeVirtualGamepadPress("bag") &&
      this.state.phase === "command" &&
      this.state.messageQueue.length === 0
    ) {
      playBattleConfirmSound();
      this.selectedBagItemIndex = 0;
      this.setBattleState(chooseBattleCommand(this.state, "bag"));
      return;
    }

    if (this.consumeKeyboardConfirm() || consumeVirtualGamepadPress("confirm")) {
      playBattleConfirmSound();
      this.confirmSelection();
    }

    if (consumeVirtualGamepadPress("back") || this.keyboard.consume("Escape", "Backspace")) {
      playBattleCancelSound();
      this.goBack();
    }

    if (this.state.phase === "command") {
      this.updateCommandSelection();
    }

    if (this.state.phase === "move-select") {
      this.updateMoveSelection();
    }

    if (this.state.phase === "move-replace-select") {
      this.updateMoveSelection();
    }

    if (this.state.phase === "party-select") {
      this.updatePartySelection();
    }

    if (this.state.phase === "bag-select") {
      this.updateBagSelection();
    }
  }

  confirmSelectionForTest(): void {
    this.confirmSelection();
  }

  getE2eSnapshotForTest(): BattleE2eSnapshot {
    const selectedCommand = COMMANDS[this.selectedCommandIndex] ?? COMMANDS[0];
    const selectedMove = this.state.player.pokemon.moves[this.selectedMoveIndex] ?? null;

    return {
      battleKind: this.state.battleKind,
      phase: this.state.phase,
      turn: this.state.turn,
      message: this.getVisibleBattleMessage(),
      messageQueue: [...this.state.messageQueue],
      selectedCommandIndex: this.selectedCommandIndex,
      selectedCommand: selectedCommand.command,
      selectedCommandLabel: selectedCommand.label,
      selectedMoveIndex: this.selectedMoveIndex,
      selectedMoveName: selectedMove?.name ?? null,
      selectedBagItemIndex: this.selectedBagItemIndex,
      selectedPartySlotIndex: this.selectedPartySlotIndex,
      isForcedPartySwitch: isForcedPartySwitch(this.state),
      partySlots: this.getBattlePartySlotViews().map(function mapItem(slot) {
        return {
          slotIndex: slot.slotIndex,
          rect: { ...slot.rect },
          name: slot.pokemon?.name ?? null,
          level: slot.pokemon?.level ?? null,
          currentHp: slot.pokemon?.currentHp ?? null,
          maxHp: slot.pokemon?.maxHp ?? null,
          status: slot.pokemon?.status ?? null,
          isSelected: slot.isSelected,
          isCurrent: slot.isCurrent,
          isFainted: slot.isFainted,
          isEmpty: slot.isEmpty,
          canSwitch: slot.canSwitch,
        };
      }),
      moveReplacement: this.getCurrentPendingMoveLearning()
        ? {
            pokemonName: this.getCurrentPendingMoveLearning()?.pokemonName ?? "",
            newMoveName: this.getCurrentPendingMoveLearning()?.newMove.name ?? "",
            selectedMoveIndex: this.selectedMoveIndex,
          }
        : null,
      result: this.state.result ? { ...this.state.result } : null,
      returnToWorld: this.state.returnToWorld ? { ...this.state.returnToWorld } : undefined,
      battleEntrancePlaying: this.battleEntrancePlaying,
      battleEntrancePlayed: this.battleEntrancePlayed,
      authoritativeInputPending: this.authoritativeInputPending,
      competitive: this.authoritativeProjection
        ? {
            matchId: this.authoritativeProjection.matchId,
            bracketMatchId: this.authoritativeProjection.bracketMatchId,
            assignmentRevision: this.authoritativeProjection.assignmentRevision,
            currentTurn: this.authoritativeProjection.currentTurn,
            status: this.authoritativeProjection.status,
            terminal: structuredClone(this.authoritativeProjection.terminal ?? null),
            submittedPlayerIds: [...this.authoritativeProjection.submittedPlayerIds],
          }
        : null,
      fullRenderCount: this.fullRenderCount,
      animationFrameUpdateCount: this.animationFrameUpdateCount,
      hpAnimationPlaying: this.isHpAnimationPlaying(),
      hpAnimationStartedCount: this.hpAnimationStartedCount,
      hitAnimationPlaying: this.isHitAnimationPlaying(),
      hitAnimationStartedCount: this.hitAnimationStartedCount,
      captureAnimationPlaying: this.captureAnimationPlaying,
      captureAnimationStartedCount: this.captureAnimationStartedCount,
      captureAnimationShakes: this.captureAnimationAttempt?.shakes ?? null,
      evolutionAnimationPlaying: this.evolutionAnimationPlaying,
      evolutionAnimationStartedCount: this.evolutionAnimationStartedCount,
      evolutionFromSpeciesId: this.evolutionTransition?.fromPokemon.speciesId ?? null,
      evolutionToSpeciesId: this.evolutionTransition?.toPokemon.speciesId ?? null,
      player: {
        name: this.state.player.pokemon.name,
        level: this.state.player.pokemon.level,
        currentHp: this.state.player.pokemon.currentHp,
        maxHp: this.state.player.pokemon.maxHp,
        displayedCurrentHp: Math.round(this.displayedHp.player),
        hitAnimationStartedCount: this.hitEffects.player.startedCount,
        status: this.state.player.pokemon.status,
        displayedStatus: this.displayedStatus.player,
        statusTextLabel: getBattleStatusTextView(this.displayedStatus.player)?.label ?? null,
        activePartySlotIndex: this.state.player.activePartySlotIndex,
        moves: this.state.player.pokemon.moves.map(function mapItem(move) {
          return { id: move.id, name: move.name };
        }),
      },
      opponent: {
        name: this.state.opponent.pokemon.name,
        level: this.state.opponent.pokemon.level,
        currentHp: this.state.opponent.pokemon.currentHp,
        maxHp: this.state.opponent.pokemon.maxHp,
        displayedCurrentHp: Math.round(this.displayedHp.opponent),
        hitAnimationStartedCount: this.hitEffects.opponent.startedCount,
        status: this.state.opponent.pokemon.status,
        displayedStatus: this.displayedStatus.opponent,
        statusTextLabel: getBattleStatusTextView(this.displayedStatus.opponent)?.label ?? null,
      },
    };
  }

  setBattleScenarioForTest(scenario: BattleE2eScenario): void {
    this.selectedCommandIndex = 0;
    this.selectedMoveIndex = 0;
    this.selectedPartySlotIndex = 0;
    this.selectedBagItemIndex = 0;
    this.returningToWorld = false;
    this.authoritativeTerminalTransition = null;
    this.battleEntrancePlayed = false;
    this.hpAnimationStartedCount = 0;
    this.hitAnimationStartedCount = 0;
    this.captureAnimationStartedCount = 0;
    this.captureAnimationProgress = 1;
    this.captureAnimationPlaying = false;
    this.captureAnimationAttempt = null;
    this.captureAnimationTween?.stop();
    this.captureAnimationTween = null;
    this.evolutionAnimationStartedCount = 0;
    this.evolutionAnimationProgress = 1;
    this.evolutionAnimationPlaying = false;
    this.evolutionAnimationTween?.stop();
    this.evolutionAnimationTween = null;
    this.evolutionTransition = null;
    this.evolutionAnimationPending = false;
    this.pendingMoveLearnings = [];
    this.levelUpMoveLearningApplied = false;
    this.persistWorldPositionOnReturn = true;
    this.state = createBattleScenarioStateForTest(scenario);
    this.cancelHpTweens();
    this.cancelStatusCommitTweens();
    this.resetHitEffects();
    this.syncDisplayedHpToState();
    this.syncDisplayedStatusToState();
    this.render();
    this.playBattleEntranceAnimation();
  }

  setSelectedCommandForTest(command: BattleCommand): void {
    const commandIndex = COMMANDS.findIndex(function findItemIndex(candidate) {
      return candidate.command === command;
    });

    if (commandIndex < 0) {
      return;
    }

    this.selectedCommandIndex = commandIndex;
    this.render();
  }

  setSelectedMoveIndexForTest(index: number): void {
    if (!Number.isInteger(index)) {
      return;
    }

    this.selectedMoveIndex = Math.max(
      0,
      Math.min(this.state.player.pokemon.moves.length - 1, index),
    );
    this.render();
  }

  setSelectedBagItemIndexForTest(index: number): void {
    if (!Number.isInteger(index)) {
      return;
    }

    this.selectedBagItemIndex = Math.max(0, index);
    this.render();
  }

  setSelectedPartySlotIndexForTest(index: number): void {
    if (!Number.isInteger(index)) {
      return;
    }

    this.selectedPartySlotIndex = Math.max(0, Math.min(5, index));
    this.render();
  }

  openShortcutGuideForTest(): void {
    this.openShortcutGuide();
  }

  closeShortcutGuideForTest(): void {
    this.closeShortcutGuide();
  }

  isShortcutGuideOpenForTest(): boolean {
    return this.shortcutGuideOpen;
  }

  private consumeKeyboardConfirm(): boolean {
    return this.keyboard.consume(...BATTLE_CONFIRM_KEY_CODES);
  }

  private setBattleUiSceneMarker(active: boolean): void {
    setBattleSceneMarker(this.options.parent, active);
  }

  private usesMobileBattleDeck(): boolean {
    return this.options.parent.closest("[data-poke-lounge-mobile-shell='true']") !== null;
  }

  public handleBattleUiAction(action: MobileBattleUiAction): void {
    if (
      this.battleEntrancePlaying ||
      this.captureAnimationPlaying ||
      this.evolutionAnimationPlaying ||
      this.isHpAnimationPlaying() ||
      this.isHitAnimationPlaying() ||
      this.isStatusCommitPlaying()
    ) {
      return;
    }

    if (action.type === "toggle-help") {
      playBattleConfirmSound();
      this.toggleShortcutGuide();
      return;
    }

    if (this.authoritativeInputPending || this.shortcutGuideOpen) {
      return;
    }

    if (action.type === "confirm-message") {
      if (this.state.messageQueue.length > 0) {
        playBattleConfirmSound();
        this.confirmSelection();
      }
      return;
    }

    if (action.type === "go-back") {
      if (this.state.messageQueue.length === 0) {
        playBattleCancelSound();
        this.goBack();
      }
      return;
    }

    if (this.state.messageQueue.length > 0) {
      return;
    }

    if (action.type === "select-command" && this.state.phase === "command") {
      if (!COMMANDS[action.index]) {
        return;
      }

      this.selectedCommandIndex = action.index;
      playBattleConfirmSound();
      this.confirmSelection();
      return;
    }

    if (action.type === "select-move" && this.state.phase === "move-select") {
      const move = this.state.player.pokemon.moves[action.index];
      if (!move || move.pp <= 0) {
        return;
      }

      this.selectedMoveIndex = action.index;
      playBattleConfirmSound();
      this.confirmSelection();
      return;
    }

    if (
      action.type === "select-move-replacement" &&
      this.state.phase === "move-replace-select" &&
      this.state.player.pokemon.moves[action.index]
    ) {
      this.selectedMoveIndex = action.index;
      playBattleConfirmSound();
      this.confirmSelection();
      return;
    }

    if (action.type === "select-party" && this.state.phase === "party-select") {
      const slot = this.getBattlePartySlotViews()[action.index];
      if (!slot || !slot.canSwitch) {
        playBattleCancelSound();
        this.render();
        return;
      }

      this.selectedPartySlotIndex = action.index;
      playBattleConfirmSound();
      this.confirmSelection();
      return;
    }

    if (action.type === "select-item" && this.state.phase === "bag-select") {
      const itemId = this.getBattleBagItemIds()[action.index];
      const quantity = itemId
        ? (this.gameStateStore.getCurrentLocalPlayer().inventory[itemId] ?? 0)
        : 0;
      if (!itemId || quantity <= 0) {
        playBattleCancelSound();
        this.render();
        return;
      }

      this.selectedBagItemIndex = action.index;
      playBattleConfirmSound();
      this.confirmSelection();
    }
  }

  private publishBattleUiState(): void {
    if (!this.battleUiStore) {
      return;
    }

    const phase = this.state.phase;
    if (
      phase !== "intro" &&
      phase !== "command" &&
      phase !== "move-select" &&
      phase !== "move-replace-select" &&
      phase !== "party-select" &&
      phase !== "bag-select" &&
      phase !== "resolving" &&
      phase !== "ended"
    ) {
      return;
    }

    const inventory = this.gameStateStore.getCurrentLocalPlayer().inventory;
    const pendingMoveLearning = this.getCurrentPendingMoveLearning();
    const state: MobileBattleUiState = {
      phase,
      message: this.getVisibleBattleMessage(),
      isHelpOpen: this.shortcutGuideOpen,
      requiresConfirmation:
        this.state.messageQueue[0] === BATTLE_END_CONFIRM_MESSAGE ||
        this.authoritativeProjection?.status === "completed",
      spectating: this.authoritativeSpectating,
      isInputLocked:
        this.battleEntrancePlaying ||
        this.captureAnimationPlaying ||
        this.evolutionAnimationPlaying ||
        this.isHpAnimationPlaying() ||
        this.isHitAnimationPlaying() ||
        this.isStatusCommitPlaying() ||
        this.authoritativeInputPending ||
        this.shortcutGuideOpen,
      canGoBack:
        this.state.messageQueue.length === 0 &&
        !isForcedPartySwitch(this.state) &&
        (phase === "move-select" ||
          phase === "move-replace-select" ||
          phase === "party-select" ||
          phase === "bag-select"),
      isForcedPartySwitch: isForcedPartySwitch(this.state),
      commands: COMMANDS.map(
        function mapItem(
          this: BattleController,
          command: { label: (typeof BATTLE_COMMAND_LABELS)[number]; command: BattleCommand },
          index: number,
        ): { id: BattleCommand; selected: boolean } {
          return {
            id: command.command,
            selected: index === this.selectedCommandIndex,
          };
        }.bind(this),
      ),
      moves: this.state.player.pokemon.moves.map(
        function mapItem(
          this: BattleController,
          move: BattleMove,
          index: number,
        ): {
          index: number;
          name: string;
          pp: number;
          maxPp: number;
          type: string;
          effectNotice: string | null;
          selected: boolean;
          disabled: boolean;
        } {
          return {
            index,
            name: move.name,
            pp: move.pp,
            maxPp: move.maxPp,
            type: move.type,
            effectNotice:
              move.competitiveEffectSupport === "unsupported-primary"
                ? "효과 미지원"
                : move.competitiveEffectSupport === "unsupported-secondary"
                  ? "부가 효과 미지원"
                  : null,
            selected: index === this.selectedMoveIndex,
            disabled:
              isMobileBattleMoveDisabled(phase, move.pp) ||
              move.competitiveEffectSupport === "unsupported-primary",
          };
        }.bind(this),
      ),
      party: this.getBattlePartySlotViews().map(function mapItem(slot) {
        return {
          slotIndex: slot.slotIndex,
          name: slot.pokemon?.name ?? "-",
          level: slot.pokemon?.level ?? 0,
          currentHp: slot.pokemon?.currentHp ?? 0,
          maxHp: slot.pokemon?.maxHp ?? 0,
          status: slot.pokemon?.status ?? null,
          selected: slot.isSelected,
          isCurrent: slot.isCurrent,
          isFainted: slot.isFainted,
          isEmpty: slot.isEmpty,
          canSwitch: slot.canSwitch,
          sprite: slot.pokemon?.frontSprite ?? null,
        };
      }),
      items: this.getBattleBagItemIds().map(
        function mapItem(
          this: BattleController,
          itemId:
            | "potion"
            | "pokeball"
            | "antidote"
            | "superPotion"
            | "hyperPotion"
            | "revive"
            | "ultraBall",
          index: number,
        ): {
          index: number;
          id:
            | "potion"
            | "pokeball"
            | "antidote"
            | "superPotion"
            | "hyperPotion"
            | "revive"
            | "ultraBall";
          name: string;
          count: number;
          selected: boolean;
          disabled: boolean;
        } {
          const item = getShopItemById(itemId);
          const count = inventory[itemId] ?? 0;

          return {
            index,
            id: itemId,
            name: item?.displayName ?? itemId,
            count,
            selected: index === this.selectedBagItemIndex,
            disabled: count <= 0,
          };
        }.bind(this),
      ),
      moveReplacement: pendingMoveLearning
        ? {
            pokemonName: pendingMoveLearning.pokemonName,
            newMoveName: pendingMoveLearning.newMove.name,
            newMovePp: pendingMoveLearning.newMove.pp,
            newMoveMaxPp: pendingMoveLearning.newMove.maxPp,
            newMoveType: pendingMoveLearning.newMove.type,
          }
        : null,
    };

    this.battleUiStore.publish({
      controls: state,
      presentation: this.createBattlePresentationState(),
    });
  }

  private publishBattlePresentationState(): void {
    this.battleUiStore.publishPresentation(this.createBattlePresentationState());
  }

  private createBattlePresentationState(): BattlePresentationState {
    const entranceProgress = clampUnit(this.battleEntranceProgress);
    const entranceOffset = Math.round((1 - entranceProgress) * 18);
    const entranceAlpha = 0.35 + entranceProgress * 0.65;
    const playerHit = this.getHitRenderEffect("player");
    const opponentHit = this.getHitRenderEffect("opponent");
    const captureOpponent = this.getCaptureOpponentRenderEffect();
    const playerBox = getVisibleBoundsAlignedBattleSpriteRenderBox(
      BATTLE_LAYOUT.playerSprite,
      getBattlePokemonAlphaBounds(this.state.player.pokemon.backSprite),
    );
    const opponentBox = getVisibleBoundsAlignedBattleSpriteRenderBox(
      BATTLE_LAYOUT.opponentSprite,
      getBattlePokemonAlphaBounds(this.state.opponent.pokemon.frontSprite),
    );
    const evolution = this.createBattleEvolutionPresentation();

    return {
      authoritative: {
        connectionStatus: this.authoritativeConnectionStatus,
        inputPending: this.authoritativeInputPending,
        spectating: this.authoritativeSpectating,
      },
      battleKind: this.state.battleKind,
      capture: this.createBattleCapturePresentation(opponentBox),
      entrance: { active: this.battleEntrancePlaying, progress: entranceProgress },
      evolution,
      help: { inputMode: this.getShortcutGuideInputMode(), open: this.shortcutGuideOpen },
      message: this.getVisibleBattleMessage(),
      opponent: {
        currentHp: this.state.opponent.pokemon.currentHp,
        healing: this.getDisplayedHpTarget("opponent") > this.displayedHp.opponent,
        activeSlotIndex: this.state.opponent.activePartySlotIndex,
        displayName:
          this.state.battleKind === "wild"
            ? this.state.opponent.displayName
            : resolvePlayerDisplayName(
                this.gameStateStore.getState(),
                this.state.opponent.playerId,
                this.state.opponent.displayName,
              ),
        displayedHp: this.displayedHp.opponent,
        level: this.state.opponent.pokemon.level,
        maxHp: this.state.opponent.pokemon.maxHp,
        name: this.state.opponent.pokemon.name,
        sprite: this.createBattleSpritePresentation({
          alpha: entranceAlpha * opponentHit.alpha * captureOpponent.alpha,
          height: opponentBox.height * captureOpponent.scale,
          sprite: this.state.opponent.pokemon.frontSprite,
          width: opponentBox.width * captureOpponent.scale,
          x: opponentBox.x + entranceOffset + opponentHit.offsetX,
          y: opponentBox.y,
        }),
        status: this.displayedStatus.opponent,
      },
      phase: this.state.phase,
      player: {
        activeSlotIndex: this.state.player.activePartySlotIndex,
        healing: this.getDisplayedHpTarget("player") > this.displayedHp.player,
        currentHp: this.state.player.pokemon.currentHp,
        displayName: this.authoritativeProjection
          ? resolvePlayerDisplayName(
              this.gameStateStore.getState(),
              this.authoritativeSpectating
                ? this.state.player.playerId
                : (this.authoritativeOwnPlayerId ?? this.state.player.playerId),
              this.authoritativeSpectating
                ? this.state.player.displayName
                : this.gameStateStore.getCurrentLocalPlayer().displayName,
            )
          : this.gameStateStore.getCurrentLocalPlayer().displayName,
        displayedHp: this.displayedHp.player,
        level: this.state.player.pokemon.level,
        maxHp: this.state.player.pokemon.maxHp,
        name: this.state.player.pokemon.name,
        sprite: this.createBattleSpritePresentation({
          alpha: entranceAlpha * playerHit.alpha,
          height: playerBox.height,
          sprite: this.state.player.pokemon.backSprite,
          width: playerBox.width,
          x: playerBox.x - entranceOffset + playerHit.offsetX,
          y: playerBox.y,
        }),
        status: this.displayedStatus.player,
      },
    };
  }

  private createBattleSpritePresentation({
    alpha,
    height,
    sprite,
    width,
    x,
    y,
    tint = null,
  }: Omit<BattleSpritePresentation, "tint"> & {
    tint?: BattleSpritePresentation["tint"];
  }): BattleSpritePresentation {
    return { alpha, height, sprite, tint, width, x, y };
  }

  private createBattleCapturePresentation(
    targetBox: BattleRect,
  ): BattlePresentationState["capture"] {
    const attempt = this.captureAnimationAttempt;
    if (!attempt) {
      return null;
    }

    const progress = clampUnit(this.captureAnimationProgress);
    if (!attempt.caught && progress >= 1) {
      return null;
    }

    const frame = resolveRomCaptureAnimationFrame(progress, attempt.shakes, attempt.caught);
    const start = { x: 70, y: 126 };
    const impact = { x: targetBox.x, y: targetBox.y - 2 };
    const landed = { x: targetBox.x, y: targetBox.y + 34 };
    let ballX = landed.x;
    let ballY = landed.y;

    if (frame.stage === "throw") {
      const throwProgress = 1 - (1 - frame.stageProgress) ** 3;
      ballX = lerp(start.x, impact.x, throwProgress);
      ballY = lerp(start.y, impact.y, throwProgress) - Math.sin(frame.stageProgress * Math.PI) * 42;
    } else if (frame.stage === "absorb") {
      ballX = impact.x;
      ballY = impact.y;
    } else if (frame.stage === "fall") {
      const fallProgress = frame.stageProgress ** 2;
      ballX = lerp(impact.x, landed.x, fallProgress);
      ballY = lerp(impact.y, landed.y, fallProgress);
    } else {
      ballX += frame.shakeOffsetX;
      ballY += frame.bounceOffsetY + frame.shakeOffsetY;
    }

    return {
      ballItemId: attempt.ballItemId,
      ballRotation: frame.ballRotation,
      ballX,
      ballY,
      caught: attempt.caught,
      resultProgress: frame.stage === "result" ? frame.resultProgress : null,
      showBall: frame.showBall,
    };
  }

  private createBattleEvolutionPresentation(): BattlePresentationState["evolution"] {
    const transition = this.evolutionTransition;
    if (!this.evolutionAnimationPlaying || !transition) {
      return null;
    }

    const progress = clampUnit(this.evolutionAnimationProgress);
    const frame = resolveRomEvolutionAnimationFrame(progress);
    const pokemon = frame.pokemon === "from" ? transition.fromPokemon : transition.toPokemon;
    const sprite = pokemon.frontSprite;
    const renderBox = getVisibleBoundsContainedBattleSpriteRenderBox(
      { x: 88, y: 40, width: 80, height: 80 },
      getBattlePokemonAlphaBounds(sprite),
    );

    return {
      flashAlpha: frame.flashAlpha,
      progress,
      silhouetteAlpha: frame.silhouetteAlpha,
      sprite: this.createBattleSpritePresentation({
        alpha: 1,
        height: renderBox.height * frame.scale,
        sprite,
        width: renderBox.width * frame.scale,
        x: renderBox.x,
        y: renderBox.y,
      }),
    };
  }

  private getShortcutGuideInputMode(): ShortcutGuideInputMode {
    return usesPokeLoungeMobileShell(this.ownerDocument) ? "touch" : "keyboard";
  }

  private createInitialState(data: unknown): BattleScreenState {
    if (isAuthoritativeBattleSceneData(data)) {
      return this.toAuthoritativeSceneState(
        data.projection,
        data.ownPlayerId,
        data.returnToWorld,
        undefined,
        data.spectating === true,
      );
    }

    if (isBattleE2eSceneData(data)) {
      return createBattleScenarioStateForTest(data.e2eScenario);
    }

    if (isTrainerBattleSceneData(data)) {
      return {
        ...createPvpBattleState({
          roundIndex: data.roundIndex,
          matchIndex: data.matchIndex,
          matchId: data.matchId,
          player: data.player,
          opponent: data.opponent,
          personalRecords: this.runtimeAssets.json.get(
            "romPersonalData",
          ) as RomPersonalRecordCollection,
          moveRecords: this.runtimeAssets.json.get(
            "romRefinedBattleRecords",
          ) as RomRefinedMoveCollection,
        }),
        returnToWorld: data.returnToWorld,
      };
    }

    if (isWildBattleSceneData(data)) {
      const localPlayer = this.gameStateStore.getCurrentLocalPlayer();

      return createWildBattleState({
        encounter: data.encounter,
        playerPokemon:
          localPlayer.party.find(function findItem(slot) {
            return slot.slotIndex === localPlayer.activePartySlotIndex;
          })?.pokemon ?? undefined,
        playerParty: localPlayer.party,
        activePartySlotIndex: localPlayer.activePartySlotIndex,
        returnToWorld: data.returnToWorld,
        personalRecords: this.runtimeAssets.json.get(
          "romPersonalData",
        ) as RomPersonalRecordCollection,
        moveRecords: this.runtimeAssets.json.get(
          "romRefinedBattleRecords",
        ) as RomRefinedMoveCollection,
      });
    }

    return createSampleBattleState();
  }

  private toAuthoritativeSceneState(
    projection: CompetitiveProjection,
    viewPlayerId: string,
    returnToWorld: BattleScreenState["returnToWorld"],
    previousState?: BattleScreenState,
    spectating = this.authoritativeSpectating,
  ): BattleScreenState {
    const state = toAuthoritativeBattleState(
      projection,
      viewPlayerId,
      returnToWorld,
      this.getBattleStatusCopy().waiting,
      previousState,
    );
    if (!spectating) {
      return state;
    }

    return {
      ...state,
      phase: state.result ? "ended" : "resolving",
      messageQueue: [
        state.result
          ? this.getBattleStatusCopy().spectatingCompleted
          : this.getBattleStatusCopy().spectating,
      ],
    };
  }

  private confirmSelection(): void {
    if (this.battleEntrancePlaying) {
      return;
    }

    if (
      this.authoritativeProjection?.status === "completed" &&
      this.authoritativeOwnPlayerId &&
      this.state.phase === "ended" &&
      this.state.returnToWorld &&
      this.authoritativeTerminalTransition?.status === "visible"
    ) {
      const completedCompetitiveBattle = this.authoritativeTerminalTransition.key;
      this.authoritativeTerminalTransition.status = "acknowledged";
      this.clearAuthoritativeSubscriptions();
      this.authoritativeInputPending = false;
      this.authoritativeProjection = null;
      this.authoritativeOwnPlayerId = null;
      this.returnToWorld(this.authoritativeSpectating ? undefined : completedCompetitiveBattle);
      return;
    }

    if (this.authoritativeProjection && this.authoritativeOwnPlayerId) {
      this.confirmAuthoritativeSelection();
      return;
    }

    if (
      this.state.phase === "ended" &&
      this.state.returnToWorld &&
      this.state.messageQueue[0] === BATTLE_END_CONFIRM_MESSAGE
    ) {
      this.returnToWorld();
      return;
    }

    if (this.state.messageQueue.length > 0) {
      this.advanceBattleMessage();
      return;
    }

    if (this.state.phase === "ended" && this.state.returnToWorld) {
      this.returnToWorld();
      return;
    }

    if (this.state.phase === "command") {
      const command = COMMANDS[this.selectedCommandIndex]?.command ?? "fight";
      const nextState = chooseBattleCommand(this.state, command);

      if (command === "pokemon") {
        this.selectedPartySlotIndex = getFirstSwitchableBattlePartySlotIndex(
          this.state.player.party,
          this.state.player.activePartySlotIndex,
        );
      }

      if (command === "bag") {
        this.selectedBagItemIndex = 0;
      }

      this.setBattleState(nextState);
      return;
    }

    if (this.state.phase === "bag-select") {
      const battleBagItemIds = this.getBattleBagItemIds();
      const itemId = battleBagItemIds[this.selectedBagItemIndex] ?? battleBagItemIds[0];
      const nextState = chooseBattleBagItem(this.state, itemId, {
        itemCount: this.gameStateStore.getCurrentLocalPlayer().inventory[itemId] ?? 0,
      });

      if (nextState.usedInventoryItemId) {
        this.gameStateStore.consumeInventoryItem(nextState.usedInventoryItemId, 1);
      }

      this.setBattleState(nextState);
      return;
    }

    if (this.state.phase === "party-select") {
      this.setBattleState(choosePartySlot(this.state, this.selectedPartySlotIndex));
      return;
    }

    if (this.state.phase === "move-select") {
      this.setBattleState(choosePlayerMove(this.state, this.selectedMoveIndex));
      return;
    }

    if (this.state.phase === "move-replace-select") {
      this.confirmMoveReplacement();
    }
  }

  private confirmAuthoritativeSelection(): void {
    const projection = this.authoritativeProjection;
    const ownPlayerId = this.authoritativeOwnPlayerId;

    if (
      !projection ||
      !ownPlayerId ||
      this.authoritativeInputPending ||
      this.state.phase === "ended"
    ) {
      return;
    }

    if (this.state.messageQueue.length > 0) {
      this.state = { ...this.state, phase: "command", messageQueue: [] };
      this.render();
      return;
    }

    if (this.state.phase === "command") {
      const command = COMMANDS[this.selectedCommandIndex]?.command ?? "fight";
      if (command === "fight") {
        const player = projection.currentState.playersById[ownPlayerId];
        const activePokemon = player?.team.find(function findItem(pokemon) {
          return pokemon.slotIndex === player.activeSlotIndex;
        });
        if (activePokemon && canUseAuthoritativeStruggle(activePokemon.moves)) {
          this.submitAuthoritativeAction({
            kind: "move",
            moveId: COMPETITIVE_STRUGGLE_MOVE_ID,
          });
          return;
        }

        this.state = { ...this.state, phase: "move-select" };
      } else if (command === "pokemon") {
        this.selectedPartySlotIndex = getFirstSwitchableBattlePartySlotIndex(
          this.state.player.party,
          this.state.player.activePartySlotIndex,
        );
        this.state = { ...this.state, phase: "party-select" };
      } else {
        this.setBattleState({
          ...this.state,
          messageQueue: ["서버 대전에서는 사용할 수 없습니다."],
        });
      }
      this.render();
      return;
    }

    if (this.state.phase === "move-select") {
      const player = projection.currentState.playersById[ownPlayerId];
      const activePokemon = player?.team.find(function findItem(pokemon) {
        return pokemon.slotIndex === player.activeSlotIndex;
      });
      const moveId = canUseAuthoritativeStruggle(activePokemon?.moves ?? [])
        ? COMPETITIVE_STRUGGLE_MOVE_ID
        : activePokemon?.moves[this.selectedMoveIndex]?.moveId;
      if (
        moveId === COMPETITIVE_STRUGGLE_MOVE_ID ||
        (typeof moveId === "number" && Number.isSafeInteger(moveId))
      ) {
        this.submitAuthoritativeAction({ kind: "move", moveId });
      }
      return;
    }

    if (this.state.phase === "party-select") {
      this.submitAuthoritativeAction({ kind: "switch", slotIndex: this.selectedPartySlotIndex });
    }
  }

  private submitAuthoritativeAction(
    action: { kind: "move"; moveId: number | "struggle" } | { kind: "switch"; slotIndex: number },
  ): void {
    const projection = this.authoritativeProjection;
    const ownPlayerId = this.authoritativeOwnPlayerId;
    if (
      !projection ||
      !ownPlayerId ||
      !this.multiplayerRoom ||
      this.authoritativeSpectating ||
      this.authoritativeInputPending
    ) {
      return;
    }
    if (!isLegalAuthoritativeAction(projection, ownPlayerId, action)) {
      if (action.kind === "switch") {
        playBattleCancelSound();
        this.render();
        return;
      }

      this.setBattleState({
        ...this.state,
        phase: "command",
        messageQueue: ["선택한 행동을 사용할 수 없습니다."],
      });
      this.render();
      return;
    }
    if (typeof crypto === "undefined" || !("randomUUID" in crypto)) {
      throw new Error("crypto.randomUUID is required for competitive battle commands");
    }

    this.authoritativeInputPending = true;
    this.state = {
      ...this.state,
      phase: "resolving",
      messageQueue: [this.getBattleStatusCopy().actionSending],
    };
    this.render();
    this.multiplayerRoom.send("COMPETITIVE_ACTION", {
      matchId: projection.matchId,
      assignmentRevision: projection.assignmentRevision,
      turn: projection.currentTurn,
      clientCommandId: crypto.randomUUID(),
      action,
    });
  }

  private bindAuthoritativeRoom(): void {
    if (!this.multiplayerRoom) {
      return;
    }

    this.authoritativeUnsubscribers.push(
      this.multiplayerRoom.on(
        "CONNECTION_STATUS",
        function handleEvent(
          this: BattleController,
          { connectionStatus }: { connectionStatus: "offline" | "connecting" | "online" },
        ): void {
          this.authoritativeConnectionStatus = connectionStatus;
          this.gameStateStore.setSession({
            sessionId: this.multiplayerRoom?.sessionId ?? null,
            roomId: this.multiplayerRoom?.roomId ?? null,
            connectionStatus,
          });
          if (
            connectionStatus !== "online" &&
            this.authoritativeProjection?.status !== "completed"
          ) {
            this.authoritativeInputPending = true;
            this.state = {
              ...this.state,
              phase: "resolving",
              messageQueue: [this.getBattleStatusCopy().connectionRecovering],
            };
            this.render();
          }
        }.bind(this),
      ),
      this.multiplayerRoom.on(
        "TOURNAMENT_STATE",
        function handleEvent(this: BattleController, payload: TournamentStateRoomPayload): void {
          const sceneGeneration = this.sceneGeneration;
          const nowMs = Date.now();
          const destination = this.state.returnToWorld;
          this.gameStateStore.applyTournamentSnapshotFromRoom(payload, nowMs);

          if (
            this.competitivePreemptionQueued ||
            !destination ||
            (this.authoritativeTerminalTransition !== null &&
              this.authoritativeTerminalTransition.status !== "transitioned") ||
            !isRoundReadinessDue(payload.roomStatus, payload.roomRound, nowMs)
          ) {
            return;
          }

          this.competitivePreemptionQueued = true;
          this.persistCapturedPokemon();
          this.gameStateStore.healCurrentParty();
          this.state = {
            ...this.state,
            phase: "resolving",
            messageQueue: [this.getBattleStatusCopy().roundWaiting],
          };
          this.render();
          queueMicrotask(
            function runMicrotask(this: BattleController): void {
              if (!this.isSceneLifecycleCurrent(sceneGeneration)) return;

              this.options.onReturnToWorld({
                spawnPosition: {
                  x: destination.x,
                  y: destination.y,
                  facing: destination.facing,
                },
              });
            }.bind(this),
          );
        }.bind(this),
      ),
      this.multiplayerRoom.on(
        "COMPETITIVE_STATE",
        function handleEvent(this: BattleController, event: CompetitiveRoomProjectionEvent): void {
          const { projection } = event;
          const current = this.authoritativeProjection;
          if (
            !current ||
            projection.matchId !== current.matchId ||
            projection.assignmentRevision !== current.assignmentRevision ||
            projection.currentTurn < current.currentTurn
          ) {
            return;
          }

          this.authoritativeProjection = projection;
          const viewPlayerId = event.viewPlayerId ?? event.ownPlayerId;
          const spectating = event.spectating === true;
          this.authoritativeOwnPlayerId = viewPlayerId;
          this.authoritativeSpectating = spectating;
          this.authoritativeInputPending =
            projection.status !== "completed" &&
            (spectating || projection.submittedPlayerIds.includes(viewPlayerId));
          if (projection.status === "completed") {
            const currentTerminal = this.authoritativeTerminalTransition;
            if (
              !currentTerminal ||
              currentTerminal.key.matchId !== projection.matchId ||
              currentTerminal.key.assignmentRevision !== projection.assignmentRevision
            ) {
              this.authoritativeTerminalTransition = {
                key: {
                  matchId: projection.matchId,
                  assignmentRevision: projection.assignmentRevision,
                },
                status: "visible",
              };
            }
            this.finishBattleEntranceAnimation();
          }
          const nextState = this.toAuthoritativeSceneState(
            projection,
            viewPlayerId,
            this.state.returnToWorld,
            this.state,
            spectating,
          );
          if (
            this.authoritativeConnectionStatus !== "online" &&
            projection.status !== "completed"
          ) {
            this.authoritativeInputPending = true;
            this.setBattleState({
              ...nextState,
              phase: "resolving",
              messageQueue: [this.getBattleStatusCopy().connectionRecovering],
            });
            return;
          }
          this.setBattleState(nextState);
        }.bind(this),
      ),
      this.multiplayerRoom.on(
        "COMPETITIVE_ACTION_FAILED",
        function handleEvent(
          this: BattleController,
          { matchId, message }: { matchId: string; status: number | null; message: string },
        ): void {
          if (matchId !== this.authoritativeProjection?.matchId) {
            return;
          }
          this.authoritativeInputPending = true;
          this.state = { ...this.state, phase: "resolving", messageQueue: [message] };
          this.render();
        }.bind(this),
      ),
      this.multiplayerRoom.on(
        "COMPETITIVE_ASSIGNMENT",
        function handleEvent(this: BattleController, event: CompetitiveRoomProjectionEvent): void {
          if (
            !this.authoritativeSpectating ||
            event.projection.matchId === this.authoritativeProjection?.matchId ||
            !this.state.returnToWorld ||
            !isCompetitiveAssignmentForPlayer(event)
          ) {
            return;
          }

          this.options.onRestart({
            battleKind: "authoritative",
            ownPlayerId: event.viewPlayerId ?? event.ownPlayerId,
            spectating: event.spectating === true,
            persistWorldPosition: this.persistWorldPositionOnReturn,
            projection: event.projection,
            returnToWorld: this.state.returnToWorld,
          });
        }.bind(this),
      ),
    );
  }

  private bindCompetitiveAssignmentPreemption(): void {
    if (!this.multiplayerRoom) {
      return;
    }

    this.authoritativeUnsubscribers.push(
      this.multiplayerRoom.on(
        "TOURNAMENT_STATE",
        function handleEvent(this: BattleController, payload: TournamentStateRoomPayload): void {
          const sceneGeneration = this.sceneGeneration;
          const nowMs = Date.now();
          const destination = this.state.returnToWorld;
          this.gameStateStore.applyTournamentSnapshotFromRoom(payload, nowMs);

          if (
            !destination ||
            !shouldPreemptLocalBattleForRound(
              payload.roomStatus,
              payload.roomRound,
              nowMs,
              this.competitivePreemptionQueued,
            )
          ) {
            return;
          }

          this.competitivePreemptionQueued = true;
          this.persistCapturedPokemon();
          this.gameStateStore.healCurrentParty();
          this.state = {
            ...this.state,
            phase: "resolving",
            messageQueue: [this.getBattleStatusCopy().roundWaiting],
          };
          this.render();
          queueMicrotask(
            function runMicrotask(this: BattleController): void {
              if (!this.isSceneLifecycleCurrent(sceneGeneration)) return;

              this.options.onReturnToWorld({
                spawnPosition: {
                  x: destination.x,
                  y: destination.y,
                  facing: destination.facing,
                },
              });
            }.bind(this),
          );
        }.bind(this),
      ),
      this.multiplayerRoom.on(
        "COMPETITIVE_ASSIGNMENT",
        function handleEvent(this: BattleController, event: CompetitiveRoomProjectionEvent): void {
          if (
            this.competitivePreemptionQueued ||
            !this.state.returnToWorld ||
            !isCompetitiveAssignmentForPlayer(event)
          ) {
            return;
          }

          this.competitivePreemptionQueued = true;
          this.persistCapturedPokemon();
          this.gameStateStore.healCurrentParty();
          const sceneGeneration = this.sceneGeneration;
          queueMicrotask(
            function runMicrotask(this: BattleController): void {
              if (!this.isSceneLifecycleCurrent(sceneGeneration)) return;

              this.options.onRestart({
                battleKind: "authoritative",
                ownPlayerId: event.viewPlayerId ?? event.ownPlayerId,
                spectating: event.spectating === true,
                persistWorldPosition: this.persistWorldPositionOnReturn,
                projection: event.projection,
                returnToWorld: this.state.returnToWorld,
              });
            }.bind(this),
          );
        }.bind(this),
      ),
    );
  }

  private clearAuthoritativeSubscriptions(): void {
    this.authoritativeUnsubscribers.forEach(function visitItem(unsubscribe) {
      return unsubscribe();
    });
    this.authoritativeUnsubscribers = [];
  }

  stop(): void {
    if (!this.sceneLifecycleActive) return;
    stopWildBattleBgm();
    this.cleanupSceneLifecycle();
    this.setBattleUiSceneMarker(false);
    dispatchPokeLoungeAccessibleStatus(this.ownerDocument, "필드 탐색");
  }

  isActive(): boolean {
    return this.sceneLifecycleActive;
  }

  private cleanupSceneLifecycle(): void {
    this.sceneLifecycleActive = false;
    this.clearAuthoritativeSubscriptions();
    this.messageAutoAdvanceTimer?.stop();
    this.messageAutoAdvanceTimer = null;
    this.battleUiStore.clear();
    this.shortcutGuideOpen = false;
    setShortcutGuideTouchControlsSuppressed(false);
    this.cancelHpTweens();
    this.cancelStatusCommitTweens();
    this.cancelHitTweens();
    this.battleEntranceTween?.stop();
    this.battleEntranceTween = null;
    this.captureAnimationTween?.stop();
    this.captureAnimationTween = null;
    this.evolutionAnimationTween?.stop();
    this.evolutionAnimationTween = null;
  }

  private isSceneLifecycleCurrent(sceneGeneration: number): boolean {
    return this.sceneLifecycleActive && this.sceneGeneration === sceneGeneration;
  }

  private setBattleState(
    nextState: BattleScreenState,
    options: { animateHpDecrease?: boolean; render?: boolean } = {},
  ): void {
    if (!this.sceneLifecycleActive) {
      return;
    }

    const nextCaptureAttempt = nextState.captureAttempt ?? null;
    const shouldPlayCaptureAnimation =
      nextCaptureAttempt !== null && nextCaptureAttempt !== this.state.captureAttempt;
    const shouldPlayEvolutionAnimation =
      this.evolutionAnimationPending &&
      this.evolutionTransition !== null &&
      nextState.messageQueue[0] ===
        formatRomEvolutionStartMessage(this.evolutionTransition.fromPokemon.name);
    const isEnteringForcedPartySwitch =
      isForcedPartySwitch(nextState) && !isForcedPartySwitch(this.state);

    if (isEnteringForcedPartySwitch) {
      this.selectedPartySlotIndex = getFirstSwitchableBattlePartySlotIndex(
        nextState.player.party,
        nextState.player.activePartySlotIndex,
      );
    }

    this.state = nextState;
    if (shouldPlayCaptureAnimation) {
      this.playCaptureAnimation(nextCaptureAttempt);
    }
    if (shouldPlayEvolutionAnimation && this.evolutionTransition) {
      this.playEvolutionAnimation(
        this.evolutionTransition.fromPokemon,
        this.evolutionTransition.toPokemon,
      );
    }
    this.syncDisplayedHpTargets({
      animateHpDecrease: options.animateHpDecrease ?? true,
    });

    if (options.render ?? true) {
      this.render();
    }
    this.scheduleBattleMessageAutoAdvance();
  }

  private advanceBattleMessage(): void {
    const nextState = popBattleMessage(this.state);
    this.setBattleState(
      nextState.messageQueue[0] === BATTLE_END_CONFIRM_MESSAGE
        ? this.applyLevelUpMoveLearning(nextState)
        : nextState,
    );
  }

  private scheduleBattleMessageAutoAdvance(): void {
    this.messageAutoAdvanceTimer?.stop();
    this.messageAutoAdvanceTimer = null;

    if (
      (this.authoritativeProjection &&
        (this.authoritativeInputPending ||
          this.state.phase === "resolving" ||
          this.state.phase === "ended")) ||
      this.state.messageQueue.length === 0 ||
      this.state.messageQueue[0] === BATTLE_END_CONFIRM_MESSAGE
    ) {
      return;
    }

    const sceneGeneration = this.sceneGeneration;
    const timer = scheduleRuntimeTask(
      BATTLE_MESSAGE_AUTO_ADVANCE_MS,
      function callback(this: BattleController): void {
        if (
          !this.isSceneLifecycleCurrent(sceneGeneration) ||
          this.messageAutoAdvanceTimer !== timer
        ) {
          return;
        }

        this.messageAutoAdvanceTimer = null;
        if (
          this.battleEntrancePlaying ||
          this.captureAnimationPlaying ||
          this.evolutionAnimationPlaying ||
          this.isHpAnimationPlaying() ||
          this.isHitAnimationPlaying() ||
          this.isStatusCommitPlaying() ||
          (usesPokeLoungeMobileShell(this.ownerDocument) &&
            hasPokeLoungeMobileFullscreenScene(this.ownerDocument)) ||
          this.shortcutGuideOpen
        ) {
          this.scheduleBattleMessageAutoAdvance();
          return;
        }

        if (this.authoritativeProjection) {
          this.setBattleState({ ...this.state, messageQueue: this.state.messageQueue.slice(1) });
        } else {
          this.advanceBattleMessage();
        }
      }.bind(this),
    );
    this.messageAutoAdvanceTimer = timer;
  }

  private syncDisplayedHpToState(): void {
    this.displayedHp = {
      player: this.getStateHp("player"),
      opponent: this.getStateHp("opponent"),
    };
  }

  private syncDisplayedStatusToState(): void {
    this.displayedStatus = {
      player: this.getStateStatus("player"),
      opponent: this.getStateStatus("opponent"),
    };
  }

  private syncDisplayedHpTargets({ animateHpDecrease }: { animateHpDecrease: boolean }): void {
    BATTLE_HP_SIDES.forEach(
      function visitItem(this: BattleController, side: "player" | "opponent"): void {
        const targetHp = this.getDisplayedHpTarget(side);
        const targetStatus = this.getDisplayedStatusTarget(side);
        const displayedHp = Number.isFinite(this.displayedHp[side])
          ? this.displayedHp[side]
          : targetHp;
        const existingTween = this.hpTweens[side];
        const existingStatusCommitTween = this.statusCommitTweens[side];

        if (existingTween) {
          delete this.hpTweens[side];
          existingTween.stop();
        }
        if (existingStatusCommitTween) {
          delete this.statusCommitTweens[side];
          existingStatusCommitTween.stop();
        }

        if (animateHpDecrease && targetHp !== displayedHp) {
          this.hpAnimationStartedCount += 1;
          if (targetHp < displayedHp) this.playHitAnimation(side);
          if (targetHp < displayedHp && this.shouldPlayAttackHitSound(side)) {
            playBattleHitSound();
          }
          const tween = animateRuntimeValue({
            from: displayedHp,
            to: targetHp,
            duration: BATTLE_HP_DECREASE_TWEEN_MS,
            ease: "cubic-out",
            onUpdate: value => {
              if (this.hpTweens[side] !== tween) {
                return;
              }

              this.displayedHp[side] = value;
              this.animationFrameUpdateCount += 1;
              this.publishBattlePresentationState();
            },
            onComplete: () => {
              if (this.hpTweens[side] !== tween) {
                return;
              }

              this.displayedHp[side] = targetHp;
              this.displayedStatus[side] = targetStatus;
              if (targetHp <= 0) {
                playPokemonFaintSound();
              }
              delete this.hpTweens[side];
              this.render();
            },
          });
          this.hpTweens[side] = tween;
          return;
        }

        this.displayedHp[side] = targetHp;
        if (animateHpDecrease && targetStatus !== this.displayedStatus[side]) {
          this.deferDisplayedStatus(side, targetStatus);
          return;
        }
        this.displayedStatus[side] = targetStatus;
      }.bind(this),
    );
  }

  private cancelHpTweens(): void {
    BATTLE_HP_SIDES.forEach(
      function visitItem(this: BattleController, side: "player" | "opponent"): void {
        const tween = this.hpTweens[side];
        delete this.hpTweens[side];
        tween?.stop();
      }.bind(this),
    );
  }

  private cancelStatusCommitTweens(): void {
    BATTLE_HP_SIDES.forEach(
      function visitItem(this: BattleController, side: "player" | "opponent"): void {
        const tween = this.statusCommitTweens[side];
        delete this.statusCommitTweens[side];
        tween?.stop();
      }.bind(this),
    );
  }

  private deferDisplayedStatus(side: BattleHpSide, targetStatus: BattlePokemonStatus): void {
    const tween = animateRuntimeValue({
      duration: BATTLE_HIT_TWEEN_MS,
      onUpdate: () => {},
      onComplete: () => {
        if (this.statusCommitTweens[side] !== tween) {
          return;
        }

        this.displayedStatus[side] = targetStatus;
        delete this.statusCommitTweens[side];
        this.render();
      },
    });

    this.statusCommitTweens[side] = tween;
  }

  private resetHitEffects(): void {
    this.cancelHitTweens();
    this.hitEffects = createBattleHitEffects();
  }

  private cancelHitTweens(): void {
    BATTLE_HP_SIDES.forEach(
      function visitItem(this: BattleController, side: "player" | "opponent"): void {
        const hitEffect = this.hitEffects[side];
        const tween = hitEffect?.tween;

        if (hitEffect) {
          hitEffect.tween = null;
        }
        tween?.stop();
      }.bind(this),
    );
  }

  private getStateHp(side: BattleHpSide): number {
    return side === "player"
      ? this.state.player.pokemon.currentHp
      : this.state.opponent.pokemon.currentHp;
  }

  private getStateStatus(side: BattleHpSide): BattlePokemonStatus {
    return side === "player"
      ? this.state.player.pokemon.status
      : this.state.opponent.pokemon.status;
  }

  private getDisplayedHpTarget(side: BattleHpSide): number {
    const messageHpSnapshot = this.state.messageHpSnapshots?.[0];

    if (!messageHpSnapshot) {
      return this.getStateHp(side);
    }

    return side === "player"
      ? messageHpSnapshot.playerCurrentHp
      : messageHpSnapshot.opponentCurrentHp;
  }

  private getDisplayedStatusTarget(side: BattleHpSide): BattlePokemonStatus {
    const messageHpSnapshot = this.state.messageHpSnapshots?.[0];

    if (!messageHpSnapshot) {
      return this.getStateStatus(side);
    }

    return side === "player" ? messageHpSnapshot.playerStatus : messageHpSnapshot.opponentStatus;
  }

  private shouldPlayAttackHitSound(side: BattleHpSide): boolean {
    const attackHitTarget = this.state.messageHpSnapshots?.[0]?.attackHitTarget;

    return attackHitTarget === side;
  }

  private isHpAnimationPlaying(): boolean {
    return BATTLE_HP_SIDES.some(
      function testItem(this: BattleController, side: "player" | "opponent"): boolean {
        return Boolean(this.hpTweens[side]);
      }.bind(this),
    );
  }

  private isStatusCommitPlaying(): boolean {
    return BATTLE_HP_SIDES.some(
      function testItem(this: BattleController, side: "player" | "opponent"): boolean {
        return Boolean(this.statusCommitTweens[side]);
      }.bind(this),
    );
  }

  private isHitAnimationPlaying(): boolean {
    return BATTLE_HP_SIDES.some(
      function testItem(this: BattleController, side: "player" | "opponent"): boolean {
        return Boolean(this.hitEffects[side].tween);
      }.bind(this),
    );
  }

  private playHitAnimation(side: BattleHpSide): void {
    const hitEffect = this.hitEffects[side];

    hitEffect.tween?.stop();
    hitEffect.progress = 0;
    hitEffect.startedCount += 1;
    this.hitAnimationStartedCount += 1;

    const tween = animateRuntimeValue({
      duration: BATTLE_HIT_TWEEN_MS,
      ease: "sine-out",
      onUpdate: progress => {
        if (hitEffect.tween !== tween) {
          return;
        }

        hitEffect.progress = progress;
        this.animationFrameUpdateCount += 1;
        this.publishBattlePresentationState();
      },
      onComplete: () => {
        if (hitEffect.tween !== tween) {
          return;
        }

        hitEffect.progress = 0;
        hitEffect.tween = null;
        this.publishBattlePresentationState();
      },
    });

    hitEffect.tween = tween;
  }

  private playBattleEntranceAnimation(): void {
    this.battleEntranceTween?.stop();
    this.battleEntranceProgress = 0;
    this.battleEntrancePlaying = true;
    this.battleEntrancePlayed = true;

    const tween = animateRuntimeValue({
      duration: BATTLE_ENTRANCE_TWEEN_MS,
      ease: "cubic-out",
      onUpdate: progress => {
        if (this.battleEntranceTween !== tween) {
          return;
        }

        this.battleEntranceProgress = progress;
        this.animationFrameUpdateCount += 1;
        this.publishBattlePresentationState();
      },
      onComplete: () => {
        if (this.battleEntranceTween !== tween) {
          return;
        }

        this.battleEntranceProgress = 1;
        this.battleEntrancePlaying = false;
        this.battleEntranceTween = null;
        this.render();
      },
    });
    this.battleEntranceTween = tween;
    this.render();
  }

  private finishBattleEntranceAnimation(): void {
    this.battleEntranceTween?.stop();
    this.battleEntranceTween = null;
    this.battleEntranceProgress = 1;
    this.battleEntrancePlaying = false;
  }

  private playCaptureAnimation(attempt: BattleCaptureAttempt): void {
    this.captureAnimationTween?.stop();
    this.captureAnimationAttempt = attempt;
    this.captureAnimationProgress = 0;
    this.captureAnimationPlaying = true;
    this.captureAnimationStartedCount += 1;

    const tween = animateRuntimeValue({
      duration: ROM_CAPTURE_ANIMATION_DURATION_MS,
      onUpdate: progress => {
        if (this.captureAnimationTween !== tween) {
          return;
        }

        this.captureAnimationProgress = progress;
        this.animationFrameUpdateCount += 1;
        this.publishBattlePresentationState();
      },
      onComplete: () => {
        if (this.captureAnimationTween !== tween) {
          return;
        }

        this.captureAnimationProgress = 1;
        this.captureAnimationPlaying = false;
        this.captureAnimationTween = null;
        this.render();
      },
    });

    this.captureAnimationTween = tween;
    this.render();
  }

  private playEvolutionAnimation(fromPokemon: BattlePokemon, toPokemon: BattlePokemon): void {
    this.evolutionAnimationTween?.stop();
    this.evolutionTransition = { fromPokemon, toPokemon };
    this.evolutionAnimationPending = false;
    this.evolutionAnimationProgress = 0;
    this.evolutionAnimationPlaying = true;
    this.evolutionAnimationStartedCount += 1;

    const tween = animateRuntimeValue({
      duration: ROM_EVOLUTION_ANIMATION_DURATION_MS,
      onUpdate: progress => {
        if (this.evolutionAnimationTween !== tween) {
          return;
        }

        this.evolutionAnimationProgress = progress;
        this.animationFrameUpdateCount += 1;
        this.publishBattlePresentationState();
      },
      onComplete: () => {
        if (this.evolutionAnimationTween !== tween) {
          return;
        }

        this.evolutionAnimationProgress = 1;
        this.evolutionAnimationPlaying = false;
        this.evolutionAnimationTween = null;
        this.render();
      },
    });

    this.evolutionAnimationTween = tween;
    this.render();
  }

  private returnToWorld(completedCompetitiveBattle?: CompetitiveBattleLaunchKey): void {
    if (!this.state.returnToWorld || this.returningToWorld) {
      return;
    }

    this.returningToWorld = true;
    if (
      completedCompetitiveBattle &&
      this.authoritativeTerminalTransition?.key.matchId === completedCompetitiveBattle.matchId &&
      this.authoritativeTerminalTransition.key.assignmentRevision ===
        completedCompetitiveBattle.assignmentRevision
    ) {
      this.authoritativeTerminalTransition.status = "transitioned";
    }
    this.clearE2eSnapshot();
    this.setBattleState(this.applyLevelUpMoveLearning(this.state), {
      animateHpDecrease: false,
      render: false,
    });

    if (this.state.phase === "move-replace-select") {
      this.returningToWorld = false;
      this.render();
      return;
    }

    const returnToWorld = this.state.returnToWorld;

    if (!returnToWorld) {
      return;
    }

    if (this.authoritativeSpectating) {
      this.clearAuthoritativeSubscriptions();
      this.options.onReturnToWorld({
        spawnPosition: {
          x: returnToWorld.x,
          y: returnToWorld.y,
          facing: returnToWorld.facing,
        },
      });
      return;
    }

    const localPlayer = this.gameStateStore.getCurrentLocalPlayer();
    const previousCurrentPlayerId = this.gameStateStore.getState().currentPlayerId;

    if (
      !completedCompetitiveBattle &&
      this.state.battleKind === "trainer" &&
      !this.authoritativeProjection
    ) {
      this.upsertTrainerBattleParticipant(this.state.player);
      this.upsertTrainerBattleParticipant(this.state.opponent);
      this.gameStateStore.setCurrentPlayer(previousCurrentPlayerId);
    } else {
      persistBattlePartyToWorld({
        completedCompetitiveBattle: Boolean(completedCompetitiveBattle),
        gameStateStore: this.gameStateStore,
        localPlayer,
        participant: this.state.player,
      });
    }

    this.persistCapturedPokemon();

    if (
      this.state.result?.winnerPlayerId === localPlayer.playerId &&
      (this.state.result.rewardPokeDollars ?? 0) > 0
    ) {
      const currentLocalPlayer = this.gameStateStore.getCurrentLocalPlayer();
      this.gameStateStore.setLocalPlayerPokeDollars(
        currentLocalPlayer.wallet.pokeDollars + (this.state.result.rewardPokeDollars ?? 0),
      );
    }

    const localBattleParticipant = [this.state.player, this.state.opponent].find(
      function findItem(participant) {
        return participant.playerId === localPlayer.playerId;
      },
    );
    const destination =
      this.state.result?.loserPlayerId === localPlayer.playerId &&
      localBattleParticipant &&
      isBattleParticipantDefeated(localBattleParticipant)
        ? {
            mapKey: FIELD_MAP.key,
            ...FIELD_MAP.recoverySpawn,
          }
        : returnToWorld;
    const { mapKey, x, y, facing } = destination;

    if (this.persistWorldPositionOnReturn) {
      this.gameStateStore.setLocalPlayerPosition({
        mapKey,
        x,
        y,
        facing,
      });
    }

    if (this.soloChallenge && this.state.result) {
      this.gameStateStore.completeSoloChallenge(
        this.state.result.winnerPlayerId === localPlayer.playerId,
        Date.now(),
      );
    }

    this.options.onReturnToWorld({
      spawnPosition: {
        x,
        y,
        facing,
      },
      ...(!this.soloChallenge &&
      this.state.battleKind === "trainer" &&
      this.state.tournamentMatchId &&
      this.state.result
        ? {
            tournamentResult: {
              matchId: this.state.tournamentMatchId,
              winnerPlayerId: this.state.result.winnerPlayerId,
              loserPlayerId: this.state.result.loserPlayerId,
              reason: this.state.result.reason,
            },
          }
        : {}),
      ...(completedCompetitiveBattle ? { completedCompetitiveBattle } : {}),
    });
  }

  private persistCapturedPokemon(): void {
    if (this.state.result?.reason !== "capture") {
      return;
    }

    const capturedPokemon = this.state.result.capturedPokemon;
    const placement = persistCapturedPokemonToWorld({
      capturedPokemon,
      gameStateStore: this.gameStateStore,
    });

    if (placement?.destination === "box" && capturedPokemon) {
      dispatchPokeLoungeNotice(this.ownerDocument, {
        message: `포획한 ${capturedPokemon.name}, 파티가 가득 차 PC 박스로 전송했습니다.`,
        tone: "info",
      });
    }
  }

  private upsertTrainerBattleParticipant(participant: BattleParticipant): void {
    const localPlayer = this.gameStateStore.getState().playersById[participant.playerId];

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

    this.gameStateStore.upsertLocalPlayer({
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

  private applyLevelUpMoveLearning(state: BattleScreenState): BattleScreenState {
    if (this.levelUpMoveLearningApplied || this.pendingMoveLearnings.length > 0) {
      return state;
    }

    if (
      state.battleKind !== "wild" ||
      state.result?.reason !== "faint" ||
      (state.result.levelsGained ?? 0) <= 0
    ) {
      return state;
    }

    const localPlayer = this.gameStateStore.getCurrentLocalPlayer();

    if (state.result.winnerPlayerId !== localPlayer.playerId) {
      return state;
    }

    const moveRecords = this.runtimeAssets.json.get("romRefinedBattleRecords");
    const personalRecords = this.runtimeAssets.json.get("romPersonalData");
    const evolutionTable = normalizePokemonEvolutionTable(
      this.runtimeAssets.json.get("pokemonData"),
    );

    if (
      !isRomRefinedMoveCollection(moveRecords) ||
      !isRomPersonalRecordCollection(personalRecords)
    ) {
      return state;
    }

    this.levelUpMoveLearningApplied = true;
    const previousPokemonBySlotIndex = new Map(
      localPlayer.party
        .filter(function filterItem(slot) {
          return slot.pokemon;
        })
        .map(function mapItem(slot) {
          return [
            slot.slotIndex,
            {
              level: slot.pokemon?.level ?? 1,
              speciesId: slot.pokemon?.speciesId ?? 0,
            },
          ] as const;
        }),
    );
    const learningMessages: string[] = [];
    let activePokemon = state.player.pokemon;
    let activeSlotSeen = false;
    let activeEvolutionTransition: BattleEvolutionTransition | null = null;

    const party = state.player.party.map(
      function mapItem(this: BattleController, slot: BattlePartySlot): BattlePartySlot {
        if (!slot.pokemon) {
          return slot;
        }

        if (slot.slotIndex === state.player.activePartySlotIndex) {
          activeSlotSeen = true;
        }

        const previousLevel = resolvePreviousBattleLevel({
          activePartySlotIndex: state.player.activePartySlotIndex,
          fallbackLevelsGained: state.result?.levelsGained ?? 0,
          pokemon: slot.pokemon,
          previousPokemon: previousPokemonBySlotIndex.get(slot.slotIndex),
          slotIndex: slot.slotIndex,
        });

        if (previousLevel >= slot.pokemon.level) {
          return slot;
        }

        const progression = planLevelUpBattleProgression({
          evolutionTable,
          moveRecords,
          personalRecords,
          pokemon: slot.pokemon,
          previousLevel,
        });

        if (progression.messages.length === 0 && progression.pendingMoveLearnings.length === 0) {
          return slot;
        }

        learningMessages.push(...progression.messages);
        progression.pendingMoveLearnings.forEach(
          function visitItem(this: BattleController, { newMove }: PendingBattleMoveLearning): void {
            this.pendingMoveLearnings.push({
              slotIndex: slot.slotIndex,
              pokemonName: progression.pokemon.name,
              newMove,
            });
          }.bind(this),
        );

        if (slot.slotIndex === state.player.activePartySlotIndex) {
          activePokemon = progression.pokemon;
          if (progression.evolved && slot.pokemon.speciesId !== progression.pokemon.speciesId) {
            activeEvolutionTransition = {
              fromPokemon: slot.pokemon,
              toPokemon: progression.pokemon,
            };
          }
        }

        return {
          ...slot,
          pokemon: progression.pokemon,
        };
      }.bind(this),
    );

    if (!activeSlotSeen) {
      const previousLevel = Math.max(
        1,
        state.player.pokemon.level - (state.result.levelsGained ?? 0),
      );
      const progression = planLevelUpBattleProgression({
        evolutionTable,
        moveRecords,
        personalRecords,
        pokemon: state.player.pokemon,
        previousLevel,
      });

      if (progression.messages.length > 0) {
        activePokemon = progression.pokemon;
        learningMessages.push(...progression.messages);
      }
      if (progression.evolved && state.player.pokemon.speciesId !== progression.pokemon.speciesId) {
        activeEvolutionTransition = {
          fromPokemon: state.player.pokemon,
          toPokemon: progression.pokemon,
        };
      }

      progression.pendingMoveLearnings.forEach(
        function visitItem(this: BattleController, { newMove }: PendingBattleMoveLearning): void {
          this.pendingMoveLearnings.push({
            slotIndex: state.player.activePartySlotIndex,
            pokemonName: progression.pokemon.name,
            newMove,
          });
        }.bind(this),
      );
    }

    if (learningMessages.length === 0 && this.pendingMoveLearnings.length === 0) {
      return state;
    }

    if (activeEvolutionTransition) {
      this.evolutionTransition = activeEvolutionTransition;
      this.evolutionAnimationPending = true;
    }

    const nextState = {
      ...state,
      player: {
        ...state.player,
        pokemon: activePokemon,
        party,
      },
      messageQueue: insertMessagesBeforeBattleEndConfirm(state.messageQueue, learningMessages),
    };

    if (this.pendingMoveLearnings.length > 0) {
      this.selectedMoveIndex = 0;

      return {
        ...nextState,
        phase: "move-replace-select" as const,
        messageQueue: removeBattleEndConfirmMessage(nextState.messageQueue),
      };
    }

    return {
      ...nextState,
    };
  }

  private confirmMoveReplacement(): void {
    const pending = this.pendingMoveLearnings.shift();

    if (!pending) {
      this.setBattleState({ ...this.state, phase: "ended" });
      return;
    }

    const targetSlot = this.state.player.party.find(function findItem(slot) {
      return slot.slotIndex === pending.slotIndex;
    });
    const targetPokemon = targetSlot?.pokemon ?? this.state.player.pokemon;
    const replacedMove = targetPokemon.moves[this.selectedMoveIndex];

    if (!replacedMove) {
      this.skipMoveReplacement(pending);
      return;
    }

    const nextPokemon = {
      ...targetPokemon,
      moves: targetPokemon.moves.map(
        function mapItem(this: BattleController, move: BattleMove, index: number): BattleMove {
          return index === this.selectedMoveIndex ? pending.newMove : move;
        }.bind(this),
      ),
    };
    const nextParty = this.state.player.party.map(function mapItem(slot) {
      return slot.slotIndex === pending.slotIndex ? { ...slot, pokemon: nextPokemon } : slot;
    });
    const nextActivePokemon =
      pending.slotIndex === this.state.player.activePartySlotIndex
        ? nextPokemon
        : this.state.player.pokemon;
    const message = formatReplacedMoveMessage(
      pending.pokemonName,
      replacedMove.name,
      pending.newMove.name,
    );

    this.selectedMoveIndex = 0;
    this.setBattleState({
      ...this.state,
      phase: this.pendingMoveLearnings.length > 0 ? "move-replace-select" : "ended",
      player: {
        ...this.state.player,
        pokemon: nextActivePokemon,
        party: nextParty,
      },
      messageQueue:
        this.pendingMoveLearnings.length > 0 ? [message] : appendBattleEndConfirmMessage([message]),
    });
  }

  private skipMoveReplacement(pending = this.pendingMoveLearnings.shift()): void {
    if (!pending) {
      this.setBattleState({ ...this.state, phase: "ended" });
      return;
    }

    this.selectedMoveIndex = 0;
    this.setBattleState({
      ...this.state,
      phase: this.pendingMoveLearnings.length > 0 ? "move-replace-select" : "ended",
      messageQueue:
        this.pendingMoveLearnings.length > 0
          ? [formatSkippedMoveMessage(pending.pokemonName, pending.newMove.name)]
          : appendBattleEndConfirmMessage([
              formatSkippedMoveMessage(pending.pokemonName, pending.newMove.name),
            ]),
    });
  }

  private getCurrentPendingMoveLearning(): PendingMoveLearning | null {
    return this.pendingMoveLearnings[0] ?? null;
  }

  private goBack(): void {
    if (isForcedPartySwitch(this.state)) {
      return;
    }

    if (
      this.state.phase === "move-select" ||
      this.state.phase === "move-replace-select" ||
      this.state.phase === "party-select" ||
      this.state.phase === "bag-select"
    ) {
      if (this.state.phase === "move-replace-select") {
        this.skipMoveReplacement();
        return;
      }

      this.setBattleState({ ...this.state, phase: "command" });
    }
  }

  private updateCommandSelection(): void {
    if (consumeVirtualGamepadPress("left") || this.keyboard.consume("ArrowLeft", "KeyA")) {
      this.selectedCommandIndex =
        this.selectedCommandIndex % 2 === 1
          ? this.selectedCommandIndex - 1
          : this.selectedCommandIndex;
      this.render();
    }
    if (consumeVirtualGamepadPress("right") || this.keyboard.consume("ArrowRight", "KeyD")) {
      this.selectedCommandIndex =
        this.selectedCommandIndex % 2 === 0
          ? Math.min(COMMANDS.length - 1, this.selectedCommandIndex + 1)
          : this.selectedCommandIndex;
      this.render();
    }
    if (consumeVirtualGamepadPress("up") || this.keyboard.consume("ArrowUp", "KeyW")) {
      this.selectedCommandIndex =
        this.selectedCommandIndex >= 2 ? this.selectedCommandIndex - 2 : this.selectedCommandIndex;
      this.render();
    }
    if (consumeVirtualGamepadPress("down") || this.keyboard.consume("ArrowDown", "KeyS")) {
      this.selectedCommandIndex =
        this.selectedCommandIndex < 2
          ? Math.min(COMMANDS.length - 1, this.selectedCommandIndex + 2)
          : this.selectedCommandIndex;
      this.render();
    }
  }

  private updateMoveSelection(): void {
    const maxMoveIndex = Math.max(0, this.state.player.pokemon.moves.length - 1);

    if (consumeVirtualGamepadPress("left") || this.keyboard.consume("ArrowLeft", "KeyA")) {
      this.selectedMoveIndex =
        this.selectedMoveIndex % 2 === 1 ? this.selectedMoveIndex - 1 : this.selectedMoveIndex;
      this.render();
    }
    if (consumeVirtualGamepadPress("right") || this.keyboard.consume("ArrowRight", "KeyD")) {
      this.selectedMoveIndex =
        this.selectedMoveIndex % 2 === 0
          ? Math.min(maxMoveIndex, this.selectedMoveIndex + 1)
          : this.selectedMoveIndex;
      this.render();
    }
    if (consumeVirtualGamepadPress("up") || this.keyboard.consume("ArrowUp", "KeyW")) {
      this.selectedMoveIndex =
        this.selectedMoveIndex >= 2 ? this.selectedMoveIndex - 2 : this.selectedMoveIndex;
      this.render();
    }
    if (consumeVirtualGamepadPress("down") || this.keyboard.consume("ArrowDown", "KeyS")) {
      this.selectedMoveIndex =
        this.selectedMoveIndex < 2
          ? Math.min(maxMoveIndex, this.selectedMoveIndex + 2)
          : this.selectedMoveIndex;
      this.render();
    }
  }

  private updatePartySelection(): void {
    if (consumeVirtualGamepadPress("left") || this.keyboard.consume("ArrowLeft", "KeyA")) {
      this.movePartySelection("left");
    }
    if (consumeVirtualGamepadPress("right") || this.keyboard.consume("ArrowRight", "KeyD")) {
      this.movePartySelection("right");
    }
    if (consumeVirtualGamepadPress("up") || this.keyboard.consume("ArrowUp", "KeyW")) {
      this.movePartySelection("up");
    }
    if (consumeVirtualGamepadPress("down") || this.keyboard.consume("ArrowDown", "KeyS")) {
      this.movePartySelection("down");
    }
  }

  private movePartySelection(direction: "up" | "down" | "left" | "right"): void {
    const nextIndex = moveBattlePartySelection(this.selectedPartySlotIndex, direction);

    if (nextIndex === this.selectedPartySlotIndex) {
      return;
    }

    this.selectedPartySlotIndex = nextIndex;
    this.render();
  }

  private updateBagSelection(): void {
    const battleBagItemIds = this.getBattleBagItemIds();
    if (consumeVirtualGamepadPress("up") || this.keyboard.consume("ArrowUp", "KeyW")) {
      this.selectedBagItemIndex = Math.max(0, this.selectedBagItemIndex - 1);
      this.render();
    }
    if (consumeVirtualGamepadPress("down") || this.keyboard.consume("ArrowDown", "KeyS")) {
      this.selectedBagItemIndex = Math.min(
        battleBagItemIds.length - 1,
        this.selectedBagItemIndex + 1,
      );
      this.render();
    }
  }

  private toggleShortcutGuide(): void {
    if (this.shortcutGuideOpen) {
      this.closeShortcutGuide();
      return;
    }

    this.openShortcutGuide();
  }

  private openShortcutGuide(): void {
    this.shortcutGuideOpen = true;
    if (!this.usesMobileBattleDeck()) {
      setShortcutGuideTouchControlsSuppressed(true);
    }
    this.render();
  }

  private closeShortcutGuide(): void {
    this.shortcutGuideOpen = false;
    setShortcutGuideTouchControlsSuppressed(false);
    this.render();
  }

  private render(): void {
    if (!this.sceneLifecycleActive) {
      return;
    }

    this.fullRenderCount += 1;
    this.publishE2eSnapshot();
    this.publishBattleUiState();
    this.publishAccessibleStatus();
  }

  private publishAccessibleStatus(): void {
    const playerPokemon = this.state.player.pokemon;
    const opponentPokemon = this.state.opponent.pokemon;
    const healthSummary = `내 ${playerPokemon.name} HP ${playerPokemon.currentHp}/${playerPokemon.maxHp}. 상대 ${opponentPokemon.name} HP ${opponentPokemon.currentHp}/${opponentPokemon.maxHp}.`;
    const queuedMessage = this.getVisibleBattleMessage();
    let interactionSummary = queuedMessage ?? "";

    if (!queuedMessage && this.state.phase === "command") {
      interactionSummary = `전투 명령 ${COMMANDS[this.selectedCommandIndex]?.label ?? "싸운다"} 선택.`;
    } else if (!queuedMessage && this.state.phase === "move-select") {
      const move = playerPokemon.moves[this.selectedMoveIndex];
      interactionSummary = move
        ? `기술 ${move.name} 선택. PP ${move.pp}/${move.maxPp}.`
        : "사용할 기술을 선택하세요.";
    } else if (!queuedMessage && this.state.phase === "move-replace-select") {
      const pending = this.getCurrentPendingMoveLearning();
      const move = playerPokemon.moves[this.selectedMoveIndex];
      interactionSummary = pending
        ? `${pending.newMove.name}을 배우기 위해 ${move?.name ?? "기존 기술"}을 잊도록 선택했습니다.`
        : "기술 교체를 확인하는 중입니다.";
    } else if (!queuedMessage && this.state.phase === "party-select") {
      const pokemon = this.state.player.party.find(
        function findItem(this: BattleController, slot: BattlePartySlot): boolean {
          return slot.slotIndex === this.selectedPartySlotIndex;
        }.bind(this),
      )?.pokemon;
      const selectionSummary = pokemon
        ? `교체 대상 ${pokemon.name}, HP ${pokemon.currentHp}/${pokemon.maxHp}.`
        : "교체할 포켓몬을 선택하세요.";
      interactionSummary = isForcedPartySwitch(this.state)
        ? `선두 포켓몬이 쓰러져 반드시 교체해야 합니다. ${selectionSummary}`
        : selectionSummary;
    } else if (!queuedMessage && this.state.phase === "bag-select") {
      const itemId = this.getBattleBagItemIds()[this.selectedBagItemIndex];
      const item = itemId ? getShopItemById(itemId) : undefined;
      const quantity = itemId
        ? (this.gameStateStore.getCurrentLocalPlayer().inventory[itemId] ?? 0)
        : 0;
      interactionSummary = item
        ? `가방 ${item.displayName} 선택. 보유 ${quantity}개.`
        : "사용할 아이템을 선택하세요.";
    }

    const nextStatus = `${healthSummary} ${interactionSummary}`.trim();

    if (nextStatus === this.lastAccessibleStatus) {
      return;
    }

    this.lastAccessibleStatus = nextStatus;
    dispatchPokeLoungeAccessibleStatus(this.ownerDocument, nextStatus);
  }

  private getVisibleBattleMessage(): string | null {
    if (this.authoritativeProjection && this.battleEntrancePlaying) {
      return this.getBattleStatusCopy().preparing;
    }

    return this.state.messageQueue[0] ?? null;
  }

  private getBattleStatusCopy() {
    return getPokeLoungeCopyForUrl(new URL(this.ownerDocument.location.href)).mobile;
  }

  private getHitRenderEffect(side: BattleHpSide): { alpha: number; offsetX: number } {
    const progress = clampUnit(this.hitEffects[side].progress);
    if (progress <= 0 || progress >= 1) return { alpha: 1, offsetX: 0 };
    const shake = Math.sin(progress * Math.PI * 7) * BATTLE_HIT_SHAKE_PIXELS * (1 - progress);
    return {
      alpha: progress < 0.35 ? 0.58 : 1,
      offsetX: Math.round(shake * (side === "player" ? -1 : 1)),
    };
  }

  private getCaptureOpponentRenderEffect(): { alpha: number; scale: number } {
    const attempt = this.captureAnimationAttempt;
    if (!attempt) return { alpha: 1, scale: 1 };
    const frame = resolveRomCaptureAnimationFrame(
      clampUnit(this.captureAnimationProgress),
      attempt.shakes,
      attempt.caught,
    );
    return { alpha: frame.opponentAlpha, scale: frame.opponentScale };
  }

  private getBattlePartySlotViews(): BattlePartySlotView[] {
    return createBattlePartySlotViews({
      activePartySlotIndex: this.state.player.activePartySlotIndex,
      panel: BATTLE_LAYOUT.partyWindow,
      party: this.state.player.party,
      selectedPartySlotIndex: this.selectedPartySlotIndex,
    });
  }

  private getBattleBagItemIds(): BattleBagItemId[] {
    return [...BATTLE_BAG_ITEM_IDS];
  }

  private publishE2eSnapshot(): void {
    if (!isLocalE2eBattleProbeEnabled()) {
      return;
    }

    document.documentElement.dataset.pokeLoungeE2eBattle = JSON.stringify(
      this.getE2eSnapshotForTest(),
    );
  }

  private clearE2eSnapshot(): void {
    if (!isLocalE2eBattleProbeEnabled()) {
      return;
    }

    delete document.documentElement.dataset.pokeLoungeE2eBattle;
  }
}

function resolvePreviousBattleLevel({
  activePartySlotIndex,
  fallbackLevelsGained,
  pokemon,
  previousPokemon,
  slotIndex,
}: {
  activePartySlotIndex: number;
  fallbackLevelsGained: number;
  pokemon: BattlePokemon;
  previousPokemon?: Pick<PlayerPokemon, "level" | "speciesId">;
  slotIndex: number;
}): number {
  if (previousPokemon?.speciesId === pokemon.speciesId && Number.isFinite(previousPokemon.level)) {
    return previousPokemon.level;
  }

  if (slotIndex === activePartySlotIndex && fallbackLevelsGained > 0) {
    return Math.max(1, pokemon.level - fallbackLevelsGained);
  }

  return pokemon.level;
}

function insertMessagesBeforeBattleEndConfirm(
  messageQueue: string[],
  messages: string[],
): string[] {
  const confirmMessageIndex = messageQueue.lastIndexOf(BATTLE_END_CONFIRM_MESSAGE);

  if (confirmMessageIndex === -1) {
    return [...messageQueue, ...messages];
  }

  return [
    ...messageQueue.slice(0, confirmMessageIndex),
    ...messages,
    ...messageQueue.slice(confirmMessageIndex),
  ];
}

function appendBattleEndConfirmMessage(messages: string[]): string[] {
  return [...messages, BATTLE_END_CONFIRM_MESSAGE];
}

function removeBattleEndConfirmMessage(messages: string[]): string[] {
  return messages.filter(function filterItem(message) {
    return message !== BATTLE_END_CONFIRM_MESSAGE;
  });
}

function isRomRefinedMoveCollection(value: unknown): value is RomRefinedMoveCollection {
  return isRecord(value) && "moves" in value;
}

function isRomPersonalRecordCollection(value: unknown): value is RomPersonalRecordCollection {
  return isRecord(value) && (Array.isArray(value.records) || isRecord(value.species));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isLocalE2eBattleProbeEnabled(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  const { hostname, search } = window.location;
  const isLocalHost =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]" ||
    hostname === "::1";

  return isLocalHost && new URLSearchParams(search).has("e2eBattle");
}

function createBattleScenarioStateForTest(scenario: BattleE2eScenario): BattleScreenState {
  const baseState = createSampleBattleState();
  const playerPokemon = cloneBattlePokemon(baseState.player.pokemon);
  const opponentPokemon = cloneBattlePokemon(baseState.opponent.pokemon);

  if (scenario === "wild-paralysis") {
    playerPokemon.speed = Math.max(playerPokemon.speed, opponentPokemon.speed + 1);
    playerPokemon.moves = [
      createBattleMoveForTest(86, "전기자석파", {
        accuracy: 100,
        category: "status",
        effectCode: 67,
        power: 0,
        type: "전기",
        typeId: 12,
      }),
    ];
    opponentPokemon.moves = [];
    opponentPokemon.status = "normal";
  } else if (
    scenario === "wild-victory" ||
    scenario === "wild-evolution" ||
    scenario === "wild-move-learning" ||
    scenario === "wild-status-badge"
  ) {
    playerPokemon.speed = Math.max(playerPokemon.speed, opponentPokemon.speed + 1);
    playerPokemon.moves = playerPokemon.moves.map(function mapItem(move, index) {
      return index === 0 ? { ...move, accuracy: 100 } : move;
    });
    opponentPokemon.currentHp = 1;
    opponentPokemon.status = "normal";
    if (scenario === "wild-status-badge") {
      playerPokemon.status = "paralyzed";
      opponentPokemon.status = "burned";
      opponentPokemon.currentHp = Math.max(1, Math.floor(opponentPokemon.maxHp / 2));
    }

    if (scenario === "wild-victory") {
      opponentPokemon.moves = [];
    }

    if (scenario === "wild-evolution") {
      playerPokemon.speciesId = 152;
      playerPokemon.name = "치코리타";
      playerPokemon.level = 15;
      opponentPokemon.baseExpYield = E2E_SINGLE_LEVEL_BASE_EXP_YIELD;
    }

    if (scenario === "wild-move-learning") {
      playerPokemon.speciesId = 155;
      playerPokemon.name = "브케인";
      playerPokemon.level = 18;
      playerPokemon.experience = getExperienceForLevel(18, playerPokemon.growthRate);
      playerPokemon.baseStats = { ...opponentPokemon.baseStats };
      playerPokemon.typeIds = [10];
      playerPokemon.frontSprite = { ...opponentPokemon.frontSprite };
      playerPokemon.backSprite = { ...opponentPokemon.backSprite };
      playerPokemon.moves = [
        createBattleMoveForTest(52, "불꽃세례", {
          accuracy: 100,
          category: "special",
          effectCode: 4,
          power: 40,
          type: "불꽃",
          typeId: 10,
        }),
        createBattleMoveForTest(108, "연막", {
          accuracy: 100,
          category: "status",
          effectCode: 23,
          power: 0,
          type: "노말",
          typeId: 0,
        }),
        createBattleMoveForTest(98, "전광석화", {
          accuracy: 100,
          category: "physical",
          effectCode: 103,
          power: 40,
          type: "노말",
          typeId: 0,
        }),
        createBattleMoveForTest(45, "울음소리", {
          accuracy: 100,
          category: "status",
          effectCode: 18,
          power: 0,
          type: "노말",
          typeId: 0,
        }),
      ];
      opponentPokemon.baseExpYield = E2E_SINGLE_LEVEL_BASE_EXP_YIELD;
    }
  } else {
    playerPokemon.currentHp = 1;
    playerPokemon.status = "normal";
    playerPokemon.speed = Math.min(playerPokemon.speed, Math.max(0, opponentPokemon.speed - 1));
    opponentPokemon.speed = Math.max(opponentPokemon.speed, playerPokemon.speed + 1);
  }

  return {
    ...baseState,
    battleKind: "wild",
    phase: "command",
    messageQueue: [],
    selectedMoveId: null,
    result: null,
    returnToWorld: {
      mapKey: "town",
      x: 687,
      y: 1151,
      facing: "front",
    },
    player: updateBattleParticipantPokemon(baseState.player, playerPokemon),
    opponent: {
      ...updateBattleParticipantPokemon(baseState.opponent, opponentPokemon),
      playerId: "wild",
      displayName: `야생 ${opponentPokemon.name}`,
    },
  };
}

function cloneBattlePokemon(pokemon: BattlePokemon): BattlePokemon {
  return {
    ...pokemon,
    moves: pokemon.moves.map(function mapItem(move) {
      return { ...move };
    }),
    frontSprite: { ...pokemon.frontSprite },
    backSprite: { ...pokemon.backSprite },
    baseStats: { ...pokemon.baseStats },
    individualValues: { ...pokemon.individualValues },
    statStages: { ...pokemon.statStages },
  };
}

export function isBattleParticipantDefeated(participant: BattleParticipant): boolean {
  const occupiedParty = participant.party.flatMap(function mapItem(slot) {
    return slot.pokemon ? [slot.pokemon] : [];
  });
  const pokemon = occupiedParty.length > 0 ? occupiedParty : [participant.pokemon];

  return pokemon.every(function testItem(candidate) {
    return candidate.status === "fainted" || candidate.currentHp <= 0;
  });
}

function createBattleMoveForTest(
  id: number,
  name: string,
  input: Omit<BattleMove, "id" | "name" | "pp" | "maxPp">,
): BattleMove {
  return {
    id,
    name,
    pp: 20,
    maxPp: 20,
    ...input,
  };
}

function updateBattleParticipantPokemon(
  participant: BattleParticipant,
  pokemon: BattlePokemon,
): BattleParticipant {
  return {
    ...participant,
    pokemon,
    party: participant.party.map(function mapItem(slot) {
      return slot.slotIndex === participant.activePartySlotIndex
        ? { ...slot, pokemon }
        : {
            ...slot,
            pokemon: slot.pokemon ? cloneBattlePokemon(slot.pokemon) : null,
          };
    }),
  };
}

function createBattleHitEffects(): BattleHitEffects {
  return {
    opponent: {
      progress: 0,
      startedCount: 0,
      tween: null,
    },
    player: {
      progress: 0,
      startedCount: 0,
      tween: null,
    },
  };
}
