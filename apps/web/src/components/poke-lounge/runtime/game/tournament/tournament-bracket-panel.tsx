"use client";

import type {
  TournamentBracketState,
  TournamentParticipant,
  TournamentRoundSlot,
} from "@poke-lounge/battle/tournament-bracket";
import { PixelPanel } from "../../../ui/poke-lounge-ui-primitives";
import styles from "../../../poke-lounge.module.css";
import type { TournamentStateRoomPayload } from "../network/tournament-projection";
import { ROUND_TOTAL_COUNT } from "../round/round-state";
import {
  createTournamentBracketPreview,
  formatRemainingTime,
} from "../scenes/world-scene-tournament";
import type { PokeLoungeCopy } from "../../../poke-lounge-copy";
import { localizeRuntimeText, localizeTrainerName } from "../i18n/runtime-game-localization";

interface OpeningPair {
  bye: boolean;
  id: string;
  participants: TournamentParticipant[];
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
  const preview = createTournamentBracketPreview(projection);

  if (!preview?.bracket.currentRound) {
    return (
      <PixelPanel
        className={styles.worldTournamentAnnouncement}
        data-poke-lounge-tournament-announcement="true"
        role="status"
      >
        {localizeRuntimeText(text, copy.locale)}
      </PixelPanel>
    );
  }

  const remainingMs = Math.max(0, (projection.roomRound.endsAtMs ?? Date.now()) - Date.now());
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
      className={styles.worldTournamentAnnouncement}
      data-poke-lounge-tournament-announcement="true"
      data-poke-lounge-tournament-bracket="true"
      data-bracket-flow="outside-in"
      role="status"
    >
      <span className={styles.srOnly}>{localizeRuntimeText(text, copy.locale)}</span>
      <div className={styles.tournamentBracketPanel} aria-hidden="true">
        <header className={styles.tournamentBracketHeader}>
          <span>
            ROUND {projection.roundIndex} / {ROUND_TOTAL_COUNT}
          </span>
          <strong>{copy.game.tournamentBracket}</strong>
          <span>
            {remainingMs > 0
              ? copy.game.startsAfter(formatRemainingTime(remainingMs))
              : copy.game.battlePreparing}
          </span>
        </header>
        <div className={styles.tournamentBracketTree}>
          <TournamentBracketSide
            copy={copy}
            ownPlayerId={projection.ownPlayerId}
            pairs={leftPairs}
            side="left"
            single={finalOnly}
          />
          <div className={styles.tournamentBracketFinal} data-bracket-stage="final">
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
          <footer className={styles.tournamentBracketFooter}>
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
      className={styles.tournamentBracketSide}
      data-bracket-side={side}
      data-bracket-stage="quarterfinal-semifinal"
    >
      <ol className={styles.tournamentBracketEntrants}>
        {pairs.map(function mapPair(pair) {
          const ownMatch = pair.participants.some(function testParticipant(participant) {
            return participant.playerId === ownPlayerId;
          });
          return (
            <li key={`${side}-${pair.id}`} data-own-match={ownMatch || undefined}>
              {pair.participants.map(function mapParticipant(participant) {
                return (
                  <span
                    key={participant.playerId}
                    className={styles.tournamentBracketParticipant}
                    data-own-player={participant.playerId === ownPlayerId || undefined}
                    title={localizeTrainerName(participant.displayName, copy.locale)}
                  >
                    <b>#{participant.seed}</b>
                    <span>{localizeTrainerName(participant.displayName, copy.locale)}</span>
                  </span>
                );
              })}
              {pair.bye ? (
                <span className={styles.tournamentBracketBye}>{copy.game.bye}</span>
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
      className={styles.tournamentBracketConnectors}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      focusable="false"
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
  };
}
