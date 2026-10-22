import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { availableParallelism } from "node:os";
import { createHash, timingSafeEqual } from "node:crypto";
import { Worker } from "node:worker_threads";
import { computeFailureDiagnostic, type ComputeFailureDiagnostic } from "./diagnostics";
import {
  ENGINE_VERSION,
  MAX_BODY_BYTES,
  MAX_RESPONSE_BYTES,
  MAX_JOBS,
  JOB_TIMEOUT_MS,
  requestSchema,
  type ComputeRequest,
  type ComputeResponse,
} from "./protocol";

const token =
  process.env.BATTLE_WORKER_TOKEN ??
  readFileSync(process.env.BATTLE_WORKER_TOKEN_FILE ?? "/run/poke-private/token", "utf8").trim();
if (token.length < 32 || token.length > 256 || !/^[\x20-\x7e]+$/.test(token))
  throw new Error("Battle worker token must contain 32..256 printable ASCII characters");
const tokenHash = createHash("sha256").update(token).digest();
const concurrency = Math.min(4, Math.max(1, availableParallelism()));
let draining = false;
let inFlight = 0;
const release = /^[a-f0-9]{40}$/i.test(process.env.RELEASE_SHA ?? "")
  ? process.env.RELEASE_SHA
  : "local";
type Pending = {
  input: ComputeRequest;
  response: ServerResponse;
  timer: ReturnType<typeof setTimeout>;
  started: number;
  dispatchedAt?: number;
};
type Slot = { worker: Worker; ready: boolean; pending: Pending | null; restarting: boolean };
const slots: Slot[] = [];
const waiting: Pending[] = [];

/** One structured line per event; `level` lets log tooling filter like the Rust API's levels. */
function log(
  level: "info" | "warn" | "error",
  event: string,
  fields: Record<string, unknown>,
): void {
  const line =
    JSON.stringify({ level, event, timestamp: new Date().toISOString(), release, ...fields }) +
    "\n";
  if (level === "info") process.stdout.write(line);
  else process.stderr.write(line);
}
function requestFields(input: ComputeRequest | undefined): Record<string, unknown> {
  return input
    ? {
        requestId: input.requestId,
        roomInstanceId: input.roomInstanceId,
        revision: input.stateRevision,
        operation: input.operation.kind,
      }
    : {};
}

function json(response: ServerResponse, status: number, body: unknown): void {
  if (response.destroyed || response.writableEnded) return;
  const encoded = JSON.stringify(body);
  const bytes = Buffer.byteLength(encoded);
  if (bytes > MAX_RESPONSE_BYTES) {
    const requestId =
      body && typeof body === "object" && "requestId" in body ? body.requestId : undefined;
    log("error", "compute.response_too_large", {
      requestId,
      status,
      bytes,
      max: MAX_RESPONSE_BYTES,
    });
    response.writeHead(500, { "content-type": "application/json" });
    response.end('{"code":"COMPUTE_RESPONSE_TOO_LARGE"}');
    return;
  }
  response.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  response.end(encoded);
}
function finish(
  slot: Slot,
  status: number,
  result: unknown,
  diagnostic?: ComputeFailureDiagnostic,
): void {
  const pending = slot.pending;
  if (!pending) return;
  clearTimeout(pending.timer);
  slot.pending = null;
  inFlight--;
  if (status >= 400 || Date.now() - pending.started >= 2_000) {
    // Input rejections (422) are expected traffic; real failures are errors.
    log(status >= 500 ? "error" : "warn", status >= 400 ? "compute.failed" : "compute.slow", {
      ...requestFields(pending.input),
      status,
      durationMs: Date.now() - pending.started,
      queueMs: (pending.dispatchedAt ?? Date.now()) - pending.started,
      diagnostic,
    });
  }
  if (pending.response.destroyed) {
    // The API gave up (its 9s client timeout) or disconnected; the result is discarded.
    log("warn", "compute.client_gone", {
      ...requestFields(pending.input),
      status,
      durationMs: Date.now() - pending.started,
    });
  }
  json(pending.response, status, result);
  dispatch();
}
function restart(slot: Slot, reason: string): void {
  if (slot.restarting || draining) return;
  slot.restarting = true;
  slot.ready = false;
  log("error", "compute.worker_restart", {
    reason,
    slot: slots.indexOf(slot),
    ...requestFields(slot.pending?.input),
  });
  const input = slot.pending?.input;
  const diagnostic = { reason, issues: [] };
  finish(
    slot,
    503,
    {
      protocolVersion: 1,
      requestId: input?.requestId,
      roomInstanceId: input?.roomInstanceId,
      stateRevision: input?.stateRevision,
      engineVersion: ENGINE_VERSION,
      ok: false,
      code: "COMPUTE_WORKER_UNAVAILABLE",
      diagnostic,
    },
    diagnostic,
  );
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
}
function makeWorker(slot: Slot): Worker {
  const worker = new Worker(resolve(__dirname, "compute.js"), {
    resourceLimits: { maxOldGenerationSizeMb: 256, maxYoungGenerationSizeMb: 32 },
    // Do not pass the parent process's possible database credentials to compute threads.
    env: { NODE_ENV: "production", BATTLE_WEB_ROOT: process.env.BATTLE_WEB_ROOT ?? "../web" },
  });
  worker.on(
    "message",
    (
      message: ComputeResponse | { ready: true; engineVersion: string } | { protocolError: true },
    ) => {
      if ("ready" in message) {
        if (message.engineVersion !== ENGINE_VERSION) {
          restart(slot, "engine-version-mismatch");
          return;
        }
        slot.ready = true;
        log("info", "compute.worker_ready", {
          slot: slots.indexOf(slot),
          readyWorkers: slots.filter(item => item.ready && !item.restarting).length,
          engineVersion: ENGINE_VERSION,
        });
        dispatch();
        return;
      }
      if (!slot.pending) return;
      if (!("requestId" in message) || message.requestId !== slot.pending.input.requestId) {
        restart(slot, "protocol-mismatch");
        return;
      }
      finish(
        slot,
        message.ok ? 200 : message.code === "INVALID_INPUT" ? 422 : 500,
        message,
        message.ok ? undefined : message.diagnostic,
      );
    },
  );
  worker.on("error", error => {
    log("error", "compute.worker_error", {
      ...requestFields(slot.pending?.input),
      diagnostic: computeFailureDiagnostic(error),
    });
    restart(slot, "worker-error");
  });
  worker.on("exit", code => {
    // A compute thread never exits on its own; even exit 0 would leave this slot dead forever.
    if (!draining) restart(slot, `worker-exit-${code}`);
  });
  return worker;
}
function dispatch(): void {
  if (draining) return;
  for (const slot of slots) {
    if (!slot.ready || slot.pending || slot.restarting) continue;
    let pending = waiting.shift();
    while (pending?.response.destroyed) {
      clearTimeout(pending.timer);
      inFlight--;
      log("warn", "compute.abandoned", {
        ...requestFields(pending.input),
        queueMs: Date.now() - pending.started,
      });
      pending = waiting.shift();
    }
    if (!pending) return;
    slot.pending = pending;
    pending.dispatchedAt = Date.now();
    slot.worker.postMessage(pending.input);
  }
}
for (let index = 0; index < concurrency; index++) {
  const slot = { ready: false, pending: null, restarting: false } as Slot;
  slot.worker = makeWorker(slot);
  slots.push(slot);
}
function authorized(request: IncomingMessage): boolean {
  const supplied = request.headers["x-worker-token"];
  return (
    typeof supplied === "string" &&
    supplied.length <= 256 &&
    timingSafeEqual(tokenHash, createHash("sha256").update(supplied).digest())
  );
}
async function receive(request: IncomingMessage, response: ServerResponse): Promise<void> {
  if (!authorized(request)) {
    // Usually a token mismatch between the API and the worker after a deploy.
    log("error", "compute.unauthorized", {
      method: request.method,
      path: request.url?.split("?", 1)[0]?.slice(0, 64),
      tokenPresent: typeof request.headers["x-worker-token"] === "string",
    });
    json(response, 401, { code: "UNAUTHORIZED" });
    return;
  }
  if (request.method === "GET" && request.url === "/health") {
    const readyWorkers = slots.filter(slot => slot.ready && !slot.restarting).length;
    json(response, !draining && readyWorkers > 0 ? 200 : 503, {
      engineVersion: ENGINE_VERSION,
      readyWorkers,
      pending: inFlight,
      draining,
    });
    return;
  }
  if (request.method !== "POST" || request.url !== "/compute") {
    log("warn", "compute.not_found", {
      method: request.method,
      path: request.url?.split("?", 1)[0]?.slice(0, 64),
    });
    json(response, 404, { code: "NOT_FOUND" });
    return;
  }
  if (draining || inFlight >= MAX_JOBS) {
    log("warn", "compute.busy", {
      reason: draining ? "draining" : "max-jobs",
      inFlight,
      waiting: waiting.length,
      readyWorkers: slots.filter(slot => slot.ready && !slot.restarting).length,
    });
    json(response, 503, { code: draining ? "COMPUTE_DRAINING" : "COMPUTE_BUSY" });
    return;
  }
  inFlight++;
  let queued = false;
  try {
    let length = 0;
    const chunks: Buffer[] = [];
    for await (const part of request) {
      const buffer = Buffer.isBuffer(part) ? part : Buffer.from(part as string);
      length += buffer.length;
      if (length > MAX_BODY_BYTES) {
        log("error", "compute.body_too_large", { bytes: length, max: MAX_BODY_BYTES });
        json(response, 413, { code: "BODY_TOO_LARGE" });
        request.destroy();
        return;
      }
      chunks.push(buffer);
    }
    const input = requestSchema.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    const pending: Pending = {
      input,
      response,
      timer: setTimeout(() => {
        const slot = slots.find(item => item.pending === pending);
        if (slot) {
          restart(slot, "execution-timeout");
          return;
        }
        const index = waiting.indexOf(pending);
        if (index >= 0) {
          waiting.splice(index, 1);
          inFlight--;
        }
        json(response, 504, {
          protocolVersion: 1,
          requestId: input.requestId,
          roomInstanceId: input.roomInstanceId,
          stateRevision: input.stateRevision,
          engineVersion: ENGINE_VERSION,
          ok: false,
          code: "COMPUTE_TIMEOUT",
          diagnostic: { reason: "queue-timeout", issues: [] },
        });
        log("error", "compute.timeout", {
          ...requestFields(input),
          reason: "queue-timeout",
          durationMs: Date.now() - pending.started,
          waiting: waiting.length,
          readyWorkers: slots.filter(slot => slot.ready && !slot.restarting).length,
        });
      }, JOB_TIMEOUT_MS),
      started: Date.now(),
    };
    queued = true;
    waiting.push(pending);
    dispatch();
  } catch (error) {
    log("warn", "compute.request_rejected", { diagnostic: computeFailureDiagnostic(error) });
    json(response, 422, { code: "INVALID_COMPUTE_REQUEST" });
  } finally {
    if (!queued) inFlight--;
  }
}
const server = createServer((request, response) => {
  void receive(request, response).catch((error: unknown) => {
    log("error", "compute.receive_failed", { diagnostic: computeFailureDiagnostic(error) });
    json(response, 500, { code: "COMPUTE_FAILED" });
  });
});
server.on("clientError", (error: NodeJS.ErrnoException, socket) => {
  // A peer resetting an idle pooled connection is routine; anything else is malformed HTTP.
  if (error.code !== "ECONNRESET")
    log("warn", "compute.client_error", { errorCode: error.code, name: error.name });
  if (error.code === "ECONNRESET" || !socket.writable) {
    socket.destroy();
    return;
  }
  socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
});
server.on("error", error => {
  log("error", "compute.server_error", { diagnostic: computeFailureDiagnostic(error) });
  process.exit(1);
});
server.requestTimeout = 10_000;
server.headersTimeout = 5_000;
server.timeout = 15_000;
server.maxConnections = 96;
server.listen(
  Number(process.env.BATTLE_WORKER_PORT ?? "3021"),
  process.env.BATTLE_WORKER_HOST ?? "127.0.0.1",
  () => {
    log("info", "compute.started", { workers: concurrency, engineVersion: ENGINE_VERSION });
  },
);
function stop(): void {
  if (draining) return;
  draining = true;
  for (const job of waiting.splice(0)) {
    clearTimeout(job.timer);
    inFlight--;
    json(job.response, 503, { code: "COMPUTE_DRAINING" });
  }
  server.close(() => {
    void Promise.all(slots.map(slot => slot.worker.terminate())).then(() => process.exit(0));
  });
  const timer = setTimeout(() => {
    server.closeAllConnections();
    void Promise.all(slots.map(slot => slot.worker.terminate())).then(() => process.exit(1));
  }, 10_000);
  timer.unref();
}
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
// Keep Node's crash-on-error behaviour, but leave a structured line instead of a bare stack dump.
process.on("uncaughtException", error => {
  log("error", "compute.uncaught_exception", { diagnostic: computeFailureDiagnostic(error) });
  process.exit(1);
});
process.on("unhandledRejection", reason => {
  log("error", "compute.unhandled_rejection", { diagnostic: computeFailureDiagnostic(reason) });
  process.exit(1);
});
