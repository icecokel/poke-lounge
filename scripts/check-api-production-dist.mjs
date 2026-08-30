import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const apiDistRoot = resolve(repositoryRoot, "apps/api/dist");
const forbiddenMarkers = [
  "start-poke-lounge-e2e-api",
  "poke-lounge-e2e-token-",
  "/__e2e/poke-lounge/assertions",
  "PokeLoungeE2eAuthGuard",
  "Poke Lounge E2E API requires",
];

if (!existsSync(apiDistRoot)) {
  throw new Error(`API production dist does not exist: ${apiDistRoot}`);
}

const violations = [];
for (const filePath of walkFiles(apiDistRoot)) {
  const relativePath = relative(apiDistRoot, filePath);
  const pathMarker = forbiddenMarkers.find(marker => relativePath.includes(marker));
  if (pathMarker) {
    violations.push(`${relativePath}: path contains ${pathMarker}`);
    continue;
  }

  const contents = readFileSync(filePath, "utf8");
  for (const marker of forbiddenMarkers) {
    if (contents.includes(marker)) {
      violations.push(`${relativePath}: contains ${marker}`);
    }
  }
}

if (violations.length > 0) {
  throw new Error(
    `API production dist contains Poke Lounge E2E bootstrap material:\n${violations.join("\n")}`,
  );
}

console.log("API production dist excludes the Poke Lounge E2E bootstrap and credentials");

function walkFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const entryPath = resolve(directory, entry.name);
    if (entry.isDirectory()) return walkFiles(entryPath);
    return statSync(entryPath).isFile() ? [entryPath] : [];
  });
}
