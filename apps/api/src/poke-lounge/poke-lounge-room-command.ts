import { createHash } from 'node:crypto';

export type PokeLoungeRoomOperation =
  | 'create'
  | 'join'
  | 'ready'
  | 'round-ready'
  | 'start'
  | 'party-snapshot'
  | 'presence'
  | 'result'
  | 'leave';

export interface PokeLoungeRoomCommandContext {
  idempotencyKey: string;
  expectedRevision: number;
}

export interface PokeLoungeIdempotentCommandContext {
  idempotencyKey: string;
}

export interface PokeLoungeRoomCommandEnvelope {
  operation: PokeLoungeRoomOperation;
  roomCode?: string;
  body: unknown;
}

export function hashPokeLoungeRoomCommand(
  envelope: PokeLoungeRoomCommandEnvelope,
): string {
  return createHash('sha256')
    .update(
      canonicalizePokeLoungeCommand({
        ...envelope,
        ...(envelope.roomCode === undefined
          ? {}
          : { roomCode: envelope.roomCode.trim().toUpperCase() }),
      }),
    )
    .digest('hex');
}

export function canonicalizePokeLoungeCommand(value: unknown): string {
  return JSON.stringify(sortCanonicalValue(value));
}

function sortCanonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(function mapItem(item) {
      return sortCanonicalValue(item);
    });
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(function filterItem([, item]) {
          return item !== undefined;
        })
        .sort(function compareItems([left], [right]) {
          return left.localeCompare(right);
        })
        .map(function mapItem([key, item]) {
          return [key, sortCanonicalValue(item)];
        }),
    );
  }

  return value;
}
