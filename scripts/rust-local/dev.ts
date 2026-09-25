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
const env = { ...process.env, ...config };
let child: ChildProcess | null = null;
let stopping = false;
const compose = ["compose", "--env-file", envPath, "-f", "compose.rust-local.yaml"];

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
      fail(new Error("Port 3300 is already in use; stop that frontend before dev:rust")),
    );
    server.listen(3300, "127.0.0.1", () => server.close(error => (error ? fail(error) : done())));
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
  // The existing migration/import commands are build-time schema tools, not a running NestJS server.
  await run("pnpm", ["--filter", "@poke-lounge/api", "build"]);
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
    DB_PORT: "35432",
    DB_USERNAME: "poke_rust_local",
    DB_PASSWORD: config.RUST_LOCAL_DB_PASSWORD,
    DB_DATABASE: "poke_rust_local",
    DB_SYNCHRONIZE: "false",
  };
  await run("pnpm", ["--filter", "@poke-lounge/api", "migration:run"], database);
  await run("pnpm", ["--filter", "@poke-lounge/api", "rom-data:import"], database);
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
  console.log("Rust local game: http://127.0.0.1:3300/ko-KR/game/poke-lounge");
  console.log("Only this local stack is used. Production deployment is unchanged.");
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
        "127.0.0.1",
        "--port",
        "3300",
      ],
      {
        NEXT_PUBLIC_API_URL: "http://127.0.0.1:3011",
        NEXT_PUBLIC_POKE_BACKEND: "rust",
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
