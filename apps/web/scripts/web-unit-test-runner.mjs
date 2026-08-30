import { spawn } from "node:child_process";
import { readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const webRoot = fileURLToPath(new URL("..", import.meta.url));
const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

const collectTestFiles = async (directory, isTestFile) => {
  const entries = await readdir(path.join(webRoot, directory), { withFileTypes: true });
  const files = [];

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const relativePath = path.posix.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await collectTestFiles(relativePath, isTestFile)));
    } else if (entry.isFile() && isTestFile(entry.name)) {
      files.push(relativePath);
    }
  }

  return files;
};

const testFiles = [
  "next-config.test.ts",
  ...(await collectTestFiles("scripts", fileName => fileName.endsWith(".test.mjs"))),
  ...(await collectTestFiles(
    "src",
    fileName => fileName.endsWith(".test.ts") || fileName.endsWith(".spec.ts"),
  )),
];

const testProcess = spawn(pnpmCommand, ["exec", "tsx", "--test", ...testFiles], {
  cwd: webRoot,
  stdio: "inherit",
});

testProcess.on("error", error => {
  console.error(error);
  process.exitCode = 1;
});

testProcess.on("exit", code => {
  process.exitCode = code ?? 1;
});
