import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const localTestAuthTokenPattern = /^[A-Za-z0-9_-]{32,128}$/;
const localTestSessionExpiresAt = "2100-01-01T00:00:00.000Z";
const localTestTokenExpiresAt = 4_102_444_800;
const localTestModeCookieMessage = "poke-lounge-local-test-mode";
const localTestModeCookieVersion = "v1";
const localTestModeClockSkewMs = 60_000;
const localTestModeNoncePattern = /^[A-Za-z0-9_-]{22}$/;
const localTestWebHostnames = new Set(["localhost", "127.0.0.1"]);
const localTestApiHostname = "127.0.0.1";

export const LOCAL_TEST_ACCOUNT_ID = "poke-lounge-local-test-user";
export const LOCAL_TEST_MODE_COOKIE_NAME = "poke-lounge-local-test-mode";
export const LOCAL_TEST_MODE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export interface LocalTestAccountEnvironment {
  NODE_ENV?: string;
  LOCAL_TEST_AUTH_TOKEN?: string;
  NEXT_PUBLIC_API_URL?: string;
}

export interface LocalTestAccountSession {
  user: {
    id: string;
    name: string;
    email: string;
  };
  expires: string;
  idToken: string;
  idTokenExpiresAt: number;
  localTestMode: true;
}

export function resolveLocalTestAuthToken(
  environment: LocalTestAccountEnvironment = process.env,
): string | null {
  if (environment.NODE_ENV !== "development") {
    return null;
  }

  const token = environment.LOCAL_TEST_AUTH_TOKEN?.trim();

  if (!token) {
    return null;
  }

  if (!localTestAuthTokenPattern.test(token)) {
    throw new Error(
      "LOCAL_TEST_AUTH_TOKEN must be a 32-128 character alphanumeric, underscore, or hyphen token",
    );
  }

  return token;
}

const isLocalTestWebUrl = (url: URL): boolean =>
  url.protocol === "http:" && localTestWebHostnames.has(url.hostname);

const isLocalTestApiUrl = (url: URL): boolean =>
  url.protocol === "http:" && url.hostname === localTestApiHostname;

const resolveLocalApiUrl = (environment: LocalTestAccountEnvironment): URL | null => {
  const apiUrl = environment.NEXT_PUBLIC_API_URL?.trim();

  if (!apiUrl) {
    return null;
  }

  try {
    return new URL(apiUrl);
  } catch {
    return null;
  }
};

const resolveAvailableLocalTestAuthToken = (
  requestUrl: URL,
  environment: LocalTestAccountEnvironment = process.env,
): string | null => {
  if (!isLocalTestWebUrl(requestUrl)) {
    return null;
  }

  const apiUrl = resolveLocalApiUrl(environment);

  if (!apiUrl || !isLocalTestApiUrl(apiUrl)) {
    return null;
  }

  const token = resolveLocalTestAuthToken(environment);

  if (!token) {
    return null;
  }

  return token;
};

const signLocalTestModeCookiePayload = (token: string, payload: string): string =>
  createHmac("sha256", token)
    .update(`${localTestModeCookieMessage}.${payload}`)
    .digest("base64url");

export function isLocalTestAccountAvailable(
  requestUrl: URL,
  environment: LocalTestAccountEnvironment = process.env,
): boolean {
  return Boolean(resolveAvailableLocalTestAuthToken(requestUrl, environment));
}

export function createLocalTestModeCookieValue(
  requestUrl: URL,
  environment: LocalTestAccountEnvironment = process.env,
  nowMs: number = Date.now(),
  nonce: string = randomBytes(16).toString("base64url"),
): string | null {
  const token = resolveAvailableLocalTestAuthToken(requestUrl, environment);
  if (!token) {
    return null;
  }

  const payload = `${localTestModeCookieVersion}.${Math.trunc(nowMs)}.${nonce}`;
  return `${payload}.${signLocalTestModeCookiePayload(token, payload)}`;
}

export function isLocalTestModeCookieValid(
  requestUrl: URL,
  cookieValue: string | null | undefined,
  environment: LocalTestAccountEnvironment = process.env,
  nowMs: number = Date.now(),
): boolean {
  if (!cookieValue) {
    return false;
  }

  const token = resolveAvailableLocalTestAuthToken(requestUrl, environment);
  const [version, issuedAtValue, nonce, signature, ...unexpectedParts] = cookieValue.split(".");
  if (
    !token ||
    version !== localTestModeCookieVersion ||
    unexpectedParts.length > 0 ||
    !/^\d+$/.test(issuedAtValue ?? "") ||
    !localTestModeNoncePattern.test(nonce ?? "") ||
    !signature
  ) {
    return false;
  }

  const issuedAtMs = Number(issuedAtValue);
  if (
    !Number.isSafeInteger(issuedAtMs) ||
    issuedAtMs > nowMs + localTestModeClockSkewMs ||
    nowMs - issuedAtMs > LOCAL_TEST_MODE_COOKIE_MAX_AGE_SECONDS * 1_000
  ) {
    return false;
  }

  const payload = `${version}.${issuedAtValue}.${nonce}`;
  const expectedSignature = signLocalTestModeCookiePayload(token, payload);
  if (signature.length !== expectedSignature.length) {
    return false;
  }

  return timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
}

export function createLocalTestAccountSession(
  requestUrl: URL,
  cookieValue: string | null | undefined,
  environment: LocalTestAccountEnvironment = process.env,
): LocalTestAccountSession | null {
  if (
    requestUrl.pathname !== "/api/auth/session" ||
    !isLocalTestModeCookieValid(requestUrl, cookieValue, environment)
  ) {
    return null;
  }

  const token = resolveAvailableLocalTestAuthToken(requestUrl, environment);
  if (!token) {
    return null;
  }

  return {
    user: {
      id: LOCAL_TEST_ACCOUNT_ID,
      name: "Poke Lounge Local Tester",
      email: "poke-lounge-local-test-user@local.poke-lounge.test",
    },
    expires: localTestSessionExpiresAt,
    idToken: token,
    idTokenExpiresAt: localTestTokenExpiresAt,
    localTestMode: true,
  };
}
