import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { getJwtExpiresAt, isIdTokenUsable } from "@/lib/auth-token";

// 토큰 갱신 함수
async function refreshAccessToken(refreshToken: string) {
  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.AUTH_GOOGLE_ID!,
        client_secret: process.env.AUTH_GOOGLE_SECRET!,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    });

    const tokens = await response.json();

    if (!response.ok) {
      throw new Error(tokens.error || "Failed to refresh token");
    }

    return {
      accessToken: tokens.access_token,
      idToken: tokens.id_token,
      idTokenExpiresAt: getJwtExpiresAt(tokens.id_token),
      expiresAt: Math.floor(Date.now() / 1000) + tokens.expires_in,
      refreshToken: tokens.refresh_token ?? refreshToken,
    };
  } catch {
    return { error: "RefreshAccessTokenError" };
  }
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      authorization: {
        params: {
          prompt: "consent",
          access_type: "offline",
          response_type: "code",
          scope: "openid email profile",
        },
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account }) {
      // 최초 로그인 시 토큰 저장
      if (account) {
        return {
          ...token,
          accessToken: account.access_token,
          idToken: account.id_token,
          idTokenExpiresAt: getJwtExpiresAt(account.id_token),
          refreshToken: account.refresh_token,
          expiresAt: account.expires_at,
        };
      }

      // 토큰이 아직 유효한 경우
      if (Date.now() < (token.expiresAt as number) * 1000) {
        return token;
      }

      // 토큰 만료 - 갱신 시도
      const refreshToken = token.refreshToken;
      if (typeof refreshToken !== "string" || !refreshToken) {
        return { ...token, error: "RefreshAccessTokenError" };
      }

      const refreshed = await refreshAccessToken(refreshToken);

      if ("error" in refreshed) {
        return { ...token, error: refreshed.error };
      }

      return {
        ...token,
        accessToken: refreshed.accessToken,
        expiresAt: refreshed.expiresAt,
        refreshToken: refreshed.refreshToken,
        ...(isIdTokenUsable(refreshed.idToken, refreshed.idTokenExpiresAt)
          ? {
              idToken: refreshed.idToken,
              idTokenExpiresAt: refreshed.idTokenExpiresAt,
              error: undefined,
            }
          : {
              idToken: undefined,
              idTokenExpiresAt: undefined,
              error: "IdTokenUnavailable",
            }),
      };
    },
    async session({ session, token }) {
      const idTokenExpiresAt =
        typeof token.idTokenExpiresAt === "number"
          ? token.idTokenExpiresAt
          : getJwtExpiresAt(token.idToken);
      const idToken = isIdTokenUsable(token.idToken, idTokenExpiresAt) ? token.idToken : undefined;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (session as any).idToken = idToken;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (session as any).idTokenExpiresAt = idToken ? idTokenExpiresAt : undefined;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (session as any).accessToken = token.accessToken;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (session as any).error = idToken ? token.error : (token.error ?? "IdTokenUnavailable");
      return session;
    },
  },
});
