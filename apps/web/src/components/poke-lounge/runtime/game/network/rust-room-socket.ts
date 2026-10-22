import {
  captureClientDiagnosticFailure,
  recordClientBreadcrumb,
  reportClientDiagnostic,
} from "@/lib/client-diagnostics";

/** Transport for the Rust authority. No gameplay decisions live in this adapter. */
type Listener = (() => void) | ((payload: unknown) => void);
interface SocketAdapter {
  readonly connected: boolean;
  readonly io: { engine: { transport: { name: string } } };
  on(event: string, listener: Listener): SocketAdapter;
  off(event: string, listener: Listener): SocketAdapter;
  emit(event: string, payload: unknown): SocketAdapter;
  connect(): SocketAdapter;
  disconnect(): SocketAdapter;
}

export function createRustRoomSocket(baseUrl: string): SocketAdapter {
  const url = new URL(`${baseUrl.replace(/\/$/, "")}/ws`);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.search = "";
  const listeners = new Map<string, Set<Listener>>();
  let socket: WebSocket | null = null;
  let disposed = false;
  let sendFailureReported = false;
  let attempt = 0;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let openTimer: ReturnType<typeof setTimeout> | null = null;
  const notify = (event: string, payload?: unknown) => {
    for (const listener of listeners.get(event) ?? []) listener(payload);
  };
  const clearOpenTimer = () => {
    if (openTimer !== null) clearTimeout(openTimer);
    openTimer = null;
  };
  const schedule = () => {
    if (disposed || retryTimer !== null) return;
    const delay = Math.min(8_000, 500 * 2 ** Math.min(attempt++, 4));
    retryTimer = setTimeout(() => {
      retryTimer = null;
      connect();
    }, delay);
  };
  const connect = () => {
    if (disposed) return;
    let current: WebSocket;
    try {
      current = new WebSocket(url);
    } catch (error) {
      recordClientBreadcrumb("socket.constructor_failed", { stage: "socket", causeType: "socket" });
      const snapshot = captureClientDiagnosticFailure(error, {
        stage: "socket",
        causeType: "socket",
      });
      reportClientDiagnostic({ kind: "room", code: "WS_CONSTRUCTOR_FAILED", error, snapshot });
      notify("connect_error");
      schedule();
      return;
    }
    socket = current;
    openTimer = setTimeout(() => {
      if (socket === current && current.readyState === WebSocket.CONNECTING) {
        recordClientBreadcrumb("socket.open_timeout", { stage: "socket", causeType: "timeout" });
        current.close();
      }
    }, 10_000);
    current.onopen = () => {
      if (disposed || socket !== current) return;
      clearOpenTimer();
      notify("connect");
    };
    current.onmessage = event => {
      if (
        disposed ||
        socket !== current ||
        typeof event.data !== "string" ||
        event.data.length > 8 * 1024 * 1024
      )
        return;
      let frame: unknown;
      try {
        frame = JSON.parse(event.data) as unknown;
      } catch (error) {
        recordClientBreadcrumb("socket.frame_parse_failed", {
          stage: "socket",
          causeType: "json_parse",
        });
        const snapshot = captureClientDiagnosticFailure(error, {
          stage: "socket",
          causeType: "json_parse",
        });
        reportClientDiagnostic({ kind: "room", code: "WS_FRAME_PARSE_FAILED", error, snapshot });
        current.close(1002);
        return;
      }
      if (
        !frame ||
        typeof frame !== "object" ||
        !("event" in frame) ||
        typeof frame.event !== "string" ||
        !("payload" in frame)
      ) {
        recordClientBreadcrumb("socket.frame_schema_failed", {
          stage: "socket",
          causeType: "schema",
        });
        reportClientDiagnostic({ kind: "room", code: "WS_FRAME_SCHEMA_FAILED" });
        current.close(1002);
        return;
      }
      if (frame.event === "room.snapshot") attempt = 0;
      if (frame.event === "server.draining" || frame.event === "room.expired") {
        current.close(1000);
        return;
      }
      notify(frame.event, frame.payload);
    };
    current.onerror = () => {
      if (!disposed && socket === current) {
        // WebSocket exposes no HTTP status or underlying network cause here.
        recordClientBreadcrumb("socket.error", { stage: "socket", causeType: "socket" });
        notify("connect_error");
      }
    };
    current.onclose = event => {
      if (socket !== current) return;
      clearOpenTimer();
      socket = null;
      if (disposed) return;
      recordClientBreadcrumb("socket.closed." + event.code);
      notify("disconnect");
      schedule();
    };
  };
  const adapter: SocketAdapter = {
    get connected() {
      return socket?.readyState === WebSocket.OPEN;
    },
    io: { engine: { transport: { name: "websocket" } } },
    on(event, listener) {
      let group = listeners.get(event);
      if (!group) listeners.set(event, (group = new Set()));
      group.add(listener);
      return adapter;
    },
    off(event, listener) {
      listeners.get(event)?.delete(listener);
      return adapter;
    },
    emit(event, payload) {
      const current = socket;
      if (!current || current.readyState !== WebSocket.OPEN || disposed) return adapter;
      // Do not queue stale movement or replay commands when a connection is replaced.
      if (current.bufferedAmount > 64 * 1024) {
        current.close(1000);
        return adapter;
      }
      try {
        current.send(JSON.stringify({ event, payload }));
      } catch (error) {
        // A socket adapter reports only its first send exception, including across reconnects.
        if (!sendFailureReported) {
          sendFailureReported = true;
          recordClientBreadcrumb("socket.send_failed", { stage: "socket", causeType: "socket" });
          const snapshot = captureClientDiagnosticFailure(error, {
            stage: "socket",
            causeType: "socket",
          });
          reportClientDiagnostic({
            kind: "room",
            code: "WS_SEND_FAILED",
            error,
            snapshot,
            priority: "background",
          });
        }
        current.close();
      }
      return adapter;
    },
    connect() {
      onOnline();
      return adapter;
    },
    disconnect() {
      disposed = true;
      if (retryTimer !== null) clearTimeout(retryTimer);
      retryTimer = null;
      clearOpenTimer();
      const old = socket;
      socket = null;
      old?.close(1000);
      listeners.clear();
      window.removeEventListener("online", onOnline);
      return adapter;
    },
  };
  const onOnline = () => {
    if (disposed || adapter.connected) return;
    if (retryTimer !== null) clearTimeout(retryTimer);
    retryTimer = null;
    const old = socket;
    socket = null;
    clearOpenTimer();
    old?.close();
    connect();
  };
  window.addEventListener("online", onOnline);
  // Match socket.io: listeners are attached by the caller before connect fires.
  queueMicrotask(connect);
  return adapter;
}
