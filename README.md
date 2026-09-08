# Poke Lounge

Poke Lounge는 같은 마을에서 포켓몬을 탐색·포획·육성하고 3라운드 챔피언십을 진행하는 브라우저형 비공식 Pokémon 팬 게임이다.

문서 기준: `main`의 `617a60c` · 2026-09-08 KST. 아래는 현재 구현을 설명하며, 모든 조합이나 실기기 환경의 검증 완료를 뜻하지 않는다.

## 현재 구현

| 항목      | 현재 동작                                                                              |
| --------- | -------------------------------------------------------------------------------------- |
| 입장      | 로그인 없는 비공개 방 생성·초대. 공개방 선택은 현재 UI에서 비활성화                    |
| 참가자    | 사람·AI 합계 최대 8명. 시작 시 현재 인원이 4명 미만이면 4명, 그 외에는 8명까지 AI 충원 |
| 진행      | 탐험·육성 → 토너먼트를 총 3라운드 진행                                                 |
| 탐험 시간 | 90초·3분·5분 중 선택, 기본 90초                                                        |
| 필드      | 야생전·포획·성장·상점·인벤토리·PC 박스·회복·주사위                                     |
| 전투      | ROM 수치 데이터 + `@pkmn/sim` 4세대 실행기. ROM 자체를 실행하는 에뮬레이터는 아님      |
| 입력      | 데스크톱 키보드·모바일 터치, 플레이 화면 4:3, 모바일 논리 카메라 384×288               |
| 저장      | 브라우저 `localStorage`, 기존 `sessionStorage`는 일회 이전, 방 실행 UUID별 진행 격리   |

### 라운드 시작 규칙

첫 방장 시작은 바로 탐험 시간을 시작하지 않는다.

```text
대기실 준비 → 방장 시작 → 스타터/파티 준비 → 필드 렌더링·중앙 집결
→ 사람·AI 전원 준비 → 3 → 2 → 1 → 탐험 시작
```

이 경로에서는 `startRoom()` 직후 시작·종료 시각이 `null`이고, 전원 준비 후 서버가 3초 미래의 공통 시작 시각을 설정한다. 선택·로딩·카운트다운 시간은 탐험 시간에서 차감하지 않는다.

정상 **2·3라운드 전환은 다르다.** 앞 토너먼트가 끝나고 연결 참가자가 2명 이상이면 서버가 다음 탐험 시간을 즉시 시작한다. 스타터 재선택·전원 준비·3초 카운트다운을 반복하지 않는다. 2명 미만이면 대기실로 돌아간다.

## 구조

| 경로                                  | 역할                                         |
| ------------------------------------- | -------------------------------------------- |
| `apps/web/src/components/poke-lounge` | React 화면, 입력, 연출, 기존 런타임 연결부   |
| `apps/web/src/features/poke-lounge`   | 분리한 도메인·응용·표시 모델·어댑터          |
| `apps/api`                            | REST/Socket.IO, 방·서버 권위 경기·AI/턴 워커 |
| `packages/poke-lounge-battle`         | Web/API가 공유하는 전투·대진·라운드 규칙     |

Redis는 방·경기·실시간 상태와 작업 큐를, PostgreSQL은 ROM 문서와 영속 스키마를 담당한다.

## 로컬 실행

Node.js 22와 pnpm 9.12.0을 기준으로 한다. PostgreSQL과 Redis를 먼저 준비하고, 기존 환경 파일은 덮어쓰지 않는다.

```bash
pnpm install --frozen-lockfile
cp -n apps/web/.env.example apps/web/.env.local
cp -n apps/api/.env.example apps/api/.env
```

복사한 API `.env`의 `DB_*`·`REDIS_URL`을 실제 로컬 서비스에 맞추고, `CORS_ORIGINS`에 웹 origin을 지정한다. 웹 `.env.local`의 `NEXT_PUBLIC_API_URL`도 일치시킨다. 템플릿의 DB 비밀번호를 그대로 사용하지 않는다. 일반 플레이에는 `LOCAL_TEST_AUTH_TOKEN`이 필요 없다.

최초 개발 DB 또는 스키마/ROM 데이터 변경 후:

```bash
pnpm build:api
pnpm --filter @poke-lounge/api migration:run
pnpm --filter @poke-lounge/api rom-data:import
pnpm dev
```

`pnpm dev`에는 AI/턴 워커가 포함되지 않는다. API가 준비된 뒤 별도 터미널에서 실행한다.

```bash
pnpm --filter @poke-lounge/api start:turn-worker
```

워커는 빌드된 `dist`를 실행하므로 API/워커 변경 후에는 다시 빌드하고 재시작한다. 호스트 워커가 다른 API 포트를 사용하면 `AI_RUNTIME_API_URL` 또는 `PORT`를 맞춘다.

기본 Web은 `http://localhost:3000`, API는 `http://localhost:3001`이다. Docker 전체 실행과 배포·DB 변경 주의사항은 [API 배포 가이드](apps/api/DEPLOY.md)를 따른다.

## 검증

기본 정적·단위·빌드 검사는 다음과 같다.

```bash
pnpm lint
pnpm test
pnpm build
pnpm type:check:web
pnpm check:api-contract
```

실제 API E2E는 제품 환경과 분리된 PostgreSQL `_test` DB와 루프백 Redis DB 15(`/15`)를 사용한다. **해당 Redis DB는 테스트가 비우므로 반드시 폐기 가능한 전용 인스턴스를 사용한다.** PostgreSQL 테스트 URL은 일반 `DATABASE_URL`·`DB_URL`과 달라야 하며 DB 이름도 `DB_DATABASE`와 같으면 안 된다. 테스트 DB에는 마이그레이션을 먼저 적용한다.

```bash
export TEST_DATABASE_URL='postgresql://USER:PASSWORD@127.0.0.1:5432/poke_lounge_test'
export REDIS_URL='redis://127.0.0.1:6379/15'
pnpm build:poke-lounge-battle
pnpm --filter @poke-lounge/api migration:run:test
pnpm test:api:e2e
```

Playwright·실제 DB 통합·에이전트 직접 플레이는 별도 검증이다. CI 성공을 이들 검사의 성공으로 해석하지 않는다. 직접 플레이 지침은 [에이전트 브라우저 테스트](.agents/skills/poke-lounge-agent-browser-test/SKILL.md)를 사용한다.

## 문서

Git에서 추적하는 기준 문서는 다음 네 개다.

- 이 README: 제품 개요·현재 흐름·로컬 실행
- [API 배포 가이드](apps/api/DEPLOY.md): Compose·CI 배포·DB 변경·복구 경계
- [기능 경계](apps/web/src/features/poke-lounge/README.md): UI와 비즈니스 로직의 책임 분리
- [에이전트 브라우저 테스트](.agents/skills/poke-lounge-agent-browser-test/SKILL.md): 직접 플레이 절차·안전한 관찰

`docs/`는 기존 정책대로 Git에서 제외된 내부 문서다. 내부 문서는 `docs/README.md`에서 현재 기준과 과거 기록을 구분한다.
