"use client";

import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { PixelButton } from "@/components/poke-lounge/ui/poke-lounge-ui-primitives";
import { getBattlePokemonAssets } from "@/components/poke-lounge/runtime/game/battle/battle-pokemon-assets";
import type { LeagueLocale, MeView, StatusView } from "../contract";
import type { StandingsView } from "../api/league";
import { getLeagueCopy, leagueText } from "./copy";
import { formatKst } from "./kst";
import { LeagueGuide } from "./league-guide";
import styles from "./league-frame.module.css";

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
  onRecords,
  onRefresh,
  onAccount,
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
  onRecords(): void;
  onRefresh(): void;
  onAccount(): void;
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
    // Keep the received phase's countdown at zero until the player reloads.
    (season.phase === "scheduled"
      ? season.startsAtMs
      : season.phase === "open"
        ? season.closesAtMs
        : season.settleDeadlineMs);
  const seconds = target ? Math.max(0, Math.ceil((target - now) / 1000)) : 0;
  const activeAttempt = me.attempt?.status === "active";
  const activeRun = me.run?.status === "active";
  const requiredBadges = status.test?.badgesRequired ?? 8;
  const canEnter =
    activeRun &&
    (me.run?.badges ?? 0) >= requiredBadges &&
    phase === "open" &&
    !activeAttempt &&
    !versionMismatch;
  const phaseLabel =
    phase === "open"
      ? leagueText(locale, "진행 중", "Open", "開催中")
      : phase === "scheduled"
        ? leagueText(locale, "시작 예정", "Scheduled", "開催予定")
        : phase === "closing"
          ? leagueText(locale, "마감됨", "Closed to entry", "入場締切")
          : leagueText(locale, "정산 완료", "Settled", "集計済み");
  const badges = me.run?.badges ?? 0;
  const name = me.user.nickname;
  const lead = name
    ? leagueText(locale, `${name}, 어서 와!`, `Welcome, ${name}!`, `${name}、ようこそ！`)
    : leagueText(locale, "어서 와, 도전자!", "Welcome, challenger!", "ようこそ、挑戦者！");
  const line = versionMismatch
    ? text.version
    : activeAttempt
      ? leagueText(
          locale,
          "도전이 진행 중이야. 이어서 싸우자!",
          "Your challenge is underway. Let's keep going!",
          "挑戦の途中だよ。続きから戦おう！",
        )
      : phase === "scheduled"
        ? leagueText(
            locale,
            "시즌이 곧 시작돼. 조금만 기다려 줘!",
            "The season starts soon. Hang tight!",
            "シーズンはもうすぐ始まるよ。少し待っててね！",
          )
        : phase !== "open"
          ? leagueText(
              locale,
              "이번 시즌 접수는 끝났어. 다음 시즌을 기다려 줘!",
              "Entries for this season are closed. See you next season!",
              "今シーズンの受付は終わったよ。次のシーズンを待っててね！",
            )
          : canEnter
            ? leagueText(
                locale,
                `배지 ${requiredBadges}개를 다 모았구나! 이제 리그에 도전할 수 있어!`,
                `All ${requiredBadges} badges! You can now take on the League!`,
                `バッジ${requiredBadges}個そろったね！リーグに挑戦できるよ！`,
              )
            : activeRun
              ? leagueText(
                  locale,
                  "필드에 나타나는 관장을 찾아 배지를 모아 봐!",
                  "Find the Gym Leaders roaming the field and collect badges!",
                  "フィールドに現れるジムリーダーを探してバッジを集めよう！",
                )
              : leagueText(
                  locale,
                  "파트너를 골라 리그를 향한 여행을 시작해 보자!",
                  "Pick a partner and start your journey to the League!",
                  "パートナーを選んでリーグへの旅を始めよう！",
                );
  const days = Math.floor(seconds / 86400);
  const clock = [Math.floor(seconds / 3600) % 24, Math.floor(seconds / 60) % 60, seconds % 60]
    .map(v => String(v).padStart(2, "0"))
    .join(":");
  const growthButton = me.run?.status !== "challenging" && (
    <PixelButton
      className={canEnter ? styles.secondary : styles.primary}
      disabled={!activeRun && phase !== "open"}
      onClick={onGrowth}
    >
      {activeRun ? text.continueGrowth : text.grow}
      <ChevronRight size={18} aria-hidden="true" />
    </PixelButton>
  );
  const challengeButton = activeAttempt ? (
    <PixelButton className={styles.primary} disabled={versionMismatch} onClick={onResume}>
      {text.resume}
      <ChevronRight size={18} aria-hidden="true" />
    </PixelButton>
  ) : (
    <PixelButton
      className={canEnter ? styles.primary : styles.secondary}
      disabled={!canEnter}
      onClick={onEntry}
    >
      {text.enter}
      <ChevronRight size={18} aria-hidden="true" />
    </PixelButton>
  );
  return (
    <>
      <LeagueGuide locale={locale} lead={lead} line={line} compact />
      <div className={styles.content}>
        {versionMismatch && (
          <div role="alert" className={styles.panel}>
            <p className={styles.message}>{text.version}</p>
            <PixelButton className={styles.primary} onClick={() => window.location.reload()}>
              {text.refresh}
            </PixelButton>
          </div>
        )}
        {me.attempt?.status === "expired" && (
          <p role="status" className={styles.meta}>
            {text.expired}
          </p>
        )}
        {me.attempt?.status === "void" && (
          <p role="status" className={styles.meta}>
            {text.retired}
          </p>
        )}
        <section className={styles.panel} aria-labelledby="league-trainer-card">
          <h2 id="league-trainer-card" className={styles.panelTitle}>
            <span>{name ?? text.unnamed}</span>
            <PixelButton className={styles.small} onClick={onAccount}>
              {text.account}
            </PixelButton>
          </h2>
          <div className={styles.badges} role="img" aria-label={`${text.badges} ${badges}/8`}>
            {Array.from({ length: 8 }, (_, index) => (
              <span key={index} className={styles.badge} data-earned={index < badges} />
            ))}
          </div>
          <p className={styles.meta}>
            <span className="inline-block">
              {text.badges} {badges}/8
            </span>
            {" · "}
            <span className="inline-block">
              {text.best}: {me.best?.score ?? "—"} / {me.best?.bestRank ?? "—"}
            </span>
          </p>
          <div className={styles.actions}>
            {canEnter ? (
              <>
                {challengeButton}
                {growthButton}
              </>
            ) : (
              <>
                {activeAttempt ? challengeButton : growthButton}
                {activeAttempt ? growthButton : challengeButton}
              </>
            )}
          </div>
          {!canEnter && !activeAttempt && (
            <p className={styles.hint}>
              {versionMismatch
                ? text.version
                : phase !== "open"
                  ? text.closed
                  : leagueText(
                      locale,
                      `배지 ${requiredBadges}개가 필요합니다(현재 ${badges})`,
                      `${requiredBadges === 8 ? "Eight" : requiredBadges} badges required (currently ${badges}).`,
                      `バッジ${requiredBadges}個が必要です（現在${badges}個）。`,
                    )}
            </p>
          )}
        </section>
        <section className={styles.panel} aria-labelledby="league-season">
          <h2 id="league-season" className={styles.panelTitle}>
            <span>
              {leagueText(locale, "시즌", "Season", "シーズン")} {season?.id ?? "—"}
            </span>
            <span className={styles.tag} data-tone={phase === "open" ? undefined : "muted"}>
              {season ? phaseLabel : text.closed}
            </span>
          </h2>
          {season && (
            <>
              {phase !== "settled" && (
                <div>
                  <p className={styles.meta}>
                    {phase === "scheduled"
                      ? leagueText(locale, "시작까지", "Starts in", "開始まで")
                      : phase === "open"
                        ? leagueText(locale, "접수 마감까지", "Entries close in", "受付締切まで")
                        : leagueText(locale, "정산까지", "Settles in", "集計まで")}
                  </p>
                  <p role="timer" className={styles.countdown}>
                    {days > 0 && leagueText(locale, `${days}일 `, `${days}d `, `${days}日 `)}
                    {clock}
                  </p>
                </div>
              )}
              <p className={styles.meta}>
                <span className="inline-block">{formatKst(season.startsAtMs, locale)}</span>
                {" → "}
                <span className="inline-block">{formatKst(season.closesAtMs, locale)}</span>
                {(phase === "open" || phase === "closing") && (
                  <>
                    <br />
                    {phase === "closing" && (
                      <>{leagueText(locale, "마감됨", "Closed", "入場締切")} — </>
                    )}
                    {leagueText(
                      locale,
                      "진행 중 도전 인정 기한",
                      "active challenges accepted until",
                      "進行中の挑戦の受付期限",
                    )}{" "}
                    <span className="inline-block">
                      {formatKst(season.settleDeadlineMs, locale)}
                    </span>
                  </>
                )}
              </p>
              {phase !== "settled" && seconds === 0 && (
                <div className={styles.actions}>
                  <p role="status" className={styles.meta}>
                    {leagueText(
                      locale,
                      `${season.phase === "scheduled" ? "시작" : season.phase === "open" ? "마감" : "정산"} 시각이 지났습니다. 새 상태를 확인하려면 다시 불러오세요`,
                      `The ${season.phase === "scheduled" ? "start" : season.phase === "open" ? "entry closing" : "settlement"} time has passed. Reload to check the latest status.`,
                      `${season.phase === "scheduled" ? "開始" : season.phase === "open" ? "締切" : "集計"}時刻を過ぎました。最新の状態を確認するには再読み込みしてください。`,
                    )}
                  </p>
                  <PixelButton className={styles.secondary} onClick={onRefresh}>
                    {leagueText(locale, "다시 불러오기", "Reload", "再読み込み")}
                  </PixelButton>
                </div>
              )}
            </>
          )}
        </section>
        <section className={styles.panel} aria-labelledby="league-standings">
          <h2 id="league-standings" className={styles.panelTitle}>
            <span>{text.standings}</span>
            <PixelButton className={styles.small} onClick={onRecords}>
              {text.records}
            </PixelButton>
          </h2>
          <ol className={styles.standings}>
            {standings.entries.slice(0, 5).map(entry => (
              <li className={styles.standing} key={entry.position} data-position={entry.position}>
                <span className={styles.rank}>{entry.position}</span>
                <span className={styles.standingName}>
                  {entry.displayName}
                  {entry.kind === "npc" && <small>NPC</small>}
                  <small>
                    {entry.score} {text.score}
                  </small>
                </span>
                <span
                  className={styles.party}
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
                        className={styles.sprite}
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
        <p className={styles.hint}>{text.disclosure}</p>
      </div>
    </>
  );
}
