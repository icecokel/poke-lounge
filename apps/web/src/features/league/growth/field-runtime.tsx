"use client";
import {
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type RefObject,
  type ReactNode,
} from "react";
import { getPokeLoungeCopy } from "@/components/poke-lounge/poke-lounge-copy";
import { createPokeLoungeGame } from "@/components/poke-lounge/runtime/game/create-poke-lounge-game";
import type { BattleUiStore } from "@/components/poke-lounge/runtime/game/battle/battle-ui-store";
import { BattleScreen } from "@/components/poke-lounge/runtime/game/battle/battle-screen";
import { WorldScreen } from "@/components/poke-lounge/runtime/game/world/world-screen";
import { createWorldFrameStore } from "@/components/poke-lounge/runtime/game/world/world-frame-store";
import { createWorldUiStore } from "@/components/poke-lounge/runtime/game/world/world-ui-store";
import {
  createWorldMapModel,
  createWorldPlayerAtlasModel,
  type WorldMapModel,
} from "@/components/poke-lounge/runtime/game/world/world-map-model";
import { createWorldRuntime } from "@/components/poke-lounge/runtime/game/world/world-runtime";
import { worldPlayerCollides } from "@/components/poke-lounge/runtime/game/world/world-runtime-motion";
import {
  pressVirtualGamepadButton,
  releaseVirtualGamepadButton,
  resetVirtualGamepad,
  type VirtualGamepadButton,
} from "@/components/poke-lounge/runtime/game/input/virtual-gamepad";
import type { GameStateStore } from "@/features/poke-lounge/contracts/game-state";
import { leagueWildExperiencePolicy } from "@poke-lounge/battle/league/growth/experience";
import type { LeagueRuntime } from "../contract";
import { createLeagueOfflineRoom } from "./offline-room";
import type { FieldChallengerOption } from "@/components/poke-lounge/runtime/game/scenes/world-scene";
import type { GymRoam } from "./gym-roam";
import { GymRoamToast } from "./gym-roam-toast";
import { MOBILE_GAME_VIEWPORT_SIZE } from "@/components/poke-lounge/runtime/game/game-viewport";
import { createLeagueWorldUiView, LEAGUE_NURSE_MESSAGE_MS } from "./world-ui-view";
import type { LeagueFieldLayout } from "./field-layout";
import {
  LeagueMobileFieldShell,
  MOBILE_FRAME,
  LeagueMobileDock,
  LeagueMobileWorldTask,
} from "./mobile-field-shell";
export function LeagueFieldRuntime({
  runtime,
  layout,
  status,
  store,
  battleStore,
  expMultiplierPermille,
  model: injectedModel,
  challenger,
  roam,
  stopRef,
  onExit,
}: {
  runtime: LeagueRuntime;
  layout: LeagueFieldLayout;
  status?: ReactNode;
  store: GameStateStore;
  battleStore: BattleUiStore;
  expMultiplierPermille: number;
  model?: WorldMapModel;
  challenger?: FieldChallengerOption;
  roam?: GymRoam;
  stopRef: RefObject<(() => void) | null>;
  onExit(): void;
}) {
  const mount = useRef<HTMLDivElement>(null);
  const resources = useMemo(() => {
    const model = injectedModel ?? createWorldMapModel(runtime.runtimeAssets.tilemap);
    const frame = createWorldFrameStore();
    const ui = createWorldUiStore();
    return {
      model,
      frame,
      world: createWorldRuntime(model, frame),
      ui,
      uiView: createLeagueWorldUiView(ui, LEAGUE_NURSE_MESSAGE_MS),
      battle: battleStore,
      atlas: createWorldPlayerAtlasModel(runtime.runtimeAssets.playerAtlas.data),
    };
  }, [runtime, injectedModel, battleStore]);
  const snapshot = useSyncExternalStore(
    resources.battle.subscribe,
    resources.battle.getSnapshot,
    resources.battle.getSnapshot,
  );
  const battle = !!snapshot.presentation;
  useEffect(() => {
    if (!mount.current) return;
    resetVirtualGamepad();
    const game = createPokeLoungeGame(mount.current, {
      runtimeAssets: runtime.runtimeAssets,
      ...(layout === "mobile" ? { viewportSize: MOBILE_GAME_VIEWPORT_SIZE } : {}),
      gameStateStore: store,
      multiplayerRoom: createLeagueOfflineRoom(),
      competitiveRoundsEnabled: false,
      battleExperiencePolicy: leagueWildExperiencePolicy(expMultiplierPermille),
      fieldChallenger: challenger,
      worldModel: resources.model,
      worldFrameStore: resources.frame,
      worldRuntime: resources.world,
      worldUiStore: resources.ui,
      battleUiStore: resources.battle,
    });
    const detach = roam?.attach({
      world: resources.world,
      frame: resources.frame,
      mount: mount.current,
    });
    mount.current.focus();
    let stopped = false;
    const stop = () => {
      if (stopped) return;
      stopped = true;
      detach?.();
      if (roam) {
        // Destroy persists rounded coordinates; validate them against the stopped NPC too.
        const position = resources.world.readLocalPlayer().position;
        const rounded = { x: Math.round(position.x), y: Math.round(position.y) };
        const limit = Math.max(resources.model.widthInPixels, resources.model.heightInPixels);
        for (let radius = 0; radius <= limit; radius++) {
          const candidates = [];
          for (let dx = -radius; dx <= radius; dx++) {
            for (let dy = -radius; dy <= radius; dy++) {
              if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
              candidates.push({ x: rounded.x + dx, y: rounded.y + dy });
            }
          }
          candidates.sort(
            (a, b) =>
              Math.hypot(a.x - position.x, a.y - position.y) -
              Math.hypot(b.x - position.x, b.y - position.y),
          );
          const safe = candidates.find(point => !worldPlayerCollides(point, resources.model));
          if (!safe) continue;
          resources.world.setLocalPosition(safe, resources.frame.read().camera);
          break;
        }
      }
      game.destroy();
      resetVirtualGamepad();
      if (stopRef.current === stop) stopRef.current = null;
    };
    stopRef.current = stop;
    return stop;
  }, [runtime, store, resources, expMultiplierPermille, challenger, roam, stopRef, layout]);
  useEffect(() => roam?.setFieldActive(!battle), [roam, battle]);
  const copy = getPokeLoungeCopy(runtime.locale);
  const controls: Array<[VirtualGamepadButton, string]> = [
    ["up", "↑"],
    ["left", "←"],
    ["down", "↓"],
    ["right", "→"],
    ["confirm", "A"],
    ["back", "B"],
  ];
  if (layout === "mobile")
    return (
      <LeagueMobileFieldShell>
        {status}
        <div ref={mount} tabIndex={0} className={MOBILE_FRAME} data-poke-lounge-league-field>
          <div className={battle ? "hidden" : "absolute inset-0"}>
            <WorldScreen
              atlas={resources.atlas}
              competitiveRoundsEnabled={false}
              showRankScoreHud={false}
              frameStore={resources.frame}
              gameStateStore={store}
              model={resources.model}
              copy={copy}
              desktop={false}
              onResultLobby={onExit}
              onResultNewGame={onExit}
              uiStore={resources.uiView}
            />
          </div>
          {battle && (
            <BattleScreen
              copy={copy}
              desktop={false}
              gameStateStore={store}
              uiStore={resources.battle}
            />
          )}
        </div>
        <LeagueMobileDock
          battle={battle}
          battleStore={resources.battle}
          copy={copy}
          uiStore={resources.ui}
        >
          {!battle && roam && <GymRoamToast roam={roam} locale={runtime.locale} placement="dock" />}
        </LeagueMobileDock>
        <LeagueMobileWorldTask battle={battle} copy={copy} uiStore={resources.ui} store={store} />
      </LeagueMobileFieldShell>
    );
  return (
    <div>
      <div
        ref={mount}
        tabIndex={0}
        className="relative h-[min(65vh,600px)] min-h-80 overflow-hidden rounded bg-black outline-none"
        data-poke-lounge-league-field
      >
        <div className={battle ? "hidden" : "absolute inset-0"}>
          <WorldScreen
            atlas={resources.atlas}
            competitiveRoundsEnabled={false}
            showRankScoreHud={false}
            frameStore={resources.frame}
            gameStateStore={store}
            model={resources.model}
            copy={copy}
            desktop
            onResultLobby={onExit}
            onResultNewGame={onExit}
            uiStore={resources.uiView}
          />
        </div>
        {!battle && roam && <GymRoamToast roam={roam} locale={runtime.locale} />}
        {battle && (
          <BattleScreen copy={copy} desktop gameStateStore={store} uiStore={resources.battle} />
        )}
      </div>
      <div className="flex justify-center gap-2 py-3">
        {controls.map(([button, label]) => (
          <button
            key={button}
            aria-label={button}
            className="size-12 touch-none rounded border border-gray-300 bg-white"
            onPointerDown={e => {
              e.preventDefault();
              e.currentTarget.setPointerCapture(e.pointerId);
              pressVirtualGamepadButton(button);
            }}
            onPointerUp={() => releaseVirtualGamepadButton(button)}
            onPointerCancel={() => releaseVirtualGamepadButton(button)}
            onLostPointerCapture={() => releaseVirtualGamepadButton(button)}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
