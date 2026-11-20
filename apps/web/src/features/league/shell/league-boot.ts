import { fetchAccountSession } from "@/components/poke-lounge/runtime/game/network/account-session";
import { consumeAgentLoginLink, hasAgentLoginLink } from "../agent/agent-auto-login";
import { getStatus } from "../api/league";

export function startLeagueBoot() {
  // Both reads must see the new cookie when an agent login link is being consumed.
  const login = consumeAgentLoginLink();
  const status = login.then(async () => ({
    value: await getStatus(),
    receivedAt: performance.now(),
  }));
  const account = login.then(() => fetchAccountSession());
  // Status errors take precedence; account may reject before status finishes.
  void account.catch(() => {});
  return { status, account, login };
}

let prepared: { request: ReturnType<typeof startLeagueBoot>; startedAt: number } | null = null;

export function prepareLeagueBoot() {
  const entry = { request: startLeagueBoot(), startedAt: performance.now() };
  prepared = entry;
  const discard = () => {
    if (prepared === entry) prepared = null;
  };
  void Promise.all([entry.request.status, entry.request.account]).catch(discard);
  return discard;
}

export function takeLeagueBoot() {
  const entry = prepared;
  prepared = null;
  // Only the imminent lobby navigation may consume these reads, once.
  if (entry && !hasAgentLoginLink() && performance.now() - entry.startedAt < 3000)
    return entry.request;
  return startLeagueBoot();
}
