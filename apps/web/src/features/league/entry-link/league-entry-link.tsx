"use client";

import { useEffect, useState } from "react";
import { getApiBaseUrl } from "@/lib/constants";

const CACHE_KEY = "poke-lounge-league:v1:status-probe";
const CACHE_MS = 10 * 60 * 1000;

function readCache(): boolean | null {
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
    )
      return cached.ok;
  } catch {
    /* The probe also works without session storage. */
  }
  return null;
}

/**
 * Whether the league is open on this server. `null` while the anonymous status probe runs
 * (at most 3 seconds); a failed probe counts as closed so the game entry never waits on it.
 */
export function useLeagueAvailability(): boolean | null {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  useEffect(() => {
    const cached = readCache();
    if (cached !== null) {
      setEnabled(cached);
      return;
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
  return enabled;
}
