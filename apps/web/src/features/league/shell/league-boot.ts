import { fetchAccountSession } from "@/components/poke-lounge/runtime/game/network/account-session";
import { consumeAgentLoginLink } from "../agent/agent-auto-login";
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
