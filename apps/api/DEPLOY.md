# API Deployment

전체 환경 기준은 [Deployment and Environment](../../docs/deployment-and-env.md)를 따른다.

1. 배포 호스트의 `API_DEPLOY_DIR`에 mode 600의 `.env`를 준비한다.
2. PostgreSQL backup을 만든 뒤 migration 상태를 확인하고 수동 적용한다.
3. `deploy-api.yml`을 실행한다.
4. API와 turn worker의 PM2 상태, 내부·공개 `/health`를 확인한다.

```bash
pnpm build:api
pnpm --filter @poke-lounge/api migration:show
pnpm --filter @poke-lounge/api migration:run
```

workflow는 build와 production install이 성공한 release만 승격한다. Redis가 준비되지 않으면 배포를
중단하며, migration은 자동 실행하지 않는다. 장애 복구는
[Operations Runbook](../../docs/operations-runbook.md)을 따른다.
