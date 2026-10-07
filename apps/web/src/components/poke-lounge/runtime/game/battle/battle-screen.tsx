"use client";

import {
  canChooseBattleCommand,
  canChooseBattleAction,
} from "@/features/poke-lounge/presentation/battle/selection-model";
import { getMobileUiCopy } from "../../../mobile/mobile-ui-copy";
import { useBattleClock } from "../../../mobile/mobile-battle-deck";
import { getBattleMoveDetails } from "@/features/poke-lounge/presentation/battle/move-details";
import { OpponentPartyIndicator } from "./opponent-party-indicator";
import { BATTLE_BAG_PAGE_SIZE } from "./battle-bag-selection";

import { LearnedMoveNotice, MoveLearningPanel } from "../ui/move-learning-panel";
import { BattleMoveEffects } from "./battle-move-effects";

import {
  createTournamentBriefingText,
  TOURNAMENT_BRIEFING_DURATION_MS,
} from "@/features/poke-lounge/presentation/tournament/tournament-view-model";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { PokeLoungeCopy } from "../../../poke-lounge-copy";
import {
  HealthBar,
  MessageBox,
  PixelButton,
  PixelPanel,
} from "../../../ui/poke-lounge-ui-primitives";
import { primePokeLoungeAudio } from "../audio/poke-lounge-audio";
import {
  localizeBattlePresentationState,
  localizeMobileBattleUiState,
  localizeRuntimeText,
} from "../i18n/runtime-game-localization";
import type { GameStateStore } from "../state/game-state-store";
import { TournamentBracketPanel } from "../tournament/tournament-bracket-panel";
import type { MobileBattleUiAction, MobileBattleUiState } from "../ui/mobile-battle-ui";
import {
  createShortcutGuideFooter,
  createShortcutGuideRows,
  createShortcutGuideTitle,
} from "../ui/shortcut-guide";
import { ROM_BATTLE_DESIGN_ASSETS } from "./battle-design";
import { getBattleStatusTextView, hpRatio, type BattleRect } from "./battle-layout";
import { BATTLE_POKEMON_FRAME_SIZE, getBattlePokemonAlphaBounds } from "./battle-pokemon-assets";
import {
  DESKTOP_BATTLE_STAGE_LAYOUT,
  getBattleHpPanelRect,
  MOBILE_BATTLE_STAGE_LAYOUT,
  toBattleActorPointStyle,
  toBattleRectStyle,
  toCenteredBattleActorRectStyle,
  type BattleStageLayout,
} from "./battle-stage-layout";
import type {
  BattleCapturePresentation,
  BattleCombatantPresentation,
  BattleEvolutionPresentation,
  BattlePresentationState,
  BattleSpritePresentation,
  BattleUiStore,
} from "./battle-ui-store";

const logicalWidth = 256;

export function BattleScreen({
  copy,
  desktop,
  gameStateStore,
  uiStore,
}: {
  copy: PokeLoungeCopy;
  desktop: boolean;
  gameStateStore?: GameStateStore;
  uiStore: BattleUiStore;
}) {
  const snapshot = useSyncExternalStore(
    uiStore.subscribe,
    uiStore.getSnapshot,
    uiStore.getSnapshot,
  );
  const presentation = snapshot.presentation
    ? localizeBattlePresentationState(snapshot.presentation, copy.locale)
    : null;
  const controls = snapshot.controls
    ? localizeMobileBattleUiState(snapshot.controls, copy.locale)
    : null;

  useEffect(() => {
    if (!desktop) return;
    const handleBack = (event: KeyboardEvent) => {
      if (event.code !== "KeyX" || event.repeat || event.defaultPrevented) return;
      if (
        document.querySelector(
          '[role="dialog"], [role="alertdialog"], [data-poke-lounge-mobile-task]',
        )
      )
        return;
      if (
        event.target instanceof HTMLElement &&
        event.target.closest('input, textarea, [contenteditable="true"]')
      )
        return;
      const current = uiStore.getSnapshot();
      if (
        !current.controls?.canGoBack ||
        current.controls.isInputLocked ||
        current.presentation?.help.open
      )
        return;
      event.preventDefault();
      event.stopImmediatePropagation();
      uiStore.dispatch({ type: "go-back" });
    };
    window.addEventListener("keydown", handleBack, true);
    return () => window.removeEventListener("keydown", handleBack, true);
  }, [desktop, uiStore]);

  if (!presentation || !controls) return null;
  const onAction = (action: MobileBattleUiAction) => {
    void primePokeLoungeAudio();
    uiStore.dispatch(action);
  };

  return (
    <section
      className="absolute inset-0 z-40 overflow-hidden bg-[var(--pl-color-surface-muted)] [container-type:size] [image-rendering:pixelated]"
      data-poke-lounge-battle-screen="true"
      data-poke-lounge-battle-phase={presentation.phase}
      aria-label={copy.mobile.battleDeckLabel}
    >
      <BattleStage
        copy={copy}
        controls={controls}
        desktop={desktop}
        onAction={onAction}
        presentation={presentation}
      />
      {gameStateStore ? (
        <BattleTournamentBriefing copy={copy} gameStateStore={gameStateStore} />
      ) : null}
      {desktop ? (
        <button
          type="button"
          className="absolute top-[2.5%] right-[2%] z-[850] grid aspect-square w-[clamp(28px,4.2cqw,56px)] place-items-center rounded-full border-[max(1px,0.15cqw)] border-[rgb(255_255_255_/_62%)] bg-[rgb(43_55_66_/_88%)] p-0 font-extrabold text-[#f8fbf0]"
          aria-label={copy.game.battleHelpLabel}
          data-poke-lounge-battle-help="true"
          onClick={function handleClick() {
            return onAction({ type: "toggle-help" });
          }}
        >
          ?
        </button>
      ) : null}
    </section>
  );
}

function BattleTournamentBriefing({
  copy,
  gameStateStore,
}: {
  copy: PokeLoungeCopy;
  gameStateStore: GameStateStore;
}) {
  const state = useSyncExternalStore(
    gameStateStore.subscribe,
    gameStateStore.getState,
    gameStateStore.getState,
  );
  const projection = state.tournament.serverProjection;
  const [nowMs, setNowMs] = useState(0);

  useEffect(
    function runEffect() {
      const endsAtMs = projection?.roomRound.endsAtMs;
      if (projection?.roomStatus !== "round-started" || endsAtMs == null) {
        setNowMs(0);
        return;
      }

      const timer = window.setTimeout(
        function handleTimeout() {
          setNowMs(Date.now());
        },
        Math.max(0, endsAtMs - TOURNAMENT_BRIEFING_DURATION_MS - Date.now()),
      );
      return function cleanup() {
        window.clearTimeout(timer);
      };
    },
    [projection?.roomRound.endsAtMs, projection?.roomStatus],
  );

  const text = projection ? createTournamentBriefingText(projection, nowMs) : null;
  return text && projection ? (
    <TournamentBracketPanel copy={copy} projection={projection} text={text} />
  ) : null;
}

export function BattleStage({
  copy,
  controls,
  desktop,
  onAction,
  presentation,
}: {
  copy: PokeLoungeCopy;
  controls: MobileBattleUiState;
  desktop: boolean;
  onAction(action: MobileBattleUiAction): void;
  presentation: BattlePresentationState;
}) {
  const layout = desktop ? DESKTOP_BATTLE_STAGE_LAYOUT : MOBILE_BATTLE_STAGE_LAYOUT;
  return (
    <div
      className="group/battle-stage absolute inset-0 overflow-hidden text-[clamp(8px,3.125cqw,44px)] text-[var(--pl-color-ink)]"
      data-poke-lounge-battle-layout={desktop ? "desktop" : "mobile"}
    >
      <BattleBackground evolution={Boolean(presentation.evolution)} />
      {presentation.authoritative.spectating ? (
        <div
          className="absolute top-0 left-1/2 z-45 flex w-max max-w-[88%] -translate-x-1/2 items-center gap-[0.5em] border-2 border-[var(--pl-color-ink)] bg-[var(--pl-color-surface-raised)] px-[0.6em] py-[0.15em] text-[max(9px,0.45em)] font-black [&_small]:overflow-hidden [&_small]:text-ellipsis [&_small]:whitespace-nowrap [&_small]:font-medium"
          role="status"
          data-poke-lounge-spectating="true"
        >
          <span aria-hidden="true">◉</span> {copy.mobile.spectatingLabel}
          <small>
            {presentation.player.displayName} vs {presentation.opponent.displayName}
          </small>
        </div>
      ) : null}
      {presentation.evolution ? (
        <BattleEvolutionScene evolution={presentation.evolution} />
      ) : (
        <>
          <BattlePokemonLayer presentation={presentation} layout={layout} />
          <BattleMoveEffects presentation={presentation} layout={layout} />
          <BattleCaptureEffect capture={presentation.capture} layout={layout} />
          <BattleHpPanel
            copy={copy}
            combatant={presentation.opponent}
            rect={getBattleHpPanelRect("opponent", layout)}
            layout={layout}
            side="opponent"
          />
          {presentation.battleKind === "trainer" && presentation.opponentParty ? (
            <OpponentPartyIndicator
              summary={presentation.opponentParty}
              locale={copy.locale}
              desktop={desktop}
              layout={layout}
            />
          ) : null}
          <BattleHpPanel
            copy={copy}
            combatant={presentation.player}
            rect={getBattleHpPanelRect("player", layout)}
            layout={layout}
            side="player"
          />
        </>
      )}
      {desktop &&
      controls.canGoBack &&
      !controls.isInputLocked &&
      !presentation.message &&
      !presentation.help.open ? (
        <button
          type="button"
          className="absolute right-[2%] bottom-[31.5%] z-30 inline-flex min-h-7 items-center gap-[0.4em] rounded-md border border-[#24313b] bg-[#fffef4] px-[0.75em] py-[0.35em] text-[0.65em] text-[#24313b] [&_kbd]:font-[inherit] [&_kbd]:font-black"
          data-poke-lounge-battle-back="true"
          aria-keyshortcuts="X"
          onClick={() => onAction({ type: "go-back" })}
        >
          <kbd>X</kbd> {copy.mobile.back}
        </button>
      ) : null}
      <BattleSurfaceRouter
        copy={copy}
        controls={controls}
        desktop={desktop}
        onAction={onAction}
        presentation={presentation}
      />
      {presentation.help.open && desktop ? (
        <BattleShortcutGuide
          copy={copy}
          onClose={function handleClose() {
            return onAction({ type: "toggle-help" });
          }}
          state={presentation}
          turnEndsAtMs={controls.turnEndsAtMs ?? null}
        />
      ) : null}
      <BattleEntranceEffect entrance={presentation.entrance} />
    </div>
  );
}

export function BattleBackground({ evolution }: { evolution: boolean }) {
  return (
    <div
      aria-hidden="true"
      className="absolute inset-0 bg-center bg-[length:100%_100%] bg-no-repeat group-data-[poke-lounge-battle-layout=mobile]/battle-stage:bg-cover data-[poke-lounge-battle-background=field]:bg-[#f8f8e0] data-[poke-lounge-battle-background=field]:bg-[length:100%_auto] data-[poke-lounge-battle-background=field]:bg-top data-[poke-lounge-battle-background=field]:after:absolute data-[poke-lounge-battle-background=field]:after:[inset:18.75cqw_0_0] data-[poke-lounge-battle-background=field]:after:bg-[#f8f8e0] data-[poke-lounge-battle-background=field]:after:content-['']"
      data-poke-lounge-battle-background={evolution ? "evolution" : "field"}
      style={{
        backgroundImage: `url(${evolution ? ROM_BATTLE_DESIGN_ASSETS.evolutionBackground.path : ROM_BATTLE_DESIGN_ASSETS.background.path})`,
      }}
    />
  );
}

export function BattlePokemonLayer({
  presentation,
  layout = DESKTOP_BATTLE_STAGE_LAYOUT,
}: {
  presentation: BattlePresentationState;
  layout?: BattleStageLayout;
}) {
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden="true">
      {(["opponent", "player"] as const).map(side => {
        const combatant = presentation[side];
        const fromBall = side === "player" || presentation.battleKind !== "wild";
        if (fromBall && presentation.entrance.active) return null;
        return (
          <div
            key={`${side}:${combatant.activeSlotIndex}:${combatant.sprite.sprite.path}:${combatant.sprite.sprite.frame}`}
          >
            <BattlePokemonSprite
              side={side}
              view={combatant.sprite}
              fromBall={fromBall}
              layout={layout}
            />
            {fromBall ? (
              <span
                className="absolute aspect-square w-[4.6875%] animate-[battle-send-out-ball_640ms_ease-out_both] bg-contain bg-no-repeat [image-rendering:pixelated]"
                data-poke-lounge-send-out-ball={side}
                style={{
                  backgroundImage: `url(${ROM_BATTLE_DESIGN_ASSETS.pokeball.path})`,
                  ...toBattleActorPointStyle(combatant.sprite, layout),
                }}
              />
            ) : null}
            {combatant.healing ? (
              <span
                className="absolute rounded-full bg-[radial-gradient(ellipse,rgb(183_216_151_/_70%),transparent_70%)] text-[#42713d] [&_i]:absolute [&_i]:bottom-0 [&_i]:left-[15%] [&_i]:animate-[battle-heal-rise_560ms_ease-out_infinite] [&_i]:not-italic [&_i]:font-black [&_i]:[text-shadow:0_0_2px_white] [&_i:nth-child(2)]:left-[40%] [&_i:nth-child(2)]:[animation-delay:-140ms] [&_i:nth-child(3)]:left-[65%] [&_i:nth-child(3)]:[animation-delay:-280ms] [&_i:nth-child(4)]:left-[85%] [&_i:nth-child(4)]:[animation-delay:-420ms]"
                data-poke-lounge-healing={side}
                style={toCenteredBattleActorRectStyle(combatant.sprite, layout)}
              >
                <i>+</i>
                <i>+</i>
                <i>+</i>
                <i>+</i>
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export function BattlePokemonSprite({
  alpha,
  fromBall = false,
  layout = DESKTOP_BATTLE_STAGE_LAYOUT,
  side,
  view,
}: {
  alpha?: number;
  fromBall?: boolean;
  layout?: BattleStageLayout;
  side: "evolution" | "opponent" | "party" | "player";
  view: BattleSpritePresentation;
}) {
  const columns = view.sprite.columns ?? 16;
  const rows = view.sprite.rows ?? 16;
  const column = view.sprite.frame % columns;
  const row = Math.floor(view.sprite.frame / columns);
  const positionX = columns <= 1 ? 0 : (column / (columns - 1)) * 100;
  const positionY = rows <= 1 ? 0 : (row / (rows - 1)) * 100;
  // At fractional mobile scales, atlas neighbours can bleed into transparent
  // gutters. Clip only those gutters, retaining a full source-pixel safety margin.
  const frameWidth = view.sprite.width ?? BATTLE_POKEMON_FRAME_SIZE.width;
  const frameHeight = view.sprite.height ?? BATTLE_POKEMON_FRAME_SIZE.height;
  const alphaBounds = layout.actorTransform ? getBattlePokemonAlphaBounds(view.sprite) : null;
  const clipPath = alphaBounds
    ? `inset(${[
        (Math.max(0, alphaBounds.y - 1) / frameHeight) * 100,
        (Math.max(0, frameWidth - alphaBounds.x - alphaBounds.width - 1) / frameWidth) * 100,
        (Math.max(0, frameHeight - alphaBounds.y - alphaBounds.height - 1) / frameHeight) * 100,
        (Math.max(0, alphaBounds.x - 1) / frameWidth) * 100,
      ]
        .map(value => `${value}%`)
        .join(" ")})`
    : undefined;

  return (
    <span
      className="pointer-events-none absolute block bg-no-repeat [image-rendering:pixelated] data-[from-ball=true]:origin-bottom data-[from-ball=true]:animate-[battle-send-out-pokemon_640ms_ease-out_backwards]"
      data-poke-lounge-battle-pokemon={side}
      data-from-ball={fromBall || undefined}
      style={{
        ...toCenteredBattleActorRectStyle(view, layout),
        backgroundImage: `url(${view.sprite.path})`,
        backgroundPosition: `${positionX}% ${positionY}%`,
        backgroundSize: `${columns * 100}% ${rows * 100}%`,
        clipPath,
        filter:
          view.tint === "white"
            ? "brightness(0) invert(1)"
            : view.effectTint
              ? `drop-shadow(0 0 3px ${view.effectTint}) saturate(1.7)`
              : undefined,
        transform: view.effectRotation ? `rotate(${view.effectRotation}deg)` : undefined,
        opacity: alpha ?? view.alpha,
      }}
    />
  );
}

export function BattleHpPanel({
  copy,
  combatant,
  layout = DESKTOP_BATTLE_STAGE_LAYOUT,
  rect,
  side,
}: {
  copy: PokeLoungeCopy;
  combatant: BattleCombatantPresentation;
  layout?: BattleStageLayout;
  rect: BattleRect;
  side: "opponent" | "player";
}) {
  const status = getBattleStatusTextView(combatant.status);
  const hp = Math.max(0, Math.min(combatant.maxHp, Math.round(combatant.displayedHp)));
  const experience = side === "player" ? combatant.experience : undefined;
  const expLabel = experience?.atMaxLevel
    ? "EXP MAX"
    : copy.locale === "ko-KR"
      ? `다음 레벨까지 ${experience?.remaining ?? 0} EXP`
      : copy.locale === "ja-JP"
        ? `次のレベルまで ${experience?.remaining ?? 0} EXP`
        : `${experience?.remaining ?? 0} EXP to next level`;
  return (
    <PixelPanel
      className="absolute grid grid-cols-[1fr_auto] content-start gap-x-[0.4em] gap-y-[0.15em] overflow-hidden border-[max(1px,0.18cqw)] border-[var(--pl-color-ink)] bg-[var(--pl-color-surface-raised)] px-[5%] py-[1%] text-[0.8em] leading-none shadow-[0.7cqw_0.7cqw_0_rgb(138_149_139_/_86%),inset_0_0_0_max(1px,0.08cqw)_#fff] data-[healing=true]:shadow-[0_0_2cqw_#b7d897] [&_strong]:overflow-hidden [&_strong]:whitespace-nowrap [&_small]:text-[0.72em] [&_small]:font-bold"
      data-poke-lounge-battle-hp-panel={side}
      data-healing={combatant.healing || undefined}
      style={toBattleRectStyle(rect, layout)}
      aria-label={`${combatant.name} HP ${Math.round(combatant.displayedHp)}/${combatant.maxHp}`}
    >
      <strong>
        {combatant.name} <small>Lv.{combatant.level}</small>
      </strong>
      {status ? (
        <span style={{ color: status.color }}>{copy.game.statusLabel[combatant.status]}</span>
      ) : null}
      <div className="col-[1/-1] flex min-w-0 items-center gap-[0.45em]">
        <HealthBar
          className="m-0 h-[max(5px,1cqw)] min-w-0 flex-1"
          value={hpRatio(hp, combatant.maxHp)}
          aria-label={`${combatant.name} HP`}
        />
        <span
          className="shrink-0 text-[0.8em] font-extrabold whitespace-nowrap tabular-nums"
          data-poke-lounge-hp-value={side}
        >
          {hp}/{combatant.maxHp}
        </span>
      </div>
      <small
        className="col-[1/-1] min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[var(--pl-color-ink-muted)] data-[poke-lounge-battle-trainer=player]:text-right"
        data-poke-lounge-battle-trainer={side}
      >
        {combatant.displayName}
      </small>
      {experience ? (
        <div
          className="col-[1/-1] flex min-w-0 items-center gap-[0.45em] [&_small]:text-[0.58em] [&_small]:leading-none [&_small]:font-extrabold"
          title={expLabel}
        >
          <small>EXP</small>
          <span
            className="block h-[max(3px,0.65cqw)] min-w-0 flex-1 overflow-hidden rounded-sm border border-[#527b90] bg-[#d9e7ed] [&>i]:block [&>i]:h-full [&>i]:bg-[#77cefa] [&>i]:transition-[width] [&>i]:duration-240 [&>i]:ease-linear motion-reduce:[&>i]:transition-none"
            role="progressbar"
            aria-label={expLabel}
            aria-valuemin={0}
            aria-valuemax={experience.required || 1}
            aria-valuenow={experience.atMaxLevel ? 1 : experience.current}
            aria-valuetext={expLabel}
            data-poke-lounge-experience="true"
            data-remaining={experience.remaining}
          >
            <i style={{ width: `${experience.ratio * 100}%` }} />
          </span>
        </div>
      ) : null}
    </PixelPanel>
  );
}

export function BattleSurfaceRouter({
  copy,
  controls,
  desktop,
  onAction,
  presentation,
}: {
  copy: PokeLoungeCopy;
  controls: MobileBattleUiState;
  desktop: boolean;
  onAction(action: MobileBattleUiAction): void;
  presentation: BattlePresentationState;
}) {
  if (presentation.evolution) return null;
  if (!desktop) return null;
  if (controls.learnedMove && presentation.message) {
    return (
      <div className="absolute inset-0 z-35 flex items-center justify-center overflow-auto bg-[rgb(14_28_19_/_88%)] p-[clamp(10px,2.5cqw,22px)] [&>section]:max-w-[650px] [&>section]:shrink-0">
        <LearnedMoveNotice
          copy={copy}
          move={controls.learnedMove}
          message={presentation.message}
          disabled={controls.isInputLocked}
          onContinue={function acknowledgeMove() {
            onAction({ type: "confirm-message" });
          }}
        />
      </div>
    );
  }
  if (presentation.message) {
    return (
      <BattleMessagePanel
        message={presentation.message}
        locked={controls.isInputLocked}
        onConfirm={function handleConfirm() {
          return onAction({ type: "confirm-message" });
        }}
      />
    );
  }
  if (controls.isInputLocked || presentation.phase === "resolving") {
    return <BattleWaitingPanel copy={copy} />;
  }
  if (presentation.phase === "command") {
    return <BattleCommandPanel copy={copy} controls={controls} onAction={onAction} />;
  }
  if (presentation.phase === "move-select") {
    return <BattleMovePanel copy={copy} controls={controls} onAction={onAction} />;
  }
  if (presentation.phase === "move-replace-select") {
    return <BattleMoveReplacementPanel copy={copy} controls={controls} onAction={onAction} />;
  }
  if (presentation.phase === "party-select") {
    return <BattlePartyPanel copy={copy} controls={controls} onAction={onAction} />;
  }
  if (presentation.phase === "bag-select") {
    return <BattleBagPanel copy={copy} controls={controls} onAction={onAction} />;
  }
  return (
    <BattleMessagePanel
      message={copy.game.battleEnded}
      locked={controls.isInputLocked}
      onConfirm={function handleConfirm() {
        return onAction({ type: "confirm-message" });
      }}
    />
  );
}

export function BattleMessagePanel({
  locked,
  message,
  onConfirm,
}: {
  locked: boolean;
  message: string;
  onConfirm(): void;
}) {
  return (
    <MessageBox
      className="absolute bottom-0 left-0 m-0 h-[30.208333%] w-full rounded-none border-[max(1px,0.3cqw)] border-[var(--pl-color-ink)] bg-[var(--pl-color-surface)] p-[2.34375%] font-[inherit] text-[var(--pl-color-ink)] shadow-[inset_0_0_0_max(1px,0.12cqw)_#fff,inset_0_0_0_max(2px,0.45cqw)_rgb(139_149_136_/_65%)] z-20 left-[1.171875%] flex h-[27.083333%] w-[97.65625%] cursor-pointer items-start justify-start rounded-[max(2px,0.35cqw)] border-[max(2px,0.32cqw)] border-[#454d5b] bg-[#fffef4] px-[13.28125%] py-[3.90625%] pl-[4.6875%] text-left leading-[1.35] shadow-[inset_0_0_0_max(2px,0.28cqw)_#858b96,inset_0_0_0_max(4px,0.62cqw)_#f2f1e8,0_max(2px,0.28cqw)_0_var(--pl-color-gold)] disabled:cursor-default disabled:opacity-100 data-[poke-lounge-battle-surface=message]:before:absolute data-[poke-lounge-battle-surface=message]:before:top-[20%] data-[poke-lounge-battle-surface=message]:before:right-[3.125%] data-[poke-lounge-battle-surface=message]:before:h-[23.076923%] data-[poke-lounge-battle-surface=message]:before:w-[6.25%] data-[poke-lounge-battle-surface=message]:before:rounded-[max(3px,0.7cqw)] data-[poke-lounge-battle-surface=message]:before:border-[max(1px,0.16cqw)] data-[poke-lounge-battle-surface=message]:before:border-[#d8d9d4] data-[poke-lounge-battle-surface=message]:before:bg-[#fffef4] data-[poke-lounge-battle-surface=message]:before:shadow-[inset_0_0_0_max(1px,0.12cqw)_#f5f4ed] data-[poke-lounge-battle-surface=message]:before:content-[''] data-[poke-lounge-battle-surface=message]:after:absolute data-[poke-lounge-battle-surface=message]:after:right-[3.125%] data-[poke-lounge-battle-surface=message]:after:bottom-[20%] data-[poke-lounge-battle-surface=message]:after:h-[23.076923%] data-[poke-lounge-battle-surface=message]:after:w-[6.25%] data-[poke-lounge-battle-surface=message]:after:animate-[battle-message-advance_720ms_steps(2,end)_infinite] data-[poke-lounge-battle-surface=message]:after:rounded-[max(3px,0.7cqw)] data-[poke-lounge-battle-surface=message]:after:border-[max(1px,0.16cqw)] data-[poke-lounge-battle-surface=message]:after:border-[#d8d9d4] data-[poke-lounge-battle-surface=message]:after:bg-[#f7aeb7] data-[poke-lounge-battle-surface=message]:after:shadow-[inset_0_0_0_max(1px,0.12cqw)_#f5f4ed] data-[poke-lounge-battle-surface=message]:after:content-[''] motion-reduce:data-[poke-lounge-battle-surface=message]:after:animate-none"
      data-poke-lounge-battle-surface="message"
      disabled={locked}
      onClick={onConfirm}
    >
      {message}
    </MessageBox>
  );
}

export function BattleCommandPanel({
  copy,
  controls,
  onAction,
}: {
  copy: PokeLoungeCopy;
  controls: MobileBattleUiState;
  onAction(action: MobileBattleUiAction): void;
}) {
  const labels = {
    bag: localizeRuntimeText("몬스터볼", copy.locale),
    fight: copy.mobile.fight,
    pokemon: copy.mobile.party,
    run: copy.mobile.run,
  };
  return (
    <div
      className="absolute bottom-0 left-0 m-0 h-[30.208333%] w-full rounded-none border-[max(1px,0.3cqw)] border-[var(--pl-color-ink)] bg-[var(--pl-color-surface)] p-[2.34375%] font-[inherit] text-[var(--pl-color-ink)] shadow-[inset_0_0_0_max(1px,0.12cqw)_#fff,inset_0_0_0_max(2px,0.45cqw)_rgb(139_149_136_/_65%)] z-20 grid grid-cols-2 grid-rows-2 gap-x-[1.5625%] gap-y-[2.083333%] [&>button]:relative [&>button]:flex [&>button]:min-w-0 [&>button]:items-center [&>button]:justify-between [&>button]:gap-[0.4em] [&>button]:px-[0.75em] [&>button]:py-[0.2em] [&>button]:text-left [&>button]:text-[var(--pl-color-ink)] [&>button[data-selected=true]]:bg-[var(--pl-color-gold-soft)] [&>button[data-selected=true]]:shadow-[inset_max(2px,0.75cqw)_0_var(--pl-color-johto)] [&>button:disabled]:cursor-default [&>button:disabled]:text-[#7a827c] [&>button:disabled]:opacity-[0.62] [&_small]:text-[0.62em] [&_small]:whitespace-nowrap [&_small]:text-[var(--pl-color-ink-muted)]"
      data-poke-lounge-battle-surface="command"
    >
      {controls.commands.map(function mapItem(command, index) {
        return (
          <BattleOptionButton
            key={command.id}
            label={labels[command.id]}
            selected={command.selected}
            disabled={!canChooseBattleCommand(controls, command.id)}
            meta={
              controls.isAuthoritative && (command.id === "bag" || command.id === "run")
                ? getMobileUiCopy(copy.locale).competitiveUnavailable
                : command.id === "bag" && controls.canCapture
                  ? getMobileUiCopy(copy.locale).captureHint
                  : undefined
            }
            onClick={function handleClick() {
              if (!canChooseBattleCommand(controls, command.id)) return;
              return onAction({ type: "select-command", index });
            }}
          />
        );
      })}
    </div>
  );
}

export function BattleMovePanel({
  copy,
  controls,
  onAction,
}: {
  copy: PokeLoungeCopy;
  controls: MobileBattleUiState;
  onAction(action: MobileBattleUiAction): void;
}) {
  const selectedMove = controls.moves.find(move => move.selected);
  const details = selectedMove ? getBattleMoveDetails(selectedMove, copy.locale) : null;
  return (
    <>
      {selectedMove && details ? (
        <div
          className="pointer-events-none absolute right-0 bottom-[30.208333%] left-0 z-20 border-[max(1px,0.3cqw)] border-b-0 border-[var(--pl-color-ink)] bg-[var(--pl-color-surface)] px-[2.34375%] py-[0.5%] text-[0.68em] leading-[1.25] text-[var(--pl-color-ink)]"
          aria-live="polite"
        >
          <strong>{selectedMove.name}</strong> · {details.stats} · {details.effect}
          {selectedMove.effectNotice ? ` · ${selectedMove.effectNotice}` : ""}
        </div>
      ) : null}
      <div
        className="absolute bottom-0 left-0 m-0 h-[30.208333%] w-full rounded-none border-[max(1px,0.3cqw)] border-[var(--pl-color-ink)] bg-[var(--pl-color-surface)] p-[2.34375%] font-[inherit] text-[var(--pl-color-ink)] shadow-[inset_0_0_0_max(1px,0.12cqw)_#fff,inset_0_0_0_max(2px,0.45cqw)_rgb(139_149_136_/_65%)] z-20 grid grid-cols-2 grid-rows-2 gap-x-[1.5625%] gap-y-[2.083333%] [&>button]:relative [&>button]:flex [&>button]:min-w-0 [&>button]:items-center [&>button]:justify-between [&>button]:gap-[0.4em] [&>button]:px-[0.75em] [&>button]:py-[0.2em] [&>button]:text-left [&>button]:text-[var(--pl-color-ink)] [&>button[data-selected=true]]:bg-[var(--pl-color-gold-soft)] [&>button[data-selected=true]]:shadow-[inset_max(2px,0.75cqw)_0_var(--pl-color-johto)] [&>button:disabled]:cursor-default [&>button:disabled]:text-[#7a827c] [&>button:disabled]:opacity-[0.62] [&_small]:text-[0.62em] [&_small]:whitespace-nowrap [&_small]:text-[var(--pl-color-ink-muted)]"
        data-poke-lounge-battle-surface="moves"
      >
        {Array.from({ length: 4 }, function callback(_, index) {
          const move = controls.moves[index];
          return (
            <BattleOptionButton
              key={move?.index ?? `empty-${index}`}
              disabled={!move || move.disabled}
              label={move?.name ?? "-"}
              meta={
                move
                  ? `PP ${move.pp}/${move.maxPp} ${move.type}${move.effectNotice ? ` · ${move.effectNotice}` : ""}`
                  : undefined
              }
              selected={Boolean(move?.selected)}
              onClick={function handleClick() {
                return move && onAction({ type: "select-move", index: move.index });
              }}
            />
          );
        })}
      </div>
    </>
  );
}

export function BattleMoveReplacementPanel({
  copy,
  controls,
  onAction,
}: {
  copy: PokeLoungeCopy;
  controls: MobileBattleUiState;
  onAction(action: MobileBattleUiAction): void;
}) {
  if (!controls.moveReplacement) return null;
  return (
    <div
      className="absolute inset-0 z-35 flex items-center justify-center overflow-auto bg-[rgb(14_28_19_/_88%)] p-[clamp(10px,2.5cqw,22px)] [&>section]:max-w-[650px] [&>section]:shrink-0"
      data-poke-lounge-battle-surface="move-replacement"
    >
      <MoveLearningPanel
        copy={copy}
        pending={controls.moveReplacement}
        moves={controls.moves}
        disabled={controls.isInputLocked}
        onSelect={function chooseMove(index) {
          onAction({ type: "select-move-replacement", index });
        }}
        onConfirm={function approveMove() {
          onAction({ type: "confirm-move-replacement" });
        }}
        onCancel={function cancelMove() {
          onAction({ type: "go-back" });
        }}
        onSkip={function skipMove() {
          onAction({ type: "go-back" });
        }}
      />
    </div>
  );
}

export function BattlePartyPanel({
  copy,
  controls,
  onAction,
}: {
  copy: PokeLoungeCopy;
  controls: MobileBattleUiState;
  onAction(action: MobileBattleUiAction): void;
}) {
  return (
    <div
      className="absolute inset-[71.875%_0_0] z-20 grid grid-rows-[auto_1fr] border-[max(1px,0.18cqw)] border-[rgb(255_255_255_/_54%)] bg-[rgb(43_55_66_/_92%)] px-[0.5em] pt-[0.35em] pb-[0.45em] text-[0.56em] text-[#f8fbf0] [&>header]:flex [&>header]:justify-between [&>header]:pb-[0.25em] [&>div]:grid [&>div]:min-h-0 [&>div]:grid-cols-3 [&>div]:grid-rows-2 [&>div]:gap-[0.3em]"
      data-poke-lounge-battle-surface="party"
    >
      <header>
        <strong>
          {controls.itemTargetName
            ? `${controls.itemTargetName} · ${copy.locale === "ko-KR" ? "사용할 포켓몬" : copy.locale === "ja-JP" ? "使うポケモン" : "Choose target"}`
            : copy.game.chooseSwitchPokemon}
        </strong>
        <span>
          {controls.isForcedPartySwitch ? copy.game.forcedSwitch : `X · ${copy.mobile.back}`}
        </span>
      </header>
      <div>
        {controls.party.map(function mapItem(pokemon) {
          return (
            <button
              key={pokemon.slotIndex}
              type="button"
              className="relative grid min-w-0 grid-cols-[24%_1fr] grid-rows-2 overflow-hidden border-[max(1px,0.12cqw)] border-[#2b3742] bg-[#f4f7e3] py-[0.3em] pr-[0.35em] pl-[24%] text-left text-[#17201a] shadow-[inset_0_0_0_max(1px,0.1cqw)_#fff] data-[selected=true]:bg-[#fff4a3] data-[selected=true]:shadow-[inset_max(2px,0.5cqw)_0_#43b65c,inset_0_0_0_max(1px,0.1cqw)_#fff] data-[current=true]:border-[#355c7d] disabled:opacity-70 [&_[data-poke-lounge-battle-pokemon=party]]:top-0 [&_[data-poke-lounge-battle-pokemon=party]]:left-0 [&_[data-poke-lounge-battle-pokemon=party]]:h-full [&_[data-poke-lounge-battle-pokemon=party]]:w-[24%] [&_strong]:col-start-2 [&_strong]:overflow-hidden [&_strong]:text-ellipsis [&_strong]:whitespace-nowrap [&_small]:col-start-2 [&_small]:overflow-hidden [&_small]:text-[0.82em] [&_small]:text-ellipsis [&_small]:whitespace-nowrap"
              data-current={pokemon.isCurrent}
              data-selected={pokemon.selected}
              disabled={!pokemon.canSwitch}
              onClick={function handleClick() {
                return onAction({ type: "select-party", index: pokemon.slotIndex });
              }}
            >
              {pokemon.sprite ? (
                <BattlePokemonSprite
                  side="party"
                  view={{
                    alpha: pokemon.isFainted ? 0.34 : 1,
                    height: 18,
                    sprite: pokemon.sprite,
                    tint: null,
                    width: 18,
                    x: 10,
                    y: 10,
                  }}
                />
              ) : null}
              <strong>{pokemon.isEmpty ? `- ${copy.game.emptySlot}` : pokemon.name}</strong>
              {!pokemon.isEmpty ? (
                <small>
                  Lv.{pokemon.level} · HP {pokemon.currentHp}/{pokemon.maxHp}
                  {pokemon.status && pokemon.status !== "normal"
                    ? ` · ${copy.game.statusLabel[pokemon.status as keyof typeof copy.game.statusLabel] ?? pokemon.status}`
                    : ""}
                </small>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function BattleBagPanel({
  copy,
  controls,
  onAction,
}: {
  copy: PokeLoungeCopy;
  controls: MobileBattleUiState;
  onAction(action: MobileBattleUiAction): void;
}) {
  const selectedIndex = Math.max(
    0,
    controls.items.findIndex(function findItemIndex(item) {
      return item.selected;
    }),
  );
  const page = Math.floor(selectedIndex / BATTLE_BAG_PAGE_SIZE);
  const pageStart = page * BATTLE_BAG_PAGE_SIZE;
  const pageCount = Math.max(1, Math.ceil(controls.items.length / BATTLE_BAG_PAGE_SIZE));
  const text = getMobileUiCopy(copy.locale);
  const canBrowse = canChooseBattleAction(controls);
  return (
    <div
      className="absolute bottom-0 left-0 m-0 h-[30.208333%] w-full rounded-none border-[max(1px,0.3cqw)] border-[var(--pl-color-ink)] bg-[var(--pl-color-surface)] p-[2.34375%] font-[inherit] text-[var(--pl-color-ink)] shadow-[inset_0_0_0_max(1px,0.12cqw)_#fff,inset_0_0_0_max(2px,0.45cqw)_rgb(139_149_136_/_65%)] z-20 grid grid-cols-2 grid-rows-2 gap-[0.1em] has-[nav]:grid-rows-[repeat(2,minmax(0,1fr))_auto] [&>button]:flex [&>button]:min-w-0 [&>button]:items-center [&>button]:justify-between [&>button]:border-0 [&>button]:bg-transparent [&>button]:px-[0.5em] [&>button]:py-0 [&>button]:text-left [&>button]:text-[#17201a] [&>button[data-selected=true]]:bg-[#fff4a3] [&>button:disabled]:text-[#7a827c] [&>button>span]:min-w-0 [&>button>span]:[overflow-wrap:anywhere] [&>button>small]:ml-[0.25em] [&>button>small]:shrink-0"
      data-poke-lounge-battle-surface="bag"
    >
      {controls.items
        .slice(pageStart, pageStart + BATTLE_BAG_PAGE_SIZE)
        .map(function mapItem(item) {
          return (
            <button
              key={item.id}
              type="button"
              data-selected={item.selected}
              disabled={item.disabled}
              onClick={function handleClick() {
                return onAction({ type: "select-item", index: item.index });
              }}
            >
              <span>
                {item.selected ? "▶ " : "  "}
                {item.name}
              </span>
              <small>×{item.count}</small>
            </button>
          );
        })}
      {pageCount > 1 ? (
        <nav
          className="col-[1/-1] row-start-3 flex items-center justify-between gap-[0.4em] border-[max(1px,0.3cqw)] border-[var(--pl-color-ink)] bg-[var(--pl-color-surface)] px-[0.35em] py-[0.2em] text-[0.72em] text-[var(--pl-color-ink)] [&>button]:border-0 [&>button]:bg-transparent [&>button]:px-[0.4em] [&>button]:py-[0.25em] [&>button]:text-inherit [&>button:disabled]:cursor-default [&>button:disabled]:opacity-45"
          aria-label={localizeRuntimeText("몬스터볼", copy.locale)}
        >
          <button
            type="button"
            aria-label={text.previousPage}
            disabled={!canBrowse || page === 0}
            onClick={() => onAction({ type: "change-item-page", direction: -1 })}
          >
            ‹ {text.previousPage}
          </button>
          <span role="status" aria-live="polite">
            {page + 1} / {pageCount}
          </span>
          <button
            type="button"
            aria-label={text.nextPage}
            disabled={!canBrowse || page + 1 === pageCount}
            onClick={() => onAction({ type: "change-item-page", direction: 1 })}
          >
            {text.nextPage} ›
          </button>
        </nav>
      ) : null}
    </div>
  );
}

export function BattleWaitingPanel({ copy }: { copy: PokeLoungeCopy }) {
  return (
    <div
      className="absolute bottom-0 left-0 m-0 h-[30.208333%] w-full rounded-none border-[max(1px,0.3cqw)] border-[var(--pl-color-ink)] bg-[var(--pl-color-surface)] p-[2.34375%] font-[inherit] text-[var(--pl-color-ink)] shadow-[inset_0_0_0_max(1px,0.12cqw)_#fff,inset_0_0_0_max(2px,0.45cqw)_rgb(139_149_136_/_65%)] left-[1.171875%] z-20 flex h-[27.083333%] w-[97.65625%] items-start justify-start border-[max(2px,0.32cqw)] border-[#454d5b] bg-[#fffef4] px-[4.6875%] py-[3.90625%] pr-[13.28125%] text-left leading-[1.35] shadow-[inset_0_0_0_max(2px,0.28cqw)_#858b96,inset_0_0_0_max(4px,0.62cqw)_#f2f1e8,0_max(2px,0.28cqw)_0_var(--pl-color-gold)]"
      data-poke-lounge-battle-surface="waiting"
    >
      {copy.game.battleProcessing}
    </div>
  );
}

function BattleOptionButton({
  disabled = false,
  label,
  meta,
  onClick,
  selected,
}: {
  disabled?: boolean;
  label: string;
  meta?: string;
  onClick(): void;
  selected: boolean;
}) {
  return (
    <PixelButton selected={selected} disabled={disabled} onClick={onClick}>
      <span>
        {selected ? "▶ " : ""}
        {label}
      </span>
      {meta ? <small>{meta}</small> : null}
    </PixelButton>
  );
}

export function BattleShortcutGuide({
  copy,
  onClose,
  state,
  turnEndsAtMs,
}: {
  copy: PokeLoungeCopy;
  onClose(): void;
  state: BattlePresentationState;
  turnEndsAtMs: number | null;
}) {
  const rows = createShortcutGuideRows("battle", state.help.inputMode, copy.locale);
  const now = useBattleClock(turnEndsAtMs);
  const seconds =
    turnEndsAtMs === null ? null : Math.max(0, Math.ceil((turnEndsAtMs - now) / 1000));
  const timerCopy = getMobileUiCopy(copy.locale);
  return (
    <section
      className="absolute top-[15.625%] left-[18.75%] z-[800] min-h-[68.75%] w-[77.34375%] border-[max(2px,0.4cqw)] border-[#2b3742] bg-[#f4f7e3] px-[4.7%] py-[4%] text-[0.82em] shadow-[0.7cqw_0.7cqw_0_#8b9588,inset_0_0_0_max(1px,0.15cqw)_#fff] [&_header]:flex [&_header]:justify-between [&_header]:gap-[1em] [&_header_button]:border-0 [&_header_button]:bg-transparent [&_header_button]:p-0 [&_header_button]:text-[0.8em] [&_dl]:my-[1em] [&_dl]:grid [&_dl]:gap-[0.5em] [&_dl>div]:flex [&_dl>div]:justify-between [&_dl>div]:gap-[1em] [&_dt]:text-[#4b554f] [&_dd]:m-0 [&_p]:m-0 [&_p]:text-[0.78em] [&_p]:text-[#4b554f]"
      data-poke-lounge-battle-surface="help"
    >
      <header>
        <strong>{createShortcutGuideTitle("battle", state.help.inputMode, copy.locale)}</strong>
        <button type="button" onClick={onClose}>
          {copy.settingsClose}
        </button>
      </header>
      {seconds !== null ? (
        <p role="timer" aria-live="off" className="font-bold tabular-nums">
          {seconds > 0 ? `${timerCopy.timeLeft} ${seconds}s` : timerCopy.timeExpired}
        </p>
      ) : null}
      <dl>
        {rows.map(function mapItem(row) {
          return (
            <div key={row.action}>
              <dt>{row.action}</dt>
              <dd>{row.keys}</dd>
            </div>
          );
        })}
      </dl>
      <p>{createShortcutGuideFooter(state.help.inputMode, copy.locale)}</p>
    </section>
  );
}

export function BattleCaptureEffect({
  capture,
  layout = DESKTOP_BATTLE_STAGE_LAYOUT,
}: {
  capture: BattleCapturePresentation | null;
  layout?: BattleStageLayout;
}) {
  if (!capture) return null;
  const rayColor = capture.caught ? "#f4cf58" : "#ffffff";
  const resultProgress = capture.resultProgress;
  return (
    <div
      className="pointer-events-none absolute inset-0 z-15 [&>i]:absolute [&>i]:size-[max(2px,0.5cqw)] [&>i]:origin-top-left"
      data-poke-lounge-battle-capture="true"
      aria-hidden="true"
    >
      {capture.showBall ? (
        <span
          className="absolute aspect-square w-[4.6875%] bg-contain bg-no-repeat [image-rendering:pixelated]"
          data-ball={capture.ballItemId}
          style={{
            backgroundImage: `url(${capture.ballItemId === "ultraBall" ? ROM_BATTLE_DESIGN_ASSETS.ultraBall.path : ROM_BATTLE_DESIGN_ASSETS.pokeball.path})`,
            ...toBattleActorPointStyle({ x: capture.ballX, y: capture.ballY }, layout),
            transform: `translate(-50%, -50%) rotate(${capture.ballRotation}rad)`,
          }}
        />
      ) : null}
      {resultProgress !== null
        ? Array.from({ length: 8 }, function callback(_, index) {
            return (
              <i
                key={index}
                style={{
                  background: rayColor,
                  ...toBattleActorPointStyle({ x: capture.ballX, y: capture.ballY }, layout),
                  opacity: 1 - resultProgress * 0.55,
                  transform: `rotate(${index * 45}deg) translateX(${((7 + resultProgress * 13) / logicalWidth) * 100}cqw)`,
                }}
              />
            );
          })
        : null}
    </div>
  );
}

export function BattleEvolutionScene({ evolution }: { evolution: BattleEvolutionPresentation }) {
  const energy = createEvolutionEnergyLines(evolution.progress);
  return (
    <div
      className="pointer-events-none absolute top-1/2 right-0 left-0 z-10 h-[75cqw] -translate-y-1/2 [&_svg]:absolute [&_svg]:inset-0 [&_svg]:size-full [&_svg]:fill-none [&_svg]:stroke-[#e9fff8] [&_svg]:[stroke-width:1.4]"
      data-poke-lounge-battle-evolution="true"
    >
      <svg viewBox="0 0 256 192" aria-hidden="true">
        {energy.lines.map(function mapItem(line, index) {
          return <line key={index} {...line} opacity={energy.alpha * 0.52} />;
        })}
        <circle
          cx="128"
          cy="82"
          r={20 + ((evolution.progress * 120) % 28)}
          opacity={energy.alpha * 0.58}
        />
        <circle
          cx="128"
          cy="82"
          r={34 + ((evolution.progress * 180) % 32)}
          opacity={energy.alpha * 0.42}
        />
      </svg>
      <BattlePokemonSprite side="evolution" view={evolution.sprite} />
      <BattlePokemonSprite
        alpha={evolution.silhouetteAlpha}
        side="evolution"
        view={{ ...evolution.sprite, tint: "white" }}
      />
      {evolution.flashAlpha > 0 ? (
        <i className="absolute inset-0 bg-white" style={{ opacity: evolution.flashAlpha }} />
      ) : null}
    </div>
  );
}

export function BattleEntranceEffect({
  entrance,
}: {
  entrance: BattlePresentationState["entrance"];
}) {
  if (!entrance.active && entrance.progress >= 1) return null;
  return (
    <div
      className="pointer-events-none absolute inset-0 z-[1000] [&_i]:absolute [&_i]:block [&_i]:h-1/6 [&_i]:bg-[#f8fbf0]"
      data-poke-lounge-battle-entrance="true"
      style={{ backgroundColor: `rgb(16 24 32 / ${Math.max(0, 1 - entrance.progress)})` }}
      aria-hidden="true"
    >
      {Array.from({ length: 6 }, function callback(_, index) {
        return (
          <i
            key={index}
            style={{
              left: index % 2 === 0 ? 0 : `${entrance.progress * 100}%`,
              opacity: Math.max(0, 0.42 - entrance.progress * 0.5),
              top: `${(index / 6) * 100}%`,
              width: `${(1 - entrance.progress) * 100}%`,
            }}
          />
        );
      })}
    </div>
  );
}

function createEvolutionEnergyLines(progress: number) {
  const startProgress = Math.min(1, Math.max(0, (progress - 0.17) / 0.65));
  const endFade = Math.min(1, Math.max(0, (0.94 - progress) / 0.12));
  const alpha = Math.min(startProgress * 1.6, endFade);
  const rotation = progress * Math.PI * 1.5;
  const innerRadius = 14 + startProgress * 8;
  const outerRadius = 48 + startProgress * 20;
  return {
    alpha,
    lines: Array.from({ length: 12 }, function callback(_, index) {
      const angle = rotation + (Math.PI * 2 * index) / 12;
      return {
        x1: 128 + Math.cos(angle) * innerRadius,
        x2: 128 + Math.cos(angle) * outerRadius,
        y1: 82 + Math.sin(angle) * innerRadius,
        y2: 82 + Math.sin(angle) * outerRadius,
      };
    }),
  };
}
