import * as Phaser from "phaser";
import {
  playBattleCancelSound,
  playBattleConfirmSound,
  playPartyHealSound,
} from "../battle/battleAudio";
import {
  DICE_GAMBLE_PREDICTIONS,
  DICE_GAMBLE_STAKE_POKE_DOLLARS,
  createDiceGambleRound,
  resolveDiceGambleRound,
  type DiceGambleNumber,
  type DiceGamblePrediction,
  type DiceGambleRound,
} from "../gamble/diceGamble";
import { consumeVirtualGamepadPress } from "../input/virtualGamepad";
import { setShortcutGuideTouchControlsSuppressed } from "../input/mobileTouchControlsVisibility";
import { PLAYER_PARTY_SLOT_COUNT } from "../player/playerTypes";
import {
  getShopItemById,
  PREMIUM_SHOP_ITEM_IDS,
  SHOP_ITEM_IDS,
  type GameStateStore,
  type PlayerPokemon,
  type PlayerPokemonMove,
  type PremiumShopItemId,
  type ShopItem,
  type ShopItemId,
} from "../state/gameStateStore";
import { createGameTextStyle } from "../ui/gameTextStyle";
import {
  hasPokeLoungeMobileFullscreenScene,
  usesPokeLoungeMobileShell,
} from "../ui/mobile-ui-capability";
import {
  createPokeLoungePartySlotSummaries,
  dispatchMobileWorldUiState,
  POKE_LOUNGE_MOBILE_WORLD_ACTION_EVENT,
  POKE_LOUNGE_MOBILE_WORLD_STATE_REQUEST_EVENT,
  type MobileWorldUiAction,
  type MobileWorldUiScreen,
} from "../ui/mobile-world-ui";
import { dispatchPokeLoungeAccessibleStatus } from "../ui/poke-lounge-ui-events";
import {
  createInventoryControlFooter,
  createPcBoxControlFooter,
  createShortcutGuideFooter,
  createShortcutGuideRows,
  createShortcutGuideTitle,
  type ShortcutGuideInputMode,
} from "../ui/shortcutGuide";
import { FIELD_MAP, resolveFieldEncounterAreaId } from "../world/fieldMap";
import { formatPokemonHp, formatPokeDollars } from "./world-scene-hud";
import type { ObjectLayerLookup, WorldE2eSnapshot } from "./WorldScene";

const SHOP_PANEL_SIZE = { width: 384, height: 268 } as const;
const INVENTORY_PANEL_SIZE = { width: 560, height: 320 } as const;
const PC_BOX_PANEL_SIZE = { width: 496, height: 320 } as const;
const DICE_GAMBLE_PANEL_SIZE = { width: 408, height: 292 } as const;
const SHORTCUT_GUIDE_PANEL_SIZE = { width: 420, height: 248 } as const;
const SHOP_VISIBLE_ITEM_COUNT = 4;
const INVENTORY_VISIBLE_ITEM_COUNT = 8;
const DICE_GAMBLE_LABELS: Record<DiceGamblePrediction, string> = {
  lower: "낮다",
  equal: "같다",
  higher: "높다",
};
const INVENTORY_CATEGORY_LABELS = ["도구", "볼", "회복", "기타"] as const;
const INVENTORY_ITEM_CATEGORIES: Record<string, (typeof INVENTORY_CATEGORY_LABELS)[number]> = {
  antidote: "도구",
  dawnStone: "도구",
  duskStone: "도구",
  fireStone: "도구",
  hyperPotion: "회복",
  leafStone: "도구",
  moonStone: "도구",
  pokeball: "볼",
  potion: "회복",
  rareCandy: "도구",
  revive: "회복",
  shinyStone: "도구",
  sunStone: "도구",
  superPotion: "회복",
  thunderStone: "도구",
  ultraBall: "볼",
  waterStone: "도구",
};

type ShopKind = "basic" | "premium";
type KnownShopItemId = ShopItemId | PremiumShopItemId;
type PcBoxFocus = "party" | "box";
type InventoryFocus = "items" | "move-replace" | "party";

const FIELD_AREA_LABELS: Record<string, string> = {
  "town-west-field": "라운지 마을 · 서쪽 야생초원",
  "town-plaza-field": "라운지 마을 · 중앙 광장",
  "town-south-field": "라운지 마을 · 남쪽 산책로",
};
const FIELD_AREA_ANNOUNCEMENT_DURATION_MS = 1_800;

export type WorldSceneCursorMap = Phaser.Types.Input.Keyboard.CursorKeys & {
  w: Phaser.Input.Keyboard.Key;
  a: Phaser.Input.Keyboard.Key;
  s: Phaser.Input.Keyboard.Key;
  d: Phaser.Input.Keyboard.Key;
};

interface InteractionKeys {
  enter: Phaser.Input.Keyboard.Key;
  space: Phaser.Input.Keyboard.Key;
  z: Phaser.Input.Keyboard.Key;
  esc: Phaser.Input.Keyboard.Key;
  backspace: Phaser.Input.Keyboard.Key;
  inventory: Phaser.Input.Keyboard.Key;
  help: Phaser.Input.Keyboard.Key;
}

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
    "pokemonStatusPanel" | "pcBox" | "shortcutGuideOpen" | "nurseHealing"
  >;
}

export interface WorldSceneInteractionsController extends WorldSceneInteractions {
  canOpenPokemonStatusPanel(): boolean;
  createStaticNpcs(map: ObjectLayerLookup): void;
  showInitialShortcutGuideIfNeeded(): void;
  readonly test: Readonly<WorldSceneInteractionsTestFacade>;
}

export interface WorldSceneInteractionsDependencies {
  gameStateStore: GameStateStore;
  getDocument(): Document;
  getGameObjectFactory(): Phaser.GameObjects.GameObjectFactory;
  getInputPlugin(): Phaser.Input.InputPlugin;
  createStaticGroup(): Phaser.Physics.Arcade.StaticGroup;
  registerStaticNpcs(staticNpcs: Phaser.Physics.Arcade.StaticGroup): void;
  getPlayerPosition(): WorldScenePlayerPosition | null;
  canStartSoloChallenge(): boolean;
  startSoloChallenge(): void;
  playNurseHealingEffect(nursePosition: WorldScenePlayerPosition, onComplete: () => void): void;
  ensureCursorKeys(keyboard: Phaser.Input.Keyboard.KeyboardPlugin): WorldSceneCursorMap;
  isBattleIntroPlaying(): boolean;
  renderPartyHud(): void;
  closePokemonStatusPanel(options?: { rerenderPartyHud?: boolean }): void;
  getPartyPokemonBySlotIndex(slotIndex: number): PlayerPokemon | null;
  getPokemonStatusPanelSnapshot(): WorldE2eSnapshot["pokemonStatusPanel"];
  isPokemonStatusPanelOpen(): boolean;
  getViewportSize(): { width: number; height: number };
}

export function createWorldSceneInteractions(
  dependencies: WorldSceneInteractionsDependencies,
): WorldSceneInteractionsController {
  return new DefaultWorldSceneInteractions(dependencies);
}

function getCenteredPanelOrigin(
  panel: { width: number; height: number },
  screenSize: { width: number; height: number },
): {
  x: number;
  y: number;
} {
  return {
    x: Math.round((screenSize.width - panel.width) / 2),
    y: Math.round((screenSize.height - panel.height) / 2),
  };
}

function clampSelectionIndex(index: number, itemCount: number): number {
  if (itemCount <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(itemCount - 1, index));
}

function getVisibleSelectionWindow<T>(
  items: readonly T[],
  selectedIndex: number,
  visibleItemCount: number,
): { items: readonly T[]; startIndex: number; page: number; pageCount: number } {
  if (items.length === 0) {
    return { items: [], startIndex: 0, page: 0, pageCount: 0 };
  }

  const pageCount = Math.ceil(items.length / visibleItemCount);
  const page = Math.min(pageCount - 1, Math.floor(selectedIndex / visibleItemCount));
  const startIndex = page * visibleItemCount;

  return {
    items: items.slice(startIndex, startIndex + visibleItemCount),
    startIndex,
    page,
    pageCount,
  };
}

export function getShortcutGuideInputMode(): ShortcutGuideInputMode {
  if (typeof document === "undefined") {
    return "keyboard";
  }

  return usesPokeLoungeMobileShell(document) ||
    document.querySelector(".has-touch-game-device [data-mobile-touch-controls]")
    ? "touch"
    : "keyboard";
}

class DefaultWorldSceneInteractions implements WorldSceneInteractionsController {
  private cursors: WorldSceneCursorMap | null = null;
  private interactionKeys: InteractionKeys | null = null;
  private shopkeeperPosition: { x: number; y: number } | null = null;
  private premiumShopkeeperPosition: { x: number; y: number } | null = null;
  private gamehostPosition: { x: number; y: number } | null = null;
  private soloChallengerPosition: { x: number; y: number } | null = null;
  private nursePosition: { x: number; y: number } | null = null;
  private storagePcPosition: { x: number; y: number } | null = null;
  private nurseMessage = "";
  private nurseMessageObject: Phaser.GameObjects.Text | null = null;
  private nurseHealing = false;
  private nurseHealingEffectCount = 0;
  private shopOpen = false;
  private activeShopKind: ShopKind = "basic";
  private shopSelectedIndex = 0;
  private shopMessage = "";
  private shopUiObjects: Phaser.GameObjects.GameObject[] = [];
  private inventoryOpen = false;
  private inventoryFocus: InventoryFocus = "items";
  private inventorySelectedIndex = 0;
  private inventoryPartySlotIndex = 0;
  private inventoryMoveReplaceIndex = 0;
  private inventoryMoveReplacementDecisions: Array<number | null> = [];
  private inventoryTargetItemId: KnownShopItemId | null = null;
  private pendingInventoryItemId: string | null = null;
  private pendingInventoryMovePokemon: PlayerPokemon | null = null;
  private pendingInventoryMoveReplacements: PlayerPokemonMove[] = [];
  private inventoryMessage = "";
  private inventoryUiObjects: Phaser.GameObjects.GameObject[] = [];
  private pcBoxOpen = false;
  private pcBoxFocus: PcBoxFocus = "party";
  private pcBoxPartySlotIndex = 0;
  private pcBoxBoxIndex = 0;
  private pcBoxMessage = "";
  private pcBoxUiObjects: Phaser.GameObjects.GameObject[] = [];
  private shortcutGuideOpen = false;
  private shortcutGuideUiObjects: Phaser.GameObjects.GameObject[] = [];
  private diceGambleOpen = false;
  private diceGambleRound: DiceGambleRound | null = null;
  private diceGambleSelectedIndex = 0;
  private diceGambleMessage = "";
  private diceGambleUiObjects: Phaser.GameObjects.GameObject[] = [];
  private mobileWorldView: "explore" | "party" = "explore";
  private removeMobileWorldUiListeners: (() => void) | null = null;
  private fieldHintText = "";
  private fieldHintObject: Phaser.GameObjects.Text | null = null;
  private lastEncounterAreaId: string | null | undefined;
  private areaAnnouncementExpiresAt = 0;
  private areaAnnouncementObject: Phaser.GameObjects.Text | null = null;

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

  private get add(): Phaser.GameObjects.GameObjectFactory {
    return this.dependencies.getGameObjectFactory();
  }

  private get input(): Phaser.Input.InputPlugin {
    return this.dependencies.getInputPlugin();
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

  private getViewportSize(): { width: number; height: number } {
    return this.dependencies.getViewportSize();
  }

  private ensureCursorKeys(keyboard: Phaser.Input.Keyboard.KeyboardPlugin): WorldSceneCursorMap {
    this.cursors = this.dependencies.ensureCursorKeys(keyboard);
    return this.cursors;
  }

  private usesMobileWorldDeck(): boolean {
    return usesPokeLoungeMobileShell(this.document);
  }

  private bindMobileWorldUi(): void {
    if (this.removeMobileWorldUiListeners) {
      return;
    }

    const handleAction = (event: Event) => {
      if (!this.usesMobileWorldDeck()) {
        return;
      }

      const action = (event as CustomEvent<MobileWorldUiAction>).detail;

      if (!action) {
        return;
      }

      this.handleMobileWorldUiAction(action);
    };
    const handleStateRequest = () => this.publishMobileWorldUiState();

    this.document.addEventListener(POKE_LOUNGE_MOBILE_WORLD_ACTION_EVENT, handleAction);
    this.document.addEventListener(
      POKE_LOUNGE_MOBILE_WORLD_STATE_REQUEST_EVENT,
      handleStateRequest,
    );
    this.removeMobileWorldUiListeners = () => {
      this.document.removeEventListener(POKE_LOUNGE_MOBILE_WORLD_ACTION_EVENT, handleAction);
      this.document.removeEventListener(
        POKE_LOUNGE_MOBILE_WORLD_STATE_REQUEST_EVENT,
        handleStateRequest,
      );
    };
  }

  private handleMobileWorldUiAction(action: MobileWorldUiAction): void {
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
      if (!this.inventoryOpen || this.inventoryFocus !== "move-replace") {
        return;
      }

      const pokemon = this.getInventoryMoveReplacementPokemon();
      this.inventoryMoveReplaceIndex = clampSelectionIndex(
        action.index,
        pokemon?.moves?.length ?? 0,
      );
      this.renderInventoryUi();
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
      if (!this.shopOpen) {
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
      if (!this.shopOpen) {
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
    if (!this.usesMobileWorldDeck()) {
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
    const items = activeItemIds.flatMap((itemId, index) => {
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
    });
    const selectedItem = items.find(item => item.selected) ?? items[0];
    const party = createPokeLoungePartySlotSummaries(localPlayer);
    const moveReplacementPokemon = this.getInventoryMoveReplacementPokemon();
    const pendingMoveReplacement = this.pendingInventoryMoveReplacements[0] ?? null;
    const moveReplacement =
      this.inventoryFocus === "move-replace" && moveReplacementPokemon && pendingMoveReplacement
        ? {
            moves: (moveReplacementPokemon.moves ?? []).map((move, index) => ({
              id: move.id,
              index,
              name: move.name,
              selected: index === this.inventoryMoveReplaceIndex,
            })),
            newMoveName: pendingMoveReplacement.name,
            pokemonName: moveReplacementPokemon.name,
          }
        : null;
    const box = localPlayer.pokemonBox.map((pokemon, boxIndex) => ({
      boxIndex,
      currentHp: pokemon.currentHp ?? null,
      level: pokemon.level,
      maxHp: pokemon.maxHp ?? null,
      name: pokemon.name,
      selected: this.pcBoxFocus === "box" && boxIndex === this.pcBoxBoxIndex,
      status: pokemon.status ?? null,
    }));
    const dice = this.diceGambleRound
      ? {
          options: DICE_GAMBLE_PREDICTIONS.map((prediction, index) => {
            const option = this.diceGambleRound?.options[prediction];

            return {
              disabled: !option || option.winningCaseCount <= 0,
              label: DICE_GAMBLE_LABELS[prediction],
              prediction,
              rewardPokeDollars: option?.rewardPokeDollars ?? 0,
              selected: index === this.diceGambleSelectedIndex,
              winningCaseCount: option?.winningCaseCount ?? 0,
            };
          }),
          stakePokeDollars: DICE_GAMBLE_STAKE_POKE_DOLLARS,
          targetNumber: this.diceGambleRound.targetNumber,
        }
      : null;
    let screen: MobileWorldUiScreen = "explore";
    let title = "필드 조작";
    let message = "";

    if (this.shortcutGuideOpen) {
      screen = "help";
      title = "모바일 조작";
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

    dispatchMobileWorldUiState(this.document, {
      box,
      dice,
      items,
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
    });
  }

  handleInput(): boolean {
    this.bindMobileWorldUi();

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
    "pokemonStatusPanel" | "pcBox" | "shortcutGuideOpen" | "nurseHealing"
  > {
    return {
      shortcutGuideOpen: this.shortcutGuideOpen,
      pokemonStatusPanel: this.dependencies.getPokemonStatusPanelSnapshot(),
      pcBox: this.getPcBoxSnapshot(),
      nurseHealing: {
        active: this.nurseHealing,
        effectCount: this.nurseHealingEffectCount,
      },
    };
  }

  destroy(): void {
    this.removeMobileWorldUiListeners?.();
    this.removeMobileWorldUiListeners = null;
    this.cursors = null;
    this.interactionKeys = null;
    this.closeShop();
    this.closeInventory();
    this.closePcBox();
    this.closeShortcutGuide({ markViewed: false });
    this.closePokemonStatusPanel({ rerenderPartyHud: false });
    this.closeDiceGamble();
    this.nurseMessageObject?.destroy();
    this.nurseMessageObject = null;
    this.nurseMessage = "";
    this.nurseHealing = false;
    this.fieldHintObject?.destroy();
    this.fieldHintObject = null;
    this.fieldHintText = "";
    this.areaAnnouncementObject?.destroy();
    this.areaAnnouncementObject = null;
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
  }

  private closePokemonStatusPanel(options: { rerenderPartyHud?: boolean } = {}): void {
    this.dependencies.closePokemonStatusPanel(options);
  }

  private handlePokemonStatusPanelKeyboardInput(): void {
    const keyboard = this.input.keyboard;

    if (keyboard) {
      this.ensureInteractionKeys(keyboard);
    }

    const interactionKeys = this.interactionKeys;
    const closeRequested =
      consumeVirtualGamepadPress("back") ||
      (interactionKeys &&
        (Phaser.Input.Keyboard.JustDown(interactionKeys.esc) ||
          Phaser.Input.Keyboard.JustDown(interactionKeys.backspace)));

    if (closeRequested) {
      playBattleCancelSound();
      this.closePokemonStatusPanel();
      return;
    }

    const confirmRequested =
      consumeVirtualGamepadPress("confirm") ||
      (interactionKeys &&
        (Phaser.Input.Keyboard.JustDown(interactionKeys.enter) ||
          Phaser.Input.Keyboard.JustDown(interactionKeys.space) ||
          Phaser.Input.Keyboard.JustDown(interactionKeys.z)));

    if (!confirmRequested) {
      return;
    }

    const snapshot = this.dependencies.getPokemonStatusPanelSnapshot();

    if (!snapshot) {
      return;
    }

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
    const npcObjects = map.getObjectLayer("Npcs")?.objects ?? [];
    const staticNpcs = this.dependencies.createStaticGroup();
    this.dependencies.registerStaticNpcs(staticNpcs);

    for (const object of npcObjects) {
      const npcKey = object.name as keyof typeof FIELD_MAP.npcs | undefined;
      const npc = npcKey ? FIELD_MAP.npcs[npcKey] : undefined;

      if (!npc || typeof object.x !== "number" || typeof object.y !== "number") {
        continue;
      }

      const sprite = staticNpcs.create(
        object.x,
        object.y,
        npc.textureKey,
      ) as Phaser.Physics.Arcade.Sprite;

      sprite
        .setOrigin(0.5, 1)
        .setDisplaySize(npc.displaySize.width, npc.displaySize.height)
        .setDepth(18);
      sprite.body?.setSize(npc.hitbox.width, npc.hitbox.height);
      sprite.body?.setOffset(npc.hitbox.offsetX, npc.hitbox.offsetY);
      sprite.refreshBody();

      if (npcKey === "shopkeeper") {
        this.shopkeeperPosition = { x: object.x, y: object.y };
      }

      if (npcKey === "premiumShopkeeper") {
        this.premiumShopkeeperPosition = { x: object.x, y: object.y };
      }

      if (npcKey === "gamehost") {
        this.gamehostPosition = { x: object.x, y: object.y };
      }

      if (npcKey === "soloChallenger") {
        this.soloChallengerPosition = { x: object.x, y: object.y };
      }

      if (npcKey === "nurse") {
        this.nursePosition = { x: object.x, y: object.y };
      }

      if (npcKey === "storagePc") {
        this.storagePcPosition = { x: object.x, y: object.y };
      }
    }
  }

  private ensureInteractionKeys(keyboard: Phaser.Input.Keyboard.KeyboardPlugin): void {
    if (this.interactionKeys) {
      return;
    }

    this.interactionKeys = {
      enter: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER),
      space: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE),
      z: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.Z),
      esc: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC),
      backspace: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.BACKSPACE),
      inventory: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.I),
      help: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.H),
    };
  }

  private handleFieldInteractionInput(): void {
    this.updateFieldGuidance();

    const keyboard = this.input.keyboard;

    if (keyboard) {
      this.ensureInteractionKeys(keyboard);
    }

    const interactionKeys = this.interactionKeys;

    if (
      consumeVirtualGamepadPress("bag") ||
      (interactionKeys && Phaser.Input.Keyboard.JustDown(interactionKeys.inventory))
    ) {
      playBattleConfirmSound();
      this.openInventory();
      return;
    }

    if (
      consumeVirtualGamepadPress("help") ||
      (interactionKeys && Phaser.Input.Keyboard.JustDown(interactionKeys.help))
    ) {
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
    const keyboard = this.input.keyboard;

    if (keyboard) {
      this.ensureInteractionKeys(keyboard);
    }

    const interactionKeys = this.interactionKeys;

    if (
      consumeVirtualGamepadPress("help") ||
      consumeVirtualGamepadPress("back") ||
      consumeVirtualGamepadPress("confirm") ||
      (interactionKeys && Phaser.Input.Keyboard.JustDown(interactionKeys.help)) ||
      (interactionKeys && Phaser.Input.Keyboard.JustDown(interactionKeys.esc)) ||
      (interactionKeys && Phaser.Input.Keyboard.JustDown(interactionKeys.backspace)) ||
      this.isConfirmJustDown()
    ) {
      playBattleCancelSound();
      this.closeShortcutGuide();
    }
  }

  private handleInventoryKeyboardInput(): void {
    const keyboard = this.input.keyboard;

    if (!keyboard) {
      return;
    }

    const cursors = this.ensureCursorKeys(keyboard);
    this.ensureInteractionKeys(keyboard);
    const interactionKeys = this.interactionKeys;

    if (!interactionKeys) {
      return;
    }

    if (
      consumeVirtualGamepadPress("up") ||
      Phaser.Input.Keyboard.JustDown(cursors.up) ||
      Phaser.Input.Keyboard.JustDown(cursors.w)
    ) {
      this.moveInventorySelection(-1);
      return;
    }

    if (
      consumeVirtualGamepadPress("down") ||
      Phaser.Input.Keyboard.JustDown(cursors.down) ||
      Phaser.Input.Keyboard.JustDown(cursors.s)
    ) {
      this.moveInventorySelection(1);
      return;
    }

    if (consumeVirtualGamepadPress("confirm") || this.isConfirmJustDown()) {
      playBattleConfirmSound();
      this.confirmInventorySelection();
      return;
    }

    if (
      consumeVirtualGamepadPress("bag") ||
      Phaser.Input.Keyboard.JustDown(interactionKeys.inventory)
    ) {
      playBattleCancelSound();
      if (this.inventoryFocus === "move-replace") {
        this.skipInventoryMoveReplacement();
      } else {
        this.closeInventory();
      }
      return;
    }

    if (
      consumeVirtualGamepadPress("back") ||
      Phaser.Input.Keyboard.JustDown(interactionKeys.esc) ||
      Phaser.Input.Keyboard.JustDown(interactionKeys.backspace)
    ) {
      playBattleCancelSound();
      this.cancelInventorySelection();
    }
  }

  private handlePcBoxKeyboardInput(): void {
    const keyboard = this.input.keyboard;

    if (!keyboard) {
      return;
    }

    const cursors = this.ensureCursorKeys(keyboard);
    this.ensureInteractionKeys(keyboard);
    const interactionKeys = this.interactionKeys;

    if (!interactionKeys) {
      return;
    }

    if (
      consumeVirtualGamepadPress("up") ||
      Phaser.Input.Keyboard.JustDown(cursors.up) ||
      Phaser.Input.Keyboard.JustDown(cursors.w)
    ) {
      this.movePcBoxSelection(-1);
      return;
    }

    if (
      consumeVirtualGamepadPress("down") ||
      Phaser.Input.Keyboard.JustDown(cursors.down) ||
      Phaser.Input.Keyboard.JustDown(cursors.s)
    ) {
      this.movePcBoxSelection(1);
      return;
    }

    if (
      consumeVirtualGamepadPress("left") ||
      consumeVirtualGamepadPress("right") ||
      Phaser.Input.Keyboard.JustDown(cursors.left) ||
      Phaser.Input.Keyboard.JustDown(cursors.right) ||
      Phaser.Input.Keyboard.JustDown(cursors.a) ||
      Phaser.Input.Keyboard.JustDown(cursors.d)
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
      Phaser.Input.Keyboard.JustDown(interactionKeys.esc) ||
      Phaser.Input.Keyboard.JustDown(interactionKeys.backspace)
    ) {
      playBattleCancelSound();
      this.closePcBox();
    }
  }

  private handleShopKeyboardInput(): void {
    const keyboard = this.input.keyboard;

    if (!keyboard) {
      return;
    }

    const cursors = this.ensureCursorKeys(keyboard);
    this.ensureInteractionKeys(keyboard);

    if (
      consumeVirtualGamepadPress("up") ||
      Phaser.Input.Keyboard.JustDown(cursors.up) ||
      Phaser.Input.Keyboard.JustDown(cursors.w)
    ) {
      this.moveShopSelection(-1);
      return;
    }

    if (
      consumeVirtualGamepadPress("down") ||
      Phaser.Input.Keyboard.JustDown(cursors.down) ||
      Phaser.Input.Keyboard.JustDown(cursors.s)
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
      (this.interactionKeys &&
        (Phaser.Input.Keyboard.JustDown(this.interactionKeys.esc) ||
          Phaser.Input.Keyboard.JustDown(this.interactionKeys.backspace)))
    ) {
      playBattleCancelSound();
      this.closeShop();
    }
  }

  private handleDiceGambleKeyboardInput(): void {
    const keyboard = this.input.keyboard;

    if (!keyboard) {
      return;
    }

    const cursors = this.ensureCursorKeys(keyboard);
    this.ensureInteractionKeys(keyboard);

    if (
      consumeVirtualGamepadPress("up") ||
      Phaser.Input.Keyboard.JustDown(cursors.up) ||
      Phaser.Input.Keyboard.JustDown(cursors.w)
    ) {
      this.moveDiceGambleSelection(-1);
      return;
    }

    if (
      consumeVirtualGamepadPress("down") ||
      Phaser.Input.Keyboard.JustDown(cursors.down) ||
      Phaser.Input.Keyboard.JustDown(cursors.s)
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
      (this.interactionKeys &&
        (Phaser.Input.Keyboard.JustDown(this.interactionKeys.esc) ||
          Phaser.Input.Keyboard.JustDown(this.interactionKeys.backspace)))
    ) {
      playBattleCancelSound();
      this.closeDiceGamble();
    }
  }

  private isConfirmJustDown(): boolean {
    if (!this.interactionKeys) {
      return false;
    }

    return (
      Phaser.Input.Keyboard.JustDown(this.interactionKeys.enter) ||
      Phaser.Input.Keyboard.JustDown(this.interactionKeys.space) ||
      Phaser.Input.Keyboard.JustDown(this.interactionKeys.z)
    );
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

    if (this.areaAnnouncementObject && nowMs >= this.areaAnnouncementExpiresAt) {
      this.areaAnnouncementObject.destroy();
      this.areaAnnouncementObject = null;
      this.areaAnnouncementExpiresAt = 0;
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
    if (this.fieldHintText === nextText) {
      return;
    }

    this.fieldHintObject?.destroy();
    this.fieldHintObject = null;
    this.fieldHintText = nextText;

    if (!nextText) {
      return;
    }

    this.fieldHintObject = this.add
      .text(
        Math.round(this.getViewportSize().width / 2),
        this.getViewportSize().height - 44,
        nextText,
        createGameTextStyle({
          align: "center",
          color: "#fff9dd",
          fontSize: "12px",
          stroke: "#263238",
          strokeThickness: 5,
        }),
      )
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(1750);
  }

  private renderAreaAnnouncement(label: string, nowMs: number): void {
    this.areaAnnouncementObject?.destroy();
    this.areaAnnouncementExpiresAt = nowMs + FIELD_AREA_ANNOUNCEMENT_DURATION_MS;
    this.areaAnnouncementObject = this.add
      .text(
        Math.round(this.getViewportSize().width / 2),
        78,
        label,
        createGameTextStyle({
          align: "center",
          color: "#fff9dd",
          fontSize: "14px",
          stroke: "#263238",
          strokeThickness: 5,
        }),
      )
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(1760);
  }

  private isPlayerNearShopkeeper(playerPosition: WorldScenePlayerPosition): boolean {
    if (!this.shopkeeperPosition) {
      return false;
    }

    return (
      Math.hypot(
        playerPosition.x - this.shopkeeperPosition.x,
        playerPosition.y - this.shopkeeperPosition.y,
      ) <= 56
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
    this.dependencies.playNurseHealingEffect(this.nursePosition, () => {
      this.nurseHealing = false;
    });
  }

  private renderNurseMessage(): void {
    this.nurseMessageObject?.destroy();

    if (!this.nurseMessage) {
      this.nurseMessageObject = null;
      return;
    }

    this.nurseMessageObject = this.add
      .text(
        Math.round(this.getViewportSize().width / 2),
        Math.round(this.getViewportSize().height - 74),
        this.nurseMessage,
        createGameTextStyle({
          align: "center",
          color: "#fff9dd",
          fontSize: "14px",
          stroke: "#263238",
          strokeThickness: 5,
        }),
      )
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(1800);
  }

  private openShop(shopKind: ShopKind = "basic"): void {
    this.mobileWorldView = "explore";
    this.activeShopKind = shopKind;
    this.shopOpen = true;
    this.shopSelectedIndex = 0;
    this.shopMessage = "";
    this.renderShopUi();
  }

  private closeShop(): void {
    this.shopOpen = false;
    this.shopMessage = "";
    this.destroyShopUi();
    this.publishMobileWorldUiState();
  }

  private moveShopSelection(delta: number): void {
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
    this.destroyShopUi();

    if (this.usesMobileWorldDeck()) {
      this.publishMobileWorldUiState();
      return;
    }

    const localPlayer = this.gameStateStore.getCurrentLocalPlayer();
    const shopItemIds = this.getCurrentShopItemIds();
    this.shopSelectedIndex = clampSelectionIndex(this.shopSelectedIndex, shopItemIds.length);
    const selectedItem = this.getKnownShopItem(shopItemIds[this.shopSelectedIndex]);
    const visibleItems = getVisibleSelectionWindow(
      shopItemIds,
      this.shopSelectedIndex,
      SHOP_VISIBLE_ITEM_COUNT,
    );
    const panelOrigin = getCenteredPanelOrigin(SHOP_PANEL_SIZE, this.getViewportSize());
    const x = (offset: number) => panelOrigin.x + offset;
    const y = (offset: number) => panelOrigin.y + offset;
    const panel = this.add
      .rectangle(
        panelOrigin.x,
        panelOrigin.y,
        SHOP_PANEL_SIZE.width,
        SHOP_PANEL_SIZE.height,
        0xf8fbf0,
        0.96,
      )
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(2000);
    panel.setStrokeStyle(2, 0x263238, 1);
    this.shopUiObjects.push(panel);

    this.shopUiObjects.push(
      this.add
        .text(
          x(18),
          y(8),
          this.getCurrentShopTitle(),
          createGameTextStyle({
            color: "#263238",
            fontSize: "16px",
          }),
        )
        .setOrigin(0, 0)
        .setScrollFactor(0)
        .setDepth(2001),
      this.add
        .text(
          x(364),
          y(8),
          `${visibleItems.page + 1}/${visibleItems.pageCount} · ${formatPokeDollars(
            localPlayer.wallet.pokeDollars,
          )}`,
          createGameTextStyle({
            align: "right",
            color: "#263238",
            fontSize: "12px",
          }),
        )
        .setOrigin(1, 0)
        .setScrollFactor(0)
        .setDepth(2001),
    );

    visibleItems.items.forEach((itemId, visibleIndex) => {
      const item = this.getKnownShopItem(itemId);

      if (!item) {
        return;
      }

      const index = visibleItems.startIndex + visibleIndex;
      const rowY = y(44 + visibleIndex * 28);
      const selected = index === this.shopSelectedIndex;

      this.shopUiObjects.push(
        this.add
          .text(
            x(24),
            rowY,
            selected ? "▶" : " ",
            createGameTextStyle({
              color: "#263238",
              fontSize: "13px",
            }),
          )
          .setOrigin(0, 0)
          .setScrollFactor(0)
          .setDepth(2001),
        this.add
          .text(
            x(40),
            rowY,
            item.displayName,
            createGameTextStyle({
              color: selected ? "#101820" : "#455a64",
              fontSize: "13px",
            }),
          )
          .setOrigin(0, 0)
          .setScrollFactor(0)
          .setDepth(2001),
        this.add
          .text(
            x(186),
            rowY,
            formatPokeDollars(item.price),
            createGameTextStyle({
              color: "#455a64",
              fontSize: "12px",
            }),
          )
          .setOrigin(0, 0)
          .setScrollFactor(0)
          .setDepth(2001),
        this.add
          .text(
            x(306),
            rowY,
            `x${localPlayer.inventory[item.id] ?? 0}`,
            createGameTextStyle({
              color: "#455a64",
              fontSize: "12px",
            }),
          )
          .setOrigin(0, 0)
          .setScrollFactor(0)
          .setDepth(2001),
      );
    });

    this.shopUiObjects.push(
      this.add
        .text(
          x(24),
          y(160),
          selectedItem?.description ?? "판매 중인 상품이 없다.",
          createGameTextStyle({
            color: "#263238",
            fontSize: "12px",
            wordWrap: { width: SHOP_PANEL_SIZE.width - 48 },
          }),
        )
        .setOrigin(0, 0)
        .setScrollFactor(0)
        .setDepth(2001),
      this.add
        .text(
          x(24),
          y(222),
          this.shopMessage,
          createGameTextStyle({
            color: this.shopMessage === "돈이 부족하다." ? "#b71c1c" : "#1b5e20",
            fontSize: "12px",
          }),
        )
        .setOrigin(0, 0)
        .setScrollFactor(0)
        .setDepth(2001),
    );
  }

  private destroyShopUi(): void {
    this.shopUiObjects.forEach(object => object.destroy());
    this.shopUiObjects = [];
  }

  private getCurrentShopItemIds(): KnownShopItemId[] {
    return this.activeShopKind === "premium" ? [...PREMIUM_SHOP_ITEM_IDS] : [...SHOP_ITEM_IDS];
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

    this.pendingInventoryMovePokemon = {
      ...pokemon,
      moves: (pokemon.moves ?? []).map((move, index) =>
        index === this.inventoryMoveReplaceIndex ? pendingMove : move,
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
      .party.filter(slot => slot.pokemon)
      .map(slot => slot.slotIndex);
  }

  private renderInventoryUi(): void {
    this.destroyInventoryUi();

    if (this.usesMobileWorldDeck()) {
      this.publishMobileWorldUiState();
      return;
    }

    if (this.inventoryFocus === "move-replace") {
      this.renderInventoryMoveReplacementUi();
      return;
    }

    const localPlayer = this.gameStateStore.getCurrentLocalPlayer();
    const itemIds = this.getInventoryItemIds();
    this.inventorySelectedIndex = clampSelectionIndex(this.inventorySelectedIndex, itemIds.length);
    const selectedItemId = itemIds[this.inventorySelectedIndex] ?? itemIds[0];
    const selectedItem = this.getKnownShopItem(selectedItemId);
    const visibleItems = getVisibleSelectionWindow(
      itemIds,
      this.inventorySelectedIndex,
      INVENTORY_VISIBLE_ITEM_COUNT,
    );
    const selectedCategory = selectedItem
      ? (INVENTORY_ITEM_CATEGORIES[selectedItem.id] ?? "기타")
      : "기타";
    const panelOrigin = getCenteredPanelOrigin(INVENTORY_PANEL_SIZE, this.getViewportSize());
    const x = (offset: number) => panelOrigin.x + offset;
    const y = (offset: number) => panelOrigin.y + offset;
    const panel = this.add
      .rectangle(
        panelOrigin.x,
        panelOrigin.y,
        INVENTORY_PANEL_SIZE.width,
        INVENTORY_PANEL_SIZE.height,
        0xf8fbf0,
        0.98,
      )
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(2100);
    panel.setStrokeStyle(3, 0x263238, 1);
    this.inventoryUiObjects.push(panel);

    this.inventoryUiObjects.push(
      this.add
        .text(
          x(22),
          y(14),
          "가방",
          createGameTextStyle({
            color: "#263238",
            fontSize: "18px",
          }),
        )
        .setOrigin(0, 0)
        .setScrollFactor(0)
        .setDepth(2101),
      this.add
        .text(
          x(INVENTORY_PANEL_SIZE.width - 22),
          y(17),
          `보유 ${formatPokeDollars(localPlayer.wallet.pokeDollars)}`,
          createGameTextStyle({
            align: "right",
            color: "#263238",
            fontSize: "13px",
          }),
        )
        .setOrigin(1, 0)
        .setScrollFactor(0)
        .setDepth(2101),
    );

    const headerRule = this.add
      .rectangle(x(22), y(48), INVENTORY_PANEL_SIZE.width - 44, 2, 0x607d6c, 0.42)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(2101);
    const categoryDivider = this.add
      .rectangle(x(144), y(62), 2, 210, 0x607d6c, 0.36)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(2101);
    const detailPanel = this.add
      .rectangle(x(374), y(66), 160, 170, 0xe9eee1, 0.9)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(2101);
    detailPanel.setStrokeStyle(1, 0x607d6c, 0.45);
    this.inventoryUiObjects.push(headerRule, categoryDivider, detailPanel);

    INVENTORY_CATEGORY_LABELS.forEach((category, index) => {
      const active = category === selectedCategory;
      const tab = this.add
        .rectangle(
          x(18),
          y(67 + index * 42),
          108,
          32,
          active ? 0xfff4a3 : 0xe9eee1,
          active ? 0.95 : 0.72,
        )
        .setOrigin(0, 0)
        .setScrollFactor(0)
        .setDepth(2101);
      tab.setStrokeStyle(1, active ? 0x263238 : 0x9aa690, active ? 0.85 : 0.4);

      this.inventoryUiObjects.push(
        tab,
        this.add
          .text(
            x(40),
            y(75 + index * 42),
            category,
            createGameTextStyle({
              color: active ? "#101820" : "#607d6c",
              fontSize: "13px",
            }),
          )
          .setOrigin(0, 0)
          .setScrollFactor(0)
          .setDepth(2102),
      );
    });

    visibleItems.items.forEach((itemId, visibleIndex) => {
      const item = this.getKnownShopItem(itemId);

      if (!item) {
        return;
      }

      const index = visibleItems.startIndex + visibleIndex;
      const selected = index === this.inventorySelectedIndex;
      const rowY = y(76 + visibleIndex * 24);
      const quantity = localPlayer.inventory[item.id] ?? 0;

      if (selected) {
        const rowHighlight = this.add
          .rectangle(x(164), rowY - 5, 188, 22, 0xfff4a3, 0.95)
          .setOrigin(0, 0)
          .setScrollFactor(0)
          .setDepth(2101);
        rowHighlight.setStrokeStyle(1, 0x263238, 0.65);
        this.inventoryUiObjects.push(rowHighlight);
      }

      this.inventoryUiObjects.push(
        this.add
          .text(
            x(172),
            rowY,
            selected ? "▶" : " ",
            createGameTextStyle({
              color: "#263238",
              fontSize: "13px",
            }),
          )
          .setOrigin(0, 0)
          .setScrollFactor(0)
          .setDepth(2102),
        this.add
          .text(
            x(198),
            rowY,
            item.displayName,
            createGameTextStyle({
              color: selected ? "#101820" : quantity > 0 ? "#263238" : "#78909c",
              fontSize: "12px",
            }),
          )
          .setOrigin(0, 0)
          .setScrollFactor(0)
          .setDepth(2102),
        this.add
          .text(
            x(342),
            rowY,
            `x${quantity}`,
            createGameTextStyle({
              align: "right",
              color: quantity > 0 ? "#263238" : "#78909c",
              fontSize: "12px",
            }),
          )
          .setOrigin(1, 0)
          .setScrollFactor(0)
          .setDepth(2102),
      );
    });

    this.inventoryUiObjects.push(
      this.add
        .text(
          x(392),
          y(82),
          this.inventoryFocus === "party" ? "대상 포켓몬" : "선택 항목",
          createGameTextStyle({
            color: "#607d6c",
            fontSize: "10px",
          }),
        )
        .setOrigin(0, 0)
        .setScrollFactor(0)
        .setDepth(2102),
      this.add
        .text(
          x(392),
          y(106),
          selectedItem?.displayName ?? "-",
          createGameTextStyle({
            color: "#101820",
            fontSize: "15px",
          }),
        )
        .setOrigin(0, 0)
        .setScrollFactor(0)
        .setDepth(2102),
      this.add
        .text(
          x(516),
          y(110),
          `x${selectedItem ? (localPlayer.inventory[selectedItem.id] ?? 0) : 0}`,
          createGameTextStyle({
            align: "right",
            color: "#263238",
            fontSize: "12px",
          }),
        )
        .setOrigin(1, 0)
        .setScrollFactor(0)
        .setDepth(2102),
      this.add
        .text(
          x(392),
          y(140),
          this.inventoryFocus === "items" ? (selectedItem?.description ?? "") : "",
          createGameTextStyle({
            color: "#263238",
            fontSize: "11px",
            wordWrap: { width: 118 },
          }),
        )
        .setOrigin(0, 0)
        .setScrollFactor(0)
        .setDepth(2102),
      this.add
        .text(
          x(22),
          y(INVENTORY_PANEL_SIZE.height - 30),
          createInventoryControlFooter(
            this.inventoryFocus === "party" ? "party" : "items",
            getShortcutGuideInputMode(),
          ),
          createGameTextStyle({
            color: "#607d6c",
            fontSize: "11px",
          }),
        )
        .setOrigin(0, 0)
        .setScrollFactor(0)
        .setDepth(2102),
      this.add
        .text(
          x(22),
          y(INVENTORY_PANEL_SIZE.height - 54),
          this.inventoryMessage,
          createGameTextStyle({
            color:
              this.inventoryMessage === "효과가 없다." || this.inventoryMessage.endsWith("없다!")
                ? "#b71c1c"
                : "#1b5e20",
            fontSize: "11px",
            wordWrap: { width: INVENTORY_PANEL_SIZE.width - 44 },
          }),
        )
        .setOrigin(0, 0)
        .setScrollFactor(0)
        .setDepth(2102),
    );

    if (this.inventoryFocus === "party") {
      this.getInventoryTargetSlotIndices().forEach((slotIndex, index) => {
        const pokemon = this.getPartyPokemonBySlotIndex(slotIndex);

        if (!pokemon) {
          return;
        }

        const selected = slotIndex === this.inventoryPartySlotIndex;
        const rowY = y(140 + index * 17);

        if (selected) {
          const targetHighlight = this.add
            .rectangle(x(382), rowY - 3, 144, 16, 0xfff4a3, 0.95)
            .setOrigin(0, 0)
            .setScrollFactor(0)
            .setDepth(2101);
          targetHighlight.setStrokeStyle(1, 0x263238, 0.65);
          this.inventoryUiObjects.push(targetHighlight);
        }

        this.inventoryUiObjects.push(
          this.add
            .text(
              x(388),
              rowY,
              `${selected ? "▶" : " "} ${pokemon.name}`,
              createGameTextStyle({
                color: selected ? "#101820" : "#263238",
                fontSize: "9px",
              }),
            )
            .setOrigin(0, 0)
            .setScrollFactor(0)
            .setDepth(2102),
          this.add
            .text(
              x(522),
              rowY,
              this.formatPokemonHp(pokemon),
              createGameTextStyle({
                align: "right",
                color: pokemon.status === "fainted" ? "#b71c1c" : "#455a64",
                fontSize: "8px",
              }),
            )
            .setOrigin(1, 0)
            .setScrollFactor(0)
            .setDepth(2102),
        );
      });
    }

    const selectedTarget =
      this.inventoryFocus === "party"
        ? this.getPartyPokemonBySlotIndex(this.inventoryPartySlotIndex)
        : null;
    const accessibleSelection = selectedTarget
      ? `가방 대상 ${selectedTarget.name}, HP ${formatPokemonHp(selectedTarget)}.`
      : selectedItem
        ? `가방 ${selectedItem.displayName}, 보유 ${localPlayer.inventory[selectedItem.id] ?? 0}개.`
        : "가방에 사용할 아이템이 없습니다.";
    dispatchPokeLoungeAccessibleStatus(
      document,
      `${accessibleSelection} ${this.inventoryMessage}`.trim(),
    );
  }

  private renderInventoryMoveReplacementUi(): void {
    const pokemon = this.getInventoryMoveReplacementPokemon();
    const pendingMove = this.pendingInventoryMoveReplacements[0];

    if (!pokemon || !pendingMove) {
      this.cancelInventoryMoveReplacement("");
      return;
    }

    const moves = pokemon.moves ?? [];
    this.inventoryMoveReplaceIndex = clampSelectionIndex(
      this.inventoryMoveReplaceIndex,
      moves.length,
    );
    const panelOrigin = getCenteredPanelOrigin(INVENTORY_PANEL_SIZE, this.getViewportSize());
    const x = (offset: number) => panelOrigin.x + offset;
    const y = (offset: number) => panelOrigin.y + offset;
    const panel = this.add
      .rectangle(
        panelOrigin.x,
        panelOrigin.y,
        INVENTORY_PANEL_SIZE.width,
        INVENTORY_PANEL_SIZE.height,
        0xf8fbf0,
        0.98,
      )
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(2100);
    panel.setStrokeStyle(3, 0x263238, 1);
    this.inventoryUiObjects.push(panel);
    this.inventoryUiObjects.push(
      this.add
        .text(
          x(24),
          y(18),
          `${pokemon.name}의 기술 교체`,
          createGameTextStyle({
            color: "#263238",
            fontSize: "18px",
          }),
        )
        .setOrigin(0, 0)
        .setScrollFactor(0)
        .setDepth(2101),
      this.add
        .text(
          x(24),
          y(52),
          `새 기술: ${pendingMove.name}. 잊을 기술을 선택해라.`,
          createGameTextStyle({
            color: "#455a64",
            fontSize: "12px",
          }),
        )
        .setOrigin(0, 0)
        .setScrollFactor(0)
        .setDepth(2101),
    );

    moves.forEach((move, index) => {
      const selected = index === this.inventoryMoveReplaceIndex;
      const rowY = y(84 + index * 42);
      const row = this.add
        .rectangle(
          x(24),
          rowY,
          INVENTORY_PANEL_SIZE.width - 48,
          32,
          selected ? 0xfff4a3 : 0xe9eee1,
          selected ? 0.98 : 0.82,
        )
        .setOrigin(0, 0)
        .setScrollFactor(0)
        .setDepth(2101);
      row.setStrokeStyle(1, selected ? 0x263238 : 0x9aa690, selected ? 0.9 : 0.45);
      this.inventoryUiObjects.push(
        row,
        this.add
          .text(
            x(38),
            rowY + 8,
            `${selected ? "▶" : " "} ${move.name}`,
            createGameTextStyle({
              color: "#101820",
              fontSize: "12px",
            }),
          )
          .setOrigin(0, 0)
          .setScrollFactor(0)
          .setDepth(2102),
        this.add
          .text(
            x(INVENTORY_PANEL_SIZE.width - 38),
            rowY + 8,
            `PP ${move.pp}/${move.maxPp}`,
            createGameTextStyle({
              align: "right",
              color: "#455a64",
              fontSize: "11px",
            }),
          )
          .setOrigin(1, 0)
          .setScrollFactor(0)
          .setDepth(2102),
      );
    });

    this.inventoryUiObjects.push(
      this.add
        .text(
          x(24),
          y(INVENTORY_PANEL_SIZE.height - 74),
          this.inventoryMessage,
          createGameTextStyle({
            color: "#1b5e20",
            fontSize: "11px",
            wordWrap: { width: INVENTORY_PANEL_SIZE.width - 48 },
          }),
        )
        .setOrigin(0, 0)
        .setScrollFactor(0)
        .setDepth(2102),
      this.add
        .text(
          x(24),
          y(INVENTORY_PANEL_SIZE.height - 25),
          getShortcutGuideInputMode() === "touch"
            ? "D-pad 기술 선택 · A 교체 · B 배우지 않기"
            : "↑↓ 기술 선택 · Enter 교체 · Esc 배우지 않기",
          createGameTextStyle({
            color: "#607d6c",
            fontSize: "11px",
          }),
        )
        .setOrigin(0, 0)
        .setScrollFactor(0)
        .setDepth(2102),
    );
    dispatchPokeLoungeAccessibleStatus(
      document,
      `${pokemon.name}의 ${pendingMove.name} 기술 학습. ${moves[this.inventoryMoveReplaceIndex]?.name ?? "기존 기술"}을 잊도록 선택. ${this.inventoryMessage}`,
    );
  }

  private destroyInventoryUi(): void {
    this.inventoryUiObjects.forEach(object => object.destroy());
    this.inventoryUiObjects = [];
  }

  private getInventoryItemIds(): KnownShopItemId[] {
    return this.getAllInventoryItemIds();
  }

  private getAllInventoryItemIds(): KnownShopItemId[] {
    return [...SHOP_ITEM_IDS, ...PREMIUM_SHOP_ITEM_IDS];
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
    this.destroyPcBoxUi();

    if (this.usesMobileWorldDeck()) {
      this.publishMobileWorldUiState();
      return;
    }

    if (!this.pcBoxOpen) {
      return;
    }

    const localPlayer = this.gameStateStore.getCurrentLocalPlayer();
    const panelOrigin = getCenteredPanelOrigin(PC_BOX_PANEL_SIZE, this.getViewportSize());
    const x = (offset: number) => panelOrigin.x + offset;
    const y = (offset: number) => panelOrigin.y + offset;
    const panel = this.add
      .rectangle(
        panelOrigin.x,
        panelOrigin.y,
        PC_BOX_PANEL_SIZE.width,
        PC_BOX_PANEL_SIZE.height,
        0xf8fbf0,
        0.98,
      )
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(2160);
    panel.setStrokeStyle(3, 0x263238, 1);
    this.pcBoxUiObjects.push(panel);

    const divider = this.add
      .rectangle(x(246), y(58), 2, 202, 0x607d6c, 0.36)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(2161);
    this.pcBoxUiObjects.push(
      divider,
      this.add
        .text(
          x(22),
          y(14),
          "PC 박스",
          createGameTextStyle({
            color: "#263238",
            fontSize: "18px",
          }),
        )
        .setOrigin(0, 0)
        .setScrollFactor(0)
        .setDepth(2161),
      this.add
        .text(
          x(22),
          y(44),
          this.pcBoxFocus === "party" ? "▶ 파티" : "  파티",
          createGameTextStyle({
            color: this.pcBoxFocus === "party" ? "#101820" : "#607d6c",
            fontSize: "13px",
          }),
        )
        .setOrigin(0, 0)
        .setScrollFactor(0)
        .setDepth(2161),
      this.add
        .text(
          x(260),
          y(44),
          `${this.pcBoxFocus === "box" ? "▶" : " "} 박스 ${
            localPlayer.pokemonBox.length > 0 ? this.pcBoxBoxIndex + 1 : 0
          }/${localPlayer.pokemonBox.length}`,
          createGameTextStyle({
            color: this.pcBoxFocus === "box" ? "#101820" : "#607d6c",
            fontSize: "13px",
          }),
        )
        .setOrigin(0, 0)
        .setScrollFactor(0)
        .setDepth(2161),
    );

    for (let slotIndex = 0; slotIndex < PLAYER_PARTY_SLOT_COUNT; slotIndex += 1) {
      const slot = localPlayer.party.find(candidate => candidate.slotIndex === slotIndex);
      const pokemon = slot?.pokemon;
      const selected = this.pcBoxFocus === "party" && slotIndex === this.pcBoxPartySlotIndex;
      const isSwapTarget =
        this.pcBoxFocus === "box" &&
        localPlayer.party.length >= PLAYER_PARTY_SLOT_COUNT &&
        slotIndex === this.pcBoxPartySlotIndex;
      const rowY = y(72 + slotIndex * 28);

      if (selected || isSwapTarget) {
        const highlight = this.add
          .rectangle(x(22), rowY - 4, 214, 24, selected ? 0xfff4a3 : 0xd7eef5, 0.95)
          .setOrigin(0, 0)
          .setScrollFactor(0)
          .setDepth(2161);
        highlight.setStrokeStyle(1, 0x263238, 0.65);
        this.pcBoxUiObjects.push(highlight);
      }

      this.pcBoxUiObjects.push(
        this.add
          .text(
            x(30),
            rowY,
            `${selected ? "▶" : isSwapTarget ? "↔" : " "} ${
              pokemon ? this.formatPcBoxPokemonLabel(pokemon) : "-"
            }`,
            createGameTextStyle({
              color: pokemon ? "#263238" : "#78909c",
              fontSize: "12px",
            }),
          )
          .setOrigin(0, 0)
          .setScrollFactor(0)
          .setDepth(2162),
      );
    }

    const visibleBoxCount = 7;
    const maxStartIndex = Math.max(0, localPlayer.pokemonBox.length - visibleBoxCount);
    const startIndex = Math.min(Math.max(0, this.pcBoxBoxIndex - 3), maxStartIndex);

    for (let index = 0; index < visibleBoxCount; index += 1) {
      const boxIndex = startIndex + index;
      const pokemon = localPlayer.pokemonBox[boxIndex];
      const selected = this.pcBoxFocus === "box" && boxIndex === this.pcBoxBoxIndex;
      const rowY = y(72 + index * 28);

      if (selected) {
        const highlight = this.add
          .rectangle(x(260), rowY - 4, 214, 24, 0xfff4a3, 0.95)
          .setOrigin(0, 0)
          .setScrollFactor(0)
          .setDepth(2161);
        highlight.setStrokeStyle(1, 0x263238, 0.65);
        this.pcBoxUiObjects.push(highlight);
      }

      this.pcBoxUiObjects.push(
        this.add
          .text(
            x(268),
            rowY,
            `${selected ? "▶" : " "} ${pokemon ? this.formatPcBoxPokemonLabel(pokemon) : "-"}`,
            createGameTextStyle({
              color: pokemon ? "#263238" : "#78909c",
              fontSize: "12px",
            }),
          )
          .setOrigin(0, 0)
          .setScrollFactor(0)
          .setDepth(2162),
      );
    }

    this.pcBoxUiObjects.push(
      this.add
        .text(
          x(22),
          y(264),
          this.pcBoxMessage,
          createGameTextStyle({
            color:
              this.pcBoxMessage.includes("없") || this.pcBoxMessage.includes("비어")
                ? "#b71c1c"
                : "#1b5e20",
            fontSize: "12px",
            wordWrap: { width: PC_BOX_PANEL_SIZE.width - 44 },
          }),
        )
        .setOrigin(0, 0)
        .setScrollFactor(0)
        .setDepth(2162),
      this.add
        .text(
          x(22),
          y(292),
          createPcBoxControlFooter(getShortcutGuideInputMode()),
          createGameTextStyle({
            color: "#607d6c",
            fontSize: "10px",
          }),
        )
        .setOrigin(0, 0)
        .setScrollFactor(0)
        .setDepth(2162),
    );

    const selectedPartyPokemon = this.getPartyPokemonBySlotIndex(this.pcBoxPartySlotIndex);
    const selectedBoxPokemon = localPlayer.pokemonBox[this.pcBoxBoxIndex];
    const accessibleSelection =
      this.pcBoxFocus === "party"
        ? `PC 파티 ${this.pcBoxPartySlotIndex + 1}번, ${selectedPartyPokemon?.name ?? "빈 슬롯"}.`
        : `PC 박스 ${localPlayer.pokemonBox.length > 0 ? this.pcBoxBoxIndex + 1 : 0}/${
            localPlayer.pokemonBox.length
          }, ${selectedBoxPokemon?.name ?? "빈 슬롯"}.${
            localPlayer.party.length >= PLAYER_PARTY_SLOT_COUNT
              ? ` 교체 대상 ${selectedPartyPokemon?.name ?? "빈 슬롯"}.`
              : ""
          }`;
    dispatchPokeLoungeAccessibleStatus(
      document,
      `${accessibleSelection} ${this.pcBoxMessage}`.trim(),
    );
  }

  private destroyPcBoxUi(): void {
    this.pcBoxUiObjects.forEach(object => object.destroy());
    this.pcBoxUiObjects = [];
  }

  private getPcBoxSnapshot(): WorldE2eSnapshot["pcBox"] {
    const localPlayer = this.gameStateStore.getCurrentLocalPlayer();

    return {
      open: this.pcBoxOpen,
      focus: this.pcBoxFocus,
      partySlotIndex: this.pcBoxPartySlotIndex,
      boxIndex: this.pcBoxBoxIndex,
      message: this.pcBoxMessage,
      partyCount: localPlayer.party.filter(slot => slot.pokemon).length,
      boxCount: localPlayer.pokemonBox.length,
    };
  }

  private formatPcBoxPokemonLabel(pokemon: PlayerPokemon): string {
    return `${pokemon.name} Lv.${pokemon.level} ${this.formatPokemonHp(pokemon)}`;
  }

  showInitialShortcutGuideIfNeeded(): void {
    this.bindMobileWorldUi();

    if (!this.gameStateStore.hasCurrentLocalPlayerViewedShortcutGuide()) {
      this.openShortcutGuide();
      return;
    }

    if (this.usesMobileWorldDeck()) {
      this.publishMobileWorldUiState();
    }
  }

  private openShortcutGuide(): void {
    if (this.usesMobileWorldDeck()) {
      this.mobileWorldView = "explore";
      this.shortcutGuideOpen = true;
      this.publishMobileWorldUiState();
      return;
    }

    if (this.input.keyboard) {
      this.ensureInteractionKeys(this.input.keyboard);
    }

    this.input.off("pointerdown", this.handleShortcutGuidePointerDown, this);
    this.input.once("pointerdown", this.handleShortcutGuidePointerDown, this);
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
    this.input.off("pointerdown", this.handleShortcutGuidePointerDown, this);
    this.destroyShortcutGuideUi();
    this.publishMobileWorldUiState();
  }

  private handleShortcutGuidePointerDown(): void {
    this.closeShortcutGuide();
  }

  private renderShortcutGuideUi(): void {
    this.destroyShortcutGuideUi();

    if (this.usesMobileWorldDeck()) {
      this.publishMobileWorldUiState();
      return;
    }

    const viewport = this.getViewportSize();
    const inputMode = getShortcutGuideInputMode();
    const panelOrigin = getCenteredPanelOrigin(SHORTCUT_GUIDE_PANEL_SIZE, viewport);
    const x = (offset: number) => panelOrigin.x + offset;
    const y = (offset: number) => panelOrigin.y + offset;
    const scrim = this.add
      .rectangle(0, 0, viewport.width, viewport.height, 0x101820, 0.28)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(2200);
    const panel = this.add
      .rectangle(
        panelOrigin.x,
        panelOrigin.y,
        SHORTCUT_GUIDE_PANEL_SIZE.width,
        SHORTCUT_GUIDE_PANEL_SIZE.height,
        0xf8fbf0,
        0.98,
      )
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(2201);
    panel.setStrokeStyle(3, 0x263238, 1);
    this.shortcutGuideUiObjects.push(scrim, panel);

    this.shortcutGuideUiObjects.push(
      this.add
        .text(
          x(24),
          y(18),
          createShortcutGuideTitle("world", inputMode),
          createGameTextStyle({
            color: "#263238",
            fontSize: "18px",
          }),
        )
        .setOrigin(0, 0)
        .setScrollFactor(0)
        .setDepth(2202),
      this.add
        .rectangle(x(24), y(52), SHORTCUT_GUIDE_PANEL_SIZE.width - 48, 2, 0x607d6c, 0.42)
        .setOrigin(0, 0)
        .setScrollFactor(0)
        .setDepth(2202),
    );

    createShortcutGuideRows("world", inputMode).forEach((row, index) => {
      const rowY = y(72 + index * 28);

      this.shortcutGuideUiObjects.push(
        this.add
          .text(
            x(34),
            rowY,
            row.action,
            createGameTextStyle({
              color: "#455a64",
              fontSize: "13px",
            }),
          )
          .setOrigin(0, 0)
          .setScrollFactor(0)
          .setDepth(2202),
        this.add
          .text(
            x(184),
            rowY,
            row.keys,
            createGameTextStyle({
              color: "#101820",
              fontSize: "13px",
            }),
          )
          .setOrigin(0, 0)
          .setScrollFactor(0)
          .setDepth(2202),
      );
    });

    this.shortcutGuideUiObjects.push(
      this.add
        .text(
          x(24),
          y(SHORTCUT_GUIDE_PANEL_SIZE.height - 34),
          createShortcutGuideFooter(inputMode),
          createGameTextStyle({
            color: "#607d6c",
            fontSize: "11px",
          }),
        )
        .setOrigin(0, 0)
        .setScrollFactor(0)
        .setDepth(2202),
    );
  }

  private destroyShortcutGuideUi(): void {
    this.shortcutGuideUiObjects.forEach(object => object.destroy());
    this.shortcutGuideUiObjects = [];
  }

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
    this.destroyDiceGambleUi();

    if (this.usesMobileWorldDeck()) {
      this.publishMobileWorldUiState();
      return;
    }

    if (!this.diceGambleRound) {
      return;
    }

    const localPlayer = this.gameStateStore.getCurrentLocalPlayer();
    const panelOrigin = getCenteredPanelOrigin(DICE_GAMBLE_PANEL_SIZE, this.getViewportSize());
    const x = (offset: number) => panelOrigin.x + offset;
    const y = (offset: number) => panelOrigin.y + offset;
    const panel = this.add
      .rectangle(
        panelOrigin.x,
        panelOrigin.y,
        DICE_GAMBLE_PANEL_SIZE.width,
        DICE_GAMBLE_PANEL_SIZE.height,
        0xf8fbf0,
        0.96,
      )
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(2000);
    panel.setStrokeStyle(2, 0x263238, 1);
    this.diceGambleUiObjects.push(panel);

    this.diceGambleUiObjects.push(
      this.add
        .text(
          x(18),
          y(10),
          "주사위 겜블",
          createGameTextStyle({
            color: "#263238",
            fontSize: "16px",
          }),
        )
        .setOrigin(0, 0)
        .setScrollFactor(0)
        .setDepth(2001),
      this.add
        .text(
          x(DICE_GAMBLE_PANEL_SIZE.width - 18),
          y(12),
          `지갑 ${formatPokeDollars(localPlayer.wallet.pokeDollars)}`,
          createGameTextStyle({
            align: "right",
            color: "#263238",
            fontSize: "12px",
          }),
        )
        .setOrigin(1, 0)
        .setScrollFactor(0)
        .setDepth(2001),
      this.add
        .text(
          x(24),
          y(46),
          `기준 숫자 ${this.diceGambleRound.targetNumber}`,
          createGameTextStyle({
            color: "#263238",
            fontSize: "13px",
          }),
        )
        .setOrigin(0, 0)
        .setScrollFactor(0)
        .setDepth(2001),
      this.add
        .text(
          x(216),
          y(46),
          `배팅금 ${formatPokeDollars(DICE_GAMBLE_STAKE_POKE_DOLLARS)}`,
          createGameTextStyle({
            color: "#263238",
            fontSize: "13px",
          }),
        )
        .setOrigin(0, 0)
        .setScrollFactor(0)
        .setDepth(2001),
      this.add
        .text(
          x(40),
          y(78),
          "옵션        경우의 수 / 보상",
          createGameTextStyle({
            color: "#607d6c",
            fontSize: "11px",
          }),
        )
        .setOrigin(0, 0)
        .setScrollFactor(0)
        .setDepth(2001),
    );

    DICE_GAMBLE_PREDICTIONS.forEach((prediction, index) => {
      const option = this.diceGambleRound?.options[prediction];

      if (!option) {
        return;
      }

      const selected = index === this.diceGambleSelectedIndex;
      const impossible = option.winningCaseCount <= 0;
      const rowY = y(106 + index * 36);
      const optionText = `${DICE_GAMBLE_LABELS[prediction]}      ${option.winningCaseCount}/6  ${formatPokeDollars(option.rewardPokeDollars)}`;

      this.diceGambleUiObjects.push(
        this.add
          .text(
            x(24),
            rowY,
            selected ? "▶" : " ",
            createGameTextStyle({
              color: "#263238",
              fontSize: "13px",
            }),
          )
          .setOrigin(0, 0)
          .setScrollFactor(0)
          .setDepth(2001),
        this.add
          .text(
            x(44),
            rowY,
            optionText,
            createGameTextStyle({
              color: selected ? "#101820" : impossible ? "#9e9e9e" : "#455a64",
              fontSize: "13px",
            }),
          )
          .setOrigin(0, 0)
          .setScrollFactor(0)
          .setDepth(2001),
      );
    });

    this.diceGambleUiObjects.push(
      this.add
        .text(
          x(24),
          y(226),
          this.diceGambleMessage,
          createGameTextStyle({
            color:
              this.diceGambleMessage === "돈이 부족하다." ||
              this.diceGambleMessage === "선택할 수 없는 예측이다."
                ? "#b71c1c"
                : "#1b5e20",
            fontSize: "12px",
            wordWrap: { width: DICE_GAMBLE_PANEL_SIZE.width - 48 },
          }),
        )
        .setOrigin(0, 0)
        .setScrollFactor(0)
        .setDepth(2001),
    );
  }

  private destroyDiceGambleUi(): void {
    this.diceGambleUiObjects.forEach(object => object.destroy());
    this.diceGambleUiObjects = [];
  }

  private rollDiceGambleNumber(): DiceGambleNumber {
    return (Math.floor(Math.random() * 6) + 1) as DiceGambleNumber;
  }
}
