"use client";

import type { PokeLoungeLocale } from "../../../poke-lounge-copy";
import { localizeRuntimeText } from "../i18n/runtime-game-localization";

interface TournamentResultTableRow {
  champion: boolean;
  cumulativeScore: string;
  displayName: string;
  rank: string;
  roundScore: string;
  tied: boolean;
}

interface TournamentResultTableView {
  labels: {
    champion: string;
    cumulativeScore: string;
    rank: string;
    roundScore: string;
    score: string;
    trainer: string;
  };
  rankingLabel: string | null;
  roundWinnerLabel: string | null;
  rows: TournamentResultTableRow[];
  statusLabel: string | null;
  title: string;
}

export function TournamentResultPanel({
  locale,
  localizedText,
  rawText,
}: {
  locale: PokeLoungeLocale;
  localizedText: string;
  rawText: string | null;
}) {
  const table = createTournamentResultTable(rawText, locale);
  const title = table?.title ?? localizedText.split("\n")[0];

  return (
    <section
      className="pointer-events-auto absolute top-3 left-1/2 z-[900] box-border max-h-[calc(100%-24px)] w-[min(calc(100%-24px),720px)] -translate-x-1/2 touch-pan-y overflow-x-hidden overflow-y-auto overscroll-contain rounded-[9px] border-[3px] border-[#4c6977] bg-[#fffdf0] p-3 text-left leading-[1.6] text-[#304550] shadow-[var(--hg-frame),0_3px_0_#304550] [overflow-wrap:anywhere] focus-visible:outline-3 focus-visible:outline-[var(--pl-color-gold)] focus-visible:-outline-offset-5"
      data-poke-lounge-tournament-result="true"
      aria-label={title}
      tabIndex={0}
      // Keep native keyboard scrolling without passing arrows/Space to the field.
      // Runtime key-up uses capture, so releasing a previously held key still works.
      onKeyDown={event => event.stopPropagation()}
    >
      <header className="flex items-center gap-2.5 rounded-md border-2 border-[#78909b] border-b-[3px] border-b-[#b89a4b] bg-[linear-gradient(#dcebf0_50%,#edf3ed_50%)] px-3 py-2.5 text-base leading-[1.45] whitespace-normal text-[#304550] [&>span]:grid [&>span]:size-[30px] [&>span]:shrink-0 [&>span]:place-items-center [&>span]:rounded-full [&>span]:border-2 [&>span]:border-[#a3893e] [&>span]:bg-[#f8dc7d] [&>span]:text-[#775b22] [&>span]:before:content-['★']">
        <span aria-hidden="true" />
        <strong>{title}</strong>
      </header>
      {table ? (
        <div className="mt-2 grid gap-2">
          {table.roundWinnerLabel ? (
            <p className="m-0 rounded-md border-2 border-[#ae9454] bg-[#fff3c5] px-3 py-2 text-sm font-black text-[#6a5126]">
              {table.roundWinnerLabel}
            </p>
          ) : null}
          <div className="rounded-[5px] border border-[#b0bdab]">
            <table
              className="w-full table-fixed border-collapse text-sm"
              data-poke-lounge-tournament-result-table="true"
            >
              {table.rankingLabel ? (
                <caption className="border-b border-[#b0bdab] bg-[#eef2e5] px-3 py-2 text-left text-xs font-black text-[#52614c]">
                  {table.rankingLabel}
                </caption>
              ) : null}
              <thead className="bg-[#dcebf0] text-xs text-[#405761]">
                <tr>
                  <th className="w-[18%] border-r border-[#b0bdab] px-1 py-2 text-center sm:px-2">
                    {table.labels.rank}
                  </th>
                  <th className="w-[42%] border-r border-[#b0bdab] px-1 py-2 text-left sm:w-[40%] sm:px-2">
                    {table.labels.trainer}
                  </th>
                  <th className="hidden w-[20%] border-r border-[#b0bdab] px-2 py-2 text-right sm:table-cell">
                    {table.labels.roundScore}
                  </th>
                  <th className="hidden w-[22%] px-2 py-2 text-right sm:table-cell">
                    {table.labels.cumulativeScore}
                  </th>
                  <th className="w-[40%] px-1 py-2 text-right sm:hidden">{table.labels.score}</th>
                </tr>
              </thead>
              <tbody>
                {table.rows.map(function mapResultRow(row, index) {
                  return (
                    <tr
                      key={`${row.rank}-${row.displayName}-${index}`}
                      className="border-t border-[#c6d0c1] odd:bg-[#fffdf0] even:bg-[#eef2e5] data-[champion=true]:bg-[#fff3c5]"
                      data-champion={row.champion}
                    >
                      <td className="border-r border-[#c6d0c1] px-1 py-2 text-center font-black sm:px-2">
                        {formatTournamentResultRank(row, locale)}
                      </td>
                      <td className="border-r border-[#c6d0c1] px-1 py-2 font-bold sm:px-2">
                        <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                          {row.champion ? (
                            <span className="shrink-0 rounded border border-[#ae9454] bg-[#f8dc7d] px-1.5 py-0.5 text-[0.64rem] font-black text-[#6a5126]">
                              {table.labels.champion}
                            </span>
                          ) : null}
                          <span className="min-w-0 truncate">{row.displayName}</span>
                        </span>
                      </td>
                      <td className="hidden border-r border-[#c6d0c1] px-2 py-2 text-right font-bold tabular-nums sm:table-cell">
                        +{row.roundScore}
                      </td>
                      <td className="hidden px-2 py-2 text-right font-black tabular-nums sm:table-cell">
                        {row.cumulativeScore}
                      </td>
                      <td className="px-1 py-2 text-right tabular-nums sm:hidden">
                        <span className="block text-xs font-bold">
                          {table.labels.roundScore} +{row.roundScore}
                        </span>
                        <strong className="block">
                          {table.labels.cumulativeScore} {row.cumulativeScore}
                        </strong>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {table.statusLabel ? (
            <p className="m-0 rounded-md border border-[#b0bdab] bg-[#f3f6ec] px-3 py-2 text-center text-xs font-black text-[#52614c]">
              {table.statusLabel}
            </p>
          ) : null}
        </div>
      ) : (
        <div className="mt-2 rounded-[5px] border border-[#b0bdab] bg-[repeating-linear-gradient(0deg,#fffdf0_0_25px,#eef2e5_25px_50px)] px-3 py-2.5 text-sm leading-[1.7] whitespace-pre-line text-[#304550] [overflow-wrap:anywhere]">
          {localizedText.split("\n").slice(1).join("\n")}
        </div>
      )}
    </section>
  );
}

function createTournamentResultTable(
  text: string | null,
  locale: PokeLoungeLocale,
): TournamentResultTableView | null {
  if (!text) return null;

  const lines = text
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean);
  const title = lines[0];

  if (!title) return null;

  const rows: TournamentResultTableRow[] = [];
  let roundWinnerLabel: string | null = null;
  let rankingLabel: string | null = null;
  let statusLabel: string | null = null;

  for (const line of lines.slice(1)) {
    const row = parseTournamentResultTableRow(line);

    if (row) {
      rows.push(row);
      continue;
    }

    if (line.startsWith("이번 라운드 우승 · ")) {
      roundWinnerLabel = localizeRuntimeText(line, locale);
      continue;
    }

    if (line === "현재 게임 누적 점수") {
      rankingLabel = localizeRuntimeText(line, locale);
      continue;
    }

    statusLabel = localizeTournamentResultStatus(line, locale);
  }

  if (rows.length === 0) return null;

  return {
    labels: getTournamentResultTableLabels(locale),
    rankingLabel,
    roundWinnerLabel,
    rows,
    statusLabel,
    title: localizeRuntimeText(title, locale),
  };
}

function parseTournamentResultTableRow(line: string): TournamentResultTableRow | null {
  const champion = line.startsWith("최종 우승 · ") || line.startsWith("우승 · ");
  const normalized = line
    .replace(/^누적 /, "")
    .replace(/^최종 우승 · /, "")
    .replace(/^우승 · /, "");
  const match = normalized.match(/^(공동 )?(\d+)위 (.+) · 이번 \+(.+) · 방 점수 (.+)$/);

  if (!match) return null;

  const [, tied, rank, displayName, roundScore, cumulativeScore] = match;

  if (!rank || !displayName || roundScore === undefined || cumulativeScore === undefined) {
    return null;
  }

  return {
    champion,
    cumulativeScore,
    displayName,
    rank,
    roundScore,
    tied: Boolean(tied),
  };
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

function formatTournamentResultRank(
  row: TournamentResultTableRow,
  locale: PokeLoungeLocale,
): string {
  if (locale === "en-US") return `${row.tied ? "Tied " : ""}#${row.rank}`;
  if (locale === "ja-JP") return `${row.tied ? "同率 " : ""}${row.rank}位`;
  return `${row.tied ? "공동 " : ""}${row.rank}위`;
}

function localizeTournamentResultStatus(line: string, locale: PokeLoungeLocale): string {
  const nextRoundPreparation = line.match(/^다음 라운드 준비 중 · (.+)$/);

  if (!nextRoundPreparation?.[1]) {
    return localizeRuntimeText(line, locale);
  }

  if (locale === "en-US") return `Next round preparation · ${nextRoundPreparation[1]}`;
  if (locale === "ja-JP") return `次のラウンド準備中 · ${nextRoundPreparation[1]}`;
  return line;
}
