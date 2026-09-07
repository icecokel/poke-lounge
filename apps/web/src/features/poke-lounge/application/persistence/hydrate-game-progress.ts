import type { PokeLoungeSaveSnapshot } from "@/features/poke-lounge/contracts/save-state";
import { hasSamePokeLoungeLocalProgress } from "@/features/poke-lounge/domain/persistence/save-conflict";

export type HydrationOutcome =
  | { kind: "cancelled" }
  | { kind: "anonymous" }
  | { kind: "identity-error" }
  | { kind: "local-fallback" }
  | { kind: "conflict"; accountId: string; revision: number; snapshot: PokeLoungeSaveSnapshot }
  | { kind: "ready"; accountId: string; revision: number; flushLocal: boolean };
export interface HydrationPorts {
  selectAnonymousScope(): void;
  selectAccountScope(accountId: string): boolean;
  load(
    token: string,
  ): Promise<
    | { success: true; snapshot: PokeLoungeSaveSnapshot | null; revision: number }
    | { success: false }
  >;
  readLocal(): PokeLoungeSaveSnapshot;
  hydrate(snapshot: PokeLoungeSaveSnapshot): void;
  isCurrent(): boolean;
}
export async function hydrateGameProgress(
  input: {
    authenticated: boolean;
    accountId: string | null | undefined;
    token: string | undefined;
    mode?: "initial" | "retry";
  },
  ports: HydrationPorts,
): Promise<HydrationOutcome> {
  if (!ports.isCurrent()) return { kind: "cancelled" };
  if (!input.authenticated) {
    ports.selectAnonymousScope();
    return { kind: "anonymous" };
  }
  if (!input.accountId || !input.token) {
    ports.selectAnonymousScope();
    return { kind: "identity-error" };
  }
  const restored = input.mode === "retry" ? true : ports.selectAccountScope(input.accountId);
  const result = await ports.load(input.token);
  if (!ports.isCurrent()) return { kind: "cancelled" };
  if (!result.success) return { kind: "local-fallback" };
  if (result.snapshot) {
    if (restored && !hasSamePokeLoungeLocalProgress(ports.readLocal(), result.snapshot))
      return {
        kind: "conflict",
        accountId: input.accountId,
        revision: result.revision,
        snapshot: result.snapshot,
      };
    if (input.mode !== "retry") ports.hydrate(result.snapshot);
  }
  return {
    kind: "ready",
    accountId: input.accountId,
    revision: result.revision,
    flushLocal: input.mode === "retry" || (!result.snapshot && restored),
  };
}
