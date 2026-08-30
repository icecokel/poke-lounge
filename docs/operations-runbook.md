# Operations Runbook

## 빠른 확인

1. Web deployment가 Ready인지 확인한다.
2. 공개 API `/health`가 HTTP 200인지 확인한다.
3. PM2의 `poke-lounge-api`와 `poke-lounge-turn-worker`가 online인지 확인한다.
4. PostgreSQL과 Redis 연결을 확인한다.

PM2 이름을 repository variables로 바꿨다면 실제 값을 사용한다.

```bash
pm2 list
pm2 logs poke-lounge-api --lines 100
pm2 logs poke-lounge-turn-worker --lines 100
```

## Redis 또는 멀티플레이 장애

room, 위치, Socket.IO fan-out, player state와 경쟁 turn queue는 모두 `REDIS_URL`을 사용한다.
Redis 장애 중 메모리 fallback을 켜거나 room 값을 수동으로 수정하지 않는다. Redis 복구 뒤 API와
worker를 재시작하고 새 room에서 재검증한다.

```bash
set -a
. ./.env
set +a
node - <<'NODE'
const { createClient } = require('redis');
(async () => {
  const client = createClient({ url: process.env.REDIS_URL });
  try {
    await client.connect();
    console.log(await client.ping());
  } finally {
    if (client.isOpen) await client.close();
  }
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
NODE
```

## Database migration 장애

`Legacy core schema is partial` 또는 `Legacy core schema mismatch`가 발생하면 재실행하거나 ledger를
수동 수정하지 않는다. `user`, `game_history`, enum과 `migrations` ledger를 덤프해 차이를 확인한 뒤
사전 backup으로 복구한다. baseline `down`은 데이터 삭제 방지를 위해 의도적으로 실패한다.

## 배포 후 검증

```bash
pnpm check:api-contract
pnpm test:api:e2e
pnpm e2e:integration
PLAYWRIGHT_ENABLE_CROSS_BROWSER=1 pnpm e2e:five-player
```

API E2E와 browser integration에는 `_test`로 끝나는 `TEST_DATABASE_URL`과 격리 Redis가 필요하다.
운영 room에 테스트 fixture를 적용하지 않는다.
