"use client";
import { useState } from "react";
import { setLeagueNickname } from "../api/profile";
import { LeagueApiError } from "../api/core";
import { ChevronRight } from "lucide-react";
import { PixelButton } from "@/components/poke-lounge/ui/poke-lounge-ui-primitives";
import type { LeagueLocale } from "../contract";
import { getGuideCopy } from "../shell/guide-copy";
import styles from "../shell/league-frame.module.css";
import type { GrowthCopy } from "./copy";
export function NicknameForm({
  copy,
  locale,
  onSaved,
}: {
  copy: GrowthCopy;
  locale: LeagueLocale;
  onSaved(nickname: string): void;
}) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const guide = getGuideCopy(locale);
  return (
    <>
      <form
        className={`${styles.content} ${styles.nicknameForm}`}
        onSubmit={async e => {
          e.preventDefault();
          setPending(true);
          setError("");
          try {
            const result = await setLeagueNickname(value);
            onSaved(result.nickname);
          } catch (error) {
            const detail = error instanceof LeagueApiError ? error.detail : undefined;
            const fields =
              detail && typeof detail === "object" ? (detail as Record<string, unknown>) : {};
            const message =
              error instanceof LeagueApiError
                ? error.code === "LEAGUE_NICKNAME_TAKEN"
                  ? copy.nicknameTaken
                  : error.code === "LEAGUE_NICKNAME_COOLDOWN"
                    ? copy.nicknameCooldown
                    : copy.nicknameInvalid
                : copy.nicknameNetwork;
            const when =
              typeof fields.changeableAtMs === "number" && Number.isFinite(fields.changeableAtMs)
                ? new Date(fields.changeableAtMs).toLocaleString()
                : "";
            setError(
              [message, when, message === copy.nicknameInvalid ? copy.nicknameHelp : ""]
                .filter(Boolean)
                .join(" · "),
            );
          } finally {
            setPending(false);
          }
        }}
      >
        <header className={styles.menuIntro}>
          <h2 className={styles.panelTitle}>{guide.nicknameLine}</h2>
          <p className={styles.meta}>{guide.nicknameLead}</p>
        </header>
        <div className={styles.field}>
          <label htmlFor="league-nickname">{copy.nickname}</label>
          <input
            id="league-nickname"
            value={value}
            onChange={e => setValue(e.target.value)}
            autoComplete="off"
            maxLength={12}
            aria-describedby="league-nickname-help"
            required
          />
          <p id="league-nickname-help" className={styles.hint}>
            {copy.nicknameHelp}
          </p>
        </div>
        {error && (
          <p role="alert" className={styles.message}>
            {error}
          </p>
        )}
        <PixelButton type="submit" className={styles.primary} disabled={pending}>
          {pending ? copy.loading : copy.confirm}
          <ChevronRight size={18} aria-hidden="true" />
        </PixelButton>
      </form>
    </>
  );
}
