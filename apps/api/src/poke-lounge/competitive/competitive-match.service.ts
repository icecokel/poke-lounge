import { randomBytes, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import {
  COMPETITIVE_RULESET_HASH,
  COMPETITIVE_RULESET_VERSION,
} from '@poke-lounge/battle/competitive-ruleset-config';
import { createInitialBattleState } from '@poke-lounge/battle/ruleset';
import { hashCanonicalState } from '@poke-lounge/battle/canonical-state';
import {
  COMPETITIVE_MATCH_REPOSITORY,
  createSessionCompetitiveAccountId,
  type CompetitiveMatchRepository,
  type CompetitiveSeatBindingFailure,
} from './competitive-match.repository';
import type {
  CompetitiveAssignmentCreateContext,
  CompetitiveAssignmentProjection,
  CompetitiveMatchAssignment,
} from './competitive-match.types';
import {
  COMPETITIVE_ACTION_REPOSITORY,
  COMPETITIVE_TURN_DEADLINE_MS,
  type CompetitiveActionFailure,
  type CompetitiveActionRepository,
} from './competitive-action.repository';
import {
  COMPETITIVE_TURN_QUEUE,
  type CompetitiveTurnQueue,
} from './competitive-turn-queue';
import type {
  CompetitiveActionProjection,
  SubmitCompetitiveActionInput,
} from './competitive-action.types';
import {
  POKE_LOUNGE_ROOM_EVENT_PUBLISHER,
  type PokeLoungeRoomEventPublisher,
} from '../poke-lounge-room-event.publisher';
import { toPokeLoungePublicRoomState } from '../poke-lounge-room-conflict';
import type { PokeLoungeRoomSnapshot } from '../poke-lounge-room.repository';
import { toCompetitiveProjection } from './competitive-projection';

@Injectable()
export class CompetitiveMatchService {
  private readonly logger = new Logger(CompetitiveMatchService.name);

  constructor(
    @Inject(COMPETITIVE_MATCH_REPOSITORY)
    private readonly repository: CompetitiveMatchRepository,
    @Inject(COMPETITIVE_ACTION_REPOSITORY)
    private readonly actionRepository: CompetitiveActionRepository,
    @Inject(POKE_LOUNGE_ROOM_EVENT_PUBLISHER)
    private readonly eventPublisher: PokeLoungeRoomEventPublisher,
    @Inject(COMPETITIVE_TURN_QUEUE)
    private readonly turnQueue: CompetitiveTurnQueue,
  ) {}

  async bindSeat(
    roomCode: string,
    sessionId: string,
    accountId: string,
  ): Promise<CompetitiveAssignmentProjection | null> {
    const result = await this.repository.bindSeatAndAssign({
      roomCode: roomCode.trim().toUpperCase(),
      sessionId: sessionId.trim(),
      accountId: accountId.trim(),
      createAssignment: createCompetitiveAssignment,
    });

    if (!('assignment' in result)) {
      throwBindingError(result.outcome);
    }

    if (result.outcome === 'bound-ineligible') {
      throw new ConflictException({
        statusCode: 409,
        code: 'POKE_LOUNGE_COMPETITIVE_ASSIGNMENT_INELIGIBLE',
        message: 'Account is not eligible for this competitive assignment',
        eligible: false,
      });
    }

    if (!result.assignment) {
      return null;
    }

    await this.scheduleTurnTimeout({
      roomCode: result.assignment.roomCode,
      matchId: result.assignment.matchId,
      turn: result.assignment.currentTurn,
      deadlineMs:
        result.assignment.turnStartedAtMs + COMPETITIVE_TURN_DEADLINE_MS,
    });

    if (result.committed) {
      try {
        await this.eventPublisher.publish({
          type: 'competitive-assignment-committed',
          snapshot: {
            ...toPokeLoungePublicRoomState(result.room),
            competitive: result.projection,
          },
        });
      } catch (error) {
        this.logger.error(
          `Failed to publish committed competitive assignment for ${result.assignment.matchId}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }

    return toPublicAssignment(result.assignment);
  }

  async submitAction(input: SubmitCompetitiveActionInput) {
    const result = await this.actionRepository.submit({
      ...input,
      roomCode: input.roomCode.trim().toUpperCase(),
      accountId: input.accountId.trim(),
    });

    if (!('response' in result)) {
      throwActionError(result.outcome);
    }

    if (result.committed) {
      await this.publishCommittedAction(
        input.matchId,
        result.response,
        result.room,
      );
      if (result.room.competitive) {
        await this.scheduleTurnTimeout({
          roomCode: result.room.roomCode,
          matchId: result.room.competitive.matchId,
          turn: result.room.competitive.currentTurn,
          deadlineMs: result.room.competitive.turnEndsAtMs,
        });
      }
    }

    return structuredClone(result.response);
  }

  submitSessionAction(
    input: Omit<SubmitCompetitiveActionInput, 'accountId'> & {
      sessionId: string;
    },
  ) {
    const { sessionId, ...actionInput } = input;
    return this.submitAction({
      ...actionInput,
      accountId: createSessionCompetitiveAccountId(input.roomCode, sessionId),
    });
  }

  private async scheduleTurnTimeout(
    turn: Parameters<CompetitiveTurnQueue['schedule']>[0],
  ): Promise<void> {
    try {
      await this.turnQueue.schedule(turn);
    } catch (error) {
      this.logger.error(
        `Failed to schedule competitive turn for ${turn.matchId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private async publishCommittedAction(
    matchId: string,
    response: CompetitiveActionProjection,
    room: PokeLoungeRoomSnapshot,
  ): Promise<void> {
    try {
      const snapshot = toPokeLoungePublicRoomState(room);
      if (
        !snapshot.competitive &&
        response.status !== 'completed' &&
        (snapshot.tournament.activeMatchId === null ||
          snapshot.tournament.activeMatchId === response.bracketMatchId)
      ) {
        snapshot.competitive = response;
      }
      await this.eventPublisher.publish({
        type: 'competitive-action-committed',
        snapshot,
      });
    } catch (error) {
      this.logger.error(
        `Failed to publish committed competitive action for ${matchId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}

function throwActionError(outcome: CompetitiveActionFailure): never {
  if (outcome === 'illegal-action') {
    throw new BadRequestException('Competitive action is illegal');
  }
  if (outcome === 'room-not-found' || outcome === 'match-not-found') {
    throw new BadRequestException('Competitive match not found');
  }

  throw new ConflictException({
    statusCode: 409,
    code: `POKE_LOUNGE_COMPETITIVE_${outcome.replaceAll('-', '_').toUpperCase()}`,
    message: 'Competitive action conflict',
  });
}

export function createCompetitiveAssignment(
  context: CompetitiveAssignmentCreateContext,
): CompetitiveMatchAssignment {
  const initialState = createInitialBattleState(
    context.players.map(function mapItem(player) {
      return {
        playerId: player.playerId,
        party: context.parties[player.playerId],
      };
    }) as [
      { playerId: string; party: (typeof context.parties)[string] },
      { playerId: string; party: (typeof context.parties)[string] },
    ],
  );
  const initialStateHash = hashCanonicalState(initialState);

  return {
    ...context,
    matchId: randomUUID(),
    playerAccounts: context.players,
    rulesetVersion: COMPETITIVE_RULESET_VERSION,
    rulesetHash: COMPETITIVE_RULESET_HASH,
    serverSeed: randomBytes(32).toString('hex'),
    initialState,
    initialStateHash,
    currentState: structuredClone(initialState),
    currentStateHash: initialStateHash,
    currentTurn: initialState.turn,
    turnStartedAtMs: context.turnStartedAtMs ?? Date.now(),
    status: 'pending',
    terminalEventId: null,
    terminalRoomRevision: null,
    terminalResult: null,
    completedAt: null,
  };
}

function toPublicAssignment(
  assignment: CompetitiveMatchAssignment,
): CompetitiveAssignmentProjection {
  return toCompetitiveProjection(assignment, []);
}

function throwBindingError(outcome: CompetitiveSeatBindingFailure): never {
  if (outcome === 'seat-account-conflict') {
    throw new ConflictException('Competitive seat is already bound');
  }
  if (outcome === 'duplicate-account') {
    throw new ConflictException('Account already occupies a competitive seat');
  }

  throw new BadRequestException('Competitive seat binding rejected');
}
