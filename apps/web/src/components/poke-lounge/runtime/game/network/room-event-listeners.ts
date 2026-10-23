import type { RoomEvent, RoomMessage, MultiplayerRoom } from "./local-preview-room";

type Handler<T extends RoomMessage> = (payload: RoomEvent[T]) => void;

export function createRoomEventListeners() {
  const handlers = new Map<RoomMessage, Set<Handler<RoomMessage>>>();
  let connectionStatus: RoomEvent["CONNECTION_STATUS"]["connectionStatus"] = "offline";
  let connectionStatusAnnounced = false;

  const emit = <T extends RoomMessage>(type: T, payload: RoomEvent[T]) => {
    for (const handler of handlers.get(type) ?? []) {
      handler(payload as RoomEvent[RoomMessage]);
    }
  };

  const emitConnectionStatus = (nextStatus: RoomEvent["CONNECTION_STATUS"]["connectionStatus"]) => {
    if (connectionStatusAnnounced && connectionStatus === nextStatus) {
      return;
    }

    connectionStatus = nextStatus;
    connectionStatusAnnounced = true;
    emit("CONNECTION_STATUS", { connectionStatus });
  };

  const on: MultiplayerRoom["on"] = (type, handler) => {
    const typedHandler = handler as Handler<RoomMessage>;
    const nextHandlers = handlers.get(type) ?? new Set<Handler<RoomMessage>>();
    nextHandlers.add(typedHandler);
    handlers.set(type, nextHandlers);
    if (type === "CONNECTION_STATUS" && connectionStatusAnnounced) {
      typedHandler({ connectionStatus } as RoomEvent[RoomMessage]);
    }
    return function callback() {
      nextHandlers.delete(typedHandler);
    };
  };

  return { emit, emitConnectionStatus, on, clear: () => handlers.clear() };
}
