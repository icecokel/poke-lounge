import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PokeLoungeLiveStateService } from './poke-lounge-live-state.service';

@Module({
  imports: [ConfigModule],
  providers: [PokeLoungeLiveStateService],
  exports: [ConfigModule, PokeLoungeLiveStateService],
})
export class PokeLoungeRedisModule {}
