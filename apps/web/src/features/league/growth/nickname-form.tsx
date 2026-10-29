"use client";
import { useState } from "react";
import { setLeagueNickname } from "../api/profile";
import { LeagueApiError } from "../api/core";
import type { GrowthCopy } from "./copy";
export function NicknameForm({
  copy,
  onSaved,
}: {
  copy: GrowthCopy;
  onSaved(nickname: string): void;
}) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  return (
    <form
      className="space-y-4"
      onSubmit={async e => {
        e.preventDefault();
        setPending(true);
        setError("");
        try {
          const result = await setLeagueNickname(value);
          onSaved(result.nickname);
        } catch (error) {
          setError(
            error instanceof LeagueApiError
              ? error.code === "LEAGUE_NICKNAME_TAKEN"
                ? copy.nicknameTaken
                : error.code === "LEAGUE_NICKNAME_COOLDOWN"
                  ? copy.nicknameCooldown
                  : copy.nicknameInvalid
              : copy.nicknameNetwork,
          );
        } finally {
          setPending(false);
        }
      }}
    >
      <label className="block" htmlFor="league-nickname">
        {copy.nickname}
      </label>
      <input
        id="league-nickname"
        className="rounded border border-slate-500 bg-slate-900 px-3 py-2"
        value={value}
        onChange={e => setValue(e.target.value)}
        autoComplete="off"
        aria-describedby="league-nickname-help"
        required
      />
      <p id="league-nickname-help">{copy.nicknameHelp}</p>
      {error && <p role="alert">{error}</p>}
      <button className="rounded border px-4 py-2" disabled={pending}>
        {pending ? copy.loading : copy.confirm}
      </button>
    </form>
  );
}
