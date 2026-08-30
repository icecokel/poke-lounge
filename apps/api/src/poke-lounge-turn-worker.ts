import { NestFactory } from '@nestjs/core';
import { WinstonModule } from 'nest-winston';
import { winstonConfig } from './common/utils/winston.config';
import { PokeLoungeTurnWorkerModule } from './poke-lounge/poke-lounge-turn-worker.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(
    PokeLoungeTurnWorkerModule,
    { logger: WinstonModule.createLogger(winstonConfig) },
  );
  app.enableShutdownHooks();
}

void bootstrap();
