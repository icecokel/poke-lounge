import { loadRuntimeGameDataJson } from "@/components/poke-lounge/runtime/game/data/game-data-json";

let gameData: ReturnType<typeof loadRuntimeGameDataJson> | null = null;

export function loadLeagueGameData() {
  gameData ??= loadRuntimeGameDataJson().catch(error => {
    gameData = null;
    throw error;
  });
  return gameData;
}
