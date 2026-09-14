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
import { isTallGrassStep } from "../world/tall-grass";
import {
  consumeCompletedTileSteps,
  createTileStepTracker,
  type CompletedTileStep,
  type TileCoordinate,
  type TileStepTracker,
} from "../world/tile-steps";
import {
  selectWildEncounterConfig,
  type WildEncounterConfig,
} from "../world/wild-encounter-tables";
import {
  createWildEncounterLevelRange,
  rollWildEncounter,
  type WildBattleStartInput,
  type WildEncounterLevelRange,
  type WildEncounterSlot,
} from "../world/wild-encounters";

export interface WorldSceneEncounters {
  afterMovement(completedSteps?: readonly CompletedTileStep[]): void;
  destroy(): void;
}

export interface WorldSceneEncounterController extends WorldSceneEncounters {
  initialize(position: { x: number; y: number }): void;
  isBattleIntroPlaying(): boolean;
  cancelForTournament(): void;
  playBattleIntroTransition(onComplete: () => void): void;
}

export interface WorldSceneEncountersDependencies {
  gameStateStore: GameStateStore;
  getPlayerPosition(): { x: number; y: number } | null;
  getPlayerFacing(): PlayerFacing;
  hasTallGrassAt(tile: TileCoordinate): boolean;
  stopPlayer(): void;
  getEncounterTableData(): unknown;
  getPokemonData(): unknown;
  persistPlayerPosition(position: PlayerPosition): void;
  delay(ms: number, onComplete: () => void): void;
  startBattle(data: object): void;
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
  private readonly wildEncounterConfigCache = new Map<string, WildEncounterConfig | undefined>();

  constructor(private readonly dependencies: WorldSceneEncountersDependencies) {}

  initialize(position: { x: number; y: number }): void {
    this.lifecycleGeneration += 1;
    this.stepTracker = createTileStepTracker(position);
    this.encounterLocked = false;
    this.battleIntroPlaying = false;
    this.wildEncounterConfigCache.clear();
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

  cancelForTournament(): void {
    this.lifecycleGeneration += 1;
    this.battleIntroPlaying = false;
    this.encounterLocked = true;
  }

  destroy(): void {
    this.lifecycleGeneration += 1;
    this.stepTracker = null;
    this.encounterLocked = false;
    this.battleIntroPlaying = false;
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
      ...(config?.encounterRate !== undefined ? { rate: config.encounterRate } : {}),
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
