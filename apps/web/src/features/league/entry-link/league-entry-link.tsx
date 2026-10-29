"use client";

import { useEffect, useState } from "react";
import { getApiBaseUrl } from "@/lib/constants";

const CACHE_KEY = "poke-lounge-league:v1:status-probe";
const CACHE_MS = 10 * 60 * 1000;

export function LeagueEntryLink({
  locale,
  disabled = false,
}: {
  locale: "ko-KR" | "en-US" | "ja-JP";
  disabled?: boolean;
}) {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    try {
      const cached: unknown = JSON.parse(sessionStorage.getItem(CACHE_KEY) ?? "null");
      if (
        cached &&
        typeof cached === "object" &&
        "ok" in cached &&
        typeof cached.ok === "boolean" &&
        "atMs" in cached &&
        typeof cached.atMs === "number" &&
        Date.now() - cached.atMs >= 0 &&
        Date.now() - cached.atMs < CACHE_MS
      ) {
        setEnabled(cached.ok);
        return;
      }
    } catch {
      /* The probe also works without session storage. */
    }
    let live = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 3000);
    const finish = (ok: boolean) => {
      if (!live) return;
      setEnabled(ok);
      try {
        sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ok, atMs: Date.now() }));
      } catch {
        /* Storage is optional. */
      }
    };
    void Promise.resolve()
      .then(() =>
        fetch(`${getApiBaseUrl()}/league/v1/status`, {
          credentials: "omit",
          cache: "no-store",
          signal: controller.signal,
        }),
      )
      .then(async response => {
        if (response.status !== 200) return false;
        const envelope: unknown = await response.json();
        return (
          !!envelope &&
          typeof envelope === "object" &&
          "success" in envelope &&
          envelope.success === true &&
          "data" in envelope &&
          !!envelope.data &&
          typeof envelope.data === "object" &&
          "enabled" in envelope.data &&
          envelope.data.enabled === true
        );
      })
      .then(finish, () => finish(false))
      .finally(() => window.clearTimeout(timeout));
    return () => {
      live = false;
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, []);
  if (!enabled) return null;
  return (
    <a
      href={disabled ? undefined : `/${locale}/league`}
      aria-disabled={disabled || undefined}
      tabIndex={disabled ? -1 : undefined}
      className="inline-flex min-h-8 items-center rounded border border-[var(--pl-color-ink)] px-2 text-sm font-bold text-[var(--pl-color-ink)] hover:bg-[var(--pl-color-gold-soft)] focus-visible:outline-2 focus-visible:outline-offset-2"
    >
      {locale === "ko-KR" ? "리그" : locale === "ja-JP" ? "リーグ" : "League"}
    </a>
  );
}
