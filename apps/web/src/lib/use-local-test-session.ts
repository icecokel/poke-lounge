"use client";

import { useEffect, useState } from "react";
import type { ApiTokenSession } from "./auth-token";
import { loadLocalTestSession } from "./local-test-session-client";

interface LocalTestSessionState {
  data: ApiTokenSession | null;
  status: "loading" | "authenticated" | "unauthenticated";
}

export function useLocalTestSession(): LocalTestSessionState {
  const [state, setState] = useState<LocalTestSessionState>({
    data: null,
    status: process.env.NODE_ENV === "development" ? "loading" : "unauthenticated",
  });

  useEffect(function loadDevelopmentSession() {
    if (process.env.NODE_ENV !== "development") return;
    let cancelled = false;
    const controller = new AbortController();
    const timeout = window.setTimeout(function abortSlowSessionRequest() {
      controller.abort();
    }, 5_000);

    void loadLocalTestSession({
      currentUrl: new URL(window.location.href),
      environment: process.env.NODE_ENV,
      signal: controller.signal,
    }).then(function applySession(data) {
      window.clearTimeout(timeout);
      if (!cancelled) setState({ data, status: data ? "authenticated" : "unauthenticated" });
    });

    return function stopSessionRequest() {
      cancelled = true;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, []);

  return state;
}
