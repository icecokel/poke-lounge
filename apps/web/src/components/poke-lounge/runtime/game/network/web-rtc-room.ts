import { createRoomEventListeners } from "./room-event-listeners";
import { PEER_RELAYED_ROOM_MESSAGES, isTournamentRoomMessage } from "./room-messages";
import type { MultiplayerRoom, RoomEvent, RoomMessage } from "./local-preview-room";
import { normalizeTournamentRoomPayload } from "./tournament-room-protocol";

type WebRtcSignalType = "offer" | "answer";

interface WebRtcSignal {
  type: WebRtcSignalType;
  sdp: string;
}

interface WebRtcDataChannelLike {
  readyState: RTCDataChannelState;
  send(data: string): void;
  close(): void;
  addEventListener?(type: "open" | "message" | "close", listener: EventListener): void;
  onopen?: ((event: Event) => void) | null;
  onmessage?: ((event: MessageEvent<string>) => void) | null;
  onclose?: ((event: Event) => void) | null;
}

interface WebRtcPeerConnectionLike {
  iceGatheringState?: RTCIceGatheringState;
  localDescription?: RTCSessionDescriptionInit | null;
  createDataChannel(label: string): WebRtcDataChannelLike;
  createOffer(): Promise<RTCSessionDescriptionInit>;
  createAnswer(): Promise<RTCSessionDescriptionInit>;
  setLocalDescription(description: RTCSessionDescriptionInit): Promise<void> | void;
  setRemoteDescription(description: RTCSessionDescriptionInit): Promise<void> | void;
  close(): void;
  addEventListener?(type: "datachannel" | "icegatheringstatechange", listener: EventListener): void;
  ondatachannel?: ((event: RTCDataChannelEvent) => void) | null;
  onicegatheringstatechange?: ((event: Event) => void) | null;
}

export interface WebRtcRoomOptions {
  roomId?: string;
  sessionId?: string;
  peerConnectionFactory?: () => WebRtcPeerConnectionLike;
  peerConnectionConfig?: RTCConfiguration;
  dataChannelLabel?: string;
}

export interface WebRtcRoom extends MultiplayerRoom {
  createOfferSignal(): Promise<string>;
  acceptOfferSignal(offerText: string): Promise<string>;
  acceptAnswerSignal(answerText: string): Promise<void>;
}

export function createWebRtcRoom(options: WebRtcRoomOptions = {}): WebRtcRoom {
  const sessionId = options.sessionId ?? `webrtc-${Math.random().toString(16).slice(2, 6)}`;
  const peerConnection = createPeerConnection(options);
  const { emit, emitConnectionStatus, on, clear: clearEventListeners } = createRoomEventListeners();
  const queuedMessages: string[] = [];
  let dataChannel: WebRtcDataChannelLike | null = null;
  let connected = false;
  let disposed = false;

  const flushQueuedMessages = () => {
    if (dataChannel?.readyState !== "open") {
      return;
    }

    const messages = queuedMessages.splice(0);
    for (const message of messages) {
      try {
        dataChannel.send(message);
      } catch {
        // Sending can fail during channel teardown; room sends should remain best-effort.
      }
    }
  };

  const attachDataChannel = (channel: WebRtcDataChannelLike) => {
    dataChannel = channel;

    const handleOpen = () => {
      if (connected) {
        emitConnectionStatus("online");
        emit("CURRENT_PLAYERS", { players: {} });
      }
      flushQueuedMessages();
    };
    const handleClose = () => {
      if (connected) {
        emitConnectionStatus("offline");
      }
    };
    const handleMessage = (event: MessageEvent<string>) => {
      dispatchDataChannelMessage(event.data, emit);
    };

    if (channel.addEventListener) {
      channel.addEventListener("open", handleOpen);
      channel.addEventListener("message", handleMessage as EventListener);
      channel.addEventListener("close", handleClose);
    } else {
      channel.onopen = handleOpen;
      channel.onmessage = handleMessage;
      channel.onclose = handleClose;
    }

    flushQueuedMessages();
  };

  const ensureOfferDataChannel = () => {
    if (!dataChannel) {
      attachDataChannel(
        peerConnection.createDataChannel(options.dataChannelLabel ?? "poke-lounge"),
      );
    }
  };

  const handleRemoteDataChannel = (event: Event) => {
    const { channel } = event as RTCDataChannelEvent;
    attachDataChannel(channel);
  };

  if (peerConnection.addEventListener) {
    peerConnection.addEventListener("datachannel", handleRemoteDataChannel);
  } else {
    peerConnection.ondatachannel = handleRemoteDataChannel;
  }

  return {
    sessionId,
    roomId: options.roomId ?? "webrtc",
    setLobbyReady: async () => undefined,
    startChampionship: async () => undefined,
    addAiParticipant: async () => undefined,
    setAiDifficulty: async () => undefined,
    removeAiParticipant: async () => undefined,
    connect() {
      connected = true;
      emitConnectionStatus(dataChannel?.readyState === "open" ? "online" : "connecting");
    },
    async createOfferSignal() {
      ensureOfferDataChannel();

      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      await waitForIceGatheringComplete(peerConnection);

      return serializeSignal("offer", peerConnection.localDescription ?? offer);
    },
    async acceptOfferSignal(offerText: string) {
      const offer = parseSignal(offerText, "offer");

      await peerConnection.setRemoteDescription(offer);

      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      await waitForIceGatheringComplete(peerConnection);

      return serializeSignal("answer", peerConnection.localDescription ?? answer);
    },
    async acceptAnswerSignal(answerText: string) {
      const answer = parseSignal(answerText, "answer");

      await peerConnection.setRemoteDescription(answer);
    },
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;

      if (connected && dataChannel?.readyState === "open") {
        try {
          dataChannel.send(
            JSON.stringify({
              type: "PLAYER_LEFT" satisfies RoomMessage,
              payload: { sessionId },
            }),
          );
        } catch {
          // Leaving is best-effort; closing should continue even if the peer is gone.
        }
      }

      try {
        dataChannel?.close();
      } catch {
        // Disposal should be idempotent and safe during connection teardown.
      }

      peerConnection.close();

      if (connected) {
        emit("PLAYER_LEFT", { sessionId });
      }

      emitConnectionStatus("offline");
      clearEventListeners();
      queuedMessages.splice(0);
      connected = false;
    },
    send(type, payload) {
      const message = JSON.stringify({ type, payload });

      if (dataChannel?.readyState === "open") {
        try {
          dataChannel.send(message);
        } catch {
          // Sending is best-effort; callers should not have to catch channel races.
        }
        return;
      }

      if (!dataChannel || dataChannel.readyState === "connecting") {
        queuedMessages.push(message);
      }
    },
    on,
  };
}

export function isWebRtcRoom(room: MultiplayerRoom): room is WebRtcRoom {
  const candidate = room as Partial<WebRtcRoom>;

  return (
    typeof candidate.createOfferSignal === "function" &&
    typeof candidate.acceptOfferSignal === "function" &&
    typeof candidate.acceptAnswerSignal === "function"
  );
}

function createPeerConnection(options: WebRtcRoomOptions): WebRtcPeerConnectionLike {
  if (options.peerConnectionFactory) {
    return options.peerConnectionFactory();
  }

  if (typeof RTCPeerConnection === "undefined") {
    throw new Error("RTCPeerConnection is not available in this browser");
  }

  return new RTCPeerConnection(options.peerConnectionConfig);
}

function parseSignal(text: string, expectedType: WebRtcSignalType): WebRtcSignal {
  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`Invalid WebRTC ${expectedType} signal JSON`);
  }

  if (
    !parsed ||
    typeof parsed !== "object" ||
    (parsed as Partial<WebRtcSignal>).type !== expectedType ||
    typeof (parsed as Partial<WebRtcSignal>).sdp !== "string"
  ) {
    throw new Error(`Expected WebRTC ${expectedType} signal`);
  }

  return {
    type: expectedType,
    sdp: (parsed as WebRtcSignal).sdp,
  };
}

function serializeSignal(type: WebRtcSignalType, description: RTCSessionDescriptionInit): string {
  return JSON.stringify({
    type,
    sdp: description.sdp ?? "",
  });
}

async function waitForIceGatheringComplete(
  peerConnection: WebRtcPeerConnectionLike,
): Promise<void> {
  if (
    peerConnection.iceGatheringState === undefined ||
    peerConnection.iceGatheringState === "complete"
  ) {
    return;
  }

  await new Promise<void>(function resolvePromise(resolve) {
    const handleStateChange = () => {
      if (peerConnection.iceGatheringState === "complete") {
        resolve();
      }
    };

    if (peerConnection.addEventListener) {
      peerConnection.addEventListener("icegatheringstatechange", handleStateChange);
    } else {
      peerConnection.onicegatheringstatechange = handleStateChange;
    }

    handleStateChange();
  });
}

function dispatchDataChannelMessage(
  data: string,
  emit: <T extends RoomMessage>(type: T, payload: RoomEvent[T]) => void,
): void {
  let message: unknown;

  try {
    message = JSON.parse(data);
  } catch {
    return;
  }

  if (
    !message ||
    typeof message !== "object" ||
    !PEER_RELAYED_ROOM_MESSAGES.has((message as { type?: RoomMessage }).type as RoomMessage)
  ) {
    return;
  }

  const { type, payload } = message as {
    type: RoomMessage;
    payload: RoomEvent[RoomMessage];
  };

  if (isTournamentRoomMessage(type)) {
    const normalizedPayload = normalizeTournamentRoomPayload(type, payload);

    if (normalizedPayload) {
      emit(type, normalizedPayload as RoomEvent[typeof type]);
    }

    return;
  }

  emit(type, payload as RoomEvent[typeof type]);
}
