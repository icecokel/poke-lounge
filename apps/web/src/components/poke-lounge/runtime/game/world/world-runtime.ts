import type { PlayerFacing, PlayerSnapshot } from "../network/local-preview-room";
import {
  resolveLocalPlayerVelocity,
  resolveRemotePlayerMotion,
  shouldSnapRemotePlayer,
  type RemotePlayerMotion,
} from "../scenes/world-scene-motion";
import { FIELD_MAP } from "./field-map";
import type { WorldActorFrame, WorldFrameStore } from "./world-frame-store";
import type { WorldMapModel } from "./world-map-model";
import { moveWorldPlayer, resolveWorldCamera, type WorldPosition } from "./world-runtime-motion";
import {
  consumeCompletedTileSteps,
  createTileStepTracker,
  type CompletedTileStep,
  type TileStepTracker,
} from "./tile-steps";

export interface WorldMovementInput {
  down: boolean;
  left: boolean;
  right: boolean;
  up: boolean;
}

export interface WorldRuntimeUpdateResult {
  completedTileSteps: readonly CompletedTileStep[];
  facing: PlayerFacing;
  moved: boolean;
  position: WorldPosition;
  walking: boolean;
}

interface RuntimeRemotePlayer extends WorldActorFrame {
  animationStartedAtMs: number;
  map: string;
  motion: RemotePlayerMotion | null;
}

export class WorldRuntime {
  private battleIntroPlaying = false;
  private camera = { height: 384, width: 512, x: 0, y: 0 };
  private facing: PlayerFacing = "front";
  private frameName: string = FIELD_MAP.player.frameNames.front;
  private initialized = false;
  private localAnimationStartedAtMs = 0;
  private position: WorldPosition = { ...FIELD_MAP.fallbackSpawn };
  private readonly remotePlayers = new Map<string, RuntimeRemotePlayer>();
  private stepTracker: TileStepTracker = createTileStepTracker(this.position);
  private walking = false;

  constructor(
    private readonly model: WorldMapModel,
    private readonly frameStore: WorldFrameStore,
  ) {}

  initialize({
    facing = "front",
    nowMs = 0,
    position,
    viewport,
  }: {
    facing?: PlayerFacing;
    nowMs?: number;
    position: WorldPosition;
    viewport: { height: number; width: number };
  }): void {
    this.position = { ...position };
    this.facing = facing;
    this.walking = false;
    this.frameName = FIELD_MAP.player.frameNames[facing];
    this.localAnimationStartedAtMs = nowMs;
    this.stepTracker = createTileStepTracker(position, this.model.tileWidth);
    this.camera = { ...resolveWorldCamera(position, viewport, this.model), ...viewport };
    this.initialized = true;
    this.publish();
  }

  update({
    elapsedMs,
    input,
    inputLocked,
    nowMs,
    viewport,
  }: {
    elapsedMs: number;
    input: WorldMovementInput;
    inputLocked: boolean;
    nowMs: number;
    viewport: { height: number; width: number };
  }): WorldRuntimeUpdateResult {
    if (!this.initialized) {
      this.initialize({ position: this.position, viewport, nowMs });
    }

    const previousFacing = this.facing;
    const velocity = inputLocked
      ? { x: 0, y: 0, facing: this.facing }
      : resolveLocalPlayerVelocity(input, this.facing);
    const previousPosition = this.position;
    const nextPosition = moveWorldPlayer(previousPosition, velocity, elapsedMs, this.model);
    const moved = previousPosition.x !== nextPosition.x || previousPosition.y !== nextPosition.y;
    const walking = !inputLocked && (velocity.x !== 0 || velocity.y !== 0);
    if (walking) this.facing = velocity.facing;
    if (walking !== this.walking || this.facing !== previousFacing) {
      this.localAnimationStartedAtMs = nowMs;
    }
    this.walking = walking;
    this.position = nextPosition;
    this.frameName = getPlayerFrameName(
      this.facing,
      walking,
      nowMs - this.localAnimationStartedAtMs,
    );
    const completedTileSteps = moved
      ? consumeCompletedTileSteps(this.stepTracker, nextPosition)
      : [];
    const targetCamera = resolveWorldCamera(nextPosition, viewport, this.model);
    this.camera = {
      height: viewport.height,
      width: viewport.width,
      x: this.camera.x + (targetCamera.x - this.camera.x) * 0.12,
      y: this.camera.y + (targetCamera.y - this.camera.y) * 0.12,
    };
    this.updateRemotePlayers(nowMs);
    this.publish();
    return {
      completedTileSteps,
      facing: this.facing,
      moved,
      position: { ...nextPosition },
      walking,
    };
  }

  setLocalPosition(
    position: WorldPosition & { facing?: PlayerFacing },
    viewport: { height: number; width: number },
  ): void {
    this.position = { x: position.x, y: position.y };
    if (position.facing) this.facing = position.facing;
    this.walking = false;
    this.frameName = FIELD_MAP.player.frameNames[this.facing];
    this.stepTracker = createTileStepTracker(this.position, this.model.tileWidth);
    this.camera = { ...resolveWorldCamera(this.position, viewport, this.model), ...viewport };
    this.publish();
  }

  setBattleIntroPlaying(active: boolean): void {
    if (active === this.battleIntroPlaying) return;
    this.battleIntroPlaying = active;
    this.publish();
  }

  upsertRemotePlayer(
    snapshot: PlayerSnapshot,
    movement: "interpolate" | "snap",
    nowMs: number,
  ): void {
    const existing = this.remotePlayers.get(snapshot.sessionId);
    const displayName =
      snapshot.displayName?.trim() || snapshot.playerId?.trim() || snapshot.sessionId;
    const shouldSnap =
      movement === "snap" ||
      !existing ||
      existing.map !== snapshot.map ||
      shouldSnapRemotePlayer(existing, snapshot);
    if (!existing || shouldSnap) {
      this.remotePlayers.set(snapshot.sessionId, {
        activity: snapshot.activity,
        animationStartedAtMs: nowMs,
        controller: snapshot.controller,
        displayName,
        facing: snapshot.facing,
        frameName: FIELD_MAP.player.frameNames[snapshot.facing],
        map: snapshot.map,
        motion: null,
        sessionId: snapshot.sessionId,
        walking: false,
        x: snapshot.x,
        y: snapshot.y,
      });
    } else {
      existing.animationStartedAtMs = nowMs;
      existing.activity = snapshot.activity;
      existing.controller = snapshot.controller;
      existing.displayName = displayName;
      existing.facing = snapshot.facing;
      existing.map = snapshot.map;
      existing.motion = {
        fromX: existing.x,
        fromY: existing.y,
        targetX: snapshot.x,
        targetY: snapshot.y,
        startedAtMs: nowMs,
      };
      existing.walking = true;
    }
    this.publish();
  }

  removeRemotePlayer(sessionId: string): void {
    if (this.remotePlayers.delete(sessionId)) this.publish();
  }

  clear(): void {
    this.remotePlayers.clear();
    this.battleIntroPlaying = false;
    this.frameStore.clear();
  }

  readLocalPlayer(): { facing: PlayerFacing; position: WorldPosition } {
    return { facing: this.facing, position: { ...this.position } };
  }

  private updateRemotePlayers(nowMs: number): void {
    for (const remote of this.remotePlayers.values()) {
      if (!remote.motion) continue;
      const next = resolveRemotePlayerMotion(remote.motion, nowMs);
      remote.x = next.x;
      remote.y = next.y;
      remote.frameName = getPlayerFrameName(
        remote.facing,
        !next.complete,
        nowMs - remote.animationStartedAtMs,
      );
      remote.walking = !next.complete;
      if (next.complete) remote.motion = null;
    }
  }

  private publish(): void {
    this.frameStore.publish({
      battleIntroPlaying: this.battleIntroPlaying,
      camera: { ...this.camera },
      localPlayer: {
        facing: this.facing,
        frameName: this.frameName,
        walking: this.walking,
        ...this.position,
      },
      remotePlayers: [...this.remotePlayers.values()],
    });
  }
}

export function createWorldRuntime(
  model: WorldMapModel,
  frameStore: WorldFrameStore,
): WorldRuntime {
  return new WorldRuntime(model, frameStore);
}

function getPlayerFrameName(
  facing: PlayerFacing,
  walking: boolean,
  animationElapsedMs: number,
): string {
  if (!walking) return FIELD_MAP.player.frameNames[facing];
  const frameIndex = Math.floor(Math.max(0, animationElapsedMs) / 100) % 4;
  return `${FIELD_MAP.player.frameNames[facing]}-walk.${String(frameIndex).padStart(3, "0")}`;
}
