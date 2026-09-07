import {
  findCurrentMatch,
  type TournamentCompetitionKind,
  type TournamentStateRoomPayload,
} from "@/components/poke-lounge/runtime/game/network/tournament-projection";
import { ROUND_TOTAL_COUNT } from "@/components/poke-lounge/runtime/game/round/round-state";
import { isWaitingForStarterSelections } from "@/components/poke-lounge/runtime/game/starter-selection-flow";
import { type GameState } from "@/features/poke-lounge/contracts/game-state";
import {
  createTournamentBracketState,
  type TournamentBracketState,
  type TournamentMatch,
  type TournamentStanding,
} from "@poke-lounge/battle/tournament-bracket";
import { TOURNAMENT_BRIEFING_DURATION_MS } from "@poke-lounge/battle/tournament-gathering";
export { TOURNAMENT_BRIEFING_DURATION_MS } from "@poke-lounge/battle/tournament-gathering";
interface CreateServerTournamentAnnouncementTextInput {
  projection: TournamentStateRoomPayload;
  nowMs: number;
  casualBattleAvailable: boolean | null;
}

export function createServerTournamentAnnouncementText({
  projection,
  nowMs,
  casualBattleAvailable,
}: CreateServerTournamentAnnouncementTextInput): string {
  if (isWaitingForStarterSelections(projection))
    return "모든 참가자가 포켓몬을 선택하면 함께 탐험을 시작합니다.";
  if (projection.roomStatus === "round-started") {
    const remainingMs = Math.max(0, (projection.roomRound.endsAtMs ?? nowMs) - nowMs);
    const cumulativeStatus = createOwnCumulativeStatusLabel(projection);

    return [
      `라운드 ${projection.roundIndex}/${ROUND_TOTAL_COUNT} 대진 안내`,
      remainingMs > 0 ? `${formatRemainingTime(remainingMs)} 후 전투 시작` : "전투 준비 중",
      ...createTournamentBracketPreviewLines(projection),
      cumulativeStatus,
    ]
      .filter(function filterItem(line): line is string {
        return Boolean(line);
      })
      .join("\n");
  }

  const participants = projection.participants;
  const tournamentParticipants = participants.filter(function filterItem(participant) {
    return participant.role === "participant";
  });
  const spectators = participants.filter(function filterItem(participant) {
    return participant.role === "spectator";
  });
  const readyCount = tournamentParticipants.filter(function filterItem(participant) {
    return participant.ready;
  }).length;
  const connectedCount = participants.filter(function filterItem(participant) {
    return participant.connected;
  }).length;
  const bracket = projection.tournament.bracket;
  const activeMatch = findCurrentMatch(bracket, projection.tournament.activeMatchId);
  const lines = [
    "서버 토너먼트",
    createServerRoomStageLabel(projection, nowMs),
    `참가 ${tournamentParticipants.length}/8 · 준비 ${readyCount}/${tournamentParticipants.length} · 접속 ${connectedCount}/${participants.length} · 관전 ${spectators.length}`,
  ];

  if (activeMatch) {
    lines.push(`현재 경기 · ${formatMatchParticipants(activeMatch)}`);
  }

  const ownStatus = createOwnTournamentStatusLabel(projection, activeMatch);

  if (ownStatus) {
    lines.push(ownStatus);
  }

  const cumulativeStatus = createOwnCumulativeStatusLabel(projection);
  if (cumulativeStatus) {
    lines.push(cumulativeStatus);
  }

  lines.push(createCompetitionKindLabel(projection.competitionKind));

  if (
    projection.competitionKind === "ranked-head-to-head" ||
    projection.competitionKind === "tournament-unranked"
  ) {
    lines.push("전투 규칙 · 육성 파티 · 레벨 유지");
  }

  if (casualBattleAvailable === false) {
    lines.push("원격 캐주얼전 미지원 · 방에 다시 참가하거나 방 나가기");
  }

  return lines.join("\n");
}

export function createTournamentBriefingText(
  projection: TournamentStateRoomPayload,
  nowMs: number,
): string | null {
  const endsAtMs = projection.roomRound.endsAtMs;
  if (
    projection.roomStatus !== "round-started" ||
    endsAtMs === null ||
    endsAtMs - nowMs > TOURNAMENT_BRIEFING_DURATION_MS
  ) {
    return null;
  }

  return createServerTournamentAnnouncementText({
    projection,
    nowMs: endsAtMs - TOURNAMENT_BRIEFING_DURATION_MS,
    casualBattleAvailable: null,
  });
}

export interface TournamentBracketPreview {
  bracket: TournamentBracketState;
  cumulativeStatusLabel: string | null;
  futureRounds: Array<{ label: "4강" | "결승"; matchCount: number }>;
  openingLabel: "8강" | "4강" | "결승";
  ownPositionLabel: string | null;
}

export function createTournamentBracketPreview(
  projection: TournamentStateRoomPayload,
): TournamentBracketPreview | null {
  if (projection.roundIndex < 1) {
    return null;
  }

  const participants = projection.participants.filter(function filterItem(participant) {
    return participant.role === "participant" && participant.connected && participant.partyReady;
  });
  if (!projection.tournament.bracket && (participants.length < 2 || participants.length > 8)) {
    return null;
  }

  const bracket =
    projection.tournament.bracket ??
    createTournamentBracketState(
      participants.map(function mapItem(participant) {
        return { playerId: participant.playerId, displayName: participant.displayName };
      }),
      projection.roundIndex,
    );
  const openingRound = bracket.currentRound ?? bracket.completedRounds.at(-1);
  if (!openingRound) return null;
  const entrantCount = openingRound.matches.length * 2 + openingRound.byes.length;
  const openingLabel = entrantCount <= 2 ? "결승" : entrantCount <= 4 ? "4강" : "8강";
  const ownMatch = openingRound.matches.find(function findItem(match) {
    return match.participantIds.includes(projection.ownPlayerId);
  });
  const ownBye = openingRound.byes.find(function findItem(bye) {
    return bye.entrant.playerId === projection.ownPlayerId;
  });

  return {
    bracket,
    cumulativeStatusLabel: createOwnCumulativeStatusLabel(projection),
    futureRounds:
      entrantCount <= 2
        ? []
        : entrantCount <= 4
          ? [{ label: "결승", matchCount: 1 }]
          : [
              { label: "4강", matchCount: 2 },
              { label: "결승", matchCount: 1 },
            ],
    openingLabel,
    ownPositionLabel:
      bracket.championPlayerId === projection.ownPlayerId
        ? "내 위치 · 우승"
        : bracket.eliminations.some(entry => entry.playerId === projection.ownPlayerId)
          ? "내 위치 · 탈락 · 관전 중"
          : ownMatch
            ? `내 위치 · ${openingLabel} ${ownMatch.matchNumber}경기${ownMatch.winnerPlayerId === projection.ownPlayerId ? " · 승리" : ""}`
            : ownBye
              ? `내 위치 · 부전승 · ${entrantCount <= 4 ? "결승" : "4강"} 진출`
              : null,
  };
}

function createTournamentBracketPreviewLines(projection: TournamentStateRoomPayload): string[] {
  const preview = createTournamentBracketPreview(projection);
  if (!preview) {
    return ["대진 확정 대기"];
  }

  const openingRound = preview.bracket.currentRound!;
  const lines = [
    `${preview.openingLabel} · ${openingRound.matches.map(formatMatchParticipants).join(" / ")}`,
  ];

  if (openingRound.byes.length > 0) {
    lines.push(
      `부전승 · ${openingRound.byes
        .map(function mapItem(bye) {
          return formatTournamentParticipant(bye.entrant);
        })
        .join(" · ")}`,
    );
  }
  if (preview.futureRounds.length > 0) {
    lines.push(
      `이후 · ${preview.futureRounds
        .map(function mapItem(round) {
          return `${round.label}${round.matchCount > 1 ? ` ${round.matchCount}경기` : ""}`;
        })
        .join(" → ")}`,
    );
  }

  if (preview.ownPositionLabel) lines.push(preview.ownPositionLabel);

  return lines;
}

function createServerRoomStageLabel(projection: TournamentStateRoomPayload, nowMs: number): string {
  if (isWaitingForStarterSelections(projection))
    return "포켓몬 선택 대기 · 모두 선택하면 함께 출발";
  if (projection.roomStatus === "waiting") {
    return "대기실 · 모든 사람이 준비하면 방장이 시작";
  }

  if (projection.roomStatus === "round-started") {
    const remainingMs = Math.max(0, (projection.roomRound.endsAtMs ?? nowMs) - nowMs);

    if (remainingMs === 0) {
      return `라운드 ${projection.roundIndex}/${ROUND_TOTAL_COUNT} · 다른 플레이어를 기다리는 중...`;
    }

    return `라운드 ${projection.roundIndex}/${ROUND_TOTAL_COUNT} 준비 중 · ${formatRemainingTime(remainingMs)}`;
  }

  if (projection.roomStatus === "completed") {
    return "토너먼트 완료";
  }

  if (projection.roomStatus === "closed") {
    return "방이 종료되었습니다";
  }

  const currentRoundNumber = projection.tournament.bracket?.currentRound?.roundNumber;

  return currentRoundNumber ? `토너먼트 진행 · 대진 ${currentRoundNumber}` : "대진 준비 중";
}

function createOwnCumulativeStatusLabel(projection: TournamentStateRoomPayload): string | null {
  if (projection.roomStatus !== "round-started" || projection.roundIndex <= 1) {
    return null;
  }

  const ranked = projection.participants
    .filter(function filterItem(participant) {
      return participant.role === "participant";
    })
    .map(function mapItem(participant, index) {
      return {
        playerId: participant.playerId,
        score: projection.tournament.cumulativeScores[participant.playerId] ?? 0,
        order: index,
      };
    })
    .sort(function compareItems(left, right) {
      return right.score - left.score || left.order - right.order;
    });
  const ownIndex = ranked.findIndex(function findItemIndex(row) {
    return row.playerId === projection.ownPlayerId;
  });
  if (ownIndex < 0) {
    return null;
  }
  const previous = ranked[ownIndex - 1];
  const rank =
    previous?.score === ranked[ownIndex]!.score
      ? ranked.findIndex(function findItemIndex(row) {
          return row.score === ranked[ownIndex]!.score;
        }) + 1
      : ownIndex + 1;

  return `내 누적 순위 · ${rank}위 · ${formatScore(ranked[ownIndex]!.score)}점`;
}

function formatScore(score: number): string {
  return String(Math.round(Math.max(0, score) * 100) / 100);
}

function createOwnTournamentStatusLabel(
  projection: TournamentStateRoomPayload,
  activeMatch: TournamentMatch | null,
): string | null {
  const ownPlayerId = projection.ownPlayerId;
  const ownParticipant = projection.participants.find(function findItem(participant) {
    return participant.playerId === ownPlayerId;
  });
  const bracket = projection.tournament.bracket;
  const ownIdentity = ownParticipant
    ? `${ownParticipant.seed ? `#${ownParticipant.seed} ` : ""}${truncateDisplayName(ownParticipant.displayName)}`
    : "참가 정보 확인 중";

  if (ownParticipant?.role === "spectator") {
    return `내 상태 · ${ownIdentity} · 관전 · ${ownParticipant.connected ? "접속" : "연결 끊김"}`;
  }

  if (!bracket) {
    if (!ownParticipant) {
      return null;
    }

    return `내 상태 · ${ownIdentity} · 참가 · ${ownParticipant.ready ? "준비" : "준비 전"} · ${ownParticipant.connected ? "접속" : "연결 끊김"}`;
  }

  if (bracket.championPlayerId === ownPlayerId) {
    return `내 상태 · ${ownIdentity} · 우승`;
  }

  if (
    bracket.eliminations.some(function testItem(elimination) {
      return elimination.playerId === ownPlayerId;
    })
  ) {
    return `내 상태 · ${ownIdentity} · 탈락 · 최종 순위 확정 대기`;
  }

  const completedOwnMatches = [
    ...bracket.completedRounds.flatMap(function mapItem(round) {
      return round.matches;
    }),
    ...(bracket.currentRound?.matches.filter(function filterItem(match) {
      return match.status === "completed";
    }) ?? []),
  ].filter(function filterItem(match) {
    return match.participantIds.includes(ownPlayerId);
  });
  const lastOwnMatch = completedOwnMatches.at(-1);
  const progressionLabel = lastOwnMatch?.winnerPlayerId === ownPlayerId ? "진출 · " : "";

  if (activeMatch?.participantIds.includes(ownPlayerId)) {
    return `내 상태 · ${ownIdentity} · ${progressionLabel}상대 ${formatOpponent(activeMatch, ownPlayerId)}`;
  }

  const nextMatch = bracket.currentRound?.matches.find(function findItem(match) {
    return match.status === "ready" && match.participantIds.includes(ownPlayerId);
  });

  if (nextMatch) {
    return `내 상태 · ${ownIdentity} · ${progressionLabel}다음 상대 ${formatOpponent(nextMatch, ownPlayerId)}`;
  }

  if (
    bracket.currentRound?.byes.some(function testItem(bye) {
      return bye.entrant.playerId === ownPlayerId;
    })
  ) {
    return `내 상태 · ${ownIdentity} · 부전승 진출 · 다음 대진 대기`;
  }

  if (lastOwnMatch?.winnerPlayerId === ownPlayerId) {
    return `내 상태 · ${ownIdentity} · 진출 · 다음 대진 대기`;
  }

  return `내 상태 · ${ownIdentity} · 다음 대진 대기`;
}

function createCompetitionKindLabel(kind: TournamentCompetitionKind): string {
  if (kind === "ranked-head-to-head") {
    return "서버 대전 · 현재 게임 점수 반영";
  }

  if (kind === "tournament-unranked") {
    return "서버 대전 · 현재 게임 점수 반영";
  }

  if (kind === "casual-unranked") {
    return "캐주얼 대전";
  }

  return "서버 대전 준비 중";
}

export function formatRemainingTime(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1_000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

function formatMatchParticipants(match: TournamentMatch): string {
  return `${formatTournamentParticipant(match.participantA)} vs ${formatTournamentParticipant(match.participantB)}`;
}

function formatTournamentParticipant(
  participant: Pick<TournamentMatch["participantA"], "displayName" | "seed">,
): string {
  return `#${participant.seed} ${truncateDisplayName(participant.displayName)}`;
}

function formatOpponent(match: TournamentMatch, ownPlayerId: string): string {
  const opponent =
    match.participantA.playerId === ownPlayerId ? match.participantB : match.participantA;

  return `#${opponent.seed} ${truncateDisplayName(opponent.displayName)}`;
}

function truncateDisplayName(displayName: string): string {
  const characters = Array.from(displayName);

  return characters.length <= 12 ? displayName : `${characters.slice(0, 11).join("")}…`;
}

export function getMatchParticipantIds(match: TournamentMatch): [string, string] {
  return [match.participantA.playerId, match.participantB.playerId];
}

export function createVisibleTournamentStandings(state: GameState): TournamentStanding[] {
  return state.tournament.standings.map(function mapItem(standing) {
    return {
      playerId: standing.playerId,
      displayName: standing.displayName,
      seed: standing.seed,
      rank: standing.rank,
      champion: standing.rank === 1,
      eliminatedRoundNumber: standing.rank === 1 ? null : state.round.roundIndex,
    };
  });
}
