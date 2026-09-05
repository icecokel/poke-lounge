import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { canonicalize } from '@poke-lounge/battle/canonical-json';
import { PokeLoungeAiRuntimeService } from './poke-lounge-ai-runtime.service';

afterEach(() => jest.restoreAllMocks());

it('requires valid API ROM data, retries after errors and caches only a successful load', async () => {
  const service = new PokeLoungeAiRuntimeService(new ConfigService());
  const payload = {
    documents: [
      'pokemon-data',
      'item-data',
      'level-up-move-table',
      'growth-table',
    ].map((documentKey) => {
      const path =
        documentKey === 'growth-table'
          ? '../web/src/components/poke-lounge/runtime/game/battle/growthTable.json'
          : `../web/public/game-data/${documentKey}.json`;
      const data: unknown = JSON.parse(readFileSync(resolve(path), 'utf8'));
      return {
        documentKey,
        schemaVersion: 1,
        romSha1: '5834fb3a2d751c48501d47d6a56898d7af6ccf9e',
        contentSha256: createHash('sha256')
          .update(canonicalize(data))
          .digest('hex'),
        payload: data,
      };
    }),
  };
  const fetcher = jest.spyOn(globalThis, 'fetch');
  fetcher.mockResolvedValueOnce(new Response(null, { status: 503 }));
  await expect(service.getContext()).rejects.toThrow(
    'AI ROM data unavailable: 503',
  );
  fetcher.mockResolvedValueOnce(Response.json({ success: false }));
  await expect(service.getContext()).rejects.toThrow(
    'AI ROM data response is invalid',
  );
  fetcher.mockResolvedValueOnce(
    Response.json({ success: true, data: { documents: [] } }),
  );
  await expect(service.getContext()).rejects.toThrow();
  const validResponse = Response.json({ success: true, data: payload });
  // Keep parsed objects in Jest's realm, matching production JSON parsing / canonical hashing.
  jest
    .spyOn(validResponse, 'json')
    .mockResolvedValue({ success: true, data: payload });
  fetcher.mockResolvedValueOnce(validResponse);
  const context = await service.getContext();
  expect(context.model.tallGrassCoordinates.size).toBeGreaterThan(0);
  expect(await service.getContext()).toBe(context);
  expect(fetcher).toHaveBeenCalledTimes(4);
});
