import {
  createTournamentBriefingText,
  createVisibleTournamentStandings,
  formatRemainingTime,
  getMatchParticipantIds,
} from "@/features/poke-lounge/presentation/tournament/tournament-view-model";
import { findBattleReadyPartySlot } from "@poke-lounge/battle/adventure/player/battle-ready-party";
import { type TournamentMatch } from "@poke-lounge/battle/tournament-bracket";
import type { BattleResultReason } from "../battle/battle-types";
import type { PlayerSnapshot } from "../network/local-preview-room";
import {
  createRoundScoreUpdatedAuthorityPayloads,
  createTournamentCompletedAuthorityPayload,
  createTournamentMatchResultAuthorityPayload,
} from "../network/tournament-authority";
import { type TournamentStateRoomPayload } from "../network/tournament-projection";
import { isWaitingForStarterSelections } from "../starter-selection-flow";
import {
  createDefaultLocalPlayer,
  type GameStateStore,
  type LocalPlayerState,
} from "../state/game-state-store";
import {
  createTournamentResultPanelViewModel,
  formatTournamentResultRow,
} from "../tournament/tournament-result-view-model";
import type { TournamentSession } from "../tournament/tournament-session";
export {
  createServerTournamentAnnouncementText,
  createTournamentBracketPreview,
  createTournamentBriefingText,
  formatRemainingTime,
} from "@/features/poke-lounge/presentation/tournament/tournament-view-model";
export type { TournamentBracketPreview } from "@/features/poke-lounge/presentation/tournament/tournament-view-model";

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

export { TOURNAMENT_BRIEFING_DURATION_MS } from "@poke-lounge/battle/tournament-gathering";
const TOURNAMENT_RESULT_DURATION_MS = 10_000;

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
  createAnnouncement(
    text: string,
    fontSize: "14px" | "16px",
    result?: boolean,
  ): TournamentAnnouncement;
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
      !hasBattleReadyTournamentPokemon(player) ||
      !hasBattleReadyTournamentPokemon(opponent)
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

    return [...localPlayers, ...remotePlayers].filter(hasBattleReadyTournamentPokemon).slice(0, 8);
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
      !hasBattleReadyTournamentPokemon(player) ||
      !hasBattleReadyTournamentPokemon(opponent)
    ) {
      return false;
    }

    this.tournamentBattleStarting = true;
    this.dependencies.startTrainerBattle(match, player, opponent);

    return true;
  }

  private showServerTournamentMessage(projection: TournamentStateRoomPayload, nowMs: number): void {
    if (isWaitingForStarterSelections(projection)) {
      this.setAnnouncement("모든 참가자가 포켓몬을 선택하면 함께 탐험을 시작합니다.", "14px");
      return;
    }
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

    if (this.showServerRoundResultIfNeeded(projection, nowMs)) {
      return;
    }

    this.clearPresentation();
  }

  private showServerRoundResultIfNeeded(
    projection: TournamentStateRoomPayload,
    nowMs: number,
  ): boolean {
    const state = this.dependencies.gameStateStore.getState();
    const startedAtMs = projection.roomRound.startedAtMs;

    if (
      projection.roomStatus !== "round-started" ||
      projection.roundIndex <= 1 ||
      startedAtMs === null ||
      nowMs >= startedAtMs + TOURNAMENT_RESULT_DURATION_MS ||
      state.tournament.lastRoundScores.length === 0 ||
      state.tournament.standings.length === 0
    ) {
      return false;
    }

    const panel = createTournamentResultPanelViewModel({
      roundIndex: projection.roundIndex - 1,
      totalRounds: state.round.totalRounds,
      final: false,
      standings: createVisibleTournamentStandings(state),
      roundScores: state.tournament.lastRoundScores,
      cumulativeScores: state.tournament.scoresByPlayerId,
    });
    this.setAnnouncement(
      [
        panel.title,
        ...panel.rows.map(formatTournamentResultRow),
        panel.rankingLabel,
        `다음 라운드 준비 중 · ${formatRemainingTime(
          Math.max(0, (projection.roomRound.endsAtMs ?? nowMs) - nowMs),
        )}`,
      ].join("\n"),
      "14px",
      true,
    );
    return true;
  }

  private setAnnouncement(text: string, fontSize: "14px" | "16px", result = false): void {
    if (this.announcement && this.announcementText === text) {
      return;
    }

    this.announcement?.destroy();
    this.announcement = this.dependencies.createAnnouncement(text, fontSize, result);
    this.announcementText = text;
  }
}

export function hasBattleReadyTournamentPokemon(player: LocalPlayerState): boolean {
  return findBattleReadyPartySlot(player.party, player.activePartySlotIndex) !== null;
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
