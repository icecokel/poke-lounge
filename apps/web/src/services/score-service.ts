import type { components } from "@/types/api";
import { apiClient, ApiError } from "@/lib/api-client";

// API 스키마에서 자동 생성된 타입
export type CreateGameHistoryDto = components["schemas"]["CreateGameHistoryDto"];
export type GameHistoryResponseDto = components["schemas"]["GameHistoryResponseDto"];
export type GameHistoryUserDto = components["schemas"]["GameHistoryUserDto"];
export type GameHistory = components["schemas"]["GameRankingHistoryDto"];

// 내부 사용 인터페이스
export interface ScoreSubmissionResult {
  success: boolean;
  message?: string;
  data?: GameHistoryResponseDto;
  status?: number;
  requiresAuth?: boolean;
  unavailable?: boolean;
}

export interface ScoreSubmissionData {
  gameName: string;
  score: number;
  playTime?: number;
}

/**
 * 게임 점수를 서버에 제출합니다.
 */
export const submitScore = async (
  data: ScoreSubmissionData,
  token?: string,
): Promise<ScoreSubmissionResult> => {
  if (!token) {
    return {
      success: false,
      message: "인증 토큰이 없습니다.",
      status: 401,
      requiresAuth: true,
    };
  }

  try {
    const gameType = data.gameName === "poke-lounge" ? "POKE_LOUNGE" : undefined;

    if (!gameType) {
      return {
        success: false,
        message: `지원하지 않는 게임입니다: ${data.gameName}`,
        status: 400,
      };
    }

    const payload: CreateGameHistoryDto = {
      score: data.score,
      gameType,
      playTime: data.playTime,
    };

    const result = await apiClient.post<GameHistoryResponseDto>("/game/result", payload, {
      token,
    });
    return {
      success: true,
      message: "점수가 성공적으로 기록되었습니다!",
      data: result,
    };
  } catch (error) {
    if (error instanceof ApiError) {
      return {
        success: false,
        message: `점수 기록 실패 (${error.status})`,
        status: error.status,
        requiresAuth: error.status === 401,
        unavailable: error.status !== 401,
      };
    }
    return {
      success: false,
      message: "네트워크 오류가 발생했습니다.",
      unavailable: true,
    };
  }
};

/**
 * 게임 랭킹(Top 10)을 조회합니다.
 */
export const getGameRanking = async (
  gameType: CreateGameHistoryDto["gameType"] = "POKE_LOUNGE",
): Promise<GameHistory[]> => {
  const result = await apiClient.get<GameHistory[]>(`/game/ranking?gameType=${gameType}`, {
    cache: "no-store",
  });
  return result;
};
