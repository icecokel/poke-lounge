import {
  createMoveReplacementConfirmation,
  isMoveReplacementConfirmationCurrent,
  type MoveReplacementConfirmation,
} from "../ui/move-learning-model";
import {
  playBattleCancelSound,
  playBattleConfirmSound,
  playPartyHealSound,
} from "../battle/battle-audio";
import {
  DICE_GAMBLE_PREDICTIONS,
  DICE_GAMBLE_STAKE_POKE_DOLLARS,
  createDiceGambleRound,
  resolveDiceGambleRound,
  type DiceGambleNumber,
  type DiceGamblePrediction,
  type DiceGambleRound,
} from "../gamble/dice-gamble";
import { consumeVirtualGamepadPress } from "../input/virtual-gamepad";
import { setShortcutGuideTouchControlsSuppressed } from "../input/mobile-touch-controls-visibility";
import { PLAYER_PARTY_SLOT_COUNT } from "../player/player-types";
import {
  clearRuntimeShopItemRomIds,
  loadRuntimeShopItemRomIds,
  registerRuntimeShopItemRomIds,
  type RuntimeShopKind,
} from "../data/game-data-json";
import {
  getRuntimeItemIds,
  getRuntimeShopItemIds,
  type RuntimeItemId,
} from "../items/runtime-items";
import {
  getShopItemById,
  type GameStateStore,
  type PlayerPokemon,
  type PlayerPokemonMove,
  type PlayerPokemonStatus,
  type ShopItem,
} from "../state/game-state-store";
import {
  hasPokeLoungeMobileFullscreenScene,
  usesPokeLoungeMobileShell,
} from "../ui/mobile-ui-capability";
import {
  createPokeLoungePartySlotSummaries,
  type MobileWorldUiAction,
  type MobileWorldUiScreen,
} from "../ui/mobile-world-ui";
import { dispatchPokeLoungeAccessibleStatus } from "../ui/poke-lounge-ui-events";
import { createShortcutGuideTitle, type ShortcutGuideInputMode } from "../ui/shortcut-guide";
import {
  FIELD_MAP,
  NURSE_INTERACTION_DISTANCE,
  resolveFieldEncounterAreaId,
} from "../world/field-map";
import { formatPokemonHp, formatPokeDollars } from "./world-scene-hud";
import type { WorldE2eSnapshot } from "../testing/poke-lounge-e2e-controller";
import type { ObjectLayerLookup } from "./world-scene";
import type { WorldUiStore } from "../world/world-ui-store";
import type { RuntimeKeyboard } from "../runtime-input";

const DICE_GAMBLE_LABELS: Record<DiceGamblePrediction, string> = {
  lower: "낮다",
  equal: "같다",
  higher: "높다",
};

type ShopKind = RuntimeShopKind;
type KnownShopItemId = RuntimeItemId;
type PcBoxFocus = "party" | "box";
type InventoryFocus = "items" | "move-replace" | "party";

const FIELD_AREA_LABELS: Record<string, string> = {
  "town-west-field": "라운지 마을 · 서쪽 야생초원",
  "town-plaza-field": "라운지 마을 · 중앙 광장",
  "town-south-field": "라운지 마을 · 남쪽 산책로",
};
const FIELD_AREA_ANNOUNCEMENT_DURATION_MS = 1_800;

export interface WorldScenePlayerPosition {
  readonly x: number;
  readonly y: number;
}

export interface WorldSceneInteractionsTestFacade {
  handleConfirmInteraction(): void;
  healAtNurse(): void;
  getNurseMessage(): string;
  handleFieldInteractionInput(): void;
  openShop(): void;
  openPremiumShop(): void;
  closeShop(): void;
  confirmShopSelection(): void;
  isShopOpen(): boolean;
  getShopMessage(): string;
  openInventory(): void;
  closeInventory(): void;
  isInventoryOpen(): boolean;
  moveInventorySelection(delta: number): void;
  confirmInventorySelection(): void;
  openPcBox(): void;
  closePcBox(): void;
  movePcBoxSelection(delta: number): void;
  togglePcBoxFocus(): void;
  confirmPcBoxSelection(): void;
  showInitialShortcutGuide(): void;
  openShortcutGuide(): void;
  closeShortcutGuide(): void;
  isShortcutGuideOpen(): boolean;
  openDiceGamble(targetNumber?: DiceGambleNumber): void;
  closeDiceGamble(): void;
  selectDiceGamblePrediction(prediction: DiceGamblePrediction): void;
  confirmDiceGambleSelection(rolledNumber?: DiceGambleNumber): void;
  isDiceGambleOpen(): boolean;
  getDiceGambleMessage(): string;
}

export interface WorldSceneInteractions {
  handleInput(): boolean;
  destroy(): void;
  getE2eSnapshot(): Pick<
    WorldE2eSnapshot,
    | "pokemonStatusPanel"
    | "pcBox"
    | "shortcutGuideOpen"
    | "nurseHealing"
    | "nurseMessage"
    | "interactionPrompt"
    | "surface"
    | "shopKind"
  >;
}

export interface WorldSceneInteractionsController extends WorldSceneInteractions {
  canOpenPokemonStatusPanel(): boolean;
  createStaticNpcs(map: ObjectLayerLookup): void;
  handleUiAction(action: MobileWorldUiAction): void;
  showInitialShortcutGuideIfNeeded(): void;
  readonly test: Readonly<WorldSceneInteractionsTestFacade>;
}

export interface WorldSceneInteractionsDependencies {
  gameStateStore: GameStateStore;
  getDocument(): Document;
  keyboard: RuntimeKeyboard;
  getPlayerPosition(): WorldScenePlayerPosition | null;
  canStartSoloChallenge(): boolean;
  startSoloChallenge(): void;
  playNurseHealingEffect(nursePosition: WorldScenePlayerPosition, onComplete: () => void): void;
  isBattleIntroPlaying(): boolean;
  renderPartyHud(): void;
  closePokemonStatusPanel(options?: { rerenderPartyHud?: boolean }): void;
  getPartyPokemonBySlotIndex(slotIndex: number): PlayerPokemon | null;
  getPokemonStatusPanelSnapshot(): WorldE2eSnapshot["pokemonStatusPanel"];
  isPokemonStatusPanelOpen(): boolean;
  loadShopItemRomIds?(shopKind: ShopKind): Promise<readonly number[]>;
  worldUiStore: WorldUiStore;
}

export function createWorldSceneInteractions(
  dependencies: WorldSceneInteractionsDependencies,
): WorldSceneInteractionsController {
  return new DefaultWorldSceneInteractions(dependencies);
}

function clampSelectionIndex(index: number, itemCount: number): number {
  if (itemCount <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(itemCount - 1, index));
}

export function getShortcutGuideInputMode(): ShortcutGuideInputMode {
  if (typeof document === "undefined") {
    return "keyboard";
  }

  return usesPokeLoungeMobileShell(document) ? "touch" : "keyboard";
}

class DefaultWorldSceneInteractions implements WorldSceneInteractionsController {
  private shopkeeperPosition: { x: number; y: number } | null = null;
  private premiumShopkeeperPosition: { x: number; y: number } | null = null;
  private gamehostPosition: { x: number; y: number } | null = null;
  private soloChallengerPosition: { x: number; y: number } | null = null;
  private nursePosition: { x: number; y: number } | null = null;
  private storagePcPosition: { x: number; y: number } | null = null;
  private nurseMessage = "";
  private nurseHealing = false;
  private nurseHealingEffectCount = 0;
  private shopOpen = false;
  private activeShopKind: ShopKind = "basic";
  private shopSelectedIndex = 0;
  private shopMessage = "";
  private shopLoadRequestId = 0;
  private shopLoadStatus: "idle" | "loading" | "ready" | "error" = "idle";
  private inventoryOpen = false;
  private inventoryFocus: InventoryFocus = "items";
  private inventorySelectedIndex = 0;
  private inventoryPartySlotIndex = 0;
  private inventoryMoveReplaceIndex = 0;
  private inventoryMoveConfirmation: MoveReplacementConfirmation | null = null;
  private inventoryMoveReplacementDecisions: Array<number | null> = [];
  private inventoryTargetItemId: KnownShopItemId | null = null;
  private pendingInventoryItemId: string | null = null;
  private pendingInventoryMovePokemon: PlayerPokemon | null = null;
  private pendingInventoryMoveReplacements: PlayerPokemonMove[] = [];
  private inventoryMessage = "";
  private pcBoxOpen = false;
  private pcBoxFocus: PcBoxFocus = "party";
  private pcBoxPartySlotIndex = 0;
  private pcBoxBoxIndex = 0;
  private pcBoxMessage = "";
  private shortcutGuideOpen = false;
  private diceGambleOpen = false;
  private diceGambleRound: DiceGambleRound | null = null;
  private diceGambleSelectedIndex = 0;
  private diceGambleMessage = "";
  private mobileWorldView: "explore" | "party" = "explore";
  private fieldHintText = "";
  private lastEncounterAreaId: string | null | undefined;
  private areaAnnouncementExpiresAt = 0;

  readonly test: Readonly<WorldSceneInteractionsTestFacade>;

  constructor(private readonly dependencies: WorldSceneInteractionsDependencies) {
    this.test = Object.freeze<WorldSceneInteractionsTestFacade>({
      handleConfirmInteraction: () => this.handleConfirmInteraction(),
      healAtNurse: () => this.healAtNurse(),
      getNurseMessage: () => this.nurseMessage,
      handleFieldInteractionInput: () => this.handleFieldInteractionInput(),
      openShop: () => this.openShop(),
      openPremiumShop: () => this.openShop("premium"),
      closeShop: () => this.closeShop(),
      confirmShopSelection: () => this.confirmShopSelection(),
      isShopOpen: () => this.shopOpen,
      getShopMessage: () => this.shopMessage,
      openInventory: () => this.openInventory(),
      closeInventory: () => this.closeInventory(),
      isInventoryOpen: () => this.inventoryOpen,
      moveInventorySelection: delta => this.moveInventorySelection(delta),
      confirmInventorySelection: () => this.confirmInventorySelection(),
      openPcBox: () => this.openPcBox(),
      closePcBox: () => this.closePcBox(),
      movePcBoxSelection: delta => this.movePcBoxSelection(delta),
      togglePcBoxFocus: () => this.togglePcBoxFocus(),
      confirmPcBoxSelection: () => this.confirmPcBoxSelection(),
      showInitialShortcutGuide: () => this.showInitialShortcutGuideIfNeeded(),
      openShortcutGuide: () => this.openShortcutGuide(),
      closeShortcutGuide: () => this.closeShortcutGuide(),
      isShortcutGuideOpen: () => this.shortcutGuideOpen,
      openDiceGamble: targetNumber => this.openDiceGamble(targetNumber),
      closeDiceGamble: () => this.closeDiceGamble(),
      selectDiceGamblePrediction: prediction => this.selectDiceGamblePrediction(prediction),
      confirmDiceGambleSelection: rolledNumber => this.confirmDiceGambleSelection(rolledNumber),
      isDiceGambleOpen: () => this.diceGambleOpen,
      getDiceGambleMessage: () => this.diceGambleMessage,
    });
  }

  private get gameStateStore(): GameStateStore {
    return this.dependencies.gameStateStore;
  }

  private get document(): Document {
    return this.dependencies.getDocument();
  }

  private get battleIntroPlaying(): boolean {
    return this.dependencies.isBattleIntroPlaying();
  }

  private usesMobileWorldDeck(): boolean {
    return usesPokeLoungeMobileShell(this.document);
  }

  handleUiAction(action: MobileWorldUiAction): void {
    if (action.type === "open-inventory") {
      if (!this.isMobileWorldSurfaceOpen() && !this.battleIntroPlaying) {
        playBattleConfirmSound();
        this.openInventory();
      }
      return;
    }

    if (action.type === "open-help") {
      if (!this.isMobileWorldSurfaceOpen() && !this.battleIntroPlaying) {
        playBattleConfirmSound();
        this.openShortcutGuide();
      }
      return;
    }

    if (action.type === "open-party") {
      if (!this.isMobileWorldSurfaceOpen() && !this.battleIntroPlaying) {
        this.mobileWorldView = "party";
        this.publishMobileWorldUiState();
      }
      return;
    }

    if (action.type === "close") {
      this.closeMobileWorldSurface();
      return;
    }

    if (action.type === "back") {
      if (this.inventoryOpen) {
        this.cancelInventorySelection();
        return;
      }

      this.closeMobileWorldSurface();
      return;
    }

    if (action.type === "select-inventory-item") {
      if (!this.inventoryOpen || this.inventoryFocus !== "items") {
        return;
      }

      this.inventorySelectedIndex = clampSelectionIndex(
        action.index,
        this.getInventoryItemIds().length,
      );
      this.inventoryTargetItemId = null;
      this.inventoryMessage = "";
      this.renderInventoryUi();
      return;
    }

    if (action.type === "select-inventory-move") {
      if (
        !this.inventoryOpen ||
        this.inventoryFocus !== "move-replace" ||
        this.inventoryMoveConfirmation
      )
        return;
      const pokemon = this.getInventoryMoveReplacementPokemon();
      if (!Number.isInteger(action.index) || !pokemon?.moves?.[action.index]) return;
      this.inventoryMoveReplaceIndex = action.index;
      this.confirmInventoryMoveReplacement();
      return;
    }
    if (action.type === "confirm-inventory-move") {
      if (
        this.inventoryOpen &&
        this.inventoryFocus === "move-replace" &&
        this.inventoryMoveConfirmation
      ) {
        playBattleConfirmSound();
        this.confirmInventoryMoveReplacement();
      }
      return;
    }

    if (action.type === "use-inventory-item") {
      if (!this.inventoryOpen) {
        return;
      }

      playBattleConfirmSound();
      this.confirmInventorySelection();
      return;
    }

    if (action.type === "skip-inventory-move") {
      if (!this.inventoryOpen || this.inventoryFocus !== "move-replace") {
        return;
      }

      playBattleCancelSound();
      this.skipInventoryMoveReplacement();
      return;
    }

    if (action.type === "select-inventory-party") {
      if (!this.inventoryOpen || this.inventoryFocus !== "party") {
        return;
      }

      if (!this.getInventoryTargetSlotIndices().includes(action.slotIndex)) {
        return;
      }

      this.inventoryPartySlotIndex = action.slotIndex;
      this.inventoryMessage = "";
      this.renderInventoryUi();
      return;
    }

    if (action.type === "select-shop-item") {
      if (!this.shopOpen || this.shopLoadStatus !== "ready") {
        return;
      }

      this.shopSelectedIndex = clampSelectionIndex(
        action.index,
        this.getCurrentShopItemIds().length,
      );
      this.shopMessage = "";
      this.renderShopUi();
      return;
    }

    if (action.type === "purchase-shop-item") {
      if (!this.shopOpen || this.shopLoadStatus !== "ready") {
        return;
      }

      playBattleConfirmSound();
      this.confirmShopSelection();
      return;
    }

    if (action.type === "select-pc-focus") {
      if (!this.pcBoxOpen) {
        return;
      }

      this.pcBoxFocus = action.focus;
      this.pcBoxMessage = "";
      this.renderPcBoxUi();
      return;
    }

    if (action.type === "select-pc-party") {
      if (!this.pcBoxOpen || action.slotIndex < 0 || action.slotIndex >= PLAYER_PARTY_SLOT_COUNT) {
        return;
      }

      this.pcBoxFocus = "party";
      this.pcBoxPartySlotIndex = action.slotIndex;
      this.pcBoxMessage = "";
      this.renderPcBoxUi();
      return;
    }

    if (action.type === "select-pc-box") {
      const boxCount = this.gameStateStore.getCurrentLocalPlayer().pokemonBox.length;

      if (!this.pcBoxOpen || action.boxIndex < 0 || action.boxIndex >= boxCount) {
        return;
      }

      this.pcBoxFocus = "box";
      this.pcBoxBoxIndex = action.boxIndex;
      this.pcBoxMessage = "";
      this.renderPcBoxUi();
      return;
    }

    if (action.type === "confirm-pc-selection") {
      if (!this.pcBoxOpen) {
        return;
      }

      playBattleConfirmSound();
      this.confirmPcBoxSelection();
      return;
    }

    if (action.type === "select-dice-prediction") {
      if (!this.diceGambleOpen) {
        return;
      }

      this.selectDiceGamblePrediction(action.prediction);
      return;
    }

    if (action.type === "confirm-dice-selection") {
      if (!this.diceGambleOpen) {
        return;
      }

      playBattleConfirmSound();
      this.confirmDiceGambleSelection();
      return;
    }

    if (action.type === "set-party-lead") {
      if (this.mobileWorldView !== "party") {
        return;
      }

      const pokemon = this.getPartyPokemonBySlotIndex(action.slotIndex);
      const localPlayer = this.gameStateStore.getCurrentLocalPlayer();

      if (
        !pokemon ||
        pokemon.status === "fainted" ||
        action.slotIndex === localPlayer.activePartySlotIndex
      ) {
        return;
      }

      if (this.gameStateStore.setActivePartySlot(action.slotIndex).ok) {
        playBattleConfirmSound();
        this.renderPartyHud();
        this.publishMobileWorldUiState();
      }
    }
  }

  private isMobileWorldSurfaceOpen(): boolean {
    return (
      this.shortcutGuideOpen ||
      this.shopOpen ||
      this.inventoryOpen ||
      this.pcBoxOpen ||
      this.diceGambleOpen ||
      this.battleIntroPlaying ||
      this.mobileWorldView === "party"
    );
  }

  private hasMobileFullscreenSceneOpen(): boolean {
    return hasPokeLoungeMobileFullscreenScene(this.document);
  }

  private closeMobileWorldSurface(): void {
    if (this.shortcutGuideOpen) {
      this.closeShortcutGuide();
      return;
    }

    if (this.shopOpen) {
      this.closeShop();
      return;
    }

    if (this.inventoryOpen) {
      this.closeInventory();
      return;
    }

    if (this.pcBoxOpen) {
      this.closePcBox();
      return;
    }

    if (this.diceGambleOpen) {
      this.closeDiceGamble();
      return;
    }

    if (this.mobileWorldView === "party") {
      this.mobileWorldView = "explore";
      this.publishMobileWorldUiState();
    }
  }

  private publishMobileWorldUiState(): void {
    if (!this.dependencies.worldUiStore) {
      return;
    }

    const localPlayer = this.gameStateStore.getCurrentLocalPlayer();
    const inventoryItemIds = this.getInventoryItemIds();
    const shopItemIds = this.getCurrentShopItemIds();

    if (this.inventoryOpen) {
      this.inventorySelectedIndex = clampSelectionIndex(
        this.inventorySelectedIndex,
        inventoryItemIds.length,
      );
    }

    if (this.shopOpen) {
      this.shopSelectedIndex = clampSelectionIndex(this.shopSelectedIndex, shopItemIds.length);
    }

    if (this.pcBoxOpen) {
      this.pcBoxPartySlotIndex = clampSelectionIndex(
        this.pcBoxPartySlotIndex,
        PLAYER_PARTY_SLOT_COUNT,
      );
      this.pcBoxBoxIndex = clampSelectionIndex(
        this.pcBoxBoxIndex,
        Math.max(1, localPlayer.pokemonBox.length),
      );
    }

    const activeItemIds = this.inventoryOpen ? inventoryItemIds : this.shopOpen ? shopItemIds : [];
    const selectedIndex = this.inventoryOpen ? this.inventorySelectedIndex : this.shopSelectedIndex;
    const items = activeItemIds.flatMap(
      function mapItem(
        this: DefaultWorldSceneInteractions,
        itemId:
          | "potion"
          | "pokeball"
          | "antidote"
          | "superPotion"
          | "hyperPotion"
          | "revive"
          | "ultraBall"
          | "rareCandy"
          | "sunStone"
          | "moonStone"
          | "fireStone"
          | "thunderStone"
          | "waterStone"
          | "leafStone"
          | "shinyStone"
          | "duskStone"
          | "dawnStone",
        index: number,
      ): {
        count: number;
        description: string;
        disabled: boolean;
        id: string;
        index: number;
        name: string;
        price: number | null;
        selected: boolean;
      }[] {
        const item = this.getKnownShopItem(itemId);

        if (!item) {
          return [];
        }

        const count = localPlayer.inventory[item.id] ?? 0;

        return [
          {
            count,
            description: item.description,
            disabled: false,
            id: item.id,
            index,
            name: item.displayName,
            price: this.shopOpen ? item.price : null,
            selected: index === selectedIndex,
          },
        ];
      }.bind(this),
    );
    const selectedItem =
      items.find(function findItem(item) {
        return item.selected;
      }) ?? items[0];
    const party = createPokeLoungePartySlotSummaries(localPlayer);
    const moveReplacementPokemon = this.getInventoryMoveReplacementPokemon();
    const pendingMoveReplacement = this.pendingInventoryMoveReplacements[0] ?? null;
    const moveReplacement =
      this.inventoryFocus === "move-replace" && moveReplacementPokemon && pendingMoveReplacement
        ? {
            moves: (moveReplacementPokemon.moves ?? []).map(
              function mapItem(
                this: DefaultWorldSceneInteractions,
                move: PlayerPokemonMove,
                index: number,
              ): { id: number; index: number; name: string; selected: boolean } {
                return {
                  id: move.id,
                  index,
                  name: move.name,
                  selected: index === this.inventoryMoveReplaceIndex,
                };
              }.bind(this),
            ),
            confirmationIndex: this.inventoryMoveConfirmation?.index ?? null,
            newMovePp: pendingMoveReplacement.pp,
            newMoveMaxPp: pendingMoveReplacement.maxPp,
            newMoveName: pendingMoveReplacement.name,
            pokemonName: moveReplacementPokemon.name,
          }
        : null;
    const box = localPlayer.pokemonBox.map(
      function mapItem(
        this: DefaultWorldSceneInteractions,
        pokemon: PlayerPokemon,
        boxIndex: number,
      ): {
        boxIndex: number;
        currentHp: number | null;
        level: number;
        maxHp: number | null;
        name: string;
        selected: boolean;
        status: PlayerPokemonStatus | null;
      } {
        return {
          boxIndex,
          currentHp: pokemon.currentHp ?? null,
          level: pokemon.level,
          maxHp: pokemon.maxHp ?? null,
          name: pokemon.name,
          selected: this.pcBoxFocus === "box" && boxIndex === this.pcBoxBoxIndex,
          status: pokemon.status ?? null,
        };
      }.bind(this),
    );
    const dice = this.diceGambleRound
      ? {
          options: DICE_GAMBLE_PREDICTIONS.map(
            function mapItem(
              this: DefaultWorldSceneInteractions,
              prediction: "lower" | "equal" | "higher",
              index: number,
            ): {
              disabled: boolean;
              label: string;
              prediction: "lower" | "equal" | "higher";
              rewardPokeDollars: number;
              selected: boolean;
              winningCaseCount: number;
            } {
              const option = this.diceGambleRound?.options[prediction];

              return {
                disabled: !option || option.winningCaseCount <= 0,
                label: DICE_GAMBLE_LABELS[prediction],
                prediction,
                rewardPokeDollars: option?.rewardPokeDollars ?? 0,
                selected: index === this.diceGambleSelectedIndex,
                winningCaseCount: option?.winningCaseCount ?? 0,
              };
            }.bind(this),
          ),
          stakePokeDollars: DICE_GAMBLE_STAKE_POKE_DOLLARS,
          targetNumber: this.diceGambleRound.targetNumber,
        }
      : null;
    let screen: MobileWorldUiScreen = "explore";
    let title = "필드 조작";
    let message = "";

    if (this.shortcutGuideOpen) {
      screen = "help";
      title = createShortcutGuideTitle("world", getShortcutGuideInputMode());
    } else if (this.inventoryOpen) {
      screen =
        this.inventoryFocus === "move-replace"
          ? "inventory-move-replace"
          : this.inventoryFocus === "party"
            ? "inventory-party"
            : "inventory-items";
      title =
        this.inventoryFocus === "move-replace"
          ? "기술 교체"
          : this.inventoryFocus === "party"
            ? "사용할 포켓몬"
            : "가방";
      message = this.inventoryMessage;
    } else if (this.shopOpen) {
      screen = "shop";
      title = this.getCurrentShopTitle();
      message = this.shopMessage;
    } else if (this.pcBoxOpen) {
      screen = "pc";
      title = "PC 박스";
      message = this.pcBoxMessage;
    } else if (this.diceGambleOpen) {
      screen = "dice";
      title = "주사위 겜블";
      message = this.diceGambleMessage;
    } else if (this.mobileWorldView === "party") {
      screen = "party";
      title = "파티";
    }

    const state = {
      box,
      dice,
      items,
      inputMode: getShortcutGuideInputMode(),
      message,
      moveReplacement,
      party,
      pcFocus: this.pcBoxFocus,
      screen,
      selectedItemDescription: selectedItem?.description ?? "",
      selectedItemName: selectedItem?.name ?? "",
      selectedPartySlotIndex:
        this.inventoryFocus === "party" || this.inventoryFocus === "move-replace"
          ? this.inventoryPartySlotIndex
          : this.pcBoxPartySlotIndex,
      title,
      walletPokeDollars: localPlayer.wallet.pokeDollars,
    };

    this.dependencies.worldUiStore.publishMobile(state);
  }

  handleInput(): boolean {
    if (
      this.usesMobileWorldDeck() &&
      (this.isMobileWorldSurfaceOpen() || this.hasMobileFullscreenSceneOpen())
    ) {
      return true;
    }

    if (this.shortcutGuideOpen) {
      this.handleShortcutGuideKeyboardInput();
      return true;
    }

    if (this.shopOpen) {
      this.handleShopKeyboardInput();
      return true;
    }

    if (this.inventoryOpen) {
      this.handleInventoryKeyboardInput();
      return true;
    }

    if (this.pcBoxOpen) {
      this.handlePcBoxKeyboardInput();
      return true;
    }

    if (this.dependencies.isPokemonStatusPanelOpen()) {
      this.handlePokemonStatusPanelKeyboardInput();
      return true;
    }

    if (this.diceGambleOpen) {
      this.handleDiceGambleKeyboardInput();
      return true;
    }

    this.handleFieldInteractionInput();

    return (
      this.shopOpen ||
      this.inventoryOpen ||
      this.pcBoxOpen ||
      this.diceGambleOpen ||
      this.mobileWorldView === "party"
    );
  }

  canOpenPokemonStatusPanel(): boolean {
    return (
      !this.usesMobileWorldDeck() &&
      !this.shortcutGuideOpen &&
      !this.shopOpen &&
      !this.inventoryOpen &&
      !this.pcBoxOpen &&
      !this.diceGambleOpen &&
      !this.battleIntroPlaying
    );
  }

  getE2eSnapshot(): Pick<
    WorldE2eSnapshot,
    | "pokemonStatusPanel"
    | "pcBox"
    | "shortcutGuideOpen"
    | "nurseHealing"
    | "nurseMessage"
    | "interactionPrompt"
    | "surface"
    | "shopKind"
  > {
    return {
      shortcutGuideOpen: this.shortcutGuideOpen,
      pokemonStatusPanel: this.dependencies.getPokemonStatusPanelSnapshot(),
      pcBox: this.getPcBoxSnapshot(),
      nurseHealing: {
        active: this.nurseHealing,
        effectCount: this.nurseHealingEffectCount,
      },
      nurseMessage: this.nurseMessage,
      interactionPrompt: this.fieldHintText || null,
      surface: this.shortcutGuideOpen
        ? "help"
        : this.shopOpen
          ? "shop"
          : this.inventoryOpen
            ? "inventory"
            : this.pcBoxOpen
              ? "pc"
              : this.diceGambleOpen
                ? "dice"
                : this.mobileWorldView === "party"
                  ? "party"
                  : null,
      shopKind: this.shopOpen ? this.activeShopKind : null,
    };
  }

  destroy(): void {
    this.closeShop();
    this.closeInventory();
    this.closePcBox();
    this.closeShortcutGuide({ markViewed: false });
    this.closePokemonStatusPanel({ rerenderPartyHud: false });
    this.closeDiceGamble();
    this.nurseMessage = "";
    this.nurseHealing = false;
    this.fieldHintText = "";
    this.areaAnnouncementExpiresAt = 0;
    this.lastEncounterAreaId = undefined;
  }

  private selectDiceGamblePrediction(prediction: DiceGamblePrediction): void {
    const index = DICE_GAMBLE_PREDICTIONS.indexOf(prediction);

    if (index < 0) {
      return;
    }

    this.diceGambleSelectedIndex = index;
    this.diceGambleMessage = "";
    this.renderDiceGambleUi();
  }

  private renderPartyHud(): void {
    this.dependencies.renderPartyHud();
    this.publishMobileWorldUiState();
  }

  private closePokemonStatusPanel(options: { rerenderPartyHud?: boolean } = {}): void {
    this.dependencies.closePokemonStatusPanel(options);
  }

  private handlePokemonStatusPanelKeyboardInput(): void {
    const closeRequested =
      consumeVirtualGamepadPress("back") ||
      this.dependencies.keyboard.consume("Escape", "Backspace");
    if (closeRequested) {
      playBattleCancelSound();
      this.closePokemonStatusPanel();
      return;
    }
    if (!(consumeVirtualGamepadPress("confirm") || this.isConfirmJustDown())) return;
    const snapshot = this.dependencies.getPokemonStatusPanelSnapshot();
    if (!snapshot) return;
    const localPlayer = this.gameStateStore.getCurrentLocalPlayer();
    if (
      snapshot.slotIndex !== localPlayer.activePartySlotIndex &&
      snapshot.status !== "fainted" &&
      this.gameStateStore.setActivePartySlot(snapshot.slotIndex).ok
    ) {
      playBattleConfirmSound();
      this.renderPartyHud();
    }
  }

  private getPartyPokemonBySlotIndex(slotIndex: number): PlayerPokemon | null {
    return this.dependencies.getPartyPokemonBySlotIndex(slotIndex);
  }

  private formatPokemonHp(pokemon: PlayerPokemon): string {
    return formatPokemonHp(pokemon);
  }

  createStaticNpcs(map: ObjectLayerLookup): void {
    for (const object of map.getObjectLayer("Npcs")?.objects ?? []) {
      const npcKey = object.name as keyof typeof FIELD_MAP.npcs | undefined;
      if (
        !npcKey ||
        !FIELD_MAP.npcs[npcKey] ||
        typeof object.x !== "number" ||
        typeof object.y !== "number"
      )
        continue;
      const position = { x: object.x, y: object.y };
      if (npcKey === "shopkeeper") this.shopkeeperPosition = position;
      else if (npcKey === "premiumShopkeeper") this.premiumShopkeeperPosition = position;
      else if (npcKey === "gamehost") this.gamehostPosition = position;
      else if (npcKey === "soloChallenger") this.soloChallengerPosition = position;
      else if (npcKey === "nurse") this.nursePosition = position;
      else if (npcKey === "storagePc") this.storagePcPosition = position;
    }
  }

  private handleFieldInteractionInput(): void {
    this.updateFieldGuidance();
    if (consumeVirtualGamepadPress("bag") || this.dependencies.keyboard.consume("KeyI")) {
      playBattleConfirmSound();
      this.openInventory();
      return;
    }
    if (consumeVirtualGamepadPress("help") || this.dependencies.keyboard.consume("KeyH")) {
      playBattleConfirmSound();
      this.openShortcutGuide();
      return;
    }
    if (consumeVirtualGamepadPress("confirm") || this.isConfirmJustDown()) {
      playBattleConfirmSound();
      this.handleConfirmInteraction();
    }
  }

  private handleShortcutGuideKeyboardInput(): void {
    if (
      consumeVirtualGamepadPress("help") ||
      consumeVirtualGamepadPress("back") ||
      consumeVirtualGamepadPress("confirm") ||
      this.dependencies.keyboard.consume("KeyH", "Escape", "Backspace", "Enter", "Space", "KeyZ")
    ) {
      playBattleCancelSound();
      this.closeShortcutGuide();
    }
  }

  private handleInventoryKeyboardInput(): void {
    if (consumeVirtualGamepadPress("up") || this.dependencies.keyboard.consume("ArrowUp", "KeyW")) {
      this.moveInventorySelection(-1);
      return;
    }
    if (
      consumeVirtualGamepadPress("down") ||
      this.dependencies.keyboard.consume("ArrowDown", "KeyS")
    ) {
      this.moveInventorySelection(1);
      return;
    }
    if (consumeVirtualGamepadPress("confirm") || this.isConfirmJustDown()) {
      playBattleConfirmSound();
      this.confirmInventorySelection();
      return;
    }
    if (consumeVirtualGamepadPress("bag") || this.dependencies.keyboard.consume("KeyI")) {
      playBattleCancelSound();
      if (this.inventoryFocus === "move-replace") this.skipInventoryMoveReplacement();
      else this.closeInventory();
      return;
    }
    if (
      consumeVirtualGamepadPress("back") ||
      this.dependencies.keyboard.consume("Escape", "Backspace")
    ) {
      playBattleCancelSound();
      this.cancelInventorySelection();
    }
  }

  private handlePcBoxKeyboardInput(): void {
    if (consumeVirtualGamepadPress("up") || this.dependencies.keyboard.consume("ArrowUp", "KeyW")) {
      this.movePcBoxSelection(-1);
      return;
    }
    if (
      consumeVirtualGamepadPress("down") ||
      this.dependencies.keyboard.consume("ArrowDown", "KeyS")
    ) {
      this.movePcBoxSelection(1);
      return;
    }
    if (
      consumeVirtualGamepadPress("left") ||
      consumeVirtualGamepadPress("right") ||
      this.dependencies.keyboard.consume("ArrowLeft", "ArrowRight", "KeyA", "KeyD")
    ) {
      playBattleConfirmSound();
      this.togglePcBoxFocus();
      return;
    }
    if (consumeVirtualGamepadPress("confirm") || this.isConfirmJustDown()) {
      playBattleConfirmSound();
      this.confirmPcBoxSelection();
      return;
    }
    if (
      consumeVirtualGamepadPress("back") ||
      this.dependencies.keyboard.consume("Escape", "Backspace")
    ) {
      playBattleCancelSound();
      this.closePcBox();
    }
  }

  private handleShopKeyboardInput(): void {
    if (consumeVirtualGamepadPress("up") || this.dependencies.keyboard.consume("ArrowUp", "KeyW")) {
      this.moveShopSelection(-1);
      return;
    }
    if (
      consumeVirtualGamepadPress("down") ||
      this.dependencies.keyboard.consume("ArrowDown", "KeyS")
    ) {
      this.moveShopSelection(1);
      return;
    }
    if (consumeVirtualGamepadPress("confirm") || this.isConfirmJustDown()) {
      playBattleConfirmSound();
      this.confirmShopSelection();
      return;
    }
    if (
      consumeVirtualGamepadPress("back") ||
      this.dependencies.keyboard.consume("Escape", "Backspace")
    ) {
      playBattleCancelSound();
      this.closeShop();
    }
  }

  private handleDiceGambleKeyboardInput(): void {
    if (consumeVirtualGamepadPress("up") || this.dependencies.keyboard.consume("ArrowUp", "KeyW")) {
      this.moveDiceGambleSelection(-1);
      return;
    }
    if (
      consumeVirtualGamepadPress("down") ||
      this.dependencies.keyboard.consume("ArrowDown", "KeyS")
    ) {
      this.moveDiceGambleSelection(1);
      return;
    }
    if (consumeVirtualGamepadPress("confirm") || this.isConfirmJustDown()) {
      playBattleConfirmSound();
      this.confirmDiceGambleSelection();
      return;
    }
    if (
      consumeVirtualGamepadPress("back") ||
      this.dependencies.keyboard.consume("Escape", "Backspace")
    ) {
      playBattleCancelSound();
      this.closeDiceGamble();
    }
  }

  private isConfirmJustDown(): boolean {
    return this.dependencies.keyboard.consume("Enter", "Space", "KeyZ");
  }

  private handleConfirmInteraction(): void {
    const playerPosition = this.dependencies.getPlayerPosition();

    if (!playerPosition) {
      return;
    }

    if (this.isPlayerNearShopkeeper(playerPosition)) {
      this.openShop("basic");
      return;
    }

    if (this.isPlayerNearPremiumShopkeeper(playerPosition)) {
      this.openShop("premium");
      return;
    }

    if (this.isPlayerNearStoragePc(playerPosition)) {
      this.openPcBox();
      return;
    }

    if (this.isPlayerNearNurse(playerPosition)) {
      this.healAtNurse();
      return;
    }

    if (
      this.dependencies.canStartSoloChallenge() &&
      this.isPlayerNearSoloChallenger(playerPosition)
    ) {
      this.dependencies.startSoloChallenge();
      return;
    }

    if (this.isPlayerNearGamehost(playerPosition)) {
      this.openDiceGamble();
    }
  }

  private updateFieldGuidance(nowMs = Date.now()): void {
    const playerPosition = this.dependencies.getPlayerPosition();

    if (!playerPosition) {
      this.renderFieldHint("");
      return;
    }

    if (this.areaAnnouncementExpiresAt > 0 && nowMs >= this.areaAnnouncementExpiresAt) {
      this.areaAnnouncementExpiresAt = 0;
      this.dependencies.worldUiStore.publishPresentation({ areaAnnouncement: null });
    }

    const areaId = resolveFieldEncounterAreaId(playerPosition);

    if (areaId !== this.lastEncounterAreaId) {
      this.lastEncounterAreaId = areaId;

      if (areaId && FIELD_AREA_LABELS[areaId]) {
        this.renderAreaAnnouncement(FIELD_AREA_LABELS[areaId], nowMs);
      }
    }

    this.renderFieldHint(this.getNearbyInteractionHint(playerPosition));
  }

  private getNearbyInteractionHint(playerPosition: WorldScenePlayerPosition): string {
    const interactionKey = this.usesMobileWorldDeck() ? "A" : "A / Enter";

    if (this.isPlayerNearShopkeeper(playerPosition)) {
      return `${interactionKey} · 기본 상점`;
    }

    if (this.isPlayerNearPremiumShopkeeper(playerPosition)) {
      return `${interactionKey} · 희귀 상점`;
    }

    if (this.isPlayerNearStoragePc(playerPosition)) {
      return `${interactionKey} · PC 박스`;
    }

    if (this.isPlayerNearNurse(playerPosition)) {
      return `${interactionKey} · 파티 회복`;
    }

    if (
      this.dependencies.canStartSoloChallenge() &&
      this.isPlayerNearSoloChallenger(playerPosition)
    ) {
      return `${interactionKey} · 솔로 챌린지`;
    }

    if (this.isPlayerNearGamehost(playerPosition)) {
      return `${interactionKey} · 주사위 겜블`;
    }

    return "";
  }

  private renderFieldHint(nextText: string): void {
    if (this.fieldHintText === nextText) return;
    this.fieldHintText = nextText;
    this.dependencies.worldUiStore.publishPresentation({
      interactionPrompt: nextText || null,
    });
  }

  private renderAreaAnnouncement(label: string, nowMs: number): void {
    this.areaAnnouncementExpiresAt = nowMs + FIELD_AREA_ANNOUNCEMENT_DURATION_MS;
    this.dependencies.worldUiStore.publishPresentation({ areaAnnouncement: label });
  }

  private isPlayerNearShopkeeper(playerPosition: WorldScenePlayerPosition): boolean {
    if (!this.shopkeeperPosition) {
      return false;
    }

    return (
      Math.hypot(
        playerPosition.x - this.shopkeeperPosition.x,
        playerPosition.y - this.shopkeeperPosition.y,
      ) <= NURSE_INTERACTION_DISTANCE
    );
  }

  private isPlayerNearPremiumShopkeeper(playerPosition: WorldScenePlayerPosition): boolean {
    if (!this.premiumShopkeeperPosition) {
      return false;
    }

    return (
      Math.hypot(
        playerPosition.x - this.premiumShopkeeperPosition.x,
        playerPosition.y - this.premiumShopkeeperPosition.y,
      ) <= 56
    );
  }

  private isPlayerNearGamehost(playerPosition: WorldScenePlayerPosition): boolean {
    if (!this.gamehostPosition) {
      return false;
    }

    return (
      Math.hypot(
        playerPosition.x - this.gamehostPosition.x,
        playerPosition.y - this.gamehostPosition.y,
      ) <= 56
    );
  }

  private isPlayerNearSoloChallenger(playerPosition: WorldScenePlayerPosition): boolean {
    if (!this.soloChallengerPosition) {
      return false;
    }

    return (
      Math.hypot(
        playerPosition.x - this.soloChallengerPosition.x,
        playerPosition.y - this.soloChallengerPosition.y,
      ) <= 56
    );
  }

  private isPlayerNearNurse(playerPosition: WorldScenePlayerPosition): boolean {
    if (!this.nursePosition) {
      return false;
    }

    return (
      Math.hypot(
        playerPosition.x - this.nursePosition.x,
        playerPosition.y - this.nursePosition.y,
      ) <= 56
    );
  }

  private isPlayerNearStoragePc(playerPosition: WorldScenePlayerPosition): boolean {
    if (!this.storagePcPosition) {
      return false;
    }

    return (
      Math.hypot(
        playerPosition.x - this.storagePcPosition.x,
        playerPosition.y - this.storagePcPosition.y,
      ) <= 42
    );
  }

  private healAtNurse(): void {
    if (!this.nursePosition || this.nurseHealing) {
      return;
    }

    this.gameStateStore.healCurrentParty();
    this.renderPartyHud();
    playPartyHealSound();
    this.nurseMessage = "포켓몬이 모두 회복됐다.";
    this.renderNurseMessage();
    this.nurseHealing = true;
    this.nurseHealingEffectCount += 1;
    this.publishNursePresentation();
    this.dependencies.playNurseHealingEffect(
      this.nursePosition,
      function callback(this: DefaultWorldSceneInteractions): void {
        this.nurseHealing = false;
        this.publishNursePresentation();
      }.bind(this),
    );
  }

  private renderNurseMessage(): void {
    this.publishNursePresentation();
  }

  private publishNursePresentation(): void {
    this.dependencies.worldUiStore?.publishPresentation({
      nurseHealing: {
        active: this.nurseHealing,
        effectCount: this.nurseHealingEffectCount,
      },
      nurseMessage: this.nurseMessage || null,
    });
  }

  private openShop(shopKind: ShopKind = "basic"): void {
    this.mobileWorldView = "explore";
    clearRuntimeShopItemRomIds(this.activeShopKind);
    this.activeShopKind = shopKind;
    clearRuntimeShopItemRomIds(shopKind);
    this.shopOpen = true;
    this.shopSelectedIndex = 0;
    this.shopLoadStatus = "loading";
    this.shopMessage = "상품을 불러오는 중…";
    const requestId = (this.shopLoadRequestId += 1);
    this.renderShopUi();

    void (this.dependencies.loadShopItemRomIds ?? loadRuntimeShopItemRomIds)(shopKind)
      .then(
        function handleResolved(
          this: DefaultWorldSceneInteractions,
          itemIds: readonly number[],
        ): void {
          if (
            requestId !== this.shopLoadRequestId ||
            !this.shopOpen ||
            this.activeShopKind !== shopKind
          ) {
            return;
          }
          registerRuntimeShopItemRomIds(shopKind, itemIds);
          this.shopLoadStatus = "ready";
          this.shopMessage = "";
          this.renderShopUi();
        }.bind(this),
      )
      .catch(
        function handleRejected(this: DefaultWorldSceneInteractions): void {
          if (
            requestId !== this.shopLoadRequestId ||
            !this.shopOpen ||
            this.activeShopKind !== shopKind
          ) {
            return;
          }
          clearRuntimeShopItemRomIds(shopKind);
          this.shopLoadStatus = "error";
          this.shopMessage = "판매 목록을 불러오지 못했다. 상점을 닫고 다시 시도해 주세요.";
          this.renderShopUi();
        }.bind(this),
      );
  }

  private closeShop(): void {
    this.shopLoadRequestId += 1;
    clearRuntimeShopItemRomIds(this.activeShopKind);
    this.shopOpen = false;
    this.shopLoadStatus = "idle";
    this.shopMessage = "";
    this.destroyShopUi();
    this.publishMobileWorldUiState();
  }

  private moveShopSelection(delta: number): void {
    if (this.shopLoadStatus !== "ready") {
      return;
    }
    const shopItemIds = this.getCurrentShopItemIds();

    if (shopItemIds.length === 0) {
      this.shopSelectedIndex = 0;
      this.shopMessage = "";
      this.renderShopUi();
      return;
    }

    this.shopSelectedIndex =
      (this.shopSelectedIndex + delta + shopItemIds.length) % shopItemIds.length;
    this.shopMessage = "";
    this.renderShopUi();
  }

  private confirmShopSelection(): void {
    if (this.shopLoadStatus !== "ready") {
      return;
    }
    const shopItemIds = this.getCurrentShopItemIds();
    const itemId = shopItemIds[this.shopSelectedIndex] ?? shopItemIds[0];
    const item = this.getKnownShopItem(itemId);

    if (!item) {
      this.shopMessage = "아직 살 수 있는 상품이 없다.";
      this.renderShopUi();
      return;
    }

    const result =
      this.activeShopKind === "premium"
        ? this.gameStateStore.buyPremiumShopItem(item.id, 1)
        : this.gameStateStore.buyShopItem(item.id, 1);

    this.shopMessage = result.ok
      ? `${item.displayName}을 구매했다.`
      : result.reason === "insufficient-funds"
        ? "돈이 부족하다."
        : "구매할 수 없다.";
    this.renderShopUi();
  }

  private renderShopUi(): void {
    this.publishMobileWorldUiState();
  }

  private destroyShopUi(): void {}

  private getCurrentShopItemIds(): KnownShopItemId[] {
    if (!this.shopOpen || this.shopLoadStatus !== "ready") {
      return [];
    }
    return getRuntimeShopItemIds(this.activeShopKind);
  }

  private getCurrentShopTitle(): string {
    return this.activeShopKind === "premium" ? "희귀 상점" : "상점";
  }

  private getKnownShopItem(itemId: string | undefined): ShopItem | null {
    if (!itemId) {
      return null;
    }

    return getShopItemById(itemId) ?? null;
  }

  private openInventory(): void {
    this.mobileWorldView = "explore";
    this.inventoryOpen = true;
    this.inventoryFocus = "items";
    this.inventorySelectedIndex = 0;
    this.inventoryPartySlotIndex = this.gameStateStore.getCurrentLocalPlayer().activePartySlotIndex;
    this.inventoryMoveReplaceIndex = 0;
    this.inventoryMoveReplacementDecisions = [];
    this.inventoryTargetItemId = null;
    this.pendingInventoryItemId = null;
    this.pendingInventoryMovePokemon = null;
    this.pendingInventoryMoveReplacements = [];
    this.inventoryMoveConfirmation = null;
    this.inventoryMessage = "";
    this.renderInventoryUi();
  }

  private closeInventory(): void {
    this.inventoryOpen = false;
    this.inventoryFocus = "items";
    this.inventoryMoveReplaceIndex = 0;
    this.inventoryMoveReplacementDecisions = [];
    this.inventoryTargetItemId = null;
    this.pendingInventoryItemId = null;
    this.pendingInventoryMovePokemon = null;
    this.pendingInventoryMoveReplacements = [];
    this.inventoryMoveConfirmation = null;
    this.inventoryMessage = "";
    this.destroyInventoryUi();
    dispatchPokeLoungeAccessibleStatus(document, "필드 탐색");
    this.publishMobileWorldUiState();
  }

  private cancelInventorySelection(): void {
    if (this.inventoryFocus === "move-replace") {
      this.skipInventoryMoveReplacement();
      return;
    }

    if (this.inventoryFocus === "party") {
      this.inventoryFocus = "items";
      this.inventoryTargetItemId = null;
      this.inventoryMessage = "";
      this.renderInventoryUi();
      return;
    }

    this.closeInventory();
  }

  private moveInventorySelection(delta: number): void {
    if (this.inventoryMoveConfirmation) return;
    if (this.inventoryFocus === "move-replace") {
      const pokemon = this.getInventoryMoveReplacementPokemon();
      const moveCount = pokemon?.moves?.length ?? 0;

      if (moveCount === 0) {
        return;
      }

      this.inventoryMoveReplaceIndex =
        (this.inventoryMoveReplaceIndex + delta + moveCount) % moveCount;
      this.renderInventoryUi();
      return;
    }

    if (this.inventoryFocus === "party") {
      const targetSlotIndices = this.getInventoryTargetSlotIndices();

      if (targetSlotIndices.length === 0) {
        return;
      }

      const currentIndex = Math.max(0, targetSlotIndices.indexOf(this.inventoryPartySlotIndex));
      const nextIndex =
        (currentIndex + delta + targetSlotIndices.length) % targetSlotIndices.length;
      this.inventoryPartySlotIndex = targetSlotIndices[nextIndex];
      this.inventoryMessage = "";
      this.renderInventoryUi();
      return;
    }

    const itemIds = this.getInventoryItemIds();

    if (itemIds.length === 0) {
      return;
    }

    this.inventorySelectedIndex =
      (this.inventorySelectedIndex + delta + itemIds.length) % itemIds.length;
    this.inventoryMessage = "";
    this.renderInventoryUi();
  }

  private confirmInventorySelection(): void {
    if (this.inventoryFocus === "move-replace") {
      this.confirmInventoryMoveReplacement();
      return;
    }

    const itemIds = this.getInventoryItemIds();
    const selectedItemId = itemIds[this.inventorySelectedIndex] ?? itemIds[0];
    const localPlayer = this.gameStateStore.getCurrentLocalPlayer();

    if (!selectedItemId && this.inventoryFocus === "items") {
      this.inventoryMessage = "사용할 아이템이 없다.";
      this.renderInventoryUi();
      return;
    }

    if (this.inventoryFocus === "items") {
      const item = this.getKnownShopItem(selectedItemId);

      if (!selectedItemId || (localPlayer.inventory[selectedItemId] ?? 0) <= 0) {
        this.inventoryMessage = `${item?.displayName ?? "아이템"}이 없다!`;
        this.renderInventoryUi();
        return;
      }

      const targetSlotIndices = this.getInventoryTargetSlotIndices();

      if (targetSlotIndices.length === 0) {
        this.inventoryMessage = "대상 포켓몬이 없다.";
        this.renderInventoryUi();
        return;
      }

      this.inventoryFocus = "party";
      this.inventoryTargetItemId = selectedItemId;
      this.inventoryPartySlotIndex = targetSlotIndices.includes(localPlayer.activePartySlotIndex)
        ? localPlayer.activePartySlotIndex
        : targetSlotIndices[0];
      this.inventoryMessage = `${item?.displayName ?? "아이템"}을 사용할 대상을 선택해라.`;
      this.renderInventoryUi();
      return;
    }

    const itemId = this.inventoryTargetItemId;

    if (!itemId) {
      this.inventoryFocus = "items";
      this.inventoryMessage = "사용할 아이템을 다시 선택해라.";
      this.renderInventoryUi();
      return;
    }

    const result = this.gameStateStore.useInventoryItemOnPartySlot(
      itemId,
      this.inventoryPartySlotIndex,
    );

    this.inventoryMessage = result.ok ? result.messages.join(" ") : result.message;
    if (result.ok) {
      this.pendingInventoryMoveReplacements = [...result.pendingMoveReplacements];
      if (this.pendingInventoryMoveReplacements.length > 0) {
        this.inventoryFocus = "move-replace";
        this.inventoryMoveReplaceIndex = 0;
        this.inventoryMoveReplacementDecisions = [];
        this.pendingInventoryItemId = itemId;
        this.pendingInventoryMovePokemon = result.pokemon;
        this.showPendingInventoryMoveReplacement(this.inventoryMessage);
        return;
      }

      this.renderPartyHud();
      this.finishInventoryItemUse(itemId);
      return;
    }
    this.renderInventoryUi();
  }

  private confirmInventoryMoveReplacement(): void {
    const pokemon = this.getInventoryMoveReplacementPokemon();
    const pendingMove = this.pendingInventoryMoveReplacements[0];
    const replacedMove = pokemon?.moves?.[this.inventoryMoveReplaceIndex];

    if (!pokemon || !pendingMove || !replacedMove) {
      this.cancelInventoryMoveReplacement("기술 교체를 완료할 수 없다.");
      return;
    }

    if (!this.inventoryMoveConfirmation) {
      this.inventoryMoveConfirmation = createMoveReplacementConfirmation(
        pokemon.moves ?? [],
        pendingMove,
        this.inventoryMoveReplaceIndex,
      );
      this.renderInventoryUi();
      return;
    }
    if (
      !isMoveReplacementConfirmationCurrent(
        this.inventoryMoveConfirmation,
        pokemon.moves ?? [],
        pendingMove,
      )
    ) {
      this.inventoryMoveConfirmation = null;
      this.renderInventoryUi();
      return;
    }
    this.inventoryMoveReplaceIndex = this.inventoryMoveConfirmation.index;
    this.inventoryMoveConfirmation = null;
    this.pendingInventoryMovePokemon = {
      ...pokemon,
      moves: (pokemon.moves ?? []).map(
        function mapItem(
          this: DefaultWorldSceneInteractions,
          move: PlayerPokemonMove,
          index: number,
        ): PlayerPokemonMove {
          return index === this.inventoryMoveReplaceIndex ? pendingMove : move;
        }.bind(this),
      ),
    };
    this.inventoryMoveReplacementDecisions.push(this.inventoryMoveReplaceIndex);
    this.pendingInventoryMoveReplacements.shift();
    const outcomeMessage = `기술이 ${replacedMove.name}에서 ${pendingMove.name}로 바뀌었다!`;

    if (this.pendingInventoryMoveReplacements.length > 0) {
      this.inventoryMoveReplaceIndex = 0;
      this.showPendingInventoryMoveReplacement(outcomeMessage);
      return;
    }

    this.completeInventoryMoveReplacement(outcomeMessage);
  }

  private skipInventoryMoveReplacement(): void {
    if (this.inventoryMoveConfirmation) {
      this.inventoryMoveConfirmation = null;
      this.renderInventoryUi();
      return;
    }
    const skippedMove = this.pendingInventoryMoveReplacements.shift();

    if (!skippedMove) {
      this.cancelInventoryMoveReplacement("");
      return;
    }

    this.inventoryMoveReplacementDecisions.push(null);
    const outcomeMessage = `${skippedMove.name} 습득을 취소했다.`;

    if (this.pendingInventoryMoveReplacements.length > 0) {
      this.inventoryMoveReplaceIndex = 0;
      this.showPendingInventoryMoveReplacement(outcomeMessage);
      return;
    }

    this.completeInventoryMoveReplacement(outcomeMessage);
  }

  private showPendingInventoryMoveReplacement(prefix = ""): void {
    const pokemon = this.getInventoryMoveReplacementPokemon();
    const pendingMove = this.pendingInventoryMoveReplacements[0];

    if (!pokemon || !pendingMove) {
      this.cancelInventoryMoveReplacement(prefix);
      return;
    }

    this.inventoryMessage = prefix;
    this.renderInventoryUi();
  }

  private completeInventoryMoveReplacement(fallbackMessage: string): void {
    const itemId = this.pendingInventoryItemId;
    const result = itemId
      ? this.gameStateStore.resolveInventoryItemMoveReplacements(
          itemId,
          this.inventoryPartySlotIndex,
          this.inventoryMoveReplacementDecisions,
        )
      : null;
    const message = result?.ok
      ? (result.messages.at(-1) ?? fallbackMessage)
      : (result?.message ?? "기술 교체를 완료할 수 없다.");

    this.resetPendingInventoryMoveReplacement();
    this.inventoryMessage = message;
    if (result?.ok && itemId) {
      this.renderPartyHud();
      this.finishInventoryItemUse(itemId);
      return;
    }

    this.inventoryFocus = "party";
    this.renderInventoryUi();
  }

  private cancelInventoryMoveReplacement(message: string): void {
    this.resetPendingInventoryMoveReplacement();
    this.inventoryFocus = "party";
    this.inventoryMessage = message;
    this.renderInventoryUi();
  }

  private finishInventoryItemUse(itemId: string): void {
    if ((this.gameStateStore.getCurrentLocalPlayer().inventory[itemId] ?? 0) <= 0) {
      this.inventoryFocus = "items";
      this.inventoryTargetItemId = null;
      this.inventorySelectedIndex = clampSelectionIndex(
        this.inventorySelectedIndex,
        this.getInventoryItemIds().length,
      );
    } else {
      this.inventoryFocus = "party";
    }

    this.renderInventoryUi();
  }

  private resetPendingInventoryMoveReplacement(): void {
    this.inventoryMoveReplacementDecisions = [];
    this.pendingInventoryItemId = null;
    this.pendingInventoryMovePokemon = null;
    this.pendingInventoryMoveReplacements = [];
    this.inventoryMoveConfirmation = null;
    this.inventoryMoveReplaceIndex = 0;
  }

  private getInventoryMoveReplacementPokemon(): PlayerPokemon | null {
    return (
      this.pendingInventoryMovePokemon ??
      this.getPartyPokemonBySlotIndex(this.inventoryPartySlotIndex)
    );
  }

  private getInventoryTargetSlotIndices(): number[] {
    return this.gameStateStore
      .getCurrentLocalPlayer()
      .party.filter(function filterItem(slot) {
        return slot.pokemon;
      })
      .map(function mapItem(slot) {
        return slot.slotIndex;
      });
  }

  private renderInventoryUi(): void {
    this.publishMobileWorldUiState();
  }

  private renderInventoryMoveReplacementUi(): void {
    this.publishMobileWorldUiState();
  }

  private destroyInventoryUi(): void {}

  private getInventoryItemIds(): KnownShopItemId[] {
    const inventory = this.gameStateStore.getCurrentLocalPlayer().inventory;
    return this.getAllInventoryItemIds().filter(function filterItem(itemId) {
      return (inventory[itemId] ?? 0) > 0;
    });
  }

  private getAllInventoryItemIds(): KnownShopItemId[] {
    return getRuntimeItemIds();
  }

  private openPcBox(): void {
    if (
      this.shortcutGuideOpen ||
      this.shopOpen ||
      this.inventoryOpen ||
      this.diceGambleOpen ||
      this.battleIntroPlaying
    ) {
      return;
    }

    this.mobileWorldView = "explore";
    this.closePokemonStatusPanel({ rerenderPartyHud: false });
    this.pcBoxOpen = true;
    this.pcBoxFocus = "party";
    this.pcBoxPartySlotIndex = clampSelectionIndex(
      this.pcBoxPartySlotIndex,
      PLAYER_PARTY_SLOT_COUNT,
    );
    this.pcBoxBoxIndex = clampSelectionIndex(
      this.pcBoxBoxIndex,
      Math.max(1, this.gameStateStore.getCurrentLocalPlayer().pokemonBox.length),
    );
    this.pcBoxMessage = "";
    this.renderPcBoxUi();
  }

  private closePcBox(): void {
    this.pcBoxOpen = false;
    this.pcBoxMessage = "";
    this.destroyPcBoxUi();
    dispatchPokeLoungeAccessibleStatus(document, "필드 탐색");
    this.publishMobileWorldUiState();
  }

  private movePcBoxSelection(delta: number): void {
    const localPlayer = this.gameStateStore.getCurrentLocalPlayer();

    if (this.pcBoxFocus === "party") {
      this.pcBoxPartySlotIndex =
        (this.pcBoxPartySlotIndex + delta + PLAYER_PARTY_SLOT_COUNT) % PLAYER_PARTY_SLOT_COUNT;
    } else {
      const boxItemCount = Math.max(1, localPlayer.pokemonBox.length);
      this.pcBoxBoxIndex = (this.pcBoxBoxIndex + delta + boxItemCount) % boxItemCount;
    }

    this.pcBoxMessage = "";
    this.renderPcBoxUi();
  }

  private togglePcBoxFocus(): void {
    this.pcBoxFocus = this.pcBoxFocus === "party" ? "box" : "party";
    this.pcBoxMessage = "";
    this.renderPcBoxUi();
  }

  private confirmPcBoxSelection(): void {
    const localPlayer = this.gameStateStore.getCurrentLocalPlayer();

    if (this.pcBoxFocus === "party") {
      const pokemon = this.getPartyPokemonBySlotIndex(this.pcBoxPartySlotIndex);
      const result = this.gameStateStore.movePartyPokemonToBox(this.pcBoxPartySlotIndex);

      if (result.ok) {
        this.pcBoxMessage = `${pokemon?.name ?? "포켓몬"}을 PC 박스에 보관했다.`;
        this.pcBoxPartySlotIndex = clampSelectionIndex(
          this.pcBoxPartySlotIndex,
          PLAYER_PARTY_SLOT_COUNT,
        );
        this.pcBoxBoxIndex = result.boxIndex;
      } else {
        this.pcBoxMessage =
          result.reason === "last-pokemon"
            ? "마지막 포켓몬은 보관할 수 없다."
            : "선택한 파티 슬롯이 비어 있다.";
      }

      this.renderPartyHud();
      this.renderPcBoxUi();
      return;
    }

    const boxPokemon = localPlayer.pokemonBox[this.pcBoxBoxIndex];

    if (!boxPokemon) {
      this.pcBoxMessage = "박스가 비어 있다.";
      this.renderPcBoxUi();
      return;
    }

    const result = this.gameStateStore.moveBoxPokemonToParty(this.pcBoxBoxIndex);

    if (result.ok) {
      this.pcBoxMessage = `${boxPokemon.name}을 파티로 데려왔다.`;
      this.pcBoxPartySlotIndex = result.slotIndex;
      this.pcBoxBoxIndex = clampSelectionIndex(
        this.pcBoxBoxIndex,
        Math.max(1, this.gameStateStore.getCurrentLocalPlayer().pokemonBox.length),
      );
      this.renderPartyHud();
      this.renderPcBoxUi();
      return;
    }

    if (result.reason === "party-full") {
      const swapResult = this.gameStateStore.swapPartyPokemonWithBox(
        this.pcBoxPartySlotIndex,
        this.pcBoxBoxIndex,
      );

      this.pcBoxMessage = swapResult.ok
        ? `${boxPokemon.name}와 파티 포켓몬을 교체했다.`
        : swapResult.reason === "empty-slot"
          ? "교체할 파티 포켓몬을 선택해라."
          : swapResult.reason === "fainted-active-replacement"
            ? "기절한 포켓몬은 선두 슬롯으로 교체할 수 없다."
            : "선택한 박스 슬롯이 비어 있다.";
      this.renderPartyHud();
      this.renderPcBoxUi();
      return;
    }

    this.pcBoxMessage = "선택한 박스 슬롯이 비어 있다.";
    this.renderPcBoxUi();
  }

  private renderPcBoxUi(): void {
    this.publishMobileWorldUiState();
  }

  private destroyPcBoxUi(): void {}

  private getPcBoxSnapshot(): WorldE2eSnapshot["pcBox"] {
    const localPlayer = this.gameStateStore.getCurrentLocalPlayer();

    return {
      open: this.pcBoxOpen,
      focus: this.pcBoxFocus,
      partySlotIndex: this.pcBoxPartySlotIndex,
      boxIndex: this.pcBoxBoxIndex,
      message: this.pcBoxMessage,
      partyCount: localPlayer.party.filter(function filterItem(slot) {
        return slot.pokemon;
      }).length,
      boxCount: localPlayer.pokemonBox.length,
    };
  }

  private formatPcBoxPokemonLabel(pokemon: PlayerPokemon): string {
    return `${pokemon.name} Lv.${pokemon.level} ${this.formatPokemonHp(pokemon)}`;
  }

  showInitialShortcutGuideIfNeeded(): void {
    if (!this.gameStateStore.hasCurrentLocalPlayerViewedShortcutGuide()) {
      this.openShortcutGuide();
      return;
    }

    this.publishMobileWorldUiState();
  }

  private openShortcutGuide(): void {
    this.mobileWorldView = "explore";
    this.shortcutGuideOpen = true;
    setShortcutGuideTouchControlsSuppressed(true);
    this.renderShortcutGuideUi();
  }

  private closeShortcutGuide(options: { markViewed?: boolean } = {}): void {
    const markViewed = options.markViewed ?? true;
    if (this.shortcutGuideOpen && markViewed) {
      this.gameStateStore.markCurrentLocalPlayerShortcutGuideViewed();
    }
    this.shortcutGuideOpen = false;
    setShortcutGuideTouchControlsSuppressed(false);
    this.destroyShortcutGuideUi();
    this.publishMobileWorldUiState();
  }

  private renderShortcutGuideUi(): void {
    this.publishMobileWorldUiState();
  }

  private destroyShortcutGuideUi(): void {}

  private openDiceGamble(targetNumber = this.rollDiceGambleNumber()): void {
    this.mobileWorldView = "explore";
    this.diceGambleOpen = true;
    this.diceGambleRound = createDiceGambleRound(targetNumber);
    this.diceGambleSelectedIndex = 0;
    this.diceGambleMessage = "";
    this.renderDiceGambleUi();
  }

  private closeDiceGamble(): void {
    this.diceGambleOpen = false;
    this.diceGambleRound = null;
    this.diceGambleMessage = "";
    this.destroyDiceGambleUi();
    this.publishMobileWorldUiState();
  }

  private moveDiceGambleSelection(delta: number): void {
    this.diceGambleSelectedIndex =
      (this.diceGambleSelectedIndex + delta + DICE_GAMBLE_PREDICTIONS.length) %
      DICE_GAMBLE_PREDICTIONS.length;
    this.diceGambleMessage = "";
    this.renderDiceGambleUi();
  }

  private confirmDiceGambleSelection(rolledNumber = this.rollDiceGambleNumber()): void {
    if (!this.diceGambleRound) {
      return;
    }

    const prediction = DICE_GAMBLE_PREDICTIONS[this.diceGambleSelectedIndex];
    const option = this.diceGambleRound.options[prediction];

    if (option.winningCaseCount <= 0) {
      this.diceGambleMessage = "선택할 수 없는 예측이다.";
      this.renderDiceGambleUi();
      return;
    }

    const result = resolveDiceGambleRound(this.diceGambleRound, prediction, rolledNumber);
    const settlement = this.gameStateStore.settleDiceGambleResult({
      stakePokeDollars: result.stakePokeDollars,
      rewardPokeDollars: result.rewardPokeDollars,
    });

    if (!settlement.ok) {
      this.diceGambleMessage =
        settlement.reason === "insufficient-funds" ? "돈이 부족하다." : "정산할 수 없다.";
      this.renderDiceGambleUi();
      return;
    }

    this.diceGambleMessage = result.won
      ? `${result.rolledNumber}이 나왔다. 예측 성공! ${formatPokeDollars(result.rewardPokeDollars)}을 받았다.`
      : `${result.rolledNumber}이 나왔다. 예측 실패. ${formatPokeDollars(result.stakePokeDollars)}을 잃었다.`;
    this.diceGambleRound = createDiceGambleRound(this.rollDiceGambleNumber());
    this.diceGambleSelectedIndex = 0;
    this.renderDiceGambleUi();
  }

  private renderDiceGambleUi(): void {
    this.publishMobileWorldUiState();
  }

  private destroyDiceGambleUi(): void {}

  private rollDiceGambleNumber(): DiceGambleNumber {
    return (Math.floor(Math.random() * 6) + 1) as DiceGambleNumber;
  }
}
