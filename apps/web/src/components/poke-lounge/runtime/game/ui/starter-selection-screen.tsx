"use client";

import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { Check, ChevronRight } from "lucide-react";
import type { PokeLoungeCopy } from "../../../poke-lounge-copy";
import type { StarterPokemon } from "../../types";
import type { PokeLoungeRuntimeState } from "../game-page-state";
import { playPokeLoungeSfx, primePokeLoungeAudio } from "../audio/poke-lounge-audio";
import { localizePokemonName } from "../i18n/runtime-game-localization";
import { getStarterSelectionCopy, getStarterTypeLabel } from "./starter-selection-copy";
import styles from "./starter-selection.module.css";

export function StarterSelectionScreen({
  copy,
  state,
}: {
  copy: PokeLoungeCopy;
  state: Extract<PokeLoungeRuntimeState, { phase: "starter" }>;
}) {
  const id = useId();
  const text = getStarterSelectionCopy(copy.locale);
  const starters = state.bootstrap.starters;
  const [selectedId, setSelectedId] = useState(starters[0]?.id ?? "");
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const submitted = useRef(false);
  const gridRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const selected = starters.find(starter => starter.id === selectedId) ?? starters[0] ?? null;

  useLayoutEffect(() => {
    titleRef.current?.focus({ preventScroll: true });
  }, []);

  const choose = (starter: StarterPokemon) => {
    if (submitted.current) return;
    setSelectedId(starter.id);
    setError("");
    void primePokeLoungeAudio();
    playPokeLoungeSfx("button-confirm", { volume: 0.4 });
  };

  const confirm = () => {
    if (!selected || submitted.current) return;
    submitted.current = true;
    setConfirming(true);
    setError("");
    void primePokeLoungeAudio();
    playPokeLoungeSfx("button-confirm");
    try {
      // Only explicit confirmation mutates the party. The runtime also guards
      // stale selection requests; do not tear down or recreate the room here.
      state.onSelect(selected);
    } catch {
      submitted.current = false;
      setConfirming(false);
      setError(text.chooseFailed);
    }
  };

  const navigate = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const grid = gridRef.current;
    if (!grid || submitted.current || event.altKey || event.ctrlKey || event.metaKey) return;
    const columns = getComputedStyle(grid).gridTemplateColumns.split(" ").length;
    const targets: Record<string, number> = {
      ArrowRight: index + 1,
      ArrowLeft: index - 1,
      ArrowDown: index + columns,
      ArrowUp: index - columns,
      Home: 0,
      End: starters.length - 1,
    };
    const next = targets[event.key];
    if (next === undefined) return;
    event.preventDefault();
    event.stopPropagation();
    const nextIndex = Math.max(0, Math.min(starters.length - 1, next));
    const starter = starters[nextIndex];
    const button = grid.querySelectorAll<HTMLButtonElement>("[data-starter-card]")[nextIndex];
    if (!starter || !button) return;
    choose(starter);
    button.focus({ preventScroll: true });
    // Scroll only the options, never the game page or its fixed footer.
    const option = button.getBoundingClientRect();
    const bounds = grid.getBoundingClientRect();
    if (option.top < bounds.top) grid.scrollTop += option.top - bounds.top - 4;
    else if (option.bottom > bounds.bottom) grid.scrollTop += option.bottom - bounds.bottom + 4;
  };

  return (
    <section
      className={styles.screen}
      data-screen="starter-selection"
      aria-labelledby={`${id}-title`}
    >
      <div className={styles.panel} data-starter-panel="true">
        <header className={styles.header}>
          <div>
            <p className={styles.brand}>POKE LOUNGE</p>
            <h1 ref={titleRef} tabIndex={-1} id={`${id}-title`} className={styles.title}>
              {copy.game.starterTitle}
            </h1>
          </div>
          <span className={styles.headerMark} aria-hidden="true" />
        </header>

        <section className={styles.roster} aria-labelledby={`${id}-roster`}>
          <div className={styles.rosterHeading}>
            <h2 id={`${id}-roster`}>{text.roster}</h2>
            <span data-starter-count="true">{text.count(starters.length)}</span>
          </div>
          <div
            ref={gridRef}
            className={styles.grid}
            data-starter-options="true"
            role="group"
            aria-label={copy.game.starterOptionsLabel}
          >
            {starters.map((starter, index) => (
              <button
                key={starter.id}
                type="button"
                className={styles.card}
                aria-pressed={starter.id === selected?.id}
                aria-label={`${localizePokemonName(starter.displayName, copy.locale)} · ${getStarterTypeLabel(starter.type, copy.locale)}`}
                data-starter-card={starter.id}
                data-starter-type={starter.type}
                disabled={confirming}
                onClick={() => choose(starter)}
                onKeyDown={event => navigate(event, index)}
              >
                <span className={styles.selectionMark} aria-hidden="true">
                  <Check size={14} strokeWidth={3} />
                </span>
                <StarterSprite key={starter.assetPath} starter={starter} copy={copy} />
                <strong className={styles.cardName}>
                  {localizePokemonName(starter.displayName, copy.locale)}
                </strong>
                <span className={styles.typeBadge} data-type={starter.type}>
                  {getStarterTypeLabel(starter.type, copy.locale)}
                </span>
              </button>
            ))}
            {!starters.length ? (
              <p className={styles.empty} role="status">
                {copy.game.starterUnavailable}
              </p>
            ) : null}
          </div>
        </section>

        <aside
          className={styles.preview}
          data-starter-preview="true"
          data-selected-starter={selected?.id}
          aria-label={copy.game.starterPreviewLabel}
        >
          {selected ? (
            <>
              <div className={styles.stage} aria-hidden="true">
                <StarterSprite key={selected.assetPath} starter={selected} copy={copy} preview />
                <span className={styles.stageRing} />
              </div>
              <div className={styles.previewMeta} aria-live="polite" aria-atomic="true">
                <p className={styles.eyebrow}>{text.selected}</p>
                <strong className={styles.previewName}>
                  {localizePokemonName(selected.displayName, copy.locale)}
                </strong>
                <span className={styles.typeBadge} data-type={selected.type}>
                  {getStarterTypeLabel(selected.type, copy.locale)}
                </span>
              </div>
            </>
          ) : (
            <p>{copy.game.starterUnavailable}</p>
          )}
        </aside>

        <footer className={styles.footer} data-starter-footer="true">
          {error ? (
            <p role="alert" className={styles.error}>
              {error}
            </p>
          ) : null}
          <button
            className={styles.confirm}
            type="button"
            data-starter-confirm="true"
            disabled={!selected || confirming}
            onClick={confirm}
          >
            <span>{confirming ? text.starting : copy.game.starterConfirm}</span>
            <ChevronRight size={24} aria-hidden="true" />
          </button>
        </footer>
      </div>
    </section>
  );
}

function StarterSprite({
  starter,
  copy,
  preview = false,
}: {
  starter: StarterPokemon;
  copy: PokeLoungeCopy;
  preview?: boolean;
}) {
  const [missing, setMissing] = useState(false);
  const name = localizePokemonName(starter.displayName, copy.locale);
  return (
    <span className={styles.spriteFrame} data-preview={preview || undefined}>
      {missing ? (
        <span
          className={styles.fallback}
          role="img"
          aria-label={`${name} · ${getStarterSelectionCopy(copy.locale).missingImage}`}
          data-starter-image-fallback="true"
        >
          ?
        </span>
      ) : (
        <span
          className={styles.sprite}
          role="img"
          aria-label={name}
          data-starter-sprite="true"
          data-asset-path={starter.assetPath}
          style={{ backgroundImage: `url("${starter.assetPath}")` }}
        />
      )}
      {/* Two square animation frames are stored side-by-side. Keep the square
          viewport rather than stretching the entire image across the card. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className={styles.assetProbe}
        src={starter.assetPath}
        alt=""
        aria-hidden="true"
        onError={() => setMissing(true)}
      />
    </span>
  );
}
