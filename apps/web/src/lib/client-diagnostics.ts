import { getApiBaseUrl } from "@/lib/constants";

type ClientDiagnostic = {
  kind: "runtime" | "rejection" | "api" | "room";
  code: string;
  requestId?: string;
  line?: number;
  column?: number;
  script?: string;
  roomInstanceId?: string;
  errorName?: string;
  resourcePath?: string;
  userCode?: string;
};

let sent = 0;
let windowStarted = 0;

export function reportClientDiagnostic(event: ClientDiagnostic): void {
  if (typeof window === "undefined") return;
  const now = Date.now();
  if (now - windowStarted >= 60_000) {
    windowStarted = now;
    sent = 0;
  }
  if (sent++ >= 10) return;

  // Only fixed labels, coordinates, and validated public asset paths leave the browser.
  // Never send full URLs, room codes, error messages, stacks, tokens, or bodies.
  const code = /^[A-Za-z0-9._-]{1,64}$/.test(event.code) ? event.code : "UNKNOWN";
  const errorName =
    event.errorName && /^[A-Za-z0-9._-]{1,48}$/.test(event.errorName) ? event.errorName : undefined;
  const resourcePath =
    event.resourcePath &&
    /^\/(?:assets|game-data)\/[A-Za-z0-9._/-]{1,180}$/.test(event.resourcePath) &&
    !event.resourcePath.includes("..")
      ? event.resourcePath
      : undefined;
  const userCode = event.userCode && /^\d{5}$/.test(event.userCode) ? event.userCode : undefined;
  try {
    void fetch(`${getApiBaseUrl()}/diagnostics/client-errors`, {
      method: "POST",
      mode: "cors",
      cache: "no-store",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: event.kind,
        code,
        requestId: event.requestId,
        page: window.location.pathname.includes("/game/poke-lounge") ? "poke-lounge" : "other",
        line: event.line,
        column: event.column,
        script: event.script,
        roomInstanceId: event.roomInstanceId,
        errorName,
        resourcePath,
        userCode,
        release: process.env.NEXT_PUBLIC_RELEASE_SHA || undefined,
      }),
    }).catch(() => {});
  } catch {
    // Diagnostics must not change the game flow.
  }
}

export function createDiagnosticRequestId(): string {
  return crypto.randomUUID();
}
