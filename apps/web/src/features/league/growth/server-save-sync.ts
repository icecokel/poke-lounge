import { LeagueApiError } from "../api/core";
import { loadLeagueSave, uploadLeagueSave } from "../api/growth";
import {
  readLeagueSave,
  parseLeagueSave,
  type LeagueSaveEnvelope,
  type LeagueSaveStorage,
} from "./league-save";

export function reconcileLeagueSave(
  local: LeagueSaveEnvelope | null,
  remote: { rev: number; data: LeagueSaveEnvelope } | null,
  runId: string,
  userId: string,
): { save: LeagueSaveEnvelope | null; conflict: LeagueSaveEnvelope | null } {
  const server = remote ? parseLeagueSave(remote.data, runId, userId) : null;
  if (remote && !server) throw new Error("LEAGUE_SAVE_INVALID");
  if (server && remote) {
    server.serverRev = remote.rev;
    server.dirty = false;
  }
  if (!local) return { save: server, conflict: null };
  if (!server || !remote) return { save: { ...local, serverRev: 0, dirty: true }, conflict: null };
  if (local.serverRev === remote.rev) return { save: local, conflict: null };
  return local.dirty ? { save: local, conflict: server } : { save: server, conflict: null };
}
export function startServerSaveSync(
  storage: LeagueSaveStorage,
  onStatus: (status: string) => void,
  onConflict: (remote: LeagueSaveEnvelope) => void,
  onRunClosed: () => void,
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastUpload = 0;
  let busy = false;
  let stopped = false;
  let paused = false;
  let conflicting = false;
  async function readConflict() {
    try {
      const snapshot = storage.getEnvelope();
      const remote = await loadLeagueSave(snapshot.runId);
      if (stopped) return;
      const data =
        remote.save && parseLeagueSave(remote.save.data, snapshot.runId, snapshot.userId);
      if (data && remote.save) {
        data.serverRev = remote.save.rev;
        data.dirty = false;
        onConflict(data);
      } else onStatus("error");
    } catch {
      if (!stopped) onStatus("error");
    }
  }
  async function flush(keepalive = false) {
    if (stopped || paused || busy || !storage.getEnvelope().dirty) return;
    if (!keepalive && Date.now() - lastUpload < 30000) {
      schedule();
      return;
    }
    busy = true;
    lastUpload = Date.now();
    const snapshot = structuredClone(storage.getEnvelope());
    onStatus("saving");
    try {
      const result = await uploadLeagueSave(
        snapshot.runId,
        snapshot.serverRev,
        snapshot,
        keepalive,
      );
      if (
        stopped &&
        readLeagueSave(snapshot.runId, snapshot.userId)?.rev !== storage.getEnvelope().rev
      )
        return;
      storage.acknowledge(result.rev, snapshot.rev);
      if (!stopped) onStatus("saved");
    } catch (error) {
      if (stopped) return;
      if (error instanceof LeagueApiError && error.code === "LEAGUE_RUN_NOT_ACTIVE") {
        paused = true;
        onRunClosed();
      } else if (error instanceof LeagueApiError && error.code === "LEAGUE_SAVE_CONFLICT") {
        paused = true;
        conflicting = true;
        await readConflict();
      } else {
        if (error instanceof LeagueApiError && error.code === "LEAGUE_SAVE_INVALID") paused = true;
        onStatus("error");
      }
    } finally {
      busy = false;
      if (!stopped && !paused && storage.getEnvelope().dirty) schedule();
    }
  }
  function schedule() {
    if (stopped || paused) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void flush(), Math.max(10000, 30000 - (Date.now() - lastUpload)));
  }
  const unsubscribe = storage.subscribe(checkpoint => {
    if (checkpoint) schedule();
  });
  const hidden = () => {
    if (document.visibilityState === "hidden") void flush(true);
  };
  document.addEventListener("visibilitychange", hidden);
  const online = () => {
    if (conflicting) void readConflict();
    else if (!paused) schedule();
  };
  window.addEventListener("online", online);
  if (storage.getEnvelope().dirty) schedule();
  return {
    flush,
    resume() {
      paused = false;
      schedule();
    },
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      unsubscribe();
      document.removeEventListener("visibilitychange", hidden);
      window.removeEventListener("online", online);
    },
  };
}
