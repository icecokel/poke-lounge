import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  getPublicFiles,
  runDeploymentGate,
  runStrictGate,
  validateManifest,
} from "./check-asset-provenance.mjs";

assert.throws(
  () =>
    validateManifest([
      { publicPath: "assets/poke-lounge/audio/sfx/button-confirm.mp3", rightsStatus: "blocked" },
    ]),
  /must be approved/,
);

assert.throws(() => validateManifest([]), /missing manifest row/);

const [publicFile] = getPublicFiles();
const validRow = {
  publicPath: publicFile.publicPath,
  sha256: createHash("sha256").update(readFileSync(publicFile.absolutePath)).digest("hex"),
  source: "test fixture",
  rightsStatus: "approved",
  attribution: null,
  reviewer: "test reviewer",
  approvedAt: "2026-07-10T00:00:00.000Z",
};

assert.doesNotThrow(() => validateManifest([validRow], [publicFile]));
assert.throws(
  () => validateManifest([{ ...validRow, sha256: "0".repeat(64) }], [publicFile]),
  /SHA-256 mismatch/,
);

assert.throws(() => runStrictGate(), /must be approved/);
assert.equal(runDeploymentGate({ VERCEL: "1" }), false);
assert.throws(() => runDeploymentGate({ POKE_LOUNGE_PROVENANCE_STRICT: "1" }), /must be approved/);
assert.equal(runDeploymentGate({}), false);
