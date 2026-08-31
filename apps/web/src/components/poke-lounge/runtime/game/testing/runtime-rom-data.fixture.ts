import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import growthTable from "../battle/growthTable.json";
import {
  ITEM_DATA_JSON_PATH,
  LEVEL_UP_MOVE_TABLE_JSON_PATH,
  POKEMON_DATA_JSON_PATH,
  loadRuntimeGameDataJson,
  type RuntimeGameDataJson,
} from "../data/game-data-json";

const ROM_SHA1 = "5834fb3a2d751c48501d47d6a56898d7af6ccf9e";
const webRoot = fileURLToPath(new URL("../../../../../../", import.meta.url));
const CONTENT_SHA256_BY_KEY = {
  "pokemon-data": "dceedc4d12314fff37c80697dbd8ebb749a9dc8138687f08e18109c1acc49723",
  "item-data": "9b4e6d64e10900571a47889142e86c7f8ee94dc1f315b3010ee25f9bfbf7a32d",
  "level-up-move-table": "2f499528dd71e5ceccb799f2d7f2d29c2f4970467d61eba6e27b5697664ba2b8",
  "growth-table": "c6052e967dcb8233a869ea791da98f803dce1e6a9c187323283d4f604f6e374a",
} as const;

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

async function readDocument(
  fetcher: typeof fetch,
  documentKey: keyof typeof CONTENT_SHA256_BY_KEY,
  path: string,
) {
  const response = await fetcher(path);
  if (!response.ok) {
    throw new Error(`Test ROM document ${path} failed: ${response.status}`);
  }

  return document(documentKey, await response.json());
}

function document(documentKey: keyof typeof CONTENT_SHA256_BY_KEY, payload: unknown) {
  return {
    documentKey,
    schemaVersion: 1,
    romSha1: ROM_SHA1,
    contentSha256: CONTENT_SHA256_BY_KEY[documentKey],
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
