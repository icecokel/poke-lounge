import { InjectionToken, Module, Provider } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { User } from './auth/entities/user.entity';
import { GoogleAuthGuard } from './auth/google-auth.guard';
import { GameController } from './game/game.controller';
import { GameService } from './game/game.service';
import { CompetitiveMatchService } from './poke-lounge/competitive/competitive-match.service';
import { PokeLoungeController } from './poke-lounge/poke-lounge.controller';
import { PokeLoungeRoomService } from './poke-lounge/poke-lounge-room.service';

const stub = (provide: InjectionToken): Provider => ({ provide, useValue: {} });
const guardStub = (provide: InjectionToken): Provider => ({
  provide,
  useValue: { canActivate: () => true },
});

@Module({
  controllers: [AppController, GameController, PokeLoungeController],
  providers: [
    AppService,
    stub(GameService),
    stub(PokeLoungeRoomService),
    stub(CompetitiveMatchService),
    stub(getRepositoryToken(User)),
    guardStub(GoogleAuthGuard),
  ],
})
export class ApiContractModule {}
