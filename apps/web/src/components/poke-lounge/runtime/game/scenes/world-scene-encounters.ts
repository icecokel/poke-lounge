import { playBattleTransitionSound } from "../battle/battle-audio";
import { getBattleIntroDurationMs } from "../battle/battle-intro";
import type { PlayerFacing } from "../network/local-preview-room";
import type { PlayerPosition } from "../player/player-types";
import {
  calculateOccupiedPartyAverageLevel,
  type GameStateStore,
  type LocalPlayerState,
} from "../state/game-state-store";
import { FIELD_MAP, resolveFieldEncounterAreaId } from "../world/field-map";
import {
  consumeCompletedTileSteps,
  createTileStepTracker,
  type CompletedTileStep,
  type TileCoordinate,
  type TileStepTracker,
} from "../world/tile-steps";
import { isTallGrassStep } from "../world/tall-grass";
import {
  createWildEncounterLevelRange,
  rollWildEncounter,
  type WildBattleStartInput,
  type WildEncounterLevelRange,
  type WildEncounterSlot,
} from "../world/wild-encounters";
import {
  selectWildEncounterConfig,
  type WildEncounterConfig,
} from "../world/wild-encounter-tables";

export const WILD_ENCOUNTER_RATE_QUERY_PARAM = "wildEncounterRate";

export interface WorldSceneEncounterSnapshot {
  encounterLocked: boolean;
  battleIntroPlaying: boolean;
}

export interface WorldSceneEncounters {
  afterMovement(completedSteps?: readonly CompletedTileStep[]): void;
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

  afterMovement(completedSteps?: readonly CompletedTileStep[]): void {
    const position = this.dependencies.getPlayerPosition();

    if (!position || !this.stepTracker || this.encounterLocked) {
      return;
    }

    const steps = completedSteps ?? consumeCompletedTileSteps(this.stepTracker, position);

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
    this.dependencies.delay(
      getBattleIntroDurationMs(),
      function callback(this: DefaultWorldSceneEncounters): void {
        if (this.lifecycleGeneration !== lifecycleGeneration || !this.battleIntroPlaying) {
          return;
        }

        onComplete();
      }.bind(this),
    );
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

    this.playBattleIntroTransition(
      function callback(this: DefaultWorldSceneEncounters): void {
        this.dependencies.startBattle(battleData);
      }.bind(this),
    );
  }
}

function hasBattleCapablePartyPokemon(player: LocalPlayerState): boolean {
  return player.party.some(function testItem(slot) {
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
