import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadRuntimeGameDataJson } from '@poke-lounge/battle/adventure/data/game-data-json';
import { createWorldMapModel } from '@poke-lounge/battle/adventure/world/world-map-model';
import type { AiAdventureContext } from '@poke-lounge/battle/adventure/ai-world';

@Injectable()
export class PokeLoungeAiRuntimeService {
  private context: Promise<AiAdventureContext> | null = null;
  constructor(private readonly config: ConfigService) {}

  getContext(): Promise<AiAdventureContext> {
    this.context ??= this.load().catch((error) => {
      this.context = null;
      throw error;
    });
    return this.context;
  }

  private async load(): Promise<AiAdventureContext> {
    const publicRoot = resolve(process.cwd(), '../web/public');
    const readAsset = async (path: string): Promise<unknown> =>
      JSON.parse(await readFile(resolve(publicRoot, `.${path}`), 'utf8'));
    const origin =
      this.config.get<string>('AI_RUNTIME_API_URL') ??
      `http://127.0.0.1:${this.config.get<string>('PORT') ?? '3001'}`;
    const data = await loadRuntimeGameDataJson(
      async (input) =>
        new Response(
          JSON.stringify(
            await readAsset(
              typeof input === 'string'
                ? input
                : input instanceof URL
                  ? input.pathname
                  : new URL(input.url).pathname,
            ),
          ),
          {
            status: 200,
          },
        ),
      async () => {
        const response = await fetch(new URL('/poke-lounge/rom-data', origin), {
          signal: AbortSignal.timeout(10_000),
        });
        if (!response.ok)
          throw new Error(`AI ROM data unavailable: ${response.status}`);
        const body: unknown = await response.json();
        if (
          !body ||
          typeof body !== 'object' ||
          !('success' in body) ||
          body.success !== true ||
          !('data' in body)
        ) {
          throw new Error('AI ROM data response is invalid');
        }
        return body.data;
      },
    );
    return {
      model: createWorldMapModel(
        await readAsset('/maps/pokemmo-reference/town.json'),
      ),
      encounterData: await readAsset('/game-data/wild-encounter-tables.json'),
      pokemonData: data.pokemonData as AiAdventureContext['pokemonData'],
      moveData: data.pokemonData as AiAdventureContext['moveData'],
    };
  }
}
