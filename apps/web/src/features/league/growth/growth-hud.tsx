"use client";
import { useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";
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
      className="flex flex-wrap items-center gap-3 rounded-[var(--pl-panel-radius)] border-[3px] border-[var(--pl-color-ink)] bg-[var(--pl-color-surface-raised)] px-3 py-2 text-sm font-bold shadow-[0_3px_0_rgb(36_49_59_/_72%)]"
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
      <button
        className="ml-auto min-h-9 rounded-[4px] border-2 border-[var(--pl-color-ink)] bg-[var(--pl-color-surface-raised)] px-3 font-black shadow-[0_3px_0_var(--pl-color-ink)] hover:bg-[var(--pl-color-gold-soft)] active:translate-y-[2px] active:shadow-[0_1px_0_var(--pl-color-ink)]"
        onClick={onExit}
      >
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
  const compact =
    !notice &&
    save.league.rejectedMints.length === 0 &&
    status !== "too-large" &&
    status !== "error";
  const summary = `${copy.badges} ${save.league.badges}/8${nextGym ? ` · ${copy.gym} ${nextGym}${gymPresent ? ` ${copy.gymPresent}` : ""}` : ""}`;
  const saving = `${saveStatusLabel(copy, status)} · ${copy.pending} ${save.league.pendingMints.length}`;
  return (
    <header
      data-poke-lounge-play-status="true"
      aria-live="polite"
      className={cn(
        "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-0.5 border-b-2 border-[#17231c] bg-[#fffdf0] px-3 py-1.5 text-sm text-[#17231c] shadow-[inset_0_2px_0_#fffdf0,inset_0_-3px_0_#d7e6d7]",
        compact &&
          "[@media(max-height:540px)]:min-h-12 [@media(max-height:540px)]:gap-y-0 [@media(max-height:540px)]:py-0",
      )}
    >
      <p
        title={summary}
        className={cn(
          "min-w-0 font-black",
          compact &&
            "[@media(max-height:540px)]:truncate [@media(max-height:540px)]:text-xs [@media(max-height:540px)]:leading-4",
        )}
      >
        {copy.badges} {save.league.badges}/8
        {nextGym && (
          <>
            {" "}
            ·{" "}
            <span className={compact ? "[@media(max-height:540px)]:sr-only" : undefined}>
              {copy.gym}{" "}
            </span>
            {nextGym} {gymPresent && <span className="text-[#ab4d3e]">{copy.gymPresent}</span>}
          </>
        )}
      </p>
      <button
        onClick={onExit}
        className="row-span-2 min-h-11 rounded-[10px] border-2 border-[#17231c] bg-[#f8fbf0] px-2.5 text-xs font-black shadow-[0_2px_0_#17231c] active:translate-y-[2px] active:shadow-none"
      >
        {copy.home}
      </button>
      <p
        className={cn(
          "flex min-w-0 flex-wrap gap-x-2 text-xs font-bold text-[#4a5b4d]",
          compact &&
            "[@media(max-height:540px)]:flex-nowrap [@media(max-height:540px)]:text-[11px] [@media(max-height:540px)]:leading-4",
        )}
      >
        <span
          title={saving}
          className={compact ? "[@media(max-height:540px)]:truncate" : undefined}
        >
          {saving}
        </span>
        {save.league.rejectedMints.length > 0 && (
          <span role="alert">
            {copy.rejected} {save.league.rejectedMints.length} · {copy.mintError}
          </span>
        )}
        <LeagueTestModeChip locale={locale} test={test} compact={compact} />
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
