import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const PUBLIC_ROOT = join(REPO_ROOT, "apps/web/public");
const MANIFEST_PATH = join(REPO_ROOT, "docs/poke-lounge-asset-provenance.json");
const STRICT_GATE_ENV = "POKE_LOUNGE_PROVENANCE_STRICT";
const AUDITED_ROOTS = [
  "assets/poke-lounge",
  "assets/pokemon",
  "assets/pokemmo-reference",
  "game-data",
  "maps/pokemmo-reference",
];

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function walkFiles(path) {
  return readdirSync(path, { withFileTypes: true }).flatMap(entry => {
    const entryPath = join(path, entry.name);

    if (entry.isDirectory()) {
      return walkFiles(entryPath);
    }

    return entry.isFile() ? [entryPath] : [];
  });
}

export function getPublicFiles() {
  return AUDITED_ROOTS.flatMap(root => {
    const absoluteRoot = join(PUBLIC_ROOT, root);

    if (!existsSync(absoluteRoot)) {
      throw new Error(`audited public asset root is missing: ${root}`);
    }

    return walkFiles(absoluteRoot).map(absolutePath => ({
      publicPath: relative(PUBLIC_ROOT, absolutePath).replaceAll("\\", "/"),
      absolutePath,
      sha256: sha256(absolutePath),
    }));
  }).sort((left, right) => left.publicPath.localeCompare(right.publicPath));
}

export function validateManifest(rows, publicFiles = getPublicFiles()) {
  if (!Array.isArray(rows)) {
    throw new Error("manifest assets must be an array");
  }

  const publicFileByPath = new Map(publicFiles.map(file => [file.publicPath, file]));
  const rowsByPath = new Map();

  for (const row of rows) {
    if (!row || typeof row.publicPath !== "string" || !row.publicPath) {
      throw new Error("manifest row must include publicPath");
    }

    if (rowsByPath.has(row.publicPath)) {
      throw new Error(`duplicate manifest row: ${row.publicPath}`);
    }

    rowsByPath.set(row.publicPath, row);

    if (row.rightsStatus !== "approved") {
      throw new Error(`${row.publicPath} must be approved before public release`);
    }

    if (typeof row.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(row.sha256)) {
      throw new Error(`${row.publicPath} must include a SHA-256 digest`);
    }

    if (typeof row.source !== "string" || !row.source.trim()) {
      throw new Error(`${row.publicPath} must include a source record`);
    }

    if (
      row.attribution !== null &&
      (typeof row.attribution !== "string" || !row.attribution.trim())
    ) {
      throw new Error(`${row.publicPath} must include nonempty attribution when declared`);
    }

    if (typeof row.reviewer !== "string" || !row.reviewer.trim()) {
      throw new Error(`${row.publicPath} must include an approving reviewer`);
    }

    if (typeof row.approvedAt !== "string" || !row.approvedAt.trim()) {
      throw new Error(`${row.publicPath} must include an approval timestamp`);
    }

    const publicFile = publicFileByPath.get(row.publicPath);
    if (!publicFile) {
      throw new Error(`manifest row does not match an audited public file: ${row.publicPath}`);
    }

    if (row.sha256 !== publicFile.sha256) {
      throw new Error(`SHA-256 mismatch for ${row.publicPath}`);
    }
  }

  for (const publicFile of publicFiles) {
    if (!rowsByPath.has(publicFile.publicPath)) {
      throw new Error(`missing manifest row for ${publicFile.publicPath}`);
    }
  }
}

export function runStrictGate() {
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
  validateManifest(manifest.assets);
  return manifest.assets.length;
}

export function runDeploymentGate(environment = process.env) {
  if (environment[STRICT_GATE_ENV] !== "1") {
    return false;
  }

  runStrictGate();
  return true;
}

function run() {
  const deploymentMode = process.argv.includes("--deployment-gate");
  const enforced = deploymentMode ? runDeploymentGate() : true;

  if (!enforced) {
    console.log(
      `Poke Lounge provenance deployment gate skipped; set ${STRICT_GATE_ENV}=1 to enforce it.`,
    );
    return;
  }

  const assetCount = deploymentMode
    ? JSON.parse(readFileSync(MANIFEST_PATH, "utf8")).assets.length
    : runStrictGate();
  console.log(`Poke Lounge provenance gate passed for ${assetCount} public files.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    run();
  } catch (error) {
    console.error(`Poke Lounge provenance gate failed: ${error.message}`);
    process.exitCode = 1;
  }
}
