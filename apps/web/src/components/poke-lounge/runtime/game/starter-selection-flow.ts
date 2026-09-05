import type { TournamentStateRoomPayload } from "./network/tournament-projection";

export function shouldSelectStarterAfterRoomStart(
  projection: Pick<TournamentStateRoomPayload, "roomStatus" | "ownPlayerId" | "participants">,
  needsStarter: boolean,
): boolean {
  return (
    needsStarter &&
    projection.roomStatus === "round-started" &&
    projection.participants.some(function isOwnParticipant(participant) {
      return (
        participant.playerId === projection.ownPlayerId &&
        participant.role === "participant" &&
        participant.connected
      );
    })
  );
}
