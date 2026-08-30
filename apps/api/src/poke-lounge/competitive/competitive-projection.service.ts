import { Injectable } from '@nestjs/common';
import type { PokeLoungeRoomSnapshot } from '../poke-lounge-room.repository';
import { RedisPokeLoungeRepository } from '../redis-poke-lounge.repository';
export {
  toCompetitiveProjection,
  toCompetitiveTerminalTransition,
} from './competitive-projection';

@Injectable()
export class CompetitiveProjectionService {
  constructor(private readonly repository: RedisPokeLoungeRepository) {}

  async findRoomSnapshot(
    roomCode: string,
    afterRevision?: number,
  ): Promise<PokeLoungeRoomSnapshot | null> {
    const snapshot = await this.repository.findRoomSnapshot(
      roomCode,
      afterRevision,
    );
    await this.afterRoomRead();
    return snapshot;
  }

  protected afterRoomRead(): Promise<void> {
    return Promise.resolve();
  }
}
