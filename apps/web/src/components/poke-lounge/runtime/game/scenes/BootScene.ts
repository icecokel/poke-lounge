import * as Phaser from "phaser";
import {
  getPokeLoungeAudioPreloadAssets,
  parsePokeLoungeAudioManifest,
  POKE_LOUNGE_AUDIO_MANIFEST_CACHE_KEY,
  POKE_LOUNGE_AUDIO_MANIFEST_PATH,
  registerPreloadedPokeLoungeAudio,
} from "../audio/poke-lounge-audio";
import type { PokeLoungeAudioManifest } from "../audio/poke-lounge-audio.types";
import { BATTLE_ASSET_MANIFEST_PATH } from "../battle/battleAssets";
import { ROM_BATTLE_PRELOAD_ASSETS } from "../battle/battleDesign";
import { toBattlePokemonPreloadAssets } from "../battle/battlePokemonAssets";
import {
  BATTLE_POKEMON_ASSETS_JSON_PATH,
  LEVEL_UP_MOVE_TABLE_JSON_PATH,
  POKEMON_DATA_JSON_PATH,
  WILD_BATTLE_MOVE_SETS_JSON_PATH,
} from "../data/game-data-json";
import type { InitialGameScene } from "../gameStartup";
import type { BattleE2eScenario } from "./BattleScene";
import { FIELD_MAP } from "../world/fieldMap";
import { WILD_ENCOUNTER_TABLES_JSON_ASSET } from "../world/wildEncounterTables";

export const ROM_BATTLE_DATA_JSON_ASSETS = [
  ["romPersonalData", "/assets/poke-lounge/extraction/personal-data.json"],
  ["romGrowthTable", "/assets/poke-lounge/extraction/growth-table.json"],
  ["romRefinedBattleRecords", "/assets/poke-lounge/extraction/refined-battle-records.json"],
] as const;

export const WORLD_DATA_JSON_ASSETS = [WILD_ENCOUNTER_TABLES_JSON_ASSET] as const;
const GAME_DATA_JSON_ASSETS = [
  ["pokemonData", POKEMON_DATA_JSON_PATH],
  ["levelUpMoveTable", LEVEL_UP_MOVE_TABLE_JSON_PATH],
  ["wildBattleMoveSets", WILD_BATTLE_MOVE_SETS_JSON_PATH],
  ["battlePokemonAssets", BATTLE_POKEMON_ASSETS_JSON_PATH],
] as const;

export class BootScene extends Phaser.Scene {
  private audioManifest: PokeLoungeAudioManifest | null = null;
  private readonly failedResourceKeys = new Set<string>();
  private loadingBar: Phaser.GameObjects.Graphics | null = null;
  private loadingProgressLabel: Phaser.GameObjects.Text | null = null;

  constructor(
    private readonly initialScene: InitialGameScene = "world",
    private readonly battleE2eScenario: BattleE2eScenario | null = null,
  ) {
    super("boot");
  }

  preload(): void {
    this.setResourceStatus("loading");
    this.createLoadingView();
    this.load.on(Phaser.Loader.Events.PROGRESS, this.updateLoadingView, this);
    this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, this.handleResourceLoadError, this);
    this.load.once(
      `${Phaser.Loader.Events.FILE_KEY_COMPLETE}json-${POKE_LOUNGE_AUDIO_MANIFEST_CACHE_KEY}`,
      this.enqueueAudioAssets,
      this,
    );

    this.load.json(POKE_LOUNGE_AUDIO_MANIFEST_CACHE_KEY, POKE_LOUNGE_AUDIO_MANIFEST_PATH);
    this.load.json("battleAssetManifest", BATTLE_ASSET_MANIFEST_PATH);
    for (const [key, path] of ROM_BATTLE_DATA_JSON_ASSETS) {
      this.load.json(key, path);
    }
    for (const [key, path] of WORLD_DATA_JSON_ASSETS) {
      this.load.json(key, path);
    }
    for (const [key, path] of GAME_DATA_JSON_ASSETS) {
      this.load.json(key, path);
    }
    for (const asset of toBattlePokemonPreloadAssets()) {
      this.load.spritesheet(asset.assetKey, asset.path, {
        frameWidth: asset.frameWidth,
        frameHeight: asset.frameHeight,
        endFrame: asset.endFrame,
      });
    }
    for (const [key, path] of ROM_BATTLE_PRELOAD_ASSETS) {
      this.load.image(key, path);
    }
    this.load.image(FIELD_MAP.tilesetKey, FIELD_MAP.tilesetUrl);
    for (const npc of Object.values(FIELD_MAP.npcs)) {
      this.load.image(npc.textureKey, npc.imageUrl);
    }
    this.load.tilemapTiledJSON(FIELD_MAP.key, FIELD_MAP.mapUrl);
    this.load.atlas(
      FIELD_MAP.player.textureKey,
      FIELD_MAP.player.atlasUrl,
      FIELD_MAP.player.atlasJsonUrl,
    );
  }

  create(): void {
    this.load.off(Phaser.Loader.Events.PROGRESS, this.updateLoadingView, this);
    this.load.off(Phaser.Loader.Events.FILE_LOAD_ERROR, this.handleResourceLoadError, this);

    if (this.failedResourceKeys.size > 0 || !this.registerAudioAssets()) {
      this.setResourceStatus("error");
      return;
    }

    this.createPlayerAnimations();
    this.setResourceStatus("ready");
    if (this.initialScene === "battle") {
      this.scene.start(
        "battle",
        this.battleE2eScenario ? { e2eScenario: this.battleE2eScenario } : undefined,
      );
      return;
    }

    this.scene.start("world", {
      map: FIELD_MAP.key,
      spawnPointName: FIELD_MAP.defaultSpawn,
    });
  }

  private createLoadingView(): void {
    const width = this.scale.width;
    const height = this.scale.height;
    this.cameras.main.setBackgroundColor("#102217");
    this.loadingBar = this.add.graphics();
    this.loadingProgressLabel = this.add
      .text(width / 2, height / 2 + 24, "0%", {
        color: "#f8fbf0",
        fontFamily: "monospace",
        fontSize: "18px",
      })
      .setOrigin(0.5);
    this.updateLoadingView(0);
  }

  private updateLoadingView(progress: number): void {
    if (!this.loadingBar) {
      return;
    }

    const width = this.scale.width;
    const height = this.scale.height;
    const trackWidth = Math.min(width - 64, 360);
    const trackHeight = 16;
    const x = (width - trackWidth) / 2;
    const y = height / 2;
    const normalizedProgress = Phaser.Math.Clamp(progress, 0, 1);

    this.loadingBar.clear();
    this.loadingBar.fillStyle(0xf8fbf0, 0.25);
    this.loadingBar.fillRoundedRect(x, y, trackWidth, trackHeight, 4);
    this.loadingBar.fillStyle(0x73c991, 1);
    this.loadingBar.fillRoundedRect(x, y, trackWidth * normalizedProgress, trackHeight, 4);
    this.loadingProgressLabel?.setText(`${Math.round(normalizedProgress * 100)}%`);
  }

  private enqueueAudioAssets(_key: string, _type: string, data: unknown): void {
    const manifest = parsePokeLoungeAudioManifest(data);
    if (!manifest) {
      this.failedResourceKeys.add(POKE_LOUNGE_AUDIO_MANIFEST_CACHE_KEY);
      return;
    }

    this.audioManifest = manifest;
    for (const asset of getPokeLoungeAudioPreloadAssets(manifest)) {
      this.load.binary(asset.cacheKey, asset.src);
    }
  }

  private handleResourceLoadError(file: Phaser.Loader.File): void {
    this.failedResourceKeys.add(file.key);
  }

  private registerAudioAssets(): boolean {
    if (!this.audioManifest) {
      return false;
    }

    const buffers = new Map();
    for (const asset of getPokeLoungeAudioPreloadAssets(this.audioManifest)) {
      const buffer = this.cache.binary.get(asset.cacheKey);
      if (!(buffer instanceof ArrayBuffer)) {
        this.failedResourceKeys.add(asset.cacheKey);
        continue;
      }

      buffers.set(asset.id, buffer);
      this.cache.binary.remove(asset.cacheKey);
    }

    if (this.failedResourceKeys.size > 0) {
      return false;
    }

    registerPreloadedPokeLoungeAudio(this.audioManifest, buffers);
    this.loadingBar?.destroy();
    this.loadingProgressLabel?.destroy();
    this.loadingBar = null;
    this.loadingProgressLabel = null;

    return true;
  }

  private setResourceStatus(status: "loading" | "ready" | "error"): void {
    const gameRoot = this.game.canvas.parentElement;
    if (gameRoot) {
      gameRoot.dataset.pokeLoungeResourceStatus = status;
    }
  }

  private createPlayerAnimations(): void {
    for (const direction of ["left", "right", "front", "back"] as const) {
      this.anims.create({
        key: FIELD_MAP.player.walkAnimationKeys[direction],
        frames: this.anims.generateFrameNames(FIELD_MAP.player.textureKey, {
          prefix: `${FIELD_MAP.player.frameNames[direction]}-walk.`,
          start: 0,
          end: 3,
          zeroPad: 3,
        }),
        frameRate: 10,
        repeat: -1,
      });
    }
  }
}
