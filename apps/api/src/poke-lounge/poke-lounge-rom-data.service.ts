import { POKE_LOUNGE_RUNTIME_ITEM_ROM_IDS } from '@poke-lounge/battle';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type {
  PokeLoungeRomDataResponseDto,
  PokeLoungeRomDocumentDto,
} from './dto/poke-lounge-rom-data-response.dto';

const EXPECTED_ROM_SHA1 = '5834fb3a2d751c48501d47d6a56898d7af6ccf9e';
const CONTENT_SHA256_PATTERN = /^[0-9a-f]{64}$/;
const SUPPORTED_RUNTIME_ITEM_ROM_IDS = new Set<number>(
  Object.values(POKE_LOUNGE_RUNTIME_ITEM_ROM_IDS),
);
const DOCUMENT_KEYS = [
  'pokemon-data',
  'item-data',
  'level-up-move-table',
  'growth-table',
] as const;

type DocumentKey = (typeof DOCUMENT_KEYS)[number];

interface PokeLoungeRomDocumentRow {
  documentKey: string;
  schemaVersion: number;
  romSha1: string;
  contentSha256: string;
  payload: unknown;
}

@Injectable()
export class PokeLoungeRomDataService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async getRuntimeData(): Promise<PokeLoungeRomDataResponseDto> {
    const rows = await this.dataSource.query<PokeLoungeRomDocumentRow[]>(`
      SELECT
        "document_key" AS "documentKey",
        "schema_version" AS "schemaVersion",
        "rom_sha1" AS "romSha1",
        "content_sha256" AS "contentSha256",
        "payload"
      FROM "poke_lounge_rom_document"
      ORDER BY "document_key"
    `);
    const rowsByKey = new Map<
      DocumentKey,
      PokeLoungeRomDocumentRow & { documentKey: DocumentKey }
    >();

    for (const row of rows) {
      if (!isValidRow(row) || rowsByKey.has(row.documentKey)) {
        throw incompleteRomData();
      }
      rowsByKey.set(row.documentKey, row);
    }

    if (
      rowsByKey.size !== DOCUMENT_KEYS.length ||
      DOCUMENT_KEYS.some((key) => !rowsByKey.has(key))
    ) {
      throw incompleteRomData();
    }

    return {
      documents: DOCUMENT_KEYS.map((key) => toDocument(rowsByKey.get(key)!)),
    };
  }

  async getShopItemIds(shopKind: 'basic' | 'premium'): Promise<number[]> {
    const rows = await this.dataSource.query<PokeLoungeRomDocumentRow[]>(`
      SELECT
        "document_key" AS "documentKey",
        "schema_version" AS "schemaVersion",
        "rom_sha1" AS "romSha1",
        "content_sha256" AS "contentSha256",
        "payload"
      FROM "poke_lounge_rom_document"
      WHERE "document_key" = 'item-data'
    `);
    const row = rows[0];

    if (
      rows.length !== 1 ||
      !row ||
      !isValidRow(row) ||
      row.documentKey !== 'item-data'
    ) {
      throw incompleteRomData();
    }

    return readShopCatalogs(row.payload)[shopKind];
  }
}

function readShopCatalogs(
  payload: unknown,
): Record<'basic' | 'premium', number[]> {
  if (!isRecord(payload)) {
    throw incompleteRomData();
  }
  const items = payload.items;
  const shopCatalogs = payload.shopCatalogs;
  if (!isRecord(items) || !isRecord(shopCatalogs)) {
    throw incompleteRomData();
  }

  const seenItemIds = new Set<number>();
  const readCatalog = (shopKind: 'basic' | 'premium'): number[] => {
    const values = shopCatalogs[shopKind];
    if (!Array.isArray(values) || values.length === 0) {
      throw incompleteRomData();
    }

    return values.map((value) => {
      const itemId =
        typeof value === 'number' && Number.isSafeInteger(value) ? value : null;
      const item = items[String(itemId)];
      if (
        itemId === null ||
        itemId <= 0 ||
        !SUPPORTED_RUNTIME_ITEM_ROM_IDS.has(itemId) ||
        seenItemIds.has(itemId) ||
        !isRecord(item) ||
        item.id !== itemId
      ) {
        throw incompleteRomData();
      }
      seenItemIds.add(itemId);
      return itemId;
    });
  };

  return {
    basic: readCatalog('basic'),
    premium: readCatalog('premium'),
  };
}

function isValidRow(
  row: PokeLoungeRomDocumentRow,
): row is PokeLoungeRomDocumentRow & { documentKey: DocumentKey } {
  if (
    !DOCUMENT_KEYS.includes(row.documentKey as DocumentKey) ||
    row.schemaVersion !== 1 ||
    row.romSha1 !== EXPECTED_ROM_SHA1 ||
    !CONTENT_SHA256_PATTERN.test(row.contentSha256) ||
    !isRecord(row.payload) ||
    row.payload.version !== 1 ||
    !isRecord(row.payload.source) ||
    row.payload.source.romSha1 !== EXPECTED_ROM_SHA1
  ) {
    return false;
  }

  return true;
}

function toDocument(
  row: PokeLoungeRomDocumentRow & { documentKey: DocumentKey },
): PokeLoungeRomDocumentDto {
  return {
    documentKey: row.documentKey,
    schemaVersion: 1,
    romSha1: row.romSha1,
    contentSha256: row.contentSha256,
    payload: row.payload as Record<string, unknown>,
  };
}

function incompleteRomData(): ServiceUnavailableException {
  return new ServiceUnavailableException('Poke Lounge ROM data is incomplete');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
