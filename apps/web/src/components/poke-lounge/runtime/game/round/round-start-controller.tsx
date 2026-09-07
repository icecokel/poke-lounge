"use client";
import { observeAnimationFrames } from "@/features/poke-lounge/adapters/browser/observe-animation-frames";
import {
  createReadinessCoordinator,
  type ReadinessStatus,
} from "@/features/poke-lounge/application/round/readiness-coordinator";
import {
  createReadinessObservation,
  createRoundStartView,
} from "@/features/poke-lounge/presentation/round/round-start-model";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { PokeLoungeCopy } from "../../../poke-lounge-copy";
import type { GameStateStore } from "../state/game-state-store";
import type { WorldFrameStore } from "../world/world-frame-store";
import { RoundStartOverlay } from "./round-start-overlay";

export function RoundStartController({
  copy,
  gameStateStore,
  frameStore,
  onPreparationReady,
}: {
  copy: PokeLoungeCopy;
  gameStateStore: GameStateStore;
  frameStore: WorldFrameStore;
  onPreparationReady?: (roundIndex: number) => Promise<void>;
}) {
  const state = useSyncExternalStore(
    gameStateStore.subscribe,
    gameStateStore.getState,
    gameStateStore.getState,
  );
  const [now, setNow] = useState(() => Date.now());
  const [status, setStatus] = useState<ReadinessStatus>("idle");
  const rootRef = useRef<HTMLDivElement>(null);
  const readiness = useRef<ReturnType<typeof createReadinessCoordinator> | null>(null);
  const projection = state.tournament.serverProjection;
  useEffect(() => {
    if (projection?.roomStatus !== "round-started") return;
    const tick = () => setNow(Date.now());
    tick();
    const timer = window.setInterval(tick, 50);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [projection?.roomStatus, projection?.roomRound.startedAtMs]);
  useEffect(() => {
    if (!onPreparationReady) return;
    const coordinator = createReadinessCoordinator({
      submit: onPreparationReady,
      onStatus: setStatus,
    });
    readiness.current = coordinator;
    const stop = observeAnimationFrames(window, () =>
      coordinator.observe(
        createReadinessObservation(
          gameStateStore.getState(),
          frameStore.read().localPlayer,
          document.visibilityState !== "hidden" &&
            Boolean(rootRef.current?.getClientRects().length),
          gameStateStore.canChooseStarter(),
        ),
      ),
    );
    return () => {
      stop();
      coordinator.dispose();
      readiness.current = null;
    };
  }, [onPreparationReady, gameStateStore, frameStore]);
  const view = createRoundStartView(state, now);
  if (!view) return null;
  return (
    <RoundStartOverlay
      copy={copy}
      view={view}
      failed={status === "failed"}
      rootRef={rootRef}
      onRetry={() => readiness.current?.retry()}
    />
  );
}
