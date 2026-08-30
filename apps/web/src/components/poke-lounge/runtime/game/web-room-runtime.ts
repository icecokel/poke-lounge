import type {
  CompetitiveRoomProjectionEvent,
  MultiplayerRoom,
  PlayerSnapshot,
  RoomEvent,
  RoomUnsubscribe,
} from "./network/localPreviewRoom";
import {
  clonePlayerSnapshot,
  createLocalPlayerSnapshot,
  toRemotePlayerState,
} from "./network/player-room-snapshot";
import type { TournamentStateRoomPayload } from "./network/tournament-projection";
import type { GameStateStore } from "./state/gameStateStore";

export interface WebRoomRuntimeOptions {
  gameStateStore: GameStateStore;
  room: MultiplayerRoom;
  onCompetitiveAssignment?(event: CompetitiveRoomProjectionEvent): void;
  onCompetitiveState?(event: CompetitiveRoomProjectionEvent): void;
  onCompetitiveActionFailed?(event: RoomEvent["COMPETITIVE_ACTION_FAILED"]): void;
  onTournamentState?(state: TournamentStateRoomPayload): void;
}

export interface WebRoomRuntime {
  dispose(): void;
  leave(): Promise<void>;
}

export function startWebRoomRuntime({
  gameStateStore,
  onCompetitiveActionFailed,
  onCompetitiveAssignment,
  onCompetitiveState,
  onTournamentState,
  room,
}: WebRoomRuntimeOptions): WebRoomRuntime {
  const unsubscribers: RoomUnsubscribe[] = [];
  const remoteSnapshots = new Map<string, PlayerSnapshot>();
  let disposed = false;

  const mapRoomParticipantId = (playerId: string): string => {
    if (playerId === room.sessionId) {
      return gameStateStore.getState().currentPlayerId;
    }

    const localPlayersById = gameStateStore.getState().playersById;
    const collidingRemoteSnapshot = [...remoteSnapshots.values()].find(snapshot => {
      const snapshotPlayerId = snapshot.playerId?.trim() || snapshot.sessionId;

      return snapshotPlayerId === playerId && Object.hasOwn(localPlayersById, playerId);
    });

    return collidingRemoteSnapshot?.sessionId ?? playerId;
  };

  const upsertRemotePlayer = (snapshot: PlayerSnapshot) => {
    if (snapshot.sessionId === room.sessionId) {
      return;
    }

    remoteSnapshots.set(snapshot.sessionId, clonePlayerSnapshot(snapshot));
    gameStateStore.upsertRemotePlayer(toRemotePlayerState(snapshot));
  };

  const removeRemotePlayer = (sessionId: string) => {
    remoteSnapshots.delete(sessionId);
    gameStateStore.removeRemotePlayer(sessionId);
  };

  unsubscribers.push(
    room.on("CONNECTION_STATUS", ({ connectionStatus }) => {
      gameStateStore.setSession({
        sessionId: room.sessionId,
        roomId: room.roomId,
        connectionStatus,
      });
    }),
    room.on("CURRENT_PLAYERS", ({ players }) => {
      Object.values(players).forEach(upsertRemotePlayer);
    }),
    room.on("PLAYER_JOINED", upsertRemotePlayer),
    room.on("PLAYER_MOVED", upsertRemotePlayer),
    room.on("PLAYER_MOVEMENT_ENDED", upsertRemotePlayer),
    room.on("PLAYER_CHANGED_MAP", upsertRemotePlayer),
    room.on("PLAYER_LEFT", ({ sessionId }) => removeRemotePlayer(sessionId)),
    room.on("TOURNAMENT_STATE", payload => {
      const applied = gameStateStore.applyTournamentSnapshotFromRoom(payload, Date.now());
      if (applied.ok) {
        onTournamentState?.(payload);
      }
    }),
    room.on("TOURNAMENT_STARTED", payload => {
      gameStateStore.applyTournamentStartedFromRoom(
        {
          ...payload,
          participantIds: payload.participantIds.map(mapRoomParticipantId),
        },
        Date.now(),
      );
    }),
    room.on("TOURNAMENT_MATCH_RESULT", payload => {
      const state = gameStateStore.getState();
      if (
        state.tournament.session?.roundIndex === payload.roundIndex &&
        state.tournament.session.status === "in-progress"
      ) {
        gameStateStore.recordTournamentMatchResult(
          payload.matchId,
          mapRoomParticipantId(payload.winnerPlayerId),
          Date.now(),
        );
      }
    }),
    room.on("TOURNAMENT_COMPLETED", payload => {
      gameStateStore.applyTournamentCompletedFromRoom(
        {
          ...payload,
          championPlayerId: mapRoomParticipantId(payload.championPlayerId),
          standings: payload.standings.map(standing => ({
            ...standing,
            playerId: mapRoomParticipantId(standing.playerId),
          })),
        },
        Date.now(),
      );
    }),
    room.on("ROUND_SCORE_UPDATED", payload => {
      gameStateStore.applyRoundScoreUpdatedFromRoom({
        ...payload,
        playerId: mapRoomParticipantId(payload.playerId),
      });
    }),
    room.on("COMPETITIVE_ASSIGNMENT", event => onCompetitiveAssignment?.(event)),
    room.on("COMPETITIVE_STATE", event => onCompetitiveState?.(event)),
    room.on("COMPETITIVE_ACTION_FAILED", event => onCompetitiveActionFailed?.(event)),
  );

  const createSnapshot = () => {
    const player = gameStateStore.getCurrentLocalPlayer();
    return createLocalPlayerSnapshot(room.sessionId, player, player.position);
  };
  let lastSnapshotKey = JSON.stringify(createSnapshot());

  gameStateStore.setSession({
    sessionId: room.sessionId,
    roomId: room.roomId,
    connectionStatus: "connecting",
  });
  room.connect(createSnapshot());
  unsubscribers.push(
    gameStateStore.subscribe(() => {
      if (disposed) {
        return;
      }

      const snapshot = createSnapshot();
      const snapshotKey = JSON.stringify(snapshot);
      if (snapshotKey === lastSnapshotKey) {
        return;
      }

      lastSnapshotKey = snapshotKey;
      room.send("PLAYER_CHANGED_MAP", snapshot);
    }),
  );

  const dispose = () => {
    if (disposed) {
      return;
    }

    disposed = true;
    unsubscribers.splice(0).forEach(unsubscribe => unsubscribe());
    remoteSnapshots.forEach(snapshot => gameStateStore.removeRemotePlayer(snapshot.sessionId));
    remoteSnapshots.clear();
    room.dispose();
    gameStateStore.setSession({
      sessionId: null,
      roomId: null,
      connectionStatus: "offline",
    });
  };

  return {
    dispose,
    async leave() {
      await room.leave?.();
      dispose();
    },
  };
}
