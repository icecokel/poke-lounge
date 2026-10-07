"use client";
import { POKE_LOUNGE_CLOCK_REFRESH_INTERVAL_MS } from "@poke-lounge/battle/timing";

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
import { getInventoryItemById } from "../runtime/game/state/game-state-store";
import { OpponentPartyIndicator } from "../runtime/game/battle/opponent-party-indicator";
import { MobileTaskScreen } from "./mobile-task-screen";
import { MobileItemRow, MobilePokemonCard, MobilePokemonThumbnail } from "./mobile-selection-cards";
import {
  getBattlePadCommands,
  getBattlePadParty,
} from "@/features/poke-lounge/presentation/battle/command-pad-model";
import {
  candidateAction,
  canChooseBattleAction,
  canChooseBattleCommand,
  pokemonIdentity,
  selectionContext,
  type BattleCandidate,
} from "./mobile-selection-model";
import { getMobileUiCopy } from "./mobile-ui-copy";
import { getBattleMoveDetails } from "@/features/poke-lounge/presentation/battle/move-details";

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
    const timer = window.setInterval(
      () => setNow(Date.now()),
      POKE_LOUNGE_CLOCK_REFRESH_INTERVAL_MS,
    );
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
    <div className="grid gap-1.5">
      {presentation ? (
        <span className="flex flex-wrap items-center gap-2.5 [&_small]:text-[inherit] [&_small]:tabular-nums">
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
      {presentation?.battleKind === "trainer" && presentation.opponentParty ? (
        <OpponentPartyIndicator
          summary={presentation.opponentParty}
          locale={copy.locale}
          desktop={false}
          inline
        />
      ) : null}
      {seconds !== null ? (
        <span
          className="text-sm font-bold tabular-nums"
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
  useEffect(() => {
    setRunContext(null);
  }, [context]);

  if (!state)
    return (
      <p className="p-4 text-base leading-[1.45]" role="status">
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
            className="min-h-14 w-full touch-manipulation rounded-lg border-2 border-[#543e38] bg-[linear-gradient(#ac5748_50%,#864033_50%)] px-3 py-2 font-bold text-white shadow-[var(--hg-button)] focus-visible:outline-3 focus-visible:outline-[#a45a14] focus-visible:outline-offset-3 disabled:cursor-default disabled:border-[#8d9c98] disabled:bg-[#d8e0d6] disabled:text-[#536164] disabled:shadow-[inset_0_0_0_2px_#eef0e8]"
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

  const dispatchCommand = (action: MobileBattleUiAction) => {
    if (action.type === "select-command") {
      const command = state.commands[action.index];
      if (!command || !canChooseBattleCommand(state, command.id)) return;
    }
    if (action.type === "select-command" && state.commands[action.index]?.id === "run")
      setRunContext(context);
    else onAction(action);
  };
  return (
    <div
      className="h-full min-h-0 overflow-auto overscroll-contain p-2 leading-[1.4] text-[#17231c]"
      data-poke-lounge-battle-dock="true"
    >
      {pending ? (
        <div className="flex min-h-full flex-col items-stretch justify-start gap-3 pt-1 [&>p]:m-0 [&>p]:text-base [&>p]:leading-[1.45]">
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
  const text = getMobileUiCopy(copy.locale);
  const labels = {
    fight: copy.mobile.fight,
    bag: localizeRuntimeText("몬스터볼", copy.locale),
    pokemon: copy.mobile.party,
    run: text.runCommand,
  };
  const activePokemon = state.party.find(pokemon => pokemon.isCurrent && !pokemon.isEmpty);
  return (
    <div
      className="relative isolate mx-auto grid h-full min-h-[222px] w-full max-w-[560px] grid-rows-[30px_minmax(186px,1fr)] rounded-lg border-[3px] border-[#3c4038] bg-[repeating-linear-gradient(0deg,#edf6db_0_24px,#e6f0d1_24px_48px)] before:pointer-events-none before:absolute before:top-[54%] before:left-1/2 before:-z-10 before:aspect-square before:w-[58%] before:-translate-x-1/2 before:-translate-y-1/2 before:rounded-full before:border-[12px] before:border-[#d2dfc0] before:content-['']"
      data-poke-lounge-mobile-deck="battle-command"
      data-poke-lounge-command-layout="heartgold"
    >
      <div
        className="flex items-center gap-[9px] rounded-t px-3 py-1 border-b-2 border-[#c1d8aa] bg-[#83ce7b]"
        role="group"
        aria-label={copy.mobile.party}
      >
        {getBattlePadParty(state.party).map(({ slotIndex, pokemon, status }) => (
          <span
            key={slotIndex}
            className="relative size-[19px] shrink-0 rounded-full border-2 border-[#394139] bg-[linear-gradient(#e7514d_0_42%,#394139_42%_59%,#fffbea_59%)] shadow-[0_1px_0_#fffbea] after:absolute after:inset-1 after:rounded-full after:border-2 after:border-[#394139] after:bg-[#fffbea] after:content-[''] data-[active=true]:outline-2 data-[active=true]:outline-[#fff6aa] data-[active=true]:outline-offset-2 data-[state=empty]:border-dashed data-[state=empty]:border-[#4e7750] data-[state=empty]:bg-[#acdba0] data-[state=empty]:shadow-none data-[state=empty]:after:hidden data-[state=fainted]:bg-[#c6c9b9] data-[state=fainted]:after:-inset-[3px] data-[state=fainted]:after:grid data-[state=fainted]:after:place-items-center data-[state=fainted]:after:rounded-none data-[state=fainted]:after:border-0 data-[state=fainted]:after:bg-transparent data-[state=fainted]:after:text-[21px] data-[state=fainted]:after:leading-[19px] data-[state=fainted]:after:font-black data-[state=fainted]:after:text-[#394139] data-[state=fainted]:after:content-['×']"
            role="img"
            aria-label={`${slotIndex + 1}. ${
              pokemon
                ? `${pokemon.name} · ${
                    status === "fainted"
                      ? copy.game.statusLabel.fainted
                      : `HP ${pokemon.currentHp}/${pokemon.maxHp}`
                  }${pokemon.isCurrent ? ` · ${copy.game.currentBattler}` : ""}`
                : copy.game.emptySlot
            }`}
            data-poke-lounge-party-ball={slotIndex}
            data-state={status}
            data-active={pokemon?.isCurrent || undefined}
          />
        ))}
      </div>
      <div className="grid min-w-0 grid-cols-3 grid-rows-[minmax(96px,1.8fr)_minmax(64px,1fr)] gap-x-2 gap-y-2.5 px-2 pt-2 pb-2.5">
        {getBattlePadCommands(state.commands).map(command => (
          <button
            key={command.id}
            type="button"
            className="group/command relative flex min-h-16 min-w-0 touch-manipulation flex-col items-center justify-center gap-1 rounded-[13px] border-[3px] border-[#3c4038] bg-[linear-gradient(var(--command-light)_0_49%,var(--command-dark)_49%_100%)] px-1.5 py-2 text-[#fffdf0] shadow-[inset_0_0_0_2px_#fffbea,inset_0_-5px_0_#ffffff30,0_3px_0_#3c4038] [--command-light:#f13c3c] [--command-dark:#a83939] hover:brightness-105 focus-visible:outline-3 focus-visible:outline-[#18364d] focus-visible:outline-offset-3 active:translate-y-0.5 active:shadow-[inset_0_0_0_2px_#fffbea,inset_0_4px_0_#00000025,0_1px_0_#3c4038] data-[command=fight]:col-span-3 data-[command=fight]:mx-[7%] data-[command=fight]:min-h-24 data-[command=bag]:[--command-light:#e9a126] data-[command=bag]:[--command-dark:#987135] data-[command=run]:[--command-light:#2898c8] data-[command=run]:[--command-dark:#386c87] data-[command=pokemon]:[--command-light:#62ad27] data-[command=pokemon]:[--command-dark:#4f7740] disabled:cursor-not-allowed disabled:[--command-light:#b3bdac] disabled:[--command-dark:#7c8a75]"
            data-command={command.id}
            data-selected={command.selected}
            disabled={!canChooseBattleCommand(state, command.id)}
            onClick={() => onAction({ type: "select-command", index: command.index })}
          >
            <span className="flex w-full min-w-0 items-center justify-center gap-2 [&_strong]:font-[var(--pl-font-game)] [&_strong]:text-lg [&_strong]:leading-[1.3] [&_strong]:font-extrabold [&_strong]:[overflow-wrap:anywhere] [&_strong]:[word-break:keep-all] [&_strong]:[text-shadow:-1px_-1px_0_#343b36,1px_-1px_0_#343b36,-1px_1px_0_#343b36,2px_2px_0_#343b36] group-data-[command=fight]/command:[&_strong]:text-[1.625rem]">
              {command.id === "fight" && activePokemon?.sprite ? (
                <MobilePokemonThumbnail sprite={activePokemon.sprite} />
              ) : null}
              <strong>{labels[command.id]}</strong>
            </span>
            {command.id === "bag" && state.canCapture ? (
              <small className="block max-w-full text-xs font-semibold leading-[1.35] [overflow-wrap:anywhere]">
                {text.captureHint}
              </small>
            ) : (state.isAuthoritative && command.id === "run") ||
              (command.id === "bag" && !state.canCapture) ? (
              <small className="block max-w-full text-xs font-semibold leading-[1.35] [overflow-wrap:anywhere]">
                {text.competitiveUnavailable}
              </small>
            ) : null}
          </button>
        ))}
      </div>
    </div>
  );
}

export function MobileBattleMoveDeck({ copy, onAction, state }: DeckProps) {
  useEffect(() => {
    const handleBack = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape" || !state.canGoBack || event.defaultPrevented) return;
      if (document.querySelector("[data-poke-lounge-mobile-task]")) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      onAction({ type: "go-back" });
    };
    window.addEventListener("keydown", handleBack, true);
    return () => window.removeEventListener("keydown", handleBack, true);
  }, [state.canGoBack, onAction]);
  const text = getMobileUiCopy(copy.locale);
  return (
    <div
      className="mx-auto flex h-full min-h-0 w-full max-w-[560px] flex-col gap-2 rounded-lg border-[3px] border-[#3c4038] bg-[repeating-linear-gradient(0deg,#edf6db_0_24px,#e6f0d1_24px_48px)] p-2"
      data-poke-lounge-mobile-deck="battle-moves"
    >
      <header className="flex shrink-0 items-center justify-between gap-2 [&_strong]:text-base">
        <strong>{copy.mobile.chooseMove}</strong>
        <button
          type="button"
          className="inline-flex min-h-12 min-w-12 touch-manipulation items-center justify-center gap-1.5 rounded-[7px] border-2 border-[#304550] bg-[linear-gradient(#fffdf0_50%,#dce7db_50%)] px-3 py-2 font-bold text-[#304550] shadow-[inset_0_0_0_2px_#fffdf0,0_2px_0_#304550] focus-visible:outline-3 focus-visible:outline-[#a45a14] focus-visible:outline-offset-3 disabled:opacity-60"
          onClick={() => onAction({ type: "go-back" })}
          disabled={!state.canGoBack}
          aria-label={copy.mobile.back}
        >
          ‹ {copy.mobile.back}
        </button>
      </header>
      <div
        className="grid min-h-0 flex-1 grid-cols-2 auto-rows-max content-start gap-2 overflow-y-auto overscroll-contain p-1 [scroll-padding-block:4px]"
        data-poke-lounge-mobile-option-grid="moves"
      >
        {state.moves.map(move => (
          <button
            key={move.index}
            type="button"
            className="grid min-h-[72px] min-w-0 touch-manipulation content-center gap-1 rounded-xl border-[3px] border-[#52594b] bg-[linear-gradient(#fffdf2_0_49%,#e9e5d3_49%_100%)] p-2.5 text-left text-[#17231c] shadow-[inset_0_0_0_2px_#fffef5,0_2px_0_#52594b] focus-visible:outline-3 focus-visible:outline-[#a45a14] focus-visible:outline-offset-3 active:translate-y-px active:shadow-[inset_0_0_0_2px_#fffef5] disabled:cursor-default disabled:border-dashed disabled:bg-[#e7eddf] [&_strong]:text-base [&_strong]:leading-[1.4] [&_strong]:[overflow-wrap:anywhere] [&_small]:text-sm [&_small]:leading-[1.4] [&_small]:[overflow-wrap:anywhere]"
            disabled={move.disabled || !canChooseBattleAction(state)}
            data-selected={move.selected}
            onClick={() => onAction({ type: "select-move", index: move.index })}
          >
            <strong>{move.name}</strong>
            <small>
              {move.type} · PP {move.pp}/{move.maxPp}
            </small>
            <small>{getBattleMoveDetails(move, copy.locale).stats}</small>
            {move.pp <= 0 || move.effectNotice ? (
              <small>{move.pp <= 0 ? text.ppEmpty : move.effectNotice}</small>
            ) : null}
          </button>
        ))}
        {Array.from({ length: Math.max(0, 4 - state.moves.length) }, (_, index) => (
          <span
            key={`empty-${index}`}
            className="grid min-h-[72px] place-items-center rounded-[10px] border border-dashed border-[#87967e] p-2 text-sm text-[#53634e]"
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
      title={
        state.itemTargetName
          ? `${state.itemTargetName} · ${copy.locale === "ko-KR" ? "대상 선택" : copy.locale === "ja-JP" ? "対象" : "Target"}`
          : copy.mobile.chooseParty
      }
      name="battle-party"
      backLabel={copy.mobile.back}
      onBack={back}
      returnFocusSelector="[data-command='pokemon']"
      context={<MobileBattleContext copy={copy} state={state} presentation={presentation} />}
      footer={
        <>
          <p className="border-l-4 border-[var(--hg-accent)] pl-2.5 text-sm text-[var(--hg-ink)] [overflow-wrap:anywhere]">
            {selection.invalid ? text.invalidSelection : (selected?.name ?? text.selectPokemon)}
          </p>
          <button
            type="button"
            className="min-h-14 w-full touch-manipulation rounded-lg border-2 border-[#304550] bg-[linear-gradient(#5c9268_50%,#3a694c_50%)] px-3 py-2 font-bold text-white shadow-[var(--hg-button)] focus-visible:outline-3 focus-visible:outline-[#a45a14] focus-visible:outline-offset-3 disabled:cursor-default disabled:border-[#8d9c98] disabled:bg-[#d8e0d6] disabled:text-[#536164] disabled:shadow-[inset_0_0_0_2px_#eef0e8]"
            disabled={!selection.valid || selection.submitting}
            onClick={selection.submit}
            data-poke-lounge-confirm-party="true"
          >
            {selection.submitting
              ? copy.mobile.actionSending
              : state.itemTargetName
                ? text.useItem
                : text.switchPokemon}
          </button>
        </>
      }
    >
      {state.itemTargetName ? (
        <p role="status">
          {state.itemTargetName} ·{" "}
          {copy.locale === "ko-KR"
            ? "사용할 포켓몬을 선택하세요"
            : copy.locale === "ja-JP"
              ? "使うポケモンを選んでください"
              : "Choose a target Pokémon"}
        </p>
      ) : null}
      {state.isForcedPartySwitch ? <p role="status">{text.forcedSwitch}</p> : null}
      {!party.some(pokemon => pokemon.canSwitch) ? (
        <p className="rounded-[10px] border border-[#a6b69d] bg-[#fffef5] p-4" role="status">
          {text.noSwitch}
        </p>
      ) : null}
      <div className="grid grid-cols-[minmax(0,1fr)] content-start gap-2">
        {party.map(pokemon => (
          <MobilePokemonCard
            key={pokemon.slotIndex}
            copy={copy}
            pokemon={pokemon}
            slotIndex={pokemon.slotIndex}
            selected={selection.candidate?.index === pokemon.slotIndex}
            disabled={!pokemon.canSwitch || selection.submitting}
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
      title={localizeRuntimeText("몬스터볼", copy.locale)}
      name="battle-bag"
      backLabel={copy.mobile.back}
      onBack={
        state.canGoBack && !selection.submitting ? () => onAction({ type: "go-back" }) : undefined
      }
      returnFocusSelector="[data-command='bag']"
      context={<MobileBattleContext copy={copy} state={state} presentation={presentation} />}
      footer={
        <>
          <p className="border-l-4 border-[var(--hg-accent)] pl-2.5 text-sm text-[var(--hg-ink)] [overflow-wrap:anywhere]">
            {selection.invalid
              ? text.invalidSelection
              : selected
                ? `${selected.name} · ${text.target}: ${target}`
                : text.chooseItem}
          </p>
          <button
            type="button"
            className="min-h-14 w-full touch-manipulation rounded-lg border-2 border-[#304550] bg-[linear-gradient(#5c9268_50%,#3a694c_50%)] px-3 py-2 font-bold text-white shadow-[var(--hg-button)] focus-visible:outline-3 focus-visible:outline-[#a45a14] focus-visible:outline-offset-3 disabled:cursor-default disabled:border-[#8d9c98] disabled:bg-[#d8e0d6] disabled:text-[#536164] disabled:shadow-[inset_0_0_0_2px_#eef0e8]"
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
        <p role="status" className="rounded-[10px] border border-[#a6b69d] bg-[#fffef5] p-4">
          {text.noItems}
        </p>
      ) : null}
      <div
        className="grid grid-cols-[minmax(0,1fr)] content-start gap-2"
        data-poke-lounge-mobile-option-grid="items"
      >
        {items.map(item => (
          <MobileItemRow
            key={item.id}
            id={item.id}
            name={item.name}
            count={item.count}
            description={localizeRuntimeText(
              getInventoryItemById(item.id)?.description ?? "",
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

export function MobileBattleHelpDeck({ copy, onAction, state, presentation }: DeckProps) {
  return (
    <MobileTaskScreen
      title={copy.mobile.help}
      name="battle-help"
      backLabel={copy.settingsClose}
      onBack={() => onAction({ type: "toggle-help" })}
      returnFocusSelector="[data-poke-lounge-mobile-menu='true']"
      context={<MobileBattleContext copy={copy} state={state} presentation={presentation} />}
    >
      <ul className="m-0 grid list-none gap-3 p-0 [&_li]:rounded-[10px] [&_li]:border [&_li]:border-[#9dad93] [&_li]:bg-[#fffef5] [&_li]:p-4 [&_p]:mt-2">
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
    <div
      className="grid gap-3 [&>p]:whitespace-pre-line [&>p]:rounded-lg [&>p]:border-[3px] [&>p]:border-[#304550] [&>p]:bg-[#fffdf0] [&>p]:px-4 [&>p]:py-3.5 [&>p]:text-base [&>p]:leading-[1.5] [&>p]:text-[#304550] [&>p]:shadow-[inset_0_0_0_2px_#fffdf0,inset_0_0_0_4px_#a8bcb1] [&>p]:[overflow-wrap:anywhere]"
      data-poke-lounge-mobile-deck="battle-message"
    >
      <p role="status" data-poke-lounge-mobile-battle-message="true">
        {state.message}
      </p>
      {state.requiresConfirmation ? (
        <button
          type="button"
          className="min-h-14 w-full touch-manipulation rounded-lg border-2 border-[#304550] bg-[linear-gradient(#5c9268_50%,#3a694c_50%)] px-3 py-2 font-bold text-white shadow-[var(--hg-button)] focus-visible:outline-3 focus-visible:outline-[#a45a14] focus-visible:outline-offset-3 disabled:cursor-default disabled:border-[#8d9c98] disabled:bg-[#d8e0d6] disabled:text-[#536164] disabled:shadow-[inset_0_0_0_2px_#eef0e8]"
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
    <p className="p-4 text-base leading-[1.45]" role="status">
      {copy.mobile.waiting}
    </p>
  );
}
