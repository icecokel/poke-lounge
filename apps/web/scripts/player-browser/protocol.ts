/** A deliberately small input vocabulary: no scripts, selectors, APIs or game state hooks. */
export type Target = {
  role: "button" | "textbox" | "radio" | "checkbox" | "link";
  name: string;
  within?: { role: "dialog" | "alertdialog" | "region"; name: string };
};
export type Input =
  | { kind: "click" | "tap"; target: Target }
  | { kind: "fill"; target: Target; text: string }
  | { kind: "press"; key: string }
  | { kind: "hold"; key: string; ms: number }
  | { kind: "drag"; from: [number, number]; to: [number, number]; ms: number }
  | { kind: "scroll"; dx: number; dy: number };
export type Receipt = { frameId: string; sha256: string; observation: string };
export type Request =
  | { kind: "observe" | "status" | "close"; requestId: string }
  | { kind: "act"; requestId: string; seen: Receipt; input: Input };
export type Frame = {
  id: string;
  capturedAt: number;
  sha256: string;
  imagePath: string;
  text: string;
  timers: string[];
  expiresAt: number;
  image: { type: "image"; mimeType: "image/jpeg"; data: string };
};
export type Reply = {
  code: string;
  input: "not-sent" | "sent" | "uncertain";
  frame?: Frame;
  interrupted: boolean;
  message?: string;
};
export class ProtocolError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
const fail = (message: string): never => {
  throw new ProtocolError("INVALID_REQUEST", message);
};
function object(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fail("Expected object");
  const item = value as Record<string, unknown>;
  if (Object.keys(item).some(key => !keys.includes(key))) return fail("Unknown field");
  return item;
}
function text(value: unknown, max = 200): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) return fail("Invalid text");
  return value;
}
function integer(value: unknown, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max)
    return fail("Invalid number");
  return value;
}
function target(value: unknown): Target {
  const item = object(value, ["role", "name", "within"]);
  if (!["button", "textbox", "radio", "checkbox", "link"].includes(String(item.role)))
    return fail("Unsupported role");
  let within: Target["within"];
  if (item.within !== undefined) {
    const region = object(item.within, ["role", "name"]);
    if (!["dialog", "alertdialog", "region"].includes(String(region.role)))
      return fail("Unsupported container");
    within = {
      role: region.role as NonNullable<Target["within"]>["role"],
      name: text(region.name),
    };
  }
  return {
    role: item.role as Target["role"],
    name: text(item.name, 500),
    ...(within ? { within } : {}),
  };
}
function key(value: unknown): string {
  const result = text(value, 50);
  // No DevTools/clipboard chords or raw JavaScript; this is physical keyboard input only.
  if (
    !/^(?:Arrow(?:Up|Down|Left|Right)|Enter|Escape|Space|Tab|Backspace|[a-zA-Z0-9])$/.test(result)
  )
    return fail("Unsupported key");
  return result;
}
function point(value: unknown): [number, number] {
  if (!Array.isArray(value) || value.length !== 2) return fail("Invalid pointer coordinates");
  return [integer(value[0], 0, 1600), integer(value[1], 0, 1200)];
}
export function parseInput(value: unknown): Input {
  const item = object(value, ["kind", "target", "text", "key", "ms", "from", "to", "dx", "dy"]);
  switch (item.kind) {
    case "tap":
    case "click":
      return { kind: item.kind, target: target(item.target) };
    case "fill": {
      const field = target(item.target);
      if (field.role !== "textbox" || typeof item.text !== "string" || item.text.length > 200)
        return fail("Invalid text entry");
      return { kind: "fill", target: field, text: item.text };
    }
    case "press":
      return { kind: "press", key: key(item.key) };
    case "hold":
      return { kind: "hold", key: key(item.key), ms: integer(item.ms, 1, 1500) };
    case "drag":
      return {
        kind: "drag",
        from: point(item.from),
        to: point(item.to),
        ms: integer(item.ms, 1, 1500),
      };
    case "scroll":
      return {
        kind: "scroll",
        dx: integer(item.dx, -1000, 1000),
        dy: integer(item.dy, -1000, 1000),
      };
    default:
      return fail("Unsupported input");
  }
}
export function parseRequest(value: unknown): Request {
  const item = object(value, ["kind", "requestId", "seen", "input"]);
  const requestId = text(item.requestId, 80);
  if (!["act", "observe", "close", "status"].includes(String(item.kind)))
    return fail("Unsupported command");
  if (item.kind !== "act") {
    if (item.seen !== undefined || item.input !== undefined) return fail("Unexpected input");
    return { kind: item.kind as "observe" | "close" | "status", requestId };
  }
  const seen = object(item.seen, ["frameId", "sha256", "observation"]);
  const sha256 = text(seen.sha256, 64);
  if (!/^[0-9a-f]{64}$/.test(sha256)) return fail("Invalid image hash");
  return {
    kind: "act",
    requestId,
    seen: { frameId: text(seen.frameId, 80), sha256, observation: text(seen.observation, 500) },
    input: parseInput(item.input),
  };
}
export function validateSession(value: string): string {
  if (!/^[a-z][a-z0-9-]{2,40}$/.test(value))
    return fail("Session must be 3-41 lowercase letters, numbers or hyphens");
  return value;
}
export function validateLocalUrl(value: string): string {
  const url = new URL(value);
  if (
    url.protocol !== "http:" ||
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    url.username ||
    url.password
  )
    return fail("Only a local HTTP game URL is allowed");
  if ([...url.searchParams.keys()].some(name => /e2e|localtest|encounterrate/i.test(name)))
    return fail("Test hook URLs are not player sessions");
  return url.href;
}
export function sanitize(value: string): string {
  return value
    .replace(/https?:\/\/[^\s"<>]+/g, "[url]")
    .replace(/\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/gi, "[id]")
    .replace(/\b[A-Z0-9]{5,8}\b/g, word => (["LOUNGE", "ROUND"].includes(word) ? word : "[code]"))
    .replace(
      /(\b(?:token|cookie|sessionId|password|authorization)\s*[:=]\s*)[^\s,]+/gi,
      "$1[redacted]",
    );
}
export function frameExpiry(capturedAt: number, timers: string[]): number {
  let ttl = 20_000;
  for (const timer of timers) {
    const turn = timer.match(/(?:선택 시간|Selection time|Time to choose|選択時間)\s*(\d+)\s*s?/i);
    const round = timer.match(/(?:시작까지|Starts in|開始まで)\s*(\d{1,2}):(\d{2})/i);
    if (round)
      ttl = Math.min(ttl, Math.max(0, (Number(round[1]) * 60 + Number(round[2])) * 1000 - 2000));
    if (turn) ttl = Math.min(ttl, Math.max(0, Number(turn[1]) * 1000 - 2000));
  }
  return capturedAt + ttl;
}
