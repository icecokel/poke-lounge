import {
  LOCAL_TEST_MODE_COOKIE_MAX_AGE_SECONDS,
  LOCAL_TEST_MODE_COOKIE_NAME,
  createLocalTestModeCookieValue,
  isLocalTestAccountAvailable,
  isLocalTestModeCookieValid,
} from "@/lib/local-test-account";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const noStoreHeaders = {
  "Cache-Control": "private, no-cache, no-store",
  "X-Content-Type-Options": "nosniff",
} as const;

const readFirstForwardedHeaderValue = (value: string | null): string | null =>
  value?.split(",", 1)[0]?.trim() || null;

const isSameOriginMutation = (request: NextRequest): boolean => {
  const origin = request.headers.get("origin");
  const requestHost =
    readFirstForwardedHeaderValue(request.headers.get("x-forwarded-host")) ??
    request.headers.get("host") ??
    request.nextUrl.host;
  const requestProtocol =
    readFirstForwardedHeaderValue(request.headers.get("x-forwarded-proto")) ??
    request.nextUrl.protocol.replace(/:$/, "");

  if (!origin) {
    return false;
  }

  try {
    const originUrl = new URL(origin);
    return (
      originUrl.host === requestHost &&
      originUrl.protocol === `${requestProtocol}:` &&
      request.headers.get("x-poke-lounge-local-test-mode") === "1" &&
      request.headers.get("content-type")?.startsWith("application/json") === true
    );
  } catch {
    return false;
  }
};

export async function GET(request: NextRequest): Promise<Response> {
  const available = isLocalTestAccountAvailable(request.nextUrl);
  const active =
    available &&
    isLocalTestModeCookieValid(
      request.nextUrl,
      request.cookies.get(LOCAL_TEST_MODE_COOKIE_NAME)?.value,
    );

  return NextResponse.json(
    { available, active },
    {
      headers: noStoreHeaders,
    },
  );
}

export async function POST(request: NextRequest): Promise<Response> {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json(
      { active: false, error: "same-origin request required" },
      { status: 403, headers: noStoreHeaders },
    );
  }

  const cookieValue = createLocalTestModeCookieValue(request.nextUrl);
  if (!cookieValue) {
    return NextResponse.json(
      { active: false, error: "local test mode unavailable" },
      { status: 404, headers: noStoreHeaders },
    );
  }

  const response = NextResponse.json(
    { active: true },
    {
      headers: noStoreHeaders,
    },
  );
  response.cookies.set(LOCAL_TEST_MODE_COOKIE_NAME, cookieValue, {
    httpOnly: true,
    maxAge: LOCAL_TEST_MODE_COOKIE_MAX_AGE_SECONDS,
    path: "/api",
    sameSite: "strict",
  });

  return response;
}

export async function DELETE(request: NextRequest): Promise<Response> {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json(
      { active: true, error: "same-origin request required" },
      { status: 403, headers: noStoreHeaders },
    );
  }

  const response = NextResponse.json(
    { active: false },
    {
      headers: noStoreHeaders,
    },
  );
  response.cookies.set(LOCAL_TEST_MODE_COOKIE_NAME, "", {
    httpOnly: true,
    maxAge: 0,
    path: "/api",
    sameSite: "strict",
  });

  return response;
}
