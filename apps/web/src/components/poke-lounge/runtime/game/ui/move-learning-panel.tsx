"use client";

import { Button } from "@/components/ui/button";
import { getBattleMoveDetails } from "@/features/poke-lounge/presentation/battle/move-details";
import { cn } from "@/lib/utils";
import { getRuntimePokemonMoveDetails } from "@poke-lounge/battle/adventure/data/game-data-json";
import { useEffect, useId, useRef, type KeyboardEvent } from "react";
import type { PokeLoungeCopy } from "../../../poke-lounge-copy";
import { localizeTypeName } from "../i18n/runtime-game-localization";
import { getMoveLearningCopy } from "./move-learning-copy";
import type { MoveLearningChoice, MoveLearningSummary } from "./move-learning-model";

const PANEL_CLASS =
  "flex w-full min-w-0 flex-col gap-3 rounded-xl border-[3px] border-[#28583c] bg-[#f8fbef] p-[clamp(12px,2.5cqw,22px)] text-[clamp(14px,2cqw,20px)] leading-6 text-[#17251c] shadow-[0_5px_0_#17251c] [overflow-wrap:anywhere]";

const MOVE_CARD_CLASS =
  "grid min-w-0 gap-1 rounded-lg border-2 border-[#ad8639] bg-[#fff0bd] px-3.5 py-2.5";

const ACTION_CLASS =
  "min-h-11 flex-1 rounded-[7px] border-2 border-[#28583c] bg-white px-3.5 py-[9px] font-bold text-[#17251c] shadow-none hover:bg-[#edf4e8] hover:text-[#17251c] focus-visible:border-[#28583c] focus-visible:ring-0 focus-visible:outline-3 focus-visible:outline-[#bb7414] focus-visible:outline-offset-3 disabled:cursor-default disabled:opacity-55";

function MoveLearningDetails({
  copy,
  move,
  id,
  summaryOnly = false,
}: {
  copy: PokeLoungeCopy;
  move: { id?: number; pp?: number; maxPp?: number; type?: string };
  id?: string;
  summaryOnly?: boolean;
}) {
  const data = move.id == null ? null : getRuntimePokemonMoveDetails(move.id);
  const details = data ? getBattleMoveDetails(data, copy.locale) : null;
  const maxPp = move.maxPp ?? data?.pp;
  const type = move.type ?? (data ? localizeTypeName(data.typeName, copy.locale) : null);

  return (
    <span
      id={id}
      className="grid min-w-0 gap-1 text-[0.85em] leading-6 font-normal whitespace-normal text-[#43553f]"
    >
      <span>
        {[
          type,
          summaryOnly ? null : details?.category,
          maxPp == null ? null : `PP ${move.pp ?? maxPp}/${maxPp}`,
        ]
          .filter(Boolean)
          .join(" · ")}
      </span>
      {details && !summaryOnly && (
        <>
          <span>{details.stats}</span>
          <span>{details.description}</span>
        </>
      )}
    </span>
  );
}

function stopButtonKeyPropagation(event: KeyboardEvent<HTMLElement>): void {
  if (
    event.target instanceof HTMLButtonElement &&
    (event.code === "Enter" || event.code === "Space")
  ) {
    event.stopPropagation();
    if (event.repeat) event.preventDefault();
  }
}

export function MoveLearningPanel({
  copy,
  pending,
  moves,
  disabled = false,
  onSelect,
  onConfirm,
  onCancel,
  onSkip,
}: {
  copy: PokeLoungeCopy;
  pending: MoveLearningSummary;
  moves: MoveLearningChoice[];
  disabled?: boolean;
  onSelect(index: number): void;
  onConfirm(): void;
  onCancel(): void;
  onSkip(): void;
}) {
  const text = getMoveLearningCopy(copy.locale);
  const titleId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const selected =
    pending.confirmationIndex == null
      ? null
      : moves.find(function findMove(move) {
          return move.index === pending.confirmationIndex;
        });
  const confirming = Boolean(selected);
  const target = selected ?? moves.find(move => move.selected) ?? moves[0];

  useEffect(
    function focusConfirmation() {
      if (confirming) headingRef.current?.focus({ preventScroll: true });
    },
    [confirming],
  );

  return (
    <section
      className={PANEL_CLASS}
      aria-labelledby={titleId}
      data-poke-lounge-move-learning={confirming ? "confirm" : "select"}
      onKeyDownCapture={stopButtonKeyPropagation}
      onKeyUpCapture={stopButtonKeyPropagation}
    >
      <header className="grid gap-1.5">
        <span className="w-fit rounded-md bg-[#28583c] px-2.5 py-[3px] font-extrabold text-white">
          {text.title}
        </span>
        <h2 id={titleId} ref={headingRef} className="m-0 text-[1.25em] font-bold" tabIndex={-1}>
          {confirming ? text.confirmTitle : pending.pokemonName}
        </h2>
      </header>
      <div className="grid grid-cols-2 items-start gap-2">
        <div className={MOVE_CARD_CLASS} data-poke-lounge-mobile-move-replacement="true">
          <small>{text.newMove}</small>
          <strong className="text-[1.1em]">{pending.newMoveName}</strong>
          <MoveLearningDetails
            copy={copy}
            move={{
              id: pending.newMoveId,
              pp: pending.newMovePp,
              maxPp: pending.newMoveMaxPp,
              type: pending.newMoveType,
            }}
          />
        </div>
        {target && (
          <div className={cn(MOVE_CARD_CLASS, "border-[#a4b0a1] bg-[#edf0e8]")}>
            <small>{text.oldMove}</small>
            <strong className="text-[1.1em]">{target.name}</strong>
            <MoveLearningDetails copy={copy} move={target} />
          </div>
        )}
      </div>
      {selected && (
        <p className="m-0 text-[1.05em] font-bold whitespace-pre-line" role="status">
          {text.question(pending.pokemonName, selected.name, pending.newMoveName)}
        </p>
      )}
      <div className="grid gap-2">
        <strong>
          {text.currentMoves} ({moves.length})
        </strong>
        <div className="grid grid-cols-2 gap-2">
          {moves.map(function renderMove(move) {
            const isTarget = target?.index === move.index;
            return (
              <Button
                key={move.index}
                type="button"
                variant="outline"
                className={cn(
                  "grid h-auto min-h-[58px] min-w-0 content-start justify-items-start gap-1 rounded-[7px] border-2 border-[#80957e] bg-white px-3 py-[9px] text-left whitespace-normal text-[#17251c] shadow-none hover:bg-[#edf4e8] hover:text-[#17251c] focus-visible:border-[#28583c] focus-visible:ring-0 focus-visible:outline-3 focus-visible:outline-[#bb7414] focus-visible:outline-offset-3 disabled:cursor-default disabled:opacity-55",
                  isTarget && "border-[#28583c] shadow-[inset_4px_0_#28583c]",
                )}
                disabled={disabled}
                data-selected={isTarget}
                data-poke-lounge-move-choice={move.index}
                aria-pressed={isTarget}
                aria-label={`${move.name} · ${copy.mobile.forgetMove} → ${pending.newMoveName}`}
                aria-describedby={`${titleId}-move-${move.index}`}
                onClick={function chooseMove() {
                  if (confirming) onCancel();
                  onSelect(move.index);
                }}
              >
                <strong>{move.name}</strong>
                <MoveLearningDetails
                  id={`${titleId}-move-${move.index}`}
                  copy={copy}
                  move={move}
                  summaryOnly
                />
              </Button>
            );
          })}
        </div>
      </div>
      {selected ? (
        <>
          <p className="m-0 text-[0.85em] text-[#43553f]">{text.confirmHint}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              className={ACTION_CLASS}
              disabled={disabled}
              onClick={onCancel}
            >
              {text.cancel}
            </Button>
            <Button
              type="button"
              className={cn(
                ACTION_CLASS,
                "bg-[#28583c] text-white hover:bg-[#214b33] hover:text-white",
              )}
              disabled={disabled}
              data-primary="true"
              data-poke-lounge-approve-move
              onClick={onConfirm}
            >
              {text.confirm}
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="m-0 text-[0.85em] text-[#43553f]">{text.hint}</p>
          <Button
            type="button"
            variant="outline"
            className={cn(ACTION_CLASS, "self-start flex-none border-[#9aaa91]")}
            disabled={disabled}
            onClick={onSkip}
          >
            {copy.mobile.doNotLearnMove}
          </Button>
        </>
      )}
    </section>
  );
}

export function LearnedMoveNotice({
  copy,
  move,
  message,
  disabled,
  onContinue,
}: {
  copy: PokeLoungeCopy;
  move: MoveLearningSummary;
  message: string;
  disabled: boolean;
  onContinue(): void;
}) {
  const text = getMoveLearningCopy(copy.locale);

  return (
    <section
      className={PANEL_CLASS}
      data-poke-lounge-move-learned="true"
      aria-label={text.learned}
      onKeyDownCapture={stopButtonKeyPropagation}
      onKeyUpCapture={stopButtonKeyPropagation}
    >
      <header className="grid gap-1.5">
        <span className="w-fit rounded-md bg-[#28583c] px-2.5 py-[3px] font-extrabold text-white">
          {text.learned}
        </span>
        <h2 className="m-0 text-[1.25em] font-bold">{move.pokemonName}</h2>
      </header>
      <div className={MOVE_CARD_CLASS}>
        <strong className="text-[1.4em]">{move.newMoveName}</strong>
        <small>
          {move.newMoveType} · PP {move.newMoveMaxPp}
        </small>
      </div>
      <p
        className="m-0 text-[1.05em] font-bold whitespace-pre-line"
        role="status"
        data-poke-lounge-mobile-battle-message="true"
      >
        {message}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          className={cn(
            ACTION_CLASS,
            "bg-[#28583c] text-white hover:bg-[#214b33] hover:text-white",
          )}
          data-primary="true"
          disabled={disabled}
          onClick={onContinue}
        >
          {text.next}
        </Button>
      </div>
    </section>
  );
}
