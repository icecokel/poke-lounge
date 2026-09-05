import { getExperienceForLevel } from "../battle/experience";
import {
  DEFAULT_PREPARATION_DURATION_MS,
  formatRoundTimer,
  getRoundRemainingMs,
  type GameRoundState,
} from "../round/round-state";
import type {
  GameStateStore,
  PlayerCompetitiveStats,
  PlayerPokemon,
} from "../state/game-state-store";
import { usesPokeLoungeMobileShell } from "../ui/mobile-ui-capability";
import type { WorldUiStore } from "../world/world-ui-store";

const PARTY_HUD_NAME_MAX_CHARACTERS = 6;

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
  gameStateStore: GameStateStore;
  competitiveRoundsEnabled: boolean;
  serverAuthoritativeRounds: boolean;
  roundWaitingText: string;
  addUnsubscriber(unsubscribe: () => void): void;
  canOpenPokemonStatusPanel(): boolean;
  isShutdownComplete(): boolean;
  worldUiStore: WorldUiStore;
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
  openPokemonStatusPanel(slotIndex: number): void;
  setPokemonStatusLead(slotIndex: number): void;
}

export function createWorldSceneHud(
  dependencies: WorldSceneHudDependencies,
): WorldSceneHudController {
  return new DefaultWorldSceneHud(dependencies);
}

class DefaultWorldSceneHud implements WorldSceneHudController {
  private partyHudSubscribed = false;
  private pokemonStatusPanelSlotIndex: number | null = null;

  constructor(private readonly dependencies: WorldSceneHudDependencies) {}

  createCurrencyHud(): void {}
  createRankScoreHud(): void {}

  createRoundHud(nowMs: number, preparationDurationMs = DEFAULT_PREPARATION_DURATION_MS): void {
    const { gameStateStore } = this.dependencies;
    if (
      !this.dependencies.serverAuthoritativeRounds &&
      gameStateStore.getState().round.phase === "waiting"
    ) {
      gameStateStore.startPreparationRound(nowMs, preparationDurationMs);
    }
  }

  updateRound(nowMs: number): void {
    if (
      this.dependencies.competitiveRoundsEnabled &&
      !this.dependencies.serverAuthoritativeRounds
    ) {
      this.dependencies.gameStateStore.advanceRoundClock(nowMs);
    }
  }

  createPartyHud(): void {
    this.render();
    if (this.partyHudSubscribed) return;
    this.partyHudSubscribed = true;
    this.dependencies.addUnsubscriber(
      this.dependencies.gameStateStore.subscribe(
        function callback(this: DefaultWorldSceneHud): void {
          return this.render();
        }.bind(this),
      ),
    );
  }

  render(): void {
    if (
      this.pokemonStatusPanelSlotIndex !== null &&
      !this.getPartyPokemonBySlotIndex(this.pokemonStatusPanelSlotIndex)
    ) {
      this.pokemonStatusPanelSlotIndex = null;
    }
    this.publishPokemonStatusSelection();
  }

  openPokemonStatusPanel(slotIndex: number): void {
    if (
      usesPokeLoungeMobileShell(this.dependencies.getDocument()) ||
      !this.dependencies.canOpenPokemonStatusPanel() ||
      !this.getPartyPokemonBySlotIndex(slotIndex)
    ) {
      return;
    }
    this.pokemonStatusPanelSlotIndex = slotIndex;
    this.publishPokemonStatusSelection();
  }

  setPokemonStatusLead(slotIndex: number): void {
    const pokemon = this.getPartyPokemonBySlotIndex(slotIndex);
    const player = this.dependencies.gameStateStore.getCurrentLocalPlayer();
    if (
      pokemon &&
      pokemon.status !== "fainted" &&
      slotIndex !== player.activePartySlotIndex &&
      this.dependencies.gameStateStore.setActivePartySlot(slotIndex).ok
    ) {
      this.render();
    }
  }

  closePokemonStatusPanel(options: { rerenderPartyHud?: boolean } = {}): void {
    this.pokemonStatusPanelSlotIndex = null;
    this.publishPokemonStatusSelection();
    if ((options.rerenderPartyHud ?? true) && !this.dependencies.isShutdownComplete()) {
      this.render();
    }
  }

  isPokemonStatusPanelOpen(): boolean {
    return this.pokemonStatusPanelSlotIndex !== null;
  }

  getPokemonStatusPanelSnapshot(): PokemonStatusPanelSnapshot | null {
    const slotIndex = this.pokemonStatusPanelSlotIndex;
    if (slotIndex === null) return null;
    const pokemon = this.getPartyPokemonBySlotIndex(slotIndex);
    if (!pokemon) return null;
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
      this.dependencies.gameStateStore.getCurrentLocalPlayer().party.find(function findItem(slot) {
        return slot.slotIndex === slotIndex;
      })?.pokemon ?? null
    );
  }

  destroyPartyHud(): void {
    this.partyHudSubscribed = false;
  }

  isPartyHudVisible(): boolean {
    return !usesPokeLoungeMobileShell(this.dependencies.getDocument());
  }

  destroy(): void {
    this.destroyPartyHud();
    this.pokemonStatusPanelSlotIndex = null;
    this.publishPokemonStatusSelection();
  }

  private publishPokemonStatusSelection(): void {
    this.dependencies.worldUiStore.publishPresentation({
      pokemonStatusSlotIndex: this.pokemonStatusPanelSlotIndex,
    });
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
  if (currentHp === null || maxHp === null || maxHp <= 0) return 0;
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
  if (level >= 100) return { current: 0, required: 0, ratio: 1, atMaxLevel: true };
  const growthRate = pokemon.growthRate ?? 0;
  const levelStart = getExperienceForLevel(level, growthRate);
  const required = Math.max(1, getExperienceForLevel(level + 1, growthRate) - levelStart);
  const totalExperience = Number.isFinite(pokemon.experience)
    ? Math.max(levelStart, Math.floor(pokemon.experience ?? levelStart))
    : levelStart;
  const current = Math.min(required, Math.max(0, totalExperience - levelStart));
  return { current, required, ratio: current / required, atMaxLevel: false };
}

export function formatPokeDollars(pokeDollars: number, locale = "en-US"): string {
  return `₽ ${Math.max(0, Math.floor(pokeDollars)).toLocaleString(locale)}`;
}

export function formatRankScoreHud(
  { rank, score }: PlayerCompetitiveStats,
  mode: "solo" | "competitive" = "competitive",
  locale = "en-US",
): string {
  const rankLabel = rank === null ? "-" : rank.toLocaleString(locale);
  const scoreLabel = Math.max(0, score).toLocaleString(locale, { maximumFractionDigits: 2 });
  return mode === "solo"
    ? "솔로 모드\n랭킹 미반영"
    : `현재 게임\n랭크 ${rankLabel} · 점수 ${scoreLabel}`;
}

export function getCurrentGameRankScore(
  state: ReturnType<GameStateStore["getState"]>,
): PlayerCompetitiveStats {
  const playerId = state.tournament.serverProjection?.ownPlayerId ?? state.currentPlayerId;
  const scores = state.tournament.scoresByPlayerId;
  const score = scores[playerId] ?? 0;
  return {
    score,
    rank: Object.hasOwn(scores, playerId)
      ? 1 + Object.values(scores).filter(value => value > score).length
      : null,
  };
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
  if (round.phase === "round-result") return `라운드 ${visibleRound}/${round.totalRounds}\n결과`;
  if (round.phase === "game-result") return "최종 결과";
  return "라운드 대기";
}
