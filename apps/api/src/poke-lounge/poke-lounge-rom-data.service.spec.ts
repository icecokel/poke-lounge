import { canonicalize } from '@poke-lounge/battle/canonical-json';
import { ServiceUnavailableException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { DataSource } from 'typeorm';
import { PokeLoungeRomDataService } from './poke-lounge-rom-data.service';

const ROM_SHA1 = '5834fb3a2d751c48501d47d6a56898d7af6ccf9e';
const DOCUMENT_KEYS = [
  'pokemon-data',
  'item-data',
  'level-up-move-table',
  'growth-table',
] as const;

describe('PokeLoungeRomDataService', function testSuite() {
  it('returns the exact four validated ROM documents from one query', async function testCase() {
    const query = jest.fn().mockResolvedValue(
      DOCUMENT_KEYS.map(function mapItem(key) {
        return row(key);
      }),
    );
    const service = new PokeLoungeRomDataService({ query } as never);

    await expect(service.getRuntimeData()).resolves.toEqual({
      documents: DOCUMENT_KEYS.map(function mapItem(documentKey) {
        return {
          documentKey,
          schemaVersion: 1,
          romSha1: ROM_SHA1,
          contentSha256: contentSha256(payload(documentKey)),
          payload: payload(documentKey),
        };
      }),
    });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['basic', [17, 4]],
    ['premium', [80, 25]],
  ] as const)(
    'returns only the %s shop catalog',
    async function callback(shopKind, expected) {
      const query = jest
        .fn()
        .mockResolvedValue([row('item-data', shopPayload())]);
      const service = new PokeLoungeRomDataService({ query } as never);

      await expect(service.getShopItemIds(shopKind)).resolves.toEqual(expected);
      expect(query).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    ['missing row', []],
    [
      'empty catalog',
      [row('item-data', shopPayload({ basic: [], premium: [80] }))],
    ],
    [
      'duplicate across shops',
      [row('item-data', shopPayload({ basic: [17], premium: [17] }))],
    ],
    [
      'unsupported item',
      [row('item-data', shopPayload({ basic: [1], premium: [80] }))],
    ],
    [
      'non-integer item',
      [row('item-data', shopPayload({ basic: [17.5], premium: [80] }))],
    ],
    [
      'missing item record',
      [row('item-data', shopPayload({ basic: [2], premium: [80] }))],
    ],
  ])('rejects %s shop catalog data', async function callback(_label, rows) {
    const service = new PokeLoungeRomDataService({
      query: jest.fn().mockResolvedValue(rows),
    } as unknown as DataSource);

    await expect(service.getShopItemIds('basic')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it.each([
    ['empty', []],
    [
      'missing',
      DOCUMENT_KEYS.slice(0, 3).map(function mapItem(key) {
        return row(key);
      }),
    ],
    [
      'wrong ROM',
      DOCUMENT_KEYS.map(function mapItem(key) {
        return key === 'pokemon-data'
          ? { ...row(key), romSha1: 'b'.repeat(40) }
          : row(key);
      }),
    ],
    [
      'wrong content hash',
      DOCUMENT_KEYS.map(function mapItem(key) {
        return key === 'growth-table'
          ? { ...row(key), contentSha256: 'x'.repeat(64) }
          : row(key);
      }),
    ],
    [
      'malformed payload',
      DOCUMENT_KEYS.map(function mapItem(key) {
        return key === 'item-data' ? { ...row(key), payload: {} } : row(key);
      }),
    ],
    [
      'stale payload hash',
      DOCUMENT_KEYS.map(function mapItem(key) {
        return key === 'pokemon-data'
          ? { ...row(key), payload: { ...payload(key), changed: true } }
          : row(key);
      }),
    ],
  ])(
    'rejects %s data instead of returning a partial bundle',
    async function callback(_label, rows) {
      const service = new PokeLoungeRomDataService({
        query: jest.fn().mockResolvedValue(rows),
      } as unknown as DataSource);

      await expect(service.getRuntimeData()).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    },
  );
});

function row(documentKey: string, payloadOverride?: object) {
  const rowPayload = payloadOverride ?? payload(documentKey);
  return {
    documentKey,
    schemaVersion: 1,
    romSha1: ROM_SHA1,
    contentSha256: contentSha256(rowPayload),
    payload: rowPayload,
  };
}

function contentSha256(value: unknown): string {
  return createHash('sha256').update(canonicalize(value), 'utf8').digest('hex');
}

function payload(documentKey: string) {
  return {
    version: 1,
    source: { romSha1: ROM_SHA1 },
    documentKey,
  };
}

function shopPayload(
  shopCatalogs: { basic: number[]; premium: number[] } = {
    basic: [17, 4],
    premium: [80, 25],
  },
) {
  return {
    version: 1,
    source: { romSha1: ROM_SHA1 },
    items: {
      '1': { id: 1 },
      '4': { id: 4 },
      '17': { id: 17 },
      '25': { id: 25 },
      '80': { id: 80 },
    },
    shopCatalogs,
  };
}
