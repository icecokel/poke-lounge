import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import {
  existsSync,
  mkdirSync,
  openSync,
  closeSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as wait } from "node:timers/promises";

const webRoot = fileURLToPath(new URL("..", import.meta.url));
const repository = path.resolve(webRoot, "../..");
const id = `${Date.now()}-${process.pid}`;
const distName = `.next-mobile-production-${id}`;
const configName = `${distName}.json`;
const distPath = path.resolve(webRoot, distName);
const configPath = path.resolve(webRoot, configName);
const out = path.resolve(
  process.env.PLAYWRIGHT_OUTPUT_DIR ?? path.join(repository, "output", `mobile-production-${id}`),
);
const nextEnvPath = path.join(webRoot, "next-env.d.ts");
const nextEnv = readFileSync(nextEnvPath);
const tsconfigPath = path.join(webRoot, "tsconfig.json");
const originalTsconfig = readFileSync(tsconfigPath);
const environment = {
  ...process.env,
  NEXT_DIST_DIR: distName,
  NEXT_TYPESCRIPT_CONFIG_PATH: configName,
  NEXT_PUBLIC_API_URL: "http://127.0.0.1:65535",
  NEXT_TELEMETRY_DISABLED: "1",
  LOCAL_TEST_AUTH_TOKEN: "",
};
let server: ChildProcess | undefined;
let serverLog: number | undefined;
let command: ChildProcess | undefined;
let interrupted = false;

async function execute(
  args: string[],
  log: string,
  env: NodeJS.ProcessEnv = environment,
): Promise<void> {
  const fd = openSync(path.join(out, log), "w");
  try {
    command = spawn("pnpm", args, { cwd: repository, env, stdio: ["ignore", fd, fd] });
    const [code] = await once(command, "exit");
    if (code !== 0 || interrupted)
      throw new Error(`pnpm ${args.join(" ")} failed; see ${path.join(out, log)}`);
  } finally {
    closeSync(fd);
    command = undefined;
  }
}
async function availablePort(): Promise<number> {
  const listener = createServer();
  listener.listen(0, "127.0.0.1");
  await once(listener, "listening");
  const address = listener.address();
  if (!address || typeof address === "string") throw new Error("Cannot allocate test port");
  await new Promise<void>((done, reject) =>
    listener.close(error => (error ? reject(error) : done())),
  );
  return address.port;
}
async function stop(child: ChildProcess | undefined): Promise<void> {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, "exit");
  child.kill("SIGTERM");
  await Promise.race([exited, wait(5000)]);
  if (child.exitCode === null && child.signalCode === null) {
    child.kill("SIGKILL");
    await exited;
  }
}
async function main(): Promise<void> {
  mkdirSync(out, { recursive: true });
  if (existsSync(distPath) || existsSync(configPath)) throw new Error("Test artifact collision");
  const config = JSON.parse(originalTsconfig.toString());
  config.compilerOptions.tsBuildInfoFile = `${distName}/tsconfig.tsbuildinfo`;
  writeFileSync(configPath, JSON.stringify(config, null, 2));
  const interrupt = () => {
    interrupted = true;
    command?.kill("SIGTERM");
    server?.kill("SIGTERM");
  };
  process.on("SIGINT", interrupt);
  process.on("SIGTERM", interrupt);
  try {
    console.log(
      "Building minified production client; this does not deploy or connect to a live API.",
    );
    await execute(["build:poke-lounge-battle"], "battle-build.log");
    await execute(["--filter", "@poke-lounge/web", "build"], "web-build.log");
    const port = await availablePort();
    const baseURL = `http://127.0.0.1:${port}`;
    serverLog = openSync(path.join(out, "server.log"), "w");
    server = spawn(
      process.execPath,
      [
        path.join(webRoot, "node_modules/next/dist/bin/next"),
        "start",
        "--hostname",
        "127.0.0.1",
        "--port",
        String(port),
      ],
      {
        cwd: webRoot,
        env: { ...environment, NODE_ENV: "production" },
        stdio: ["ignore", serverLog, serverLog],
      },
    );
    let ready = false;
    for (let attempt = 0; attempt < 100 && !interrupted; attempt++) {
      if (server.exitCode !== null) throw new Error("Production server stopped before readiness");
      try {
        const response = await fetch(`${baseURL}/ko-KR/game`, {
          signal: AbortSignal.timeout(2000),
        });
        await response.arrayBuffer();
        if (response.ok) {
          ready = true;
          break;
        }
      } catch {
        /* Only poll the temporary server owned by this command. */
      }
      await wait(200);
    }
    if (!ready) throw new Error("Production server did not become ready");
    console.log(
      "Running touch fixtures through Chromium and WebKit against the production bundle.",
    );
    await execute(
      [
        "--filter",
        "@poke-lounge/web",
        "e2e",
        "tests/e2e/poke-lounge-touch-compatibility.spec.ts",
        "--project=chromium",
        ...process.argv.slice(2),
      ],
      "touch-tests.log",
      {
        ...environment,
        PLAYWRIGHT_BASE_URL: baseURL,
        PLAYWRIGHT_OUTPUT_DIR: out,
        PLAYWRIGHT_RETRIES: "0",
      },
    );
    console.log(`Production mobile tests passed. Logs: ${out}`);
  } finally {
    await stop(command);
    await stop(server);
    if (serverLog !== undefined) closeSync(serverLog);
    process.removeListener("SIGINT", interrupt);
    process.removeListener("SIGTERM", interrupt);
    // Keep shared source configuration intact; only remove paths allocated by this runner.
    writeFileSync(nextEnvPath, nextEnv);
    if (!readFileSync(tsconfigPath).equals(originalTsconfig))
      throw new Error("Base tsconfig changed unexpectedly");
    rmSync(configPath, { force: true });
    rmSync(distPath, { recursive: true, force: true });
  }
}
main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
