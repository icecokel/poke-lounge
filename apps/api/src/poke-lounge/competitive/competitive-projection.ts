import type { CanonicalBattleState } from '@poke-lounge/battle/canonical-state';
import type { CompetitiveTerminalTransition } from '../poke-lounge-room.types';
import { COMPETITIVE_TURN_DEADLINE_MS } from './competitive-action.repository';
import type {
  CompetitiveActionProjection,
  PublicCompetitiveBattleState,
} from './competitive-action.types';
import type {
  CompetitiveMatchAssignment,
  CompetitiveMatchStatus,
} from './competitive-match.types';

export function toCompetitiveProjection(
  match: Pick<
    CompetitiveMatchAssignment,
    | 'matchId'
    | 'bracketMatchId'
    | 'kind'
    | 'assignmentRevision'
    | 'rulesetVersion'
    | 'rulesetHash'
    | 'currentTurn'
    | 'status'
    | 'currentState'
    | 'currentStateHash'
    | 'terminalResult'
  > &
    Partial<
      Pick<
        CompetitiveMatchAssignment,
        'terminalEventId' | 'terminalRoomRevision' | 'turnStartedAtMs'
      >
    > & { updatedAt?: Date },
  submittedPlayerIds: readonly string[],
): CompetitiveActionProjection {
  const terminalEventId = match.terminalEventId ?? null;
  const terminalRoomRevision = match.terminalRoomRevision ?? null;
  assertProjectionMetadata({
    status: match.status,
    terminalEventId,
    terminalRoomRevision,
    terminal: match.terminalResult,
    stateTerminal: match.currentState.terminal,
  });

  return {
    matchId: match.matchId,
    bracketMatchId: match.bracketMatchId,
    kind: match.kind,
    assignmentRevision: match.assignmentRevision,
    rulesetVersion: match.rulesetVersion,
    rulesetHash: match.rulesetHash,
    currentTurn: match.currentTurn,
    turnEndsAtMs: resolveTurnEndsAtMs(match),
    status: match.status,
    terminalEventId,
    terminalRoomRevision,
    playerIds: [
      match.currentState.participantIds[0],
      match.currentState.participantIds[1],
    ],
    currentState: toPublicBattleState(match.currentState),
    stateHash: match.currentStateHash,
    submittedPlayerIds: [...submittedPlayerIds].sort(),
    terminal: structuredClone(match.terminalResult),
  };
}

function resolveTurnEndsAtMs(input: {
  turnStartedAtMs?: number;
  updatedAt?: Date;
}): number {
  const turnStartedAtMs =
    input.turnStartedAtMs ?? input.updatedAt?.getTime() ?? Number.NaN;
  if (!Number.isSafeInteger(turnStartedAtMs) || turnStartedAtMs < 0) {
    throw new Error('Competitive turn start time is invalid');
  }
  return turnStartedAtMs + COMPETITIVE_TURN_DEADLINE_MS;
}

export function toCompetitiveTerminalTransition(
  projection: CompetitiveActionProjection,
): CompetitiveTerminalTransition {
  assertProjectionMetadata({
    status: projection.status,
    terminalEventId: projection.terminalEventId,
    terminalRoomRevision: projection.terminalRoomRevision,
    terminal: projection.terminal,
    stateTerminal: projection.currentState.terminal,
  });

  if (projection.status !== 'completed') {
    throw new Error('Competitive terminal transition must be completed');
  }

  return {
    terminalEventId: projection.terminalEventId as string,
    terminalRoomRevision: projection.terminalRoomRevision as number,
    projection: structuredClone(projection),
  };
}

function assertProjectionMetadata(input: {
  status: CompetitiveMatchStatus;
  terminalEventId: string | null;
  terminalRoomRevision: number | null;
  terminal: CompetitiveMatchAssignment['terminalResult'];
  stateTerminal: CompetitiveMatchAssignment['terminalResult'];
}): void {
  if (input.status !== 'completed') {
    if (input.terminalEventId !== null || input.terminalRoomRevision !== null) {
      throw new Error(
        'Pending or active competitive projection cannot carry terminal metadata',
      );
    }
    return;
  }

  if (
    typeof input.terminalEventId !== 'string' ||
    input.terminalEventId.length === 0 ||
    !Number.isSafeInteger(input.terminalRoomRevision) ||
    (input.terminalRoomRevision as number) < 0
  ) {
    throw new Error(
      'Completed competitive projection requires terminal metadata',
    );
  }
  if (!input.terminal || !input.stateTerminal) {
    throw new Error('Completed competitive projection requires terminal state');
  }
  if (!hasSameTerminal(input.terminal, input.stateTerminal)) {
    throw new Error('Competitive terminal projection state is inconsistent');
  }
}

function hasSameTerminal(
  left: NonNullable<CompetitiveMatchAssignment['terminalResult']>,
  right: NonNullable<CompetitiveMatchAssignment['terminalResult']>,
): boolean {
  return (
    left.winnerPlayerId === right.winnerPlayerId &&
    left.loserPlayerId === right.loserPlayerId &&
    left.reason === right.reason &&
    JSON.stringify(Object.entries(left.scoreByPlayerId).sort()) ===
      JSON.stringify(Object.entries(right.scoreByPlayerId).sort())
  );
}

function toPublicBattleState(
  state: CanonicalBattleState,
): PublicCompetitiveBattleState {
  return {
    rulesetVersion: state.rulesetVersion,
    turn: state.turn,
    participantIds: [...state.participantIds],
    playersById: Object.fromEntries(
      state.participantIds.map(function mapItem(playerId) {
        const player = state.playersById[playerId];
        return [
          playerId,
          {
            playerId,
            activeSlotIndex: player.activeSlotIndex,
            team: player.team.map(function mapItem(combatant) {
              return {
                speciesId: combatant.speciesId,
                slotIndex: combatant.slotIndex,
                level: combatant.level,
                maxHp: combatant.maxHp,
                currentHp: combatant.currentHp,
                status: combatant.status,
                statStages: { ...combatant.statStages },
                moves: combatant.moves.map(function mapItem({ moveId, pp }) {
                  return { moveId, pp };
                }),
              };
            }),
          },
        ];
      }),
    ),
    terminal: structuredClone(state.terminal),
  };
}
