import { Button } from "@/components/ui/button";
import type { Gen4Party } from "@poke-lounge/battle/gen4/types";
import type { LeagueBattleParty, LeagueLocale, LeagueMatchMeasure } from "../contract";
import { getLeagueCopy, leagueText } from "../shell/copy";
import { moveName, speciesName } from "../battle/lead-picker";

export function MatchResult({
  locale,
  measure,
  clientOutcome,
  beforeRecovery,
  afterRecovery,
  nextName,
  onContinue,
}: {
  locale: LeagueLocale;
  measure: LeagueMatchMeasure;
  clientOutcome: string | null;
  beforeRecovery?: Gen4Party;
  afterRecovery?: LeagueBattleParty;
  nextName?: string;
  onContinue(): void;
}) {
  const ratio = (Number(measure.hpRatio.num) / Number(measure.hpRatio.den)) * 100;
  return (
    <div className="grid gap-4">
      <h2 className="text-xl font-bold">
        {leagueText(locale, "경기 결과", "Match result", "試合結果")} ·{" "}
        {measure.status === "won"
          ? leagueText(locale, "승리", "Win", "勝利")
          : measure.status === "lost"
            ? leagueText(locale, "패배", "Loss", "敗北")
            : leagueText(locale, "무승부", "Draw", "引き分け")}
      </h2>
      {measure.status !== clientOutcome && (
        <p role="alert">
          {leagueText(locale, "서버 판정 결과", "Server judged result", "サーバー判定結果")}
        </p>
      )}
      <dl className="grid grid-cols-2 gap-3 rounded-lg border p-4">
        <dt>F · {leagueText(locale, "새 기절", "Newly fainted", "新たなひんし")}</dt>
        <dd>{measure.faintedNew}</dd>
        <dt>H · HP</dt>
        <dd>{ratio.toFixed(1)}%</dd>
        <dt>T · {leagueText(locale, "턴", "Turns", "ターン")}</dt>
        <dd>{measure.turns}</dd>
        <dt>Q · {getLeagueCopy(locale).score}</dt>
        <dd>{measure.qApprox.toFixed(1)}</dd>
      </dl>
      {measure.status === "won" && beforeRecovery && afterRecovery && (
        <section className="grid gap-2">
          <h3 className="font-bold">
            {leagueText(
              locale,
              "경기 사이 회복 전 → 후",
              "Between-match recovery: before → after",
              "試合間の回復前 → 後",
            )}
          </h3>
          <ul className="grid gap-3">
            {afterRecovery.members.map(after => {
              const before = beforeRecovery.members.find(m => m.slotIndex === after.slotIndex);
              return (
                <li className="rounded-lg border p-3" key={after.slotIndex}>
                  <strong>{speciesName(after.speciesId, locale)}</strong> · HP{" "}
                  {before?.currentHp ?? "—"} → {after.currentHp}/{after.maxHp}
                  <p className="text-sm">
                    {after.moves
                      .map(
                        move =>
                          `${moveName(move.moveId, locale)} PP ${before?.moves.find(m => m.moveId === move.moveId)?.pp ?? "—"} → ${move.pp}/${move.maxPp}`,
                      )
                      .join(" · ")}
                  </p>
                </li>
              );
            })}
          </ul>
        </section>
      )}
      {nextName && (
        <p>
          {leagueText(locale, "다음 상대", "Next opponent", "次の相手")}: {nextName}
        </p>
      )}
      <Button onClick={onContinue}>{getLeagueCopy(locale).confirm}</Button>
    </div>
  );
}
