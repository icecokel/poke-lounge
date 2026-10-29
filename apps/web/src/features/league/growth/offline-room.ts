import type { MultiplayerRoom } from "@/components/poke-lounge/runtime/game/network/local-preview-room";
export function createLeagueOfflineRoom(): MultiplayerRoom {
  const noop = () => {};
  const asyncNoop = async () => {};
  return {
    roomId: "league",
    sessionId: "league",
    connect: noop,
    setLobbyReady: asyncNoop,
    startChampionship: asyncNoop,
    addAiParticipant: asyncNoop,
    setAiDifficulty: asyncNoop,
    removeAiParticipant: asyncNoop,
    dispose: noop,
    send: noop,
    on: () => noop,
  };
}
