import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { requestIdMiddleware } from './common/middleware/request-id.middleware';

import { WinstonModule } from 'nest-winston';
import { winstonConfig } from './common/utils/winston.config';
import { getCorsOptions } from './common/utils/cors.util';
import { setupApiDocumentation } from './api-documentation';
import {
  LOCAL_TEST_API_HOSTNAME,
  resolveLocalTestAuthToken,
} from './auth/local-test-account';
import { PokeLoungeLiveStateService } from './poke-lounge/poke-lounge-live-state.service';
import { PokeLoungeRedisIoAdapter } from './poke-lounge/poke-lounge-redis-io.adapter';

/**
 * 애플리케이션 진입점 함수
 */
async function bootstrap() {
  // NestJS 애플리케이션 인스턴스 생성 (Winston 로거 적용)
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: WinstonModule.createLogger(winstonConfig),
  });
  const liveState = app.get(PokeLoungeLiveStateService);
  await liveState.connect();
  app.useWebSocketAdapter(
    new PokeLoungeRedisIoAdapter(app, liveState.createSocketAdapter()),
  );
  app.enableShutdownHooks();

  app.set('trust proxy', 'loopback');
  app.use(requestIdMiddleware);
  app.enableCors(getCorsOptions(process.env.CORS_ORIGINS));

  // 전역 필터 및 인터셉터 등록
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new TransformInterceptor());

  setupApiDocumentation(app);

  // 지정된 포트에서 서버 실행
  const port = process.env.PORT ?? 3001;

  if (resolveLocalTestAuthToken()) {
    await app.listen(port, LOCAL_TEST_API_HOSTNAME);
    return;
  }

  await app.listen(port);
}

// 애플리케이션 실행
void bootstrap();
