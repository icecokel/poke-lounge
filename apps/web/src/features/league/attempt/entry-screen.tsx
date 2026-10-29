"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { LeagueRuntime } from "../contract";
import { LeagueApiError, withLeagueRetry } from "../api/core";
import { enterAttempt, getCurrentAttempt, type AttemptView } from "../api/league";
import { getLeagueEntryClaim } from "../growth/entry-claim";
import { getEntryKey, clearEntryKey } from "./entry-key";
import { getLeagueCopy, leagueText } from "../shell/copy";
import { errorDetail, leagueErrorMessage, useRateLimitCooldown } from "../shell/league-errors";
import { PokemonIcon, speciesName, moveName } from "../battle/lead-picker";

export function EntryScreen({
  runtime,
  runId,
  onEntered,
  onHome,
}: {
  runtime: LeagueRuntime;
  runId: string;
  onEntered(attempt: AttemptView): void;
  onHome(error?: unknown): void;
}) {
  const locale = runtime.locale;
  const text = getLeagueCopy(locale);
  const [claim] = useState(() => getLeagueEntryClaim(runId));
  const [confirm, setConfirm] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const blocked = useRateLimitCooldown(error);
  const sending = useRef(false);
  const reason = claim.ok
    ? null
    : {
        PARTY_SIZE: leagueText(
          locale,
          "6마리가 필요합니다",
          "Six Pokémon are required.",
          "6匹必要です。",
        ),
        PENDING_MINT: leagueText(
          locale,
          "포획 확인이 끝나지 않은 포켓몬이 있습니다(성장 화면에서 확인)",
          "Some captures are awaiting confirmation. Check training.",
          "捕獲確認待ちのポケモンがいます。育成画面で確認してください。",
        ),
        MINT_REJECTED: leagueText(
          locale,
          "포획 확인이 거절된 포켓몬이 있습니다. 성장 화면에서 확인하세요.",
          "A capture was rejected. Check training.",
          "捕獲確認が拒否されました。育成画面で確認してください。",
        ),
        NO_SAVE: leagueText(
          locale,
          "성장 저장 데이터가 없습니다",
          "No training save is available.",
          "育成セーブがありません。",
        ),
        RUN_MISMATCH: leagueText(
          locale,
          "현재 성장 기록과 저장 데이터가 다릅니다",
          "The training run and save do not match.",
          "育成記録とセーブが一致しません。",
        ),
      }[claim.reason];
  async function enter() {
    if (!claim.ok || sending.current || blocked) return;
    sending.current = true;
    setPending(true);
    setError(null);
    try {
      const key = getEntryKey(runId);
      const attempt = await withLeagueRetry(() => enterAttempt(runId, claim.claim, key), {
        onRetry: (_, error) => setError(error),
      });
      clearEntryKey(runId);
      onEntered(attempt);
    } catch (error) {
      if (error instanceof LeagueApiError && error.code === "LEAGUE_ATTEMPT_ACTIVE") {
        try {
          const current = await getCurrentAttempt();
          if (current && current.id === errorDetail(error).attemptId) {
            clearEntryKey(runId);
            onEntered(current);
            return;
          }
        } catch (resumeError) {
          setError(resumeError);
          return;
        }
      }
      setError(error);
      if (
        error instanceof LeagueApiError &&
        [
          "LEAGUE_UNAUTHORIZED",
          "LEAGUE_SEASON_NOT_OPEN",
          "LEAGUE_RUN_NOT_ACTIVE",
          "LEAGUE_BADGES_REQUIRED",
          "LEAGUE_ENGINE_RETIRED",
          "LEAGUE_ENGINE_VERSION_MISMATCH",
          "LEAGUE_PARTY_INVALID",
          "LEAGUE_PARTY_IMPLAUSIBLE",
        ].includes(error.code)
      )
        onHome(error);
    } finally {
      sending.current = false;
      setPending(false);
      setConfirm(false);
    }
  }
  return (
    <div className="grid gap-4">
      <h2 className="text-xl font-bold">{text.enter}</h2>
      {reason && <p role="alert">{reason}</p>}
      {claim.ok && (
        <ul className="grid gap-3 sm:grid-cols-2">
          {claim.preview.map(mon => (
            <li className="flex items-center gap-3 rounded-lg border p-3" key={mon.slotIndex}>
              <PokemonIcon speciesId={mon.speciesId} />
              <div>
                <strong>{speciesName(mon.speciesId, locale)}</strong>
                <p>
                  Lv{mon.level}
                  {mon.level > 50
                    ? leagueText(locale, " → 리그 Lv50", " → league Lv50", " → リーグLv50")
                    : ""}
                </p>
                <p className="text-sm">{mon.moveIds.map(id => moveName(id, locale)).join(" · ")}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
      <p>
        {leagueText(
          locale,
          "가방 금지 · 지닌 아이템 없음 · 경기 사이 절반 회복 · 기절 유지 · 한 번 지면 종료",
          "No bag or held items · Half recovery between matches · Fainted Pokémon stay fainted · One loss ends the challenge",
          "バッグ・持ち物なし · 試合間で半分回復 · ひんしは維持 · 一度負けると終了",
        )}
      </p>
      {error != null && <p role="alert">{leagueErrorMessage(error, locale)}</p>}
      <div className="flex flex-wrap gap-3">
        <Button disabled={!claim.ok || pending || blocked} onClick={() => setConfirm(true)}>
          {pending ? text.loading : text.enter}
        </Button>
        <Button variant="outline" disabled={pending} onClick={() => onHome()}>
          {text.home}
        </Button>
      </div>
      <AlertDialog
        open={confirm}
        onOpenChange={open => {
          if (!pending) setConfirm(open);
        }}
      >
        <AlertDialogContent className="max-h-[calc(100dvh-32px)] overflow-auto">
          <AlertDialogHeader>
            <AlertDialogTitle>{text.enter}</AlertDialogTitle>
            <AlertDialogDescription>
              {leagueText(
                locale,
                "입장하면 배지 8개가 사라집니다. 지면 기록 없이 끝나고 성장은 유지됩니다.",
                "Entering consumes all eight badges. A loss ends the challenge without a record; training is kept.",
                "入場するとバッジ8個が消費されます。負けると記録なしで終了し、育成は維持されます。",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error != null && <p role="alert">{leagueErrorMessage(error, locale)}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>{text.cancel}</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending || blocked}
              onClick={event => {
                event.preventDefault();
                void enter();
              }}
            >
              {pending ? text.loading : text.confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
