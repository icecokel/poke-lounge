import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { availableParallelism } from "node:os";
import { createHash, timingSafeEqual } from "node:crypto";
import { Worker } from "node:worker_threads";
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
type Pending = {
  input: ComputeRequest;
  response: ServerResponse;
  timer: ReturnType<typeof setTimeout>;
  started: number;
};
type Slot = { worker: Worker; ready: boolean; pending: Pending | null; restarting: boolean };
const slots: Slot[] = [];
const waiting: Pending[] = [];

function json(response: ServerResponse, status: number, body: unknown): void {
  if (response.destroyed || response.writableEnded) return;
  const encoded = JSON.stringify(body);
  if (Buffer.byteLength(encoded) > MAX_RESPONSE_BYTES) {
    response.writeHead(500, { "content-type": "application/json" });
    response.end('{"code":"COMPUTE_RESPONSE_TOO_LARGE"}');
    return;
  }
  response.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  response.end(encoded);
}
function finish(slot: Slot, status: number, result: unknown): void {
  const pending = slot.pending;
  if (!pending) return;
  clearTimeout(pending.timer);
  slot.pending = null;
  inFlight--;
  if (status >= 400 || Date.now() - pending.started >= 2_000) {
    process.stderr.write(
      JSON.stringify({
        event: status >= 400 ? "compute.failed" : "compute.slow",
        requestId: pending.input.requestId,
        roomInstanceId: pending.input.roomInstanceId,
        revision: pending.input.stateRevision,
        operation: pending.input.operation.kind,
        status,
        durationMs: Date.now() - pending.started,
      }) + "\n",
    );
  }
  json(pending.response, status, result);
  dispatch();
}
function restart(slot: Slot): void {
  if (slot.restarting || draining) return;
  slot.restarting = true;
  slot.ready = false;
  finish(slot, 503, { code: "COMPUTE_WORKER_UNAVAILABLE" });
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
          restart(slot);
          return;
        }
        slot.ready = true;
        process.stdout.write(
          JSON.stringify({
            event: "compute.worker_ready",
            readyWorkers: slots.filter(item => item.ready && !item.restarting).length,
            engineVersion: ENGINE_VERSION,
          }) + "\n",
        );
        dispatch();
        return;
      }
      if (!slot.pending) return;
      if (!("requestId" in message) || message.requestId !== slot.pending.input.requestId) {
        restart(slot);
        return;
      }
      finish(slot, message.ok ? 200 : message.code === "INVALID_INPUT" ? 422 : 500, message);
    },
  );
  worker.on("error", () => {
    process.stderr.write('{"event":"compute.worker_error"}\n');
    restart(slot);
  });
  worker.on("exit", code => {
    if (code !== 0 && !draining) restart(slot);
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
      pending = waiting.shift();
    }
    if (!pending) return;
    slot.pending = pending;
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
    json(response, 404, { code: "NOT_FOUND" });
    return;
  }
  if (draining || inFlight >= MAX_JOBS) {
    json(response, 503, { code: "COMPUTE_BUSY" });
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
          restart(slot);
          return;
        }
        const index = waiting.indexOf(pending);
        if (index >= 0) {
          waiting.splice(index, 1);
          inFlight--;
        }
        json(response, 504, { code: "COMPUTE_TIMEOUT" });
        process.stderr.write(
          JSON.stringify({
            event: "compute.timeout",
            requestId: input.requestId,
            roomInstanceId: input.roomInstanceId,
            revision: input.stateRevision,
            operation: input.operation.kind,
          }) + "\n",
        );
      }, JOB_TIMEOUT_MS),
      started: Date.now(),
    };
    queued = true;
    waiting.push(pending);
    dispatch();
  } catch {
    json(response, 422, { code: "INVALID_COMPUTE_REQUEST" });
  } finally {
    if (!queued) inFlight--;
  }
}
const server = createServer((request, response) => {
  void receive(request, response);
});
server.requestTimeout = 10_000;
server.headersTimeout = 5_000;
server.timeout = 15_000;
server.maxConnections = 96;
server.listen(
  Number(process.env.BATTLE_WORKER_PORT ?? "3021"),
  process.env.BATTLE_WORKER_HOST ?? "127.0.0.1",
  () => {
    process.stdout.write(
      JSON.stringify({
        event: "compute.started",
        release: process.env.RELEASE_SHA ?? "local",
        workers: concurrency,
        engineVersion: ENGINE_VERSION,
      }) + "\n",
    );
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
