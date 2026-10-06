import { transferPcPokemon } from "@/features/poke-lounge/application/world/pc-transfer";
import { formatFieldInteractionKey } from "@/features/poke-lounge/presentation/world/interaction-copy";
import { formatPcTransferResult } from "@/features/poke-lounge/presentation/world/pc-transfer-message";
import { FIELD_AREA_ANNOUNCEMENT_DURATION_MS } from "@poke-lounge/battle/timing";
import {
  playBattleCancelSound,
  playBattleConfirmSound,
  playPartyHealSound,
} from "../battle/battle-audio";
import { getBattlePokemonAssets } from "../battle/battle-pokemon-assets";
import type { BattleSpriteRef } from "../battle/battle-types";
import { setShortcutGuideTouchControlsSuppressed } from "../input/mobile-touch-controls-visibility";
import { consumeVirtualGamepadPress } from "../input/virtual-gamepad";
import { getRuntimeItemIds, type RuntimeItemId } from "../items/runtime-items";
import { PLAYER_PARTY_SLOT_COUNT } from "../player/player-types";
import type { RuntimeKeyboard } from "../runtime-input";
import {
  getInventoryItemById,
  type GameStateStore,
  type PlayerPokemon,
  type PlayerPokemonMove,
  type PlayerPokemonStatus,
  type InventoryItemDetails,
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
import {
  createMoveReplacementConfirmation,
  isMoveReplacementConfirmationCurrent,
  type MoveReplacementConfirmation,
} from "../ui/move-learning-model";
import { dispatchPokeLoungeAccessibleStatus } from "../ui/poke-lounge-ui-events";
import { createShortcutGuideTitle, type ShortcutGuideInputMode } from "../ui/shortcut-guide";
import {
  FIELD_MAP,
  NURSE_INTERACTION_DISTANCE,
  resolveFieldEncounterAreaId,
} from "../world/field-map";
import type { WorldUiStore } from "../world/world-ui-store";
import type { ObjectLayerLookup } from "./world-scene";
import type { PokemonStatusPanelSnapshot } from "./world-scene-hud";
import { formatPokemonHp } from "./world-scene-hud";

type KnownInventoryItemId = RuntimeItemId;
type PcBoxFocus = "party" | "box";
type InventoryFocus = "items" | "move-replace" | "party";

const FIELD_AREA_LABELS: Record<string, string> = {
  "town-west-field": "라운지 마을 · 서쪽 야생초원",
  "town-plaza-field": "라운지 마을 · 중앙 광장",
  "town-south-field": "라운지 마을 · 남쪽 산책로",
};

export interface WorldScenePlayerPosition {
  readonly x: number;
  readonly y: number;
}

export interface WorldSceneInteractions {
  handleInput(): boolean;
  destroy(): void;
}

export interface WorldSceneInteractionsController extends WorldSceneInteractions {
  canOpenPokemonStatusPanel(): boolean;
  createStaticNpcs(map: ObjectLayerLookup): void;
  handleUiAction(action: MobileWorldUiAction): void;
  showInitialShortcutGuideIfNeeded(): void;
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
  getPokemonStatusPanelSnapshot(): PokemonStatusPanelSnapshot | null;
  isPokemonStatusPanelOpen(): boolean;
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
  private soloChallengerPosition: { x: number; y: number } | null = null;
  private nursePosition: { x: number; y: number } | null = null;
  private storagePcPosition: { x: number; y: number } | null = null;
  private nurseMessage = "";
  private nurseHealing = false;
  private nurseHealingEffectCount = 0;
  private inventoryOpen = false;
  private inventoryFocus: InventoryFocus = "items";
  private inventorySelectedIndex = 0;
  private inventoryPartySlotIndex = 0;
  private inventoryMoveReplaceIndex = 0;
  private inventoryMoveConfirmation: MoveReplacementConfirmation | null = null;
  private inventoryMoveReplacementDecisions: Array<number | null> = [];
  private inventoryTargetItemId: KnownInventoryItemId | null = null;
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
  private mobileWorldView: "explore" | "party" = "explore";
  private fieldHintText = "";
  private lastEncounterAreaId: string | null | undefined;
  private areaAnnouncementExpiresAt = 0;

  constructor(private readonly dependencies: WorldSceneInteractionsDependencies) {}

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
      playBattleConfirmSound();
      this.confirmInventorySelection();
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
      playBattleConfirmSound();
      this.confirmInventorySelection();
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
      this.inventoryOpen ||
      this.pcBoxOpen ||
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

    if (this.inventoryOpen) {
      this.closeInventory();
      return;
    }

    if (this.pcBoxOpen) {
      this.closePcBox();
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

    if (this.inventoryOpen) {
      this.inventorySelectedIndex = clampSelectionIndex(
        this.inventorySelectedIndex,
        inventoryItemIds.length,
      );
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

    const activeItemIds = this.inventoryOpen ? inventoryItemIds : [];
    const selectedIndex = this.inventorySelectedIndex;
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
        selected: boolean;
      }[] {
        const item = this.getKnownInventoryItem(itemId);

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
        sprite: BattleSpriteRef;
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
          sprite: getBattlePokemonAssets(pokemon.speciesId).front,
          currentHp: pokemon.currentHp ?? null,
          level: pokemon.level,
          maxHp: pokemon.maxHp ?? null,
          name: pokemon.name,
          selected: this.pcBoxFocus === "box" && boxIndex === this.pcBoxBoxIndex,
          status: pokemon.status ?? null,
        };
      }.bind(this),
    );
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
    } else if (this.pcBoxOpen) {
      screen = "pc";
      title = "PC 박스";
      message = this.pcBoxMessage;
    } else if (this.mobileWorldView === "party") {
      screen = "party";
      title = "파티";
    }

    const state = {
      box,
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

    this.handleFieldInteractionInput();

    return this.inventoryOpen || this.pcBoxOpen || this.mobileWorldView === "party";
  }

  canOpenPokemonStatusPanel(): boolean {
    return (
      !this.usesMobileWorldDeck() &&
      !this.shortcutGuideOpen &&
      !this.inventoryOpen &&
      !this.pcBoxOpen &&
      !this.battleIntroPlaying
    );
  }

  destroy(): void {
    // Tournament gathering reuses this controller. Never restore a stale party task.
    this.mobileWorldView = "explore";
    this.closeInventory();
    this.closePcBox();
    this.closeShortcutGuide({ markViewed: false });
    this.closePokemonStatusPanel({ rerenderPartyHud: false });
    this.nurseMessage = "";
    this.nurseHealing = false;
    this.fieldHintText = "";
    this.areaAnnouncementExpiresAt = 0;
    this.lastEncounterAreaId = undefined;
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
      if (npcKey === "soloChallenger") this.soloChallengerPosition = position;
      else if (npcKey === "nurse") this.nursePosition = position;
      else if (npcKey === "storagePc") this.storagePcPosition = position;
    }
  }

  private handleFieldInteractionInput(): void {
    this.updateFieldGuidance();
    if (consumeVirtualGamepadPress("bag") || this.dependencies.keyboard.consume("KeyI")) {
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

  private isConfirmJustDown(): boolean {
    return this.dependencies.keyboard.consume("Enter", "Space", "KeyZ");
  }

  private handleConfirmInteraction(): void {
    const playerPosition = this.dependencies.getPlayerPosition();

    if (!playerPosition) {
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
    const interactionKey = formatFieldInteractionKey(this.usesMobileWorldDeck());

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
      ) <= NURSE_INTERACTION_DISTANCE
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

  private getKnownInventoryItem(itemId: string | undefined): InventoryItemDetails | null {
    if (!itemId) {
      return null;
    }

    return getInventoryItemById(itemId) ?? null;
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
      const item = this.getKnownInventoryItem(selectedItemId);

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

  private getInventoryItemIds(): KnownInventoryItemId[] {
    const inventory = this.gameStateStore.getCurrentLocalPlayer().inventory;
    return this.getAllInventoryItemIds().filter(function filterItem(itemId) {
      return (inventory[itemId] ?? 0) > 0;
    });
  }

  private getAllInventoryItemIds(): KnownInventoryItemId[] {
    return getRuntimeItemIds();
  }

  private openPcBox(): void {
    if (this.shortcutGuideOpen || this.inventoryOpen || this.battleIntroPlaying) {
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
    const result = transferPcPokemon(this.gameStateStore, {
      focus: this.pcBoxFocus,
      partySlot: this.pcBoxPartySlotIndex,
      boxIndex: this.pcBoxBoxIndex,
    });
    this.pcBoxMessage = formatPcTransferResult(result);
    if (result.kind === "deposited") {
      this.pcBoxPartySlotIndex = clampSelectionIndex(result.slotIndex, PLAYER_PARTY_SLOT_COUNT);
      this.pcBoxBoxIndex = result.boxIndex;
    } else if (result.kind === "withdrawn") {
      this.pcBoxPartySlotIndex = result.slotIndex;
      this.pcBoxBoxIndex = result.boxIndex;
    }
    this.renderPartyHud();
    this.renderPcBoxUi();
  }

  private renderPcBoxUi(): void {
    this.publishMobileWorldUiState();
  }

  private destroyPcBoxUi(): void {}

  private formatPcBoxPokemonLabel(pokemon: PlayerPokemon): string {
    return `${pokemon.name} Lv.${pokemon.level} ${this.formatPokemonHp(pokemon)}`;
  }

  showInitialShortcutGuideIfNeeded(): void {
    // Startup/round changes never interrupt play. Help is explicitly opened with H/menu.
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
}
