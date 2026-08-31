import { ServiceUnavailableException } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { PokeLoungeRomDataService } from './poke-lounge-rom-data.service';

const ROM_SHA1 = '5834fb3a2d751c48501d47d6a56898d7af6ccf9e';
const CONTENT_SHA256 = 'a'.repeat(64);
const DOCUMENT_KEYS = [
  'pokemon-data',
  'item-data',
  'level-up-move-table',
  'growth-table',
] as const;

describe('PokeLoungeRomDataService', () => {
  it('returns the exact four validated ROM documents from one query', async () => {
    const query = jest.fn().mockResolvedValue(DOCUMENT_KEYS.map(row));
    const service = new PokeLoungeRomDataService({ query } as never);

    await expect(service.getRuntimeData()).resolves.toEqual({
      documents: DOCUMENT_KEYS.map((documentKey) => ({
        documentKey,
        schemaVersion: 1,
        romSha1: ROM_SHA1,
        contentSha256: CONTENT_SHA256,
        payload: payload(documentKey),
      })),
    });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['empty', []],
    ['missing', DOCUMENT_KEYS.slice(0, 3).map(row)],
    [
      'wrong ROM',
      DOCUMENT_KEYS.map((key) =>
        key === 'pokemon-data'
          ? { ...row(key), romSha1: 'b'.repeat(40) }
          : row(key),
      ),
    ],
    [
      'wrong content hash',
      DOCUMENT_KEYS.map((key) =>
        key === 'growth-table'
          ? { ...row(key), contentSha256: 'x'.repeat(64) }
          : row(key),
      ),
    ],
    [
      'malformed payload',
      DOCUMENT_KEYS.map((key) =>
        key === 'item-data' ? { ...row(key), payload: {} } : row(key),
      ),
    ],
  ])(
    'rejects %s data instead of returning a partial bundle',
    async (_label, rows) => {
      const service = new PokeLoungeRomDataService({
        query: jest.fn().mockResolvedValue(rows),
      } as unknown as DataSource);

      await expect(service.getRuntimeData()).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    },
  );
});

function row(documentKey: string) {
  return {
    documentKey,
    schemaVersion: 1,
    romSha1: ROM_SHA1,
    contentSha256: CONTENT_SHA256,
    payload: payload(documentKey),
  };
}

function payload(documentKey: string) {
  return {
    version: 1,
    source: { romSha1: ROM_SHA1 },
    documentKey,
  };
}
