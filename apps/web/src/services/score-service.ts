import type { components } from "@/types/api";
import { apiClient } from "@/lib/api-client";

export type CreateGameHistoryDto = components["schemas"]["CreateGameHistoryDto"];
export type GameHistory = components["schemas"]["GameRankingHistoryDto"];

export const getGameRanking = async (
  gameType: CreateGameHistoryDto["gameType"] = "POKE_LOUNGE",
): Promise<GameHistory[]> => {
  const result = await apiClient.get<GameHistory[]>(`/game/ranking?gameType=${gameType}`, {
    cache: "no-store",
  });
  return result;
};
