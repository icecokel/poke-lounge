export function shouldDisposeRoomOnWorldShutdown(
  isBattleIntroPlaying: boolean,
  preserveRoomForBattle: boolean,
): boolean {
  return !isBattleIntroPlaying && !preserveRoomForBattle;
}
