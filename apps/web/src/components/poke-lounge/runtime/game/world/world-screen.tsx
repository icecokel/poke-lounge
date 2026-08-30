"use client";

import { forwardRef, useEffect, useRef, useSyncExternalStore, type RefCallback } from "react";
import { BATTLE_INTRO_TIMING, createBattleIntroStripes } from "../battle/battleIntro";
import { FIELD_MAP } from "./fieldMap";
import type { WorldFrameStore } from "./world-frame-store";
import {
  getWorldTileSourcePosition,
  type WorldMapLayerModel,
  type WorldMapModel,
  type WorldMapNpcModel,
  type WorldMapTile,
  type WorldPlayerAtlasModel,
} from "./world-map-model";
import styles from "../../../poke-lounge.module.css";
import type { PokeLoungeCopy } from "../../../poke-lounge-copy";
import type { GameStateStore } from "../state/gameStateStore";
import { WorldUiLayer } from "./world-ui";
import type { WorldUiStore } from "./world-ui-store";

export function WorldScreen({
  atlas,
  competitiveRoundsEnabled,
  frameStore,
  gameStateStore,
  model,
  copy,
  desktop,
  uiStore,
}: {
  atlas: WorldPlayerAtlasModel;
  competitiveRoundsEnabled: boolean;
  frameStore: WorldFrameStore;
  gameStateStore: GameStateStore;
  model: WorldMapModel;
  copy: PokeLoungeCopy;
  desktop: boolean;
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

  useEffect(() => {
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
    return () => cancelAnimationFrame(animationFrame);
  }, [atlas, frameStore]);

  return (
    <div className={styles.worldScreen} data-poke-lounge-world-screen="true">
      <WorldViewport ref={viewportRef} aria-hidden="true">
        <div ref={stageRef} className={styles.worldStage}>
          <WorldMap ref={mapRef} model={model}>
            <WorldTileLayer model={model} layer={model.layers[0]} depth={0} />
            <WorldTileLayer model={model} layer={model.layers[1]} depth={10} />
            <TallGrassBaseLayer model={model} />
            <WorldActorLayer>
              {model.npcs.map(npc => (
                <NpcActor key={npc.name} npc={npc} />
              ))}
              <LocalPlayerActor ref={localPlayerRef} />
              {remotePlayers.map(player => (
                <RemotePlayerActor
                  key={player.sessionId}
                  ref={registerMapRef(remotePlayerRefs.current, player.sessionId)}
                  displayName={player.displayName}
                />
              ))}
            </WorldActorLayer>
            <TallGrassForegroundLayer model={model} />
            <WorldTileLayer model={model} layer={model.layers[2]} depth={40} />
          </WorldMap>
          <WorldEffectLayer>
            <WorldBattleTransition
              ref={transitionRef}
              viewport={frameStore.read().camera}
              registerStripe={(index, node) => {
                if (node) transitionStripeRefs.current.set(index, node);
                else transitionStripeRefs.current.delete(index);
              }}
            />
          </WorldEffectLayer>
        </div>
      </WorldViewport>
      <WorldUiLayer
        copy={copy}
        competitiveRoundsEnabled={competitiveRoundsEnabled}
        desktop={desktop}
        gameStateStore={gameStateStore}
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
    <div ref={ref} className={styles.worldViewport} {...props}>
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
      className={styles.worldMap}
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
    <div className={styles.worldTileLayer} data-world-layer={layer.name} style={{ zIndex: depth }}>
      {layer.tiles.map(tile => (
        <WorldTile key={tile.key} model={model} tile={tile} />
      ))}
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
    <div className={styles.worldTileLayer} data-world-layer={name} style={{ zIndex: depth }}>
      {tiles.map(tile => (
        <WorldTile key={tile.key} model={model} tile={tile} />
      ))}
    </div>
  );
}

function WorldTile({ model, tile }: { model: WorldMapModel; tile: WorldMapTile }) {
  const source = getWorldTileSourcePosition(model, tile.gid);
  return (
    <span
      className={styles.worldTile}
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
  return <div className={styles.worldActorLayer}>{children}</div>;
}

export const LocalPlayerActor = forwardRef<HTMLDivElement>(function LocalPlayerActor(_, ref) {
  return <div ref={ref} className={styles.worldPlayerActor} data-world-local-player="true" />;
});

export const RemotePlayerActor = forwardRef<HTMLDivElement, { displayName: string }>(
  function RemotePlayerActor({ displayName }, ref) {
    return (
      <div ref={ref} className={`${styles.worldPlayerActor} ${styles.worldRemotePlayerActor}`}>
        <PlayerNameLabel>{displayName}</PlayerNameLabel>
      </div>
    );
  },
);

export function PlayerNameLabel({ children }: { children: React.ReactNode }) {
  return <span className={styles.worldPlayerNameLabel}>{children}</span>;
}

export function NpcActor({ npc }: { npc: WorldMapNpcModel }) {
  const config = FIELD_MAP.npcs[npc.name];
  return (
    // Sprite sheets must retain their original pixel dimensions and nearest-neighbor rendering.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      alt=""
      className={styles.worldNpcActor}
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
  return <div className={styles.worldEffectLayer}>{children}</div>;
}

export const WorldBattleTransition = forwardRef<
  HTMLDivElement,
  {
    registerStripe(index: number, node: HTMLDivElement | null): void;
    viewport: { height: number; width: number };
  }
>(function WorldBattleTransition({ registerStripe, viewport }, ref) {
  return (
    <div ref={ref} className={styles.worldBattleTransition} data-world-battle-transition="true">
      {createBattleIntroStripes({
        width: viewport.width,
        height: viewport.height,
        stripeCount: 8,
      }).map((stripe, index) => (
        <div
          key={index}
          ref={node => registerStripe(index, node)}
          className={styles.worldBattleTransitionStripe}
          style={{
            height: stripe.height,
            left: stripe.x,
            top: stripe.y,
            width: stripe.width,
          }}
        />
      ))}
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
  return node => {
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
  stripes.forEach((stripe, index) => {
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
