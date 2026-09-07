"use client";
import {
  createLobbyCommandRunner,
  type LobbyCommand,
  type LobbyCommandState,
} from "@/features/poke-lounge/application/lobby/lobby-command-runner";
import { useEffect, useRef, useState } from "react";
export function useRoomLobbyCommands() {
  const [state, setState] = useState<LobbyCommandState>({ pending: null, failed: false });
  const runner = useRef<ReturnType<typeof createLobbyCommandRunner> | null>(null);
  useEffect(() => {
    runner.current = createLobbyCommandRunner(setState);
    return () => {
      runner.current?.dispose();
      runner.current = null;
    };
  }, []);
  return {
    mutation: state.pending,
    failed: state.failed,
    runMutation: (kind: LobbyCommand, action: () => Promise<void>) =>
      runner.current?.run(kind, action),
  };
}
