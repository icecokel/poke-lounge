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
import styles from "./room-lobby.module.css";

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
  const creating = state.currentUrl.searchParams.get("create") === "1";
  const roomCode = state.currentUrl.searchParams.get("room");
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
      className={styles.entry}
      data-room-entry-direct-multiplayer="true"
      aria-labelledby={`${id}-title`}
    >
      <form className={styles.entryPanel} onSubmit={submit} aria-busy={pending}>
        <header className={styles.entryHeader}>
          <span className={styles.eyebrow}>POKE LOUNGE</span>
          <PageReloadButton locale={copy.locale} disabled={pending} />
          <a href={`/${copy.locale}/game/poke-lounge`} className={styles.backLink}>
            <ArrowLeft size={18} aria-hidden="true" />
            {text.back}
          </a>
        </header>
        <div className={styles.entryBody}>
          <span className={styles.entryEmblem} aria-hidden="true">
            <Users size={28} />
          </span>
          <h1 id={`${id}-title`}>{creating ? text.createTitle : text.joinTitle}</h1>
          <p className={styles.entryLead}>{creating ? text.createHint : text.joinHint}</p>
          {!creating && roomCode ? (
            <p className={styles.invitationCode}>
              <span>{text.room}</span>
              <strong>{roomCode}</strong>
            </p>
          ) : null}
          <label className={styles.field} htmlFor={`${id}-name`}>
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
            className={styles.error}
            data-room-entry-message="true"
          >
            {error}
          </p>
          <p className={styles.fanNotice}>{copy.roomEntry.fanNotice}</p>
        </div>
        <footer className={styles.entryFooter}>
          <button
            type="submit"
            className={styles.primaryButton}
            disabled={pending}
            data-room-entry-direct-multiplayer-submit="true"
          >
            <span role="status">
              {pending ? text.pending : creating ? text.create : text.enter}
            </span>
            <ChevronRight size={20} aria-hidden="true" />
          </button>
          <p className={styles.nextStep}>{copy.lobby.starterSelectionHint}</p>
        </footer>
      </form>
    </section>
  );
}
