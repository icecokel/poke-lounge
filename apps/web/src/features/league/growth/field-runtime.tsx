"use client";
import { useEffect, useMemo, useRef, useSyncExternalStore, type RefObject } from "react";
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
export function LeagueFieldRuntime({
  runtime,
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
    return {
      model,
      frame,
      world: createWorldRuntime(model, frame),
      ui: createWorldUiStore(),
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
      game.destroy();
      resetVirtualGamepad();
      if (stopRef.current === stop) stopRef.current = null;
    };
    stopRef.current = stop;
    return stop;
  }, [runtime, store, resources, expMultiplierPermille, challenger, roam, stopRef]);
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
            uiStore={resources.ui}
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
