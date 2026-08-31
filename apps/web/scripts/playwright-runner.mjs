import { spawn } from "node:child_process";
import { rmSync } from "node:fs";

const nodeCommand = process.execPath;
const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const host = process.env.HOSTNAME ?? "127.0.0.1";
const defaultPort = String(39000 + (process.pid % 10000));
const defaultNextDistDir = `.next-e2e-${process.pid}`;
const defaultNextTsconfigPath = `.next-e2e-tsconfig-${process.pid}.json`;
const useExternalServer = Boolean(process.env.PLAYWRIGHT_BASE_URL);
const port = process.env.PLAYWRIGHT_PORT ?? defaultPort;
const nextDistDir = process.env.NEXT_DIST_DIR ?? defaultNextDistDir;
const nextTsconfigPath = process.env.NEXT_TYPESCRIPT_CONFIG_PATH ?? defaultNextTsconfigPath;
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://${host}:${port}`;
const readyUrl = `${baseURL}/ko-KR`;
const reuseExistingServer = process.env.PLAYWRIGHT_REUSE_EXISTING_SERVER === "1";
const enableLocalTestMode = process.argv.includes("--local-test-mode");
const localTestAuthToken = enableLocalTestMode
  ? "playwright_local_test_auth_token_0123456789abcdef"
  : "";

const serverEnv = {
  ...process.env,
  HOSTNAME: host,
  LOCAL_TEST_AUTH_TOKEN: localTestAuthToken,
  NEXT_DIST_DIR: nextDistDir,
  NEXT_TYPESCRIPT_CONFIG_PATH: nextTsconfigPath,
  NEXT_PUBLIC_API_URL: enableLocalTestMode
    ? "http://127.0.0.1:65535"
    : (process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:65535"),
  NEXT_PUBLIC_GA_MEASUREMENT_ID: process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ?? "G-E2ETEST",
  NEXT_PUBLIC_GTM_ID: process.env.NEXT_PUBLIC_GTM_ID ?? "GTM-E2ETEST",
  PLAYWRIGHT_BASE_URL: baseURL,
  PLAYWRIGHT_ENABLE_LOCAL_TEST_MODE: enableLocalTestMode ? "1" : "",
  PLAYWRIGHT_PORT: port,
  PORT: port,
};

const playwrightArgs = process.argv.slice(2).filter(function filterItem(argument) {
  return argument !== "--local-test-mode";
});
if (playwrightArgs.length === 0) {
  playwrightArgs.push("test");
}
if (playwrightArgs[0] === "codegen" && playwrightArgs.length === 1) {
  playwrightArgs.push(baseURL);
}

let finalizing = false;
let server;
let playwright;

const cleanupArtifacts = () => {
  if (useExternalServer) return;

  removeArtifact(nextDistDir, true);
  removeArtifact(nextTsconfigPath, false);
};

const removeArtifact = (artifactPath, recursive) => {
  try {
    rmSync(artifactPath, {
      force: true,
      maxRetries: 5,
      recursive,
      retryDelay: 100,
    });
  } catch (error) {
    console.warn(`Failed to remove Playwright artifact ${artifactPath}:`, error);
  }
};

const finish = code => {
  if (finalizing) return;
  finalizing = true;

  if (playwright?.exitCode === null && !playwright.killed) {
    playwright.kill("SIGTERM");
  }

  const exit = () => {
    cleanupArtifacts();
    process.exit(code);
  };

  if (server?.exitCode === null && !server.killed) {
    const forceExitTimer = setTimeout(exit, 5_000);
    forceExitTimer.unref();
    server.once("exit", function handleEvent() {
      clearTimeout(forceExitTimer);
      exit();
    });
    server.kill("SIGTERM");
    return;
  }

  exit();
};

const isServerReady = async () => {
  try {
    const response = await fetch(readyUrl, { redirect: "manual" });
    return response.status >= 200 && response.status < 400;
  } catch {
    return false;
  }
};

const waitForServer = async timeoutMs => {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (await isServerReady()) {
      return;
    }

    await new Promise(function resolvePromise(resolve) {
      return setTimeout(resolve, 500);
    });
  }

  throw new Error(`Timed out waiting for Playwright server at ${readyUrl}`);
};

const run = async () => {
  process.on("SIGINT", function handleEvent() {
    return finish(130);
  });
  process.on("SIGTERM", function handleEvent() {
    return finish(143);
  });

  if (useExternalServer) {
    await waitForServer(120_000);
  } else if (!(reuseExistingServer && (await isServerReady()))) {
    server = spawn(nodeCommand, ["scripts/playwright-web-server.mjs"], {
      env: serverEnv,
      stdio: ["ignore", "inherit", "inherit"],
    });

    server.on("exit", function handleEvent(code) {
      if (!finalizing && code !== 0) {
        finish(code ?? 1);
      }
    });

    await waitForServer(120_000);
  }

  playwright = spawn(pnpmCommand, ["exec", "playwright", ...playwrightArgs], {
    env: serverEnv,
    stdio: "inherit",
  });

  playwright.on("exit", function handleEvent(code) {
    finish(code ?? 1);
  });
};

run().catch(function handleRejected(error) {
  console.error(error);
  finish(1);
});
