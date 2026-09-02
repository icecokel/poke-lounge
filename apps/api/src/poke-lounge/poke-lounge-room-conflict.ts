import { ConflictException } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { PokeLoungeRoomResponseDto } from './dto/poke-lounge-room-response.dto';
import type { PokeLoungeRoomSnapshot } from './poke-lounge-room.repository';
import type { PokeLoungePublicRoomState } from './poke-lounge-room.types';
import { getPokeLoungeRoomHostPlayerId } from './poke-lounge-room-policy';

export type PokeLoungeRoomConflictKind = 'revision' | 'idempotency';

export class PokeLoungeRoomConflictResponseDto {
  @ApiProperty({ example: 409 })
  statusCode!: number;

  @ApiProperty({
    enum: ['POKE_LOUNGE_REVISION_CONFLICT', 'POKE_LOUNGE_IDEMPOTENCY_CONFLICT'],
  })
  code!: 'POKE_LOUNGE_REVISION_CONFLICT' | 'POKE_LOUNGE_IDEMPOTENCY_CONFLICT';

  @ApiProperty({ example: 'Poke Lounge room revision conflict' })
  message!: string;

  @ApiProperty({ type: PokeLoungeRoomResponseDto })
  snapshot!: PokeLoungeRoomResponseDto;
}

export class PokeLoungeRoomFullResponseDto {
  @ApiProperty({ example: 409 })
  statusCode!: number;

  @ApiProperty({ enum: ['POKE_LOUNGE_ROOM_FULL'] })
  code!: 'POKE_LOUNGE_ROOM_FULL';

  @ApiProperty({ example: 'Poke Lounge room is full' })
  message!: string;
}

export class PokeLoungeRoomConflict extends ConflictException {
  constructor(
    readonly kind: PokeLoungeRoomConflictKind,
    snapshot: PokeLoungeRoomSnapshot,
  ) {
    const idempotency = kind === 'idempotency';

    super({
      statusCode: 409,
      code: idempotency
        ? 'POKE_LOUNGE_IDEMPOTENCY_CONFLICT'
        : 'POKE_LOUNGE_REVISION_CONFLICT',
      message: idempotency
        ? 'Poke Lounge room idempotency conflict'
        : 'Poke Lounge room revision conflict',
      snapshot: toPokeLoungePublicRoomState(snapshot),
    });
  }
}

export class PokeLoungePartySnapshotLocked extends ConflictException {
  constructor() {
    super({
      statusCode: 409,
      code: 'POKE_LOUNGE_PARTY_SNAPSHOT_LOCKED',
      message: 'Poke Lounge party snapshot is locked',
    });
  }
}

export class PokeLoungeRoomFull extends ConflictException {
  constructor() {
    super({
      statusCode: 409,
      code: 'POKE_LOUNGE_ROOM_FULL',
      message: 'Poke Lounge room is full',
    });
  }
}

export function toPokeLoungePublicRoomState(
  room: PokeLoungeRoomSnapshot,
): PokeLoungePublicRoomState {
  return {
    ...room,
    hostPlayerId: getPokeLoungeRoomHostPlayerId(room),
    tournament: {
      version: room.tournament.version,
      bracket: structuredClone(room.tournament.bracket),
      activeMatchId: room.tournament.activeMatchId,
      activeMatchAuthority: room.tournament.activeMatchAuthority,
      cumulativeScores: structuredClone(room.tournament.cumulativeScores),
    },
    partySnapshots: Object.fromEntries(
      Object.entries(room.partySnapshots).map(function mapItem([
        playerId,
        snapshot,
      ]) {
        return [playerId, toPublicPartySnapshot(snapshot)];
      }),
    ),
    competitiveTransitions: structuredClone(room.competitiveTransitions ?? []),
    competitiveAssignments: structuredClone(
      room.competitiveAssignments ??
        (room.competitive ? [room.competitive] : []),
    ),
    participants: room.participants.map(function mapItem(participant) {
      return {
        playerId: participant.playerId,
        displayName: participant.displayName,
        controller: participant.controller === 'ai' ? 'ai' : 'human',
        role: participant.role,
        ready: participant.ready,
        connected:
          participant.connected &&
          participant.presencePendingUntilMs === undefined,
        joinedAtMs: participant.joinedAtMs,
        ...(participant.leftAtMs === undefined
          ? {}
          : { leftAtMs: participant.leftAtMs }),
      };
    }),
  };
}

function toPublicPartySnapshot(
  snapshot: PokeLoungeRoomSnapshot['partySnapshots'][string],
): PokeLoungePublicRoomState['partySnapshots'][string] {
  const representative = snapshot.competitiveParty.members.find(
    function findItem(member) {
      return member.slotIndex === snapshot.competitiveParty.activeSlotIndex;
    },
  );
  if (!representative) {
    throw new Error('Competitive party representative is missing');
  }

  return {
    playerId: snapshot.playerId,
    ...(snapshot.displayName ? { displayName: snapshot.displayName } : {}),
    representativePokemon: {
      speciesId: representative.speciesId,
      level: representative.level,
      currentHp: representative.currentHp,
      maxHp: representative.maxHp,
    },
    partySize: snapshot.competitiveParty.members.length,
    updatedAtMs: snapshot.updatedAtMs,
  };
}
