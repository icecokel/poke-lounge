import { getApiBaseUrl } from "@/lib/constants";

type ClientDiagnostic = {
  kind: "runtime" | "rejection" | "api" | "room";
  code: string;
  requestId?: string;
  line?: number;
  column?: number;
  script?: string;
  roomInstanceId?: string;
  roomCode?: string;
  sessionId?: string;
  errorName?: string;
  error?: unknown;
  startupStep?: string;
  resourcePath?: string;
  userCode?: string;
};

let sent = 0;
let windowStarted = 0;

function diagnosticErrorText(error: unknown): string | undefined {
  if (error == null) return undefined;

  const parts: string[] = [];
  let current: unknown = error;
  for (let depth = 0; depth < 3 && current != null; depth += 1) {
    if (current instanceof Error) {
      const header = `${current.name}: ${current.message}`;
      const frames = current.stack?.split("\n").slice(0, 9) ?? [];
      parts.push([header, ...frames.filter(frame => frame.trim() !== header)].join("\n"));
      current = current.cause;
    } else if (typeof current === "object") {
      const value = current as Record<string, unknown>;
      const fields = Object.fromEntries(
        ["name", "message", "stack", "status"].flatMap(key =>
          typeof value[key] === "string" || typeof value[key] === "number"
            ? [[key, value[key]]]
            : [],
        ),
      );
      parts.push(Object.keys(fields).length ? JSON.stringify(fields) : "Non-Error object thrown");
      break;
    } else {
      parts.push(String(current));
      break;
    }
  }

  const text = parts
    .join("\nCaused by: ")
    .replace(/Bearer\s+[^\s]+/gi, "Bearer [redacted]")
    .replace(
      /\b(token|password|secret|authorization|roomCode)\s*[:=]\s*[^\s,;&)]+/gi,
      "$1=[redacted]",
    )
    .replace(/https?:\/\/[^\s)"']+/g, value => {
      try {
        const url = new URL(value);
        return url.pathname.startsWith("/_next/static/") ? url.pathname : "[url]";
      } catch {
        return "[url]";
      }
    })
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "");
  return Array.from(text).slice(0, 2048).join("");
}

export function reportClientDiagnostic(event: ClientDiagnostic): void {
  if (typeof window === "undefined") return;
  const now = Date.now();
  if (now - windowStarted >= 60_000) {
    windowStarted = now;
    sent = 0;
  }
  if (sent++ >= 10) return;

  // Bound and redact error text before sending it. Never send request or response bodies.
  const code = /^[A-Za-z0-9._-]{1,64}$/.test(event.code) ? event.code : "UNKNOWN";
  const errorName =
    (event.errorName && /^[A-Za-z0-9._-]{1,48}$/.test(event.errorName) && event.errorName) ||
    (event.error instanceof Error && /^[A-Za-z0-9._-]{1,48}$/.test(event.error.name)
      ? event.error.name
      : undefined);
  let errorText: string | undefined;
  try {
    errorText = diagnosticErrorText(event.error);
  } catch {
    errorText = "Error serialization failed";
  }
  const startupStep =
    event.startupStep && /^[a-z_]{1,48}$/.test(event.startupStep) ? event.startupStep : undefined;
  const resourcePath =
    event.resourcePath &&
    /^\/(?:assets|game-data)\/[A-Za-z0-9._/-]{1,180}$/.test(event.resourcePath) &&
    !event.resourcePath.includes("..")
      ? event.resourcePath
      : undefined;
  const userCode = event.userCode && /^\d{5}$/.test(event.userCode) ? event.userCode : undefined;
  const roomCodeCandidate =
    event.roomCode ?? new URLSearchParams(window.location.search).get("room");
  const roomCode =
    roomCodeCandidate && /^[A-Za-z0-9_-]{1,64}$/.test(roomCodeCandidate)
      ? roomCodeCandidate
      : undefined;
  const sessionId =
    event.sessionId && /^[A-Za-z0-9_-]{1,80}$/.test(event.sessionId) ? event.sessionId : undefined;
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
        roomCode,
        sessionId,
        errorName,
        errorText,
        startupStep,
        resourcePath,
        userCode,
        userAgent: navigator.userAgent.slice(0, 256),
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
