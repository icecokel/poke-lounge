import { getApiBaseUrl } from "@/lib/constants";

export interface AccountUser {
  id: string;
  displayName: string;
}

export interface AccountSession {
  discordEnabled: boolean;
  user: AccountUser | null;
}

/** The API returns here with this fragment when a Discord login did not complete. */
export const DISCORD_LOGIN_FAILED_HASH = "#discord-login-failed";

// The session is an httpOnly cookie on the API host, so every call must send credentials.
export async function fetchAccountSession(signal?: AbortSignal): Promise<AccountSession> {
  const response = await fetch(`${getApiBaseUrl()}/auth/me`, {
    method: "GET",
    cache: "no-store",
    credentials: "include",
    signal,
  });
  if (!response.ok) {
    throw new Error(`계정 확인 실패 (${response.status})`);
  }
  const session = parseAccountSession(await response.json());
  if (!session) {
    throw new Error("계정 응답 형식 오류");
  }
  return session;
}

export async function logoutAccount(): Promise<void> {
  const response = await fetch(`${getApiBaseUrl()}/auth/logout`, {
    method: "POST",
    cache: "no-store",
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error(`로그아웃 실패 (${response.status})`);
  }
}

export function getDiscordLoginUrl(returnTo: string): string {
  return `${getApiBaseUrl()}/auth/discord/start?returnTo=${encodeURIComponent(returnTo)}`;
}

function parseAccountSession(value: unknown): AccountSession | null {
  if (!isRecord(value) || value.success !== true || !isRecord(value.data)) {
    return null;
  }
  const { providers, user } = value.data;
  if (!Array.isArray(providers)) {
    return null;
  }
  if (user === null) {
    return { discordEnabled: providers.includes("discord"), user: null };
  }
  if (!isRecord(user) || typeof user.id !== "string" || typeof user.displayName !== "string") {
    return null;
  }
  return {
    discordEnabled: providers.includes("discord"),
    user: { id: user.id, displayName: user.displayName },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
