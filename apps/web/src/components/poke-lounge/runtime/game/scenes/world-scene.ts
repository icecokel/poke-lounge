import { playPokeLoungeBgm, stopPokeLoungeBgm } from "../audio/poke-lounge-audio";
import { GAME_VIEWPORT_SIZE, type GameViewportDisplaySize } from "../game-viewport";
import {
  type CompetitiveRoomProjectionEvent,
  type MultiplayerRoom,
  type PlayerFacing,
  type PlayerSnapshot,
  type RoomEvent,
  type RoomMessage,
  type RoomUnsubscribe,
} from "../network/local-preview-room";
import { FIELD_MAP } from "../world/field-map";
import { WILD_ENCOUNTER_TABLES_JSON_ASSET } from "../world/wild-encounter-tables";
import {
  createDefaultLocalPlayer,
  healLocalPlayer,
  type GameStateStore,
  type LocalPlayerState,
  type RemotePlayerState,
} from "../state/game-state-store";
import type { TournamentMatch } from "@poke-lounge/battle/tournament-bracket";
import type { TournamentSession } from "../tournament/tournament-session";
import { type DiceGambleNumber, type DiceGamblePrediction } from "../gamble/dice-gamble";
import { DEFAULT_PREPARATION_DURATION_MS } from "../round/round-state";
import { isVirtualGamepadPressed, resetVirtualGamepad } from "../input/virtual-gamepad";
import { getPokeLoungeCopyForUrl } from "../../../poke-lounge-copy";
import type { RoomLobbyRuntimeState } from "../ui/room-lobby-screen";
import { createWorldSceneHud, type WorldSceneHudController } from "./world-scene-hud";
import {
  createWorldSceneInteractions,
  type WorldSceneInteractionsController,
} from "./world-scene-interactions";
import {
  createWorldSceneTournament,
  isWorldTournamentBattleResult,
  type WorldSceneTournamentController,
  type WorldTournamentBattleResult,
} from "./world-scene-tournament";
import { resolvePersistedWorldSpawn, shouldPersistSoloWorldPosition } from "./world-scene-spawn";
import { shouldDisposeRoomOnWorldShutdown } from "./world-scene-room-lifecycle";
import {
  createWorldSceneEncounters,
  type WorldSceneEncounterController,
} from "./world-scene-encounters";
import type { WildBattleStartInput } from "../world/wild-encounters";
import {
  createCompetitiveBattleLaunchCache,
  isCompetitiveAssignmentForPlayer,
  type CompetitiveBattleLaunchKey,
} from "./competitive-battle-launch";
import type {
  PokeLoungeBattleLaunchSnapshot,
  WorldE2eSnapshot,
} from "../testing/poke-lounge-e2e-controller";
import { readPokeLoungeBattleLaunchSnapshot } from "../testing/poke-lounge-e2e-controller";
import type { WorldFrameStore } from "../world/world-frame-store";
import type { WorldMovementInput, WorldRuntime } from "../world/world-runtime";
import type { WorldUiAction, WorldUiStore } from "../world/world-ui-store";
import type { WorldMapModel } from "../world/world-map-model";
import type { RuntimeKeyboard } from "../runtime-input";
import type { PokeLoungeRuntimeAssets } from "../assets/poke-lounge-runtime-assets";
import type {
  RoundScoreUpdatedRoomPayload,
  TournamentCompletedRoomPayload,
  TournamentMatchResultRoomPayload,
  TournamentStartedRoomPayload,
} from "../network/tournament-room-protocol";
import type { TournamentStateRoomPayload } from "../network/tournament-projection";

const PLAYER_POSITION_PERSIST_INTERVAL_MS = 1_000;
export const ROUND_DURATION_QUERY_PARAM = "roundMs";

export interface WorldSpawnPosition {
  x: number;
  y: number;
  facing?: PlayerFacing;
}

export interface WorldSceneCreateData {
  spawnPointName?: string;
  spawnPosition?: WorldSpawnPosition;
  tournamentResult?: WorldTournamentBattleResult;
  completedCompetitiveBattle?: CompetitiveBattleLaunchKey;
}

export interface WorldSceneOptions {
  competitiveRoundsEnabled?: boolean;
  keyboard: RuntimeKeyboard;
  onRoomLobbyStateChange?: (state: RoomLobbyRuntimeState | null) => void;
  onStartBattle(data: object): void;
  ownerDocument: Document;
  runtimeAssets: PokeLoungeRuntimeAssets;
  serverAuthoritativeRounds?: boolean;
  viewportSize?: GameViewportDisplaySize;
  worldFrameStore: WorldFrameStore;
  worldModel: WorldMapModel;
  worldRuntime: WorldRuntime;
  worldUiStore: WorldUiStore;
}

export interface ResolvedWorldSpawn {
  x: number;
  y: number;
  facing?: PlayerFacing;
}

export function readRoundDurationOverride(url: URL): number | null {
  const rawDuration = url.searchParams.get(ROUND_DURATION_QUERY_PARAM);
  const parsedDuration = rawDuration ? Number(rawDuration) : NaN;

  if (!Number.isFinite(parsedDuration)) {
    return null;
  }

  return Math.max(1_000, Math.trunc(parsedDuration));
}

interface SpawnObject {
  name?: string;
  type?: string;
  x?: number;
  y?: number;
}

export interface ObjectLayerLookup {
  getObjectLayer(layerName: string): { objects: SpawnObject[] } | null;
}

export function resolveWorldSpawn(
  map: ObjectLayerLookup,
  spawnPointName: string,
  spawnPositionOverride?: WorldSpawnPosition,
): ResolvedWorldSpawn {
  if (spawnPositionOverride) {
    return {
      x: spawnPositionOverride.x,
      y: spawnPositionOverride.y,
      facing: spawnPositionOverride.facing,
    };
  }

  const spawn =
    findObject(map, "SpawnPoints", spawnPointName) ?? findObject(map, "Spawns", spawnPointName);
  const spawnPosition = spawn ? getObjectPosition(spawn) : FIELD_MAP.fallbackSpawn;

  return {
    x: spawnPosition.x,
    y: spawnPosition.y,
  };
}

export class WorldController {
  private remotePlayerSnapshots = new Map<string, PlayerSnapshot>();
  private unsubscribers: RoomUnsubscribe[] = [];
  private roomConnected = false;
  private pendingRoomMessages: Array<{ type: RoomMessage; payload: RoomEvent[RoomMessage] }> = [];
  private lastLocalSnapshotSyncKey = "";
  private shutdownComplete = false;
  private hud!: WorldSceneHudController;
  private tournament: WorldSceneTournamentController | null = null;
  private roomLobbyOpen = false;
  private facing: PlayerFacing = "front";
  private lastSentAt = 0;
  private lastPositionPersistedAt = 0;
  private lastSent: { x: number; y: number; facing: PlayerFacing } = {
    x: 0,
    y: 0,
    facing: "front",
  };
  private isMovementActive = false;
  private readonly encounters: WorldSceneEncounterController;
  private readonly interactions: WorldSceneInteractionsController;
  private readonly competitiveRoundsEnabled: boolean;
  private readonly serverAuthoritativeRounds: boolean;
  private readonly competitiveBattleLaunchCache = createCompetitiveBattleLaunchCache();
  private e2eBattleLaunchTracking = false;
  private e2eBattleLaunches: PokeLoungeBattleLaunchSnapshot[] = [];
  private preserveRoomForBattle = false;
  private started = false;
  private viewportSize: GameViewportDisplaySize;

  constructor(
    private readonly gameStateStore: GameStateStore,
    private readonly room: MultiplayerRoom,
    private readonly options: WorldSceneOptions,
  ) {
    this.viewportSize = options.viewportSize ?? GAME_VIEWPORT_SIZE;
    this.competitiveRoundsEnabled = options.competitiveRoundsEnabled ?? true;
    this.serverAuthoritativeRounds = options.serverAuthoritativeRounds ?? false;
    this.encounters = createWorldSceneEncounters({
      gameStateStore: this.gameStateStore,
      getPlayerPosition: () =>
        this.started ? this.options.worldRuntime.readLocalPlayer().position : null,
      getPlayerFacing: () => this.facing,
      hasTallGrassAt: tile =>
        this.options.worldModel.tallGrassCoordinates.has(`${tile.x},${tile.y}`),
      stopPlayer: () => {},
      getLocationUrl: () => new URL(window.location.href),
      getEncounterTableData: () =>
        this.options.runtimeAssets.json.get(WILD_ENCOUNTER_TABLES_JSON_ASSET[0]),
      getPokemonData: () => this.options.runtimeAssets.json.get("pokemonData"),
      persistPlayerPosition: position => {
        if (shouldPersistSoloWorldPosition(this.competitiveRoundsEnabled)) {
          this.gameStateStore.setLocalPlayerPosition(position);
        }
      },
      delay: (ms, onComplete) => window.setTimeout(onComplete, ms),
      startBattle: data =>
        this.startBattleScene({
          ...data,
          persistWorldPosition: shouldPersistSoloWorldPosition(this.competitiveRoundsEnabled),
        }),
    });
    this.interactions = createWorldSceneInteractions({
      gameStateStore: this.gameStateStore,
      getDocument: () => this.options.ownerDocument,
      keyboard: this.options.keyboard,
      getPlayerPosition: () =>
        this.started ? this.options.worldRuntime.readLocalPlayer().position : null,
      canStartSoloChallenge: () =>
        !this.competitiveRoundsEnabled &&
        this.gameStateStore.getCurrentLocalPlayer().party.some(function testItem(slot) {
          return isBattleReadyPartySlot(slot);
        }),
      startSoloChallenge: () => this.startSoloChallenge(),
      playNurseHealingEffect: (nursePosition, onComplete) =>
        this.playNurseHealingEffect(nursePosition, onComplete),
      isBattleIntroPlaying: () => this.encounters.isBattleIntroPlaying(),
      renderPartyHud: () => this.hud?.render(),
      closePokemonStatusPanel: options => this.hud?.closePokemonStatusPanel(options),
      getPartyPokemonBySlotIndex: slotIndex =>
        this.hud?.getPartyPokemonBySlotIndex(slotIndex) ?? null,
      getPokemonStatusPanelSnapshot: () => this.hud?.getPokemonStatusPanelSnapshot() ?? null,
      isPokemonStatusPanelOpen: () => this.hud?.isPokemonStatusPanelOpen() ?? false,
      worldUiStore: this.options.worldUiStore,
    });
  }

  start(data: WorldSceneCreateData = {}): void {
    if (data.completedCompetitiveBattle) {
      this.competitiveBattleLaunchCache.complete(
        data.completedCompetitiveBattle.matchId,
        data.completedCompetitiveBattle.assignmentRevision,
      );
    }
    this.shutdownComplete = false;
    this.preserveRoomForBattle = false;
    this.isMovementActive = false;
    this.lastPositionPersistedAt = 0;
    this.started = true;
    this.hud = createWorldSceneHud({
      getDocument: () => this.options.ownerDocument,
      gameStateStore: this.gameStateStore,
      competitiveRoundsEnabled: this.competitiveRoundsEnabled,
      serverAuthoritativeRounds: this.serverAuthoritativeRounds,
      roundWaitingText: getPokeLoungeCopyForUrl(new URL(window.location.href)).mobile.roundWaiting,
      addUnsubscriber: unsubscribe => this.unsubscribers.push(unsubscribe),
      canOpenPokemonStatusPanel: () => this.interactions.canOpenPokemonStatusPanel(),
      isShutdownComplete: () => this.shutdownComplete,
      worldUiStore: this.options.worldUiStore,
    });
    this.options.worldUiStore.setActionHandler(
      function callback(this: WorldController, action: WorldUiAction): void {
        if (action.type === "open-pokemon-status")
          this.hud.openPokemonStatusPanel(action.slotIndex);
        else if (action.type === "set-pokemon-status-lead")
          this.hud.setPokemonStatusLead(action.slotIndex);
        else if (action.type === "close-pokemon-status") this.hud.closePokemonStatusPanel();
        else this.interactions.handleUiAction(action);
      }.bind(this),
    );
    this.tournament = createWorldSceneTournament({
      gameStateStore: this.gameStateStore,
      isBattleIntroPlaying: () => this.encounters.isBattleIntroPlaying(),
      hasWorldPlayer: () => this.started,
      isRoomTournamentHost: () => this.isRoomTournamentHost(),
      getRemotePlayerSnapshots: () => [...this.remotePlayerSnapshots.values()],
      startTrainerBattle: (match, player, opponent) =>
        this.startTournamentBattle(match, player, opponent),
      getRoomHostPlayerId: () => this.getRoomHostPlayerId(),
      sendTournamentStarted: session => this.sendTournamentStartedMessage(session),
      sendTournamentMatchResult: payload =>
        this.sendRoomMessage("TOURNAMENT_MATCH_RESULT", payload),
      sendTournamentCompleted: payload => this.sendRoomMessage("TOURNAMENT_COMPLETED", payload),
      sendRoundScoreUpdates: payloads => {
        for (const payload of payloads) this.sendRoomMessage("ROUND_SCORE_UPDATED", payload);
      },
      createAnnouncement: (text, _fontSize, result) =>
        this.createTournamentAnnouncement(text, result),
    });
    this.applyReturnedTournamentResult(data);
    if (!this.competitiveRoundsEnabled) this.gameStateStore.resetCompetitiveSession();
    playPokeLoungeBgm("field-day");
    this.createCurrencyHud();
    this.createRankScoreHud();
    if (this.competitiveRoundsEnabled) {
      this.createRoundHud(
        Date.now(),
        readRoundDurationOverride(new URL(window.location.href)) ?? DEFAULT_PREPARATION_DURATION_MS,
      );
    }
    this.createPartyHud();
    const map = createWorldObjectLayerLookup(this.options.worldModel);
    this.interactions.createStaticNpcs(map);
    const persistedSpawnPosition =
      !this.competitiveRoundsEnabled && !data.spawnPosition
        ? resolvePersistedWorldSpawn(
            this.gameStateStore.getCurrentLocalPlayer().position,
            FIELD_MAP.key,
            {
              width: this.options.worldModel.widthInPixels,
              height: this.options.worldModel.heightInPixels,
            },
          )
        : null;
    this.createPlayer(
      map,
      data.spawnPointName ?? FIELD_MAP.defaultSpawn,
      data.spawnPosition ?? persistedSpawnPosition ?? undefined,
    );
    this.gameStateStore.setSession({
      sessionId: this.room.sessionId,
      roomId: this.room.roomId,
      connectionStatus: "connecting",
    });
    this.bindRoom();
    this.room.connect(this.createLocalPlayerSnapshot());
    this.roomConnected = true;
    this.bindLocalSnapshotSync();
    this.flushPendingRoomMessages();
    this.interactions.showInitialShortcutGuideIfNeeded();
  }

  update(time: number, delta = 1000 / 60): void {
    if (this.started && !this.shutdownComplete) this.updateWorldRuntime(time, delta);
  }

  resize(viewportSize: GameViewportDisplaySize): void {
    this.viewportSize = viewportSize;
    if (!this.started) return;
    const local = this.options.worldRuntime.readLocalPlayer();
    this.options.worldRuntime.setLocalPosition(
      { ...local.position, facing: local.facing },
      this.getViewportSize(),
    );
  }

  isActive(): boolean {
    return this.started && !this.shutdownComplete;
  }

  shutdown(): void {
    if (this.shutdownComplete) return;
    const shouldDisposeRoom = shouldDisposeRoomOnWorldShutdown(
      this.encounters.isBattleIntroPlaying(),
      this.preserveRoomForBattle,
    );
    if (this.started) this.persistLocalPlayerPositionIfChanged();
    this.started = false;
    this.shutdownComplete = true;
    if (!this.encounters.isBattleIntroPlaying() && !this.preserveRoomForBattle) {
      stopPokeLoungeBgm("field-day");
    }
    for (const unsubscribe of this.unsubscribers) unsubscribe();
    this.unsubscribers = [];
    this.hud?.destroyPartyHud();
    this.interactions.destroy();
    this.hud?.destroy();
    this.tournament?.destroy();
    this.tournament = null;
    if (this.roomLobbyOpen) {
      this.options.onRoomLobbyStateChange?.(null);
      this.roomLobbyOpen = false;
    }
    this.encounters.destroy();
    this.roomConnected = false;
    this.pendingRoomMessages = [];
    this.remotePlayerSnapshots.clear();
    this.options.worldRuntime.clear();
    this.options.worldFrameStore.clear();
    this.options.worldUiStore.clear();
    this.lastLocalSnapshotSyncKey = "";
    this.isMovementActive = false;
    if (shouldDisposeRoom) {
      this.room.dispose();
      this.gameStateStore.setSession({
        sessionId: null,
        roomId: null,
        connectionStatus: "offline",
      });
    }
  }

  startWildBattleForTest(input: WildBattleStartInput): void {
    this.encounters.startWildBattleForTest(input);
  }

  startSoloChallengeForTest(): void {
    this.startSoloChallenge();
  }

  getE2eSnapshotForTest(): WorldE2eSnapshot {
    const interactionSnapshot = this.interactions.getE2eSnapshot();
    const encounterSnapshot = this.encounters.getE2eSnapshot();
    const local = this.started ? this.options.worldRuntime.readLocalPlayer() : null;
    const camera = this.options.worldFrameStore.read().camera;
    return {
      player: local
        ? {
            x: Math.round(local.position.x),
            y: Math.round(local.position.y),
            facing: local.facing,
            displayWidth: Math.round(FIELD_MAP.player.displaySize.width),
            displayHeight: Math.round(FIELD_MAP.player.displaySize.height),
          }
        : null,
      camera: {
        zoom: 1,
        scrollX: Math.round(camera.x),
        scrollY: Math.round(camera.y),
        width: Math.round(camera.width),
        height: Math.round(camera.height),
      },
      shortcutGuideOpen: interactionSnapshot.shortcutGuideOpen,
      encounterLocked: encounterSnapshot.encounterLocked,
      battleIntroPlaying: encounterSnapshot.battleIntroPlaying,
      partyHudVisible: this.hud?.isPartyHudVisible() ?? false,
      pokemonStatusPanel: interactionSnapshot.pokemonStatusPanel,
      pcBox: interactionSnapshot.pcBox,
      nurseHealing: interactionSnapshot.nurseHealing,
      nurseMessage: interactionSnapshot.nurseMessage,
      interactionPrompt: interactionSnapshot.interactionPrompt,
      surface: interactionSnapshot.surface,
      shopKind: interactionSnapshot.shopKind,
    };
  }

  initializeEncounterTrackingForTest(position: { x: number; y: number }): void {
    this.encounters.initialize(position);
  }

  createStaticNpcsForTest(map: ObjectLayerLookup): void {
    this.interactions.createStaticNpcs(map);
  }

  createPlayerForTest(
    map: ObjectLayerLookup,
    spawnPointName: string,
    spawnPositionOverride?: WorldSpawnPosition,
  ): void {
    this.createPlayer(map, spawnPointName, spawnPositionOverride);
  }

  createCurrencyHudForTest(): void {
    this.createCurrencyHud();
  }

  createRankScoreHudForTest(): void {
    this.createRankScoreHud();
  }

  createRoundHudForTest(
    nowMs: number,
    preparationDurationMs = DEFAULT_PREPARATION_DURATION_MS,
  ): void {
    this.createRoundHud(nowMs, preparationDurationMs);
  }

  updateRoundClockForTest(nowMs: number): void {
    this.updateRoundClock(nowMs);
  }

  createPartyHudForTest(): void {
    this.createPartyHud();
  }

  handleConfirmInteractionForTest(): void {
    this.interactions.test.handleConfirmInteraction();
  }

  healAtNurseForTest(): void {
    this.setPlayerPositionForTest(FIELD_MAP.recoverySpawn);
    this.interactions.test.handleConfirmInteraction();
  }

  getNurseMessageForTest(): string {
    return this.interactions.test.getNurseMessage();
  }

  handleFieldInteractionInputForTest(): void {
    this.interactions.test.handleFieldInteractionInput();
  }

  private getViewportSize(): { width: number; height: number } {
    return resolveGameViewportSize(this.viewportSize);
  }

  openShopForTest(): void {
    this.interactions.test.openShop();
  }

  openPremiumShopForTest(): void {
    this.interactions.test.openPremiumShop();
  }

  closeShopForTest(): void {
    this.interactions.test.closeShop();
  }

  confirmShopSelectionForTest(): void {
    this.interactions.test.confirmShopSelection();
  }

  isShopOpenForTest(): boolean {
    return this.interactions.test.isShopOpen();
  }

  getShopMessageForTest(): string {
    return this.interactions.test.getShopMessage();
  }

  openInventoryForTest(): void {
    this.interactions.test.openInventory();
  }

  closeInventoryForTest(): void {
    this.interactions.test.closeInventory();
  }

  isInventoryOpenForTest(): boolean {
    return this.interactions.test.isInventoryOpen();
  }

  openPcBoxForTest(): void {
    this.interactions.test.openPcBox();
  }

  closePcBoxForTest(): void {
    this.interactions.test.closePcBox();
  }

  movePcBoxSelectionForTest(delta: number): void {
    this.interactions.test.movePcBoxSelection(delta);
  }

  togglePcBoxFocusForTest(): void {
    this.interactions.test.togglePcBoxFocus();
  }

  confirmPcBoxSelectionForTest(): void {
    this.interactions.test.confirmPcBoxSelection();
  }

  moveInventorySelectionForTest(delta: number): void {
    this.interactions.test.moveInventorySelection(delta);
  }

  confirmInventorySelectionForTest(): void {
    this.interactions.test.confirmInventorySelection();
  }

  showInitialShortcutGuideForTest(): void {
    this.interactions.test.showInitialShortcutGuide();
  }

  openShortcutGuideForTest(): void {
    this.interactions.test.openShortcutGuide();
  }

  closeShortcutGuideForTest(): void {
    this.interactions.test.closeShortcutGuide();
  }

  isShortcutGuideOpenForTest(): boolean {
    return this.interactions.test.isShortcutGuideOpen();
  }

  openDiceGambleForTest(targetNumber?: DiceGambleNumber): void {
    this.interactions.test.openDiceGamble(targetNumber);
  }

  setPlayerPositionForTest(position: { x: number; y: number; facing?: PlayerFacing }): void {
    if (!this.started) return;
    this.options.worldRuntime.setLocalPosition(position, this.getViewportSize());
    if (position.facing) this.facing = position.facing;
  }

  sendCurrentPlayerChangedMapForTest(overrides: Partial<PlayerSnapshot> = {}): boolean {
    this.sendRoomMessage("PLAYER_CHANGED_MAP", {
      ...this.createLocalPlayerSnapshot(),
      ...structuredClone(overrides),
    });
    return true;
  }

  disposeRoomForTest(): void {
    this.room.dispose();
  }

  reconnectRoomForTest(): boolean {
    this.room.connect(this.createLocalPlayerSnapshot());
    return true;
  }

  beginBattleLaunchTrackingForTest(): void {
    this.e2eBattleLaunches = [];
    this.e2eBattleLaunchTracking = true;
  }

  getBattleLaunchesForTest(): PokeLoungeBattleLaunchSnapshot[] {
    return structuredClone(this.e2eBattleLaunches);
  }

  closeDiceGambleForTest(): void {
    this.interactions.test.closeDiceGamble();
  }

  selectDiceGamblePredictionForTest(prediction: DiceGamblePrediction): void {
    this.interactions.test.selectDiceGamblePrediction(prediction);
  }

  confirmDiceGambleSelectionForTest(rolledNumber?: DiceGambleNumber): void {
    this.interactions.test.confirmDiceGambleSelection(rolledNumber);
  }

  isDiceGambleOpenForTest(): boolean {
    return this.interactions.test.isDiceGambleOpen();
  }

  getDiceGambleMessageForTest(): string {
    return this.interactions.test.getDiceGambleMessage();
  }

  private createCurrencyHud(): void {
    this.hud.createCurrencyHud();
  }

  private createRankScoreHud(): void {
    this.hud.createRankScoreHud();
  }

  private createRoundHud(
    nowMs: number,
    preparationDurationMs = DEFAULT_PREPARATION_DURATION_MS,
  ): void {
    this.hud.createRoundHud(nowMs, preparationDurationMs);
    this.tournament?.showResultPresentationIfNeeded();
  }

  private updateRoundClock(nowMs: number): void {
    this.hud.updateRound(nowMs);

    if (!this.competitiveRoundsEnabled) {
      return;
    }

    this.tournament?.update(nowMs);
  }

  private createTournamentAnnouncement(text: string, forceResult = false): { destroy(): void } {
    const result =
      forceResult ||
      this.gameStateStore.getState().round.phase === "round-result" ||
      this.gameStateStore.getState().round.phase === "game-result";
    this.options.worldUiStore.publishPresentation({
      tournamentAnnouncement: result ? null : text,
      tournamentResult: result ? text : null,
    });
    return {
      destroy: () =>
        this.options.worldUiStore.publishPresentation({
          tournamentAnnouncement: null,
          tournamentResult: null,
        }),
    };
  }

  private startTournamentBattle(
    match: TournamentMatch,
    player: LocalPlayerState,
    opponent: LocalPlayerState,
  ): void {
    const position = this.options.worldRuntime.readLocalPlayer().position;
    const x = Math.round(position.x);
    const y = Math.round(position.y);
    const facing = this.facing;

    this.preserveRoomForBattle = true;
    this.gameStateStore.healCurrentParty();

    const battleData = {
      battleKind: "trainer",
      matchId: match.matchId,
      roundIndex: this.gameStateStore.getState().round.roundIndex,
      matchIndex: match.matchNumber,
      player: healLocalPlayer(player),
      opponent: healLocalPlayer(opponent),
      persistWorldPosition: shouldPersistSoloWorldPosition(this.competitiveRoundsEnabled),
      returnToWorld: {
        mapKey: FIELD_MAP.key,
        x,
        y,
        facing,
      },
    } as const;

    this.encounters.playBattleIntroTransition(
      function callback(this: WorldController): void {
        this.startBattleScene(battleData);
      }.bind(this),
    );
  }

  private startSoloChallenge(): void {
    if (this.competitiveRoundsEnabled || this.encounters.isBattleIntroPlaying()) {
      return;
    }

    let player = this.gameStateStore.getCurrentLocalPlayer();
    const currentSlot = player.party.find(function findItem(slot) {
      return slot.slotIndex === player.activePartySlotIndex;
    });
    const battleReadySlot = isBattleReadyPartySlot(currentSlot)
      ? currentSlot
      : player.party.find(function findItem(slot) {
          return isBattleReadyPartySlot(slot);
        });

    if (!battleReadySlot) {
      return;
    }

    if (battleReadySlot.slotIndex !== player.activePartySlotIndex) {
      this.gameStateStore.setActivePartySlot(battleReadySlot.slotIndex);
      player = this.gameStateStore.getCurrentLocalPlayer();
    }

    const position = this.options.worldRuntime.readLocalPlayer().position;
    const x = Math.round(position.x);
    const y = Math.round(position.y);
    const facing = this.facing;
    const opponent: LocalPlayerState = {
      ...createDefaultLocalPlayer("solo-challenger"),
      displayName: "미러 트레이너",
      party: structuredClone(player.party),
      activePartySlotIndex: player.activePartySlotIndex,
    };

    this.encounters.playBattleIntroTransition(
      function callback(this: WorldController): void {
        this.startBattleScene({
          battleKind: "trainer",
          soloChallenge: true,
          matchId: "solo-challenge",
          roundIndex: 0,
          matchIndex: 0,
          player,
          opponent,
          persistWorldPosition: true,
          returnToWorld: {
            mapKey: FIELD_MAP.key,
            x,
            y,
            facing,
          },
        });
      }.bind(this),
    );
  }

  private applyReturnedTournamentResult(data: WorldSceneCreateData): void {
    if (isWorldTournamentBattleResult(data.tournamentResult)) {
      this.tournament?.applyReturnedResult(data.tournamentResult);
    }
  }

  private createPartyHud(): void {
    this.hud.createPartyHud();
  }

  private createPlayer(
    map: ObjectLayerLookup,
    spawnPointName: string,
    spawnPositionOverride?: WorldSpawnPosition,
  ): void {
    const spawnPosition = resolveWorldSpawn(map, spawnPointName, spawnPositionOverride);
    if (spawnPosition.facing) this.facing = spawnPosition.facing;
    this.options.worldRuntime.initialize({
      facing: this.facing,
      nowMs: performance.now(),
      position: { x: spawnPosition.x, y: spawnPosition.y },
      viewport: this.getViewportSize(),
    });
    this.lastSent = { x: spawnPosition.x, y: spawnPosition.y, facing: this.facing };
    this.encounters.initialize({ x: spawnPosition.x, y: spawnPosition.y });
  }

  private playNurseHealingEffect(
    _nursePosition: { x: number; y: number },
    onComplete: () => void,
  ): void {
    window.setTimeout(onComplete, 720);
  }

  private bindRoom(): void {
    this.unsubscribers.push(
      this.room.on(
        "CONNECTION_STATUS",
        function handleEvent(
          this: WorldController,
          { connectionStatus }: { connectionStatus: "offline" | "connecting" | "online" },
        ): void {
          this.gameStateStore.setSession({
            sessionId: this.room.sessionId,
            roomId: this.room.roomId,
            connectionStatus,
          });
        }.bind(this),
      ),
      this.room.on(
        "CURRENT_PLAYERS",
        function handleEvent(
          this: WorldController,
          { players }: { players: Record<string, PlayerSnapshot> },
        ): void {
          Object.values(players)
            .filter(
              function filterItem(this: WorldController, player: PlayerSnapshot): boolean {
                return player.sessionId !== this.room.sessionId;
              }.bind(this),
            )
            .forEach(
              function visitItem(this: WorldController, player: PlayerSnapshot): void {
                return this.upsertRemotePlayer(player, "snap");
              }.bind(this),
            );
        }.bind(this),
      ),
      this.room.on(
        "PLAYER_JOINED",
        function handleEvent(this: WorldController, player: PlayerSnapshot): void {
          if (player.sessionId !== this.room.sessionId) {
            this.upsertRemotePlayer(player, "snap");
          }
        }.bind(this),
      ),
      this.room.on(
        "PLAYER_MOVED",
        function handleEvent(this: WorldController, player: PlayerSnapshot): void {
          if (player.sessionId !== this.room.sessionId) {
            this.upsertRemotePlayer(player, "interpolate");
          }
        }.bind(this),
      ),
      this.room.on(
        "PLAYER_MOVEMENT_ENDED",
        function handleEvent(this: WorldController, player: PlayerSnapshot): void {
          if (player.sessionId !== this.room.sessionId) {
            this.upsertRemotePlayer(player, "snap");
          }
        }.bind(this),
      ),
      this.room.on(
        "PLAYER_CHANGED_MAP",
        function handleEvent(this: WorldController, player: PlayerSnapshot): void {
          if (player.sessionId !== this.room.sessionId) {
            this.upsertRemotePlayer(player, "snap");
          }
        }.bind(this),
      ),
      this.room.on(
        "PLAYER_LEFT",
        function handleEvent(this: WorldController, { sessionId }: { sessionId: string }): void {
          this.remotePlayerSnapshots.delete(sessionId);
          this.options.worldRuntime.removeRemotePlayer(sessionId);
          this.gameStateStore.removeRemotePlayer(sessionId);
        }.bind(this),
      ),
      this.room.on(
        "TOURNAMENT_STATE",
        function handleEvent(this: WorldController, payload: TournamentStateRoomPayload): void {
          const applied = this.gameStateStore.applyTournamentSnapshotFromRoom(payload, Date.now());

          if (!applied.ok) {
            return;
          }

          this.updateRoomLobby(payload);

          this.tournament?.clearPresentation();
          if (payload.roomStatus === "completed") {
            this.tournament?.showResultPresentationIfNeeded();
          }
        }.bind(this),
      ),
      this.room.on(
        "TOURNAMENT_STARTED",
        function handleEvent(this: WorldController, payload: TournamentStartedRoomPayload): void {
          if (!this.canApplyTournamentPayloadFromRoom(payload.hostPlayerId)) {
            return;
          }

          this.gameStateStore.applyTournamentStartedFromRoom(
            {
              ...payload,
              participantIds: payload.participantIds.map(
                function mapItem(this: WorldController, playerId: string): string {
                  return this.mapRoomParticipantIdForLocalStore(playerId);
                }.bind(this),
              ),
            },
            Date.now(),
          );
          this.tournament?.clearPresentation();
        }.bind(this),
      ),
      this.room.on(
        "COMPETITIVE_ASSIGNMENT",
        function handleEvent(this: WorldController, payload: CompetitiveRoomProjectionEvent): void {
          const { projection } = payload;

          if (
            this.shutdownComplete ||
            !this.started ||
            !isCompetitiveAssignmentForPlayer(payload) ||
            !this.competitiveBattleLaunchCache.begin(payload)
          ) {
            return;
          }

          this.gameStateStore.healCurrentParty();
          this.preserveRoomForBattle = true;
          this.encounters.playBattleIntroTransition(
            function callback(this: WorldController): void {
              const latest = this.competitiveBattleLaunchCache.get(
                projection.matchId,
                projection.assignmentRevision,
              );
              if (!latest) {
                return;
              }
              const position = this.options.worldRuntime.readLocalPlayer().position;
              this.startBattleScene({
                battleKind: "authoritative",
                ownPlayerId: latest.viewPlayerId ?? latest.ownPlayerId,
                spectating: latest.spectating === true,
                persistWorldPosition: shouldPersistSoloWorldPosition(this.competitiveRoundsEnabled),
                projection: latest.projection,
                returnToWorld: {
                  mapKey: FIELD_MAP.key,
                  x: Math.round(position.x),
                  y: Math.round(position.y),
                  facing: this.facing,
                },
              });
            }.bind(this),
          );
        }.bind(this),
      ),
      this.room.on(
        "COMPETITIVE_STATE",
        function handleEvent(this: WorldController, payload: CompetitiveRoomProjectionEvent): void {
          this.competitiveBattleLaunchCache.update(payload);
        }.bind(this),
      ),
      this.room.on(
        "TOURNAMENT_MATCH_RESULT",
        function handleEvent(
          this: WorldController,
          payload: TournamentMatchResultRoomPayload,
        ): void {
          if (!this.canApplyTournamentPayloadFromRoom(payload.hostPlayerId)) {
            return;
          }

          const state = this.gameStateStore.getState();
          const session = state.tournament.session;

          if (session?.roundIndex === payload.roundIndex && session.status === "in-progress") {
            this.gameStateStore.recordTournamentMatchResult(
              payload.matchId,
              this.mapRoomParticipantIdForLocalStore(payload.winnerPlayerId),
              Date.now(),
            );
          }
        }.bind(this),
      ),
      this.room.on(
        "TOURNAMENT_COMPLETED",
        function handleEvent(this: WorldController, payload: TournamentCompletedRoomPayload): void {
          if (!this.canApplyTournamentPayloadFromRoom(payload.hostPlayerId)) {
            return;
          }

          this.gameStateStore.applyTournamentCompletedFromRoom(
            {
              ...payload,
              championPlayerId: this.mapRoomParticipantIdForLocalStore(payload.championPlayerId),
              standings: payload.standings.map(
                function mapItem(
                  this: WorldController,
                  standing: { playerId: string; rank: number; score: number },
                ): { playerId: string; rank: number; score: number } {
                  return {
                    ...standing,
                    playerId: this.mapRoomParticipantIdForLocalStore(standing.playerId),
                  };
                }.bind(this),
              ),
            },
            Date.now(),
          );
          this.tournament?.clearPresentation();
          this.tournament?.showResultPresentationIfNeeded();
        }.bind(this),
      ),
      this.room.on(
        "ROUND_SCORE_UPDATED",
        function handleEvent(this: WorldController, payload: RoundScoreUpdatedRoomPayload): void {
          if (!this.canApplyTournamentPayloadFromRoom(payload.hostPlayerId)) {
            return;
          }

          this.gameStateStore.applyRoundScoreUpdatedFromRoom({
            ...payload,
            playerId: this.mapRoomParticipantIdForLocalStore(payload.playerId),
          });
        }.bind(this),
      ),
    );
  }

  private bindLocalSnapshotSync(): void {
    this.lastLocalSnapshotSyncKey = this.createLocalSnapshotSyncKey();
    this.unsubscribers.push(
      this.gameStateStore.subscribe(
        function callback(this: WorldController): void {
          if (!this.roomConnected || !this.started) {
            return;
          }

          const nextSnapshotSyncKey = this.createLocalSnapshotSyncKey();

          if (nextSnapshotSyncKey === this.lastLocalSnapshotSyncKey) {
            return;
          }

          this.lastLocalSnapshotSyncKey = nextSnapshotSyncKey;
          this.sendRoomMessage("PLAYER_CHANGED_MAP", this.createLocalPlayerSnapshot());
        }.bind(this),
      ),
    );
  }

  private createLocalSnapshotSyncKey(): string {
    const player = this.gameStateStore.getCurrentLocalPlayer();

    return JSON.stringify({
      playerId: player.playerId,
      displayName: player.displayName,
      activePartySlotIndex: player.activePartySlotIndex,
      party: player.party,
    });
  }

  private upsertRemotePlayer(snapshot: PlayerSnapshot, movement: "interpolate" | "snap"): void {
    this.remotePlayerSnapshots.set(snapshot.sessionId, clonePlayerSnapshot(snapshot));
    this.options.worldRuntime.upsertRemotePlayer(snapshot, movement, performance.now());
    this.gameStateStore.upsertRemotePlayer(toRemotePlayerState(snapshot));
  }

  private updateWorldRuntime(time: number, delta: number): void {
    let inputLocked = this.roomLobbyOpen;
    let input: WorldMovementInput = { down: false, left: false, right: false, up: false };
    if (!this.roomLobbyOpen) {
      this.updateRoundClock(Date.now());
      inputLocked = this.encounters.isBattleIntroPlaying();
      if (!inputLocked) inputLocked = this.interactions.handleInput();
      if (!inputLocked) input = this.readMovementInput();
    }
    this.options.worldRuntime.setBattleIntroPlaying(this.encounters.isBattleIntroPlaying());
    const next = this.options.worldRuntime.update({
      elapsedMs: delta,
      input,
      inputLocked,
      nowMs: time,
      viewport: this.getViewportSize(),
    });
    this.facing = next.facing;
    if (next.walking) {
      this.isMovementActive = true;
      this.maybeSendMovement(time);
      if (next.moved) this.encounters.afterMovement(next.completedTileSteps);
    } else {
      this.maybeSendMovementEnd(time);
    }
  }

  private readMovementInput(): WorldMovementInput {
    return {
      left: this.options.keyboard.isDown("ArrowLeft", "KeyA") || isVirtualGamepadPressed("left"),
      right: this.options.keyboard.isDown("ArrowRight", "KeyD") || isVirtualGamepadPressed("right"),
      up: this.options.keyboard.isDown("ArrowUp", "KeyW") || isVirtualGamepadPressed("up"),
      down: this.options.keyboard.isDown("ArrowDown", "KeyS") || isVirtualGamepadPressed("down"),
    };
  }

  private isRoomTournamentHost(): boolean {
    const projection = this.gameStateStore.getState().tournament.serverProjection;

    if (projection) {
      return projection.hostPlayerId === projection.ownPlayerId;
    }

    return this.getRoomHostSessionId() === this.room.sessionId;
  }

  private getRoomHostSessionId(): string {
    const sessionIds = [
      this.room.sessionId,
      ...Object.keys(this.gameStateStore.getState().remotePlayers),
      ...this.remotePlayerSnapshots.keys(),
    ];

    return (
      [...new Set(sessionIds)].filter(Boolean).sort(function compareItems(left, right) {
        return left.localeCompare(right, undefined, { numeric: true });
      })[0] ?? this.room.sessionId
    );
  }

  private getRoomHostPlayerId(): string | null {
    const projection = this.gameStateStore.getState().tournament.serverProjection;

    if (projection) {
      return projection.hostPlayerId === projection.ownPlayerId ? projection.hostPlayerId : null;
    }

    return this.isRoomTournamentHost() ? this.gameStateStore.getState().currentPlayerId : null;
  }

  private getExpectedRoomHostPlayerId(): string | null {
    const projection = this.gameStateStore.getState().tournament.serverProjection;

    if (projection) {
      return projection.hostPlayerId;
    }

    const hostSessionId = this.getRoomHostSessionId();

    if (hostSessionId === this.room.sessionId) {
      return this.gameStateStore.getState().currentPlayerId;
    }

    return this.remotePlayerSnapshots.get(hostSessionId)?.playerId?.trim() || hostSessionId;
  }

  private canApplyTournamentPayloadFromRoom(hostPlayerId: string | undefined): boolean {
    const expectedHostPlayerId = this.getExpectedRoomHostPlayerId();

    return Boolean(hostPlayerId && expectedHostPlayerId && hostPlayerId === expectedHostPlayerId);
  }

  private updateRoomLobby(payload: RoomEvent["TOURNAMENT_STATE"]): void {
    if (payload.roomStatus !== "waiting") {
      if (this.roomLobbyOpen) {
        this.options.onRoomLobbyStateChange?.(null);
        this.roomLobbyOpen = false;
      }
      return;
    }

    if (!this.roomLobbyOpen) {
      resetVirtualGamepad();
      this.roomLobbyOpen = true;
    }
    this.options.onRoomLobbyStateChange?.({
      projection: payload,
      onSetReady: ready => this.room.setLobbyReady(ready),
      onStart: () => this.room.startChampionship(),
      onAddAi: () => this.room.addAiParticipant(),
      onRemoveAi: aiPlayerId => this.room.removeAiParticipant(aiPlayerId),
    });
  }

  private mapRoomParticipantIdForLocalStore(playerId: string): string {
    if (playerId === this.room.sessionId) {
      return this.gameStateStore.getState().currentPlayerId;
    }

    const localPlayersById = this.gameStateStore.getState().playersById;
    const collidingRemoteSnapshot = [...this.remotePlayerSnapshots.values()].find(
      function findItem(snapshot) {
        const snapshotPlayerId = snapshot.playerId?.trim() || snapshot.sessionId;

        return snapshotPlayerId === playerId && Object.hasOwn(localPlayersById, playerId);
      },
    );

    return collidingRemoteSnapshot?.sessionId ?? playerId;
  }

  private sendTournamentStartedMessage(session: TournamentSession): void {
    const hostPlayerId = this.getRoomHostPlayerId();

    if (!hostPlayerId) {
      return;
    }

    this.sendRoomMessage("TOURNAMENT_STARTED", {
      roundIndex: session.roundIndex,
      hostPlayerId,
      participantIds: session.tournament.participants.map(function mapItem(participant) {
        return participant.playerId;
      }),
      matchIds:
        session.tournament.currentRound?.matches.map(function mapItem(match) {
          return match.matchId;
        }) ?? [],
    });
  }

  private flushPendingRoomMessages(): void {
    const pendingMessages = this.pendingRoomMessages;
    this.pendingRoomMessages = [];

    for (const { type, payload } of pendingMessages) {
      this.room.send(type, payload);
    }
  }

  private readVelocity(): { x: number; y: number; facing: PlayerFacing } {
    const input = this.readMovementInput();
    const horizontal = Number(input.right) - Number(input.left);
    const vertical = Number(input.down) - Number(input.up);
    return {
      x: horizontal,
      y: vertical,
      facing:
        Math.abs(horizontal) > Math.abs(vertical)
          ? horizontal < 0
            ? "left"
            : "right"
          : vertical < 0
            ? "back"
            : vertical > 0
              ? "front"
              : this.facing,
    };
  }

  private maybeSendMovement(time: number): void {
    if (time - this.lastSentAt < 90) {
      return;
    }

    const position = this.options.worldRuntime.readLocalPlayer().position;
    if (
      Math.abs(position.x - this.lastSent.x) < 1 &&
      Math.abs(position.y - this.lastSent.y) < 1 &&
      this.facing === this.lastSent.facing
    ) {
      return;
    }

    this.sendRoomMessage("PLAYER_MOVED", this.createLocalPlayerSnapshot());
    if (time - this.lastPositionPersistedAt >= PLAYER_POSITION_PERSIST_INTERVAL_MS) {
      this.persistLocalPlayerPositionIfChanged();
      this.lastPositionPersistedAt = time;
    }
    this.lastSentAt = time;
    this.lastSent = { x: position.x, y: position.y, facing: this.facing };
  }

  private maybeSendMovementEnd(time: number): void {
    if (time - this.lastSentAt < 90) {
      return;
    }

    this.persistLocalPlayerPositionIfChanged();
    this.lastPositionPersistedAt = time;
    if (!this.isMovementActive) {
      return;
    }

    this.sendRoomMessage("PLAYER_MOVEMENT_ENDED", this.createLocalPlayerSnapshot());
    this.lastSentAt = time;
    this.isMovementActive = false;
  }

  private persistLocalPlayerPositionIfChanged(): boolean {
    if (!shouldPersistSoloWorldPosition(this.competitiveRoundsEnabled)) {
      return false;
    }

    const position = this.options.worldRuntime.readLocalPlayer().position;
    const nextPosition = {
      mapKey: FIELD_MAP.key,
      x: Math.round(position.x),
      y: Math.round(position.y),
      facing: this.facing,
    };
    const currentPosition = this.gameStateStore.getCurrentLocalPlayer().position;

    if (!hasPlayerPositionChanged(currentPosition, nextPosition)) {
      return false;
    }

    this.gameStateStore.setLocalPlayerPosition(nextPosition);
    return true;
  }

  private createLocalPlayerSnapshot(): PlayerSnapshot {
    if (!this.started) {
      return createLocalPlayerSnapshot(
        this.room.sessionId,
        this.gameStateStore.getCurrentLocalPlayer(),
        {
          x: 0,
          y: 0,
          facing: this.facing,
        },
      );
    }

    const position = this.options.worldRuntime.readLocalPlayer().position;
    return createLocalPlayerSnapshot(
      this.room.sessionId,
      this.gameStateStore.getCurrentLocalPlayer(),
      {
        x: Math.round(position.x),
        y: Math.round(position.y),
        facing: this.facing,
      },
    );
  }

  private sendRoomMessage(type: RoomMessage, payload: RoomEvent[RoomMessage]): void {
    if (!this.roomConnected) {
      if (type === "PLAYER_MOVED") {
        this.pendingRoomMessages = this.pendingRoomMessages.filter(function filterItem(message) {
          return message.type !== "PLAYER_MOVED";
        });
      }
      this.pendingRoomMessages.push({ type, payload });
      return;
    }

    this.room.send(type, payload);
  }

  private startBattleScene(data: object): void {
    if (this.e2eBattleLaunchTracking) {
      const launch = readPokeLoungeBattleLaunchSnapshot(data);
      if (launch) this.e2eBattleLaunches.push(launch);
    }
    this.options.onStartBattle(data);
  }
}

export function hasPlayerPositionChanged(
  currentPosition: { mapKey: string; x: number; y: number; facing: PlayerFacing },
  nextPosition: { mapKey: string; x: number; y: number; facing: PlayerFacing },
): boolean {
  return (
    currentPosition.mapKey !== nextPosition.mapKey ||
    currentPosition.x !== nextPosition.x ||
    currentPosition.y !== nextPosition.y ||
    currentPosition.facing !== nextPosition.facing
  );
}

function resolveGameViewportSize(viewportSize: GameViewportDisplaySize): GameViewportDisplaySize {
  return {
    width: Math.max(1, Math.round(viewportSize.width)),
    height: Math.max(1, Math.round(viewportSize.height)),
  };
}

function createWorldObjectLayerLookup(model: WorldMapModel): ObjectLayerLookup {
  return {
    getObjectLayer(layerName) {
      if (layerName === "Npcs") {
        return {
          objects: model.npcs.map(function mapItem(npc) {
            return {
              name: npc.name,
              type: npc.role,
              x: npc.x,
              y: npc.y,
            };
          }),
        };
      }
      if (layerName === "SpawnPoints" || layerName === "Spawns") {
        return {
          objects: [...model.spawnPoints].map(function mapItem([name, position]) {
            return { name, ...position };
          }),
        };
      }
      return null;
    },
  };
}

const isBattleReadyPartySlot = (slot: LocalPlayerState["party"][number] | undefined): boolean => {
  const pokemon = slot?.pokemon;

  return Boolean(
    pokemon &&
    pokemon.status !== "fainted" &&
    (typeof pokemon.currentHp !== "number" || pokemon.currentHp > 0),
  );
};

export function createLocalPlayerSnapshot(
  sessionId: string,
  localPlayer: LocalPlayerState,
  position: { x: number; y: number; facing: PlayerFacing },
): PlayerSnapshot {
  const activePokemon = localPlayer.party.find(function findItem(slot) {
    return slot.slotIndex === localPlayer.activePartySlotIndex;
  })?.pokemon;

  return {
    sessionId,
    playerId: localPlayer.playerId,
    displayName: localPlayer.displayName,
    map: FIELD_MAP.key,
    x: position.x,
    y: position.y,
    facing: position.facing,
    activePartySlotIndex: localPlayer.activePartySlotIndex,
    party: localPlayer.party.map(function mapItem(slot) {
      return {
        slotIndex: slot.slotIndex,
        pokemon: slot.pokemon
          ? {
              ...slot.pokemon,
              moves: slot.pokemon.moves?.map(function mapItem(move) {
                return { ...move };
              }),
            }
          : null,
      };
    }),
    ...(activePokemon
      ? {
          activePokemon: {
            speciesId: activePokemon.speciesId,
            name: activePokemon.name,
            level: activePokemon.level,
          },
        }
      : {}),
  };
}

export function toRemotePlayerState(snapshot: PlayerSnapshot): RemotePlayerState {
  return {
    sessionId: snapshot.sessionId,
    playerId: snapshot.playerId ?? snapshot.sessionId,
    displayName: snapshot.displayName,
    mapKey: snapshot.map,
    x: snapshot.x,
    y: snapshot.y,
    facing: snapshot.facing,
    activePokemon: snapshot.activePokemon,
  };
}

function clonePlayerSnapshot(snapshot: PlayerSnapshot): PlayerSnapshot {
  return {
    ...snapshot,
    activePokemon: snapshot.activePokemon ? { ...snapshot.activePokemon } : undefined,
    party: cloneSnapshotParty(snapshot.party),
  };
}

function cloneSnapshotParty(
  party: PlayerSnapshot["party"] | undefined,
): NonNullable<PlayerSnapshot["party"]> {
  return (
    party?.map(function mapItem(slot) {
      return {
        slotIndex: slot.slotIndex,
        pokemon: slot.pokemon
          ? {
              ...slot.pokemon,
              moves: slot.pokemon.moves?.map(function mapItem(move) {
                return { ...move };
              }),
            }
          : null,
      };
    }) ?? []
  );
}

function findObject(
  map: ObjectLayerLookup,
  layerName: string,
  objectName: string,
): SpawnObject | null {
  return (
    map.getObjectLayer(layerName)?.objects.find(function findItem(object) {
      return object.name === objectName;
    }) ?? null
  );
}

function getObjectPosition(object: SpawnObject): { x: number; y: number } {
  return {
    x: object.x ?? 0,
    y: object.y ?? 0,
  };
}
