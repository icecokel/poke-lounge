# Poke Lounge

Poke Lounge는 친구와 같은 월드에서 포켓몬을 탐색·포획·육성하고, 짧은 챔피언십으로
우승을 겨루는 브라우저형 비공식 Pokémon 팬 게임이다.

## 목적

- 설치와 로그인 없이 데스크톱·모바일 브라우저에서 바로 시작한다.
- 장편 RPG보다 짧은 세션의 탐색 → 육성 → 대전 루프에 집중한다.
- 같은 방 참가자의 움직임과 닉네임을 공유하고, 경쟁 결과는 서버가 확정한다.
- 게임 종료 뒤 다시 플레이하거나 프로젝트를 [GitHub Star](https://github.com/icecokel/poke-lounge)로
  응원할 수 있다.

## 현재 구현

- 단일 마을 월드 탐색, 야생전, 포획, 성장, 상점, 인벤토리와 PC 박스
- Gen 4풍 턴제 전투와 2~6인, 3라운드 멀티플레이 챔피언십
- 데스크톱 키보드와 모바일 터치 입력
- Redis 기반 방 상태·실시간 위치·서버 권위 대진 및 전투 복구
- 현재 탭의 `sessionStorage`에 저장되는 익명 플레이 진행
- Google 로그인 없는 게임 진입과 게임 종료 GitHub Star 안내

```text
게임 시작 → 스타터/저장된 파티 → 월드 탐색·육성 → 챔피언십 → 최종 결과
```

## 구조

| 경로                          | 역할                                              |
| ----------------------------- | ------------------------------------------------- |
| `apps/web`                    | Next.js UI, DOM 게임 런타임, 입력과 브라우저 저장 |
| `apps/api`                    | NestJS REST/Socket.IO, 방·경쟁 상태와 결과 확정   |
| `packages/poke-lounge-battle` | Web/API가 공유하는 전투·대진 규칙                 |
| `docs/poke-lounge-rules`      | 게임 진행과 전투 규칙                             |

Web과 API는 `@poke-lounge/battle`의 결정론적 규칙을 공유한다. Redis는 수명이 있는 방·경쟁전·
실시간 위치를 저장하고, PostgreSQL은 API 영속 스키마를 관리한다.

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

## 문서

- [게임 콘셉트](docs/poke-lounge-game-concept.md)
- [게임 규칙](docs/poke-lounge-rules/index.md)
- [멀티플레이 테스트 시나리오](docs/poke-lounge-multiplayer-test-scenarios.md)
- [배포와 환경 변수](docs/deployment-and-env.md)
- [운영 런북](docs/operations-runbook.md)
- [릴리스 게이트](docs/poke-lounge-release-gate.md)
- [전체 문서 색인](docs/README.md)

## 현재 개발 우선순위

에셋 출처·권리 검증 자동화는 빠른 기능 구현을 위해 현재 제거했다. 필요해지는 시점에 별도 작업으로 다시 도입한다.
