"use client";

import { forwardRef, useEffect, useRef, useSyncExternalStore, type RefCallback } from "react";
import type { PokeLoungeCopy } from "../../../poke-lounge-copy";
import {
  getAiActivityLabel,
  isChampionshipFinished,
} from "@/features/poke-lounge/presentation/world/ai-activity-view";
import { BATTLE_INTRO_TIMING, createBattleIntroStripes } from "../battle/battle-intro";
import { localizeTrainerName } from "../i18n/runtime-game-localization";
import { RoundStartController } from "../round/round-start-controller";
import type { GameStateStore } from "../state/game-state-store";
import { FIELD_MAP } from "./field-map";
import type { WorldFrameStore } from "./world-frame-store";
import {
  getWorldTileSourcePosition,
  type WorldMapLayerModel,
  type WorldMapModel,
  type WorldMapNpcModel,
  type WorldMapTile,
  type WorldPlayerAtlasModel,
} from "./world-map-model";
import { WorldUiLayer } from "./world-ui";
import type { WorldUiStore } from "./world-ui-store";

export function WorldScreen({
  atlas,
  competitiveRoundsEnabled,
  onPreparationReady,
  frameStore,
  gameStateStore,
  model,
  copy,
  desktop,
  onResultLobby,
  onResultNewGame,
  uiStore,
}: {
  atlas: WorldPlayerAtlasModel;
  competitiveRoundsEnabled: boolean;
  onPreparationReady?: (roundIndex: number) => Promise<void>;
  frameStore: WorldFrameStore;
  gameStateStore: GameStateStore;
  model: WorldMapModel;
  copy: PokeLoungeCopy;
  desktop: boolean;
  onResultLobby(): void;
  onResultNewGame(): void;
  uiStore: WorldUiStore;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const localPlayerRef = useRef<HTMLDivElement>(null);
  const remotePlayerRefs = useRef(new Map<string, HTMLDivElement>());
  const transitionRef = useRef<HTMLDivElement>(null);
  const transitionStripeRefs = useRef(new Map<number, HTMLDivElement>());
  const transitionStartedAtRef = useRef<number | null>(null);
  useSyncExternalStore(
    frameStore.subscribe,
    frameStore.getActorsRevision,
    frameStore.getActorsRevision,
  );
  const remotePlayers = frameStore.read().remotePlayers;
  const completed = useSyncExternalStore(
    gameStateStore.subscribe,
    () => isChampionshipFinished(gameStateStore.getState()),
    () => isChampionshipFinished(gameStateStore.getState()),
  );

  useEffect(
    function runEffect() {
      let animationFrame = 0;
      const renderFrame = (now: number) => {
        const viewport = viewportRef.current;
        const stage = stageRef.current;
        const map = mapRef.current;
        const localPlayer = localPlayerRef.current;
        const frame = frameStore.read();
        if (viewport && stage && map && localPlayer) {
          const scale = Math.min(
            viewport.clientWidth / frame.camera.width,
            viewport.clientHeight / frame.camera.height,
          );
          stage.style.width = `${frame.camera.width}px`;
          stage.style.height = `${frame.camera.height}px`;
          stage.style.transform = `scale(${scale})`;
          map.style.transform = `translate3d(${-frame.camera.x}px, ${-frame.camera.y}px, 0)`;
          updatePlayerStyle(localPlayer, frame.localPlayer, atlas);
          for (const remote of frame.remotePlayers) {
            const node = remotePlayerRefs.current.get(remote.sessionId);
            if (node) updatePlayerStyle(node, remote, atlas);
          }
        }
        renderBattleTransition(
          now,
          frame.battleIntroPlaying,
          transitionRef.current,
          transitionStripeRefs.current,
          transitionStartedAtRef,
        );
        animationFrame = requestAnimationFrame(renderFrame);
      };
      animationFrame = requestAnimationFrame(renderFrame);
      return function callback() {
        return cancelAnimationFrame(animationFrame);
      };
    },
    [atlas, frameStore],
  );

  return (
    <div
      className="pointer-events-none absolute inset-0 z-30 overflow-hidden bg-[var(--rom-screen-background)] [image-rendering:pixelated]"
      data-poke-lounge-world-screen="true"
    >
      <WorldViewport ref={viewportRef} aria-hidden="true">
        <div ref={stageRef} className="absolute inset-0 origin-top-left">
          <WorldMap ref={mapRef} model={model}>
            <WorldTileLayer model={model} layer={model.layers[0]} depth={0} />
            <WorldTileLayer model={model} layer={model.layers[1]} depth={10} />
            <TallGrassBaseLayer model={model} />
            <WorldActorLayer>
              {model.npcs.map(function mapItem(npc) {
                return <NpcActor key={npc.name} npc={npc} />;
              })}
              <LocalPlayerActor ref={localPlayerRef} />
              {remotePlayers.map(function mapItem(player) {
                return (
                  <RemotePlayerActor
                    key={player.sessionId}
                    ref={registerMapRef(remotePlayerRefs.current, player.sessionId)}
                    displayName={
                      player.controller === "ai"
                        ? `${localizeTrainerName(player.displayName, copy.locale)} · ${getAiActivityLabel(player.activity, completed, copy)}`
                        : localizeTrainerName(player.displayName, copy.locale)
                    }
                  />
                );
              })}
            </WorldActorLayer>
            <TallGrassForegroundLayer model={model} />
            <WorldTileLayer model={model} layer={model.layers[2]} depth={40} />
          </WorldMap>
          <WorldEffectLayer>
            <WorldBattleTransition
              ref={transitionRef}
              viewport={frameStore.read().camera}
              registerStripe={function handleEvent(index, node) {
                if (node) transitionStripeRefs.current.set(index, node);
                else transitionStripeRefs.current.delete(index);
              }}
            />
          </WorldEffectLayer>
        </div>
      </WorldViewport>
      {competitiveRoundsEnabled ? (
        <RoundStartController
          copy={copy}
          gameStateStore={gameStateStore}
          frameStore={frameStore}
          onPreparationReady={onPreparationReady}
        />
      ) : null}
      <WorldUiLayer
        copy={copy}
        competitiveRoundsEnabled={competitiveRoundsEnabled}
        desktop={desktop}
        gameStateStore={gameStateStore}
        onResultLobby={onResultLobby}
        onResultNewGame={onResultNewGame}
        uiStore={uiStore}
      />
    </div>
  );
}

export const WorldViewport = forwardRef<
  HTMLDivElement,
  { children: React.ReactNode; "aria-hidden"?: "true" }
>(function WorldViewport({ children, ...props }, ref) {
  return (
    <div ref={ref} className="absolute inset-0 overflow-hidden" {...props}>
      {children}
    </div>
  );
});

export const WorldMap = forwardRef<
  HTMLDivElement,
  { children: React.ReactNode; model: WorldMapModel }
>(function WorldMap({ children, model }, ref) {
  return (
    <div
      ref={ref}
      className="absolute inset-auto [will-change:transform]"
      style={{ width: model.widthInPixels, height: model.heightInPixels }}
    >
      {children}
    </div>
  );
});

export function WorldTileLayer({
  depth,
  layer,
  model,
}: {
  depth: number;
  layer: WorldMapLayerModel | undefined;
  model: WorldMapModel;
}) {
  if (!layer) return null;
  return (
    <div
      className="absolute inset-auto size-full"
      data-world-layer={layer.name}
      style={{ zIndex: depth }}
    >
      {layer.tiles.map(function mapItem(tile) {
        return <WorldTile key={tile.key} model={model} tile={tile} />;
      })}
    </div>
  );
}

export function TallGrassBaseLayer({ model }: { model: WorldMapModel }) {
  return <WorldGrassLayer depth={15} model={model} name="Tall Grass" tiles={model.tallGrassBase} />;
}

export function TallGrassForegroundLayer({ model }: { model: WorldMapModel }) {
  return (
    <WorldGrassLayer
      depth={30}
      model={model}
      name="Tall Grass Foreground"
      tiles={model.tallGrassForeground}
    />
  );
}

function WorldGrassLayer({
  depth,
  model,
  name,
  tiles,
}: {
  depth: number;
  model: WorldMapModel;
  name: string;
  tiles: WorldMapTile[];
}) {
  return (
    <div
      className="absolute inset-auto size-full"
      data-world-layer={name}
      style={{ zIndex: depth }}
    >
      {tiles.map(function mapItem(tile) {
        return <WorldTile key={tile.key} model={model} tile={tile} />;
      })}
    </div>
  );
}

function WorldTile({ model, tile }: { model: WorldMapModel; tile: WorldMapTile }) {
  const source = getWorldTileSourcePosition(model, tile.gid);
  return (
    <span
      className="absolute block bg-no-repeat [image-rendering:pixelated]"
      style={{
        backgroundImage: `url(${model.tileset.imageUrl})`,
        backgroundPosition: `${-source.x}px ${-source.y}px`,
        height: model.tileHeight,
        left: tile.x * model.tileWidth,
        top: tile.y * model.tileHeight,
        width: model.tileWidth,
      }}
    />
  );
}

export function WorldActorLayer({ children }: { children: React.ReactNode }) {
  return <div className="absolute inset-auto z-20 size-full">{children}</div>;
}

export const LocalPlayerActor = forwardRef<HTMLDivElement>(function LocalPlayerActor(_, ref) {
  return (
    <div
      ref={ref}
      className="absolute z-20 block size-10 bg-no-repeat [image-rendering:pixelated] [will-change:transform,background-position]"
      data-world-local-player="true"
    />
  );
});

export const RemotePlayerActor = forwardRef<HTMLDivElement, { displayName: string }>(
  function RemotePlayerActor({ displayName }, ref) {
    return (
      <div
        ref={ref}
        className="absolute z-[19] block size-10 bg-no-repeat [image-rendering:pixelated] [will-change:transform,background-position] [filter:sepia(0.18)_saturate(1.45)_hue-rotate(174deg)_brightness(1.08)]"
      >
        <PlayerNameLabel>{displayName}</PlayerNameLabel>
      </div>
    );
  },
);

export function PlayerNameLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="absolute bottom-[38px] left-1/2 -translate-x-1/2 px-[3px] py-px font-mono text-[8px] leading-none font-bold whitespace-nowrap text-[#f8fbf0] [text-shadow:-1px_-1px_#17231c,1px_-1px_#17231c,-1px_1px_#17231c,1px_1px_#17231c]">
      {children}
    </span>
  );
}

export function NpcActor({ npc }: { npc: WorldMapNpcModel }) {
  const config = FIELD_MAP.npcs[npc.name];
  return (
    // Sprite sheets must retain their original pixel dimensions and nearest-neighbor rendering.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      alt=""
      className="absolute z-[18] block object-fill [image-rendering:pixelated]"
      data-world-npc={npc.name}
      draggable={false}
      src={npc.imageUrl}
      style={{
        height: config.displaySize.height,
        left: npc.x - config.displaySize.width / 2,
        top: npc.y - config.displaySize.height,
        width: config.displaySize.width,
      }}
    />
  );
}

export function WorldEffectLayer({ children }: { children: React.ReactNode }) {
  return <div className="absolute inset-0 z-[30000] overflow-hidden">{children}</div>;
}

export const WorldBattleTransition = forwardRef<
  HTMLDivElement,
  {
    registerStripe(index: number, node: HTMLDivElement | null): void;
    viewport: { height: number; width: number };
  }
>(function WorldBattleTransition({ registerStripe, viewport }, ref) {
  return (
    <div
      ref={ref}
      className="absolute inset-0 overflow-hidden bg-[#101820] opacity-0"
      data-world-battle-transition="true"
    >
      {createBattleIntroStripes({
        width: viewport.width,
        height: viewport.height,
        stripeCount: 8,
      }).map(function mapItem(stripe, index) {
        return (
          <div
            key={index}
            ref={function handleEvent(node) {
              return registerStripe(index, node);
            }}
            className="absolute bg-[#101820] [will-change:transform]"
            style={{
              height: stripe.height,
              left: stripe.x,
              top: stripe.y,
              width: stripe.width,
            }}
          />
        );
      })}
    </div>
  );
});

function updatePlayerStyle(
  node: HTMLDivElement,
  frame: { frameName: string; x: number; y: number },
  atlas: WorldPlayerAtlasModel,
) {
  const source =
    atlas.frames.get(frame.frameName) ?? atlas.frames.get(FIELD_MAP.player.frameNames.front);
  if (!source) return;
  const scaleX = FIELD_MAP.player.displaySize.width / source.width;
  const scaleY = FIELD_MAP.player.displaySize.height / source.height;
  node.style.backgroundImage = `url(${atlas.imageUrl})`;
  node.style.backgroundPosition = `${-source.x * scaleX}px ${-source.y * scaleY}px`;
  node.style.backgroundSize = `${atlas.width * scaleX}px ${atlas.height * scaleY}px`;
  node.style.transform = `translate3d(${frame.x - FIELD_MAP.player.displaySize.width / 2}px, ${frame.y - FIELD_MAP.player.displaySize.height / 2}px, 0)`;
}

function registerMapRef(
  refs: Map<string, HTMLDivElement>,
  key: string,
): RefCallback<HTMLDivElement> {
  return function callback(node) {
    if (node) refs.set(key, node);
    else refs.delete(key);
  };
}

function renderBattleTransition(
  now: number,
  active: boolean,
  overlay: HTMLDivElement | null,
  stripes: Map<number, HTMLDivElement>,
  startedAt: { current: number | null },
) {
  if (!overlay) return;
  if (!active) {
    startedAt.current = null;
    overlay.style.opacity = "0";
    return;
  }
  startedAt.current ??= now;
  const elapsed = now - startedAt.current;
  overlay.style.opacity = elapsed < BATTLE_INTRO_TIMING.flashMs ? "0.86" : "1";
  stripes.forEach(function visitItem(stripe, index) {
    const progress = Math.min(
      1,
      Math.max(
        0,
        (elapsed - BATTLE_INTRO_TIMING.flashMs - index * 16) /
          Math.max(120, BATTLE_INTRO_TIMING.stripeMs - index * 16),
      ),
    );
    stripe.style.transform = `translate3d(${(1 - progress) * (index % 2 === 0 ? -100 : 100)}%, 0, 0)`;
  });
}
