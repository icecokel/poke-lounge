import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createServer } from "node:net";

const root = resolve(__dirname, "../..");
const out = resolve(root, "output/rust-local");
const envPath = resolve(out, "local.env");
mkdirSync(out, { recursive: true });
if (!existsSync(envPath)) {
  writeFileSync(
    envPath,
    `RUST_LOCAL_DB_PASSWORD=${randomBytes(24).toString("hex")}\nBATTLE_WORKER_TOKEN=${randomBytes(32).toString("hex")}\n`,
    { mode: 0o600, flag: "wx" },
  );
}
const config: Record<string, string> = {};
for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
  if (!line.trim() || line.startsWith("#")) continue;
  const match = /^(RUST_LOCAL_DB_PASSWORD|BATTLE_WORKER_TOKEN)=([a-f0-9]{32,128})$/.exec(line);
  if (!match) throw new Error("Invalid private local.env; expected generated hexadecimal values");
  config[match[1]!] = match[2]!;
}
if (!config.RUST_LOCAL_DB_PASSWORD || !config.BATTLE_WORKER_TOKEN)
  throw new Error("Incomplete local secrets");
// Optional overrides so two checkouts can run their own stacks side by side.
function readPort(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error(`${name} must be a port between 1024 and 65535`);
  return port;
}
// localhost puts the API on the page's site so the Discord login session cookie is sent.
// Local test mode only accepts a 127.0.0.1 API, so it is unavailable with localhost.
const apiHost = process.env.RUST_LOCAL_API_HOST || "127.0.0.1";
if (apiHost !== "localhost" && apiHost !== "127.0.0.1")
  throw new Error("RUST_LOCAL_API_HOST must be localhost or 127.0.0.1");
const project = process.env.RUST_LOCAL_PROJECT || "poke-lounge-rust-local";
if (!/^[a-z0-9][a-z0-9_-]*$/.test(project))
  throw new Error("RUST_LOCAL_PROJECT must be a lowercase docker compose project name");
const ports = {
  web: readPort("RUST_LOCAL_WEB_PORT", 3300),
  api: readPort("RUST_LOCAL_API_PORT", 3011),
  db: readPort("RUST_LOCAL_DB_PORT", 35432),
  redis: readPort("RUST_LOCAL_REDIS_PORT", 36379),
};
const env = {
  ...process.env,
  ...config,
  RUST_LOCAL_WEB_PORT: String(ports.web),
  RUST_LOCAL_API_PORT: String(ports.api),
  RUST_LOCAL_DB_PORT: String(ports.db),
  RUST_LOCAL_REDIS_PORT: String(ports.redis),
};
let child: ChildProcess | null = null;
let stopping = false;
const compose = ["compose", "-p", project, "--env-file", envPath, "-f", "compose.rust-local.yaml"];

async function run(command: string, args: string[], extra: NodeJS.ProcessEnv = {}): Promise<void> {
  if (stopping) throw new Error("Stopped");
  await new Promise<void>((done, fail) => {
    const spawned = spawn(command, args, {
      cwd: root,
      env: { ...env, ...extra },
      stdio: "inherit",
      detached: process.platform !== "win32",
    });
    child = spawned;
    spawned.once("error", fail);
    spawned.once("exit", (code, signal) => {
      if (child === spawned) child = null;
      if (code === 0 || stopping) done();
      else fail(new Error(`${command} failed (${code ?? signal})`));
    });
  });
}
async function requireFreeWebPort(): Promise<void> {
  await new Promise<void>((done, fail) => {
    const server = createServer();
    server.once("error", () =>
      fail(
        new Error(
          `Port ${ports.web} is already in use; stop that frontend or set RUST_LOCAL_WEB_PORT`,
        ),
      ),
    );
    server.listen(ports.web, "127.0.0.1", () =>
      server.close(error => (error ? fail(error) : done())),
    );
  });
}
function stop(): void {
  stopping = true;
  const pid = child?.pid;
  if (!pid) return;
  try {
    if (process.platform === "win32") child?.kill("SIGTERM");
    else process.kill(-pid, "SIGTERM");
  } catch {
    /* The child may have exited between signal delivery and cleanup. */
  }
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

async function main(): Promise<void> {
  if (process.argv.includes("--stop")) {
    await run("docker", [...compose, "stop", "api-rust", "battle-worker", "postgres", "redis"]);
    return;
  }
  await requireFreeWebPort();
  await run("pnpm", ["build:poke-lounge-battle"]);
  await run("pnpm", ["--filter", "@poke-lounge/battle-worker", "build"]);
  // The db package is a build-time schema/ROM import tool, not a running server.
  await run("pnpm", ["--filter", "@poke-lounge/db", "build"]);
  await run("docker", [
    "run",
    "--rm",
    "-v",
    `${root}:/workspace`,
    "-w",
    "/workspace",
    "-e",
    "CARGO_HOME=/workspace/output/rust-local/cargo",
    "-e",
    "CARGO_BUILD_JOBS=4",
    "rust:1.98.1-bookworm",
    "cargo",
    "build",
    "--workspace",
    "--release",
    "--locked",
  ]);
  await run("docker", [...compose, "up", "-d", "--wait", "postgres", "redis"]);
  const database = {
    DB_HOST: "127.0.0.1",
    DB_PORT: String(ports.db),
    DB_USERNAME: "poke_rust_local",
    DB_PASSWORD: config.RUST_LOCAL_DB_PASSWORD,
    DB_DATABASE: "poke_rust_local",
    DB_SYNCHRONIZE: "false",
  };
  await run("pnpm", ["--filter", "@poke-lounge/db", "migration:run"], database);
  await run("pnpm", ["--filter", "@poke-lounge/db", "rom-data:import"], database);
  // Recreate only the two owned game services so rebuilt bind-mounted binaries are loaded.
  await run("docker", [
    ...compose,
    "up",
    "-d",
    "--wait",
    "--force-recreate",
    "api-rust",
    "battle-worker",
  ]);
  console.log(`Rust local game: http://localhost:${ports.web}/ko-KR (compose project ${project})`);
  console.log("Local Rust development uses isolated containers and does not touch production.");
  const nextEnvPath = resolve(root, "apps/web/next-env.d.ts");
  const originalNextEnv = readFileSync(nextEnvPath, "utf8");
  try {
    await run(
      "pnpm",
      [
        "--filter",
        "@poke-lounge/web",
        "exec",
        "next",
        "dev",
        "--hostname",
        "localhost",
        "--port",
        String(ports.web),
      ],
      {
        NEXT_PUBLIC_API_URL: `http://${apiHost}:${ports.api}`,
        LOCAL_TEST_AUTH_TOKEN: randomBytes(32).toString("hex"),
        NEXT_DIST_DIR: ".next-rust-local",
        NEXT_TYPESCRIPT_CONFIG_PATH: "tsconfig.rust-local.json",
        NEXT_TELEMETRY_DISABLED: "1",
      },
    );
  } finally {
    // Restore only Next-generated route-reference changes, not concurrent user edits.
    const current = readFileSync(nextEnvPath, "utf8");
    const withoutRoute = (text: string) =>
      text
        .split(/\r?\n/)
        .filter(
          line =>
            !(
              line.startsWith('/// <reference path="./.next') &&
              line.endsWith('/types/routes.d.ts" />')
            ),
        )
        .join("\n");
    if (withoutRoute(current) === withoutRoute(originalNextEnv))
      writeFileSync(nextEnvPath, originalNextEnv);
    else console.warn("next-env.d.ts contains external edits; preserved without overwriting.");
  }
  console.log(
    "Frontend stopped. Local containers/data remain; use pnpm dev:rust:stop to stop them without deleting volumes.",
  );
}
void main().catch(error => {
  console.error(error instanceof Error ? error.message : "Rust local startup failed");
  process.exitCode = stopping ? 0 : 1;
});
