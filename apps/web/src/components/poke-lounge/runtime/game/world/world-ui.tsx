"use client";

import { useSyncExternalStore } from "react";
import type { PokeLoungeCopy } from "../../../poke-lounge-copy";
import type { GameStateStore } from "../state/game-state-store";
import { TournamentResultPanel } from "./tournament-result-panel";
import type { WorldUiSnapshot, WorldUiStore } from "./world-ui-store";
import { PixelPanel } from "../../../ui/poke-lounge-ui-primitives";
import { TournamentBracketPanel } from "../tournament/tournament-bracket-panel";
import { localizeRuntimeText } from "../i18n/runtime-game-localization";

export function WorldUiLayer({
  copy,
  gameStateStore,
  onResultLobby,
  onResultNewGame,
  uiStore,
}: {
  copy: PokeLoungeCopy;
  gameStateStore: GameStateStore;
  onResultLobby(): void;
  onResultNewGame(): void;
  uiStore: WorldUiStore;
}) {
  const rawUi = useSyncExternalStore(uiStore.subscribe, uiStore.getSnapshot, uiStore.getSnapshot);
  const ui: WorldUiSnapshot = {
    ...rawUi,
    areaAnnouncement: rawUi.areaAnnouncement
      ? localizeRuntimeText(rawUi.areaAnnouncement, copy.locale)
      : null,
    interactionPrompt: rawUi.interactionPrompt
      ? localizeRuntimeText(rawUi.interactionPrompt, copy.locale)
      : null,
    nurseMessage: rawUi.nurseMessage ? localizeRuntimeText(rawUi.nurseMessage, copy.locale) : null,
    tournamentAnnouncement: rawUi.tournamentAnnouncement
      ? localizeRuntimeText(rawUi.tournamentAnnouncement, copy.locale)
      : null,
  };

  return (
    <div
      className="absolute inset-0 z-[20000] font-[var(--pl-font-game)] text-[var(--pl-color-ink)] [image-rendering:auto]"
      data-poke-lounge-world-ui="true"
    >
      <WorldNoticeLayer
        copy={copy}
        gameStateStore={gameStateStore}
        onPreviousResultClose={() => uiStore.dispatch({ type: "close-previous-round-result" })}
        onResultLobby={onResultLobby}
        onResultNewGame={onResultNewGame}
        ui={ui}
      />
    </div>
  );
}

export function WorldNoticeLayer({
  copy,
  gameStateStore,
  onResultLobby,
  onResultNewGame,
  onPreviousResultClose,
  ui,
}: {
  copy: PokeLoungeCopy;
  gameStateStore: GameStateStore;
  onResultLobby(): void;
  onResultNewGame(): void;
  onPreviousResultClose(): void;
  ui: WorldUiSnapshot;
}) {
  const gameState = useSyncExternalStore(
    gameStateStore.subscribe,
    gameStateStore.getState,
    gameStateStore.getState,
  );
  const tournamentProjection = gameState.tournament.serverProjection;

  return (
    <div className="pointer-events-none absolute inset-0" aria-live="polite">
      {/* Keep concurrent notices in one bounded flow, including the interaction hint. */}
      <div className="pointer-events-auto absolute top-2 left-1/2 flex max-h-[calc(100%-16px)] w-[calc(100%-16px)] max-w-sm -translate-x-1/2 flex-col items-center gap-2 overflow-y-auto overscroll-contain break-keep [overflow-wrap:anywhere] [&>div]:shrink-0">
        {ui.areaAnnouncement ? (
          <div className="justify-self-center rounded-[7px] border-[3px] border-[#304550] bg-[#fffdf0] px-3 py-2 text-center text-sm leading-[1.25] font-black whitespace-pre-line text-[#304550] shadow-[inset_0_0_0_2px_#fffdf0,inset_0_0_0_4px_#a8bcb1]">
            {ui.areaAnnouncement}
          </div>
        ) : null}
        {ui.nurseMessage ? (
          <div className="justify-self-center rounded-[7px] border-[3px] border-[#304550] bg-[#fffdf0] px-3 py-2 text-center text-sm leading-[1.25] font-black whitespace-pre-line text-[#304550] shadow-[inset_0_0_0_2px_#fffdf0,inset_0_0_0_4px_#a8bcb1]">
            {ui.nurseMessage}
          </div>
        ) : null}
        {ui.interactionPrompt ? (
          <div className="w-full text-center text-xs leading-[1.25] font-black whitespace-pre-line text-[#fff9dd] [text-shadow:-2px_-2px_#263238,2px_-2px_#263238,-2px_2px_#263238,2px_2px_#263238]">
            {ui.interactionPrompt}
          </div>
        ) : null}
      </div>
      {ui.nurseHealing.active ? <NurseHealingEffect key={ui.nurseHealing.effectCount} /> : null}
      {ui.tournamentAnnouncement && tournamentProjection ? (
        <TournamentBracketPanel
          copy={copy}
          projection={tournamentProjection}
          text={ui.tournamentAnnouncement}
        />
      ) : ui.tournamentAnnouncement ? (
        <PixelPanel
          className="pointer-events-none absolute top-2 left-1/2 z-[900] box-border w-[min(calc(100%-16px),720px)] -translate-x-1/2 rounded-[9px] border-[3px] border-[#506d7b] bg-[#293d48] px-3 py-2.5 text-center text-sm leading-[1.45] font-black whitespace-pre-line text-[var(--pl-color-surface-raised)] shadow-[inset_0_0_0_2px_#b0c1b3,0_4px_0_#20333c]"
          data-poke-lounge-tournament-announcement="true"
        >
          {ui.tournamentAnnouncement}
        </PixelPanel>
      ) : null}
      {ui.tournamentResult ? (
        <TournamentResultPanel
          copy={copy}
          locale={copy.locale}
          panel={ui.tournamentResult}
          onLobby={onResultLobby}
          onNewGame={onResultNewGame}
        />
      ) : ui.previousRoundResult ? (
        <TournamentResultPanel
          copy={copy}
          locale={copy.locale}
          panel={ui.previousRoundResult}
          onLobby={onResultLobby}
          onNewGame={onResultNewGame}
          onClose={onPreviousResultClose}
        />
      ) : null}
    </div>
  );
}

export function NurseHealingEffect() {
  return (
    <div
      className="absolute top-[40%] left-1/2 size-20 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(ellipse,rgb(183_216_151_/_75%),transparent_70%)] shadow-[0_0_32px_rgb(183_216_151_/_50%)] [&_i]:absolute [&_i]:size-2 [&_i]:rotate-45 [&_i]:bg-[#fff176] [&_i]:animate-[world-nurse-sparkle_1000ms_ease-out_forwards] [&_i:nth-child(2)]:left-6 [&_i:nth-child(2)]:bg-[#81d4fa] [&_i:nth-child(2)]:[animation-delay:60ms] [&_i:nth-child(3)]:left-12 [&_i:nth-child(3)]:bg-[#f8bbd0] [&_i:nth-child(3)]:[animation-delay:100ms] [&_i:nth-child(4)]:left-[70px] [&_i:nth-child(4)]:bg-[#c5e1a5] [&_i:nth-child(4)]:[animation-delay:140ms]"
      data-poke-lounge-nurse-effect="true"
      aria-hidden="true"
    >
      <i />
      <i />
      <i />
      <i />
    </div>
  );
}
