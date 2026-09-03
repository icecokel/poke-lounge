import type { BattleResultReason } from "../battle/battle-types";
import {
  createRoundScoreUpdatedAuthorityPayloads,
  createTournamentCompletedAuthorityPayload,
  createTournamentMatchResultAuthorityPayload,
} from "../network/tournament-authority";
import type { PlayerSnapshot } from "../network/local-preview-room";
import { ROUND_TOTAL_COUNT } from "../round/round-state";
import {
  findCurrentMatch,
  type TournamentCompetitionKind,
  type TournamentStateRoomPayload,
} from "../network/tournament-projection";
import {
  createDefaultLocalPlayer,
  type GameState,
  type GameStateStore,
  type LocalPlayerState,
} from "../state/game-state-store";
import {
  createTournamentBracketState,
  type TournamentBracketState,
  type TournamentMatch,
  type TournamentStanding,
} from "@poke-lounge/battle/tournament-bracket";
import type { TournamentSession } from "../tournament/tournament-session";
import {
  createTournamentResultPanelViewModel,
  formatTournamentResultRow,
} from "../tournament/tournament-result-view-model";

export interface WorldTournamentBattleResult {
  matchId: string;
  winnerPlayerId: string;
  loserPlayerId: string;
  reason: BattleResultReason;
}

export interface WorldSceneTournament {
  update(nowMs: number): void;
  applyReturnedResult(result: WorldTournamentBattleResult): void;
  destroy(): void;
}

export interface WorldSceneTournamentController extends WorldSceneTournament {
  clearPresentation(): void;
  showResultPresentationIfNeeded(): void;
}

interface TournamentAnnouncement {
  destroy(): void;
}

export const TOURNAMENT_BRIEFING_DURATION_MS = 5_000;

export interface WorldSceneTournamentDependencies {
  gameStateStore: GameStateStore;
  isBattleIntroPlaying(): boolean;
  hasWorldPlayer(): boolean;
  isRoomTournamentHost(): boolean;
  getRemotePlayerSnapshots(): ReadonlyArray<PlayerSnapshot>;
  startTrainerBattle(
    match: TournamentMatch,
    player: LocalPlayerState,
    opponent: LocalPlayerState,
  ): void;
  getRoomHostPlayerId(): string | null;
  sendTournamentStarted(session: TournamentSession): void;
  sendTournamentMatchResult(
    payload: ReturnType<typeof createTournamentMatchResultAuthorityPayload> extends infer Payload
      ? Exclude<Payload, null>
      : never,
  ): void;
  sendTournamentCompleted(
    payload: ReturnType<typeof createTournamentCompletedAuthorityPayload> extends infer Payload
      ? Exclude<Payload, null>
      : never,
  ): void;
  sendRoundScoreUpdates(
    payloads: ReturnType<typeof createRoundScoreUpdatedAuthorityPayloads>,
  ): void;
  createAnnouncement(text: string, fontSize: "14px" | "16px"): TournamentAnnouncement;
}

export function createWorldSceneTournament(
  dependencies: WorldSceneTournamentDependencies,
): WorldSceneTournamentController {
  return new DefaultWorldSceneTournament(dependencies);
}

class DefaultWorldSceneTournament implements WorldSceneTournamentController {
  private announcement: TournamentAnnouncement | null = null;
  private announcementText: string | null = null;
  private tournamentBattleStarting = false;
  private submittedServerMatchId: string | null = null;

  constructor(private readonly dependencies: WorldSceneTournamentDependencies) {}

  update(nowMs: number): void {
    const state = this.dependencies.gameStateStore.getState();
    const serverProjection = state.tournament.serverProjection;

    if (
      serverProjection &&
      (state.round.phase === "waiting" || state.round.phase === "preparation")
    ) {
      this.showServerTournamentMessage(serverProjection, nowMs);
      return;
    }

    if (state.round.phase === "tournament") {
      const activeMatchId = serverProjection?.tournament.activeMatchId ?? null;
      if (this.submittedServerMatchId && this.submittedServerMatchId !== activeMatchId) {
        this.submittedServerMatchId = null;
      }

      if (this.tryStartTournamentBattle()) {
        return;
      }

      this.showTournamentPendingMessage(nowMs);
      return;
    }

    this.showResultPresentationIfNeeded();
  }

  applyReturnedResult(result: WorldTournamentBattleResult): void {
    const { gameStateStore } = this.dependencies;
    const tournamentState = gameStateStore.getState().tournament;
    const serverProjection = tournamentState.serverProjection;

    if (serverProjection) {
      const activeMatch = gameStateStore.getCurrentTournamentMatch();

      if (
        activeMatch?.matchId !== result.matchId ||
        !activeMatch ||
        !getMatchParticipantIds(activeMatch).includes(result.winnerPlayerId)
      ) {
        return;
      }

      this.submittedServerMatchId = result.matchId;
      this.dependencies.sendTournamentMatchResult({
        roundIndex: serverProjection.roundIndex,
        matchId: result.matchId,
        winnerPlayerId: result.winnerPlayerId,
        reason: result.reason,
      });
      this.clearPresentation();
      return;
    }

    const previousSession = tournamentState.session;
    const recorded = gameStateStore.recordTournamentMatchResult(
      result.matchId,
      result.winnerPlayerId,
      Date.now(),
    );
    const hostPlayerId = this.dependencies.getRoomHostPlayerId();

    if (!previousSession || !hostPlayerId || !recorded.ok) {
      return;
    }

    const matchPayload = createTournamentMatchResultAuthorityPayload({
      hostPlayerId,
      session: previousSession,
      matchId: result.matchId,
      winnerPlayerId: result.winnerPlayerId,
      reason: result.reason,
    });

    if (matchPayload) {
      this.dependencies.sendTournamentMatchResult(matchPayload);
    }

    if (!recorded.completed) {
      return;
    }

    const standings = recorded.standings.map(function mapItem(standing) {
      return {
        playerId: standing.playerId,
        rank: standing.rank,
        score: standing.score,
      };
    });
    const completedPayload = createTournamentCompletedAuthorityPayload({
      hostPlayerId,
      session: recorded.session,
      standings,
    });

    if (completedPayload) {
      this.dependencies.sendTournamentCompleted(completedPayload);
    }

    this.dependencies.sendRoundScoreUpdates(
      createRoundScoreUpdatedAuthorityPayloads({
        roundIndex: recorded.session.roundIndex,
        hostPlayerId,
        standings,
      }),
    );
  }

  clearPresentation(): void {
    this.announcement?.destroy();
    this.announcement = null;
    this.announcementText = null;
  }

  showResultPresentationIfNeeded(): void {
    const state = this.dependencies.gameStateStore.getState();

    if (
      this.announcement ||
      (state.round.phase !== "round-result" && state.round.phase !== "game-result")
    ) {
      return;
    }

    const standings = createVisibleTournamentStandings(state);

    if (standings.length === 0) {
      return;
    }

    const panel = createTournamentResultPanelViewModel({
      roundIndex: state.round.roundIndex,
      totalRounds: state.round.totalRounds,
      final: state.round.phase === "game-result",
      standings,
      roundScores: state.tournament.lastRoundScores,
      cumulativeScores: state.tournament.scoresByPlayerId,
      publicRankingIncluded:
        state.tournament.serverProjection?.competitionKind === "ranked-head-to-head",
    });
    this.setAnnouncement(
      [
        panel.title,
        ...panel.rows.map(formatTournamentResultRow),
        panel.rankingLabel,
        panel.nextActionLabel,
      ]
        .filter(function filterItem(line): line is string {
          return Boolean(line);
        })
        .join("\n"),
      "14px",
    );
  }

  destroy(): void {
    this.clearPresentation();
    this.tournamentBattleStarting = false;
    this.submittedServerMatchId = null;
  }

  private showTournamentPendingMessage(nowMs: number): void {
    const projection = this.dependencies.gameStateStore.getState().tournament.serverProjection;

    if (projection) {
      this.showServerTournamentMessage(projection, nowMs);
      return;
    }

    this.setAnnouncement("준비 시간이 끝났습니다\n토너먼트 대기 중", "16px");
  }

  private tryStartTournamentBattle(): boolean {
    if (
      this.dependencies.isBattleIntroPlaying() ||
      this.tournamentBattleStarting ||
      !this.dependencies.hasWorldPlayer()
    ) {
      return false;
    }

    const { gameStateStore } = this.dependencies;
    const state = gameStateStore.getState();
    const session = state.tournament.session;

    if (state.tournament.serverProjection) {
      return this.tryStartServerTournamentBattle();
    }

    if (
      !session ||
      session.status !== "in-progress" ||
      session.roundIndex !== state.round.roundIndex
    ) {
      if (!this.dependencies.isRoomTournamentHost()) {
        return false;
      }

      const tournamentPlayers = this.getEligibleTournamentPlayers();

      if (tournamentPlayers.length < 2) {
        return false;
      }

      const started = gameStateStore.startTournamentSession(
        tournamentPlayers.map(function mapItem(player) {
          return {
            playerId: player.playerId,
            displayName: player.displayName,
          };
        }),
      );

      if (!started.ok) {
        return false;
      }

      this.dependencies.sendTournamentStarted(started.session);
    }

    if (!this.dependencies.isRoomTournamentHost()) {
      return false;
    }

    const match = gameStateStore.getCurrentTournamentMatch();

    if (!match) {
      return false;
    }

    const player = this.getTournamentBattlePlayer(match.participantA.playerId);
    const opponent = this.getTournamentBattlePlayer(match.participantB.playerId);

    if (
      !player ||
      !opponent ||
      !hasActiveTournamentPokemon(player) ||
      !hasActiveTournamentPokemon(opponent)
    ) {
      return false;
    }

    this.tournamentBattleStarting = true;
    this.dependencies.startTrainerBattle(match, player, opponent);

    return true;
  }

  private getEligibleTournamentPlayers(): LocalPlayerState[] {
    const { gameStateStore } = this.dependencies;
    const state = gameStateStore.getState();
    const currentPlayer = state.playersById[state.currentPlayerId];
    const otherPlayers = Object.values(state.playersById)
      .filter(function filterItem(player) {
        return player.playerId !== state.currentPlayerId;
      })
      .sort(function compareItems(left, right) {
        return left.playerId.localeCompare(right.playerId, undefined, { numeric: true });
      });
    const localPlayers = [currentPlayer, ...otherPlayers].filter(
      function filterItem(player): player is LocalPlayerState {
        return Boolean(player);
      },
    );
    const usedPlayerIds = new Set(
      localPlayers.map(function mapItem(player) {
        return player.playerId;
      }),
    );
    const remotePlayers = this.dependencies
      .getRemotePlayerSnapshots()
      .map(function mapItem(snapshot) {
        const preferredPlayerId = snapshot.playerId?.trim() || snapshot.sessionId;
        const playerId = usedPlayerIds.has(preferredPlayerId)
          ? snapshot.sessionId
          : preferredPlayerId;
        const player = toTournamentLocalPlayerFromSnapshot(snapshot, playerId);

        if (player) {
          usedPlayerIds.add(player.playerId);
        }

        return player;
      })
      .filter(function filterItem(player): player is LocalPlayerState {
        return Boolean(player);
      })
      .sort(function compareItems(left, right) {
        return left.playerId.localeCompare(right.playerId, undefined, { numeric: true });
      });

    return [...localPlayers, ...remotePlayers].filter(hasActiveTournamentPokemon).slice(0, 8);
  }

  private getTournamentBattlePlayer(playerId: string): LocalPlayerState | undefined {
    return this.getEligibleTournamentPlayers().find(function findItem(player) {
      return player.playerId === playerId;
    });
  }

  private tryStartServerTournamentBattle(): boolean {
    const state = this.dependencies.gameStateStore.getState();
    const projection = state.tournament.serverProjection;
    const match = this.dependencies.gameStateStore.getCurrentTournamentMatch();

    if (
      !projection ||
      projection.activeMatchTransport !== "casual" ||
      !match ||
      this.submittedServerMatchId === match.matchId ||
      !getMatchParticipantIds(match).includes(state.currentPlayerId)
    ) {
      return false;
    }

    const opponentPlayerId = getMatchParticipantIds(match).find(function findItem(playerId) {
      return playerId !== state.currentPlayerId;
    });
    const player = this.getTournamentBattlePlayer(state.currentPlayerId);
    const opponent = opponentPlayerId
      ? this.getTournamentBattlePlayer(opponentPlayerId)
      : undefined;

    if (
      !player ||
      !opponent ||
      !hasActiveTournamentPokemon(player) ||
      !hasActiveTournamentPokemon(opponent)
    ) {
      return false;
    }

    this.tournamentBattleStarting = true;
    this.dependencies.startTrainerBattle(match, player, opponent);

    return true;
  }

  private showServerTournamentMessage(projection: TournamentStateRoomPayload, nowMs: number): void {
    if (projection.resultSync.matchId === projection.tournament.activeMatchId) {
      if (projection.resultSync.status === "submitting") {
        this.setAnnouncement("경기 결과 전송 중", "16px");
        return;
      }

      if (projection.resultSync.status === "recovering") {
        this.setAnnouncement("경기 결과 확인 중\n서버 상태를 복구하고 있습니다", "16px");
        return;
      }

      if (projection.resultSync.status === "error") {
        this.setAnnouncement("경기 결과 동기화 실패\n서버 상태를 다시 불러오고 있습니다", "16px");
        return;
      }
    }

    const briefing = createTournamentBriefingText(projection, nowMs);
    if (briefing) {
      this.setAnnouncement(briefing, "14px");
      return;
    }

    this.clearPresentation();
  }

  private setAnnouncement(text: string, fontSize: "14px" | "16px"): void {
    if (this.announcement && this.announcementText === text) {
      return;
    }

    this.announcement?.destroy();
    this.announcement = this.dependencies.createAnnouncement(text, fontSize);
    this.announcementText = text;
  }
}

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
    lines.push("원격 캐주얼전 미지원 · 로그인 후 재참가 또는 방 나가기");
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
  const participants = projection.participants.filter(function filterItem(participant) {
    return participant.role === "participant" && participant.connected && participant.partyReady;
  });
  if (participants.length < 2 || participants.length > 8) {
    return null;
  }

  const bracket = createTournamentBracketState(
    participants.map(function mapItem(participant) {
      return { playerId: participant.playerId, displayName: participant.displayName };
    }),
    projection.roundIndex,
  );
  const openingRound = bracket.currentRound!;
  const openingLabel = participants.length <= 2 ? "결승" : participants.length <= 4 ? "4강" : "8강";
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
      participants.length <= 2
        ? []
        : participants.length <= 4
          ? [{ label: "결승", matchCount: 1 }]
          : [
              { label: "4강", matchCount: 2 },
              { label: "결승", matchCount: 1 },
            ],
    openingLabel,
    ownPositionLabel: ownMatch
      ? `내 위치 · ${openingLabel} ${ownMatch.matchNumber}경기`
      : ownBye
        ? `내 위치 · 부전승 · ${participants.length <= 4 ? "결승" : "4강"} 진출`
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
    return "서버 권위전 · 공개 랭킹 반영";
  }

  if (kind === "tournament-unranked") {
    return "서버 권위전 · 공개 랭킹 미반영";
  }

  if (kind === "casual-unranked") {
    return "캐주얼전 · 공개 랭킹 미반영";
  }

  return "경기 권위 확정 대기 · 공개 랭킹 반영 여부 확인 중";
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

function getMatchParticipantIds(match: TournamentMatch): [string, string] {
  return [match.participantA.playerId, match.participantB.playerId];
}

function createVisibleTournamentStandings(state: GameState): TournamentStanding[] {
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

function hasActiveTournamentPokemon(player: LocalPlayerState): boolean {
  const activePokemon = player.party.find(function findItem(slot) {
    return slot.slotIndex === player.activePartySlotIndex;
  })?.pokemon;

  if (!activePokemon || activePokemon.status === "fainted") {
    return false;
  }

  if (typeof activePokemon.currentHp === "number" && activePokemon.currentHp <= 0) {
    return false;
  }

  return true;
}

function toTournamentLocalPlayerFromSnapshot(
  snapshot: PlayerSnapshot,
  playerIdOverride?: string,
): LocalPlayerState | null {
  const playerId = playerIdOverride?.trim() || snapshot.playerId?.trim() || snapshot.sessionId;
  const party = cloneTournamentSnapshotParty(snapshot.party);
  const activePartySlotIndex = normalizeTournamentActivePartySlotIndex(
    snapshot.activePartySlotIndex,
    party,
  );

  if (activePartySlotIndex === null) {
    return null;
  }

  const defaultPlayer = createDefaultLocalPlayer(playerId);

  return {
    ...defaultPlayer,
    playerId,
    displayName: snapshot.displayName?.trim() || playerId,
    party,
    activePartySlotIndex,
    position: {
      mapKey: snapshot.map,
      x: snapshot.x,
      y: snapshot.y,
      facing: snapshot.facing,
    },
  };
}

function cloneTournamentSnapshotParty(
  party: PlayerSnapshot["party"] | undefined,
): NonNullable<PlayerSnapshot["party"]> {
  return (
    party?.map(function mapItem(slot) {
      return {
        slotIndex: slot.slotIndex,
        pokemon: slot.pokemon
          ? {
              ...slot.pokemon,
              moves: slot.pokemon.moves?.map(function mapItem(move) {
                return { ...move };
              }),
            }
          : null,
      };
    }) ?? []
  );
}

function normalizeTournamentActivePartySlotIndex(
  activePartySlotIndex: number | undefined,
  party: NonNullable<PlayerSnapshot["party"]>,
): number | null {
  const requestedSlotIndex =
    typeof activePartySlotIndex === "number" && Number.isInteger(activePartySlotIndex)
      ? activePartySlotIndex
      : 0;

  if (
    party.some(function testItem(slot) {
      return slot.slotIndex === requestedSlotIndex && slot.pokemon;
    })
  ) {
    return requestedSlotIndex;
  }

  return (
    party.find(function findItem(slot) {
      return slot.pokemon;
    })?.slotIndex ?? null
  );
}

export function isWorldTournamentBattleResult(
  value: unknown,
): value is WorldTournamentBattleResult {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as WorldTournamentBattleResult).matchId === "string" &&
    typeof (value as WorldTournamentBattleResult).winnerPlayerId === "string" &&
    typeof (value as WorldTournamentBattleResult).loserPlayerId === "string" &&
    typeof (value as WorldTournamentBattleResult).reason === "string"
  );
}
