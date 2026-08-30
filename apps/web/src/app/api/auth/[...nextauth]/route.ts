import { handlers } from "@/auth";
import {
  LOCAL_TEST_MODE_COOKIE_NAME,
  createLocalTestAccountSession,
  isLocalTestAccountAvailable,
} from "@/lib/local-test-account";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export const GET = async (request: NextRequest): Promise<Response> => {
  const noStoreHeaders = { "Cache-Control": "private, no-cache, no-store" };
  const localTestSession = createLocalTestAccountSession(
    request.nextUrl,
    request.cookies.get(LOCAL_TEST_MODE_COOKIE_NAME)?.value,
  );

  if (!localTestSession) {
    if (
      request.nextUrl.pathname === "/api/auth/session" &&
      !process.env.AUTH_SECRET &&
      isLocalTestAccountAvailable(request.nextUrl)
    ) {
      return NextResponse.json(null, { headers: noStoreHeaders });
    }

    return handlers.GET(request);
  }

  return NextResponse.json(localTestSession, {
    headers: noStoreHeaders,
  });
};

export const POST = handlers.POST;
