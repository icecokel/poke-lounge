import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const root = resolve(scriptDir, "../..");
const checksDir = resolve(scriptDir, "checks");
const checks = readdirSync(checksDir, { withFileTypes: true })
  .filter(entry => entry.isFile() && entry.name.endsWith(".mjs"))
  .map(entry => entry.name)
  .sort();

for (const check of checks) {
  execFileSync(process.execPath, [resolve(checksDir, check)], { cwd: root, stdio: "inherit" });
}
