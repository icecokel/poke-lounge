import { createRequire } from "node:module";
import { readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const apiRoot = path.join(repoRoot, "apps/api");
const webRoot = path.join(repoRoot, "apps/web");
const packageRoot = path.join(repoRoot, "packages/poke-lounge-battle");
const packageModule = "@poke-lounge/battle/tournament-bracket";
const mode = process.argv[2];
const apiRequire = createRequire(path.join(apiRoot, "package.json"));

if (mode === "types") {
  rmSync(path.join(packageRoot, "dist"), { recursive: true, force: true });

  const expected = path.join(packageRoot, "src/tournament-bracket.ts");
  for (const appRoot of [apiRoot, webRoot]) {
    const appRequire = createRequire(path.join(appRoot, "package.json"));
    const ts = appRequire("typescript");
    const configPath = path.join(appRoot, "tsconfig.json");
    const config = ts.parseJsonConfigFileContent(
      ts.parseConfigFileTextToJson(configPath, readFileSync(configPath, "utf8")).config,
      ts.sys,
      appRoot,
    );
    const resolution = ts.resolveModuleName(
      packageModule,
      path.join(appRoot, "src/main.ts"),
      config.options,
      ts.sys,
    ).resolvedModule;

    if (!resolution || path.resolve(resolution.resolvedFileName) !== expected) {
      throw new Error(
        `Expected TypeScript in ${appRoot} to resolve ${packageModule} to ${expected}, received ${resolution?.resolvedFileName ?? "unresolved"}`,
      );
    }
  }

  const packageManifest = JSON.parse(readFileSync(path.join(packageRoot, "package.json"), "utf8"));
  if (packageManifest.exports?.["./*"]?.types !== "./src/*.ts") {
    throw new Error(`Expected ${packageModule} to expose direct TypeScript subpaths`);
  }
  for (const sourceFile of ["src/tournament-bracket.ts", "src/tournament-scoring.ts"]) {
    const source = readFileSync(path.join(packageRoot, sourceFile), "utf8");
    if (/from\s+["']node:/.test(source)) {
      throw new Error(`Browser entry dependency ${sourceFile} imports a Node builtin`);
    }
  }
} else if (mode === "runtime") {
  const expected = path.join(packageRoot, "dist/tournament-bracket.js");
  const resolved = apiRequire.resolve(packageModule);

  if (path.resolve(resolved) !== expected) {
    throw new Error(
      `Expected API Node.js to resolve ${packageModule} to ${expected}, received ${resolved}`,
    );
  }

  apiRequire(packageModule);
} else {
  throw new Error('Expected mode to be either "types" or "runtime"');
}
