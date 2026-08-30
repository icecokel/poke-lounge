import { ApiError, apiClient } from "@/lib/api-client";
import {
  parsePokeLoungeSaveSnapshot,
  type PokeLoungeSaveSnapshot,
} from "@/components/poke-lounge/runtime/game/state/poke-lounge-save-snapshot";

export interface PokeLoungeStateSaveRequest {
  state: object;
  expectedRevision: number;
  clientUpdatedAt?: string;
}

export type PokeLoungeStateSaveResult =
  | { success: true; revision: number }
  | {
      success: false;
      conflict?: boolean;
      skipped?: boolean;
      requiresAuth?: boolean;
      unavailable?: boolean;
      status?: number;
      message?: string;
    };

export interface PokeLoungeStateServiceDependencies {
  put?: (
    endpoint: string,
    body?: unknown,
    options?: { token?: string; keepalive?: boolean; signal?: AbortSignal },
  ) => Promise<unknown>;
  get?: (endpoint: string, options?: { token?: string; signal?: AbortSignal }) => Promise<unknown>;
  requestTimeoutMs?: number;
}

export interface PokeLoungeStateSaveOptions {
  keepalive?: boolean;
}

export type LoadPokeLoungeStateResult =
  | { success: true; snapshot: PokeLoungeSaveSnapshot | null; revision: number }
  | { success: false; requiresAuth?: boolean; unavailable: true; message: string };

const POKE_LOUNGE_STATE_REQUEST_TIMEOUT_MS = 10_000;

export async function loadPokeLoungeState(
  token: string,
  dependencies: PokeLoungeStateServiceDependencies = {},
): Promise<LoadPokeLoungeStateResult> {
  if (!token) {
    return {
      success: false,
      requiresAuth: true,
      unavailable: true,
      message: "로그인이 필요합니다.",
    };
  }

  try {
    const get =
      dependencies.get ??
      ((endpoint: string, options?: { token?: string; signal?: AbortSignal }) =>
        apiClient.get<unknown>(endpoint, options));
    const response = await withRequestTimeout(
      signal => get("/game/poke-lounge/state", { token, signal }),
      dependencies.requestTimeoutMs,
    );

    const responseRecord = unwrapResponseRecord(response);
    const revision = parseRevision(responseRecord.revision);
    if (revision === null) {
      return {
        success: false,
        unavailable: true,
        message: "저장된 Poke Lounge revision 형식이 올바르지 않습니다.",
      };
    }

    const snapshotValue = responseRecord.state;
    if (snapshotValue === null || snapshotValue === undefined) {
      return {
        success: false,
        unavailable: true,
        message: "저장된 Poke Lounge 상태가 응답에 없습니다.",
      };
    }

    const snapshot = parsePokeLoungeSaveSnapshot(snapshotValue);
    if (!snapshot) {
      return {
        success: false,
        unavailable: true,
        message: "저장된 Poke Lounge 상태 형식이 올바르지 않습니다.",
      };
    }

    return { success: true, snapshot, revision };
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return { success: true, snapshot: null, revision: 0 };
    }

    if (error instanceof ApiError) {
      return {
        success: false,
        requiresAuth: error.status === 401,
        unavailable: true,
        message: error.message,
      };
    }

    return {
      success: false,
      unavailable: true,
      message: "네트워크 오류로 저장 상태를 불러오지 못했습니다.",
    };
  }
}

export async function savePokeLoungeState(
  request: PokeLoungeStateSaveRequest,
  token?: string,
  dependencies: PokeLoungeStateServiceDependencies = {},
  options: PokeLoungeStateSaveOptions = {},
): Promise<PokeLoungeStateSaveResult> {
  if (!token) {
    return {
      success: false,
      skipped: true,
      requiresAuth: true,
    };
  }

  try {
    const put =
      dependencies.put ??
      ((
        endpoint: string,
        body?: unknown,
        requestOptions?: { token?: string; keepalive?: boolean; signal?: AbortSignal },
      ) => apiClient.put<unknown>(endpoint, body, requestOptions));

    const response = await withRequestTimeout(
      signal =>
        put("/game/poke-lounge/state", request, {
          token,
          signal,
          ...(options.keepalive ? { keepalive: true } : {}),
        }),
      dependencies.requestTimeoutMs,
    );
    const revision = parseRevision(unwrapResponseRecord(response).revision);
    if (revision === null) {
      return {
        success: false,
        unavailable: true,
        message: "서버가 올바른 Poke Lounge revision을 반환하지 않았습니다.",
      };
    }

    return { success: true, revision };
  } catch (error) {
    if (error instanceof ApiError) {
      return {
        success: false,
        status: error.status,
        conflict: error.status === 409,
        requiresAuth: error.status === 401,
        unavailable: error.status !== 401,
        message: error.message,
      };
    }

    return {
      success: false,
      unavailable: true,
      message: "네트워크 오류가 발생했습니다.",
    };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function unwrapResponseRecord(value: unknown): Record<string, unknown> {
  const unwrapped = isRecord(value) && isRecord(value.data) ? value.data : value;

  return isRecord(unwrapped) ? unwrapped : {};
}

function parseRevision(value: unknown): number | null {
  return Number.isSafeInteger(value) && (value as number) >= 0 ? (value as number) : null;
}

async function withRequestTimeout<T>(
  request: (signal: AbortSignal) => Promise<T>,
  timeoutMs = POKE_LOUNGE_STATE_REQUEST_TIMEOUT_MS,
): Promise<T> {
  const controller = new AbortController();
  let timeoutHandle: ReturnType<typeof globalThis.setTimeout> | null = null;
  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutHandle = globalThis.setTimeout(() => {
      controller.abort();
      reject(new Error("Poke Lounge state request timed out"));
    }, timeoutMs);
  });

  try {
    return await Promise.race([request(controller.signal), timeout]);
  } finally {
    if (timeoutHandle !== null) {
      globalThis.clearTimeout(timeoutHandle);
    }
  }
}
