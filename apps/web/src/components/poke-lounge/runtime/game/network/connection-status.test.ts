import assert from "node:assert/strict";
import test from "node:test";
import { createLocalPreviewRoom, type RoomEvent } from "./localPreviewRoom";
import { createWebRtcRoom } from "./webRtcRoom";

type ConnectionStatus = RoomEvent["CONNECTION_STATUS"]["connectionStatus"];

test("로컬 방은 connect와 dispose transport 상태를 순서대로 알린다", () => {
  const room = createLocalPreviewRoom({
    roomId: "LOCAL1",
    sessionId: "local-1",
    channelFactory: () => createBroadcastChannelFixture(),
  });
  const statuses: ConnectionStatus[] = [];
  room.on("CONNECTION_STATUS", ({ connectionStatus }) => statuses.push(connectionStatus));

  room.connect();
  assert.deepEqual(statuses, ["connecting", "online"]);

  const replayed: ConnectionStatus[] = [];
  room.on("CONNECTION_STATUS", ({ connectionStatus }) => replayed.push(connectionStatus));
  assert.deepEqual(replayed, ["online"]);

  room.dispose();
  assert.deepEqual(statuses, ["connecting", "online", "offline"]);
  assert.deepEqual(replayed, ["online", "offline"]);
});

test("WebRTC 방은 data channel open과 close를 연결 상태로 알린다", async () => {
  const channel = createDataChannelFixture();
  const room = createWebRtcRoom({
    roomId: "WEBRTC1",
    sessionId: "webrtc-1",
    peerConnectionFactory: () => ({
      iceGatheringState: "complete",
      localDescription: null,
      createDataChannel: () => channel.dataChannel,
      createOffer: async () => ({ type: "offer", sdp: "offer-sdp" }),
      createAnswer: async () => ({ type: "answer", sdp: "answer-sdp" }),
      setLocalDescription: () => undefined,
      setRemoteDescription: () => undefined,
      close: () => undefined,
      addEventListener: () => undefined,
    }),
  });
  const statuses: ConnectionStatus[] = [];
  room.on("CONNECTION_STATUS", ({ connectionStatus }) => statuses.push(connectionStatus));

  room.connect();
  assert.deepEqual(statuses, ["connecting"]);

  await room.createOfferSignal();
  channel.open();
  assert.deepEqual(statuses, ["connecting", "online"]);

  channel.closeFromPeer();
  assert.deepEqual(statuses, ["connecting", "online", "offline"]);
  room.dispose();
});

function createBroadcastChannelFixture(): BroadcastChannel {
  return {
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    postMessage: () => undefined,
    close: () => undefined,
  } as unknown as BroadcastChannel;
}

function createDataChannelFixture() {
  const listeners = new Map<"open" | "message" | "close", Set<EventListener>>();
  let readyState: RTCDataChannelState = "connecting";
  const dispatch = (type: "open" | "close") => {
    for (const listener of listeners.get(type) ?? []) {
      listener({ type } as Event);
    }
  };
  const dataChannel = {
    get readyState() {
      return readyState;
    },
    send: () => undefined,
    close() {
      readyState = "closed";
      dispatch("close");
    },
    addEventListener(type: "open" | "message" | "close", listener: EventListener) {
      const eventListeners = listeners.get(type) ?? new Set<EventListener>();
      eventListeners.add(listener);
      listeners.set(type, eventListeners);
    },
  };

  return {
    dataChannel,
    open() {
      readyState = "open";
      dispatch("open");
    },
    closeFromPeer() {
      readyState = "closed";
      dispatch("close");
    },
  };
}
