"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { PokeLoungeCopy } from "../poke-lounge-copy";
import type {
  BattlePresentationState,
  BattleUiStore,
} from "../runtime/game/battle/battle-ui-store";
import type {
  MobileBattleUiAction,
  MobileBattleUiState,
} from "../runtime/game/ui/mobile-battle-ui";
import { MoveLearningPanel, LearnedMoveNotice } from "../runtime/game/ui/move-learning-panel";
import {
  localizeBattlePresentationState,
  localizeMobileBattleUiState,
  localizeRuntimeText,
} from "../runtime/game/i18n/runtime-game-localization";
import { primePokeLoungeAudio } from "../runtime/game/audio/poke-lounge-audio";
import { getShopItemById } from "../runtime/game/state/game-state-store";
import { MobileTaskScreen } from "./mobile-task-screen";
import { MobileItemRow, MobilePokemonCard } from "./mobile-selection-cards";
import {
  candidateAction,
  canChooseBattleAction,
  pokemonIdentity,
  selectionContext,
  type BattleCandidate,
} from "./mobile-selection-model";
import { getMobileUiCopy } from "./mobile-ui-copy";
import styles from "./mobile-ui.module.css";

const subscribeToNothing = () => () => {};
const emptySnapshot = () => null;
interface DeckProps {
  copy: PokeLoungeCopy;
  onAction(action: MobileBattleUiAction): void;
  state: MobileBattleUiState;
  presentation?: BattlePresentationState | null;
  readCurrent?: () => MobileBattleUiState | null;
}

export function useBattleClock(endsAtMs?: number | null): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (endsAtMs == null) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [endsAtMs]);
  return now;
}

export function MobileBattleContext({
  copy,
  state,
  presentation,
}: Pick<DeckProps, "copy" | "state" | "presentation">) {
  const now = useBattleClock(state.turnEndsAtMs);
  const text = getMobileUiCopy(copy.locale);
  const seconds =
    state.turnEndsAtMs == null ? null : Math.max(0, Math.ceil((state.turnEndsAtMs - now) / 1000));
  return (
    <div className={styles.battleContext}>
      {presentation ? (
        <span className={styles.matchup}>
          <span>
            {presentation.player.name}{" "}
            <small>
              {presentation.player.currentHp}/{presentation.player.maxHp}
            </small>
          </span>
          <span aria-hidden="true">vs</span>
          <span>
            {presentation.opponent.name}{" "}
            <small>
              {presentation.opponent.currentHp}/{presentation.opponent.maxHp}
            </small>
          </span>
        </span>
      ) : null}
      {seconds !== null ? (
        <span
          className={styles.timer}
          role="timer"
          aria-live="off"
          data-poke-lounge-battle-timer="true"
        >
          {seconds > 0 ? `${text.timeLeft} ${seconds}s` : text.timeExpired}
        </span>
      ) : null}
    </div>
  );
}

export function MobileBattleDeck({
  copy,
  uiStore,
}: {
  copy: PokeLoungeCopy;
  uiStore?: BattleUiStore;
}) {
  const snapshot = useSyncExternalStore(
    uiStore?.subscribe ?? subscribeToNothing,
    uiStore?.getSnapshot ?? emptySnapshot,
    emptySnapshot,
  );
  const state = snapshot?.controls
    ? localizeMobileBattleUiState(snapshot.controls, copy.locale)
    : null;
  const presentation = snapshot?.presentation
    ? localizeBattlePresentationState(snapshot.presentation, copy.locale)
    : null;
  const [runContext, setRunContext] = useState<string | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [expandedMoves, setExpandedMoves] = useState(false);
  const dockRef = useRef<HTMLDivElement>(null);
  const now = useBattleClock(state?.turnEndsAtMs);
  const text = getMobileUiCopy(copy.locale);
  const context = state ? selectionContext(state) : "";
  const readCurrent = () => {
    const current = uiStore?.getSnapshot().controls;
    return current ? localizeMobileBattleUiState(current, copy.locale) : null;
  };
  const onAction = (action: MobileBattleUiAction) => {
    void primePokeLoungeAudio();
    uiStore?.dispatch(action);
  };
  // Record discrete messages, not presentation/animation frames.
  useEffect(() => {
    if (state?.message)
      setLog(current =>
        current.at(-1) === state.message ? current : [...current.slice(-39), state.message!],
      );
  }, [state?.message]);
  useEffect(() => {
    setExpandedMoves(false);
    setRunContext(null);
    setLogOpen(false);
  }, [context]);
  useEffect(() => {
    const dock = dockRef.current;
    if (!dock || state?.phase !== "move-select" || expandedMoves) return;
    const inspect = () => {
      const grid = dock.querySelector<HTMLElement>("[data-poke-lounge-mobile-option-grid='moves']");
      if (
        grid &&
        (grid.scrollHeight > grid.clientHeight + 2 || dock.scrollHeight > dock.clientHeight + 2)
      )
        setExpandedMoves(true);
    };
    const observer = new ResizeObserver(inspect);
    observer.observe(dock);
    inspect();
    return () => observer.disconnect();
  }, [state?.phase, expandedMoves]);

  if (!state)
    return (
      <p className={styles.progress} role="status">
        {copy.mobile.preparing}
      </p>
    );
  const props: DeckProps = { copy, state, presentation, onAction, readCurrent };
  if (state.isHelpOpen) return <MobileBattleHelpDeck {...props} />;
  if (state.learnedMove && state.message)
    return (
      <MobileTaskScreen
        title={copy.game.moveReplacementTitle}
        name="battle-learned"
        backLabel={copy.mobile.back}
        context={<MobileBattleContext {...props} />}
      >
        <LearnedMoveNotice
          copy={copy}
          move={state.learnedMove}
          message={state.message}
          disabled={state.isInputLocked}
          onContinue={() => onAction({ type: "confirm-message" })}
        />
      </MobileTaskScreen>
    );
  if (state.phase === "move-replace-select" && !state.message && state.moveReplacement)
    return (
      <MobileTaskScreen
        title={copy.game.moveReplacementTitle}
        name="battle-move-replacement"
        backLabel={copy.mobile.back}
        context={<MobileBattleContext {...props} />}
      >
        <MoveLearningPanel
          copy={copy}
          pending={state.moveReplacement}
          moves={state.moves}
          disabled={state.isInputLocked}
          onSelect={index => onAction({ type: "select-move-replacement", index })}
          onConfirm={() => onAction({ type: "confirm-move-replacement" })}
          onCancel={() => onAction({ type: "go-back" })}
          onSkip={() => onAction({ type: "go-back" })}
        />
      </MobileTaskScreen>
    );

  const pending = !canChooseBattleAction(state, now);
  if (!state.message && !state.spectating && state.phase === "party-select")
    return <MobileBattlePartyDeck key={context} {...props} />;
  if (!state.message && !state.spectating && state.phase === "bag-select")
    return <MobileBattleBagDeck key={context} {...props} />;
  if (runContext === context && !pending)
    return (
      <MobileTaskScreen
        title={text.runTitle}
        name="battle-run"
        backLabel={copy.mobile.back}
        onBack={() => setRunContext(null)}
        context={<MobileBattleContext {...props} />}
        footer={
          <button
            type="button"
            className={styles.dangerButton}
            onClick={() => {
              setRunContext(null);
              const current = readCurrent();
              if (
                !current ||
                selectionContext(current) !== runContext ||
                !canChooseBattleAction(current)
              )
                return;
              const index = current.commands.findIndex(command => command.id === "run");
              if (index >= 0) onAction({ type: "select-command", index });
            }}
          >
            {text.confirmRun}
          </button>
        }
      >
        <p>{text.runDescription}</p>
      </MobileTaskScreen>
    );
  if (logOpen)
    return (
      <MobileTaskScreen
        title={text.log}
        name="battle-log"
        backLabel={copy.mobile.back}
        onBack={() => setLogOpen(false)}
      >
        {log.length ? (
          <ol className={styles.eventLog}>
            {log.map((line, index) => (
              <li key={index}>{line}</li>
            ))}
          </ol>
        ) : (
          <p>{text.noLog}</p>
        )}
      </MobileTaskScreen>
    );
  if (expandedMoves && state.phase === "move-select" && !pending)
    return (
      <MobileTaskScreen
        title={copy.mobile.chooseMove}
        name="battle-moves-expanded"
        backLabel={copy.mobile.back}
        onBack={() => onAction({ type: "go-back" })}
        context={<MobileBattleContext {...props} />}
      >
        <MobileBattleMoveDeck {...props} embedded />
      </MobileTaskScreen>
    );

  const dispatchCommand = (action: MobileBattleUiAction) => {
    if (action.type === "select-command" && state.commands[action.index]?.id === "run")
      setRunContext(context);
    else onAction(action);
  };
  return (
    <div ref={dockRef} className={styles.battleDock} data-poke-lounge-battle-dock="true">
      {pending ? (
        <div className={styles.progressSurface}>
          {state.spectating ? <strong>{copy.mobile.spectating}</strong> : null}
          {state.message ? (
            <MobileBattleMessageDeck {...props} />
          ) : (
            <p role="status">
              {state.turnEndsAtMs != null && state.turnEndsAtMs <= now
                ? text.timeExpired
                : presentation?.authoritative.inputPending
                  ? copy.mobile.actionSending
                  : state.spectating
                    ? copy.mobile.waiting
                    : copy.game.battleProcessing}
            </p>
          )}
          {log.length > 0 ? (
            <button className={styles.textButton} type="button" onClick={() => setLogOpen(true)}>
              {text.log}
            </button>
          ) : null}
        </div>
      ) : state.phase === "move-select" ? (
        <MobileBattleMoveDeck {...props} />
      ) : (
        <MobileBattleCommandDeck {...props} onAction={dispatchCommand} />
      )}
    </div>
  );
}

export function MobileBattleCommandDeck({ copy, onAction, state }: DeckProps) {
  const labels = {
    fight: copy.mobile.fight,
    bag: copy.mobile.bag,
    pokemon: copy.mobile.party,
    run: copy.mobile.run,
  };
  return (
    <div className={styles.commandGrid} data-poke-lounge-mobile-deck="battle-command">
      {state.commands.map((command, index) => (
        <button
          key={command.id}
          type="button"
          className={styles.commandButton}
          data-command={command.id}
          data-selected={command.selected}
          disabled={!canChooseBattleAction(state)}
          onClick={() => onAction({ type: "select-command", index })}
        >
          {labels[command.id]}
        </button>
      ))}
    </div>
  );
}

export function MobileBattleMoveDeck({
  copy,
  onAction,
  state,
  embedded = false,
}: DeckProps & { embedded?: boolean }) {
  const text = getMobileUiCopy(copy.locale);
  return (
    <div className={styles.moveDeck} data-poke-lounge-mobile-deck="battle-moves">
      {!embedded ? (
        <header className={styles.dockHeading}>
          <strong>{copy.mobile.chooseMove}</strong>
          <button
            type="button"
            className={styles.backButton}
            onClick={() => onAction({ type: "go-back" })}
            disabled={!state.canGoBack}
            aria-label={copy.mobile.back}
          >
            ‹ {copy.mobile.back}
          </button>
        </header>
      ) : null}
      <div className={styles.moveGrid} data-poke-lounge-mobile-option-grid="moves">
        {state.moves.map(move => (
          <button
            key={move.index}
            type="button"
            className={styles.moveButton}
            disabled={move.disabled || !canChooseBattleAction(state)}
            data-selected={move.selected}
            onClick={() => onAction({ type: "select-move", index: move.index })}
          >
            <strong>{move.name}</strong>
            <small>
              {move.type} · PP {move.pp}/{move.maxPp}
            </small>
            {move.pp <= 0 || move.effectNotice ? (
              <small>{move.pp <= 0 ? text.ppEmpty : move.effectNotice}</small>
            ) : null}
          </button>
        ))}
        {Array.from({ length: Math.max(0, 4 - state.moves.length) }, (_, index) => (
          <span
            key={`empty-${index}`}
            className={styles.emptySlot}
            data-poke-lounge-mobile-empty-slot="true"
          >
            {text.emptyMove}
          </span>
        ))}
      </div>
    </div>
  );
}

function useBattleCandidate({ state, onAction, readCurrent }: DeckProps) {
  const [candidate, setCandidate] = useState<BattleCandidate | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(false);
  const submitted = useRef(false);
  const now = useBattleClock(state.turnEndsAtMs);
  const valid = candidateAction(candidate, state, now) !== null;
  const submit = () => {
    if (submitted.current) return;
    const current = readCurrent ? readCurrent() : state;
    const action = current ? candidateAction(candidate, current) : null;
    if (!action) {
      setError(true);
      return;
    }
    submitted.current = true;
    setSubmitting(true);
    onAction(action);
    // The runtime changes phase or locks input synchronously when it accepts
    // a command. A final legality rejection must not strand this task in
    // submitting state; discard the candidate and require a fresh selection.
    const after = readCurrent?.();
    if (
      after &&
      candidate &&
      selectionContext(after) === candidate.context &&
      canChooseBattleAction(after)
    ) {
      submitted.current = false;
      setSubmitting(false);
      setCandidate(null);
      setError(true);
    }
  };
  return {
    candidate,
    choose: (next: BattleCandidate) => {
      if (submitting) return;
      setCandidate(next);
      setError(false);
    },
    submit,
    submitting,
    valid,
    invalid: error || (candidate !== null && !valid && !submitting),
  };
}

export function MobileBattlePartyDeck(props: DeckProps) {
  const { copy, state, presentation, onAction } = props;
  const text = getMobileUiCopy(copy.locale);
  const selection = useBattleCandidate(props);
  const party = state.party.filter(pokemon => !pokemon.isEmpty);
  const selected = party.find(pokemon => pokemon.slotIndex === selection.candidate?.index);
  const back =
    state.canGoBack && !state.isForcedPartySwitch && !selection.submitting
      ? () => onAction({ type: "go-back" })
      : undefined;
  return (
    <MobileTaskScreen
      title={copy.mobile.chooseParty}
      name="battle-party"
      backLabel={copy.mobile.back}
      onBack={back}
      returnFocusSelector="[data-command='pokemon']"
      context={<MobileBattleContext copy={copy} state={state} presentation={presentation} />}
      footer={
        <>
          <p className={styles.selectionSummary}>
            {selection.invalid ? text.invalidSelection : (selected?.name ?? text.selectPokemon)}
          </p>
          <button
            type="button"
            className={styles.primaryButton}
            disabled={!selection.valid || selection.submitting}
            onClick={selection.submit}
            data-poke-lounge-confirm-party="true"
          >
            {selection.submitting ? copy.mobile.actionSending : text.switchPokemon}
          </button>
        </>
      }
    >
      {state.isForcedPartySwitch ? <p role="status">{text.forcedSwitch}</p> : null}
      {!party.some(pokemon => pokemon.canSwitch && !pokemon.isCurrent && !pokemon.isFainted) ? (
        <p className={styles.emptyNotice} role="status">
          {text.noSwitch}
        </p>
      ) : null}
      <div className={styles.cardList}>
        {party.map(pokemon => (
          <MobilePokemonCard
            key={pokemon.slotIndex}
            copy={copy}
            pokemon={pokemon}
            slotIndex={pokemon.slotIndex}
            selected={selection.candidate?.index === pokemon.slotIndex}
            disabled={
              !pokemon.canSwitch || pokemon.isFainted || pokemon.isCurrent || selection.submitting
            }
            badge={pokemon.isCurrent ? copy.game.currentBattler : undefined}
            reason={
              pokemon.isFainted
                ? copy.game.statusLabel.fainted
                : !pokemon.canSwitch && !pokemon.isCurrent
                  ? text.cannotSwitch
                  : undefined
            }
            onSelect={() =>
              selection.choose({
                kind: "party",
                index: pokemon.slotIndex,
                identity: pokemonIdentity(pokemon),
                context: selectionContext(state),
              })
            }
          />
        ))}
      </div>
    </MobileTaskScreen>
  );
}

export function MobileBattleBagDeck(props: DeckProps) {
  const { copy, state, presentation, onAction } = props;
  const text = getMobileUiCopy(copy.locale);
  const selection = useBattleCandidate(props);
  const items = state.items.filter(item => item.count > 0);
  const selected = items.find(item => item.id === selection.candidate?.identity);
  const ball = selected?.id === "pokeball" || selected?.id === "ultraBall";
  const target = ball
    ? (presentation?.opponent.name ?? text.opponentTarget)
    : (presentation?.player.name ?? text.activeTarget);
  return (
    <MobileTaskScreen
      title={copy.mobile.bag}
      name="battle-bag"
      backLabel={copy.mobile.back}
      onBack={
        state.canGoBack && !selection.submitting ? () => onAction({ type: "go-back" }) : undefined
      }
      returnFocusSelector="[data-command='bag']"
      context={<MobileBattleContext copy={copy} state={state} presentation={presentation} />}
      footer={
        <>
          <p className={styles.selectionSummary}>
            {selection.invalid
              ? text.invalidSelection
              : selected
                ? `${selected.name} · ${text.target}: ${target}`
                : text.chooseItem}
          </p>
          <button
            type="button"
            className={styles.primaryButton}
            disabled={!selection.valid || selection.submitting}
            onClick={selection.submit}
            data-poke-lounge-confirm-item="true"
          >
            {selection.submitting ? copy.mobile.actionSending : text.useItem}
          </button>
        </>
      }
    >
      {!items.length ? (
        <p role="status" className={styles.emptyNotice}>
          {text.noItems}
        </p>
      ) : null}
      <div className={styles.cardList} data-poke-lounge-mobile-option-grid="items">
        {items.map(item => (
          <MobileItemRow
            key={item.id}
            id={item.id}
            name={item.name}
            count={item.count}
            description={localizeRuntimeText(
              getShopItemById(item.id)?.description ?? "",
              copy.locale,
            )}
            selected={selection.candidate?.identity === item.id}
            disabled={item.disabled || selection.submitting}
            reason={item.disabled ? text.unavailable : undefined}
            onSelect={() =>
              selection.choose({
                kind: "item",
                index: item.index,
                identity: item.id,
                context: selectionContext(state),
              })
            }
          />
        ))}
      </div>
    </MobileTaskScreen>
  );
}

export function MobileBattleHelpDeck({
  copy,
  onAction,
}: {
  copy: PokeLoungeCopy;
  onAction(action: MobileBattleUiAction): void;
}) {
  return (
    <MobileTaskScreen
      title={copy.mobile.help}
      name="battle-help"
      backLabel={copy.settingsClose}
      onBack={() => onAction({ type: "toggle-help" })}
      returnFocusSelector="[data-poke-lounge-mobile-menu='true']"
    >
      <ul className={styles.helpList}>
        <li>
          <strong>{copy.mobile.battleDeckLabel}</strong>
          <p>{copy.mobile.battleHelpChoose}</p>
        </li>
        <li>
          <strong>{copy.noticeConfirm}</strong>
          <p>{copy.mobile.battleHelpAdvance}</p>
        </li>
        <li>
          <strong>{copy.mobile.back}</strong>
          <p>{copy.mobile.battleHelpBack}</p>
        </li>
      </ul>
    </MobileTaskScreen>
  );
}

export function MobileBattleMessageDeck({ copy, onAction, state }: DeckProps) {
  if (!state.message) return null;
  return (
    <div className={styles.message} data-poke-lounge-mobile-deck="battle-message">
      <p role="status" data-poke-lounge-mobile-battle-message="true">
        {state.message}
      </p>
      {state.requiresConfirmation ? (
        <button
          type="button"
          className={styles.primaryButton}
          disabled={state.isInputLocked}
          onClick={() => onAction({ type: "confirm-message" })}
        >
          {copy.noticeConfirm}
        </button>
      ) : null}
    </div>
  );
}
export function MobileBattleWaitingDeck({ copy }: { copy: PokeLoungeCopy }) {
  return (
    <p className={styles.progress} role="status">
      {copy.mobile.waiting}
    </p>
  );
}
