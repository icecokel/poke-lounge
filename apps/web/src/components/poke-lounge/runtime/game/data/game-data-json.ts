export * from "@poke-lounge/battle/adventure/data/game-data-json";
import {
  loadRuntimeGameDataJson as loadData,
  POKE_LOUNGE_ROM_DATA_API_PATH,
} from "@poke-lounge/battle/adventure/data/game-data-json";
async function loadApi(path: string): Promise<unknown> {
  const { apiClient } = await import("@/lib/api-client");
  return apiClient.get<unknown>(path);
}
export function loadRuntimeGameDataJson(
  fetcher: typeof fetch = fetch,
  loadRomData = () => loadApi(POKE_LOUNGE_ROM_DATA_API_PATH),
) {
  return loadData(fetcher, loadRomData);
}
