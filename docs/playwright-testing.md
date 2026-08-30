# Playwright Testing

공식 브라우저 회귀는 `apps/web/scripts/playwright-runner.mjs`를 사용한다. 러너는 격리 포트의
Next.js 서버를 시작하고 종료하며, 실패 산출물은 `output/playwright/`에 남긴다.

```bash
pnpm --filter @poke-lounge/web exec playwright install chromium webkit
pnpm --filter @poke-lounge/web e2e
pnpm e2e:local-test-mode
```

실제 API 통합 테스트는 `_test` database와 Redis를 사용한다.

```bash
TEST_DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/poke_lounge_test \
REDIS_URL=redis://HOST:6379 \
pnpm e2e:integration

TEST_DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/poke_lounge_test \
REDIS_URL=redis://HOST:6379 \
PLAYWRIGHT_ENABLE_CROSS_BROWSER=1 \
pnpm e2e:five-player
```

기본 매트릭스는 Desktop Chromium과 세 Mobile Chromium viewport다. WebKit과 5-browser
integration project는 `PLAYWRIGHT_ENABLE_CROSS_BROWSER=1`에서 활성화한다. 플레이어별 context,
credential 비노출과 제품 인수 기준은 `poke-lounge-multiplayer-test-scenarios.md`를 따른다.
