import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";

const headers = { "Cache-Control": "private, no-cache, no-store" };
const sessionPattern = /^[a-f0-9]{64}$/;

export async function POST(request: NextRequest): Promise<Response> {
  const token = process.env.LEAGUE_TEST_LOGIN_TOKEN;
  let apiUrl: URL;
  try {
    apiUrl = new URL(process.env.NEXT_PUBLIC_API_URL ?? "");
  } catch {
    return NextResponse.json({ error: "unavailable" }, { status: 404, headers });
  }
  if (
    process.env.NODE_ENV !== "development" ||
    !token ||
    !/^[A-Za-z0-9_-]{32,128}$/.test(token) ||
    request.nextUrl.protocol !== "http:" ||
    request.nextUrl.hostname !== "localhost" ||
    apiUrl.protocol !== "http:" ||
    apiUrl.hostname !== "localhost"
  ) {
    return NextResponse.json({ error: "unavailable" }, { status: 404, headers });
  }
  if (
    request.headers.get("origin") !== request.nextUrl.origin ||
    request.headers.get("host") !== request.nextUrl.host ||
    request.headers.get("x-poke-lounge-league-test") !== "1" ||
    request.headers.get("content-type")?.split(";", 1)[0]?.trim() !== "application/json"
  ) {
    return NextResponse.json({ error: "same-origin request required" }, { status: 403, headers });
  }
  const failed = (error = "LEAGUE_TEST_LOGIN_UNAVAILABLE") =>
    NextResponse.json({ error }, { status: 502, headers });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return failed("LEAGUE_TEST_ACCOUNT_INVALID");
  }
  if (
    !body ||
    typeof body !== "object" ||
    !("account" in body) ||
    Object.keys(body).length !== 1 ||
    typeof body.account !== "number" ||
    !Number.isInteger(body.account) ||
    body.account < 1 ||
    body.account > 8
  ) {
    return failed("LEAGUE_TEST_ACCOUNT_INVALID");
  }
  const previous = request.cookies.get("pl_session")?.value;
  apiUrl.hostname = "127.0.0.1";
  try {
    const upstream = await fetch(new URL("/league/v1/test/login", apiUrl), {
      method: "POST",
      headers: { "content-type": "application/json", "x-league-test-token": token },
      body: JSON.stringify({
        account: body.account,
        ...(previous && sessionPattern.test(previous) ? { previous } : {}),
      }),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(8000),
    });
    const envelope = (await upstream.json()) as {
      success?: boolean;
      code?: unknown;
      data?: { sessionToken?: unknown; maxAgeS?: unknown; user?: { displayName?: unknown } };
    } | null;
    if (!upstream.ok || envelope?.success !== true) {
      return failed(
        typeof envelope?.code === "string" && /^LEAGUE_[A-Z_]+$/.test(envelope.code)
          ? envelope.code
          : undefined,
      );
    }
    const data = envelope.data;
    if (
      typeof data?.sessionToken !== "string" ||
      !sessionPattern.test(data.sessionToken) ||
      data.maxAgeS !== 2592000 ||
      typeof data.user?.displayName !== "string"
    ) {
      return failed();
    }
    const response = NextResponse.json(
      { ok: true, displayName: data.user.displayName },
      { headers },
    );
    response.cookies.set("pl_session", data.sessionToken, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: data.maxAgeS,
    });
    return response;
  } catch {
    return failed();
  }
}
