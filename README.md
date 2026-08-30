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

Docker로 전체 서비스를 실행하려면 다음 명령을 사용한다. 자세한 내용은
[`docs/docker.md`](docs/docker.md)를 따른다.

```bash
docker compose up --build --detach
```

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

브라우저 설치와 상세 실행 조건은 [Playwright 테스트 문서](docs/playwright-testing.md)를 따른다.

## 주요 명령

| 명령                                       | 설명                                  |
| ------------------------------------------ | ------------------------------------- |
| `pnpm dev`                                 | Web, API와 공통 전투 패키지 개발 실행 |
| `pnpm build`                               | 전체 프로덕션 빌드                    |
| `pnpm lint`                                | 전체 워크스페이스 린트                |
| `pnpm test`                                | 배틀, Web과 API 단위 테스트           |
| `pnpm check:api-contract`                  | OpenAPI 생성물과 Web 타입 계약 확인   |
| `pnpm check:poke-lounge-battle-resolution` | 공통 전투 규칙의 타입·런타임 확인     |
| `pnpm check:poke-lounge-provenance`        | 공개 에셋 출처와 권리 기록 검증       |

## 문서

- [게임 콘셉트](docs/poke-lounge-game-concept.md)
- [게임 규칙](docs/poke-lounge-rules/index.md)
- [멀티플레이 테스트 시나리오](docs/poke-lounge-multiplayer-test-scenarios.md)
- [배포와 환경 변수](docs/deployment-and-env.md)
- [운영 런북](docs/operations-runbook.md)
- [릴리스 게이트](docs/poke-lounge-release-gate.md)
- [전체 문서 색인](docs/README.md)

## 공개 출시 상태

현재 71개 공개 에셋의 배포 권리가 확인되지 않아 출시 상태는 `UNRESOLVED`다. 공개 배포 전
에셋을 교체·제거하거나 권리 근거와 release owner 승인을 기록해야 한다.

권리 상태를 빌드 차단 조건으로 적용하는 환경에서는 다음 변수를 설정한다.

```bash
POKE_LOUNGE_PROVENANCE_STRICT=1 pnpm build
```
