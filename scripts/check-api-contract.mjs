import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const apiContractPath = join(root, "apps/api/openapi.json");
const webTypesPath = join(root, "apps/web/src/types/api.d.ts");
const temporaryDirectory = await mkdtemp(join(tmpdir(), "poke-lounge-api-contract-"));
const generatedApiContractPath = join(temporaryDirectory, "openapi.json");
const generatedWebTypesPath = join(temporaryDirectory, "api.d.ts");

try {
  run("pnpm", ["build:poke-lounge-battle"]);
  run("pnpm", [
    "--filter",
    "@poke-lounge/api",
    "openapi:generate",
    "--output",
    generatedApiContractPath,
  ]);
  formatAs(generatedApiContractPath, apiContractPath);
  run("pnpm", [
    "--filter",
    "@poke-lounge/web",
    "exec",
    "openapi-typescript",
    generatedApiContractPath,
    "-o",
    generatedWebTypesPath,
  ]);
  formatAs(generatedWebTypesPath, webTypesPath);
  await assertSame(apiContractPath, generatedApiContractPath);
  await assertSame(webTypesPath, generatedWebTypesPath);
} finally {
  await rm(temporaryDirectory, { recursive: true });
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function formatAs(generatedPath, repositoryPath) {
  const result = spawnSync("pnpm", ["exec", "prettier", "--stdin-filepath", repositoryPath], {
    cwd: root,
    input: readFileSync(generatedPath),
    encoding: "buffer",
  });

  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    process.exit(result.status ?? 1);
  }

  writeFileSync(generatedPath, result.stdout);
}

async function assertSame(committedPath, generatedPath) {
  const [committed, generated] = await Promise.all([
    readFile(committedPath),
    readFile(generatedPath),
  ]);

  if (!committed.equals(generated)) {
    console.error(`${committedPath} is stale. Run \`pnpm generate:types\` and commit the result.`);
    process.exitCode = 1;
  }
}
