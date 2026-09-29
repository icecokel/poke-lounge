"use client";
import { POKE_LOUNGE_CLOCK_REFRESH_INTERVAL_MS } from "@poke-lounge/battle/timing";

import {
  createTournamentBracketPreview,
  formatRemainingTime,
} from "@/features/poke-lounge/presentation/tournament/tournament-view-model";
import type {
  TournamentBracketState,
  TournamentParticipant,
  TournamentRoundSlot,
} from "@poke-lounge/battle/tournament-bracket";
import { useEffect, useState } from "react";
import type { PokeLoungeCopy } from "../../../poke-lounge-copy";
import { PixelPanel } from "../../../ui/poke-lounge-ui-primitives";
import { localizeRuntimeText, localizeTrainerName } from "../i18n/runtime-game-localization";
import type { TournamentStateRoomPayload } from "../network/tournament-projection";
import { ROUND_TOTAL_COUNT } from "../round/round-state";

interface OpeningPair {
  bye: boolean;
  id: string;
  participants: TournamentParticipant[];
  winnerPlayerId?: string | null;
}

export function TournamentBracketPanel({
  copy,
  projection,
  text,
}: {
  copy: PokeLoungeCopy;
  projection: TournamentStateRoomPayload;
  text: string;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(
      () => setNow(Date.now()),
      POKE_LOUNGE_CLOCK_REFRESH_INTERVAL_MS,
    );
    return () => window.clearInterval(timer);
  }, []);
  const preview = createTournamentBracketPreview(projection);
  const ownName = projection.participants.find(
    player => player.playerId === projection.ownPlayerId,
  )?.displayName;
  const me = copy.locale === "ko-KR" ? "나" : copy.locale === "ja-JP" ? "自分" : "YOU";

  const ownPosition = (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 rounded-[5px] border-2 border-[#9ae8ff] bg-[#153e56] px-3 py-[9px] text-left text-sm text-white [overflow-wrap:anywhere] [&>b]:rounded-[3px] [&>b]:bg-[#9ae8ff] [&>b]:px-[7px] [&>b]:py-[3px] [&>b]:text-[#082733] [&>span]:basis-full [&>span]:text-xs" data-poke-lounge-own-position>
      <b>{me}</b>
      <strong>{localizeTrainerName(ownName ?? me, copy.locale)}</strong>
      <span>
        {preview?.ownPositionLabel
          ? localizeRuntimeText(preview.ownPositionLabel, copy.locale)
          : copy.locale === "ko-KR"
            ? "대진 배정 중"
            : copy.locale === "ja-JP"
              ? "組み合わせ待機中"
              : "Waiting for bracket"}
      </span>
    </div>
  );

  if (!preview?.bracket.currentRound) {
    return (
      <PixelPanel
        className="pointer-events-none absolute top-2 left-1/2 z-[900] box-border w-[min(calc(100%-16px),720px)] -translate-x-1/2 rounded-[9px] border-[3px] border-[#506d7b] bg-[#293d48] px-3 py-2.5 text-center text-sm leading-[1.45] font-black whitespace-pre-line text-[var(--pl-color-surface-raised)] shadow-[inset_0_0_0_2px_#b0c1b3,0_4px_0_#20333c] min-[769px]:w-[min(calc(100%-40px),860px)]"
        data-poke-lounge-tournament-announcement="true"
        role="status"
      >
        {ownPosition}
        <p>{localizeRuntimeText(text, copy.locale)}</p>
      </PixelPanel>
    );
  }

  const remainingMs = Math.max(0, (projection.roomRound.endsAtMs ?? now) - now);
  const pairs = preview.bracket.currentRound.slots.map(function mapSlot(slot) {
    return createOpeningPair(preview.bracket, slot);
  });
  const finalOnly = pairs.length === 1 && pairs[0]!.participants.length === 2;
  const middleIndex = Math.ceil(pairs.length / 2);
  const leftPairs = finalOnly
    ? [{ ...pairs[0]!, participants: [pairs[0]!.participants[0]!] }]
    : pairs.slice(0, middleIndex);
  const rightPairs = finalOnly
    ? [{ ...pairs[0]!, participants: [pairs[0]!.participants[1]!] }]
    : pairs.slice(middleIndex);

  return (
    <PixelPanel
      className="pointer-events-none absolute top-2 left-1/2 z-[900] box-border w-[min(calc(100%-16px),720px)] -translate-x-1/2 rounded-[9px] border-[3px] border-[#506d7b] bg-[#293d48] px-3 py-2.5 text-center text-sm leading-[1.45] font-black whitespace-pre-line text-[var(--pl-color-surface-raised)] shadow-[inset_0_0_0_2px_#b0c1b3,0_4px_0_#20333c] min-[769px]:w-[min(calc(100%-40px),860px)]"
      data-poke-lounge-tournament-announcement="true"
      data-poke-lounge-tournament-bracket="true"
      data-bracket-flow="outside-in"
      role="status"
    >
      <span className="sr-only">{localizeRuntimeText(text, copy.locale)}</span>
      <div className="grid gap-2 whitespace-normal min-[769px]:gap-3">
        <header className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-2.5 border-b-2 border-[#f1cc62] pb-[7px] text-left text-[9px] min-[769px]:text-xs [&_strong]:text-center [&_strong]:text-[15px] [&_strong]:text-[var(--pl-color-gold)] min-[769px]:[&_strong]:text-xl [&_span:last-child]:text-right">
          <span>
            ROUND {projection.roundIndex} / {ROUND_TOTAL_COUNT}
          </span>
          <strong>{copy.game.tournamentBracket}</strong>
          <span>
            {projection.roomStatus === "round-started" && remainingMs > 0
              ? copy.game.startsAfter(formatRemainingTime(remainingMs))
              : localizeRuntimeText(preview.openingLabel, copy.locale)}
          </span>
        </header>
        {ownPosition}
        <div className="grid min-h-[174px] grid-cols-[minmax(0,1fr)_72px_minmax(0,1fr)] items-stretch py-1 min-[769px]:min-h-[210px] min-[769px]:grid-cols-[minmax(0,1fr)_56px_minmax(0,1fr)]">
          <TournamentBracketSide
            copy={copy}
            ownPlayerId={projection.ownPlayerId}
            pairs={leftPairs}
            side="left"
            single={finalOnly}
          />
          <div className="relative grid min-w-0 content-center justify-items-center gap-0.5 text-[var(--pl-color-gold)] before:absolute before:top-1/2 before:right-0 before:left-0 before:border-t-2 before:border-[var(--pl-color-gold)] before:content-[''] [&>span]:z-[1] [&>span]:bg-[var(--pl-color-ink)] [&>span]:px-[5px] [&>span]:py-0.5 [&>span]:text-[28px] [&>span]:leading-none [&>strong]:z-[1] [&>strong]:bg-[var(--pl-color-ink)] [&>strong]:px-[5px] [&>strong]:py-0.5 [&>strong]:text-[9px]" data-bracket-stage="final">
            <span aria-hidden="true">🏆</span>
            <strong>{copy.game.final}</strong>
          </div>
          <TournamentBracketSide
            copy={copy}
            ownPlayerId={projection.ownPlayerId}
            pairs={rightPairs}
            side="right"
            single={finalOnly}
          />
        </div>
        {preview.ownPositionLabel || preview.cumulativeStatusLabel ? (
          <footer className="flex min-w-0 items-center justify-center gap-x-3.5 gap-y-2 border-t-2 border-[var(--pl-color-gold)] pt-[7px] text-[8px] min-[769px]:flex-wrap min-[769px]:text-xs [&_strong]:text-[var(--pl-color-gold)]">
            {preview.ownPositionLabel ? (
              <strong>{localizeRuntimeText(preview.ownPositionLabel, copy.locale)}</strong>
            ) : null}
            {preview.cumulativeStatusLabel ? (
              <span>{localizeRuntimeText(preview.cumulativeStatusLabel, copy.locale)}</span>
            ) : null}
          </footer>
        ) : null}
      </div>
    </PixelPanel>
  );
}

function TournamentBracketSide({
  copy,
  ownPlayerId,
  pairs,
  side,
  single,
}: {
  copy: PokeLoungeCopy;
  ownPlayerId: string;
  pairs: OpeningPair[];
  side: "left" | "right";
  single: boolean;
}) {
  return (
    <section
      className="grid min-w-0 grid-cols-[minmax(0,58%)_minmax(0,42%)] min-[769px]:grid-cols-[minmax(0,80%)_minmax(0,20%)] data-[bracket-side=right]:grid-cols-[minmax(0,42%)_minmax(0,58%)] data-[bracket-side=right]:[&>ol]:col-start-2 data-[bracket-side=right]:[&>ol]:row-start-1 data-[bracket-side=right]:[&>svg]:col-start-1 data-[bracket-side=right]:[&>svg]:row-start-1 min-[769px]:data-[bracket-side=right]:grid-cols-[minmax(0,20%)_minmax(0,80%)]"
      data-bracket-side={side}
      data-bracket-stage="quarterfinal-semifinal"
    >
      <ol className="m-0 grid min-w-0 list-none grid-rows-[repeat(auto-fit,minmax(0,1fr))] gap-[3px] p-0">
        {pairs.map(function mapPair(pair) {
          const ownMatch = pair.participants.some(function testParticipant(participant) {
            return participant.playerId === ownPlayerId;
          });
          return (
            <li className="group/pair grid min-w-0 content-around gap-0.5" key={`${side}-${pair.id}`} data-own-match={ownMatch || undefined}>
              {pair.participants.map(function mapParticipant(participant) {
                return (
                  <span
                    key={participant.playerId}
                    className="grid min-h-[22px] min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-1 overflow-hidden rounded-[5px] border-2 border-[var(--pl-color-shadow)] bg-[var(--pl-color-surface-raised)] px-[5px] py-[3px] text-left text-[8px] leading-[1.1] text-[var(--pl-color-ink)] shadow-[inset_0_0_0_1px_#ffffff40] group-data-[own-match=true]/pair:animate-[tournament-own-match_650ms_steps(2,end)_2] group-data-[own-match=true]/pair:bg-[var(--pl-color-gold-soft)] group-data-[own-match=true]/pair:shadow-[inset_3px_0_var(--pl-color-johto-deep)] motion-reduce:group-data-[own-match=true]/pair:animate-none data-[own-player=true]:border-[#065b79] data-[own-player=true]:bg-[#b6edff] data-[own-player=true]:font-black data-[own-player=true]:text-[#082733] data-[own-player=true]:shadow-[0_0_0_2px_#9ae8ff] data-[winner=true]:after:font-black data-[winner=true]:after:text-[#176b3b] data-[winner=true]:after:content-['✓'] min-[769px]:min-h-[38px] min-[769px]:grid-cols-[auto_minmax(0,1fr)_auto] min-[769px]:px-2 min-[769px]:py-1.5 min-[769px]:text-[13px] min-[769px]:leading-[1.3] [&>b]:text-[var(--pl-color-johto-deep)] data-[own-player=true]:[&>b]:bg-[#065b79] data-[own-player=true]:[&>b]:p-[3px] data-[own-player=true]:[&>b]:text-white [&>span]:min-w-0 [&>span]:overflow-hidden [&>span]:text-ellipsis [&>span]:whitespace-nowrap data-[own-player=true]:[&>span]:underline data-[own-player=true]:[&>span]:decoration-2 data-[own-player=true]:[&>span]:underline-offset-2 data-[eliminated=true]:[&>span]:line-through min-[769px]:[&>span]:whitespace-normal min-[769px]:[&>span]:[overflow-wrap:anywhere]"
                    data-own-player={participant.playerId === ownPlayerId || undefined}
                    data-winner={pair.winnerPlayerId === participant.playerId || undefined}
                    data-eliminated={
                      Boolean(
                        pair.winnerPlayerId && pair.winnerPlayerId !== participant.playerId,
                      ) || undefined
                    }
                    title={localizeTrainerName(participant.displayName, copy.locale)}
                  >
                    <b>
                      {participant.playerId === ownPlayerId
                        ? copy.locale === "ko-KR"
                          ? "나"
                          : copy.locale === "ja-JP"
                            ? "自分"
                            : "YOU"
                        : `#${participant.seed}`}
                    </b>
                    <span>{localizeTrainerName(participant.displayName, copy.locale)}</span>
                  </span>
                );
              })}
              {pair.bye ? (
                <span className="grid min-h-[22px] min-w-0 place-items-center border-2 border-[var(--pl-color-shadow)] bg-[var(--pl-color-surface-raised)] text-[8px] text-[var(--pl-color-ink-muted)] shadow-[0_2px_0_rgb(0_0_0_/_34%)] min-[769px]:text-xs">{copy.game.bye}</span>
              ) : null}
            </li>
          );
        })}
      </ol>
      <BracketConnectors pairCount={pairs.length} side={side} single={single} />
    </section>
  );
}

function BracketConnectors({
  pairCount,
  side,
  single,
}: {
  pairCount: number;
  side: "left" | "right";
  single: boolean;
}) {
  const transform = side === "right" ? "translate(100 0) scale(-1 1)" : undefined;
  return (
    <svg
      className="h-full min-h-0 w-full overflow-visible [&_path]:[vector-effect:non-scaling-stroke] [&_path]:fill-none [&_path]:stroke-[var(--pl-color-gold)] [&_path]:[stroke-width:2px] [&_rect]:[vector-effect:non-scaling-stroke] [&_rect]:fill-[var(--pl-color-surface-raised)] [&_rect]:stroke-[var(--pl-color-gold)] [&_rect]:[stroke-width:2px]"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      focusable="false"
      aria-hidden="true"
    >
      <g transform={transform}>
        {single ? (
          <path d="M 0 50 H 100" />
        ) : pairCount === 1 ? (
          <>
            <path d="M 0 25 H 32 V 75 H 0 M 32 50 H 100" />
            <rect x="29" y="47" width="6" height="6" />
          </>
        ) : (
          <>
            <path d="M 0 12.5 H 24 V 37.5 H 0 M 24 25 H 64" />
            <path d="M 0 62.5 H 24 V 87.5 H 0 M 24 75 H 64" />
            <path d="M 64 25 V 75 M 64 50 H 100" />
            <rect x="21" y="22" width="6" height="6" />
            <rect x="21" y="72" width="6" height="6" />
            <rect x="61" y="47" width="6" height="6" />
          </>
        )}
        <rect x="97" y="47" width="6" height="6" />
      </g>
    </svg>
  );
}

function createOpeningPair(
  bracket: TournamentBracketState,
  slot: TournamentRoundSlot,
): OpeningPair {
  const round = bracket.currentRound!;
  if (slot.kind === "bye") {
    const bye = round.byes.find(function findItem(candidate) {
      return candidate.byeId === slot.byeId;
    })!;
    return { bye: true, id: bye.byeId, participants: [bye.entrant] };
  }

  const match = round.matches.find(function findItem(candidate) {
    return candidate.matchId === slot.matchId;
  })!;
  return {
    bye: false,
    id: match.matchId,
    participants: [match.participantA, match.participantB],
    winnerPlayerId: match.winnerPlayerId,
  };
}
