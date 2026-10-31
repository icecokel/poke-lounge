import type { PlayerFacing } from "@/components/poke-lounge/runtime/game/network/local-preview-room";
import type { FieldChallengerOption } from "@/components/poke-lounge/runtime/game/scenes/world-scene";
import { FIELD_MAP } from "@/components/poke-lounge/runtime/game/world/field-map";
import type { WorldFrameStore } from "@/components/poke-lounge/runtime/game/world/world-frame-store";
import type {
  WorldMapModel,
  WorldMapNpcModel,
} from "@/components/poke-lounge/runtime/game/world/world-map-model";
import type { WorldRuntime } from "@/components/poke-lounge/runtime/game/world/world-runtime";
import { getPlayerHitbox } from "@/components/poke-lounge/runtime/game/world/world-runtime-motion";
import type { LeagueBadgeNpc } from "@poke-lounge/battle/league/contract";
import type { StatusView } from "../contract";
import { TEST_BUILD } from "../test-mode/engine";
import { GYM_NPC_POSITION, GYM_SPRITES, GYM_WALK_FRAMES, gymFrameUrl } from "./gym-npc";

export interface GymRoamTiming {
  firstHiddenMs: [number, number];
  hiddenMs: [number, number];
  visibleMs: number;
  leaveGraceMs: number;
  stepPxPerSec: number;
  frameMs: number;
  legTiles: [number, number];
  idleMs: [number, number];
  leashTiles: number;
  minSpawnTiles: number;
}
export const GYM_ROAM_TIMING: GymRoamTiming = {
  firstHiddenMs: [30_000, 90_000],
  hiddenMs: [90_000, 180_000],
  visibleMs: 180_000,
  leaveGraceMs: 30_000,
  stepPxPerSec: 64,
  frameMs: 150,
  legTiles: [1, 3],
  idleMs: [800, 2_000],
  leashTiles: 8,
  minSpawnTiles: 6,
};
export const GYM_ROAM_TEST_TIMING: GymRoamTiming = {
  ...GYM_ROAM_TIMING,
  firstHiddenMs: [3_000, 6_000],
  hiddenMs: [10_000, 20_000],
  visibleMs: 60_000,
};
export function gymRoamTiming(status: StatusView): GymRoamTiming {
  return TEST_BUILD && status.test ? GYM_ROAM_TEST_TIMING : GYM_ROAM_TIMING;
}

type Position = { x: number; y: number };
type Tile = { tx: number; ty: number };
type AttachedField = { world: WorldRuntime; frame: WorldFrameStore; mount: HTMLElement };
export interface GymRoam {
  readonly npc: WorldMapNpcModel;
  readonly challenger: FieldChallengerOption;
  attach(field: AttachedField): () => void;
  setFieldActive(active: boolean): void;
  endAppearance(): void;
  subscribe(listener: () => void): () => void;
  getSnapshot(): { visible: boolean; appearance: number };
}
const PARKED = -1000;
const DIRECTIONS: Array<Tile & { facing: PlayerFacing }> = [
  { tx: 0, ty: -1, facing: "back" },
  { tx: 0, ty: 1, facing: "front" },
  { tx: -1, ty: 0, facing: "left" },
  { tx: 1, ty: 0, facing: "right" },
];
const tileKey = ({ tx, ty }: Tile) => `${tx},${ty}`;
const randomMs = ([min, max]: [number, number]) => min + Math.random() * (max - min);
const choose = <T>(values: readonly T[]): T => values[Math.floor(Math.random() * values.length)]!;

export function computeGymWalkableTiles(model: WorldMapModel): Tile[] {
  const toTile = (point: Position): Tile => ({
    tx: Math.floor(point.x / model.tileWidth),
    ty: Math.floor(point.y / model.tileHeight),
  });
  const inMap = ({ tx, ty }: Tile) => tx >= 0 && ty >= 0 && tx < model.width && ty < model.height;
  const start = toTile(FIELD_MAP.fallbackSpawn);
  const reachable = new Set<string>();
  const queue: Tile[] = [];
  if (inMap(start) && !model.collisionBounds.has(tileKey(start))) {
    reachable.add(tileKey(start));
    queue.push(start);
  }
  for (let i = 0; i < queue.length; i++) {
    const tile = queue[i]!;
    for (const direction of DIRECTIONS) {
      const next = { tx: tile.tx + direction.tx, ty: tile.ty + direction.ty };
      const key = tileKey(next);
      if (!inMap(next) || reachable.has(key) || model.collisionBounds.has(key)) continue;
      reachable.add(key);
      queue.push(next);
    }
  }
  const above = new Set(model.layers[2]?.tiles.map(tile => `${tile.x},${tile.y}`));
  const reserved = [
    ...model.npcs.filter(npc => npc.name !== "soloChallenger"),
    ...model.spawnPoints.values(),
    FIELD_MAP.recoverySpawn,
  ].map(toTile);
  const tiles: Tile[] = [];
  for (let ty = 1; ty < model.height - 1; ty++) {
    for (let tx = 1; tx < model.width - 1; tx++) {
      const key = `${tx},${ty}`;
      if (
        !reachable.has(key) ||
        model.collisionBounds.has(key) ||
        model.tallGrassCoordinates.has(key) ||
        above.has(key) ||
        above.has(`${tx},${ty - 1}`) ||
        reserved.some(tile => Math.max(Math.abs(tile.tx - tx), Math.abs(tile.ty - ty)) < 2)
      )
        continue;
      tiles.push({ tx, ty });
    }
  }
  return tiles;
}

export function createGymRoam({
  model,
  gym,
  timing,
  hint,
  onInteract,
}: {
  model: WorldMapModel;
  gym: LeagueBadgeNpc;
  timing: GymRoamTiming;
  hint: string;
  onInteract(): void;
}): GymRoam {
  const tiles = computeGymWalkableTiles(model);
  const walkable = new Set(tiles.map(tileKey));
  const fallback = tiles.length === 0;
  const npc: WorldMapNpcModel = {
    name: "soloChallenger",
    role: "gymLeader",
    displayName: gym.displayName,
    imageUrl: GYM_SPRITES[gym.npcKey]!,
    ...(fallback ? GYM_NPC_POSITION : { x: PARKED, y: PARKED }),
  };
  let snapshot = { visible: fallback, appearance: fallback ? 1 : 0 };
  const listeners = new Set<() => void>();
  let attached: AttachedField | null = null;
  let active = true;
  let frameId: number | null = null;
  let previousMs: number | null = null;
  let hiddenUntilMs: number | null = null;
  let visibleMs = 0;
  let idleMs = 0;
  let animationMs = 0;
  let facing: PlayerFacing = "front";
  let origin: Tile = { tx: 0, ty: 0 };
  let tile = origin;
  let walk: { target: Tile; direction: (typeof DIRECTIONS)[number]; remaining: number } | null =
    null;
  let armed = true;
  let touching = false;
  let warned = false;

  const tilePosition = ({ tx, ty }: Tile): Position => ({
    x: tx * model.tileWidth + model.tileWidth / 2,
    y: ty * model.tileHeight + model.tileHeight - 2,
  });
  function publish(visible: boolean) {
    snapshot = { visible, appearance: snapshot.appearance + (visible ? 1 : 0) };
    listeners.forEach(listener => listener());
  }
  function paint() {
    const image = attached?.mount.querySelector<HTMLImageElement>(
      'img[data-world-npc="soloChallenger"]',
    );
    if (!image) return;
    const { displaySize } = FIELD_MAP.npcs.soloChallenger;
    image.style.left = `${npc.x - displaySize.width / 2}px`;
    image.style.top = `${npc.y - displaySize.height}px`;
    if (image.getAttribute("src") !== npc.imageUrl) image.setAttribute("src", npc.imageUrl);
  }
  function refreshContact() {
    touching = false;
    if (!attached || !active || !snapshot.visible) return;
    const player = attached.frame.read().localPlayer;
    const playerBox = getPlayerHitbox(player);
    const npcBox = gymHitbox(npc);
    if (!overlapsExpanded(playerBox, npcBox, 8)) armed = true;
    const dx = npc.x - (playerBox.left + playerBox.right) / 2;
    const dy = (npcBox.top + npcBox.bottom) / 2 - (playerBox.top + playerBox.bottom) / 2;
    const toward =
      player.facing === "left"
        ? dx < 0
        : player.facing === "right"
          ? dx > 0
          : player.facing === "back"
            ? dy < 0
            : dy > 0;
    touching = player.walking && toward && overlapsExpanded(playerBox, npcBox, 4);
  }
  function playerBlocks(position: Position): boolean {
    return (
      !!attached &&
      overlapsExpanded(
        getPlayerHitbox(attached.world.readLocalPlayer().position),
        gymHitbox(position),
        6,
      )
    );
  }
  function canStep(next: Tile): boolean {
    return (
      walkable.has(tileKey(next)) &&
      Math.max(Math.abs(next.tx - origin.tx), Math.abs(next.ty - origin.ty)) <= timing.leashTiles &&
      !playerBlocks(tilePosition(next))
    );
  }
  function rest() {
    walk = null;
    idleMs = randomMs(timing.idleMs);
    animationMs = 0;
  }
  function move(elapsedMs: number) {
    let moving = false;
    if (!walk) {
      idleMs -= elapsedMs;
      if (idleMs <= 0) {
        const choices = DIRECTIONS.filter(direction =>
          canStep({ tx: tile.tx + direction.tx, ty: tile.ty + direction.ty }),
        );
        if (choices.length) {
          const direction = choose(choices);
          facing = direction.facing;
          walk = {
            target: { tx: tile.tx + direction.tx, ty: tile.ty + direction.ty },
            direction,
            remaining:
              timing.legTiles[0] +
              Math.floor(Math.random() * (timing.legTiles[1] - timing.legTiles[0] + 1)),
          };
        } else rest();
      }
    }
    if (walk) {
      const target = tilePosition(walk.target);
      const distance = Math.hypot(target.x - npc.x, target.y - npc.y);
      const step = Math.min(distance, (timing.stepPxPerSec * elapsedMs) / 1000);
      const next =
        step >= distance
          ? target
          : {
              x: npc.x + walk.direction.tx * step,
              y: npc.y + walk.direction.ty * step,
            };
      if (!playerBlocks(next)) {
        npc.x = next.x;
        npc.y = next.y;
        moving = step > 0;
        animationMs += elapsedMs;
        if (step >= distance) {
          tile = walk.target;
          const nextTile = { tx: tile.tx + walk.direction.tx, ty: tile.ty + walk.direction.ty };
          if (--walk.remaining > 0 && canStep(nextTile)) walk.target = nextTile;
          else rest();
        }
      }
    }
    const frames = GYM_WALK_FRAMES[facing];
    npc.imageUrl = gymFrameUrl(
      gym.npcKey,
      frames[moving ? Math.floor(animationMs / timing.frameMs) % 4 : 0]!,
    );
  }
  function appear() {
    if (!attached) return;
    const player = attached.world.readLocalPlayer().position;
    const camera = attached.frame.read().camera;
    const distant = tiles.filter(tile => {
      const point = tilePosition(tile);
      return (
        Math.hypot(point.x - player.x, point.y - player.y) >= timing.minSpawnTiles * model.tileWidth
      );
    });
    const offscreen = distant.filter(tile => {
      const point = tilePosition(tile);
      return (
        point.x < camera.x - model.tileWidth ||
        point.x > camera.x + camera.width + model.tileWidth ||
        point.y < camera.y - model.tileHeight ||
        point.y > camera.y + camera.height + model.tileHeight
      );
    });
    origin = tile = choose(offscreen.length ? offscreen : distant.length ? distant : tiles);
    Object.assign(npc, tilePosition(tile));
    npc.imageUrl = GYM_SPRITES[gym.npcKey]!;
    facing = "front";
    visibleMs = 0;
    armed = true;
    rest();
    publish(true);
  }
  function endAppearance() {
    if (fallback) return;
    npc.x = npc.y = PARKED;
    touching = false;
    armed = false;
    walk = null;
    hiddenUntilMs = performance.now() + randomMs(timing.hiddenMs);
    if (snapshot.visible) publish(false);
    paint();
  }
  function tick(nowMs: number) {
    frameId = null;
    if (!attached || !active) return;
    const elapsedMs = previousMs === null ? 0 : Math.min(100, Math.max(0, nowMs - previousMs));
    previousMs = nowMs;
    if (!snapshot.visible) {
      if (hiddenUntilMs !== null && nowMs >= hiddenUntilMs) appear();
    } else if (!fallback) {
      visibleMs += elapsedMs;
      const player = attached.world.readLocalPlayer().position;
      if (
        visibleMs >= timing.visibleMs &&
        (Math.hypot(npc.x - player.x, npc.y - player.y) > 96 ||
          visibleMs - timing.visibleMs >= timing.leaveGraceMs)
      )
        endAppearance();
      else move(elapsedMs);
    }
    refreshContact();
    paint();
    schedule();
  }
  function schedule() {
    if (attached && active && frameId === null) frameId = requestAnimationFrame(tick);
  }
  function pause() {
    if (frameId !== null) cancelAnimationFrame(frameId);
    frameId = null;
    previousMs = null;
    touching = false;
  }
  return {
    npc,
    challenger: {
      hint,
      onInteract() {
        armed = false;
        touching = false;
        onInteract();
      },
      getPosition: () => (snapshot.visible ? { x: npc.x, y: npc.y } : null),
      consumeContact() {
        refreshContact();
        if (!armed || !touching) return false;
        armed = false;
        return true;
      },
    },
    attach(field) {
      attached = field;
      if (fallback && !warned) {
        console.warn("league.gym_roam_fallback");
        warned = true;
      }
      hiddenUntilMs ??= performance.now() + randomMs(timing.firstHiddenMs);
      paint();
      schedule();
      return () => {
        pause();
        armed = false;
        attached = null;
      };
    },
    setFieldActive(value) {
      active = value;
      if (active) schedule();
      else pause();
    },
    endAppearance,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => snapshot,
  };
}

function gymHitbox(position: Position) {
  const { displaySize, hitbox } = FIELD_MAP.npcs.soloChallenger;
  const scaleX = displaySize.width / 32;
  const scaleY = displaySize.height / 32;
  const left = position.x - displaySize.width / 2 + hitbox.offsetX * scaleX;
  const top = position.y - displaySize.height + hitbox.offsetY * scaleY;
  return { left, top, right: left + hitbox.width * scaleX, bottom: top + hitbox.height * scaleY };
}
function overlapsExpanded(
  player: ReturnType<typeof getPlayerHitbox>,
  npc: ReturnType<typeof gymHitbox>,
  padding: number,
) {
  return (
    player.left - padding < npc.right &&
    player.right + padding > npc.left &&
    player.top - padding < npc.bottom &&
    player.bottom + padding > npc.top
  );
}
