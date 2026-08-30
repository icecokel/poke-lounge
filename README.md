# Poke Lounge

친구들과 각자의 포켓몬을 탐색·포획·육성하고, 짧은 3라운드 챔피언십에서 우승을 겨루는
브라우저형 Pokémon 팬 게임이다.

Poke Lounge는 장편 RPG나 MMO보다 짧은 세션의 탐색·육성·대전 루프에 집중한다. 별도 게임
엔진이나 Canvas 없이 Next.js, React, DOM과 CSS로 화면을 구성하며 데스크톱과 모바일
브라우저를 지원한다.

> Poke Lounge는 비공식 팬 프로젝트다. 기술적으로 실행·배포할 수 있다는 사실은 Pokémon 관련
> 명칭, 데이터와 에셋의 공개 사용 권리를 의미하지 않는다. 현재 공개 출시 권리 상태는
> [UNRESOLVED](docs/poke-lounge-release-gate.md)다.

## 게임 흐름

1. 솔로 모드를 선택하거나 닉네임과 친구끼리 공유한 임시 비밀번호로 2~6인 대기실에 입장한다.
2. 저장된 파티를 사용하거나 치코리타·브케인·리아코 중 한 마리를 스타터로 선택한다.
3. Web 허브에서 지역을 탐험하고 포켓몬을 포획·육성하며 파티, 가방, 상점, 회복과 PC 박스를
   관리한다.
4. 멀티플레이 참가자가 모두 준비하면 방장이 첫 라운드를 시작한다.
5. 각 라운드의 3분 준비 시간 동안 파티를 강화한 뒤 싱글 엘리미네이션 토너먼트를 진행한다.
6. 세 라운드에서 파티의 남은 체력 비율을 누적해 최종 순위와 우승자를 결정한다.

주요 기능:

- 야생 조우, 턴제 전투, 포획, 경험치, 레벨업, 기술 습득과 진화
- 최대 6마리 파티, 인벤토리, 상점, 무료 회복과 PC 박스
- 브라우저 로컬 저장과 선택적 로그인 계정 저장
- 임시 비밀번호 기반 2~6인 대기실, 준비 상태와 재접속
- 서버 권위 대진·전투·결과와 3라운드 누적 순위
- 데스크톱·모바일 반응형 UI와 BGM·효과음

게임 규칙의 정확한 수치와 예외는 [게임 규칙 인덱스](docs/poke-lounge-rules/index.md)를 따른다.

## 구조

| 경로                          | 역할                                                   |
| ----------------------------- | ------------------------------------------------------ |
| `apps/web`                    | Next.js 15, React 19 기반 Web 허브·전투 UI와 자동 저장 |
| `apps/api`                    | NestJS REST·Socket.IO API, 방 상태와 경쟁전 처리       |
| `packages/poke-lounge-battle` | Web과 API가 공유하는 결정론적 전투·대진 규칙           |
| `docs/poke-lounge-rules`      | 플레이, 전투, 멀티플레이와 챔피언십 규칙의 기준 문서   |
| `scripts/poke-lounge`         | 데이터·에셋 생성과 출처 검증 도구                      |

런타임은 PostgreSQL, Redis, Socket.IO와 BullMQ를 사용한다. 경쟁전의 파티와 행동은 서버가 검증하고,
Web과 API는 `@poke-lounge/battle`의 동일한 규칙을 공유한다.

## 요구 사항

- Node.js 20 이상 (`.nvmrc`: 20)
- pnpm 9.12.0
- PostgreSQL 16
- Redis 7

Docker Compose를 사용하면 애플리케이션과 데이터 서비스를 한 번에 실행할 수 있다.

## 빠른 시작 — Docker

```bash
docker compose up --build --detach
docker compose ps
```

- 게임: <http://localhost:3000/ko-KR/game/poke-lounge>
- API 상태: <http://localhost:3001/health>

로그 확인과 종료:

```bash
docker compose logs --follow web api turn-worker
docker compose down
```

로컬 PostgreSQL과 Redis 데이터까지 초기화할 때만 다음 명령을 사용한다.

```bash
docker compose down --volumes
```

자세한 내용은 [Docker 실행 문서](docs/docker.md)를 참고한다.

## 로컬 개발

```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local
cp apps/api/.env.example apps/api/.env
```

두 환경 파일의 OAuth, PostgreSQL과 Redis 연결값을 로컬 환경에 맞게 설정한 뒤 데이터베이스
마이그레이션을 실행한다.

```bash
pnpm build:api
pnpm --filter @poke-lounge/api migration:run
pnpm dev
```

기본 주소는 Web `http://localhost:3000`, API `http://localhost:3001`이다. 경쟁전 턴 제한을
처리하려면 별도 터미널에서 턴 워커도 실행한다.

```bash
pnpm --filter @poke-lounge/api start:turn-worker
```

## 검증

기본 품질 게이트:

```bash
pnpm format:check
pnpm lint
pnpm type:check:web
pnpm test
pnpm build
```

일반·모바일 브라우저와 로컬 테스트 모드:

```bash
pnpm --filter @poke-lounge/web e2e
pnpm e2e:local-test-mode
```

PostgreSQL·Redis 통합 테스트는 일반 DB와 분리되고 이름이 `_test`로 끝나는 데이터베이스가
필요하다.

```bash
export TEST_DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/poke_lounge_test
export REDIS_URL=redis://HOST:6379/15

pnpm --filter @poke-lounge/api migration:run:test
pnpm test:api:e2e
pnpm e2e:integration
PLAYWRIGHT_ENABLE_CROSS_BROWSER=1 pnpm e2e:five-player
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
