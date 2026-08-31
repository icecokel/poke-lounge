import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const host = process.env.HOSTNAME ?? "127.0.0.1";
const port = process.env.PLAYWRIGHT_PORT ?? String(39000 + (process.pid % 10000));
const nextDistDir = process.env.NEXT_DIST_DIR ?? `.next-e2e-${process.pid}`;
const nextTsconfigPath =
  process.env.NEXT_TYPESCRIPT_CONFIG_PATH ?? `.next-e2e-tsconfig-${process.pid}.json`;

const rootTsconfigPath = path.resolve("tsconfig.json");
const resolvedNextTsconfigPath = path.resolve(nextTsconfigPath);
const resolvedNextDistDir = path.resolve(nextDistDir);
const nextEnvPath = path.resolve("next-env.d.ts");
// E2E Next 서버가 일반 웹 typecheck의 증분 캐시를 덮어쓰지 않도록 분리한다.
const e2eTsBuildInfoPath = path.join(resolvedNextDistDir, "tsconfig.tsbuildinfo");
const e2eNextEnvRouteReferencePattern =
  /^\/\/\/ <reference path="\.\/\.next-e2e[^"\n]*\/types\/routes\.d\.ts" \/>\r?\n/gm;
const localTestAuthToken =
  process.env.PLAYWRIGHT_ENABLE_LOCAL_TEST_MODE === "1"
    ? "playwright_local_test_auth_token_0123456789abcdef"
    : "";
const rawTsconfig = JSON.parse(readFileSync(rootTsconfigPath, "utf8"));
const sanitizedTsconfig = {
  ...rawTsconfig,
  compilerOptions: {
    ...rawTsconfig.compilerOptions,
    tsBuildInfoFile: e2eTsBuildInfoPath,
  },
  include: Array.isArray(rawTsconfig.include)
    ? rawTsconfig.include.filter(
        entry => typeof entry !== "string" || !entry.startsWith(".next-e2e"),
      )
    : rawTsconfig.include,
  exclude: Array.isArray(rawTsconfig.exclude)
    ? rawTsconfig.exclude.filter(
        entry => typeof entry !== "string" || !entry.startsWith(".next-e2e"),
      )
    : rawTsconfig.exclude,
};

const removeE2eNextEnvRouteReferences = () => {
  if (!existsSync(nextEnvPath)) return;

  const nextEnv = readFileSync(nextEnvPath, "utf8");
  const sanitizedNextEnv = nextEnv.replace(e2eNextEnvRouteReferencePattern, "");

  if (nextEnv !== sanitizedNextEnv) {
    writeFileSync(nextEnvPath, sanitizedNextEnv);
  }
};

removeE2eNextEnvRouteReferences();
mkdirSync(path.dirname(resolvedNextTsconfigPath), { recursive: true });
writeFileSync(resolvedNextTsconfigPath, `${JSON.stringify(sanitizedTsconfig, null, 2)}\n`);

const serverEnv = {
  ...process.env,
  HOSTNAME: host,
  LOCAL_TEST_AUTH_TOKEN: localTestAuthToken,
  NEXT_DIST_DIR: nextDistDir,
  NEXT_TYPESCRIPT_CONFIG_PATH: nextTsconfigPath,
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:65535",
  PLAYWRIGHT_PORT: port,
  PORT: port,
};

const server = spawn(pnpmCommand, ["exec", "next", "dev", "--hostname", host, "--port", port], {
  detached: process.platform !== "win32",
  stdio: ["ignore", "pipe", "pipe"],
  env: serverEnv,
});

server.stdout.on("data", chunk => {
  process.stdout.write(chunk);
});

server.stderr.on("data", chunk => {
  process.stderr.write(chunk);
});

const shutdown = () => {
  if (server.killed) {
    return;
  }

  if (process.platform === "win32") {
    server.kill("SIGTERM");
    return;
  }

  try {
    process.kill(-server.pid, "SIGTERM");
  } catch {
    server.kill("SIGTERM");
  }
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

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

server.on("exit", code => {
  removeE2eNextEnvRouteReferences();
  removeArtifact(resolvedNextDistDir, true);
  removeArtifact(resolvedNextTsconfigPath, false);
  process.exit(code ?? 0);
});
