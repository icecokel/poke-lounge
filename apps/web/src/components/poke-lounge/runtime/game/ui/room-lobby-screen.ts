import type { AiDifficulty } from "@poke-lounge/battle/ai-difficulty";
import type { TournamentStateRoomPayload } from "../network/tournament-projection";

export type RoomLobbyMutation =
  "ready" | "start" | "ai-add" | "ai-difficulty" | "ai-remove" | "ai-fill" | null;

export interface RoomLobbyViewState {
  participantCount: number;
  ownReady: boolean;
  ownPartyReady: boolean;
  isHost: boolean;
  readyDisabled: boolean;
  startDisabledReason: "connection" | "ready" | "mutation" | "humans" | null;
}

export interface RoomLobbyRuntimeState {
  projection: TournamentStateRoomPayload;
  privateRoomAccessCode?: string;
  onSetReady(ready: boolean): Promise<void>;
  onStart(): Promise<void>;
  onAddAi(): Promise<void>;
  onChangeAiFillEnabled?(enabled: boolean): Promise<void>;
  onChangeAiDifficulty(aiPlayerId: string, difficulty: AiDifficulty): Promise<void>;
  onRemoveAi(aiPlayerId: string): Promise<void>;
}

export function createRoomLobbyViewState(
  projection: TournamentStateRoomPayload,
  mutation: RoomLobbyMutation = null,
): RoomLobbyViewState {
  const participants = projection.participants.filter(function filterItem(participant) {
    return participant.role === "participant";
  });
  const ownParticipant = participants.find(function findItem(participant) {
    return participant.playerId === projection.ownPlayerId;
  });
  const startDisabledReason =
    mutation !== null
      ? "mutation"
      : projection.aiFillEnabled === false &&
          participants.filter(p => p.controller !== "ai" && p.connected).length < 2
        ? "humans"
        : participants.some(function testItem(participant) {
              return !participant.connected;
            })
          ? "connection"
          : participants.some(function testItem(participant) {
                return !participant.ready;
              })
            ? "ready"
            : null;

  return {
    participantCount: participants.length,
    ownReady: ownParticipant?.ready ?? false,
    ownPartyReady: ownParticipant?.partyReady ?? false,
    isHost: projection.hostPlayerId === projection.ownPlayerId,
    readyDisabled: mutation !== null || !ownParticipant?.connected,
    startDisabledReason,
  };
}
