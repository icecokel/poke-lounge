import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = resolve(webRoot, "../..");
const testDatabaseUrl = process.env.TEST_DATABASE_URL?.trim();

if (!testDatabaseUrl) {
  throw new Error("TEST_DATABASE_URL is required for integrated web E2E");
}

const parsedDatabaseUrl = new URL(testDatabaseUrl);
const databaseName = decodeURIComponent(parsedDatabaseUrl.pathname.replace(/^\/+|\/+$/g, ""));

if (!databaseName.endsWith("_test")) {
  throw new Error("TEST_DATABASE_URL database name must end in _test");
}

const apiPort = String(46000 + (process.pid % 1000));
const webPort = String(47000 + (process.pid % 1000));
const apiUrl = `http://127.0.0.1:${apiPort}`;
const webUrl = `http://127.0.0.1:${webPort}`;
const requestedPlaywrightArgs = process.argv.slice(2);
const playwrightArgs =
  requestedPlaywrightArgs.length === 0
    ? ["test", "tests/e2e/poke-lounge-public-lobby.spec.ts", "--project=chromium"]
    : requestedPlaywrightArgs[0] === "test"
      ? requestedPlaywrightArgs
      : ["test", ...requestedPlaywrightArgs];
const apiEnv = {
  ...process.env,
  CORS_ORIGINS: webUrl,
  DB_DATABASE: databaseName,
  DB_HOST: parsedDatabaseUrl.hostname,
  DB_PASSWORD: decodeURIComponent(parsedDatabaseUrl.password),
  DB_PORT: parsedDatabaseUrl.port || "5432",
  DB_SYNCHRONIZE: "false",
  DB_USERNAME: decodeURIComponent(parsedDatabaseUrl.username),
  NEXT_PUBLIC_API_URL: apiUrl,
  NODE_ENV: "test",
  PLAYWRIGHT_PORT: webPort,
  PORT: apiPort,
  TEST_DATABASE_URL: testDatabaseUrl,
};

apiEnv.POKE_LOUNGE_E2E = "1";
apiEnv.POKE_LOUNGE_E2E_RESET_DB = "1";

const playwrightEnv = {
  ...process.env,
  NEXT_PUBLIC_API_URL: apiUrl,
  PLAYWRIGHT_PORT: webPort,
};

playwrightEnv.POKE_LOUNGE_E2E_ENV_ISOLATED = "1";

for (const name of Object.keys(playwrightEnv)) {
  if (isDatabaseEnvironmentName(name) || name === "REDIS_URL") {
    delete playwrightEnv[name];
  }
}

const runCommand = (command, args, options = {}) =>
  new Promise(function resolvePromise(resolvePromise, reject) {
    const child = spawn(command, args, {
      cwd: repositoryRoot,
      env: apiEnv,
      stdio: "inherit",
      ...options,
    });

    child.once("error", reject);
    child.once("exit", function handleEvent(code) {
      if (code === 0) {
        resolvePromise();
        return;
      }

      reject(new Error(`${command} ${args.join(" ")} exited with code ${code ?? 1}`));
    });
  });

const waitForApi = async () => {
  const startedAt = Date.now();

  while (Date.now() - startedAt < 120_000) {
    try {
      const response = await fetch(`${apiUrl}/health`);
      if (response.ok) return;
    } catch {}

    await new Promise(function resolvePromise(resolvePromise) {
      return setTimeout(resolvePromise, 500);
    });
  }

  throw new Error(`Timed out waiting for integrated API at ${apiUrl}`);
};

const stopProcessGroup = child => {
  if (!child || child.exitCode !== null) return;

  if (process.platform === "win32") {
    child.kill("SIGTERM");
    return;
  }

  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    child.kill("SIGTERM");
  }
};

let apiProcess;
let turnWorkerProcess;

try {
  const apiArgs = [
    "--filter",
    "@poke-lounge/api",
    "exec",
    "ts-node",
    "-r",
    "tsconfig-paths/register",
    "scripts/start-poke-lounge-e2e-api.ts",
  ];
  apiProcess = spawn(pnpmCommand, apiArgs, {
    cwd: repositoryRoot,
    detached: process.platform !== "win32",
    env: apiEnv,
    stdio: "inherit",
  });

  await waitForApi();
  turnWorkerProcess = spawn(
    pnpmCommand,
    [
      "--filter",
      "@poke-lounge/api",
      "exec",
      "ts-node",
      "-r",
      "tsconfig-paths/register",
      "src/poke-lounge-turn-worker.ts",
    ],
    {
      cwd: repositoryRoot,
      detached: process.platform !== "win32",
      env: apiEnv,
      stdio: "inherit",
    },
  );
  await runCommand(process.execPath, ["scripts/playwright-runner.mjs", ...playwrightArgs], {
    cwd: webRoot,
    env: playwrightEnv,
  });
} finally {
  stopProcessGroup(turnWorkerProcess);
  stopProcessGroup(apiProcess);
}

function isDatabaseEnvironmentName(name) {
  return (
    name === "TEST_DATABASE_URL" ||
    name === "DATABASE_URL" ||
    name === "DB_URL" ||
    name === "PGDATABASE" ||
    name === "PGHOST" ||
    name === "PGPASSWORD" ||
    name === "PGPORT" ||
    name === "PGUSER" ||
    name.startsWith("DB_")
  );
}
