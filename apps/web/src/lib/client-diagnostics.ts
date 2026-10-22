import { getApiBaseUrl } from "@/lib/constants";
import { routing } from "@/i18n/routing";

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
  priority?: "error" | "background";
  snapshot?: DiagnosticSnapshot;
};

type DiagnosticContext = {
  scene?: string;
  roomInstanceId?: string;
  round?: number;
  phase?: string;
  revision?: number;
};
type RequestTrace = {
  requestId?: string;
  commandId?: string;
  operation?: string;
  stage?: "fetch" | "body" | "json" | "schema" | "http" | "socket" | "apply" | "prepare";
  causeType?:
    | "timeout"
    | "aborted"
    | "fetch_failure"
    | "body_read"
    | "http"
    | "json_parse"
    | "schema"
    | "socket"
    | "client";
  status?: number;
};
type Breadcrumb = RequestTrace & DiagnosticContext & { at: number; event: string };
type ErrorCause = { via: string; name?: string; message?: string; stack?: string; status?: number };
export type DiagnosticSnapshot = {
  at: number;
  context: DiagnosticContext;
  breadcrumbs: Breadcrumb[];
  request?: RequestTrace;
  causes?: ErrorCause[];
  environment?: { online: boolean; visibility: string; navigation?: string; discarded: boolean };
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const label = (value: unknown, max = 64): string | undefined =>
  typeof value === "string" && new RegExp(`^[A-Za-z0-9._-]{1,${max}}$`).test(value)
    ? value
    : undefined;
const uuid = (value: unknown): string | undefined =>
  typeof value === "string" && UUID.test(value) ? value : undefined;
const integer = (value: unknown, max = Number.MAX_SAFE_INTEGER): number | undefined =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= max
    ? value
    : undefined;

let context: DiagnosticContext = {};
let breadcrumbs: Breadcrumb[] = [];
const failures = new WeakMap<object, DiagnosticSnapshot>();
const causeKeys = ["cause", "transportCause", "parseCause", "originalError"] as const;

// Read only known properties; thrown getters/proxies must never break the game.
function read(value: unknown, key: string): unknown {
  try {
    return value && (typeof value === "object" || typeof value === "function")
      ? (value as Record<string, unknown>)[key]
      : undefined;
  } catch {
    return undefined;
  }
}

export function clientDiagnosticErrorName(error: unknown): string | undefined {
  return label(read(error, "name"), 48);
}

function cleanContext(value: unknown): DiagnosticContext {
  return {
    scene: label(read(value, "scene"), 48),
    roomInstanceId: uuid(read(value, "roomInstanceId")),
    round: integer(read(value, "round")),
    phase: label(read(value, "phase"), 48),
    revision: integer(read(value, "revision")),
  };
}

function cleanTrace(value: unknown): RequestTrace {
  const operation = read(value, "operation");
  const match =
    typeof operation === "string"
      ? operation.match(/^(GET|POST|PUT|DELETE|PATCH) (\/[^ ]{1,180})$/)
      : null;
  return {
    requestId: uuid(read(value, "requestId")),
    commandId: uuid(read(value, "commandId")),
    operation: match ? clientDiagnosticOperation(match[2], match[1]) : undefined,
    stage: label(read(value, "stage"), 24) as RequestTrace["stage"],
    causeType: label(read(value, "causeType"), 24) as RequestTrace["causeType"],
    status: integer(read(value, "status"), 599),
  };
}

export function resetClientDiagnosticContext(): void {
  context = { scene: context.scene };
  breadcrumbs = [];
}

export function updateClientDiagnosticContext(next: DiagnosticContext): void {
  context = cleanContext({ ...context, ...next });
}

export function recordClientBreadcrumb(event: string, trace: RequestTrace = {}): void {
  const safeEvent = label(event, 48);
  if (!safeEvent) return;
  breadcrumbs.push({ at: Date.now(), event: safeEvent, ...context, ...cleanTrace(trace) });
  if (breadcrumbs.length > 24) breadcrumbs.shift();
}

export function setClientDiagnosticScene(scene: string): void {
  if (context.scene === scene) return;
  updateClientDiagnosticContext({ scene });
  recordClientBreadcrumb("scene.changed");
}

export function captureClientDiagnosticSnapshot(request?: RequestTrace): DiagnosticSnapshot {
  return {
    at: Date.now(),
    context: { ...context },
    breadcrumbs: breadcrumbs.map(item => ({ ...item })),
    request: request ? cleanTrace(request) : undefined,
    environment:
      typeof window === "undefined"
        ? undefined
        : {
            online: navigator.onLine,
            visibility: document.visibilityState,
            navigation: (
              performance.getEntriesByType("navigation")[0] as
                PerformanceNavigationTiming | undefined
            )?.type,
            discarded: "wasDiscarded" in document && document.wasDiscarded === true,
          },
  };
}

function findFailure(
  error: unknown,
  seen = new Set<object>(),
  depth = 0,
): DiagnosticSnapshot | undefined {
  if (!error || typeof error !== "object" || seen.has(error) || depth > 4) return undefined;
  seen.add(error);
  const snapshot = failures.get(error);
  if (snapshot) return snapshot;
  for (const key of causeKeys) {
    const found = findFailure(read(error, key), seen, depth + 1);
    if (found) return found;
  }
  return undefined;
}

export function captureClientDiagnosticFailure(
  error: unknown,
  request: RequestTrace,
): DiagnosticSnapshot {
  const snapshot = { ...captureClientDiagnosticSnapshot(request), causes: errorCauses(error) };
  if (error && typeof error === "object") failures.set(error, snapshot);
  return snapshot;
}

// Only known route templates are collected. Query strings, room codes and match IDs are omitted.
export function clientDiagnosticOperation(path: string, method = "GET"): string {
  let route = path.split(/[?#]/, 1)[0];
  if (/^\/poke-lounge\/rooms\/(?!public(?:\/|$)|quick-play(?:\/|$))[^/]+/.test(route)) {
    route = route.replace(/^(\/poke-lounge\/rooms)\/[^/]+/, "$1/:room");
    route = route.replace(/\/matches\/[^/]+/, "/matches/:match");
    route = route.replace(/\/ai-participants\/[^/]+/, "/ai-participants/:player");
  }
  if (
    !/^\/poke-lounge\/rooms(?:\/(?:public|quick-play|:room)(?:\/(?:join|leave|ready|round-ready|start|party-snapshot|result|ai-participants(?:\/:player\/(?:difficulty|remove))?|competitive-seat|matches\/:match\/(?:actions|session-actions)))?)?$/.test(
      route,
    ) &&
    !/^\/(?:poke-lounge\/rom-data|game\/ranking|game-data\/[A-Za-z0-9._-]+\.json|game\/poke-lounge\/state)$/.test(
      route,
    )
  )
    route = "/other";
  return `${["GET", "POST", "PUT", "DELETE", "PATCH"].includes(method) ? method : "GET"} ${route}`;
}

function redact(value: string, max: number, stack = false): string {
  // Redact before truncating so a cut-off secret is not left behind.
  const safe = value
    .slice(0, 16_384)
    .replace(/(?:https?|wss?):\/\/[^\s)"'<>]+|\/?[A-Za-z0-9_./:-]+[?#][^\s)"'<>]+/g, url => {
      try {
        const location = url.match(/:\d+(?::\d+)?$/)?.[0] ?? "";
        const path = new URL(
          location ? url.slice(0, -location.length) : url,
          "https://diagnostic.invalid",
        ).pathname;
        const script =
          /^\/_next\/static\/[A-Za-z0-9_./-]{1,180}$/.test(path) ||
          (stack && /^\/[A-Za-z0-9_./-]{1,180}\.(?:[cm]?js|tsx?)$/.test(path));
        return script ? `${path}${stack ? location : ""}` : "[url]";
      } catch {
        return "[url]";
      }
    })
    .replace(/Bearer\s+[^\s"'<>]+/gi, "Bearer [redacted]")
    .replace(/\b(cookie|set-cookie|authorization)\s*[:=][^\n]*/gi, "$1=[redacted]")
    .replace(
      /["']?\b(token|idToken|accessToken|refreshToken|access_token|refresh_token|password|secret|roomPassword|roomCode|sessionId|accountId|playerId|userId|username|email|displayName|phone)\b["']?\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;&)]+)/gi,
      "$1=[redacted]",
    )
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[redacted]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[email]")
    .replace(/\b(?:\+?\d[\d ()-]{8,}\d)\b/g, "[number]")
    .replace(/\{[^\n]*\}|\[[^\n]*\]/g, "[data]")
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g, "");
  return Array.from(safe).slice(0, max).join("");
}

function errorCauses(error: unknown): ErrorCause[] {
  const result: ReturnType<typeof errorCauses> = [];
  const seen = new Set<object>();
  const visit = (value: unknown, via: string, depth: number) => {
    if (value == null || depth > 4 || result.length >= 8) return;
    if (typeof value === "object" || typeof value === "function") {
      if (seen.has(value)) {
        result.push({ via, message: "Circular cause" });
        return;
      }
      seen.add(value);
      const name = read(value, "name");
      const message = read(value, "message");
      const stack = read(value, "stack");
      result.push({
        via,
        name: typeof name === "string" ? redact(name, 48) : undefined,
        message:
          typeof message === "string"
            ? redact(
                name === "SyntaxError"
                  ? message
                      .slice(0, 16_384)
                      .replace(/"[^"]*(?:"|$)|'[^']*(?:'|$)/g, "[source omitted]")
                  : message,
                240,
              )
            : "Non-Error object thrown",
        // Exclude the stack header: it repeats the message and can contain body previews.
        stack:
          typeof stack === "string"
            ? redact(stack.slice(0, 16_384).split("\n").slice(1, 5).join("\n"), 360, true)
            : undefined,
        status: integer(read(value, "status"), 599),
      });
      for (const key of causeKeys) visit(read(value, key), key, depth + 1);
    } else {
      result.push({ via, message: redact(String(value), 240) });
    }
  };
  visit(error, "error", 0);
  return result;
}

const stats = {
  sent: 0,
  failed: 0,
  droppedDelivery: 0,
  droppedLimit: 0,
  droppedQueue: 0,
  droppedDuplicate: 0,
  expired: 0,
  restored: 0,
  storageFailed: 0,
  storageDropped: 0,
  deferredLimit: 0,
};
export function getClientDiagnosticStats(): Readonly<typeof stats> {
  return { ...stats };
}
type Pending = {
  event: ClientDiagnostic;
  snapshot: DiagnosticSnapshot;
  key: string;
  attempts: number;
  nextAttemptAt: number;
  id: string;
  page: "poke-lounge" | "other";
  release?: string;
  version: number;
};
const STORAGE_KEY = "poke-lounge.diagnostics.v1";
const RETENTION_MS = 24 * 60 * 60 * 1000;
const MAX_PENDING = 16;
let restored = false;
const queue: Pending[] = [];
const duplicates = new Map<string, number>();
const reported = new WeakMap<DiagnosticSnapshot, string>();
let active: Pending | undefined;
let pumping = false;
let timer: ReturnType<typeof setTimeout> | undefined;
let windowStarted = 0;
let attempts = 0;
let backgroundAttempts = 0;

function payload(item: Pending) {
  const { event, snapshot } = item;
  const causes = (snapshot.causes ?? []).map(item => ({ ...item }));
  const detail = {
    reportId: item.id,
    at: snapshot.at,
    context: cleanContext(snapshot.context),
    request: snapshot.request ? cleanTrace(snapshot.request) : undefined,
    causes,
    breadcrumbs: snapshot.breadcrumbs.slice(),
    environment: snapshot.environment,
    delivery: getClientDiagnosticStats(),
    attempt: item.attempts,
  };
  // Rust limits errorText by UTF-8 bytes, not JS string length. Trim whole fields, never JSON.
  while (new TextEncoder().encode(JSON.stringify(detail)).length > 8000) {
    const stack = detail.causes
      .slice()
      .reverse()
      .find(cause => cause.stack);
    if (detail.breadcrumbs.length > 8) detail.breadcrumbs.shift();
    else if (stack) delete stack.stack;
    else if (detail.breadcrumbs.length > 1) detail.breadcrumbs.shift();
    else if (detail.causes.length > 1) detail.causes.pop();
    else break;
  }
  return {
    kind: event.kind,
    code: label(event.code) ?? "UNKNOWN",
    requestId: uuid(snapshot.request?.requestId ?? event.requestId),
    page: item.page,
    line: integer(event.line, 1_000_000),
    column: integer(event.column, 1_000_000),
    script:
      event.script && /^\/_next\/static\/[A-Za-z0-9_./-]{1,186}$/.test(event.script)
        ? event.script
        : undefined,
    roomInstanceId: uuid(snapshot.context.roomInstanceId),
    // Room access codes and session identifiers are deliberately not collected.
    errorName: label(event.errorName ?? read(event.error, "name"), 48),
    errorText: JSON.stringify(detail),
    startupStep:
      event.startupStep && /^[a-z_]{1,48}$/.test(event.startupStep) ? event.startupStep : undefined,
    resourcePath:
      event.resourcePath &&
      /^\/(?:assets|game-data)\/[A-Za-z0-9._/-]{1,180}$/.test(event.resourcePath) &&
      !event.resourcePath.includes("..")
        ? event.resourcePath
        : undefined,
    userCode: event.userCode && /^\d{5}$/.test(event.userCode) ? event.userCode : undefined,
    release: item.release,
  };
}

function persistQueue(): void {
  try {
    // Persist only the same redacted, size-bounded payload that is allowed onto the wire.
    const pending = [...(active ? [active] : []), ...queue].slice(0, MAX_PENDING);
    if (!pending.length) window.sessionStorage.removeItem(STORAGE_KEY);
    else {
      const entries = pending.map(item => ({
        body: payload(item),
        priority: item.event.priority,
        attempts: item.attempts,
      }));
      while (JSON.stringify(entries).length > 200_000) {
        entries.pop();
        stats.storageDropped++;
      }
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    }
  } catch {
    stats.storageFailed++;
  }
}

export function resumeClientDiagnostics(): void {
  if (typeof window === "undefined") return;
  if (!restored) {
    restored = true;
    try {
      const raw = window.sessionStorage.getItem(STORAGE_KEY);
      const saved: unknown = raw && raw.length <= 200_000 ? JSON.parse(raw) : [];
      if (Array.isArray(saved))
        for (const entry of saved.slice(0, MAX_PENDING)) {
          const body = read(entry, "body");
          const encoded = read(body, "errorText");
          if (typeof encoded !== "string" || encoded.length > 8192) continue;
          // Storage is untrusted. Reconstruct only allowlisted fields, never replay arbitrary JSON.
          let detail: unknown;
          try {
            detail = JSON.parse(encoded);
          } catch {
            continue;
          }
          const at = integer(read(detail, "at"));
          if (at === undefined || at > Date.now() || Date.now() - at >= RETENTION_MS) {
            stats.expired++;
            continue;
          }
          const kind = read(body, "kind");
          if (kind !== "runtime" && kind !== "rejection" && kind !== "api" && kind !== "room")
            continue;
          const source = read(detail, "context");
          const request = read(detail, "request");
          const causes = read(detail, "causes"),
            crumbs = read(detail, "breadcrumbs");
          const text = (value: unknown, max: number, stack = false) =>
            typeof value === "string" ? redact(value, max, stack) : undefined;
          const env = read(detail, "environment");
          const snapshot: DiagnosticSnapshot = {
            at,
            context: cleanContext(source),
            request: request ? cleanTrace(request) : undefined,
            causes: Array.isArray(causes)
              ? causes.slice(0, 8).map(cause => ({
                  via: label(read(cause, "via"), 24) ?? "error",
                  name: text(read(cause, "name"), 48),
                  message: text(read(cause, "message"), 240),
                  stack: text(read(cause, "stack"), 360, true),
                  status: integer(read(cause, "status"), 599),
                }))
              : [],
            breadcrumbs: Array.isArray(crumbs)
              ? crumbs.slice(-24).map(crumb => ({
                  at: integer(read(crumb, "at")) ?? at,
                  event: label(read(crumb, "event"), 48) ?? "unknown",
                  ...cleanContext(crumb),
                  ...cleanTrace(crumb),
                }))
              : [],
            environment: env
              ? {
                  online: read(env, "online") === true,
                  visibility: read(env, "visibility") === "visible" ? "visible" : "hidden",
                  navigation: label(read(env, "navigation"), 24),
                  discarded: read(env, "discarded") === true,
                }
              : undefined,
          };
          const event: ClientDiagnostic = {
            kind,
            code: label(read(body, "code")) ?? "UNKNOWN",
            errorName: label(read(body, "errorName"), 48),
            requestId: uuid(read(body, "requestId")),
            line: integer(read(body, "line"), 1_000_000),
            column: integer(read(body, "column"), 1_000_000),
            script: text(read(body, "script"), 200),
            resourcePath: text(read(body, "resourcePath"), 200),
            startupStep: label(read(body, "startupStep"), 48),
            userCode: label(read(body, "userCode"), 5),
            priority: read(entry, "priority") === "background" ? "background" : "error",
          };
          const id = uuid(read(detail, "reportId")) ?? crypto.randomUUID();
          if (queue.length >= MAX_PENDING || queue.some(item => item.id === id)) continue;
          const release = read(body, "release");
          queue.push({
            event,
            snapshot,
            key: snapshot.request?.requestId ?? id,
            id,
            version: 0,
            attempts: integer(read(entry, "attempts"), 10000) ?? 0,
            nextAttemptAt: 0,
            page: read(body, "page") === "poke-lounge" ? "poke-lounge" : "other",
            release:
              typeof release === "string" && /^[a-f0-9]{40}$/i.test(release) ? release : undefined,
          });
          stats.restored++;
        }
    } catch {
      stats.storageFailed++;
    }
  }
  persistQueue();
  for (const item of queue) item.nextAttemptAt = 0;
  if (timer !== undefined) clearTimeout(timer);
  timer = undefined;
  schedule();
}

export function flushClientDiagnostics(): void {
  persistQueue();
  if (timer !== undefined) clearTimeout(timer);
  timer = undefined;
  void pump();
}

function schedule(delay = 250): void {
  if (timer !== undefined || pumping || !queue.length || !navigator.onLine) return;
  timer = setTimeout(() => {
    timer = undefined;
    void pump();
  }, delay);
}

function wakeQueue(): void {
  if (timer !== undefined) clearTimeout(timer);
  timer = undefined;
  schedule();
}

async function pump(): Promise<void> {
  if (pumping || !navigator.onLine) return;
  const now = Date.now();
  for (let index = queue.length - 1; index >= 0; index--) {
    if (now - queue[index].snapshot.at >= RETENTION_MS) {
      queue.splice(index, 1);
      stats.expired++;
    }
  }
  if (now - windowStarted >= 60_000) {
    windowStarted = now;
    attempts = 0;
    backgroundAttempts = 0;
  }
  if (
    attempts >= 10 ||
    (backgroundAttempts >= 2 && queue.every(item => item.event.priority === "background"))
  ) {
    stats.deferredLimit++;
    persistQueue();
    schedule(Math.max(1000, windowStarted + 60_000 - now));
    return;
  }
  const eligible = queue.findIndex(
    item =>
      item.nextAttemptAt <= now && (item.event.priority !== "background" || backgroundAttempts < 2),
  );
  if (eligible < 0) {
    persistQueue();
    if (queue.length)
      schedule(
        Math.max(
          1000,
          Math.min(
            ...queue.map(item =>
              item.event.priority === "background" && backgroundAttempts >= 2
                ? Math.max(item.nextAttemptAt, windowStarted + 60_000)
                : item.nextAttemptAt,
            ),
          ) - now,
        ),
      );
    return;
  }
  pumping = true;
  const [item] = queue.splice(eligible, 1);
  active = item;
  if (!item) {
    pumping = false;
    return;
  }
  const background = item.event.priority === "background";
  const version = item.version;
  attempts++;
  if (background) backgroundAttempts++;
  item.attempts++;
  persistQueue();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  let retryable = false;
  let delivered = false;
  try {
    const response = await fetch(`${getApiBaseUrl()}/diagnostics/client-errors`, {
      method: "POST",
      mode: "cors",
      cache: "no-store",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload(item)),
      signal: controller.signal,
    });
    if (response.ok) {
      stats.sent++;
      delivered = true;
    } else {
      stats.failed++;
      retryable = response.status === 429 || response.status >= 500;
    }
  } catch {
    stats.failed++;
    retryable = true;
  } finally {
    clearTimeout(timeout);
  }
  if (retryable || (delivered && version !== item.version)) {
    item.nextAttemptAt =
      Date.now() +
      (retryable ? Math.min(60_000, 2000 * 2 ** Math.min(item.attempts - 1, 5)) : 1000);
    queue.push(item);
  } else if (!delivered) stats.droppedDelivery++;
  active = undefined;
  pumping = false;
  persistQueue();
  schedule(1000);
}

export function reportClientDiagnostic(event: ClientDiagnostic): void {
  if (typeof window === "undefined") return;
  try {
    if (!restored) resumeClientDiagnostics();
    const snapshot =
      findFailure(event.error) ??
      event.snapshot ??
      captureClientDiagnosticSnapshot(event.requestId ? { requestId: event.requestId } : undefined);
    snapshot.causes ??= errorCauses(event.error);
    if (event.error && typeof event.error === "object" && !findFailure(event.error))
      failures.set(event.error, snapshot);
    const key =
      snapshot.request?.requestId ??
      `${event.code}:${event.script ?? event.resourcePath ?? ""}:${JSON.stringify(snapshot.causes)}`;
    const pending =
      active?.snapshot === snapshot || active?.key === key
        ? active
        : queue.find(item => item.snapshot === snapshot || item.key === key);
    if (pending) {
      // A room handler adds the user-facing code to the same request failure before delivery.
      if (
        event.userCode ||
        event.startupStep ||
        event.kind === "room" ||
        pending.event.priority === "background"
      ) {
        if (
          pending.event.kind !== event.kind ||
          pending.event.code !== event.code ||
          pending.event.userCode !== event.userCode ||
          pending.event.priority === "background"
        )
          pending.version++;
        pending.event = { ...pending.event, ...event, priority: event.priority ?? "error" };
        reported.set(snapshot, pending.event.userCode ?? "");
        // Preserve the original exception captured at failure; add only the outer handler's label.
        if (pending.snapshot.causes?.[0]?.via === "error" && event.error) {
          const outer = errorCauses(event.error)[0];
          if (outer && outer.message !== pending.snapshot.causes[0].message) {
            pending.snapshot.causes = [
              { ...outer, via: "handler" },
              ...pending.snapshot.causes,
            ].slice(0, 8);
          }
        }
      }
      stats.droppedDuplicate++;
      persistQueue();
      wakeQueue();
      return;
    }
    const now = Date.now();
    for (const [id, at] of duplicates) if (now - at >= 10_000) duplicates.delete(id);
    const addsUserCode =
      event.userCode && reported.has(snapshot) && reported.get(snapshot) !== event.userCode;
    if (!addsUserCode && (reported.has(snapshot) || duplicates.has(key))) {
      stats.droppedDuplicate++;
      return;
    }
    if (queue.length + (active ? 1 : 0) >= MAX_PENDING) {
      let index = queue.findIndex(item => item.event.priority === "background");
      if (index < 0 && (event.userCode || event.kind === "runtime" || event.kind === "rejection")) {
        index = queue.findIndex(item => !item.event.userCode && item.event.kind === "api");
      }
      if (index < 0 || event.priority === "background") {
        stats.droppedQueue++;
        return;
      }
      queue.splice(index, 1);
      stats.droppedQueue++;
    }
    reported.set(snapshot, event.userCode ?? "");
    duplicates.set(key, now);
    if (duplicates.size > 40) duplicates.delete(duplicates.keys().next().value!);
    const item: Pending = {
      event: { ...event },
      snapshot,
      key,
      attempts: 0,
      nextAttemptAt: 0,
      version: 0,
      id: crypto.randomUUID(),
      page:
        routing.locales.some(locale => window.location.pathname === `/${locale}`) ||
        window.location.pathname.includes("/game/poke-lounge")
          ? "poke-lounge"
          : "other",
      release: /^[a-f0-9]{40}$/i.test(process.env.NEXT_PUBLIC_RELEASE_SHA ?? "")
        ? process.env.NEXT_PUBLIC_RELEASE_SHA
        : undefined,
    };
    if (event.priority === "background") queue.push(item);
    else queue.unshift(item);
    persistQueue();
    wakeQueue();
  } catch {
    stats.droppedQueue++;
    // Never report a diagnostic delivery/serialization failure through diagnostics.
  }
}

export function createDiagnosticRequestId(): string {
  return crypto.randomUUID();
}
