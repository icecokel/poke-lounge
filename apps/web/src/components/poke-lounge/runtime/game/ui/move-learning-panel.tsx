"use client";
import { useEffect, useId, useRef, type KeyboardEvent } from "react";
import type { PokeLoungeCopy } from "../../../poke-lounge-copy";
import { getMoveLearningCopy } from "./move-learning-copy";
import type { MoveLearningChoice, MoveLearningSummary } from "./move-learning-model";
import styles from "./move-learning-panel.module.css";

// A native button must not also trigger the game's confirmation handler.
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
  useEffect(
    function focusConfirmation() {
      if (confirming) headingRef.current?.focus({ preventScroll: true });
    },
    [confirming],
  );
  return (
    <section
      className={styles.panel}
      aria-labelledby={titleId}
      data-poke-lounge-move-learning={confirming ? "confirm" : "select"}
      onKeyDownCapture={stopButtonKeyPropagation}
      onKeyUpCapture={stopButtonKeyPropagation}
    >
      <header className={styles.heading}>
        <span className={styles.badge}>{text.title}</span>
        <h2 id={titleId} ref={headingRef} tabIndex={-1}>
          {confirming ? text.confirmTitle : pending.pokemonName}
        </h2>
      </header>
      {selected ? (
        <>
          <p className={styles.question} role="status">
            {text.question(pending.pokemonName, selected.name, pending.newMoveName)}
          </p>
          <div className={styles.comparison}>
            <div className={styles.oldMove}>
              <small>{text.oldMove}</small>
              <strong>{selected.name}</strong>
            </div>
            <span aria-hidden="true">→</span>
            <div className={styles.newMove}>
              <small>{text.newMove}</small>
              <strong>{pending.newMoveName}</strong>
            </div>
          </div>
          <p className={styles.hint}>{text.confirmHint}</p>
          <div className={styles.actions}>
            <button type="button" disabled={disabled} onClick={onCancel}>
              {text.cancel}
            </button>
            <button
              type="button"
              disabled={disabled}
              data-primary="true"
              data-poke-lounge-approve-move
              onClick={onConfirm}
            >
              {text.confirm}
            </button>
          </div>
        </>
      ) : (
        <>
          <div className={styles.newMove} data-poke-lounge-mobile-move-replacement="true">
            <strong>{pending.newMoveName}</strong>
            <small>
              {[
                pending.newMoveType,
                pending.newMoveMaxPp == null
                  ? null
                  : `PP ${pending.newMovePp ?? pending.newMoveMaxPp}/${pending.newMoveMaxPp}`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </small>
            <p>{copy.mobile.moveReplacementPrompt(pending.pokemonName, pending.newMoveName)}</p>
          </div>
          <div className={styles.moves}>
            {moves.map(function renderMove(move) {
              return (
                <button
                  key={move.index}
                  type="button"
                  disabled={disabled}
                  data-selected={move.selected}
                  data-poke-lounge-move-choice={move.index}
                  aria-label={`${move.name} · ${copy.mobile.forgetMove} → ${pending.newMoveName}`}
                  onClick={function chooseMove() {
                    onSelect(move.index);
                  }}
                >
                  <strong>{move.name}</strong>
                  <small>
                    {[move.type, move.maxPp == null ? null : `PP ${move.pp}/${move.maxPp}`]
                      .filter(Boolean)
                      .join(" · ")}
                  </small>
                </button>
              );
            })}
          </div>
          <p className={styles.hint}>{text.hint}</p>
          <button className={styles.skip} type="button" disabled={disabled} onClick={onSkip}>
            {copy.mobile.doNotLearnMove}
          </button>
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
      className={styles.panel}
      data-poke-lounge-move-learned="true"
      aria-label={text.learned}
      onKeyDownCapture={stopButtonKeyPropagation}
      onKeyUpCapture={stopButtonKeyPropagation}
    >
      <header className={styles.heading}>
        <span className={styles.badge}>{text.learned}</span>
        <h2>{move.pokemonName}</h2>
      </header>
      <div className={styles.newMove}>
        <strong>{move.newMoveName}</strong>
        <small>
          {move.newMoveType} · PP {move.newMoveMaxPp}
        </small>
      </div>
      <p className={styles.question} role="status" data-poke-lounge-mobile-battle-message="true">
        {message}
      </p>
      <div className={styles.actions}>
        <button type="button" data-primary="true" disabled={disabled} onClick={onContinue}>
          {text.next}
        </button>
      </div>
    </section>
  );
}
