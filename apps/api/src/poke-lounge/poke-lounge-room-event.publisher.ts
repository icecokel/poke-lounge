import type { PokeLoungePublicRoomState } from './poke-lounge-room.types';

export const POKE_LOUNGE_ROOM_EVENT_PUBLISHER = Symbol(
  'POKE_LOUNGE_ROOM_EVENT_PUBLISHER',
);

export interface PokeLoungeRoomCommittedEvent {
  type:
    | 'room-created'
    | 'room-updated'
    | 'room-clock-advanced'
    | 'competitive-assignment-committed'
    | 'competitive-action-committed';
  snapshot: PokeLoungePublicRoomState;
}

export interface PokeLoungeRoomEventPublisher {
  publish(event: PokeLoungeRoomCommittedEvent): Promise<void>;
  subscribeSnapshots?(
    listener: (snapshot: PokeLoungePublicRoomState) => void,
  ): () => void;
}
