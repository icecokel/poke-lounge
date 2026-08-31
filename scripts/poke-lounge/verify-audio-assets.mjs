import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const manifestPath = path.join(
  repoRoot,
  "apps/web/public/assets/poke-lounge/audio/audio-manifest.json",
);

const expectedIds = new Set([
  "button-confirm",
  "button-cancel",
  "battle-start",
  "battle-hit",
  "battle-transition",
  "pokemon-faint",
]);
const expectedBgmIds = new Set(["field-day", "wild-battle"]);

function fail(message) {
  console.error(`Audio asset verification failed: ${message}`);
  process.exit(1);
}

function verifySource(item) {
  const source = item.source;

  if (!source || typeof source !== "object" || Array.isArray(source)) {
    fail(`${item.id} must include source metadata`);
  }

  if (isRomSdatSource(source) || isLegacyCc0Source(source)) {
    return;
  }

  fail(`${item.id} must use valid ROM SDAT or legacy CC0 source metadata`);
}

function isRomSdatSource(source) {
  return (
    typeof source.sdatPath === "string" &&
    source.sdatPath.trim().length > 0 &&
    Number.isInteger(source.sequenceIndex) &&
    source.sequenceIndex >= 0 &&
    typeof source.sequenceName === "string" &&
    source.sequenceName.trim().length > 0
  );
}

function isLegacyCc0Source(source) {
  return (
    typeof source.title === "string" &&
    source.title.trim().length > 0 &&
    typeof source.creator === "string" &&
    source.creator.trim().length > 0 &&
    source.license === "CC0-1.0" &&
    typeof source.sourceUrl === "string" &&
    source.sourceUrl.startsWith("https://") &&
    typeof source.sourceFile === "string" &&
    source.sourceFile.trim().length > 0
  );
}

if (!fs.existsSync(manifestPath)) {
  fail(`missing manifest at ${path.relative(repoRoot, manifestPath)}`);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

if (!manifest || !Array.isArray(manifest.sfx)) {
  fail("manifest.sfx must be an array");
}

if (!Array.isArray(manifest.bgm)) {
  fail("manifest.bgm must be an array");
}

const ids = new Set(
  manifest.sfx.map(function mapItem(item) {
    return item.id;
  }),
);
const bgmIds = new Set(
  manifest.bgm.map(function mapItem(item) {
    return item.id;
  }),
);

for (const expectedId of expectedIds) {
  if (!ids.has(expectedId)) {
    fail(`missing SFX id ${expectedId}`);
  }
}

for (const expectedId of expectedBgmIds) {
  if (!bgmIds.has(expectedId)) {
    fail(`missing BGM id ${expectedId}`);
  }
}

for (const item of manifest.sfx) {
  verifySource(item);

  if (!expectedIds.has(item.id)) {
    fail(`unexpected SFX id ${item.id}`);
  }

  if (typeof item.src !== "string" || !item.src.endsWith(".mp3")) {
    fail(`${item.id} must point to an MP3 source`);
  }

  if (typeof item.durationMs !== "number" || item.durationMs <= 0) {
    fail(`${item.id} must include a positive durationMs`);
  }

  if (typeof item.sizeBytes !== "number" || item.sizeBytes <= 0 || item.sizeBytes > 160_000) {
    fail(`${item.id} must include a valid lightweight sizeBytes`);
  }

  if (typeof item.defaultVolume !== "number" || item.defaultVolume <= 0 || item.defaultVolume > 1) {
    fail(`${item.id} must include defaultVolume in the 0..1 range`);
  }

  const assetPath = path.join(repoRoot, "apps/web/public", item.src);
  if (!assetPath.startsWith(path.join(repoRoot, "apps/web/public"))) {
    fail(`${item.id} src resolves outside public directory`);
  }

  if (!fs.existsSync(assetPath)) {
    fail(`${item.id} missing asset at ${item.src}`);
  }

  const stats = fs.statSync(assetPath);
  if (stats.size !== item.sizeBytes) {
    fail(`${item.id} manifest sizeBytes does not match file size`);
  }

  const header = fs.readFileSync(assetPath, { start: 0, end: 2 });
  const isMp3 = header.toString("latin1").startsWith("ID3") || header[0] === 0xff;
  if (!isMp3) {
    fail(`${item.id} does not look like an MP3 file`);
  }
}

for (const item of manifest.bgm) {
  verifySource(item);

  if (!expectedBgmIds.has(item.id)) {
    fail(`unexpected BGM id ${item.id}`);
  }

  if (typeof item.src !== "string" || !item.src.endsWith(".mp3")) {
    fail(`${item.id} must point to an MP3 source`);
  }

  if (typeof item.durationMs !== "number" || item.durationMs <= 0) {
    fail(`${item.id} must include a positive durationMs`);
  }

  if (typeof item.sizeBytes !== "number" || item.sizeBytes <= 0 || item.sizeBytes > 900_000) {
    fail(`${item.id} must include a valid lightweight sizeBytes`);
  }

  if (typeof item.defaultVolume !== "number" || item.defaultVolume <= 0 || item.defaultVolume > 1) {
    fail(`${item.id} must include defaultVolume in the 0..1 range`);
  }

  const assetPath = path.join(repoRoot, "apps/web/public", item.src);
  if (!assetPath.startsWith(path.join(repoRoot, "apps/web/public"))) {
    fail(`${item.id} src resolves outside public directory`);
  }

  if (!fs.existsSync(assetPath)) {
    fail(`${item.id} missing asset at ${item.src}`);
  }

  const stats = fs.statSync(assetPath);
  if (stats.size !== item.sizeBytes) {
    fail(`${item.id} manifest sizeBytes does not match file size`);
  }

  const header = fs.readFileSync(assetPath, { start: 0, end: 2 });
  const isMp3 = header.toString("latin1").startsWith("ID3") || header[0] === 0xff;
  if (!isMp3) {
    fail(`${item.id} does not look like an MP3 file`);
  }
}

const totalBytes = manifest.sfx.reduce(function reduceItems(sum, item) {
  return sum + item.sizeBytes;
}, 0);
if (totalBytes > 500_000) {
  fail(`total SFX payload ${totalBytes} exceeds 500000 bytes`);
}

const totalBgmBytes = manifest.bgm.reduce(function reduceItems(sum, item) {
  return sum + item.sizeBytes;
}, 0);
if (totalBgmBytes > 900_000) {
  fail(`total BGM payload ${totalBgmBytes} exceeds 900000 bytes`);
}

console.log(
  `Verified ${manifest.sfx.length} Poke Lounge SFX assets (${totalBytes} bytes) and ${manifest.bgm.length} BGM assets (${totalBgmBytes} bytes).`,
);
