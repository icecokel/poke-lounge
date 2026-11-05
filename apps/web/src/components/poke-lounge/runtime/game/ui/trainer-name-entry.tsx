import Image from "next/image";
import { useLeagueAvailability } from "@/features/league/entry-link/league-entry-link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import type { PokeLoungeCopy } from "../../../poke-lounge-copy";
import { PageReloadButton } from "../../../ui/page-reload-button";
import { PixelButton, PixelPanel } from "../../../ui/poke-lounge-ui-primitives";
import { EntryLanguageSelector } from "./entry-language-selector";
import type { EntryLanguageProfile } from "./entry-language-state";
import styles from "./trainer-name-entry.module.css";

export function TrainerNameEntry({
  copy,
  displayName,
  initialDisplayName,
  initialProfile,
  pending,
  message,
  showForm,
  friendsChosen,
  onFriendsChosenChange,
  onNameChange,
  onLanguageSwitch,
  onSubmit,
}: {
  copy: PokeLoungeCopy;
  displayName: string;
  initialDisplayName?: string;
  initialProfile?: EntryLanguageProfile;
  pending: boolean;
  message: string;
  showForm: boolean;
  /** Kept by the parent so returning from room setup lands on the name step again. */
  friendsChosen: boolean;
  onFriendsChosenChange(chosen: boolean): void;
  onNameChange(name: string): void;
  onLanguageSwitch(): void;
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
    )
      .filter(name => name.trim())
      .slice(0, 2),
  );
  const [mode, setMode] = useState<"recommended" | "custom">(initialProfile?.mode ?? "recommended");
  const [customName, setCustomName] = useState(
    initialProfile?.customName ?? (initialDisplayName ? displayName : ""),
  );
  const [focusNameOnOpen, setFocusNameOnOpen] = useState(!initialProfile);
  const league = useLeagueAvailability();
  const [leagueChosen, setLeagueChosen] = useState(false);
  const chosen = leagueChosen ? "league" : friendsChosen ? "friends" : "purpose";
  const setChosen = (next: "purpose" | "friends" | "league") => {
    setLeagueChosen(next === "league");
    onFriendsChosenChange(next === "friends");
  };
  // Local test mode shows no form, so it keeps the plain greeting without the purpose question.
  const step = !showForm || (chosen === "purpose" && league === false) ? "friends" : chosen;
  const probing = step === "purpose" && league === null;
  useEffect(() => {
    if (step !== "league") return;
    const timer = window.setTimeout(() => window.location.assign(`/${copy.locale}/league`), 700);
    return () => window.clearTimeout(timer);
  }, [step, copy.locale]);

  return (
    <div className={styles.introduction}>
      <header className={styles.brand}>
        <span>POKE LOUNGE</span>
        <div className="flex items-center gap-2">
          {showForm ? (
            <EntryLanguageSelector
              copy={copy}
              displayName={displayName}
              disabled={pending}
              profile={{ mode, customName }}
              onLanguageSwitch={onLanguageSwitch}
            />
          ) : null}
          <PageReloadButton locale={copy.locale} disabled={pending} iconOnly />
        </div>
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
      <div className={styles.dialogue} aria-live="polite">
        {step === "league" ? (
          <h1>{text.guideLeagueReply}</h1>
        ) : probing ? (
          <h1>{text.guideGreeting}</h1>
        ) : (
          <>
            <p>
              {showForm && chosen === "friends" && league === true
                ? text.guideFriendsReply
                : text.guideGreeting}
            </p>
            <h1>{step === "purpose" ? text.guidePurposeQuestion : text.guideNameQuestion}</h1>
          </>
        )}
        <span className={styles.advance} aria-hidden="true">
          ▼
        </span>
      </div>

      {showForm && step === "purpose" && !probing ? (
        <div className={styles.form}>
          <div className={styles.names} role="group" aria-label={text.purposeLabel}>
            {[
              ["friends", text.purposeFriends],
              ["league", text.purposeLeague],
            ].map(([value, label]) => (
              <PixelButton
                key={value}
                className={styles.choice}
                disabled={pending}
                onClick={() => {
                  setFocusNameOnOpen(false);
                  setChosen(value === "league" ? "league" : "friends");
                }}
                data-room-entry-purpose={value}
              >
                <span className={styles.cursor} aria-hidden="true" />
                {label}
              </PixelButton>
            ))}
          </div>
        </div>
      ) : null}

      {showForm && step === "friends" ? (
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
                  setFocusNameOnOpen(true);
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
                  autoFocus={focusNameOnOpen}
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
          {league === true ? (
            <PixelButton
              className={styles.back}
              disabled={pending}
              onClick={() => setChosen("purpose")}
            >
              <ChevronLeft size={16} aria-hidden="true" />
              {text.purposeBack}
            </PixelButton>
          ) : null}
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
