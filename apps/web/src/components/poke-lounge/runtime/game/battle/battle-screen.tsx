"use client";

import { useEffect, useState, useSyncExternalStore, type CSSProperties } from "react";
import type { PokeLoungeCopy } from "../../../poke-lounge-copy";
import styles from "../../../poke-lounge.module.css";
import { primePokeLoungeAudio } from "../audio/poke-lounge-audio";
import { BATTLE_LAYOUT, getBattleStatusTextView, hpRatio, type BattleRect } from "./battle-layout";
import { ROM_BATTLE_DESIGN_ASSETS } from "./battle-design";
import type {
  BattleCapturePresentation,
  BattleCombatantPresentation,
  BattleEvolutionPresentation,
  BattlePresentationState,
  BattleSpritePresentation,
  BattleUiStore,
} from "./battle-ui-store";
import type { MobileBattleUiAction, MobileBattleUiState } from "../ui/mobile-battle-ui";
import {
  createShortcutGuideFooter,
  createShortcutGuideRows,
  createShortcutGuideTitle,
} from "../ui/shortcut-guide";
import {
  HealthBar,
  MessageBox,
  PixelButton,
  PixelPanel,
} from "../../../ui/poke-lounge-ui-primitives";
import type { GameStateStore } from "../state/game-state-store";
import {
  createTournamentBriefingText,
  TOURNAMENT_BRIEFING_DURATION_MS,
} from "../scenes/world-scene-tournament";
import { TournamentBracketPanel } from "../tournament/tournament-bracket-panel";
import {
  localizeBattlePresentationState,
  localizeMobileBattleUiState,
} from "../i18n/runtime-game-localization";

const logicalWidth = 256;
const logicalHeight = 192;

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

  if (!presentation || !controls) return null;
  const onAction = (action: MobileBattleUiAction) => {
    void primePokeLoungeAudio();
    uiStore.dispatch(action);
  };

  return (
    <section
      className={styles.battleScreen}
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
          className={styles.battleHelpButton}
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
  return (
    <div className={styles.battleStage}>
      <BattleBackground evolution={Boolean(presentation.evolution)} />
      {presentation.authoritative.spectating ? (
        <div
          className={styles.battleSpectatorBanner}
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
          <BattlePokemonLayer presentation={presentation} />
          <BattleCaptureEffect capture={presentation.capture} />
          <BattleHpPanel
            copy={copy}
            combatant={presentation.opponent}
            rect={BATTLE_LAYOUT.opponentHpPanel}
            side="opponent"
          />
          <BattleHpPanel
            copy={copy}
            combatant={presentation.player}
            rect={BATTLE_LAYOUT.playerHpPanel}
            side="player"
          />
        </>
      )}
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
      className={styles.battleBackground}
      style={{
        backgroundImage: `url(${evolution ? ROM_BATTLE_DESIGN_ASSETS.evolutionBackground.path : ROM_BATTLE_DESIGN_ASSETS.background.path})`,
      }}
    />
  );
}

export function BattlePokemonLayer({ presentation }: { presentation: BattlePresentationState }) {
  return (
    <div className={styles.battlePokemonLayer} aria-hidden="true">
      {(["opponent", "player"] as const).map(side => {
        const combatant = presentation[side];
        const fromBall = side === "player" || presentation.battleKind !== "wild";
        if (fromBall && presentation.entrance.active) return null;
        return (
          <div
            key={`${side}:${combatant.activeSlotIndex}:${combatant.sprite.sprite.path}:${combatant.sprite.sprite.frame}`}
          >
            <BattlePokemonSprite side={side} view={combatant.sprite} fromBall={fromBall} />
            {fromBall ? (
              <span
                className={styles.battleSendOutBall}
                style={{
                  left: `${(combatant.sprite.x / logicalWidth) * 100}%`,
                  top: `${(combatant.sprite.y / logicalHeight) * 100}%`,
                }}
              />
            ) : null}
            {combatant.healing ? (
              <span
                className={styles.battleHealingEffect}
                data-poke-lounge-healing={side}
                style={toCenteredRectStyle(combatant.sprite)}
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
  side,
  view,
}: {
  alpha?: number;
  fromBall?: boolean;
  side: "evolution" | "opponent" | "party" | "player";
  view: BattleSpritePresentation;
}) {
  const columns = view.sprite.columns ?? 16;
  const rows = view.sprite.rows ?? 16;
  const column = view.sprite.frame % columns;
  const row = Math.floor(view.sprite.frame / columns);
  const positionX = columns <= 1 ? 0 : (column / (columns - 1)) * 100;
  const positionY = rows <= 1 ? 0 : (row / (rows - 1)) * 100;

  return (
    <span
      className={styles.battlePokemonSprite}
      data-poke-lounge-battle-pokemon={side}
      data-from-ball={fromBall || undefined}
      style={{
        ...toCenteredRectStyle(view),
        backgroundImage: `url(${view.sprite.path})`,
        backgroundPosition: `${positionX}% ${positionY}%`,
        backgroundSize: `${columns * 100}% ${rows * 100}%`,
        filter: view.tint === "white" ? "brightness(0) invert(1)" : undefined,
        opacity: alpha ?? view.alpha,
      }}
    />
  );
}

export function BattleHpPanel({
  copy,
  combatant,
  rect,
  side,
}: {
  copy: PokeLoungeCopy;
  combatant: BattleCombatantPresentation;
  rect: BattleRect;
  side: "opponent" | "player";
}) {
  const status = getBattleStatusTextView(combatant.status);
  return (
    <PixelPanel
      className={styles.battleHpPanel}
      data-poke-lounge-battle-hp-panel={side}
      data-healing={combatant.healing || undefined}
      style={toRectStyle(rect)}
      aria-label={`${combatant.name} HP ${Math.round(combatant.displayedHp)}/${combatant.maxHp}`}
    >
      <strong>
        {combatant.name} <small>Lv.{combatant.level}</small>
      </strong>
      {status ? (
        <span style={{ color: status.color }}>{copy.game.statusLabel[combatant.status]}</span>
      ) : null}
      <HealthBar
        className={styles.battleHpTrack}
        value={hpRatio(combatant.displayedHp, combatant.maxHp)}
        aria-label={`${combatant.name} HP`}
      />
      <small className={styles.battleTrainerName} data-poke-lounge-battle-trainer={side}>
        {combatant.displayName}
      </small>
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
    return <BattleMovePanel controls={controls} onAction={onAction} />;
  }
  if (presentation.phase === "move-replace-select") {
    return <BattleMoveReplacementPanel copy={copy} controls={controls} onAction={onAction} />;
  }
  if (presentation.phase === "party-select") {
    return <BattlePartyPanel copy={copy} controls={controls} onAction={onAction} />;
  }
  if (presentation.phase === "bag-select") {
    return <BattleBagPanel controls={controls} onAction={onAction} />;
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
      className={`${styles.battleWindow} ${styles.battleMessagePanel}`}
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
    bag: copy.mobile.bag,
    fight: copy.mobile.fight,
    pokemon: copy.mobile.party,
    run: copy.mobile.run,
  };
  return (
    <div
      className={`${styles.battleWindow} ${styles.battleOptionGrid}`}
      data-poke-lounge-battle-surface="command"
    >
      {controls.commands.map(function mapItem(command, index) {
        return (
          <BattleOptionButton
            key={command.id}
            label={labels[command.id]}
            selected={command.selected}
            onClick={function handleClick() {
              return onAction({ type: "select-command", index });
            }}
          />
        );
      })}
    </div>
  );
}

export function BattleMovePanel({
  controls,
  onAction,
}: {
  controls: MobileBattleUiState;
  onAction(action: MobileBattleUiAction): void;
}) {
  return (
    <div
      className={`${styles.battleWindow} ${styles.battleOptionGrid}`}
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
  const pending = controls.moveReplacement;
  return (
    <div
      className={`${styles.battleWindow} ${styles.battleReplacementPanel}`}
      data-poke-lounge-battle-surface="move-replacement"
    >
      <strong>
        {pending ? copy.game.moveLearnPrompt(pending.newMoveName) : copy.game.moveReplacementTitle}
      </strong>
      <div className={styles.battleReplacementGrid}>
        {Array.from({ length: 4 }, function callback(_, index) {
          const move = controls.moves[index];
          return (
            <BattleOptionButton
              key={move?.index ?? `empty-${index}`}
              disabled={!move}
              label={move?.name ?? "-"}
              selected={Boolean(move?.selected)}
              onClick={function handleClick() {
                return move && onAction({ type: "select-move-replacement", index: move.index });
              }}
            />
          );
        })}
      </div>
      {controls.canGoBack ? (
        <button
          type="button"
          className={styles.battleInlineBack}
          onClick={function handleClick() {
            return onAction({ type: "go-back" });
          }}
        >
          {copy.mobile.doNotLearnMove}
        </button>
      ) : null}
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
    <div className={styles.battlePartyPanel} data-poke-lounge-battle-surface="party">
      <header>
        <strong>{copy.game.chooseSwitchPokemon}</strong>
        <span>{controls.isForcedPartySwitch ? copy.game.forcedSwitch : copy.game.backHint}</span>
      </header>
      <div>
        {controls.party.map(function mapItem(pokemon) {
          return (
            <button
              key={pokemon.slotIndex}
              type="button"
              className={styles.battlePartySlot}
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
                  {pokemon.status && pokemon.status !== "normal" ? ` · ${pokemon.status}` : ""}
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
  controls,
  onAction,
}: {
  controls: MobileBattleUiState;
  onAction(action: MobileBattleUiAction): void;
}) {
  const selectedIndex = Math.max(
    0,
    controls.items.findIndex(function findItemIndex(item) {
      return item.selected;
    }),
  );
  const pageStart = Math.floor(selectedIndex / 4) * 4;
  return (
    <div
      className={`${styles.battleWindow} ${styles.battleBagPanel}`}
      data-poke-lounge-battle-surface="bag"
    >
      {controls.items.slice(pageStart, pageStart + 4).map(function mapItem(item) {
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
    </div>
  );
}

export function BattleWaitingPanel({ copy }: { copy: PokeLoungeCopy }) {
  return (
    <div
      className={`${styles.battleWindow} ${styles.battleMessagePanel}`}
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
}: {
  copy: PokeLoungeCopy;
  onClose(): void;
  state: BattlePresentationState;
}) {
  const rows = createShortcutGuideRows("battle", state.help.inputMode, copy.locale);
  return (
    <section className={styles.battleShortcutGuide} data-poke-lounge-battle-surface="help">
      <header>
        <strong>{createShortcutGuideTitle("battle", state.help.inputMode, copy.locale)}</strong>
        <button type="button" onClick={onClose}>
          {copy.settingsClose}
        </button>
      </header>
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

export function BattleCaptureEffect({ capture }: { capture: BattleCapturePresentation | null }) {
  if (!capture) return null;
  const rayColor = capture.caught ? "#f4cf58" : "#ffffff";
  const resultProgress = capture.resultProgress;
  return (
    <div
      className={styles.battleCaptureEffect}
      data-poke-lounge-battle-capture="true"
      aria-hidden="true"
    >
      {capture.showBall ? (
        <span
          className={styles.battleCaptureBall}
          data-ball={capture.ballItemId}
          style={{
            left: `${(capture.ballX / logicalWidth) * 100}%`,
            top: `${(capture.ballY / logicalHeight) * 100}%`,
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
                  left: `${(capture.ballX / logicalWidth) * 100}%`,
                  opacity: 1 - resultProgress * 0.55,
                  top: `${(capture.ballY / logicalHeight) * 100}%`,
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
    <div className={styles.battleEvolutionScene} data-poke-lounge-battle-evolution="true">
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
        <i className={styles.battleEvolutionFlash} style={{ opacity: evolution.flashAlpha }} />
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
      className={styles.battleEntranceEffect}
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

function toRectStyle(rect: BattleRect): CSSProperties {
  return {
    height: `${(rect.height / logicalHeight) * 100}%`,
    left: `${(rect.x / logicalWidth) * 100}%`,
    top: `${(rect.y / logicalHeight) * 100}%`,
    width: `${(rect.width / logicalWidth) * 100}%`,
  };
}

function toCenteredRectStyle(rect: BattleSpritePresentation): CSSProperties {
  return {
    height: `${(rect.height / logicalHeight) * 100}%`,
    left: `${((rect.x - rect.width / 2) / logicalWidth) * 100}%`,
    top: `${((rect.y - rect.height / 2) / logicalHeight) * 100}%`,
    width: `${(rect.width / logicalWidth) * 100}%`,
  };
}
