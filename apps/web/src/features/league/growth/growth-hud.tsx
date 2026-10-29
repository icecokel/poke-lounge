"use client";
import { useSyncExternalStore } from "react";
import type { GrowthCopy } from "./copy";
import type { LeagueSaveStorage } from "./league-save";
export function GrowthHud({
  storage,
  copy,
  status,
  nextGym,
  onExit,
}: {
  storage: LeagueSaveStorage;
  copy: GrowthCopy;
  status: string;
  nextGym?: string;
  onExit(): void;
}) {
  const save = useSyncExternalStore(storage.subscribe, storage.getEnvelope, storage.getEnvelope);
  return (
    <div
      className="flex flex-wrap items-center gap-3 rounded border border-slate-600 p-3 text-sm"
      aria-live="polite"
    >
      <span>
        {copy.badges} {save.league.badges}/8
      </span>
      {nextGym && (
        <span>
          {copy.gym} {nextGym}
        </span>
      )}
      <span>
        {status === "saved"
          ? copy.saved
          : status === "saving"
            ? copy.saving
            : status === "error"
              ? copy.saveError
              : copy.local}
      </span>
      <span>
        {copy.pending} {save.league.pendingMints.length}
      </span>
      {save.league.rejectedMints.length > 0 && (
        <span role="alert">
          {copy.rejected} {save.league.rejectedMints.length} · {copy.mintError}
        </span>
      )}
      <button className="ml-auto rounded border px-3 py-2" onClick={onExit}>
        {copy.home}
      </button>
    </div>
  );
}
