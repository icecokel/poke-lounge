export const AUTH_SESSION_ERRORS_REQUIRING_LOGIN = new Set([
  "RefreshAccessTokenError",
  "IdTokenUnavailable",
]);

const ID_TOKEN_EXPIRY_BUFFER_SECONDS = 60;

export type ApiTokenSession = {
  user?: { id?: unknown } | null;
  idToken?: unknown;
  idTokenExpiresAt?: unknown;
  localTestMode?: unknown;
  accessToken?: unknown;
  error?: unknown;
};

export interface SessionApiTokenOptions {
  allowLocalTestMode?: boolean;
}

const decodeBase64Url = (value: string): string => {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(value, "base64url").toString("utf8");
  }

  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
  return globalThis.atob(padded);
};

export const getJwtExpiresAt = (token?: unknown): number | undefined => {
  const payload = getJwtPayload(token);
  return typeof payload?.exp === "number" ? payload.exp : undefined;
};

export const getJwtSubject = (token?: unknown): string | undefined => {
  const payload = getJwtPayload(token);
  return typeof payload?.sub === "string" && payload.sub.trim() ? payload.sub : undefined;
};

export const getSessionApiAccountId = (
  session?: ApiTokenSession | null,
  idToken?: unknown,
): string | undefined => {
  const tokenSubject = getJwtSubject(idToken);
  if (tokenSubject) {
    return tokenSubject;
  }

  return typeof session?.user?.id === "string" && session.user.id.trim()
    ? session.user.id
    : undefined;
};

export const isIdTokenUsable = (
  idToken?: unknown,
  idTokenExpiresAt?: unknown,
  nowMs: number = Date.now(),
): idToken is string => {
  if (typeof idToken !== "string" || !idToken) return false;

  const expiresAt =
    typeof idTokenExpiresAt === "number" ? idTokenExpiresAt : getJwtExpiresAt(idToken);
  if (typeof expiresAt !== "number") return false;

  return nowMs < (expiresAt - ID_TOKEN_EXPIRY_BUFFER_SECONDS) * 1000;
};

export const isAuthSessionError = (error?: unknown): boolean =>
  typeof error === "string" && AUTH_SESSION_ERRORS_REQUIRING_LOGIN.has(error);

export const getSessionApiIdToken = (
  session?: ApiTokenSession | null,
  nowMs: number = Date.now(),
  options: SessionApiTokenOptions = {},
): string | undefined => {
  if (
    !session ||
    isAuthSessionError(session.error) ||
    (session.localTestMode === true && options.allowLocalTestMode !== true)
  ) {
    return undefined;
  }

  return isIdTokenUsable(session.idToken, session.idTokenExpiresAt, nowMs)
    ? session.idToken
    : undefined;
};

function getJwtPayload(token?: unknown): Record<string, unknown> | undefined {
  if (typeof token !== "string") return undefined;

  const [, payload] = token.split(".");
  if (!payload) return undefined;

  try {
    const decoded: unknown = JSON.parse(decodeBase64Url(payload));
    return typeof decoded === "object" && decoded !== null && !Array.isArray(decoded)
      ? (decoded as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}
