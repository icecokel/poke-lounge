"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { MobileTaskScreen } from "../../../mobile/mobile-task-screen";
import type { PokeLoungeCopy, PokeLoungeLocale } from "../../../poke-lounge-copy";
import { localizeRuntimeText } from "../i18n/runtime-game-localization";
import {
  formatTournamentScore,
  type TournamentResultPanelViewModel,
  type TournamentResultRow,
} from "../tournament/tournament-result-view-model";

export function TournamentResultPanel({
  copy,
  locale,
  onClose,
  onLobby,
  onNewGame,
  panel,
}: {
  copy: PokeLoungeCopy;
  locale: PokeLoungeLocale;
  /** Present only for the "previous round" replay, which also gets its own title. */
  onClose?(): void;
  onLobby(): void;
  onNewGame(): void;
  panel: TournamentResultPanelViewModel;
}) {
  const final = panel.final;
  // The field viewport is short on every layout (the game is a narrow column even on desktop),
  // so non-final panels render over the whole game root rather than inside the field.
  const [rootTarget, setRootTarget] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (final) return;
    setRootTarget(document.querySelector<HTMLElement>("[data-testid='poke-lounge-page']"));
  }, [final]);
  const labels = getTournamentResultTableLabels(locale);
  const title = onClose
    ? localizeRuntimeText("지난 라운드 결과", locale)
    : localizeRuntimeText(panel.title, locale);
  const roundWinnerLabel = panel.roundWinnerLabel
    ? localizeRuntimeText(panel.roundWinnerLabel, locale)
    : null;
  const rankingLabel = localizeRuntimeText(panel.rankingLabel, locale);
  const statusLabel = localizeRuntimeText(panel.nextActionLabel, locale);
  const actions = (
    <div className="grid grid-cols-2 gap-2 [&_button]:min-h-12 [&_button]:rounded-[7px] [&_button]:border-2 [&_button]:border-[#577781] [&_button]:bg-[linear-gradient(#fffdf0_50%,#dce7e2_50%)] [&_button]:font-bold [&_button]:text-[#304550] [&_button]:shadow-[inset_0_0_0_2px_#fffdf0,0_2px_0_#304550]">
      <Button type="button" variant="outline" onClick={onLobby}>
        {copy.resultLobby}
      </Button>
      <Button type="button" variant="outline" onClick={onNewGame}>
        {copy.resultNewGame}
      </Button>
    </div>
  );

  const section = (
    <section
      className={
        final
          ? "text-left leading-[1.6] text-[#304550] [overflow-wrap:anywhere]"
          : "pointer-events-auto absolute top-3 left-1/2 z-[900] box-border max-h-[calc(100%-24px)] w-[min(calc(100%-24px),720px)] -translate-x-1/2 touch-pan-y overflow-x-hidden overflow-y-auto overscroll-contain rounded-[9px] border-[3px] border-[#4c6977] bg-[#fffdf0] p-3 text-left leading-[1.6] text-[#304550] shadow-[var(--hg-frame),0_3px_0_#304550] [overflow-wrap:anywhere] focus-visible:outline-3 focus-visible:outline-[var(--pl-color-gold)] focus-visible:-outline-offset-5"
      }
      data-poke-lounge-tournament-result="true"
      aria-label={final ? undefined : title}
      tabIndex={final ? undefined : 0}
      // Keep native keyboard scrolling without passing arrows/Space to the field.
      // Runtime key-up uses capture, so releasing a previously held key still works.
      onKeyDown={event => event.stopPropagation()}
    >
      {!final ? (
        <header className="flex items-center gap-2.5 rounded-md border-2 border-[#78909b] border-b-[3px] border-b-[#b89a4b] bg-[linear-gradient(#dcebf0_50%,#edf3ed_50%)] px-3 py-1.5 text-base sm:py-2.5 leading-[1.45] whitespace-normal text-[#304550] [&>span]:grid [&>span]:size-[30px] [&>span]:shrink-0 [&>span]:place-items-center [&>span]:rounded-full [&>span]:border-2 [&>span]:border-[#a3893e] [&>span]:bg-[#f8dc7d] [&>span]:text-[#775b22] [&>span]:before:content-['★']">
          <span aria-hidden="true" />
          <strong>{title}</strong>
          {onClose ? (
            <Button type="button" variant="outline" onClick={onClose} className="ml-auto">
              {copy.settingsClose}
            </Button>
          ) : null}
        </header>
      ) : null}
      <div className="mt-2 grid gap-2">
        {roundWinnerLabel ? (
          <p className="m-0 rounded-md border-2 border-[#ae9454] bg-[#fff3c5] px-3 py-1 text-sm font-black sm:py-2 text-[#6a5126]">
            {roundWinnerLabel}
          </p>
        ) : null}
        <div className="rounded-[5px] border border-[#b0bdab]">
          <table
            className="w-full table-fixed border-collapse text-sm"
            data-poke-lounge-tournament-result-table="true"
          >
            <caption className="border-b border-[#b0bdab] bg-[#eef2e5] px-3 py-1 text-left text-xs sm:py-2 font-black text-[#52614c]">
              {rankingLabel}
            </caption>
            <thead className="bg-[#dcebf0] text-xs text-[#405761]">
              <tr>
                <th className="w-[18%] border-r border-[#b0bdab] px-1 py-1 text-center sm:py-2 sm:px-2">
                  {labels.rank}
                </th>
                <th className="w-[42%] border-r border-[#b0bdab] px-1 py-1 text-left sm:py-2 sm:w-[40%] sm:px-2">
                  {labels.trainer}
                </th>
                <th className="hidden w-[20%] border-r border-[#b0bdab] px-2 py-1 text-right sm:py-2 sm:table-cell">
                  {labels.roundScore}
                </th>
                <th className="hidden w-[22%] px-2 py-1 text-right sm:py-2 sm:table-cell">
                  {labels.cumulativeScore}
                </th>
                <th className="w-[40%] px-1 py-1 text-right sm:py-2 sm:hidden">{labels.score}</th>
              </tr>
            </thead>
            <tbody>
              {panel.rows.map(function mapResultRow(row, index) {
                const roundScore = formatTournamentScore(row.roundScore);
                const cumulativeScore = formatTournamentScore(row.cumulativeScore);
                return (
                  <tr
                    key={`${row.rank}-${row.displayName}-${index}`}
                    className="border-t border-[#c6d0c1] odd:bg-[#fffdf0] even:bg-[#eef2e5] data-[champion=true]:bg-[#fff3c5]"
                    data-champion={row.champion}
                  >
                    <td className="border-r border-[#c6d0c1] px-1 py-1 text-center sm:py-2 font-black sm:px-2">
                      {formatTournamentResultRank(row, locale)}
                    </td>
                    <td className="border-r border-[#c6d0c1] px-1 py-1 font-bold sm:px-2 sm:py-2">
                      <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                        {row.champion ? (
                          <span className="shrink-0 rounded border border-[#ae9454] bg-[#f8dc7d] px-1.5 py-0.5 text-[0.64rem] font-black text-[#6a5126]">
                            {labels.champion}
                          </span>
                        ) : null}
                        <span className="min-w-0 truncate">
                          {localizeRuntimeText(row.displayName, locale)}
                        </span>
                      </span>
                    </td>
                    <td className="hidden border-r border-[#c6d0c1] px-2 py-1 text-right sm:py-2 font-bold tabular-nums sm:table-cell">
                      +{roundScore}
                    </td>
                    <td className="hidden px-2 py-1 text-right sm:py-2 font-black tabular-nums sm:table-cell">
                      {cumulativeScore}
                    </td>
                    <td className="px-1 py-1 text-right sm:py-2 tabular-nums sm:hidden">
                      <span className="block text-xs font-bold">
                        {labels.roundScore} +{roundScore}
                      </span>
                      <strong className="block text-xs">
                        {labels.cumulativeScore} {cumulativeScore}
                      </strong>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!onClose ? (
          <p className="m-0 rounded-md border border-[#b0bdab] bg-[#f3f6ec] px-3 py-1 text-center sm:py-2 text-xs font-black text-[#52614c]">
            {statusLabel}
          </p>
        ) : null}
      </div>
    </section>
  );

  return final ? (
    <MobileTaskScreen
      title={title}
      name="tournament-result"
      backLabel={copy.resultLobby}
      footer={actions}
    >
      {section}
    </MobileTaskScreen>
  ) : rootTarget ? (
    createPortal(section, rootTarget)
  ) : (
    section
  );
}

function formatTournamentResultRank(row: TournamentResultRow, locale: PokeLoungeLocale): string {
  if (locale === "en-US") return `${row.tied ? "Tied " : ""}#${row.rank}`;
  if (locale === "ja-JP") return `${row.tied ? "同率 " : ""}${row.rank}位`;
  return `${row.tied ? "공동 " : ""}${row.rank}위`;
}

function getTournamentResultTableLabels(locale: PokeLoungeLocale) {
  if (locale === "en-US") {
    return {
      champion: "Overall champion",
      cumulativeScore: "Total",
      rank: "Rank",
      roundScore: "Round",
      score: "Score",
      trainer: "Trainer",
    };
  }

  if (locale === "ja-JP") {
    return {
      champion: "総合優勝",
      cumulativeScore: "累計",
      rank: "順位",
      roundScore: "今回",
      score: "得点",
      trainer: "トレーナー",
    };
  }

  return {
    champion: "최종 우승",
    cumulativeScore: "누적",
    rank: "순위",
    roundScore: "이번",
    score: "점수",
    trainer: "트레이너",
  };
}
