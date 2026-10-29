import { readFileSync, readdirSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const source = resolve(root, "apps/web/src");
const leaguePrefix = "features/league/";
const entryLink = `${leaguePrefix}entry-link/league-entry-link.tsx`;
const trainer = "components/poke-lounge/runtime/game/ui/trainer-name-entry.tsx";
const errors = [];
function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? files(path) : /\.[cm]?[jt]sx?$/.test(entry.name) ? [path] : [];
  });
}
function imports(text) {
  return [
    ...text.matchAll(/\b(?:from\s*|import\s*(?:\(\s*)?|require\s*\(\s*)["']([^"']+)["']/g),
  ].map(match => match[1]);
}
for (const path of files(source)) {
  const name = relative(source, path).replaceAll("\\", "/");
  const text = readFileSync(path, "utf8");
  const targets = imports(text);
  for (const target of targets) {
    const resolved = target.startsWith("@/")
      ? resolve(source, target.slice(2))
      : target.startsWith(".")
        ? resolve(dirname(path), target)
        : null;
    if (!resolved) continue;
    const imported = relative(source, resolved).replaceAll("\\", "/");
    if (imported !== "features/league" && !imported.startsWith(leaguePrefix)) continue;
    if (name.startsWith(leaguePrefix) || name.startsWith("app/[locale]/league/")) continue;
    if (
      name === trainer &&
      /^features\/league\/entry-link\/league-entry-link(?:\.[jt]sx?)?$/.test(imported)
    )
      continue;
    errors.push(`${name}: league import is outside the allowed boundary (${target})`);
  }
  if (name === entryLink) {
    for (const target of targets) {
      if (target !== "react" && target !== "@/lib/constants")
        errors.push(`${name}: entry link may only import React and getApiBaseUrl (${target})`);
    }
  }
  if (!name.startsWith(leaguePrefix)) continue;
  if (/["'`]poke-lounge:/.test(text))
    errors.push(`${name}: multiplayer storage keys are forbidden`);
  if (/\b(?:getDefaultGameStateStore|createLocalPreviewRoom)\b/.test(text))
    errors.push(`${name}: multiplayer default stores and preview rooms are forbidden`);
}
if (errors.length) throw new Error(`League web boundary violations:\n${errors.join("\n")}`);
console.log(
  "League web boundary: allowed imports, isolated storage, and explicit stores verified.",
);
