import type { PlayerFacing } from "../network/local-preview-room";
import { FIELD_MAP } from "./field-map";

export interface WorldActorFrame {
  activity?: "idle" | "moving" | "hunting" | "recovering" | "tournament";
  controller?: "human" | "ai";
  displayName: string;
  facing: PlayerFacing;
  frameName: string;
  sessionId: string;
  walking: boolean;
  x: number;
  y: number;
}

export interface WorldFrame {
  battleIntroPlaying: boolean;
  camera: { height: number; width: number; x: number; y: number };
  localPlayer: Omit<WorldActorFrame, "displayName" | "sessionId">;
  remotePlayers: readonly WorldActorFrame[];
}

export interface WorldFrameStore {
  clear(): void;
  getActorsRevision(): number;
  publish(frame: WorldFrame): void;
  read(): WorldFrame;
  subscribe(listener: () => void): () => void;
}

export function createWorldFrameStore(): WorldFrameStore {
  const listeners = new Set<() => void>();
  let actorsRevision = 0;
  let actorsKey = "";
  let frame: WorldFrame = {
    battleIntroPlaying: false,
    camera: { height: 384, width: 512, x: 0, y: 0 },
    localPlayer: {
      facing: "front",
      frameName: FIELD_MAP.player.frameNames.front,
      walking: false,
      ...FIELD_MAP.fallbackSpawn,
    },
    remotePlayers: [],
  };

  const publishActorsIfChanged = (remotePlayers: readonly WorldActorFrame[]) => {
    const nextActorsKey = remotePlayers
      .map(function mapItem(player) {
        return `${player.sessionId}\u0000${player.displayName}\u0000${player.activity ?? ""}`;
      })
      .sort()
      .join("\u0001");
    if (nextActorsKey === actorsKey) return;
    actorsKey = nextActorsKey;
    actorsRevision += 1;
    listeners.forEach(function visitItem(listener) {
      return listener();
    });
  };

  return {
    clear() {
      frame = { ...frame, battleIntroPlaying: false, remotePlayers: [] };
      publishActorsIfChanged(frame.remotePlayers);
    },
    getActorsRevision: () => actorsRevision,
    publish(nextFrame) {
      frame = nextFrame;
      publishActorsIfChanged(nextFrame.remotePlayers);
    },
    read: () => frame,
    subscribe(listener) {
      listeners.add(listener);
      return function callback() {
        return listeners.delete(listener);
      };
    },
  };
}
