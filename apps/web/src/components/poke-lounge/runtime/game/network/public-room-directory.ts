import { getApiBaseUrl } from "@/lib/constants";
import { createDiagnosticRequestId, reportClientDiagnostic } from "@/lib/client-diagnostics";
import {
  normalizeRoomCode,
  normalizeRoomInstanceId,
  normalizeRoomRoundDurationMs,
  type RoomRoundDurationMs,
} from "./room-entry";

export type PublicRoomStatus = "waiting" | "round-started" | "tournament" | "completed" | "closed";

export interface PublicRoomSummary {
  roomCode: string;
  roomInstanceId: string;
  status: PublicRoomStatus;
  revision: number;
  participantCount: number;
  humanParticipantCount: number;
  maxParticipants: number;
  roundDurationMs: RoomRoundDurationMs;
  createdAtMs: number;
  updatedAtMs: number;
  expiresAtMs: number;
  joinable: boolean;
}

interface PublicRoomListEnvelope {
  success: true;
  data: {
    rooms: PublicRoomSummary[];
  };
}

const PUBLIC_ROOM_STATUSES = new Set<PublicRoomStatus>([
  "waiting",
  "round-started",
  "tournament",
  "completed",
  "closed",
]);

export async function fetchPublicRooms(signal?: AbortSignal): Promise<PublicRoomSummary[]> {
  const requestId = createDiagnosticRequestId();
  let response: Response;
  try {
    response = await fetch(`${getApiBaseUrl()}/poke-lounge/rooms/public`, {
      method: "GET",
      cache: "no-store",
      headers: { "X-Request-Id": requestId },
      signal,
    });
  } catch (error) {
    if (!signal?.aborted) {
      reportClientDiagnostic({ kind: "api", code: "NETWORK_ERROR", requestId });
    }
    throw error;
  }

  if (!response.ok) {
    if (response.status >= 500) {
      reportClientDiagnostic({ kind: "api", code: `HTTP_${response.status}`, requestId });
    }
    throw new Error(`공개방 목록 요청 실패 (${response.status})`);
  }

  try {
    const payload: unknown = await response.json();
    return parsePublicRoomListEnvelope(payload).data.rooms;
  } catch (error) {
    reportClientDiagnostic({ kind: "api", code: "INVALID_RESPONSE", requestId });
    throw error;
  }
}

function parsePublicRoomListEnvelope(value: unknown): PublicRoomListEnvelope {
  if (!isRecord(value) || value.success !== true || !isRecord(value.data)) {
    throw new Error("공개방 목록 응답 형식이 올바르지 않습니다.");
  }

  const roomsValue = value.data.rooms;
  if (!Array.isArray(roomsValue)) {
    throw new Error("공개방 목록 응답에 rooms가 없습니다.");
  }

  return {
    success: true,
    data: {
      rooms: roomsValue.map(parsePublicRoomSummary),
    },
  };
}

function parsePublicRoomSummary(value: unknown): PublicRoomSummary {
  if (!isRecord(value)) {
    throw new Error("공개방 정보 형식이 올바르지 않습니다.");
  }

  const roomCode = typeof value.roomCode === "string" ? normalizeRoomCode(value.roomCode) : null;
  const roomInstanceId = normalizeRoomInstanceId(value.roomInstanceId);
  const status =
    typeof value.status === "string" && PUBLIC_ROOM_STATUSES.has(value.status as PublicRoomStatus)
      ? (value.status as PublicRoomStatus)
      : null;
  const roundDurationMs = normalizeRoomRoundDurationMs(value.roundDurationMs);

  if (
    !roomCode ||
    !roomInstanceId ||
    !status ||
    roundDurationMs === null ||
    typeof value.revision !== "number" ||
    !Number.isSafeInteger(value.revision) ||
    value.revision < 0 ||
    !isNonNegativeInteger(value.participantCount) ||
    !isNonNegativeInteger(value.humanParticipantCount) ||
    !isPositiveInteger(value.maxParticipants) ||
    value.participantCount > value.maxParticipants ||
    value.humanParticipantCount > value.participantCount ||
    !isNonNegativeInteger(value.createdAtMs) ||
    !isNonNegativeInteger(value.updatedAtMs) ||
    !isNonNegativeInteger(value.expiresAtMs) ||
    typeof value.joinable !== "boolean"
  ) {
    throw new Error("공개방 정보에 유효하지 않은 값이 있습니다.");
  }

  return {
    roomCode,
    roomInstanceId,
    status,
    revision: value.revision,
    participantCount: value.participantCount,
    humanParticipantCount: value.humanParticipantCount,
    maxParticipants: value.maxParticipants,
    roundDurationMs,
    createdAtMs: value.createdAtMs,
    updatedAtMs: value.updatedAtMs,
    expiresAtMs: value.expiresAtMs,
    joinable: value.joinable,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}
