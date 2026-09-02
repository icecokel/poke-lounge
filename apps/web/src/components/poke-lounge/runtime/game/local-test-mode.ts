const LOCAL_TEST_MODE_ENDPOINT = "/api/local-test-mode";
export const LOCAL_TEST_MODE_START_QUERY_PARAM = "localTest";

const localTestWebHostnames = new Set(["localhost", "127.0.0.1"]);
const multiplayerSearchParams = [
  "create",
  "quick",
  "network",
  "room",
  "roundMs",
  "serverPlayerId",
  "serverSessionId",
] as const;

export interface LocalTestModeState {
  available: boolean;
  active: boolean;
}

type LocalTestModeFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const unavailableLocalTestModeState = (): LocalTestModeState => ({
  available: false,
  active: false,
});

export function resolveLocalTestModeState(
  capabilityState: LocalTestModeState,
  sessionActive: boolean,
): LocalTestModeState {
  return sessionActive
    ? {
        available: true,
        active: true,
      }
    : capabilityState;
}

export function isLocalTestModeUrl(url: URL): boolean {
  return url.protocol === "http:" && localTestWebHostnames.has(url.hostname);
}

const createLocalTestModeEndpointUrl = (currentUrl: URL): URL =>
  new URL(LOCAL_TEST_MODE_ENDPOINT, currentUrl.origin);

export async function loadLocalTestModeState(
  currentUrl: URL,
  fetchImpl: LocalTestModeFetch = globalThis.fetch,
): Promise<LocalTestModeState> {
  if (!isLocalTestModeUrl(currentUrl)) {
    return unavailableLocalTestModeState();
  }

  try {
    const response = await fetchImpl(createLocalTestModeEndpointUrl(currentUrl), {
      cache: "no-store",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      return unavailableLocalTestModeState();
    }

    const body: unknown = await response.json();
    if (!body || typeof body !== "object") {
      return unavailableLocalTestModeState();
    }

    const available = "available" in body && body.available === true;
    const active = available && "active" in body && body.active === true;
    return { available, active };
  } catch {
    return unavailableLocalTestModeState();
  }
}

const updateLocalTestMode = async (
  currentUrl: URL,
  method: "POST" | "DELETE",
  fetchImpl: LocalTestModeFetch,
): Promise<void> => {
  if (!isLocalTestModeUrl(currentUrl)) {
    throw new Error("Local test mode is only available on a loopback URL");
  }

  const response = await fetchImpl(createLocalTestModeEndpointUrl(currentUrl), {
    body: "{}",
    cache: "no-store",
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Poke-Lounge-Local-Test-Mode": "1",
    },
    method,
  });
  if (!response.ok) {
    throw new Error(`Local test mode request failed with status ${response.status}`);
  }
};

export async function activateLocalTestMode(
  currentUrl: URL,
  fetchImpl: LocalTestModeFetch = globalThis.fetch,
): Promise<void> {
  return updateLocalTestMode(currentUrl, "POST", fetchImpl);
}

export async function deactivateLocalTestMode(
  currentUrl: URL,
  fetchImpl: LocalTestModeFetch = globalThis.fetch,
): Promise<void> {
  return updateLocalTestMode(currentUrl, "DELETE", fetchImpl);
}

export function createLocalTestModeSoloUrl(currentUrl: URL): URL {
  const soloUrl = new URL(currentUrl.href);
  multiplayerSearchParams.forEach(function visitItem(searchParam) {
    return soloUrl.searchParams.delete(searchParam);
  });
  soloUrl.searchParams.delete(LOCAL_TEST_MODE_START_QUERY_PARAM);
  return soloUrl;
}

export function createLocalTestModeStartUrl(currentUrl: URL): URL {
  const startUrl = createLocalTestModeSoloUrl(currentUrl);
  startUrl.searchParams.set(LOCAL_TEST_MODE_START_QUERY_PARAM, "1");
  return startUrl;
}
