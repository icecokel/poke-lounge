"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { PageReloadButton } from "../../../ui/page-reload-button";
import { ArrowLeft, ChevronRight, Users } from "lucide-react";
import { getPokeLoungeCopyForUrl } from "../../../poke-lounge-copy";
import type { PokeLoungeRuntimeState } from "../game-page-state";
import {
  normalizeMultiplayerDisplayName,
  resolveInitialMultiplayerDisplayName,
} from "../network/room-entry-screen";
import { primePokeLoungeAudio, playPokeLoungeSfx } from "../audio/poke-lounge-audio";
import { getRoomLobbyCopy } from "./room-lobby-copy";

export function DirectMultiplayerEntryScreen({
  state,
}: {
  state: Extract<PokeLoungeRuntimeState, { phase: "entry"; screen: "direct-multiplayer" }>;
}) {
  const copy = getPokeLoungeCopyForUrl(state.currentUrl);
  const text = getRoomLobbyCopy(copy.locale);
  const [displayName, setDisplayName] = useState(() =>
    resolveInitialMultiplayerDisplayName(
      state.initialDisplayName,
      copy.roomEntry.multiplayerNameModifiers,
      copy.roomEntry.multiplayerNameNouns,
    ),
  );
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const submitted = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const id = useId();
  const roomCode = state.roomCode;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (submitted.current) return;
    const name = normalizeMultiplayerDisplayName(displayName);
    setDisplayName(name);
    if (!name) {
      setError(copy.roomEntry.multiplayerNameRequired);
      input.current?.focus();
      return;
    }
    submitted.current = true;
    setError("");
    setPending(true);
    input.current?.blur();
    void primePokeLoungeAudio();
    playPokeLoungeSfx("button-confirm");
    state.onSubmit(name);
  };
  return (
    <section
      className="relative grid min-h-[inherit] w-full place-items-start overflow-visible bg-[#dce8d6] p-4 text-[#203329]"
      data-room-entry-direct-multiplayer="true"
      aria-labelledby={`${id}-title`}
    >
      <form
        className="mx-auto flex h-auto min-h-0 w-full max-w-[500px] flex-col overflow-hidden rounded-[20px] border-2 border-[#284431] bg-[#fffdf1] shadow-[0_5px_0_#284431]"
        onSubmit={submit}
        aria-busy={pending}
      >
        <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-[#c6d2b9] px-5 py-4">
          <span className="text-[0.6875rem] font-extrabold tracking-[0.13em] text-[#54705b]">
            POKE LOUNGE
          </span>
          <PageReloadButton locale={copy.locale} disabled={pending} />
          <a
            href={`/${copy.locale}`}
            className="inline-flex min-h-12 touch-manipulation items-center justify-center gap-[5px] text-sm text-[#50624c] no-underline focus-visible:outline-3 focus-visible:outline-[#985512] focus-visible:outline-offset-3"
          >
            <ArrowLeft size={18} aria-hidden="true" />
            {text.back}
          </a>
        </header>
        <div className="grid min-h-0 flex-1 content-start gap-4 overflow-visible overscroll-auto p-6 [&>h1]:text-[1.625rem] [&>h1]:leading-[1.3] [&>h1]:font-extrabold [&>h1]:[overflow-wrap:anywhere]">
          <span
            className="grid size-14 shrink-0 place-items-center rounded-[14px] border-2 border-[#335b3f] bg-[#e5edc9] text-[#31533a]"
            aria-hidden="true"
          >
            <Users size={28} />
          </span>
          <h1 id={`${id}-title`}>{text.joinTitle}</h1>
          <p className="text-[0.9375rem] leading-[1.5] text-[#52634b]">{text.joinHint}</p>
          {roomCode ? (
            <p className="flex flex-wrap items-center gap-3 rounded-[10px] border border-dashed border-[#95aa83] bg-[#edf3dd] px-4 py-3 text-sm [&_strong]:font-mono [&_strong]:[overflow-wrap:anywhere]">
              <span>{text.room}</span>
              <strong>{roomCode}</strong>
            </p>
          ) : null}
          <label
            className="grid gap-2 font-semibold [&_input]:min-h-14 [&_input]:w-full [&_input]:rounded-xl [&_input]:border-2 [&_input]:border-[#8ea17e] [&_input]:bg-white [&_input]:p-3 [&_input]:text-base [&_input]:font-medium [&_input]:text-[#203329] [&_input]:focus-visible:outline-3 [&_input]:focus-visible:outline-[#985512] [&_input]:focus-visible:outline-offset-3 [&_input[aria-invalid=true]]:border-[#a94130] [&_small]:text-[0.8125rem] [&_small]:font-normal [&_small]:text-[#65745b]"
            htmlFor={`${id}-name`}
          >
            {copy.roomEntry.multiplayerNameLabel}
            <input
              ref={input}
              id={`${id}-name`}
              type="text"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              enterKeyHint="go"
              maxLength={12}
              placeholder={copy.roomEntry.multiplayerNamePlaceholder}
              value={displayName}
              disabled={pending}
              aria-invalid={!!error}
              aria-describedby={`${id}-hint${error ? ` ${id}-error` : ""}`}
              onChange={event => {
                setDisplayName(event.currentTarget.value);
                setError("");
              }}
              data-room-entry-display-name
              data-room-entry-direct-multiplayer-name="true"
            />
            <small id={`${id}-hint`}>{copy.roomEntry.multiplayerNameDescription}</small>
          </label>
          <p
            id={`${id}-error`}
            role="alert"
            className="text-sm text-[#9d302b] [overflow-wrap:anywhere] empty:hidden"
            data-room-entry-message="true"
          >
            {error}
          </p>
          <p className="text-[0.6875rem] leading-[1.45] text-[#69755e]">
            {copy.roomEntry.fanNotice}
          </p>
        </div>
        <footer className="grid shrink-0 gap-2.5 border-t border-[#c6d2b9] px-6 py-4">
          <button
            type="submit"
            className="inline-flex min-h-14 min-w-0 touch-manipulation items-center justify-center gap-2 rounded-lg border-2 border-[#304550] bg-[linear-gradient(#638f62_50%,#386747_50%)] px-3.5 py-2.5 font-bold text-white shadow-[var(--hg-button)] focus-visible:outline-3 focus-visible:outline-[#985512] focus-visible:outline-offset-3 disabled:cursor-not-allowed disabled:border-[#96a39b] disabled:bg-[#dfe5d8] disabled:text-[#586766] disabled:shadow-[inset_0_0_0_2px_#eef0e6]"
            disabled={pending}
            data-room-entry-direct-multiplayer-submit="true"
          >
            <span role="status">{pending ? text.pending : text.enter}</span>
            <ChevronRight size={20} aria-hidden="true" />
          </button>
          <p className="text-center text-xs text-[#66735d]">{copy.lobby.starterSelectionHint}</p>
        </footer>
      </form>
    </section>
  );
}
