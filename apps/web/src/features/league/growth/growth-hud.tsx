"use client";
import { useSyncExternalStore } from "react";
import type { LeagueLocale, LeagueTestModeView } from "../contract";
import { LeagueTestModeChip } from "../test-mode/banner";
import type { GrowthCopy } from "./copy";
import type { LeagueSaveStorage } from "./league-save";
function saveStatusLabel(copy: GrowthCopy, status: string) {
  return status === "too-large"
    ? copy.saveTooLarge
    : status === "saved"
      ? copy.saved
      : status === "saving"
        ? copy.saving
        : status === "error"
          ? copy.saveError
          : copy.local;
}
export function GrowthHud({
  storage,
  copy,
  status,
  nextGym,
  gymPresent,
  onExit,
}: {
  storage: LeagueSaveStorage;
  copy: GrowthCopy;
  status: string;
  nextGym?: string;
  gymPresent?: boolean;
  onExit(): void;
}) {
  const save = useSyncExternalStore(storage.subscribe, storage.getEnvelope, storage.getEnvelope);
  return (
    <div
      className="flex flex-wrap items-center gap-3 rounded border border-gray-300 p-3 text-sm"
      aria-live="polite"
    >
      <span>
        {copy.badges} {save.league.badges}/8
      </span>
      {nextGym && (
        <span>
          {copy.gym} {nextGym} {gymPresent && copy.gymPresent}
        </span>
      )}
      <span>{saveStatusLabel(copy, status)}</span>
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

export function GrowthMobileStatus({
  storage,
  copy,
  status,
  nextGym,
  gymPresent,
  onExit,
  locale,
  test,
  notice,
  onDismissNotice,
}: Parameters<typeof GrowthHud>[0] & {
  locale: LeagueLocale;
  test?: LeagueTestModeView;
  notice: string;
  onDismissNotice(): void;
}) {
  const save = useSyncExternalStore(storage.subscribe, storage.getEnvelope, storage.getEnvelope);
  return (
    <header
      data-poke-lounge-play-status="true"
      aria-live="polite"
      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-0.5 border-b-2 border-[#17231c] bg-[#fffdf0] px-3 py-1.5 text-sm text-[#17231c] shadow-[inset_0_2px_0_#fffdf0,inset_0_-3px_0_#d7e6d7]"
    >
      <p className="min-w-0 font-black">
        {copy.badges} {save.league.badges}/8
        {nextGym && (
          <>
            {" "}
            · {copy.gym} {nextGym}{" "}
            {gymPresent && <span className="text-[#ab4d3e]">{copy.gymPresent}</span>}
          </>
        )}
      </p>
      <button
        onClick={onExit}
        className="row-span-2 min-h-11 rounded-[10px] border-2 border-[#17231c] bg-[#f8fbf0] px-2.5 text-xs font-black shadow-[0_2px_0_#17231c] active:translate-y-[2px] active:shadow-none"
      >
        {copy.home}
      </button>
      <p className="flex min-w-0 flex-wrap gap-x-2 text-xs font-bold text-[#4a5b4d]">
        <span>
          {saveStatusLabel(copy, status)} · {copy.pending} {save.league.pendingMints.length}
        </span>
        {save.league.rejectedMints.length > 0 && (
          <span role="alert">
            {copy.rejected} {save.league.rejectedMints.length} · {copy.mintError}
          </span>
        )}
        <LeagueTestModeChip locale={locale} test={test} />
      </p>
      {notice && (
        <p role="status" className="col-span-2 flex items-center gap-2 [overflow-wrap:anywhere]">
          <span className="min-w-0 flex-1">{notice}</span>
          <button
            onClick={onDismissNotice}
            aria-label={copy.dismissNotice}
            className="min-h-11 min-w-11 shrink-0 rounded border-2 border-[#17231c] font-black"
          >
            ×
          </button>
        </p>
      )}
    </header>
  );
}
