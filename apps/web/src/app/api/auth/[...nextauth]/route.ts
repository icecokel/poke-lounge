import {
  LOCAL_TEST_MODE_COOKIE_NAME,
  createLocalTestAccountSession,
} from "@/lib/local-test-account";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export const GET = async (request: NextRequest): Promise<Response> => {
  const noStoreHeaders = { "Cache-Control": "private, no-cache, no-store" };
  if (request.nextUrl.pathname !== "/api/auth/session") {
    return NextResponse.json({ error: "Not found" }, { status: 404, headers: noStoreHeaders });
  }

  return NextResponse.json(
    createLocalTestAccountSession(
      request.nextUrl,
      request.cookies.get(LOCAL_TEST_MODE_COOKIE_NAME)?.value,
    ),
    { headers: noStoreHeaders },
  );
};
