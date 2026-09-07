export type LobbyCommand = "ready" | "start" | "ai-add" | "ai-remove";
export interface LobbyCommandState {
  pending: LobbyCommand | null;
  failed: boolean;
}
/** A synchronous command lock is independent of React batching or a particular input device. */
export function createLobbyCommandRunner(onChange: (state: LobbyCommandState) => void) {
  let disposed = false;
  let pending: LobbyCommand | null = null;
  return {
    async run(kind: LobbyCommand, action: () => Promise<void>): Promise<void> {
      if (disposed || pending) return;
      pending = kind;
      onChange({ pending, failed: false });
      let failed = false;
      try {
        await action();
      } catch {
        failed = true;
      } finally {
        pending = null;
        if (!disposed) onChange({ pending, failed });
      }
    },
    dispose(): void {
      disposed = true;
    },
  };
}
