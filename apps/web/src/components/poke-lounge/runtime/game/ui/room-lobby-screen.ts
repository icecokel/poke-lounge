import type { TournamentStateRoomPayload } from "../network/tournament-projection";

export type RoomLobbyMutation = "ready" | "start" | null;

export interface RoomLobbyViewState {
  participantCount: number;
  ownReady: boolean;
  ownPartyReady: boolean;
  isHost: boolean;
  readyDisabled: boolean;
  startDisabledReason: "players" | "connection" | "party" | "ready" | "mutation" | null;
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
  const participants = projection.participants.filter(
    participant => participant.role === "participant",
  );
  const ownParticipant = participants.find(
    participant => participant.playerId === projection.ownPlayerId,
  );
  const startDisabledReason =
    mutation !== null
      ? "mutation"
      : participants.length < 2
        ? "players"
        : participants.some(participant => !participant.connected)
          ? "connection"
          : participants.some(participant => !participant.partyReady)
            ? "party"
            : participants.some(participant => !participant.ready)
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
