"use client";

import { useEffect, useId, useRef, useState, type MutableRefObject } from "react";
import { Button } from "@/components/ui/button";
import { LeagueApiError } from "../api/core";
import {
  getHallOfFame,
  getMySeasons,
  type HallOfFameView,
  type MySeasonsView,
  type StandingsView,
  type StandingEntry,
} from "../api/league";
import type { LeagueLocale, MeView, StatusView } from "../contract";
import { getLeagueCopy } from "../shell/copy";
import { loadLeagueGameData } from "../shell/game-data";
import { leagueErrorMessage, useRateLimitCooldown } from "../shell/league-errors";
import { getRecordsCopy } from "./copy";
import { PartyCard } from "./party-card";

export interface RecordsCache {
  hall?: { key: number; value: HallOfFameView };
  mine?: { key: string; value: MySeasonsView };
}

function validEntries(entries: StandingEntry[]): boolean {
  return Array.isArray(entries) && entries.every(entry => Array.isArray(entry?.publicParty));
}
function corruptResponse() {
  return new LeagueApiError(500, "LEAGUE_CORRUPT", undefined, false);
}
async function readHall() {
  const value = await getHallOfFame();
  if (
    !Array.isArray(value?.seasons) ||
    !value.seasons.every(season => validEntries(season?.entries))
  )
    throw corruptResponse();
  return value;
}
async function readMine() {
  const value = await getMySeasons();
  if (!Array.isArray(value?.seasons)) throw corruptResponse();
  return value;
}
function mustLeave(error: unknown): error is LeagueApiError {
  return error instanceof LeagueApiError && (error.status === 401 || error.status === 404);
}

export function RecordsScreen({
  locale,
  status,
  me,
  standings,
  cache,
  onHome,
}: {
  locale: LeagueLocale;
  status: StatusView;
  me: MeView;
  standings: StandingsView;
  cache: MutableRefObject<RecordsCache>;
  onHome(error?: unknown): void;
}) {
  const text = getLeagueCopy(locale);
  const copy = getRecordsCopy(locale);
  const tabs = ["standings", "hall", "mine"] as const;
  const [tab, setTab] = useState<(typeof tabs)[number]>("standings");
  const id = useId();
  const seasonKey = status.season?.id ?? 0;
  const mineKey = `${seasonKey}:${me.best?.recordedAtMs ?? 0}`;
  const [hall, setHall] = useState(() =>
    cache.current.hall?.key === seasonKey ? cache.current.hall.value : null,
  );
  const [mine, setMine] = useState(() =>
    cache.current.mine?.key === mineKey ? cache.current.mine.value : null,
  );
  const [hallError, setHallError] = useState<unknown>(null);
  const [mineError, setMineError] = useState<unknown>(null);
  const [hallPending, setHallPending] = useState(!hall);
  const [minePending, setMinePending] = useState(!mine);
  const hallBlocked = useRateLimitCooldown(hallError);
  const mineBlocked = useRateLimitCooldown(mineError);
  const [namesReady, setNamesReady] = useState(false);
  const [namesFailed, setNamesFailed] = useState(false);
  const live = useRef(false);
  const initialRequests = useRef<Promise<
    [PromiseSettledResult<HallOfFameView>, PromiseSettledResult<MySeasonsView>]
  > | null>(null);

  useEffect(() => {
    live.current = true;
    let disposed = false;
    // Share the same requests when React replays this effect in development.
    initialRequests.current ??= Promise.allSettled([
      cache.current.hall?.key === seasonKey
        ? Promise.resolve(cache.current.hall.value)
        : readHall(),
      cache.current.mine?.key === mineKey ? Promise.resolve(cache.current.mine.value) : readMine(),
    ]);
    void initialRequests.current.then(([hallResult, mineResult]) => {
      if (disposed) return;
      for (const result of [hallResult, mineResult]) {
        if (result.status === "rejected" && mustLeave(result.reason)) {
          onHome(result.reason.status === 404 ? undefined : result.reason);
          return;
        }
      }
      if (hallResult.status === "fulfilled") {
        cache.current.hall = { key: seasonKey, value: hallResult.value };
        setHall(hallResult.value);
      } else setHallError(hallResult.reason);
      if (mineResult.status === "fulfilled") {
        cache.current.mine = { key: mineKey, value: mineResult.value };
        setMine(mineResult.value);
      } else setMineError(mineResult.reason);
      setHallPending(false);
      setMinePending(false);
    });
    void loadLeagueGameData().then(
      () => {
        if (!disposed) setNamesReady(true);
      },
      () => {
        if (!disposed) setNamesFailed(true);
      },
    );
    return () => {
      disposed = true;
      live.current = false;
    };
  }, [cache, seasonKey, mineKey, onHome]);

  async function reload(target: "hall" | "mine") {
    if (target === "hall" ? hallPending || hallBlocked : minePending || mineBlocked) return;
    if (target === "hall") setHallPending(true);
    else setMinePending(true);
    try {
      if (target === "hall") {
        const value = await readHall();
        if (!live.current) return;
        cache.current.hall = { key: seasonKey, value };
        setHall(value);
        setHallError(null);
      } else {
        const value = await readMine();
        if (!live.current) return;
        cache.current.mine = { key: mineKey, value };
        setMine(value);
        setMineError(null);
      }
    } catch (error) {
      if (!live.current) return;
      if (mustLeave(error)) onHome(error.status === 404 ? undefined : error);
      else if (target === "hall") setHallError(error);
      else setMineError(error);
    } finally {
      if (live.current) {
        if (target === "hall") setHallPending(false);
        else setMinePending(false);
      }
    }
  }

  const seasons = mine ? [...mine.seasons] : [];
  if (mine && status.season && me.best) {
    const index = seasons.findIndex(season => season.seasonId === status.season?.id);
    const current = {
      seasonId: status.season.id,
      bestScore: me.best.score,
      bestRank: me.best.bestRank,
      finalRank: seasons[index]?.finalRank ?? null,
    };
    if (index < 0) seasons.push(current);
    else seasons[index] = current;
  }
  seasons.sort((a, b) => b.seasonId - a.seasonId);
  const error = tab === "hall" ? hallError : mineError;
  const pending = tab === "hall" ? hallPending : minePending;
  const blocked = tab === "hall" ? hallBlocked : mineBlocked;
  return (
    <div className="grid min-w-0 gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold">{text.records}</h2>
        <Button variant="outline" onClick={() => onHome()}>
          {text.home}
        </Button>
      </div>
      <div role="tablist" aria-label={text.records} className="flex flex-wrap gap-2">
        {tabs.map((value, index) => (
          <Button
            key={value}
            id={`${id}-${value}-tab`}
            role="tab"
            aria-selected={tab === value}
            aria-controls={tab === value ? `${id}-${value}-panel` : undefined}
            tabIndex={tab === value ? 0 : -1}
            variant={tab === value ? "default" : "outline"}
            onClick={() => setTab(value)}
            onKeyDown={event => {
              let next = index;
              if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
              else if (event.key === "ArrowLeft") next = (index + tabs.length - 1) % tabs.length;
              else if (event.key === "Home") next = 0;
              else if (event.key === "End") next = tabs.length - 1;
              else return;
              event.preventDefault();
              setTab(tabs[next]);
              event.currentTarget.parentElement
                ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
                [next]?.focus();
            }}
          >
            {copy[value]}
          </Button>
        ))}
      </div>
      {namesFailed && <p role="status">{copy.namesFailed}</p>}
      <div
        role="tabpanel"
        id={`${id}-${tab}-panel`}
        aria-labelledby={`${id}-${tab}-tab`}
        tabIndex={0}
        className="grid min-w-0 gap-3"
      >
        {tab === "standings" ? (
          !validEntries(standings.entries) ? (
            <p role="alert">{leagueErrorMessage(corruptResponse(), locale)}</p>
          ) : standings.entries.length === 0 ? (
            <p>{copy.noSeason}</p>
          ) : (
            <>
              <h3 className="font-bold">
                {copy.season} {standings.seasonId}
              </h3>
              {standings.entries.map(entry => (
                <PartyCard
                  key={entry.position}
                  entry={entry}
                  locale={locale}
                  namesReady={namesReady}
                  isMe={
                    entry.kind === "player" &&
                    entry.displayName === me.user.nickname &&
                    entry.score === me.best?.score
                  }
                />
              ))}
            </>
          )
        ) : (
          <>
            {pending && <p role="status">{text.loading}</p>}
            {error != null && (
              <div className="grid gap-2" role="alert">
                <p>{leagueErrorMessage(error, locale)}</p>
                <Button disabled={pending || blocked} onClick={() => void reload(tab)}>
                  {copy.reload}
                </Button>
              </div>
            )}
            {tab === "hall" &&
              hall &&
              (hall.seasons.length === 0 ? (
                <p>{copy.noHall}</p>
              ) : (
                [...hall.seasons]
                  .sort((a, b) => b.seasonId - a.seasonId)
                  .map((season, index) => (
                    <details
                      key={season.seasonId}
                      open={index === 0}
                      className="min-w-0 rounded-lg border p-3"
                    >
                      <summary className="cursor-pointer font-bold">
                        {copy.season} {season.seasonId}
                      </summary>
                      <div className="mt-3 grid gap-3">
                        {season.entries.map(entry => (
                          <PartyCard
                            key={entry.position}
                            entry={entry}
                            locale={locale}
                            namesReady={namesReady}
                          />
                        ))}
                      </div>
                    </details>
                  ))
              ))}
            {tab === "mine" &&
              mine &&
              (seasons.length === 0 ? (
                <p>{copy.noRecords}</p>
              ) : (
                <table className="w-full table-fixed text-left text-sm [overflow-wrap:anywhere]">
                  <thead>
                    <tr>
                      {[copy.season, copy.bestScore, copy.bestRank, copy.finalRank].map(label => (
                        <th key={label} scope="col" className="p-2">
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {seasons.map(season => (
                      <tr key={season.seasonId} className="border-t">
                        <th scope="row" className="p-2">
                          {season.seasonId}
                        </th>
                        <td className="p-2">{season.bestScore}</td>
                        <td className="p-2">{season.bestRank ?? copy.outside}</td>
                        <td className="p-2">{season.finalRank ?? copy.unsettled}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ))}
          </>
        )}
      </div>
    </div>
  );
}
