import { canonicalize } from "@poke-lounge/battle/canonical-json";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import growthTable from "../battle/growthTable.json";
import {
  ITEM_DATA_JSON_PATH,
  LEVEL_UP_MOVE_TABLE_JSON_PATH,
  POKEMON_DATA_JSON_PATH,
  loadRuntimeGameDataJson,
  type RuntimeGameDataJson,
} from "../data/game-data-json";

const ROM_SHA1 = "5834fb3a2d751c48501d47d6a56898d7af6ccf9e";
const webRoot = process.cwd();
type RomDocumentKey = "pokemon-data" | "item-data" | "level-up-move-table" | "growth-table";

export function loadRuntimeGameDataJsonFixture(
  fetcher: typeof fetch,
): Promise<RuntimeGameDataJson> {
  return loadRuntimeGameDataJson(fetcher, function callback() {
    return createRuntimeRomDataFixture(fetcher);
  });
}

export function loadPublicRuntimeGameDataFixture(): Promise<RuntimeGameDataJson> {
  return loadRuntimeGameDataJsonFixture(fetchPublicGameDataFixture);
}

export async function createRuntimeRomDataFixture(fetcher: typeof fetch) {
  return {
    documents: [
      await readDocument(fetcher, "pokemon-data", POKEMON_DATA_JSON_PATH),
      await readDocument(fetcher, "item-data", ITEM_DATA_JSON_PATH),
      await readDocument(fetcher, "level-up-move-table", LEVEL_UP_MOVE_TABLE_JSON_PATH),
      document("growth-table", growthTable),
    ],
  };
}

async function readDocument(fetcher: typeof fetch, documentKey: RomDocumentKey, path: string) {
  const response = await fetcher(path);
  if (!response.ok) {
    throw new Error(`Test ROM document ${path} failed: ${response.status}`);
  }

  return document(documentKey, await response.json());
}

function document(documentKey: RomDocumentKey, payload: unknown) {
  return {
    documentKey,
    schemaVersion: 1,
    romSha1: ROM_SHA1,
    contentSha256: createHash("sha256").update(canonicalize(payload), "utf8").digest("hex"),
    payload,
  };
}

export function fetchPublicGameDataFixture(input: RequestInfo | URL): Promise<Response> {
  const requestPath =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.pathname
        : new URL(input.url).pathname;

  return Promise.resolve(
    new Response(
      fs.readFileSync(path.join(webRoot, "public", requestPath.replace(/^\//, "")), "utf8"),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ),
  );
}
