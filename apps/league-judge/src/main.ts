import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createHash, timingSafeEqual } from "node:crypto";
import { resolve } from "node:path";
import { Worker } from "node:worker_threads";
import { LEAGUE_JUDGE_PROTOCOL } from "@poke-lounge/battle/league/contract";
import { LEAGUE_ENGINE_VERSION } from "@poke-lounge/battle/league/engine-version";
import { LEAGUE_ROSTER_VERSION } from "@poke-lounge/battle/league/roster/index";
import {
  JOB_TIMEOUT_MS,
  MAX_BODY_BYTES,
  MAX_QUEUE,
  QUEUE_TIMEOUT_MS,
  requestSchema,
  type JudgeRequest,
  type JudgeResponse,
  type WorkerMessage,
} from "./protocol";

const token = process.env.LEAGUE_JUDGE_TOKEN ?? "";
if (token.length < 32 || token.length > 256 || !/^[\x20-\x7e]+$/.test(token))
  throw new Error("LEAGUE_JUDGE_TOKEN must contain 32..256 printable ASCII characters");
const tokenHash = createHash("sha256").update(token).digest();
const concurrency = Number(process.env.LEAGUE_JUDGE_CONCURRENCY ?? "1");
if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 4)
  throw new Error("LEAGUE_JUDGE_CONCURRENCY must be 1..4");
const port = Number(process.env.LEAGUE_JUDGE_PORT ?? "3031");
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("Invalid LEAGUE_JUDGE_PORT");
const release = /^[a-f0-9]{40}$/i.test(process.env.RELEASE_SHA ?? "")
  ? process.env.RELEASE_SHA
  : "local";
let draining = false;
let inFlight = 0;
type Pending = {
  input: JudgeRequest;
  response: ServerResponse;
  queuedAt: number;
  started: number | null;
  timer: ReturnType<typeof setTimeout>;
};
type Slot = { worker: Worker; ready: boolean; restarting: boolean; pending: Pending | null };
const slots: Slot[] = [];
const waiting: Pending[] = [];

function log(
  level: "info" | "warn" | "error",
  event: string,
  fields: Record<string, unknown>,
): void {
  const line =
    JSON.stringify({ level, event, timestamp: new Date().toISOString(), release, ...fields }) +
    "\n";
  (level === "info" ? process.stdout : process.stderr).write(line);
}
function json(response: ServerResponse, status: number, body: unknown): void {
  if (response.destroyed || response.writableEnded) return;
  response.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  response.end(JSON.stringify(body));
}
function failure(input: JudgeRequest | undefined, code: string): unknown {
  return {
    protocol: LEAGUE_JUDGE_PROTOCOL,
    requestId: input?.requestId,
    engineVersion: LEAGUE_ENGINE_VERSION,
    ok: false,
    code,
    detail: null,
  };
}
function unavailable(pending: Pending, reason: string): void {
  clearTimeout(pending.timer);
  inFlight--;
  json(pending.response, 503, failure(pending.input, "JUDGE_UNAVAILABLE"));
  log("error", "league.judge.failed", {
    requestId: pending.input.requestId,
    op: pending.input.op.kind,
    code: reason,
    durationMs: pending.started === null ? 0 : Date.now() - pending.started,
    queueMs: (pending.started ?? Date.now()) - pending.queuedAt,
  });
}
function dispatch(): void {
  if (draining) return;
  for (const slot of slots) {
    if (!slot.ready || slot.restarting || slot.pending) continue;
    const pending = waiting.shift();
    if (!pending) return;
    clearTimeout(pending.timer);
    pending.started = Date.now();
    pending.timer = setTimeout(() => restart(slot, "execution-timeout"), JOB_TIMEOUT_MS);
    slot.pending = pending;
    slot.worker.postMessage(pending.input);
  }
}
function finish(slot: Slot, message: Extract<WorkerMessage, { result: JudgeResponse }>): void {
  const pending = slot.pending;
  if (!pending) return;
  slot.pending = null;
  clearTimeout(pending.timer);
  inFlight--;
  const result = message.result;
  json(pending.response, 200, result);
  const durationMs = Date.now() - pending.started!;
  const fields = {
    requestId: pending.input.requestId,
    op: pending.input.op.kind,
    durationMs,
    queueMs: pending.started! - pending.queuedAt,
    errorClass: message.errorClass,
    advances: message.advances,
    outcome: message.outcome,
    ...(result.ok ? {} : { code: result.code }),
  };
  log(
    result.ok ? "info" : result.code === "ENGINE_STALL" ? "error" : "warn",
    result.ok ? "league.judge.op" : "league.judge.failed",
    fields,
  );
  if (durationMs >= 2000) log("warn", "league.judge.slow", fields);
  dispatch();
}
function restart(slot: Slot, reason: string): void {
  if (slot.restarting) return;
  slot.restarting = true;
  slot.ready = false;
  if (slot.pending) {
    unavailable(slot.pending, reason);
    slot.pending = null;
  }
  log("error", "league.judge.failed", { code: reason, slot: slots.indexOf(slot) });
  const old = slot.worker;
  old.removeAllListeners();
  void old.terminate().finally(() => {
    if (draining) return;
    const timer = setTimeout(() => {
      if (draining) return;
      slot.worker = makeWorker(slot);
      slot.restarting = false;
    }, 500);
    timer.unref();
  });
  dispatch();
}
function makeWorker(slot: Slot): Worker {
  const worker = new Worker(resolve(__dirname, "compute.js"), {
    resourceLimits: { maxOldGenerationSizeMb: 256, maxYoungGenerationSizeMb: 32 },
    env: { NODE_ENV: "production", LEAGUE_WEB_ROOT: process.env.LEAGUE_WEB_ROOT ?? "../web" },
  });
  worker.on("message", (message: WorkerMessage) => {
    if ("ready" in message) {
      if (message.engineVersion !== LEAGUE_ENGINE_VERSION) {
        restart(slot, "worker-version-mismatch");
        return;
      }
      slot.ready = true;
      dispatch();
    } else if (
      !slot.pending ||
      message.result.requestId !== slot.pending.input.requestId ||
      message.result.engineVersion !== LEAGUE_ENGINE_VERSION ||
      message.result.protocol !== LEAGUE_JUDGE_PROTOCOL
    )
      restart(slot, "worker-protocol-mismatch");
    else finish(slot, message);
  });
  worker.on("error", () => restart(slot, "worker-error"));
  worker.on("exit", () => {
    if (!draining) restart(slot, "worker-exit");
  });
  return worker;
}
for (let index = 0; index < concurrency; index++) {
  const slot = { ready: false, restarting: false, pending: null } as Slot;
  slot.worker = makeWorker(slot);
  slots.push(slot);
}

function authorized(request: IncomingMessage): boolean {
  const supplied = request.headers["x-league-judge-token"];
  return (
    typeof supplied === "string" &&
    supplied.length <= 256 &&
    timingSafeEqual(tokenHash, createHash("sha256").update(supplied).digest())
  );
}
async function receive(request: IncomingMessage, response: ServerResponse): Promise<void> {
  if (!authorized(request)) {
    json(response, 401, failure(undefined, "UNAUTHORIZED"));
    return;
  }
  const readyWorkers = slots.filter(slot => slot.ready && !slot.restarting).length;
  if (request.method === "GET" && request.url === "/health") {
    const ready = !draining && readyWorkers > 0;
    json(response, ready ? 200 : 503, {
      ready,
      engineVersion: LEAGUE_ENGINE_VERSION,
      rosterVersion: LEAGUE_ROSTER_VERSION,
      readyWorkers,
      queue: waiting.length,
    });
    return;
  }
  if (request.method !== "POST" || request.url !== "/v1/op") {
    json(response, 404, failure(undefined, "NOT_FOUND"));
    return;
  }
  if (draining || readyWorkers === 0 || inFlight >= concurrency + MAX_QUEUE) {
    json(response, 503, failure(undefined, "JUDGE_UNAVAILABLE"));
    return;
  }
  inFlight++;
  let queued = false;
  try {
    let bytes = 0;
    const chunks: Buffer[] = [];
    for await (const part of request) {
      const buffer = Buffer.isBuffer(part) ? part : Buffer.from(part as string);
      bytes += buffer.length;
      if (bytes > MAX_BODY_BYTES) {
        response.setHeader("connection", "close");
        json(response, 200, failure(undefined, "INVALID_REQUEST"));
        return;
      }
      chunks.push(buffer);
    }
    const parsed = requestSchema.safeParse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    if (!parsed.success) {
      json(response, 200, failure(undefined, "INVALID_REQUEST"));
      return;
    }
    const input: JudgeRequest = parsed.data;
    if (input.engineVersion !== LEAGUE_ENGINE_VERSION) {
      json(response, 200, failure(input, "ENGINE_VERSION_MISMATCH"));
      return;
    }
    if (draining || waiting.length >= MAX_QUEUE) {
      json(response, 503, failure(input, "JUDGE_UNAVAILABLE"));
      return;
    }
    const pending: Pending = {
      input,
      response,
      queuedAt: Date.now(),
      started: null,
      timer: setTimeout(() => {
        const index = waiting.indexOf(pending);
        if (index >= 0) {
          waiting.splice(index, 1);
          unavailable(pending, "queue-timeout");
        }
      }, QUEUE_TIMEOUT_MS),
    };
    waiting.push(pending);
    queued = true;
    dispatch();
  } catch {
    json(response, 200, failure(undefined, "INVALID_REQUEST"));
  } finally {
    if (!queued) inFlight--;
  }
}
const server = createServer((request, response) => {
  void receive(request, response).catch(() => {
    log("error", "league.judge.failed", { code: "receive-failed" });
    json(response, 503, failure(undefined, "JUDGE_UNAVAILABLE"));
  });
});
server.on("clientError", (_error, socket) => {
  if (socket.writable) socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
  else socket.destroy();
});
server.on("error", () => {
  log("error", "league.judge.failed", { code: "server-error" });
  process.exit(1);
});
server.requestTimeout = 10000;
server.headersTimeout = 5000;
server.timeout = 15000;
server.maxConnections = 32;
server.listen(port, process.env.LEAGUE_JUDGE_HOST ?? "127.0.0.1", () =>
  log("info", "league.judge.started", {
    workers: concurrency,
    engineVersion: LEAGUE_ENGINE_VERSION,
  }),
);
function stop(): void {
  if (draining) return;
  draining = true;
  for (const pending of waiting.splice(0)) unavailable(pending, "draining");
  server.close(() => {
    void Promise.all(slots.map(slot => slot.worker.terminate())).then(() => process.exit(0));
  });
  const timer = setTimeout(() => {
    server.closeAllConnections();
    void Promise.all(slots.map(slot => slot.worker.terminate())).then(() => process.exit(1));
  }, 10000);
  timer.unref();
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
process.on("uncaughtException", () => {
  log("error", "league.judge.failed", { code: "uncaught-exception" });
  process.exit(1);
});
process.on("unhandledRejection", () => {
  log("error", "league.judge.failed", { code: "unhandled-rejection" });
  process.exit(1);
});
