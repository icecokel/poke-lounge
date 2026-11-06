"use client";

import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
  type ReactNode,
} from "react";
import { Button } from "@/components/ui/button";
import { Check, ChevronRight } from "lucide-react";
import type { PokeLoungeCopy } from "../../../poke-lounge-copy";
import type { StarterPokemon } from "../../types";
import { localizePokemonName } from "../i18n/runtime-game-localization";
import { getStarterSelectionCopy, getStarterTypeLabel } from "./starter-selection-copy";
import { MobilePokemonThumbnail } from "../../../mobile/mobile-selection-cards";
import styles from "./starter-selection-layout.module.css";

export function StarterSelectionPanel({
  copy,
  starters,
  selected,
  confirming,
  disabled = false,
  error,
  confirmLabel,
  level,
  gridRef,
  headerAction,
  onChoose,
  onConfirm,
  onNavigate,
}: {
  copy: PokeLoungeCopy;
  starters: StarterPokemon[];
  selected: StarterPokemon | null;
  confirming: boolean;
  disabled?: boolean;
  error: string;
  confirmLabel: string;
  level?: number;
  gridRef?: RefObject<HTMLDivElement | null>;
  headerAction?: ReactNode;
  onChoose(starter: StarterPokemon): void;
  onConfirm(): void;
  onNavigate?(event: KeyboardEvent<HTMLButtonElement>, index: number): void;
}) {
  const id = useId();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const text = getStarterSelectionCopy(copy.locale);
  useLayoutEffect(() => {
    titleRef.current?.focus({ preventScroll: true });
  }, []);
  return (
    <div
      className={`${styles.panel} grid h-full min-h-0 min-w-0 w-full grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)_auto_auto] overflow-hidden rounded-lg border-[3px] border-[var(--pl-color-ink)] bg-[var(--pl-color-surface)] shadow-[0_4px_0_#17251c]`}
      role="region"
      data-starter-panel="true"
      aria-labelledby={`${id}-title`}
    >
      <header className="flex items-center justify-between gap-3 border-b-[3px] border-[var(--pl-color-ink)] bg-[var(--pl-color-johto-deep)] px-3 py-2.5 text-[#fffdf0]">
        <div>
          <p className="mb-[3px] text-[0.625rem] font-extrabold tracking-[0.12em] text-[#d8e6bf]">
            POKE LOUNGE
          </p>
          <h1
            ref={titleRef}
            tabIndex={-1}
            id={`${id}-title`}
            className="text-xl leading-[1.35] font-black [overflow-wrap:anywhere] focus:outline-none"
          >
            {copy.game.starterTitle}
          </h1>
        </div>
        {headerAction ?? (
          <span
            className="relative size-6 shrink-0 rounded-full border-[3px] border-[#d8e6bf] bg-[linear-gradient(transparent_43%,#d8e6bf_43%,#d8e6bf_56%,transparent_56%)] after:absolute after:inset-[5px] after:rounded-full after:border-2 after:border-[#d8e6bf] after:bg-[#315d4b] after:content-['']"
            aria-hidden="true"
          />
        )}
      </header>

      <section
        className="flex min-h-0 min-w-0 flex-col bg-[#e1ead5] bg-[radial-gradient(#f7f8e9_1px,transparent_1px)] bg-[length:12px_12px] px-2 py-2.5"
        aria-labelledby={`${id}-roster`}
      >
        <div className="mb-1.5 flex shrink-0 items-baseline justify-between gap-2 px-1 leading-[1.4] [&_h2]:text-[0.8125rem] [&_h2]:font-extrabold [&>span]:text-[0.8125rem] [&>span]:whitespace-nowrap [&>span]:text-[#52614c]">
          <h2 id={`${id}-roster`}>{text.roster}</h2>
          <span data-starter-count="true">{text.count(starters.length)}</span>
        </div>
        <div
          ref={gridRef}
          className={`${styles.options} grid min-h-0 min-w-0 flex-1 grid-cols-3 gap-2 overflow-y-auto overscroll-contain p-1 [scroll-padding:4px]`}
          data-starter-options="true"
          role="group"
          aria-label={copy.game.starterOptionsLabel}
        >
          {starters.map((starter, index) => (
            <Button
              key={starter.id}
              type="button"
              className={`group ${styles.card}`}
              aria-pressed={starter.id === selected?.id}
              aria-label={
                starter.hidden
                  ? text.mysteryLabel
                  : `${localizePokemonName(starter.displayName, copy.locale)} · ${getStarterTypeLabel(starter.type, copy.locale)}`
              }
              data-starter-card={starter.id}
              data-starter-type={starter.hidden ? undefined : starter.type}
              disabled={confirming}
              onClick={() => onChoose(starter)}
              onKeyDown={event => onNavigate?.(event, index)}
            >
              <span
                className="invisible absolute top-[3px] right-[3px] grid size-[17px] place-items-center rounded-full bg-[#315d4b] text-[#fffdf0] group-aria-pressed:visible [&_svg]:size-3"
                aria-hidden="true"
              >
                <Check size={14} strokeWidth={3} />
              </span>
              <StarterSprite key={starter.assetPath} starter={starter} copy={copy} />
              {level !== undefined ? (
                <small className="text-[0.6875rem] leading-[1.3]">Lv.{level}</small>
              ) : null}
              <strong className="text-center text-sm leading-[1.35] font-black [overflow-wrap:anywhere]">
                {getStarterName(starter, copy.locale)}
              </strong>
              <span
                className="inline-flex w-fit min-w-11 items-center justify-center rounded border border-[#58614e] px-1.5 py-0.5 text-[0.6875rem] leading-[1.3] font-extrabold text-[#26342c] data-[type=Fire]:bg-[#f2b582] data-[type=Grass]:bg-[#c4dbab] data-[type=Water]:bg-[#b6d8e6]"
                data-type={starter.hidden ? undefined : starter.type}
              >
                {starter.hidden ? "?" : getStarterTypeLabel(starter.type, copy.locale)}
              </span>
            </Button>
          ))}
          {!starters.length ? (
            <p className="col-span-full self-center p-5" role="status">
              {copy.game.starterUnavailable}
            </p>
          ) : null}
        </div>
      </section>

      <aside
        className="grid grid-cols-[64px_minmax(0,1fr)] items-center gap-3 border-t-2 border-[#b3c4a0] px-3 pt-2"
        data-starter-preview="true"
        data-selected-starter={selected?.id}
        aria-label={copy.game.starterPreviewLabel}
      >
        {selected ? (
          <>
            <div
              className="relative grid h-16 min-h-16 place-items-center rounded-md border-2 border-[#93ad81] bg-[#d8e7c6] bg-[linear-gradient(transparent_95%,#ceddbd_95%),linear-gradient(90deg,transparent_95%,#ceddbd_95%)] bg-[length:20px_20px]"
              aria-hidden="true"
            >
              <StarterSprite key={selected.assetPath} starter={selected} copy={copy} preview />
              <span className="hidden" />
            </div>
            <div
              className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1 [&_.starter-eyebrow]:col-span-full"
              aria-live="polite"
              aria-atomic="true"
            >
              <p className="starter-eyebrow text-xs font-extrabold text-[#5b6b50]">
                {text.selected}
              </p>
              <strong className="min-w-0 text-lg leading-[1.3] font-black [overflow-wrap:anywhere]">
                {getStarterName(selected, copy.locale)}
              </strong>
              <span
                className="inline-flex w-fit min-w-11 items-center justify-center rounded border border-[#58614e] px-1.5 py-0.5 text-[0.6875rem] leading-[1.3] font-extrabold text-[#26342c] data-[type=Fire]:bg-[#f2b582] data-[type=Grass]:bg-[#c4dbab] data-[type=Water]:bg-[#b6d8e6]"
                data-type={selected.hidden ? undefined : selected.type}
              >
                {selected.hidden ? "?" : getStarterTypeLabel(selected.type, copy.locale)}
              </span>
            </div>
          </>
        ) : (
          <p>{copy.game.starterUnavailable}</p>
        )}
      </aside>

      <footer
        className="min-w-0 bg-[var(--pl-color-surface)] px-3 pt-2 pb-3"
        data-starter-footer="true"
      >
        {error ? (
          <p role="alert" className="mb-2 text-sm text-[#953426]">
            {error}
          </p>
        ) : null}
        <Button
          className="flex min-h-14 w-full justify-between gap-2 whitespace-normal rounded-md border-[3px] border-[#24313b] bg-[#f4cf58] p-3 text-base leading-[1.4] font-black text-[#24313b] shadow-[0_4px_0_#24313b] hover:bg-[#ffe788] hover:text-[#24313b] focus-visible:border-[#24313b] focus-visible:ring-0 focus-visible:outline-3 focus-visible:outline-[#2f6b78] focus-visible:outline-offset-2 disabled:shadow-none disabled:opacity-60 [&>span]:min-w-0 [&>span]:[overflow-wrap:anywhere] [&_svg]:shrink-0"
          type="button"
          data-starter-confirm="true"
          disabled={!selected || confirming || disabled}
          onClick={onConfirm}
        >
          <span>{confirming ? text.starting : confirmLabel}</span>
          <ChevronRight size={24} aria-hidden="true" />
        </Button>
      </footer>
    </div>
  );
}

function getStarterName(starter: StarterPokemon, locale: string): string {
  return starter.hidden
    ? getStarterSelectionCopy(locale).mystery
    : localizePokemonName(starter.displayName, locale);
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
  const name = getStarterName(starter, copy.locale);
  // Never load the hidden candidate's sprite; its URL would reveal the species.
  if (!starter.hidden && starter.sprite) {
    return (
      <span role="img" aria-label={name}>
        <MobilePokemonThumbnail sprite={starter.sprite} />
      </span>
    );
  }
  return (
    <span
      className="grid size-[var(--sprite-size)] shrink-0 place-items-center [--sprite-size:56px] data-[preview=true]:[--sprite-size:64px]"
      data-preview={preview || undefined}
    >
      {starter.hidden ? (
        <span
          className="grid size-4/5 place-items-center rounded-full border-2 border-dashed border-[#7f9576] bg-[#e7edd9] text-[1.75rem] text-[#58694e]"
          role="img"
          aria-label={getStarterSelectionCopy(copy.locale).mysteryLabel}
          data-starter-mystery="true"
        >
          ?
        </span>
      ) : missing ? (
        <span
          className="grid size-4/5 place-items-center rounded-full border-2 border-dashed border-[#7f9576] bg-[#e7edd9] text-[1.75rem] text-[#58694e]"
          role="img"
          aria-label={`${name} · ${getStarterSelectionCopy(copy.locale).missingImage}`}
          data-starter-image-fallback="true"
        >
          ?
        </span>
      ) : (
        <span
          className="block size-[var(--sprite-size)] bg-[length:calc(var(--sprite-size)*2)_var(--sprite-size)] bg-left-top bg-no-repeat [image-rendering:pixelated] data-[preview=true]:motion-safe:animate-[poke-lounge-starter-idle_1s_steps(2)_infinite]"
          role="img"
          aria-label={name}
          data-starter-sprite="true"
          data-preview={preview || undefined}
          data-asset-path={starter.assetPath}
          style={{ backgroundImage: `url("${starter.assetPath}")` }}
        />
      )}
      {/* Two square animation frames are stored side-by-side. Keep the square
          viewport rather than stretching the entire image across the card. */}
      {starter.hidden ? null : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className="hidden"
          src={starter.assetPath}
          alt=""
          aria-hidden="true"
          onError={() => setMissing(true)}
        />
      )}
    </span>
  );
}
