import * as Phaser from "phaser";
import { ROM_BATTLE_WINDOW_STYLE } from "../battle/battleDesign";
import { getExperienceForLevel } from "../battle/experience";
import {
  DEFAULT_PREPARATION_DURATION_MS,
  formatRoundTimer,
  getRoundRemainingMs,
  type GameRoundState,
} from "../round/roundState";
import type {
  GameStateStore,
  PlayerCompetitiveStats,
  PlayerPokemon,
} from "../state/gameStateStore";
import { createGameTextStyle } from "../ui/gameTextStyle";
import { usesPokeLoungeMobileShell } from "../ui/mobile-ui-capability";
import {
  createPartyHudSlotViews,
  PARTY_HUD_SLOT_SIZE,
  type PartyHudSlotView,
} from "../ui/partyHud";

const POKEMON_STATUS_PANEL_SIZE = { width: 300, height: 310 } as const;
const POKEMON_STATUS_PANEL_GAP = 8;
const POKEMON_STATUS_BAR_WIDTH = POKEMON_STATUS_PANEL_SIZE.width - 36;
const PARTY_HUD_SPRITE_SIZE = 28;
const PARTY_HUD_NAME_OFFSET_X = 34;
const PARTY_HUD_NAME_RIGHT_PADDING = 4;
const PARTY_HUD_NAME_WIDTH =
  PARTY_HUD_SLOT_SIZE.width - PARTY_HUD_NAME_OFFSET_X - PARTY_HUD_NAME_RIGHT_PADDING;
const PARTY_HUD_NAME_HEIGHT = 12;
const PARTY_HUD_NAME_MAX_CHARACTERS = 6;
const POKEMON_STATUS_PANEL_SPRITE_SIZE = 42;

export interface WorldSceneHud {
  render(): void;
  destroy(): void;
  updateRound(nowMs: number): void;
}

export interface PokemonStatusPanelSnapshot {
  slotIndex: number;
  name: string;
  level: number;
  currentHp: number | null;
  maxHp: number | null;
  status: NonNullable<PlayerPokemon["status"]>;
}

export interface WorldSceneHudDependencies {
  getDocument(): Document;
  getGameObjectFactory(): Phaser.GameObjects.GameObjectFactory;
  gameStateStore: GameStateStore;
  competitiveRoundsEnabled: boolean;
  serverAuthoritativeRounds: boolean;
  roundWaitingText: string;
  addUnsubscriber(unsubscribe: () => void): void;
  canOpenPokemonStatusPanel(): boolean;
  getViewportSize(): { width: number; height: number };
  isShutdownComplete(): boolean;
}

export interface WorldSceneHudController extends WorldSceneHud {
  closePokemonStatusPanel(options?: { rerenderPartyHud?: boolean }): void;
  createCurrencyHud(): void;
  createPartyHud(): void;
  createRankScoreHud(): void;
  createRoundHud(nowMs: number, preparationDurationMs?: number): void;
  destroyPartyHud(): void;
  getPartyPokemonBySlotIndex(slotIndex: number): PlayerPokemon | null;
  getPokemonStatusPanelSnapshot(): PokemonStatusPanelSnapshot | null;
  isPokemonStatusPanelOpen(): boolean;
  isPartyHudVisible(): boolean;
}

export function createWorldSceneHud(
  dependencies: WorldSceneHudDependencies,
): WorldSceneHudController {
  return new DefaultWorldSceneHud(dependencies);
}

class DefaultWorldSceneHud implements WorldSceneHudController {
  private currencyHudText: Phaser.GameObjects.Text | null = null;
  private rankScoreHudText: Phaser.GameObjects.Text | null = null;
  private roundHudText: Phaser.GameObjects.Text | null = null;
  private lastCurrencyText = "";
  private lastRankScoreText = "";
  private lastPartyHudKey = "";
  private lastRenderedRoundHudText = "";
  private partyHudObjects: Phaser.GameObjects.GameObject[] = [];
  private partyHudSubscribed = false;
  private pokemonStatusPanelSlotIndex: number | null = null;
  private pokemonStatusPanelObjects: Phaser.GameObjects.GameObject[] = [];

  constructor(private readonly dependencies: WorldSceneHudDependencies) {}

  private get add(): Phaser.GameObjects.GameObjectFactory {
    return this.dependencies.getGameObjectFactory();
  }

  createCurrencyHud(): void {
    const { gameStateStore } = this.dependencies;

    this.lastCurrencyText = formatPokeDollars(
      gameStateStore.getCurrentLocalPlayer().wallet.pokeDollars,
    );
    this.currencyHudText = this.add
      .text(
        12,
        10,
        this.lastCurrencyText,
        createGameTextStyle({
          color: "#f8fbf0",
          fontSize: "14px",
          stroke: "#263238",
          strokeThickness: 4,
        }),
      )
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(1000);

    this.dependencies.addUnsubscriber(
      gameStateStore.subscribe(state => {
        const currentPlayer = state.playersById[state.currentPlayerId];
        const nextText = formatPokeDollars(currentPlayer?.wallet.pokeDollars ?? 0);

        if (nextText !== this.lastCurrencyText) {
          this.currencyHudText?.setText(nextText);
          this.lastCurrencyText = nextText;
        }
      }),
    );
  }

  createRankScoreHud(): void {
    const { gameStateStore } = this.dependencies;

    this.lastRankScoreText = formatRankScoreHud(
      gameStateStore.getCurrentLocalPlayer().competitive,
      this.dependencies.competitiveRoundsEnabled ? "competitive" : "solo",
    );
    this.rankScoreHudText = this.add
      .text(
        this.dependencies.getViewportSize().width - 12,
        10,
        this.lastRankScoreText,
        createGameTextStyle({
          align: "right",
          color: "#f8fbf0",
          fontSize: "12px",
          stroke: "#263238",
          strokeThickness: 4,
        }),
      )
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(1000);

    this.dependencies.addUnsubscriber(
      gameStateStore.subscribe(state => {
        const currentPlayer = state.playersById[state.currentPlayerId];
        const nextText = formatRankScoreHud(
          currentPlayer?.competitive ?? { rank: null, score: 0 },
          this.dependencies.competitiveRoundsEnabled ? "competitive" : "solo",
        );

        if (nextText !== this.lastRankScoreText) {
          this.rankScoreHudText?.setText(nextText);
          this.lastRankScoreText = nextText;
        }
      }),
    );
  }

  createRoundHud(nowMs: number, preparationDurationMs = DEFAULT_PREPARATION_DURATION_MS): void {
    const { gameStateStore } = this.dependencies;

    if (
      !this.dependencies.serverAuthoritativeRounds &&
      gameStateStore.getState().round.phase === "waiting"
    ) {
      gameStateStore.startPreparationRound(nowMs, preparationDurationMs);
    }

    const hudText = this.formatRoundHudText(nowMs);
    this.roundHudText = this.add
      .text(
        Math.round(this.dependencies.getViewportSize().width / 2),
        10,
        hudText,
        createGameTextStyle({
          align: "center",
          color: "#f8fbf0",
          fontSize: "12px",
          stroke: "#263238",
          strokeThickness: 4,
        }),
      )
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(1000);

    this.lastRenderedRoundHudText = hudText;
  }

  updateRound(nowMs: number): void {
    if (!this.dependencies.competitiveRoundsEnabled) {
      return;
    }

    if (!this.dependencies.serverAuthoritativeRounds) {
      this.dependencies.gameStateStore.advanceRoundClock(nowMs);
    }
    const nextText = this.formatRoundHudText(nowMs);

    if (nextText !== this.lastRenderedRoundHudText) {
      this.roundHudText?.setText(nextText);
      this.lastRenderedRoundHudText = nextText;
    }
  }

  private formatRoundHudText(nowMs: number): string {
    const round = this.dependencies.gameStateStore.getState().round;

    return formatRoundHudText(round, nowMs, this.dependencies.roundWaitingText);
  }

  createPartyHud(): void {
    this.render();

    if (this.partyHudSubscribed) {
      return;
    }

    this.partyHudSubscribed = true;
    this.dependencies.addUnsubscriber(
      this.dependencies.gameStateStore.subscribe(() => {
        const nextKey = this.createPartyHudKey();
        if (nextKey === this.lastPartyHudKey) {
          return;
        }

        this.render();
      }),
    );
  }

  render(): void {
    this.lastPartyHudKey = this.createPartyHudKey();
    this.partyHudObjects.forEach(object => object.destroy());
    this.partyHudObjects = [];

    if (usesPokeLoungeMobileShell(this.dependencies.getDocument())) {
      this.closePokemonStatusPanel({ rerenderPartyHud: false });
      return;
    }

    const localPlayer = this.dependencies.gameStateStore.getCurrentLocalPlayer();
    const slots = createPartyHudSlotViews({
      activePartySlotIndex: localPlayer.activePartySlotIndex,
      anchor: "middle-left",
      party: localPlayer.party,
      screenSize: this.dependencies.getViewportSize(),
    });

    for (const slot of slots) {
      this.renderPartyHudSlot(slot);
    }

    this.renderPokemonStatusPanel();
  }

  private createPartyHudKey(): string {
    const player = this.dependencies.gameStateStore.getCurrentLocalPlayer();

    return JSON.stringify({
      playerId: player.playerId,
      activePartySlotIndex: player.activePartySlotIndex,
      party: player.party,
    });
  }

  private renderPartyHudSlot(slot: PartyHudSlotView): void {
    const background = this.add
      .rectangle(
        slot.x,
        slot.y,
        PARTY_HUD_SLOT_SIZE.width,
        PARTY_HUD_SLOT_SIZE.height,
        this.pokemonStatusPanelSlotIndex === slot.slotIndex || slot.active ? 0xfff4a3 : 0xf8fbf0,
        0.88,
      )
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(900);
    background.setStrokeStyle(
      this.pokemonStatusPanelSlotIndex === slot.slotIndex ? 2 : 1,
      this.pokemonStatusPanelSlotIndex === slot.slotIndex
        ? 0x101820
        : slot.active
          ? 0x355c7d
          : 0x263238,
      0.95,
    );
    this.partyHudObjects.push(background);
    if (slot.occupied && !usesPokeLoungeMobileShell(this.dependencies.getDocument())) {
      const hitZone = this.add
        .zone(slot.x, slot.y, PARTY_HUD_SLOT_SIZE.width, PARTY_HUD_SLOT_SIZE.height)
        .setOrigin(0, 0)
        .setScrollFactor(0)
        .setDepth(904)
        .setInteractive({ useHandCursor: true });
      hitZone.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
        pointer.event?.preventDefault();
        this.openPokemonStatusPanel(slot.slotIndex);
      });
      this.partyHudObjects.push(hitZone);
    }

    if (!slot.pokemon) {
      const emptySlotText = this.add
        .text(
          slot.x + 28,
          slot.y + 9,
          "-",
          createGameTextStyle({
            color: "#607d6c",
            fontSize: "14px",
          }),
        )
        .setOrigin(0.5, 0)
        .setScrollFactor(0)
        .setDepth(902);
      this.partyHudObjects.push(emptySlotText);
      return;
    }

    const sprite = this.add
      .image(
        slot.x + 4,
        slot.y + (PARTY_HUD_SLOT_SIZE.height - PARTY_HUD_SPRITE_SIZE) / 2,
        slot.pokemon.spriteKey,
        slot.pokemon.spriteFrame,
      )
      .setOrigin(0, 0)
      .setCrop(
        slot.pokemon.spriteCrop.x,
        slot.pokemon.spriteCrop.y,
        slot.pokemon.spriteCrop.width,
        slot.pokemon.spriteCrop.height,
      )
      .setScale(
        PARTY_HUD_SPRITE_SIZE / slot.pokemon.spriteCrop.width,
        PARTY_HUD_SPRITE_SIZE / slot.pokemon.spriteCrop.height,
      )
      .setScrollFactor(0)
      .setDepth(902);
    const name = this.add
      .text(
        slot.x + PARTY_HUD_NAME_OFFSET_X,
        slot.y + 6,
        formatPartyHudPokemonName(slot.pokemon.name),
        createGameTextStyle({
          color: "#263238",
          fontSize: "8px",
        }),
      )
      .setOrigin(0, 0)
      .setFixedSize(PARTY_HUD_NAME_WIDTH, PARTY_HUD_NAME_HEIGHT)
      .setScrollFactor(0)
      .setDepth(902);
    const level = this.add
      .text(
        slot.x + 34,
        slot.y + 20,
        `Lv.${slot.pokemon.level}`,
        createGameTextStyle({
          color: "#263238",
          fontSize: "8px",
        }),
      )
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(902);

    this.partyHudObjects.push(sprite, name, level);
  }

  private openPokemonStatusPanel(slotIndex: number): void {
    if (usesPokeLoungeMobileShell(this.dependencies.getDocument())) {
      return;
    }

    if (!this.dependencies.canOpenPokemonStatusPanel()) {
      return;
    }

    if (!this.getPartyPokemonBySlotIndex(slotIndex)) {
      return;
    }

    this.pokemonStatusPanelSlotIndex = slotIndex;
    this.render();
  }

  closePokemonStatusPanel(options: { rerenderPartyHud?: boolean } = {}): void {
    const rerenderPartyHud = options.rerenderPartyHud ?? true;

    this.pokemonStatusPanelSlotIndex = null;
    this.destroyPokemonStatusPanelUi();

    if (rerenderPartyHud && !this.dependencies.isShutdownComplete()) {
      this.render();
    }
  }

  isPokemonStatusPanelOpen(): boolean {
    return this.pokemonStatusPanelSlotIndex !== null;
  }

  private renderPokemonStatusPanel(): void {
    this.destroyPokemonStatusPanelUi();

    if (usesPokeLoungeMobileShell(this.dependencies.getDocument())) {
      this.pokemonStatusPanelSlotIndex = null;
      return;
    }

    const slotIndex = this.pokemonStatusPanelSlotIndex;

    if (slotIndex === null) {
      return;
    }

    const localPlayer = this.dependencies.gameStateStore.getCurrentLocalPlayer();
    const slots = createPartyHudSlotViews({
      activePartySlotIndex: localPlayer.activePartySlotIndex,
      anchor: "middle-left",
      party: localPlayer.party,
      screenSize: this.dependencies.getViewportSize(),
    });
    const slot = slots.find(candidate => candidate.slotIndex === slotIndex);
    const pokemon = this.getPartyPokemonBySlotIndex(slotIndex);

    if (!slot || !pokemon || !slot.pokemon) {
      this.pokemonStatusPanelSlotIndex = null;
      return;
    }

    const origin = this.getPokemonStatusPanelOrigin(slot);
    const x = (offset: number) => origin.x + offset;
    const y = (offset: number) => origin.y + offset;
    const hpRatio = getPokemonHpRatio(pokemon);
    const experience = getPokemonExperienceProgress(pokemon);
    const isActive = localPlayer.activePartySlotIndex === slotIndex;
    const occupiedPartyCount = localPlayer.party.filter(candidate => candidate.pokemon).length;
    const canSetAsLead = !isActive && pokemon.status !== "fainted";
    const leadActionLabel = isActive
      ? occupiedPartyCount <= 1
        ? "마지막 포켓몬 · 현재 선두"
        : "현재 선두"
      : pokemon.status === "fainted"
        ? "전투불능 · 선두 지정 불가"
        : "Enter / A · 선두로 지정";
    const panel = this.add
      .rectangle(
        origin.x,
        origin.y,
        POKEMON_STATUS_PANEL_SIZE.width,
        POKEMON_STATUS_PANEL_SIZE.height,
        0xf8fbf0,
        0.97,
      )
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(2140);
    panel.setStrokeStyle(3, 0x263238, 1);
    panel.setInteractive();

    const sprite = this.add
      .image(
        x(36 - POKEMON_STATUS_PANEL_SPRITE_SIZE / 2),
        y(43 - POKEMON_STATUS_PANEL_SPRITE_SIZE / 2),
        slot.pokemon.spriteKey,
        slot.pokemon.spriteFrame,
      )
      .setOrigin(0, 0)
      .setCrop(
        slot.pokemon.spriteCrop.x,
        slot.pokemon.spriteCrop.y,
        slot.pokemon.spriteCrop.width,
        slot.pokemon.spriteCrop.height,
      )
      .setScale(
        POKEMON_STATUS_PANEL_SPRITE_SIZE / slot.pokemon.spriteCrop.width,
        POKEMON_STATUS_PANEL_SPRITE_SIZE / slot.pokemon.spriteCrop.height,
      )
      .setScrollFactor(0)
      .setDepth(2141);
    const hpBack = this.add
      .rectangle(x(18), y(98), POKEMON_STATUS_BAR_WIDTH, 6, ROM_BATTLE_WINDOW_STYLE.hpBack, 1)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(2141);
    const hpFill = this.add
      .rectangle(
        x(18),
        y(98),
        Math.round(POKEMON_STATUS_BAR_WIDTH * hpRatio),
        6,
        ROM_BATTLE_WINDOW_STYLE.hpGood,
        1,
      )
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(2142);
    const experienceBack = this.add
      .rectangle(x(18), y(132), POKEMON_STATUS_BAR_WIDTH, 5, ROM_BATTLE_WINDOW_STYLE.hpBack, 1)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(2141);
    const experienceFill = this.add
      .rectangle(
        x(18),
        y(132),
        Math.round(POKEMON_STATUS_BAR_WIDTH * experience.ratio),
        5,
        0xfff4a3,
        1,
      )
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(2142);
    const leadAction = this.add
      .rectangle(
        x(18),
        y(258),
        POKEMON_STATUS_PANEL_SIZE.width - 36,
        24,
        canSetAsLead ? 0xfff4a3 : 0xe9eee1,
        0.95,
      )
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(2141);
    leadAction.setStrokeStyle(1, canSetAsLead ? 0x263238 : 0x9aa690, canSetAsLead ? 0.85 : 0.5);

    if (canSetAsLead) {
      leadAction.setInteractive({ useHandCursor: true });
      leadAction.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
        pointer.event?.preventDefault();
        this.dependencies.gameStateStore.setActivePartySlot(slotIndex);
      });
    }

    this.pokemonStatusPanelObjects.push(
      panel,
      sprite,
      hpBack,
      hpFill,
      experienceBack,
      experienceFill,
      leadAction,
      this.add
        .text(
          x(66),
          y(16),
          slot.pokemon.name,
          createGameTextStyle({
            color: "#263238",
            fontSize: "14px",
          }),
        )
        .setOrigin(0, 0)
        .setScrollFactor(0)
        .setDepth(2141),
      this.add
        .text(
          x(66),
          y(38),
          `Lv.${slot.pokemon.level}`,
          createGameTextStyle({
            color: "#455a64",
            fontSize: "12px",
          }),
        )
        .setOrigin(0, 0)
        .setScrollFactor(0)
        .setDepth(2141),
      this.add
        .rectangle(x(14), y(68), POKEMON_STATUS_PANEL_SIZE.width - 28, 2, 0x607d6c, 0.42)
        .setOrigin(0, 0)
        .setScrollFactor(0)
        .setDepth(2141),
      this.add
        .text(
          x(18),
          y(78),
          `HP ${formatPokemonHp(pokemon)}`,
          createGameTextStyle({
            color: "#263238",
            fontSize: "12px",
          }),
        )
        .setOrigin(0, 0)
        .setScrollFactor(0)
        .setDepth(2141),
      this.add
        .text(
          x(18),
          y(112),
          experience.atMaxLevel ? "EXP MAX" : `EXP ${experience.current} / ${experience.required}`,
          createGameTextStyle({
            color: "#263238",
            fontSize: "11px",
          }),
        )
        .setOrigin(0, 0)
        .setScrollFactor(0)
        .setDepth(2141),
      this.add
        .text(
          x(18),
          y(145),
          `상태 ${formatPokemonStatusLabel(pokemon.status ?? "normal")}`,
          createGameTextStyle({
            color: "#263238",
            fontSize: "12px",
          }),
        )
        .setOrigin(0, 0)
        .setScrollFactor(0)
        .setDepth(2141),
      this.add
        .rectangle(x(14), y(166), POKEMON_STATUS_PANEL_SIZE.width - 28, 2, 0x607d6c, 0.42)
        .setOrigin(0, 0)
        .setScrollFactor(0)
        .setDepth(2141),
      this.add
        .text(
          x(18),
          y(175),
          "기술",
          createGameTextStyle({
            color: "#607d6c",
            fontSize: "10px",
          }),
        )
        .setOrigin(0, 0)
        .setScrollFactor(0)
        .setDepth(2141),
      ...createPokemonMoveLabels(pokemon).flatMap((move, index) => [
        this.add
          .text(
            x(22),
            y(192 + index * 16),
            move.name,
            createGameTextStyle({
              color: "#263238",
              fontSize: "10px",
            }),
          )
          .setOrigin(0, 0)
          .setScrollFactor(0)
          .setDepth(2141),
        this.add
          .text(
            x(278),
            y(192 + index * 16),
            move.pp,
            createGameTextStyle({
              align: "right",
              color: "#455a64",
              fontSize: "10px",
            }),
          )
          .setOrigin(1, 0)
          .setScrollFactor(0)
          .setDepth(2141),
      ]),
      this.add
        .text(
          x(150),
          y(264),
          leadActionLabel,
          createGameTextStyle({
            align: "center",
            color: canSetAsLead ? "#101820" : "#607d6c",
            fontSize: "10px",
          }),
        )
        .setOrigin(0.5, 0)
        .setScrollFactor(0)
        .setDepth(2142),
      this.add
        .text(
          x(18),
          y(292),
          "Esc / Backspace / B 닫기",
          createGameTextStyle({
            color: "#607d6c",
            fontSize: "9px",
          }),
        )
        .setOrigin(0, 0)
        .setScrollFactor(0)
        .setDepth(2141),
    );
  }

  private destroyPokemonStatusPanelUi(): void {
    this.pokemonStatusPanelObjects.forEach(object => object.destroy());
    this.pokemonStatusPanelObjects = [];
  }

  private getPokemonStatusPanelOrigin(slot: PartyHudSlotView): { x: number; y: number } {
    const viewport = this.dependencies.getViewportSize();
    const minMargin = 10;
    const preferredX = slot.x + PARTY_HUD_SLOT_SIZE.width + POKEMON_STATUS_PANEL_GAP;
    const preferredY = slot.y - 6;

    return {
      x: Math.min(
        Math.max(minMargin, preferredX),
        viewport.width - POKEMON_STATUS_PANEL_SIZE.width - minMargin,
      ),
      y: Math.min(
        Math.max(minMargin, preferredY),
        viewport.height - POKEMON_STATUS_PANEL_SIZE.height - minMargin,
      ),
    };
  }

  getPokemonStatusPanelSnapshot(): PokemonStatusPanelSnapshot | null {
    const slotIndex = this.pokemonStatusPanelSlotIndex;

    if (slotIndex === null) {
      return null;
    }

    const pokemon = this.getPartyPokemonBySlotIndex(slotIndex);

    if (!pokemon) {
      return null;
    }

    return {
      slotIndex,
      name: pokemon.name,
      level: pokemon.level,
      currentHp: normalizeOptionalPokemonHp(pokemon.currentHp),
      maxHp: normalizeOptionalPokemonHp(pokemon.maxHp),
      status: pokemon.status ?? "normal",
    };
  }

  getPartyPokemonBySlotIndex(slotIndex: number): PlayerPokemon | null {
    return (
      this.dependencies.gameStateStore
        .getCurrentLocalPlayer()
        .party.find(slot => slot.slotIndex === slotIndex)?.pokemon ?? null
    );
  }

  destroyPartyHud(): void {
    this.partyHudObjects.forEach(object => object.destroy());
    this.partyHudObjects = [];
    this.partyHudSubscribed = false;
  }

  isPartyHudVisible(): boolean {
    return this.partyHudObjects.length > 0;
  }

  destroy(): void {
    this.destroyPartyHud();
    this.destroyPokemonStatusPanelUi();
    this.roundHudText?.destroy();
    this.roundHudText = null;
    this.lastRenderedRoundHudText = "";
    this.pokemonStatusPanelSlotIndex = null;
  }
}

export function formatPartyHudPokemonName(name: string): string {
  const characters = Array.from(name);

  return characters.length <= PARTY_HUD_NAME_MAX_CHARACTERS
    ? name
    : `${characters.slice(0, PARTY_HUD_NAME_MAX_CHARACTERS - 1).join("")}…`;
}

function normalizeOptionalPokemonHp(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : null;
}

export function formatPokemonHp(pokemon: PlayerPokemon): string {
  const currentHp = normalizeOptionalPokemonHp(pokemon.currentHp);
  const maxHp = normalizeOptionalPokemonHp(pokemon.maxHp);

  return currentHp === null || maxHp === null ? "- / -" : `${currentHp} / ${maxHp}`;
}

export function getPokemonHpRatio(pokemon: PlayerPokemon): number {
  const currentHp = normalizeOptionalPokemonHp(pokemon.currentHp);
  const maxHp = normalizeOptionalPokemonHp(pokemon.maxHp);

  if (currentHp === null || maxHp === null || maxHp <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(1, currentHp / maxHp));
}

export interface PokemonExperienceProgress {
  current: number;
  required: number;
  ratio: number;
  atMaxLevel: boolean;
}

export function getPokemonExperienceProgress(pokemon: PlayerPokemon): PokemonExperienceProgress {
  const level = Math.max(1, Math.min(100, Math.floor(pokemon.level)));

  if (level >= 100) {
    return { current: 0, required: 0, ratio: 1, atMaxLevel: true };
  }

  const growthRate = pokemon.growthRate ?? 0;
  const levelStart = getExperienceForLevel(level, growthRate);
  const nextLevel = getExperienceForLevel(level + 1, growthRate);
  const required = Math.max(1, nextLevel - levelStart);
  const totalExperience = Number.isFinite(pokemon.experience)
    ? Math.max(levelStart, Math.floor(pokemon.experience ?? levelStart))
    : levelStart;
  const current = Math.min(required, Math.max(0, totalExperience - levelStart));

  return {
    current,
    required,
    ratio: current / required,
    atMaxLevel: false,
  };
}

function createPokemonMoveLabels(pokemon: PlayerPokemon): Array<{ name: string; pp: string }> {
  const moves = pokemon.moves?.slice(0, 4) ?? [];

  if (moves.length === 0) {
    return [{ name: "기술 정보 없음", pp: "- / -" }];
  }

  return moves.map(move => ({
    name: move.name,
    pp: `${Math.max(0, Math.floor(move.pp))} / ${Math.max(0, Math.floor(move.maxPp))}`,
  }));
}

function formatPokemonStatusLabel(status: PlayerPokemon["status"] | "normal"): string {
  switch (status) {
    case "fainted":
      return "전투불능";
    case "poisoned":
      return "독";
    case "burned":
      return "화상";
    case "paralyzed":
      return "마비";
    case "normal":
    default:
      return "정상";
  }
}

export function formatPokeDollars(pokeDollars: number): string {
  return `₽ ${Math.max(0, Math.floor(pokeDollars)).toLocaleString("en-US")}`;
}

export function formatRankScoreHud(
  { rank, score }: PlayerCompetitiveStats,
  mode: "solo" | "competitive" = "competitive",
): string {
  const rankLabel = rank === null ? "-" : rank.toLocaleString("en-US");
  const scoreLabel = Math.max(0, Math.floor(score)).toLocaleString("en-US");

  return mode === "solo"
    ? "솔로 모드\n랭킹 미반영"
    : `계정 기록\n랭크 ${rankLabel} · 점수 ${scoreLabel}`;
}

export function formatRoundHudText(
  round: GameRoundState,
  nowMs: number,
  roundWaitingText = "다른 플레이어를 기다리는 중...",
): string {
  const visibleRound = Math.max(1, round.roundIndex);

  if (round.phase === "preparation") {
    if (getRoundRemainingMs(round, nowMs) === 0) {
      return `라운드 ${visibleRound}/${round.totalRounds}\n${roundWaitingText}`;
    }
    return `라운드 ${visibleRound}/${round.totalRounds} 시작까지\n${formatRoundTimer(
      getRoundRemainingMs(round, nowMs),
    )}`;
  }

  if (round.phase === "tournament") {
    return `라운드 ${visibleRound}/${round.totalRounds}\n토너먼트 진행`;
  }

  if (round.phase === "round-result") {
    return `라운드 ${visibleRound}/${round.totalRounds}\n결과`;
  }

  if (round.phase === "game-result") {
    return "최종 결과";
  }

  return "라운드 대기";
}
