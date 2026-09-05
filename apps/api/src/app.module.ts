import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WinstonModule } from 'nest-winston';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { winstonConfig } from './common/utils/winston.config';
import { GameModule } from './game/game.module';
import { PokeLoungeMcpController } from './mcp/poke-lounge-mcp.controller';
import { PokeLoungeModule } from './poke-lounge/poke-lounge.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    WinstonModule.forRoot(winstonConfig),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const nodeEnv = configService.get<string>('NODE_ENV', 'development');
        const synchronize =
          configService.get<string>('DB_SYNCHRONIZE') === 'true';
        if (nodeEnv === 'production' && synchronize) {
          throw new Error('DB_SYNCHRONIZE=true is not allowed in production');
        }

        return {
          type: 'postgres' as const,
          host: configService.get<string>('DB_HOST', 'localhost'),
          port: configService.get<number>('DB_PORT', 5432),
          username: configService.get<string>('DB_USERNAME', 'postgres'),
          password: configService.get<string>('DB_PASSWORD', 'postgres'),
          database: configService.get<string>('DB_DATABASE', 'poke_lounge'),
          entities: [__dirname + '/**/*.entity{.ts,.js}'],
          synchronize,
        };
      },
    }),
    AuthModule,
    GameModule,
    PokeLoungeModule,
  ],
  controllers: [AppController, PokeLoungeMcpController],
  providers: [AppService],
})
export class AppModule {}
