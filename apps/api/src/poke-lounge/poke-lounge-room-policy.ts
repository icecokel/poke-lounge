import {
  accumulateTournamentScores,
  rankCumulativeTournamentScores,
  scoreRemainingHpPercentage,
} from '@poke-lounge/battle/tournament-scoring';
import {
  createTournamentBracketState,
  getReadyTournamentMatches,
  recordTournamentMatchResult,
} from '@poke-lounge/battle/tournament-bracket';
import { restoreCompetitiveParty } from '@poke-lounge/battle/competitive-party';
import type { PokeLoungeRoomSnapshot } from './poke-lounge-room.repository';
import type { PokeLoungeRoomState } from './poke-lounge-room.types';
import type { PokeLoungeMatchResultReason } from './poke-lounge-room.types';

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

export const POKE_LOUNGE_ROOM_CAPACITY = 20;
export const POKE_LOUNGE_CREATION_ADVISORY_LOCK = 742198451;
export const POKE_LOUNGE_ACTIVE_ROOM_LEASE_MS = 2 * HOUR_MS;
export const POKE_LOUNGE_PENDING_PRESENCE_LEASE_MS = 15_000;
export const POKE_LOUNGE_GAME_ROUND_COUNT = 3;
const MAX_TOURNAMENT_WALKOVERS = 12;

export function getPokeLoungeRoomHostPlayerId(
  room: Pick<PokeLoungeRoomState, 'participants'>,
): string | null {
  return (
    room.participants
      .filter(function filterItem(participant) {
        return participant.role === 'participant';
      })
      .sort(function compareItems(left, right) {
        return (
          left.joinedAtMs - right.joinedAtMs ||
          left.playerId.localeCompare(right.playerId)
        );
      })[0]?.playerId ?? null
  );
}

export function getPokeLoungeRoomExpiresAtMs(
  room: Pick<PokeLoungeRoomState, 'status' | 'updatedAtMs'>,
): number {
  switch (room.status) {
    case 'waiting':
      return room.updatedAtMs + 30 * MINUTE_MS;
    case 'round-started':
    case 'tournament':
      return room.updatedAtMs + POKE_LOUNGE_ACTIVE_ROOM_LEASE_MS;
    case 'completed':
    case 'closed':
      return room.updatedAtMs + 10 * MINUTE_MS;
  }
}

export function isPokeLoungeRoomExpired(
  room: Pick<PokeLoungeRoomSnapshot, 'expiresAtMs'>,
  nowMs: number,
): boolean {
  return room.expiresAtMs < nowMs;
}

export function advancePokeLoungeRoomClock(
  room: PokeLoungeRoomSnapshot,
  nowMs: number,
): PokeLoungeRoomSnapshot | null {
  if (
    room.status !== 'round-started' ||
    room.round.phase !== 'round-started' ||
    room.round.endsAtMs === null ||
    nowMs < room.round.endsAtMs
  ) {
    return null;
  }

  const advanced = structuredClone(room);
  const participants = advanced.participants.filter(
    function filterItem(participant) {
      return participant.role === 'participant' && participant.connected;
    },
  );
  if (participants.length < 2) {
    resetPokeLoungeRoundPreparation(advanced);
    advanced.updatedAtMs = nowMs;
    advanced.revision = room.revision + 1;
    advanced.expiresAtMs = getPokeLoungeRoomExpiresAtMs(advanced);
    return advanced;
  }

  const participantsReady = participants.every(function testItem(participant) {
    return Boolean(
      advanced.partySnapshots[participant.playerId]?.competitiveParty.members
        .length,
    );
  });
  if (!participantsReady) {
    advanced.status = 'closed';
    advanced.closeReason = 'competitive-party-not-ready';
    advanced.round.phase = 'completed';
    advanced.round.endsAtMs = null;
    advanced.tournament.activeMatchId = null;
    advanced.tournament.activeMatchAuthority = null;
    advanced.updatedAtMs = nowMs;
    advanced.revision = room.revision + 1;
    advanced.expiresAtMs = getPokeLoungeRoomExpiresAtMs(advanced);
    return advanced;
  }
  if (
    participants.some(function testItem(participant) {
      return !participant.ready;
    })
  ) {
    return null;
  }
  for (const participant of participants) {
    const partySnapshot = advanced.partySnapshots[participant.playerId];
    partySnapshot.competitiveParty = restoreCompetitiveParty(
      partySnapshot.competitiveParty,
    );
    partySnapshot.updatedAtMs = nowMs;
  }
  advanced.status = 'tournament';
  advanced.round.phase = 'tournament';
  advanced.updatedAtMs = nowMs;
  advanced.revision = room.revision + 1;
  advanced.tournament = createTournamentState(advanced);
  advanced.expiresAtMs = getPokeLoungeRoomExpiresAtMs(advanced);

  return advanced;
}

export function expirePendingPokeLoungePresence(
  room: PokeLoungeRoomSnapshot,
  nowMs: number,
): PokeLoungeRoomSnapshot | null {
  const expiredPlayerIds = new Set(
    room.participants
      .filter(function filterItem(participant) {
        const pendingUntilMs =
          participant.presencePendingUntilMs ??
          participant.disconnectPendingUntilMs;
        return pendingUntilMs !== undefined && pendingUntilMs <= nowMs;
      })
      .map(function mapItem(participant) {
        return participant.playerId;
      }),
  );
  if (expiredPlayerIds.size === 0) {
    return null;
  }

  const expired = structuredClone(room);
  if (expired.status === 'waiting') {
    expired.participants = expired.participants.filter(
      function filterItem(participant) {
        return !expiredPlayerIds.has(participant.playerId);
      },
    );
    for (const playerId of expiredPlayerIds) {
      delete expired.partySnapshots[playerId];
    }
  } else {
    for (const participant of expired.participants) {
      if (expiredPlayerIds.has(participant.playerId)) {
        participant.connected = false;
        participant.ready = false;
        participant.leftAtMs = nowMs;
        delete participant.presencePendingUntilMs;
        delete participant.disconnectPendingUntilMs;
        delete participant.presenceEpoch;
      }
    }
    if (
      expired.status === 'tournament' &&
      expired.tournament.activeMatchAuthority !== 'server'
    ) {
      convergeOfflinePokeLoungeTournamentMatches(expired, nowMs);
    }
  }

  expired.updatedAtMs = nowMs;
  expired.revision = room.revision + 1;
  expired.expiresAtMs = getPokeLoungeRoomExpiresAtMs(expired);
  return expired;
}

export function createTournamentState(
  room: PokeLoungeRoomState,
): PokeLoungeRoomState['tournament'] {
  const participants = room.participants
    .filter(function filterItem(participant) {
      return (
        participant.role === 'participant' &&
        participant.connected &&
        Boolean(
          room.partySnapshots[participant.playerId]?.competitiveParty.members
            .length,
        )
      );
    })
    .sort(function compareItems(left, right) {
      return (
        left.joinedAtMs - right.joinedAtMs ||
        left.playerId.localeCompare(right.playerId)
      );
    });
  const bracket = createTournamentBracketState(
    participants.map(function mapItem({ playerId, displayName }) {
      return {
        playerId,
        displayName,
      };
    }),
    room.round.index,
  );

  return {
    version: 2,
    bracket,
    activeMatchId: getReadyTournamentMatches(bracket)[0]?.matchId ?? null,
    activeMatchAuthority: 'casual',
    roundScores: {},
    cumulativeScores: structuredClone(room.tournament.cumulativeScores),
  };
}

export function resetPokeLoungeRoundPreparation(
  room: PokeLoungeRoomState,
): void {
  room.status = 'waiting';
  room.round.phase = 'waiting';
  room.round.startedAtMs = null;
  room.round.endsAtMs = null;
  for (const participant of room.participants) {
    participant.ready = false;
  }
}

export function normalizeLegacyPokeLoungeRoomSnapshot(
  room: PokeLoungeRoomSnapshot,
  nowMs: number,
): PokeLoungeRoomSnapshot | null {
  const tournament = room.tournament as unknown as {
    version?: number;
    matches?: Array<{ status?: string }>;
    cumulativeScores?: Record<string, number>;
  };
  const normalizesTournament = tournament.version !== 2;
  const normalizesVisibility =
    room.visibility !== 'public' && room.visibility !== 'private';
  if (!normalizesTournament && !normalizesVisibility) {
    return null;
  }

  const normalized = structuredClone(room);
  normalized.visibility = normalizesVisibility ? 'private' : room.visibility;
  normalized.revision = room.revision + 1;
  normalized.updatedAtMs = nowMs;

  if (normalizesTournament) {
    normalized.tournament = {
      version: 2,
      bracket: null,
      activeMatchId: null,
      activeMatchAuthority: null,
      roundScores: {},
      cumulativeScores: structuredClone(tournament.cumulativeScores ?? {}),
    };

    const canRestartDeterministically =
      (room.status === 'waiting' || room.status === 'round-started') &&
      !(tournament.matches ?? []).some(function testItem(match) {
        return match.status === 'completed';
      });

    if (!canRestartDeterministically) {
      normalized.status = 'closed';
      normalized.closeReason = 'legacy-room-restart-required';
      normalized.round.phase = 'completed';
      normalized.round.endsAtMs = null;
    }
  }

  normalized.expiresAtMs = getPokeLoungeRoomExpiresAtMs(normalized);
  return normalized;
}

export function completePokeLoungeTournamentMatch(
  room: PokeLoungeRoomState,
  matchId: string,
  winnerPlayerId: string,
  reason: PokeLoungeMatchResultReason,
  nowMs: number,
  terminalHpScores?: Readonly<Record<string, number>>,
): void {
  const bracket = room.tournament.bracket;
  if (!bracket) {
    throw new Error('Tournament bracket is not initialized');
  }
  const match = bracket.currentRound?.matches.find(
    function findItem(candidate) {
      return candidate.matchId === matchId;
    },
  );
  const loserPlayerId = match?.participantIds.find(function findItem(playerId) {
    return playerId !== winnerPlayerId;
  });
  if (!match || !loserPlayerId) {
    throw new Error('Tournament match participants are invalid');
  }
  const roundScores = { ...(room.tournament.roundScores ?? {}) };
  if (terminalHpScores) {
    roundScores[loserPlayerId] = requireRoundHpScore(
      terminalHpScores,
      loserPlayerId,
    );
  }

  room.tournament.bracket = recordTournamentMatchResult(
    bracket,
    matchId,
    winnerPlayerId,
    { reason, completedAtMs: nowMs },
  );
  room.updatedAtMs = nowMs;

  if (room.tournament.bracket.status === 'completed') {
    if (terminalHpScores) {
      roundScores[winnerPlayerId] = requireRoundHpScore(
        terminalHpScores,
        winnerPlayerId,
      );
    }
    const scoreRows = room.tournament.bracket.participants.map(
      function mapItem(participant) {
        return {
          ...participant,
          rank: participant.seed,
          score:
            roundScores[participant.playerId] ??
            scoreFrozenParty(room, participant.playerId),
        };
      },
    );
    room.tournament.cumulativeScores = accumulateTournamentScores(
      room.tournament.cumulativeScores,
      scoreRows,
    );
    room.tournament.activeMatchId = null;
    room.tournament.activeMatchAuthority = null;
    room.tournament.roundScores = {};

    if (room.round.index < POKE_LOUNGE_GAME_ROUND_COUNT) {
      room.round.index += 1;
      room.tournament.bracket = null;
      room.finalStandings = [];
      if (
        room.participants.filter(function filterItem(participant) {
          return participant.role === 'participant' && participant.connected;
        }).length < 2
      ) {
        resetPokeLoungeRoundPreparation(room);
      } else {
        room.status = 'round-started';
        room.round.phase = 'round-started';
        room.round.startedAtMs = nowMs;
        room.round.endsAtMs = nowMs + room.round.durationMs;
        for (const participant of room.participants) {
          participant.ready = false;
        }
      }
      return;
    }

    room.status = 'completed';
    room.round.phase = 'completed';
    room.round.endsAtMs = null;
    room.finalStandings = rankCumulativeTournamentScores(
      room.tournament.cumulativeScores,
      room.tournament.bracket.participants,
    ).map(function mapItem({ playerId, displayName, score, rank }) {
      return {
        playerId,
        displayName,
        score,
        rank,
      };
    });
    return;
  }

  room.tournament.roundScores = roundScores;

  room.tournament.activeMatchId =
    getReadyTournamentMatches(room.tournament.bracket)[0]?.matchId ?? null;
  room.tournament.activeMatchAuthority = room.tournament.activeMatchId
    ? 'casual'
    : null;
}

export type PokeLoungeOfflineForfeit = {
  matchId: string;
  winnerPlayerId: string;
  loserPlayerId: string;
};

export function convergeOfflinePokeLoungeTournamentMatches(
  room: PokeLoungeRoomState,
  nowMs: number,
  targetMatchId?: string,
): PokeLoungeOfflineForfeit[] {
  const completed: PokeLoungeOfflineForfeit[] = [];

  for (let attempt = 0; attempt < MAX_TOURNAMENT_WALKOVERS; attempt += 1) {
    if (room.status !== 'tournament' || !room.tournament.bracket) {
      return completed;
    }
    const match = getReadyTournamentMatches(room.tournament.bracket).find(
      function findItem(candidate) {
        return (
          (!targetMatchId || candidate.matchId === targetMatchId) &&
          candidate.participantIds.some(function testItem(playerId) {
            const participant = room.participants.find(function findItem(row) {
              return row.playerId === playerId;
            });
            return !isParticipantPresenceActive(participant);
          })
        );
      },
    );
    if (!match) {
      return completed;
    }

    const [participantA, participantB] = match.participantIds.map(
      function mapItem(playerId) {
        return room.participants.find(function findItem(participant) {
          return participant.playerId === playerId;
        });
      },
    );
    if (
      isParticipantPresenceActive(participantA) &&
      isParticipantPresenceActive(participantB)
    ) {
      return completed;
    }

    const winnerPlayerId = selectWalkoverWinner(
      match.participantIds,
      participantA,
      participantB,
    );
    const loserPlayerId = match.participantIds.find(
      function findItem(playerId) {
        return playerId !== winnerPlayerId;
      },
    );
    if (!loserPlayerId) {
      return completed;
    }
    completePokeLoungeTournamentMatch(
      room,
      match.matchId,
      winnerPlayerId,
      'forfeit',
      nowMs,
      createFrozenMatchHpScores(room, match.participantIds),
    );
    completed.push({
      matchId: match.matchId,
      winnerPlayerId,
      loserPlayerId,
    });
  }

  throw new Error('Tournament offline-forfeit convergence exceeded its bound');
}

function createFrozenMatchHpScores(
  room: PokeLoungeRoomState,
  playerIds: readonly string[],
): Record<string, number> {
  return Object.fromEntries(
    playerIds.map(function mapItem(playerId) {
      return [playerId, scoreFrozenParty(room, playerId)];
    }),
  );
}

function scoreFrozenParty(room: PokeLoungeRoomState, playerId: string): number {
  const party = room.partySnapshots[playerId]?.competitiveParty.members;
  if (!party?.length) {
    throw new Error(`Tournament party is missing for ${playerId}`);
  }

  return scoreRemainingHpPercentage(party);
}

function requireRoundHpScore(
  scores: Readonly<Record<string, number>>,
  playerId: string,
): number {
  const score = scores[playerId];
  if (typeof score !== 'number' || !Number.isFinite(score) || score < 0) {
    throw new Error(`Tournament HP score is invalid for ${playerId}`);
  }

  return score;
}

function selectWalkoverWinner(
  participantIds: readonly [string, string],
  participantA: PokeLoungeRoomState['participants'][number] | undefined,
  participantB: PokeLoungeRoomState['participants'][number] | undefined,
): string {
  if (isParticipantPresenceActive(participantA)) {
    return participantIds[0];
  }
  if (isParticipantPresenceActive(participantB)) {
    return participantIds[1];
  }

  const leftAtA = participantA?.leftAtMs ?? Number.NEGATIVE_INFINITY;
  const leftAtB = participantB?.leftAtMs ?? Number.NEGATIVE_INFINITY;
  if (leftAtA !== leftAtB) {
    return leftAtA > leftAtB ? participantIds[0] : participantIds[1];
  }
  return [...participantIds].sort(function compareItems(left, right) {
    return left.localeCompare(right);
  })[0];
}

function isParticipantPresenceActive(
  participant: PokeLoungeRoomState['participants'][number] | undefined,
): boolean {
  return (
    participant === undefined ||
    (participant.connected && participant.presencePendingUntilMs === undefined)
  );
}
