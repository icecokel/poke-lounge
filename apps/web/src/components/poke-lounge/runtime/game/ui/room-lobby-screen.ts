import type { TournamentStateRoomPayload } from "../network/tournament-projection";

export type RoomLobbyMutation = "ready" | "start" | null;

export interface RoomLobbyViewState {
  participantCount: number;
  ownReady: boolean;
  ownPartyReady: boolean;
  isHost: boolean;
  readyDisabled: boolean;
  startDisabledReason: "connection" | "party" | "ready" | "mutation" | null;
}

export interface RoomLobbyRuntimeState {
  projection: TournamentStateRoomPayload;
  onSetReady(ready: boolean): Promise<void>;
  onStart(): Promise<void>;
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
      : participants.some(function testItem(participant) {
            return !participant.connected;
          })
        ? "connection"
        : participants.some(function testItem(participant) {
              return !participant.partyReady;
            })
          ? "party"
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
    readyDisabled: mutation !== null || !ownParticipant?.connected || !ownParticipant.partyReady,
    startDisabledReason,
  };
}
