import { canonicalize } from "@poke-lounge/battle/canonical-json";
import { LeagueApiError } from "../api/core";
import { loadLeagueSave, uploadLeagueSave } from "../api/growth";
import {
  readLeagueSave,
  parseLeagueSave,
  type LeagueSaveEnvelope,
  type LeagueSaveStorage,
} from "./league-save";

function saveContent(save: LeagueSaveEnvelope): string {
  const normalized = parseLeagueSave(save, save.runId, save.userId);
  if (!normalized) throw new Error("LEAGUE_SAVE_INVALID");
  const { version, runId, seasonId, userId, game, league } = normalized;
  // Compare persisted content, ignoring sync metadata, undefined fields and JSON object key order.
  return canonicalize(
    JSON.parse(JSON.stringify({ version, runId, seasonId, userId, game, league })),
  );
}

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
  if (saveContent(local) === saveContent(server))
    return { save: { ...local, serverRev: remote.rev, dirty: false }, conflict: null };
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
  let exitRequested = false;
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
        const current = storage.getEnvelope();
        if (saveContent(current) === saveContent(data)) {
          storage.acknowledge(remote.save.rev, current.rev);
          paused = false;
          conflicting = false;
          onStatus("saved");
        } else onConflict(data);
      } else onStatus("error");
    } catch {
      if (!stopped) onStatus("error");
    }
  }
  async function flush(keepalive = false, force = false) {
    if ((stopped && !force) || paused || !storage.getEnvelope().dirty) return;
    if (busy) {
      exitRequested ||= force;
      return;
    }
    if (!force && Date.now() - lastUpload < 30000) {
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
      if (error instanceof LeagueApiError && error.code === "LEAGUE_SAVE_TOO_LARGE") {
        onStatus("too-large");
      } else if (error instanceof LeagueApiError && error.code === "LEAGUE_SAVE_KEEPALIVE_LIMIT") {
        onStatus("local");
      } else if (error instanceof LeagueApiError && error.code === "LEAGUE_RUN_NOT_ACTIVE") {
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
      if (exitRequested) {
        exitRequested = false;
        void flush(true, true);
      } else if (!stopped && !paused && storage.getEnvelope().dirty) schedule();
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
  const exiting = () => void flush(true, true);
  window.addEventListener("pagehide", exiting);
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
      window.removeEventListener("pagehide", exiting);
      window.removeEventListener("online", online);
    },
  };
}
