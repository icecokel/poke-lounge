import { getApiBaseUrl } from "@/lib/constants";

type ClientDiagnostic = {
  kind: "runtime" | "rejection" | "api" | "room";
  code: string;
  requestId?: string;
  line?: number;
  column?: number;
  script?: string;
  roomInstanceId?: string;
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

  // Only fixed labels and coordinates leave the browser. Never send URLs, room codes,
  // error messages, stacks, tokens, or request/response bodies.
  const code = /^[A-Za-z0-9._-]{1,64}$/.test(event.code) ? event.code : "UNKNOWN";
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
