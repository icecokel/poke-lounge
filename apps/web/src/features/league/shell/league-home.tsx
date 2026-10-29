"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { getBattlePokemonAssets } from "@/components/poke-lounge/runtime/game/battle/battle-pokemon-assets";
import type { LeagueLocale, MeView, StatusView } from "../contract";
import type { StandingsView } from "../api/league";
import { getLeagueCopy, leagueText } from "./copy";
import { formatKst } from "./kst";

export function LeagueHome({
  locale,
  status,
  receivedAt,
  me,
  standings,
  versionMismatch,
  onGrowth,
  onEntry,
  onResume,
}: {
  locale: LeagueLocale;
  status: StatusView;
  receivedAt: number;
  me: MeView;
  standings: StandingsView;
  versionMismatch: boolean;
  onGrowth(): void;
  onEntry(): void;
  onResume(): void;
}) {
  const text = getLeagueCopy(locale);
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const tick = () => setElapsed(performance.now() - receivedAt);
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [receivedAt]);
  const now = status.nowMs + elapsed;
  const season = status.season;
  const phase =
    season?.phase === "settled"
      ? "settled"
      : !season
        ? null
        : now < season.startsAtMs
          ? "scheduled"
          : now < season.closesAtMs
            ? "open"
            : "closing";
  const target =
    season &&
    (phase === "scheduled"
      ? season.startsAtMs
      : phase === "open"
        ? season.closesAtMs
        : season.settleDeadlineMs);
  const seconds = target ? Math.max(0, Math.ceil((target - now) / 1000)) : 0;
  const activeAttempt = me.attempt?.status === "active";
  const activeRun = me.run?.status === "active";
  const canEnter =
    activeRun && me.run?.badges === 8 && phase === "open" && !activeAttempt && !versionMismatch;
  const phaseLabel =
    phase === "open"
      ? leagueText(locale, "진행 중", "Open", "開催中")
      : phase === "scheduled"
        ? leagueText(locale, "시작 예정", "Scheduled", "開催予定")
        : phase === "closing"
          ? leagueText(locale, "마감됨", "Closed to entry", "入場締切")
          : leagueText(locale, "정산 완료", "Settled", "集計済み");
  return (
    <>
      {versionMismatch && (
        <div role="alert" className="grid gap-2 rounded-lg border p-4">
          <p>{text.version}</p>
          <Button onClick={() => window.location.reload()}>{text.refresh}</Button>
        </div>
      )}
      {me.attempt?.status === "expired" && <p role="status">{text.expired}</p>}
      {me.attempt?.status === "void" && <p role="status">{text.retired}</p>}
      <section className="grid gap-2 rounded-lg border p-4">
        <h2 className="text-lg font-bold">
          {leagueText(locale, "시즌", "Season", "シーズン")} {season?.id ?? "—"} ·{" "}
          {season ? phaseLabel : text.closed}
        </h2>
        {season && (
          <>
            <p>
              {formatKst(season.startsAtMs, locale)} → {formatKst(season.closesAtMs, locale)}
            </p>
            {(phase === "open" || phase === "closing") && (
              <p>
                {phase === "closing" && (
                  <>{leagueText(locale, "마감됨", "Closed", "入場締切")} — </>
                )}
                {leagueText(
                  locale,
                  "진행 중 도전 인정 기한",
                  "active challenges accepted until",
                  "進行中の挑戦の受付期限",
                )}{" "}
                {formatKst(season.settleDeadlineMs, locale)}
              </p>
            )}
            {phase !== "settled" && (
              <p role="timer">
                {leagueText(locale, "남은 시간", "Time left", "残り時間")}{" "}
                {Math.floor(seconds / 3600)}h {Math.floor(seconds / 60) % 60}m {seconds % 60}s
              </p>
            )}
          </>
        )}
      </section>
      <section className="grid gap-2 rounded-lg border p-4">
        <h2 className="text-lg font-bold">{me.user.nickname ?? text.unnamed}</h2>
        <p>
          {text.badges} {me.run?.badges ?? 0}/8
        </p>
        <p>
          {text.best}: {me.best?.score ?? "—"} / {me.best?.bestRank ?? "—"}
        </p>
        <div className="flex flex-wrap gap-3">
          {me.run?.status !== "challenging" && (
            <Button disabled={!activeRun && phase !== "open"} onClick={onGrowth}>
              {activeRun ? text.continueGrowth : text.grow}
            </Button>
          )}
          {activeAttempt ? (
            <Button disabled={versionMismatch} onClick={onResume}>
              {text.resume}
            </Button>
          ) : (
            <Button disabled={!canEnter} onClick={onEntry}>
              {text.enter}
            </Button>
          )}
        </div>
        {!canEnter && !activeAttempt && (
          <p className="text-muted-foreground text-sm">
            {versionMismatch
              ? text.version
              : phase !== "open"
                ? text.closed
                : leagueText(
                    locale,
                    `배지 8개가 필요합니다(현재 ${me.run?.badges ?? 0})`,
                    `Eight badges required (currently ${me.run?.badges ?? 0}).`,
                    `バッジ8個が必要です（現在${me.run?.badges ?? 0}個）。`,
                  )}
          </p>
        )}
      </section>
      <section className="grid gap-3">
        <h2 className="text-lg font-bold">{text.standings}</h2>
        <ol className="grid gap-3">
          {standings.entries.slice(0, 5).map(entry => (
            <li
              className="flex flex-wrap items-center gap-3 rounded-lg border p-3"
              key={entry.position}
            >
              <strong>
                {entry.position}. {entry.displayName} {entry.kind === "npc" ? "NPC" : ""}
              </strong>
              <span>
                {entry.score} {text.score}
              </span>
              <span
                className="ml-auto flex"
                aria-label={leagueText(locale, "등록 파티", "Registered party", "登録パーティ")}
              >
                {entry.publicParty.map((member, index) => {
                  const sprite = getBattlePokemonAssets(member.speciesId).front;
                  const columns = sprite.columns ?? 16,
                    rows = sprite.rows ?? 16;
                  return (
                    <span
                      key={index}
                      title={`#${member.speciesId} Lv${member.level}`}
                      className="inline-block size-9 bg-no-repeat [image-rendering:pixelated]"
                      style={{
                        backgroundImage: `url(${sprite.path})`,
                        backgroundSize: `${columns * 100}% ${rows * 100}%`,
                        backgroundPosition: `${((sprite.frame % columns) / (columns - 1)) * 100}% ${(Math.floor(sprite.frame / columns) / (rows - 1)) * 100}%`,
                      }}
                    />
                  );
                })}
              </span>
            </li>
          ))}
        </ol>
      </section>
      <p className="text-muted-foreground text-sm">{text.disclosure}</p>
    </>
  );
}
