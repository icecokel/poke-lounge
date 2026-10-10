import Image from "next/image";
import { ChevronRight } from "lucide-react";
import { useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import type { PokeLoungeCopy } from "../../../poke-lounge-copy";
import { PageReloadButton } from "../../../ui/page-reload-button";
import { PixelButton, PixelPanel } from "../../../ui/poke-lounge-ui-primitives";
import styles from "./trainer-name-entry.module.css";

export function TrainerNameEntry({
  copy,
  displayName,
  initialDisplayName,
  pending,
  message,
  showForm,
  onNameChange,
  onSubmit,
}: {
  copy: PokeLoungeCopy;
  displayName: string;
  initialDisplayName?: string;
  pending: boolean;
  message: string;
  showForm: boolean;
  onNameChange(name: string): void;
  onSubmit(event: FormEvent): void;
}) {
  const text = copy.roomEntry;
  const [names] = useState(() =>
    Array.from(
      new Set([
        displayName,
        ...text.multiplayerNameModifiers.map(
          (word, index) => `${word} ${text.multiplayerNameNouns[index]}`,
        ),
      ]),
    ).slice(0, 2),
  );
  const [mode, setMode] = useState<"recommended" | "custom">("recommended");
  const [customName, setCustomName] = useState(initialDisplayName ? displayName : "");

  return (
    <div className={styles.introduction}>
      <header className={styles.brand}>
        <span>POKE LOUNGE</span>
        <PageReloadButton locale={copy.locale} disabled={pending} iconOnly />
      </header>
      <div className={styles.scene}>
        <div className={styles.horizon} aria-hidden="true" />
        <Image
          src="/assets/poke-lounge/lounge-guide.png"
          alt={text.guideTitle}
          width={256}
          height={256}
          priority
          unoptimized
          className={styles.guide}
        />
        <span className={styles.guideLabel}>{text.guideTitle}</span>
      </div>
      <div className={styles.dialogue}>
        <p>{text.guideGreeting}</p>
        <h1>{text.guideNameQuestion}</h1>
        <span className={styles.advance} aria-hidden="true">
          ▼
        </span>
      </div>

      {showForm ? (
        <form className={styles.form} onSubmit={onSubmit} data-room-entry-profile-step>
          <div className={styles.nameArea}>
            <div className={styles.names} role="group" aria-label={text.multiplayerNameLabel}>
              {names.map(name => (
                <PixelButton
                  key={name}
                  selected={mode === "recommended" && displayName === name}
                  aria-pressed={mode === "recommended" && displayName === name}
                  disabled={pending}
                  onClick={() => {
                    setMode("recommended");
                    onNameChange(name);
                  }}
                >
                  <span className={styles.cursor} aria-hidden="true">
                    {mode === "recommended" && displayName === name ? "▶" : ""}
                  </span>
                  {name}
                </PixelButton>
              ))}
              <PixelButton
                selected={mode === "custom"}
                aria-pressed={mode === "custom"}
                aria-controls="poke-lounge-custom-name"
                aria-expanded={mode === "custom"}
                disabled={pending}
                onClick={() => {
                  setMode("custom");
                  onNameChange(customName);
                }}
              >
                <span className={styles.cursor} aria-hidden="true">
                  {mode === "custom" ? "▶" : ""}
                </span>
                {text.customName}
              </PixelButton>
            </div>
            {mode === "custom" ? (
              <div id="poke-lounge-custom-name" className={styles.custom}>
                <label className="sr-only" htmlFor="poke-lounge-multiplayer-display-name">
                  {text.multiplayerNameLabel}
                </label>
                <input
                  id="poke-lounge-multiplayer-display-name"
                  type="text"
                  autoFocus
                  autoComplete="nickname"
                  maxLength={12}
                  placeholder={text.multiplayerNamePlaceholder}
                  value={displayName}
                  disabled={pending}
                  aria-describedby="poke-lounge-name-hint poke-lounge-name-message"
                  aria-invalid={Boolean(message && !displayName.trim()) || undefined}
                  onChange={event => {
                    setCustomName(event.currentTarget.value);
                    onNameChange(event.currentTarget.value);
                  }}
                  data-room-entry-display-name
                />
              </div>
            ) : null}
          </div>
          <p id="poke-lounge-name-hint" className={styles.hint}>
            {text.multiplayerNameDescription}
          </p>
          <PixelButton
            type="submit"
            className={styles.submit}
            disabled={pending}
            data-room-entry-profile-submit
          >
            {text.roomSetupStart}
            <ChevronRight size={18} aria-hidden="true" />
          </PixelButton>
          {message ? (
            <p
              id="poke-lounge-name-message"
              className={styles.message}
              role="alert"
              data-room-entry-message="true"
            >
              {message}
            </p>
          ) : (
            <span id="poke-lounge-name-message" />
          )}
        </form>
      ) : null}
    </div>
  );
}

export function FanNoticeToast({ text }: { text: string }) {
  if (typeof document === "undefined") return null;

  return createPortal(
    <PixelPanel
      className={styles.noticeToast}
      role="status"
      aria-live="polite"
      aria-atomic="true"
      data-poke-lounge-fan-notice="true"
    >
      <p>{text}</p>
    </PixelPanel>,
    document.body,
  );
}
