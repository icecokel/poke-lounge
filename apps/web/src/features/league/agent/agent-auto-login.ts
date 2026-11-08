import { leagueRequest } from "../api/core";

let pending: Promise<unknown> | null = null;

function linkParams() {
  return new URLSearchParams(window.location.hash.slice(1));
}

export function hasAgentLoginLink(): boolean {
  return linkParams().has("t");
}

/**
 * `#t=<token>&a=<n>` logs this browser straight into a test account. The fragment never reaches
 * the server, and it leaves the address bar before the request so it cannot linger in screenshots
 * or history. Resolves to the login error, if any. Boot can run twice for one link (React's
 * development double effect), so concurrent callers share one request.
 */
export function consumeAgentLoginLink(): Promise<unknown> {
  const params = linkParams();
  const token = params.get("t");
  if (token === null) return pending ?? Promise.resolve(null);
  const slot = params.get("a") ?? "1";
  window.history.replaceState(
    window.history.state,
    "",
    window.location.pathname + window.location.search,
  );
  const login = leagueRequest("/agent/login", {
    method: "POST",
    body: { token, account: /^\d{1,2}$/.test(slot) ? Number(slot) : 0 },
  }).then(
    () => null,
    (error: unknown) => error,
  );
  pending = login;
  void login.finally(() => {
    if (pending === login) pending = null;
  });
  return login;
}
