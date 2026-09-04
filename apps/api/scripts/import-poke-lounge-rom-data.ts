import { POKE_LOUNGE_RUNTIME_ITEM_ROM_IDS } from '@poke-lounge/battle/runtime-item-ids';
import { canonicalize } from '@poke-lounge/battle/canonical-json';
import {
  GEN4_PLAYABLE_MOVE_MAX_ID,
  GEN4_PLAYABLE_MOVE_MIN_ID,
  readCompleteGen4MoveRecords,
} from '@poke-lounge/battle/runtime-rom-data';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import dataSource from '../src/data-source';

const EXPECTED_ROM_SHA1 = '5834fb3a2d751c48501d47d6a56898d7af6ccf9e';
const SUPPORTED_RUNTIME_ITEM_ROM_IDS = new Set<number>(
  Object.values(POKE_LOUNGE_RUNTIME_ITEM_ROM_IDS),
);

interface RomDocument {
  documentKey: string;
  schemaVersion: number;
  romSha1: string;
  contentSha256: string;
  payload: JsonObject;
}

type JsonObject = Record<string, unknown>;

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (
    args.some(function testItem(arg) {
      return arg !== '--check';
    })
  ) {
    throw new Error(`Unknown argument: ${args.join(' ')}`);
  }

  const documents = loadAndValidateDocuments();
  if (args.includes('--check')) {
    console.log(`Validated ${documents.length} Poke Lounge ROM documents`);
    return;
  }

  await dataSource.initialize();
  try {
    await dataSource.transaction(async function callback(manager) {
      await manager.query(
        `
          INSERT INTO "poke_lounge_rom_document" (
            "document_key",
            "schema_version",
            "rom_sha1",
            "content_sha256",
            "payload",
            "updated_at"
          )
          SELECT
            "document_key",
            "schema_version",
            "rom_sha1",
            "content_sha256",
            "payload",
            now()
          FROM jsonb_to_recordset($1::jsonb) AS document(
            "document_key" text,
            "schema_version" smallint,
            "rom_sha1" text,
            "content_sha256" text,
            "payload" jsonb
          )
          ON CONFLICT ("document_key") DO UPDATE SET
            "schema_version" = EXCLUDED."schema_version",
            "rom_sha1" = EXCLUDED."rom_sha1",
            "content_sha256" = EXCLUDED."content_sha256",
            "payload" = EXCLUDED."payload",
            "updated_at" = now()
        `,
        [
          JSON.stringify(
            documents.map(function mapItem(document) {
              return {
                document_key: document.documentKey,
                schema_version: document.schemaVersion,
                rom_sha1: document.romSha1,
                content_sha256: document.contentSha256,
                payload: document.payload,
              };
            }),
          ),
        ],
      );
      await manager.query(
        `
          DELETE FROM "poke_lounge_rom_document"
          WHERE NOT ("document_key" = ANY($1::varchar[]))
        `,
        [
          documents.map(function mapItem(document) {
            return document.documentKey;
          }),
        ],
      );

      const imported = await manager.query<
        Array<{
          document_key: string;
          schema_version: number;
          rom_sha1: string;
          content_sha256: string;
          payload: JsonObject;
        }>
      >(`
          SELECT "document_key", "schema_version", "rom_sha1", "content_sha256", "payload"
          FROM "poke_lounge_rom_document"
          ORDER BY "document_key"
        `);

      assertImportedDocuments(documents, imported);
    });
  } finally {
    await dataSource.destroy();
  }

  console.log(`Imported ${documents.length} Poke Lounge ROM documents`);
}

function loadAndValidateDocuments(): RomDocument[] {
  const pokemon = loadDocument(
    'pokemon-data',
    '../web/public/game-data/pokemon-data.json',
  );
  const items = loadDocument(
    'item-data',
    '../web/public/game-data/item-data.json',
  );
  const levelUpMoves = loadDocument(
    'level-up-move-table',
    '../web/public/game-data/level-up-move-table.json',
  );
  const growth = loadDocument(
    'growth-table',
    '../web/src/components/poke-lounge/runtime/game/battle/growthTable.json',
  );

  validatePokemonData(pokemon.payload);
  validateItemData(items.payload);
  validateLevelUpMoves(levelUpMoves.payload, pokemon.payload);
  validateGrowthTable(growth.payload);

  return [pokemon, items, levelUpMoves, growth];
}

function loadDocument(documentKey: string, relativePath: string): RomDocument {
  const raw = readFileSync(resolve(process.cwd(), relativePath));
  const payload = asObject(JSON.parse(raw.toString('utf8')), documentKey);
  const schemaVersion = asInteger(payload.version, `${documentKey}.version`);
  const source = asObject(payload.source, `${documentKey}.source`);
  const romSha1 = asString(source.romSha1, `${documentKey}.source.romSha1`);

  if (schemaVersion !== 1 || romSha1 !== EXPECTED_ROM_SHA1) {
    throw new Error(
      `${documentKey} is not the supported Korean HeartGold ROM data`,
    );
  }

  return {
    documentKey,
    schemaVersion,
    romSha1,
    contentSha256: createHash('sha256')
      .update(canonicalize(payload), 'utf8')
      .digest('hex'),
    payload,
  };
}

function validatePokemonData(payload: JsonObject): void {
  const species = asObject(payload.species, 'pokemon-data.species');
  const moves = asObject(payload.moves, 'pokemon-data.moves');

  assertSequentialRecords(species, 'speciesId', 1, 507);
  assertSequentialRecords(moves, 'id', 0, 470);

  if (!readCompleteGen4MoveRecords(payload)) {
    throw new Error('pokemon-data move records are invalid');
  }
  const evolutionCount = Object.values(species).reduce<number>(
    function reduceItems(count, record) {
      return (
        count +
        asArray(asObject(record, 'species').evolutions, 'evolutions').length
      );
    },
    0,
  );

  if (evolutionCount !== 246) {
    throw new Error('pokemon-data record counts are incomplete');
  }
}

function validateItemData(payload: JsonObject): void {
  const items = asObject(payload.items, 'item-data.items');
  assertSequentialRecords(items, 'id', 1, 513);

  const shopCatalogs = asObject(payload.shopCatalogs, 'item-data.shopCatalogs');
  const catalogItemIds = new Set<number>();

  for (const shopKind of ['basic', 'premium']) {
    const itemIds = asArray(
      shopCatalogs[shopKind],
      `item-data.shopCatalogs.${shopKind}`,
    );
    if (itemIds.length === 0) {
      throw new Error(`item-data.shopCatalogs.${shopKind} must not be empty`);
    }

    for (const value of itemIds) {
      const itemId = asInteger(
        value,
        `item-data.shopCatalogs.${shopKind} item`,
      );
      if (
        !items[String(itemId)] ||
        !SUPPORTED_RUNTIME_ITEM_ROM_IDS.has(itemId) ||
        catalogItemIds.has(itemId)
      ) {
        throw new Error(
          `item-data shop catalog item ${itemId} is invalid or duplicated`,
        );
      }
      catalogItemIds.add(itemId);
    }
  }
}

function validateLevelUpMoves(
  payload: JsonObject,
  pokemonPayload: JsonObject,
): void {
  const learnsets = asObject(payload.species, 'level-up-move-table.species');
  const species = asObject(pokemonPayload.species, 'pokemon-data.species');
  let rowCount = 0;

  for (let speciesId = 1; speciesId <= 507; speciesId += 1) {
    const key = String(speciesId);
    const rows = asArray(learnsets[key], `learnset ${key}`);
    const embeddedRows = asArray(
      asObject(species[key], `species ${key}`).levelUpMoves,
      `species ${key}.levelUpMoves`,
    );

    if (JSON.stringify(rows) !== JSON.stringify(embeddedRows)) {
      throw new Error(`learnset ${key} differs from pokemon-data`);
    }
    const seenRows = new Set<string>();
    for (const [index, value] of rows.entries()) {
      const row = asObject(value, `learnset ${key}[${index}]`);
      const level = asInteger(row.level, `learnset ${key}[${index}].level`);
      const moveId = asInteger(row.moveId, `learnset ${key}[${index}].moveId`);
      const rowKey = `${level}:${moveId}`;
      if (
        Object.keys(row).length !== 2 ||
        level < 1 ||
        level > 100 ||
        moveId < GEN4_PLAYABLE_MOVE_MIN_ID ||
        moveId > GEN4_PLAYABLE_MOVE_MAX_ID ||
        seenRows.has(rowKey)
      ) {
        throw new Error(`learnset ${key}[${index}] is invalid or duplicated`);
      }
      seenRows.add(rowKey);
    }
    rowCount += rows.length;
  }

  if (Object.keys(learnsets).length !== 507 || rowCount !== 6764) {
    throw new Error('level-up-move-table record counts are incomplete');
  }
}

function validateGrowthTable(payload: JsonObject): void {
  const tables = asArray(payload.tables, 'growth-table.tables');
  if (tables.length !== 8) {
    throw new Error('growth-table must contain 8 growth rates');
  }

  for (let growthRate = 0; growthRate < 8; growthRate += 1) {
    const table = asObject(tables[growthRate], `growth table ${growthRate}`);
    if (
      asInteger(table.growth_rate, `growth table ${growthRate}.growth_rate`) !==
        growthRate ||
      asArray(table.experience, `growth table ${growthRate}.experience`)
        .length !== 101
    ) {
      throw new Error(`growth table ${growthRate} is incomplete`);
    }
  }
}

function assertSequentialRecords(
  records: JsonObject,
  idKey: string,
  firstId: number,
  lastId: number,
): void {
  if (Object.keys(records).length !== lastId - firstId + 1) {
    throw new Error(`${idKey} record count is incomplete`);
  }

  for (let id = firstId; id <= lastId; id += 1) {
    const record = asObject(records[String(id)], `${idKey} ${id}`);
    if (asInteger(record[idKey], `${idKey} ${id}`) !== id) {
      throw new Error(`${idKey} ${id} does not match its record key`);
    }
  }
}

function assertImportedDocuments(
  expected: RomDocument[],
  actual: Array<{
    document_key: string;
    schema_version: number;
    rom_sha1: string;
    content_sha256: string;
    payload: JsonObject;
  }>,
): void {
  const expectedMetadata = expected
    .map(function mapItem(document) {
      return {
        document_key: document.documentKey,
        schema_version: document.schemaVersion,
        rom_sha1: document.romSha1,
        content_sha256: document.contentSha256,
      };
    })
    .sort(function compareItems(left, right) {
      return left.document_key.localeCompare(right.document_key);
    });

  const actualMetadata = actual.map(function mapItem(document) {
    if (
      createHash('sha256')
        .update(canonicalize(document.payload), 'utf8')
        .digest('hex') !== document.content_sha256
    ) {
      throw new Error(
        `Imported ROM document ${document.document_key} payload hash does not match`,
      );
    }
    return {
      document_key: document.document_key,
      schema_version: document.schema_version,
      rom_sha1: document.rom_sha1,
      content_sha256: document.content_sha256,
    };
  });

  if (JSON.stringify(actualMetadata) !== JSON.stringify(expectedMetadata)) {
    throw new Error(
      'Imported ROM document metadata does not match the source files',
    );
  }
}

function asObject(value: unknown, label: string): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as JsonObject;
}

function asArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array`);
  }
  return value;
}

function asInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${label} must be an integer`);
  }
  return value as number;
}

function asString(value: unknown, label: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${label} must be a string`);
  }
  return value;
}

void main().catch(function handleRejected(error: unknown) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
