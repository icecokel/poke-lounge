import { Button } from "@/components/ui/button";
import type { LeagueLocale, LeagueMatchMeasure, AttemptSummary } from "../contract";
import type { FinalView } from "../api/league";
import { getLeagueCopy, leagueText } from "../shell/copy";

export function FinalResult({
  locale,
  final,
  matches,
  onHome,
}: {
  locale: LeagueLocale;
  final: FinalView;
  matches: Array<{ index: number; measure: LeagueMatchMeasure }>;
  onHome(): void;
}) {
  const text = getLeagueCopy(locale);
  return (
    <div className="grid gap-4">
      <h2 className="text-xl font-bold">
        {leagueText(locale, "최종 결과", "Final result", "最終結果")}
      </h2>
      <strong className="text-3xl">{final.score} / 10,000</strong>
      <ol className="grid gap-2">
        {matches.map(m => (
          <li key={m.index}>
            {m.index + 1} · Q {m.measure.qApprox.toFixed(1)}
          </li>
        ))}
      </ol>
      <p>
        {final.recorded
          ? leagueText(
              locale,
              "새 시즌 최고 기록을 저장했습니다",
              "New season best recorded.",
              "シーズン最高記録を更新しました。",
            )
          : leagueText(
              locale,
              "이전 최고 기록을 유지합니다",
              "Your previous best is kept.",
              "以前の最高記録を維持します。",
            )}
      </p>
      <p>
        {text.rank}: {final.position ?? text.outside} ·{" "}
        {leagueText(locale, "최고 순위", "Best rank", "最高順位")}: {final.bestRank ?? "—"}
      </p>
      {final.runClosed && (
        <p>
          {leagueText(
            locale,
            "완주했으므로 성장이 초기화되었습니다. 다음 도전은 새 스타터로 시작합니다",
            "Training was reset after completion. Your next challenge starts with a new starter.",
            "完走したため育成はリセットされました。次の挑戦は新しいパートナーから始まります。",
          )}
        </p>
      )}
      <Button onClick={onHome}>{text.home}</Button>
    </div>
  );
}
export function FailedResult({
  locale,
  attempt,
  onHome,
}: {
  locale: LeagueLocale;
  attempt: AttemptSummary;
  onHome(): void;
}) {
  const reasons: Record<string, string> = {
    lost: leagueText(locale, "패배", "Loss", "敗北"),
    draw: leagueText(locale, "무승부", "Draw", "引き分け"),
    turn_limit: leagueText(locale, "턴 상한", "Turn limit", "ターン上限"),
    forfeit: leagueText(locale, "도전 포기", "Forfeited", "挑戦放棄"),
    rejected_limit: leagueText(locale, "제출 거절 5회", "Five rejected submissions", "送信拒否5回"),
  };
  return (
    <div className="grid gap-4">
      <h2 className="text-xl font-bold">
        {leagueText(locale, "도전 종료", "Challenge ended", "挑戦終了")}
      </h2>
      <p>{reasons[attempt.failReason ?? ""] ?? attempt.failReason}</p>
      <p>
        {leagueText(
          locale,
          "배지는 입장 때 사라졌고 성장은 유지됩니다",
          "Badges were consumed on entry. Training is kept.",
          "バッジは入場時に消費されました。育成は維持されます。",
        )}
      </p>
      <Button onClick={onHome}>{getLeagueCopy(locale).home}</Button>
    </div>
  );
}
