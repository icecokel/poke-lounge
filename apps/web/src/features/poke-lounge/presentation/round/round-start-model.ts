import { getProjectedRoundStartPosition } from "@/components/poke-lounge/runtime/game/starter-selection-flow";
import type { GameState } from "@/features/poke-lounge/contracts/game-state";
import { getRoundStartCount, isRoundStartBlocked } from "@poke-lounge/battle/round-start";
import type { ReadinessObservation } from "../../application/round/readiness-coordinator";

export function createRoundStartView(state: GameState, nowMs: number) {
  const room = state.tournament.serverProjection;
  if (!room || room.roomStatus !== "round-started") return null;
  const count = getRoundStartCount(room.roomStatus, room.roomRound, nowMs);
  const blocked = isRoundStartBlocked(room.roomStatus, room.roomRound, nowMs);
  const participants = room.participants.filter(p => p.role === "participant");
  const justStarted =
    room.roomRound.startedAtMs !== null &&
    nowMs >= room.roomRound.startedAtMs &&
    nowMs < room.roomRound.startedAtMs + 650;
  if (!blocked && !justStarted) return null;
  return {
    count,
    blocked,
    justStarted,
    pending: room.roomRound.startedAtMs === null,
    ready: participants.filter(p => p.partyReady && p.connected && p.ready).length,
    total: participants.length,
  };
}
export type RoundStartView = NonNullable<ReturnType<typeof createRoundStartView>>;
export function createReadinessObservation(
  state: GameState,
  position: { x: number; y: number },
  visible: boolean,
  choosingStarter: boolean,
): ReadinessObservation {
  const room = state.tournament.serverProjection;
  const own = room?.participants.find(p => p.playerId === room.ownPlayerId);
  if (
    !room ||
    room.roomStatus !== "round-started" ||
    room.roomRound.startedAtMs !== null ||
    !own?.partyReady ||
    !own.connected ||
    own.ready ||
    state.session.connectionStatus !== "online"
  )
    return { key: null, roundIndex: 0, rendered: false };
  const expected = getProjectedRoundStartPosition(room, room.ownPlayerId);
  return {
    key: `${room.roomCode}:${room.roundIndex}:${room.ownPlayerId}`,
    roundIndex: room.roundIndex,
    rendered:
      visible &&
      !choosingStarter &&
      Math.abs(position.x - expected.x) < 1 &&
      Math.abs(position.y - expected.y) < 1,
  };
}
