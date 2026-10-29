import { getApiBaseUrl } from "@/lib/constants";

export class LeagueApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly detail: unknown,
    readonly retryable: boolean,
  ) {
    super(code);
  }
}

export const LEAGUE_RETRYABLE_CODES: ReadonlySet<string> = new Set([
  "LEAGUE_JUDGE_UNAVAILABLE",
  "LEAGUE_BUSY",
  "LEAGUE_UNAVAILABLE",
  "BACKEND_UNAVAILABLE",
  "NETWORK",
]);

export async function leagueRequest<T>(
  path: string,
  init?: {
    method?: "GET" | "POST" | "PUT";
    body?: unknown;
    signal?: AbortSignal;
    keepalive?: boolean;
  },
): Promise<T> {
  const url = `${getApiBaseUrl()}/league/v1${path}`;
  const body = JSON.stringify(init?.body);
  let response: Response;
  try {
    response = await fetch(url, {
      method: init?.method ?? "GET",
      credentials: "include",
      cache: "no-store",
      headers: body !== undefined ? { "content-type": "application/json" } : undefined,
      body,
      signal: init?.signal,
      keepalive: init?.keepalive,
    });
  } catch (error) {
    if (init?.signal?.aborted || (error instanceof Error && error.name === "AbortError"))
      throw error;
    throw new LeagueApiError(0, "NETWORK", undefined, true);
  }

  let envelope: unknown;
  try {
    envelope = await response.json();
  } catch (error) {
    if (init?.signal?.aborted || (error instanceof Error && error.name === "AbortError"))
      throw error;
  }
  if (envelope && typeof envelope === "object" && "success" in envelope) {
    if (envelope.success === true && "data" in envelope) return envelope.data as T;
    if (
      envelope.success === false &&
      "statusCode" in envelope &&
      typeof envelope.statusCode === "number" &&
      "code" in envelope &&
      typeof envelope.code === "string"
    ) {
      const { success, statusCode, code, message, detail, ...rest } = envelope as Record<
        string,
        unknown
      >;
      throw new LeagueApiError(
        envelope.statusCode,
        envelope.code,
        detail ?? (Object.keys(rest).length ? rest : undefined),
        LEAGUE_RETRYABLE_CODES.has(envelope.code),
      );
    }
  }
  const retryable = response.status >= 500 && response.status < 600;
  throw new LeagueApiError(
    response.status,
    retryable ? "NETWORK" : `HTTP_${response.status}`,
    undefined,
    retryable,
  );
}

export async function withLeagueRetry<T>(
  run: () => Promise<T>,
  options?: {
    attempts?: number;
    baseMs?: number;
    onRetry?: (attempt: number, error: LeagueApiError) => void;
  },
): Promise<T> {
  const attempts = options?.attempts ?? 5;
  const baseMs = options?.baseMs ?? 1000;
  for (let attempt = 1; ; attempt++) {
    try {
      return await run();
    } catch (error) {
      if (
        !(error instanceof LeagueApiError) ||
        !error.retryable ||
        error.status === 429 ||
        attempt > attempts
      )
        throw error;
      options?.onRetry?.(attempt, error);
      await new Promise(resolve => setTimeout(resolve, baseMs * 2 ** (attempt - 1)));
    }
  }
}
