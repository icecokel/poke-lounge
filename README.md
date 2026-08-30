# Poke Lounge

`/Users/smlee/vscoke`에서 분리한 Poke Lounge 전용 monorepo다.

## 실행

```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local
cp apps/api/.env.example apps/api/.env
pnpm dev
```

Web은 `http://localhost:3000`, API는 `http://localhost:3001`을 기본으로 사용한다. Redis와
PostgreSQL이 필요하며, 경쟁 턴 제한 처리는 `pnpm --filter @poke-lounge/api start:turn-worker`로
별도 실행한다.

```bash
pnpm lint
pnpm test
pnpm build
```

PostgreSQL·Redis 통합 검증은 `_test` database를 지정해 실행한다.

```bash
TEST_DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/poke_lounge_test \
REDIS_URL=redis://HOST:6379 \
pnpm test:api:e2e
```

공개 배포 전에는 `docs/poke-lounge-release-gate.md`의 에셋 권리 미해결 상태를 해소해야 한다.
배포 환경과 장애 대응은 `docs/deployment-and-env.md`, `docs/operations-runbook.md`를 따른다.
컨셉, 규칙, 시나리오와 VSCoke에서 이관한 과거 계획·보고서는
[`docs/README.md`](docs/README.md)에서 확인한다.
