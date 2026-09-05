import { getSessionApiAccountId, getSessionApiIdToken, type ApiTokenSession } from "./auth-token";
import { isLocalTestModeUrl } from "../components/poke-lounge/runtime/game/local-test-mode";

export interface LocalTestSessionOptions {
  currentUrl: URL;
  environment: string | undefined;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}

/** Production play never waits for an account/session endpoint. */
export async function loadLocalTestSession({
  currentUrl,
  environment,
  signal,
  fetchImpl = globalThis.fetch,
}: LocalTestSessionOptions): Promise<ApiTokenSession | null> {
  if (environment !== "development" || !isLocalTestModeUrl(currentUrl)) return null;
  try {
    const response = await fetchImpl(new URL("/api/local-test-mode/session", currentUrl.origin), {
      cache: "no-store",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
      signal,
    });
    if (!response.ok) return null;
    const session: unknown = await response.json();
    if (!session || typeof session !== "object" || Array.isArray(session)) return null;
    const candidate = session as ApiTokenSession;
    const token = getSessionApiIdToken(candidate, Date.now(), { allowLocalTestMode: true });
    return token && getSessionApiAccountId(candidate, token) ? candidate : null;
  } catch {
    // A disabled or unreachable developer test endpoint must not block anonymous play.
    return null;
  }
}
