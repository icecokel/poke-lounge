import * as Phaser from "phaser";
import { playBattleTransitionSound } from "../battle/battleAudio";
import {
  BATTLE_INTRO_STRIPE_COUNT,
  BATTLE_INTRO_TIMING,
  createBattleIntroStripes,
  getBattleIntroDurationMs,
} from "../battle/battleIntro";
import type { PlayerFacing } from "../network/localPreviewRoom";
import type { PlayerPosition } from "../player/playerTypes";
import {
  calculateOccupiedPartyAverageLevel,
  type GameStateStore,
  type LocalPlayerState,
} from "../state/gameStateStore";
import { FIELD_MAP, resolveFieldEncounterAreaId } from "../world/fieldMap";
import {
  consumeCompletedTileSteps,
  createTileStepTracker,
  type TileCoordinate,
  type TileStepTracker,
} from "../world/tileSteps";
import { isTallGrassStep } from "../world/tall-grass";
import {
  createWildEncounterLevelRange,
  rollWildEncounter,
  type WildEncounterCandidate,
  type WildEncounterLevelRange,
  type WildEncounterSlot,
} from "../world/wildEncounters";
import { selectWildEncounterConfig, type WildEncounterConfig } from "../world/wildEncounterTables";

export const WILD_ENCOUNTER_RATE_QUERY_PARAM = "wildEncounterRate";

export interface WildBattleStartInput {
  encounter: WildEncounterCandidate;
  x: number;
  y: number;
  facing: PlayerFacing;
}

export interface WorldSceneEncounterSnapshot {
  encounterLocked: boolean;
  battleIntroPlaying: boolean;
}

export interface WorldSceneEncounters {
  afterMovement(): void;
  destroy(): void;
}

export interface WorldSceneEncounterController extends WorldSceneEncounters {
  initialize(position: { x: number; y: number }): void;
  isBattleIntroPlaying(): boolean;
  getE2eSnapshot(): WorldSceneEncounterSnapshot;
  startWildBattleForTest(input: WildBattleStartInput): void;
  playBattleIntroTransition(onComplete: () => void): void;
}

export interface WorldSceneEncountersDependencies {
  gameStateStore: GameStateStore;
  getPlayerPosition(): { x: number; y: number } | null;
  getPlayerFacing(): PlayerFacing;
  hasTallGrassAt(tile: TileCoordinate): boolean;
  stopPlayer(): void;
  getLocationUrl(): URL;
  getEncounterTableData(): unknown;
  getPokemonData(): unknown;
  persistPlayerPosition(position: PlayerPosition): void;
  getViewportSize(): { width: number; height: number };
  createRectangle(
    x: number,
    y: number,
    width: number,
    height: number,
    fillColor: number,
    fillAlpha?: number,
  ): Phaser.GameObjects.Rectangle;
  shakeCamera(duration: number, intensity: number): void;
  addTween(config: Phaser.Types.Tweens.TweenBuilderConfig): void;
  delay(ms: number, onComplete: () => void): void;
  startBattle(data: object): void;
}

export function readWildEncounterRateOverride(url: URL): number | undefined {
  const rawRate = url.searchParams.get(WILD_ENCOUNTER_RATE_QUERY_PARAM);

  if (rawRate === null) {
    return undefined;
  }

  const parsedRate = Number(rawRate);

  if (!Number.isFinite(parsedRate) || parsedRate < 0 || parsedRate > 1) {
    return undefined;
  }

  return parsedRate;
}

export function createWorldSceneEncounters(
  dependencies: WorldSceneEncountersDependencies,
): WorldSceneEncounterController {
  return new DefaultWorldSceneEncounters(dependencies);
}

class DefaultWorldSceneEncounters implements WorldSceneEncounterController {
  private stepTracker: TileStepTracker | null = null;
  private encounterLocked = false;
  private battleIntroPlaying = false;
  private lifecycleGeneration = 0;
  private wildEncounterRateOverride: number | undefined;
  private readonly wildEncounterConfigCache = new Map<string, WildEncounterConfig | undefined>();

  constructor(private readonly dependencies: WorldSceneEncountersDependencies) {}

  initialize(position: { x: number; y: number }): void {
    this.lifecycleGeneration += 1;
    this.stepTracker = createTileStepTracker(position);
    this.encounterLocked = false;
    this.battleIntroPlaying = false;
    this.wildEncounterConfigCache.clear();
    this.wildEncounterRateOverride = readWildEncounterRateOverride(
      this.dependencies.getLocationUrl(),
    );
  }

  afterMovement(): void {
    const position = this.dependencies.getPlayerPosition();

    if (!position || !this.stepTracker || this.encounterLocked) {
      return;
    }

    const steps = consumeCompletedTileSteps(this.stepTracker, position);

    if (!hasBattleCapablePartyPokemon(this.dependencies.gameStateStore.getCurrentLocalPlayer())) {
      return;
    }

    for (const step of steps) {
      if (!isTallGrassStep(step, this.dependencies.hasTallGrassAt)) {
        continue;
      }

      const tileSize = this.stepTracker.tileSize;
      const encounter = rollWildEncounter({
        ...this.getWildEncounterLevelRangeInput(),
        ...this.getWildEncounterConfigInput({
          x: (step.to.x + 0.5) * tileSize,
          y: (step.to.y + 0.5) * tileSize,
        }),
        mapKey: FIELD_MAP.key,
        step,
        random: () => Math.random(),
      });

      if (encounter) {
        this.startWildBattle({
          encounter,
          x: Math.round(position.x),
          y: Math.round(position.y),
          facing: this.dependencies.getPlayerFacing(),
        });
        return;
      }
    }
  }

  isBattleIntroPlaying(): boolean {
    return this.battleIntroPlaying;
  }

  getE2eSnapshot(): WorldSceneEncounterSnapshot {
    return {
      encounterLocked: this.encounterLocked,
      battleIntroPlaying: this.battleIntroPlaying,
    };
  }

  startWildBattleForTest(input: WildBattleStartInput): void {
    this.startWildBattle(input);
  }

  playBattleIntroTransition(onComplete: () => void): void {
    const lifecycleGeneration = this.lifecycleGeneration;

    this.battleIntroPlaying = true;
    playBattleTransitionSound();

    const { width, height } = this.dependencies.getViewportSize();
    const depth = 10_000;
    const flash = this.dependencies
      .createRectangle(0, 0, width, height, 0xf8fbf0, 0.86)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(depth);

    this.dependencies.shakeCamera(BATTLE_INTRO_TIMING.flashMs, 0.004);
    this.dependencies.addTween({
      targets: flash,
      alpha: 0,
      duration: BATTLE_INTRO_TIMING.flashMs,
      ease: "Quad.easeOut",
      onComplete: () => flash.destroy(),
    });

    createBattleIntroStripes({
      width,
      height,
      stripeCount: BATTLE_INTRO_STRIPE_COUNT,
    }).forEach((stripe, index) => {
      const stripeBlock = this.dependencies
        .createRectangle(stripe.x, stripe.y, stripe.width, stripe.height, 0x101820, 1)
        .setOrigin(0, 0)
        .setScrollFactor(0)
        .setDepth(depth + 1 + index);

      this.dependencies.addTween({
        targets: stripeBlock,
        x: 0,
        delay: BATTLE_INTRO_TIMING.flashMs + index * 16,
        duration: Math.max(120, BATTLE_INTRO_TIMING.stripeMs - index * 16),
        ease: "Cubic.easeOut",
      });
    });

    const fade = this.dependencies
      .createRectangle(0, 0, width, height, 0x101820, 0)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(depth + BATTLE_INTRO_STRIPE_COUNT + 1);

    this.dependencies.addTween({
      targets: fade,
      alpha: 1,
      delay: BATTLE_INTRO_TIMING.flashMs + BATTLE_INTRO_TIMING.stripeMs,
      duration: BATTLE_INTRO_TIMING.fadeMs,
      ease: "Linear",
    });
    this.dependencies.delay(getBattleIntroDurationMs(), () => {
      if (this.lifecycleGeneration !== lifecycleGeneration || !this.battleIntroPlaying) {
        return;
      }

      onComplete();
    });
  }

  destroy(): void {
    this.lifecycleGeneration += 1;
    this.stepTracker = null;
    this.encounterLocked = false;
    this.battleIntroPlaying = false;
    this.wildEncounterRateOverride = undefined;
    this.wildEncounterConfigCache.clear();
  }

  private getWildEncounterLevelRangeInput(): { levelRange?: WildEncounterLevelRange } {
    const averageLevel = calculateOccupiedPartyAverageLevel(
      this.dependencies.gameStateStore.getCurrentLocalPlayer().party,
    );

    return averageLevel === null ? {} : { levelRange: createWildEncounterLevelRange(averageLevel) };
  }

  private getWildEncounterConfigInput(position: { x: number; y: number }): {
    rate?: number;
    slots?: ReadonlyArray<WildEncounterSlot>;
  } {
    const areaId = resolveFieldEncounterAreaId(position);
    const configCacheKey = areaId ?? "";
    let config = this.wildEncounterConfigCache.get(configCacheKey);

    if (!this.wildEncounterConfigCache.has(configCacheKey)) {
      config = selectWildEncounterConfig(
        this.dependencies.getEncounterTableData(),
        FIELD_MAP.key,
        areaId,
        this.dependencies.getPokemonData(),
      );
      this.wildEncounterConfigCache.set(configCacheKey, config);
    }

    return {
      ...(this.wildEncounterRateOverride !== undefined
        ? { rate: this.wildEncounterRateOverride }
        : config?.encounterRate !== undefined
          ? { rate: config.encounterRate }
          : {}),
      ...(config?.slots ? { slots: config.slots } : {}),
    };
  }

  private startWildBattle({ encounter, facing, x, y }: WildBattleStartInput): void {
    if (!hasBattleCapablePartyPokemon(this.dependencies.gameStateStore.getCurrentLocalPlayer())) {
      return;
    }

    this.encounterLocked = true;
    this.dependencies.stopPlayer();
    this.dependencies.persistPlayerPosition({
      mapKey: FIELD_MAP.key,
      x,
      y,
      facing,
    });
    const battleData = {
      battleKind: "wild",
      encounter,
      returnToWorld: {
        mapKey: FIELD_MAP.key,
        x,
        y,
        facing,
      },
    } as const;

    this.playBattleIntroTransition(() => {
      this.dependencies.startBattle(battleData);
    });
  }
}

function hasBattleCapablePartyPokemon(player: LocalPlayerState): boolean {
  return player.party.some(slot => {
    const pokemon = slot.pokemon;

    if (!pokemon || pokemon.status === "fainted") {
      return false;
    }

    if (typeof pokemon.currentHp === "number" && pokemon.currentHp <= 0) {
      return false;
    }

    return true;
  });
}
