import { isRoundStartBlocked, getRoundStartPosition } from "@poke-lounge/battle/round-start";
import type { TournamentStateRoomPayload } from "./network/tournament-projection";

export function isWaitingForStarterSelections(
  projection: Pick<TournamentStateRoomPayload, "roomStatus" | "roomRound"> | null,
): boolean {
  return (
    projection?.roomStatus === "round-started" &&
    projection.roomRound.startedAtMs === null &&
    projection.roomRound.endsAtMs === null
  );
}

export function getProjectedRoundStartPosition(
  projection: Pick<TournamentStateRoomPayload, "participants">,
  playerId: string,
) {
  const participant = projection.participants.find(p => p.playerId === playerId);
  return (
    participant?.startPosition ??
    getRoundStartPosition(
      playerId,
      projection.participants.filter(p => p.role === "participant").map(p => p.playerId),
    )
  );
}

export function isWaitingForRoundStart(
  projection: Pick<TournamentStateRoomPayload, "roomStatus" | "roomRound"> | null,
  nowMs: number,
): boolean {
  return Boolean(
    projection && isRoundStartBlocked(projection.roomStatus, projection.roomRound, nowMs),
  );
}

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
