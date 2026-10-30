"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { LEAGUE_MATCH_RULES, measureLeagueMatch } from "@poke-lounge/battle/league/match";
import { LEAGUE_ENGINE_VERSION } from "@poke-lounge/battle/league/engine-version";
import { leagueHash } from "@poke-lounge/battle/league/hash";
import { LeagueApiError, withLeagueRetry } from "../api/core";
import {
  getCurrentAttempt,
  submitMatch,
  forfeitAttempt,
  type AttemptView,
  type MatchResponse,
  type MatchSubmission,
} from "../api/league";
import type { LeagueBattleParty, LeagueJudgedBattleProps, LeagueRuntime } from "../contract";
import { LeagueJudgedBattle } from "../battle/league-judged-battle";
import { leagueRoleLabel } from "../records/role";
import { MatchResult } from "./match-result";
import { FailedResult, FinalResult } from "./final-result";
import { getLeagueCopy, leagueText } from "../shell/copy";
import { errorDetail, leagueErrorMessage, useRateLimitCooldown } from "../shell/league-errors";

type Finished = Parameters<LeagueJudgedBattleProps["onFinished"]>[0];
type Pending = { index: number; body: MatchSubmission; finished: Finished };
export function AttemptFlow({
  runtime,
  initial,
  onHome,
}: {
  runtime: LeagueRuntime;
  initial: AttemptView;
  onHome(error?: unknown): void;
}) {
  const locale = runtime.locale;
  const text = getLeagueCopy(locale);
  const [attempt, setAttempt] = useState(initial);
  const [phase, setPhase] = useState<
    "battle" | "submitting" | "loading" | "result" | "final" | "failed" | "ended" | "error"
  >(initial.status === "active" && initial.current ? "battle" : "ended");
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [response, setResponse] = useState<MatchResponse | null>(null);
  const [confirmForfeit, setConfirmForfeit] = useState(false);
  const [forfeiting, setForfeiting] = useState(false);
  const [restart, setRestart] = useState(0);
  const rejected = useRef(0);
  const sending = useRef(false);
  const blocked = useRateLimitCooldown(error);
  const current = attempt.current;
  const opponent = current ? attempt.opponents[current.index] : undefined;
  const init = useMemo(
    () =>
      current && opponent
        ? {
            seed: current.seed,
            challenger: current.carryParty,
            opponent: opponent.party,
            rules: LEAGUE_MATCH_RULES,
          }
        : null,
    [current, opponent],
  );
  const mismatchedHash = !!current && leagueHash(current.carryParty) !== current.carryHash;
  const refreshAttempt = useCallback(async () => {
    const next = await getCurrentAttempt();
    if (
      next?.id === initial.id &&
      next.status === "active" &&
      next.current &&
      next.engineVersion === LEAGUE_ENGINE_VERSION
    ) {
      if (leagueHash(next.current.carryParty) !== next.current.carryHash)
        throw new LeagueApiError(500, "LEAGUE_CORRUPT", undefined, false);
      setAttempt(next);
      setPending(null);
      setResponse(null);
      setError(null);
      setRestart(n => n + 1);
      setPhase("battle");
    } else if (next?.status === "void" || next?.status === "expired") {
      onHome(
        new LeagueApiError(
          next.status === "expired" ? 410 : 409,
          next.status === "expired" ? "LEAGUE_ATTEMPT_EXPIRED" : "LEAGUE_ENGINE_RETIRED",
          undefined,
          false,
        ),
      );
    } else if (next?.status === "active") {
      onHome(
        next.engineVersion !== LEAGUE_ENGINE_VERSION
          ? new LeagueApiError(409, "LEAGUE_ENGINE_VERSION_MISMATCH", undefined, false)
          : undefined,
      );
    } else {
      // Failed attempts are omitted by both current and /me; do not infer a reason.
      setPending(null);
      setError(null);
      setPhase("ended");
    }
  }, [initial.id, onHome]);
  useEffect(() => {
    if (!mismatchedHash) return;
    setPhase("submitting");
    setNotice(
      leagueText(
        locale,
        "시작 파티 해시가 달라 서버 상태를 다시 불러옵니다",
        "The start hash differs. Reloading server state.",
        "開始パーティのハッシュが異なるため、サーバー状態を読み直します。",
      ),
    );
    void refreshAttempt().catch(error => {
      setError(error);
      setPhase("error");
    });
  }, [mismatchedHash, refreshAttempt, locale]);
  function accept(result: MatchResponse) {
    setError(null);
    setResponse(result);
    setAttempt(previous => ({
      ...previous,
      ...result.attempt,
      current: result.next,
      matches: [
        ...previous.matches.filter(m => m.index !== pendingIndex.current),
        { index: pendingIndex.current, measure: result.measure },
      ].sort((a, b) => a.index - b.index),
    }));
    setPhase("result");
  }
  const pendingIndex = useRef(0);
  async function send(payload: Pending) {
    if (sending.current || blocked) return;
    sending.current = true;
    setError(null);
    setPhase("submitting");
    pendingIndex.current = payload.index;
    try {
      const result = await withLeagueRetry(
        () => submitMatch(attempt.id, payload.index, payload.body),
        { onRetry: (_, error) => setError(error) },
      );
      accept(result);
    } catch (error) {
      setError(error);
      const detail = errorDetail(error);
      const code = error instanceof LeagueApiError ? error.code : "NETWORK";
      if (
        code === "LEAGUE_MATCH_ALREADY_JUDGED" &&
        detail.result &&
        typeof detail.result === "object" &&
        "measure" in detail.result &&
        "attempt" in detail.result
      ) {
        accept(detail.result as MatchResponse);
      } else if (
        code === "LEAGUE_STATE_MISMATCH" &&
        detail.carryParty &&
        typeof detail.carryParty === "object" &&
        "members" in detail.carryParty &&
        typeof detail.carryHash === "string" &&
        current
      ) {
        setNotice(leagueErrorMessage(error, locale));
        setError(null);
        setPending(null);
        setAttempt(previous => ({
          ...previous,
          current: {
            ...current,
            carryParty: detail.carryParty as LeagueBattleParty,
            carryHash: detail.carryHash as string,
          },
        }));
        setRestart(n => n + 1);
        setPhase("battle");
      } else if (code === "LEAGUE_INPUT_REJECTED") {
        setPending(null);
        rejected.current += 1;
        setNotice(
          `${leagueErrorMessage(error, locale)} ${leagueText(locale, "이 화면의 거절 횟수", "Rejections on this page", "この画面での拒否回数")}: ${rejected.current}/5`,
        );
        try {
          await refreshAttempt();
          setError(null);
        } catch (error) {
          setError(error);
          setPhase("error");
        }
      } else if (
        [
          "LEAGUE_UNAUTHORIZED",
          "LEAGUE_SEASON_NOT_OPEN",
          "LEAGUE_RUN_NOT_ACTIVE",
          "LEAGUE_BADGES_REQUIRED",
          "LEAGUE_ATTEMPT_EXPIRED",
          "LEAGUE_ENGINE_RETIRED",
          "LEAGUE_ATTEMPT_NOT_ACTIVE",
          "LEAGUE_NOT_FOUND",
          "LEAGUE_ENGINE_VERSION_MISMATCH",
        ].includes(code)
      )
        onHome(error);
      else setPhase("error");
    } finally {
      sending.current = false;
    }
  }
  function finished(result: Finished) {
    if (!current || sending.current) return;
    const measure = measureLeagueMatch(result.progress);
    const payload: Pending = {
      index: current.index,
      finished: result,
      body: {
        contractVersion: 1,
        engineVersion: attempt.engineVersion,
        leadSlot: result.leadSlot,
        startHash: current.carryHash,
        inputs: result.progress.inputs,
        client: {
          winner: result.progress.frame.winner,
          turns: measure.turns,
          endHash: measure.endHash,
        },
      },
    };
    setPending(payload);
    void send(payload);
  }
  async function forfeit() {
    if (sending.current || blocked) return;
    sending.current = true;
    setForfeiting(true);
    setError(null);
    try {
      const result = await withLeagueRetry(() => forfeitAttempt(attempt.id), {
        onRetry: (_, error) => setError(error),
      });
      if (result.attempt.status !== "failed") {
        onHome(
          new LeagueApiError(
            result.attempt.status === "expired" ? 410 : 409,
            result.attempt.status === "expired"
              ? "LEAGUE_ATTEMPT_EXPIRED"
              : result.attempt.status === "void"
                ? "LEAGUE_ENGINE_RETIRED"
                : "LEAGUE_ATTEMPT_NOT_ACTIVE",
            undefined,
            false,
          ),
        );
        return;
      }
      setAttempt(previous => ({ ...previous, ...result.attempt }));
      setPhase("failed");
      setError(null);
    } catch (error) {
      setError(error);
      if (error instanceof LeagueApiError && error.code === "OUTCOME_UNKNOWN") {
        try {
          await refreshAttempt();
        } catch (error) {
          setError(error);
          setPhase("error");
        }
      } else if (
        error instanceof LeagueApiError &&
        [
          "LEAGUE_UNAUTHORIZED",
          "LEAGUE_ATTEMPT_EXPIRED",
          "LEAGUE_ENGINE_RETIRED",
          "LEAGUE_ATTEMPT_NOT_ACTIVE",
          "LEAGUE_NOT_FOUND",
          "LEAGUE_ENGINE_VERSION_MISMATCH",
        ].includes(error.code)
      )
        onHome(error);
    } finally {
      sending.current = false;
      setForfeiting(false);
      setConfirmForfeit(false);
    }
  }
  const canResubmit =
    error instanceof LeagueApiError &&
    (error.retryable || error.code === "OUTCOME_UNKNOWN" || error.status === 429);
  return (
    <div className="grid gap-4">
      {notice && <p role="status">{notice}</p>}
      {phase === "battle" && !mismatchedHash && init && opponent && (
        <LeagueJudgedBattle
          key={`${attempt.id}:${current!.index}:${restart}`}
          mode="league"
          runtime={runtime}
          init={init}
          opponent={{
            displayName: opponent.meta.displayName,
            className: leagueRoleLabel(opponent.meta.position, opponent.meta.kind, locale),
          }}
          matchLabel={`${current!.index + 1} / 5`}
          onFinished={finished}
          onAbort={() => setConfirmForfeit(true)}
        />
      )}
      {phase === "submitting" && (
        <p role="status">
          {error
            ? leagueErrorMessage(error, locale, true)
            : leagueText(
                locale,
                "서버 판정을 기다리는 중…",
                "Waiting for the server judgement…",
                "サーバー判定を待っています…",
              )}
        </p>
      )}
      {phase === "loading" && <p role="status">{text.loading}</p>}
      {error != null && phase !== "submitting" && (
        <p role="alert">{leagueErrorMessage(error, locale)}</p>
      )}
      {phase === "error" && (
        <div className="flex flex-wrap gap-3">
          {pending && canResubmit && (
            <Button disabled={blocked} onClick={() => void send(pending)}>
              {leagueText(locale, "다시 제출", "Resubmit", "再送信")}
            </Button>
          )}
          {!pending && canResubmit && (
            <Button
              disabled={blocked}
              onClick={async () => {
                if (sending.current) return;
                sending.current = true;
                setError(null);
                setPhase("loading");
                try {
                  await refreshAttempt();
                } catch (error) {
                  setError(error);
                  setPhase("error");
                } finally {
                  sending.current = false;
                }
              }}
            >
              {leagueText(locale, "다시 불러오기", "Reload challenge", "挑戦を再読み込み")}
            </Button>
          )}
          <Button variant="outline" disabled={blocked} onClick={() => onHome()}>
            {leagueText(locale, "나중에 이어 하기", "Resume later", "後で再開")}
          </Button>
          {error instanceof LeagueApiError && error.code === "LEAGUE_ENGINE_VERSION_MISMATCH" && (
            <Button onClick={() => window.location.reload()}>{text.refresh}</Button>
          )}
        </div>
      )}
      {phase === "result" && response && (
        <MatchResult
          locale={locale}
          measure={response.measure}
          clientOutcome={pending?.finished.progress.outcome ?? null}
          beforeRecovery={pending?.finished.progress.frame.parties[0]}
          afterRecovery={response.next?.carryParty}
          nextName={
            response.next ? attempt.opponents[response.next.index]?.meta.displayName : undefined
          }
          onContinue={() => {
            if (response.final) setPhase("final");
            else if (response.attempt.status === "failed") setPhase("failed");
            else {
              setPending(null);
              setResponse(null);
              setPhase("battle");
            }
          }}
        />
      )}
      {phase === "final" && response?.final && (
        <FinalResult
          locale={locale}
          final={response.final}
          matches={attempt.matches}
          onHome={() => onHome()}
        />
      )}
      {phase === "failed" && (
        <FailedResult locale={locale} attempt={attempt} onHome={() => onHome()} />
      )}
      {phase === "ended" && (
        <>
          <p role="status">
            {leagueText(
              locale,
              "진행 중인 도전이 없습니다. 도전이 종료되었으며 정확한 종료 사유는 조회할 수 없습니다. 홈에서 현재 성장 상태를 확인하세요.",
              "There is no active challenge. It has ended, but the exact reason is unavailable. Check your current training status at home.",
              "進行中の挑戦はありません。挑戦は終了しましたが、正確な終了理由は確認できません。ホームで現在の育成状態を確認してください。",
            )}
          </p>
          <Button onClick={() => onHome()}>{text.home}</Button>
        </>
      )}
      <AlertDialog
        open={confirmForfeit}
        onOpenChange={open => {
          if (!forfeiting) setConfirmForfeit(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {leagueText(
                locale,
                "도전을 포기할까요?",
                "Forfeit this challenge?",
                "挑戦をあきらめますか？",
              )}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {leagueText(
                locale,
                "기록 없이 도전을 끝냅니다. 성장은 유지됩니다.",
                "End without a record. Training is kept.",
                "記録なしで挑戦を終了します。育成は維持されます。",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error != null && <p role="alert">{leagueErrorMessage(error, locale, forfeiting)}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={forfeiting}>{text.cancel}</AlertDialogCancel>
            <AlertDialogAction
              disabled={forfeiting || blocked}
              onClick={event => {
                event.preventDefault();
                void forfeit();
              }}
            >
              {forfeiting ? text.loading : text.confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
