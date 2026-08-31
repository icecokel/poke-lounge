import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import dataSource from '../src/data-source';

const EXPECTED_ROM_SHA1 = '5834fb3a2d751c48501d47d6a56898d7af6ccf9e';

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
  if (args.some((arg) => arg !== '--check')) {
    throw new Error(`Unknown argument: ${args.join(' ')}`);
  }

  const documents = loadAndValidateDocuments();
  if (args.includes('--check')) {
    console.log(`Validated ${documents.length} Poke Lounge ROM documents`);
    return;
  }

  await dataSource.initialize();
  try {
    await dataSource.transaction(async (manager) => {
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
            documents.map((document) => ({
              document_key: document.documentKey,
              schema_version: document.schemaVersion,
              rom_sha1: document.romSha1,
              content_sha256: document.contentSha256,
              payload: document.payload,
            })),
          ),
        ],
      );
      await manager.query(
        `
          DELETE FROM "poke_lounge_rom_document"
          WHERE NOT ("document_key" = ANY($1::varchar[]))
        `,
        [documents.map((document) => document.documentKey)],
      );

      const imported = await manager.query<
        Array<{
          document_key: string;
          schema_version: number;
          rom_sha1: string;
          content_sha256: string;
        }>
      >(`
          SELECT "document_key", "schema_version", "rom_sha1", "content_sha256"
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
    contentSha256: createHash('sha256').update(raw).digest('hex'),
    payload,
  };
}

function validatePokemonData(payload: JsonObject): void {
  const species = asObject(payload.species, 'pokemon-data.species');
  const moves = asObject(payload.moves, 'pokemon-data.moves');

  assertSequentialRecords(species, 'speciesId', 1, 507);
  assertSequentialRecords(moves, 'id', 0, 470);

  const moveNames = Object.values(moves).filter(
    (move) => typeof asObject(move, 'move').name === 'string',
  );
  const evolutionCount = Object.values(species).reduce<number>(
    (count, record) =>
      count +
      asArray(asObject(record, 'species').evolutions, 'evolutions').length,
    0,
  );

  if (moveNames.length !== 467 || evolutionCount !== 246) {
    throw new Error('pokemon-data record counts are incomplete');
  }
}

function validateItemData(payload: JsonObject): void {
  assertSequentialRecords(
    asObject(payload.items, 'item-data.items'),
    'id',
    1,
    513,
  );
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
  }>,
): void {
  const expectedMetadata = expected
    .map((document) => ({
      document_key: document.documentKey,
      schema_version: document.schemaVersion,
      rom_sha1: document.romSha1,
      content_sha256: document.contentSha256,
    }))
    .sort((left, right) => left.document_key.localeCompare(right.document_key));

  if (JSON.stringify(actual) !== JSON.stringify(expectedMetadata)) {
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

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
