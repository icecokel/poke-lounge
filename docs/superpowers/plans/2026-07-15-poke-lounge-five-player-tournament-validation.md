# Poke Lounge 5인 토너먼트 검증 계획

> 대상 수정 계획: `docs/superpowers/plans/2026-07-15-poke-lounge-five-player-tournament-fix.md`
>
> 이 검증은 게임 진행과 멀티플레이 일관성만 다룬다. 에셋 권리, 공개 배포 승인, 일반 사이트 기능과 공개 랭킹 정책 변경은 범위 밖이다.

## 1. 검증 목표

서로 다른 5개 브라우저 환경의 참가자가 실제 API, PostgreSQL, Socket.IO를 사용하는 같은 서버 방에서 다음 흐름을 동일하게 경험하는지 증명한다.

```txt
5명 입장
-> 5명 ready
-> 첫 bracket round 확정
-> seed 1/3/2 bye
-> seed 4 vs seed 5 battle
-> terminal 결과 commit
-> 5개 환경에 같은 다음 round 반영
```

검증 결과는 다음 네 가지 질문에 답해야 한다.

1. 5명이 누락 없이 match 또는 bye에 정확히 한 번 포함되는가?
2. 서버, DB와 5개 클라이언트가 같은 revision과 bracket을 유지하는가?
3. 현재 match 참가자만 battle/action/result를 수행하고 나머지는 명확한 대기 상태를 보는가?
4. 데스크톱과 모바일에서 조작, 결과 이해와 토너먼트 흐름이 게임으로서 문제없이 이어지는가?

## 2. 검증 원칙

- PostgreSQL room snapshot을 대진과 진행 상태의 기준값으로 삼는다.
- Web 화면만 보지 않고 REST 응답, Socket revision과 DB row를 같은 checkpoint에서 비교한다.
- 첫 정상 실행은 Playwright retry 없이 통과해야 한다. 실패를 retry로 숨기지 않는다.
- 5개 환경은 하나의 Playwright test가 중앙에서 연다. project를 다섯 번 따로 실행하면 같은 room과 test state를 안정적으로 공유할 수 없다.
- 각 테스터는 독립 보고서를 쓰지만 join/ready/action 순서는 중앙 오케스트레이터가 통제한다.
- Playwright 모바일은 모바일 브라우저 emulation 검증이다. 실제 iOS Safari 결과로 표현하지 않는다.
- 공개 `bracketMatchId`와 DB/action의 UUID v4 `matchId`를 구분해 기록한다.
- idempotency 재시도는 같은 UUID뿐 아니라 최초 body와 `nowMs`도 그대로 재사용한다.

## 3. 시작 조건

### 현재 기준선

현재 `main` 상태는 이 계획의 최종 gate를 통과할 수 없다.

- `apps/web/playwright.config.ts`의 모바일 `testMatch`가 `mobile-behavior.spec.ts`만 수집해 Poke Lounge 모바일 테스트가 0건이다.
- 기존 `poke-lounge-multiplayer.spec.ts`는 room REST와 Socket.IO를 fixture로 대체한다.
- 현재 integration runner는 hobby spec 전용이며 Poke Lounge migration과 5인 auth bootstrap이 없다.
- 개발 auth bypass는 요청을 하나의 사용자로 매핑하므로 5개 경쟁 좌석 증명에 사용할 수 없다.
- 실제 Mobile WebKit probe에서는 `maxTouchPoints=0`, coarse pointer `true`가 관찰되어 현재 touch 판정으로는 컨트롤이 숨을 수 있다.

따라서 이 문서는 현 상태의 합격 보고서가 아니라 수정 완료 후 실행할 인수·회귀 검증 절차다.

### Entry gate

아래 조건이 충족되기 전에는 5-browser 결과를 제품 실패로 판정하지 않고 환경 차단으로 기록한다.

- [ ] 수정 계획 Task 1~7이 구현되어 있다.
- [ ] `@vscoke/poke-lounge-battle`의 공통 bracket 규칙을 API와 Web이 사용한다.
- [ ] API room DTO/OpenAPI/Web generated type이 갱신되어 있다.
- [ ] 다중 tournament match migration이 격리 DB에 적용된다.
- [ ] 테스트 전용 API bootstrap이 5개의 서로 다른 account identity를 제공한다.
- [ ] 통합 runner가 Poke Lounge spec 인자를 전달할 수 있다.
- [ ] Poke Lounge 모바일 spec이 Chromium/WebKit mobile project에서 1건 이상 수집된다.
- [ ] Chromium, Firefox, WebKit browser binary가 설치되어 있다.
- [ ] 전체 migration이 필요로 하는 PostgreSQL extension을 테스트 DB에 설치할 수 있다.

### 필수 환경

```bash
corepack enable
corepack prepare pnpm@9.12.0 --activate
pnpm install --frozen-lockfile
pnpm --filter @vscoke/web e2e:install
pnpm --filter @vscoke/web exec playwright --version
```

PostgreSQL은 운영/개발 DB와 다른 전용 DB를 사용한다.

```bash
export TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/vscoke_poke_lounge_test
pnpm --filter @vscoke/api migration:run:test
```

`TEST_DATABASE_URL`은 다음 조건을 모두 만족해야 한다.

- database 이름이 `_test`로 끝난다.
- query parameter가 없다.
- 일반 `DB_DATABASE`와 같은 database를 가리키지 않는다.
- 매 실행 전에 Poke Lounge 관련 table을 격리 초기화할 수 있다.

통합 runner는 migration, API와 Web 환경을 분리한다.

- migration: `TEST_DATABASE_URL`만 주입하고 `DB_DATABASE`를 제거한다.
- API: 테스트 URL을 `DB_*`로 분해하고 `NODE_ENV=test`, `DB_SYNCHRONIZE=false`를 사용한다.
- Web: `NEXT_PUBLIC_API_URL`을 테스트 API로 지정하되 API 전용 DB 환경 변수를 전달하지 않는다.
- 인증: TestingModule에서 auth guard만 override하고 다섯 token을 서로 다른 test user로 매핑한다.
- Web의 `/api/auth/session` 경계만 context별 identity fixture를 허용한다. room/action REST와 Socket.IO는 mock하지 않는다.

## 4. 5인 환경과 역할

첫 battle을 모바일 환경에서 직접 검증하기 위해 seed 4와 seed 5를 모바일에 배정한다. seed는 고정된 join 순서로 만든다.

| 테스터   | 환경             | viewport/input     | seed와 첫 역할         | 중점 관찰                                     |
| -------- | ---------------- | ------------------ | ---------------------- | --------------------------------------------- |
| Tester 1 | Desktop Chromium | 1440×900, keyboard | seed 1, host, bye      | 방 생성, 참가자 수, 부전승과 전체 상태        |
| Tester 2 | Desktop Firefox  | 1366×768, keyboard | seed 2, bye            | 대기 중 reconnect와 module resolution         |
| Tester 3 | Desktop WebKit   | 1440×900, keyboard | seed 3, bye            | Socket 동기화와 대기 UI                       |
| Tester 4 | Mobile Chromium  | 390×844, touch     | seed 4, match player A | 터치 이동, battle action, 결과 대기           |
| Tester 5 | Mobile WebKit    | 430×932, touch     | seed 5, match player B | `maxTouchPoints/coarsePointer`, battle action |

각 context는 다음 값을 공유하지 않는다.

- browser storage와 cookie
- account identity와 bearer token
- `playerId`와 `sessionId`
- action command UUID

room code, API/Web base URL과 test clock만 공유한다.

## 5. 검증 단계와 gate

### Gate 0. 수집과 환경 preflight

목적은 테스트 0건, 누락 browser, 잘못된 DB 연결을 제품 결함과 구분하는 것이다.

| ID        | 검증                | 합격 기준                                                    |
| --------- | ------------------- | ------------------------------------------------------------ |
| `ENV-001` | browser binary 확인 | Chromium/Firefox/WebKit launch가 모두 성공                   |
| `ENV-002` | desktop spec 수집   | 3개 desktop 환경에서 대상 spec 수집 수가 각각 1 이상         |
| `ENV-003` | mobile spec 수집    | Chromium/WebKit mobile에서 Poke Lounge 수집 수가 각각 1 이상 |
| `ENV-004` | API/Web health      | Web route와 API `/health`가 120초 안에 200                   |
| `ENV-005` | DB 안전성           | `_test` DB만 연결되고 migration 적용 완료                    |
| `ENV-006` | identity 분리       | 5개 context가 서로 다른 account/player/session으로 인식됨    |

권장 명령:

```bash
(cd apps/web && pnpm exec playwright test \
  tests/e2e/poke-lounge-mobile.spec.ts \
  --project=chromium-mobile-md --list)

(cd apps/web && PLAYWRIGHT_ENABLE_CROSS_BROWSER=1 \
  pnpm exec playwright test \
  tests/e2e/poke-lounge-mobile.spec.ts \
  --project=webkit-mobile-lg --list)

(cd apps/web && PLAYWRIGHT_ENABLE_CROSS_BROWSER=1 \
  pnpm exec playwright test \
  tests/e2e/poke-lounge-five-player-tournament.spec.ts \
  --project=poke-lounge-five-browser-integration --list)
```

모바일 두 project는 각각 1건 이상, 전용 integration project는 정확히 1건을 수집해야 한다. 여러 project를 한 명령으로 묶은 총합으로 판정하지 않는다. `ENV-003`이 0건이면 테스트 실패가 아니라 runner/config 차단으로 중단한다.

### Gate 1. 공통 bracket 순수 규칙

| ID        | 절차                     | 합격 기준                                                   |
| --------- | ------------------------ | ----------------------------------------------------------- |
| `BRK-001` | 2~6명 bracket table test | 모든 참가자가 각 round의 match 또는 bye에 정확히 한 번 포함 |
| `BRK-002` | 5명 첫 round 생성        | `seed 4 vs 5`, bye 순서 `seed 1, 3, 2`                      |
| `BRK-003` | 첫 결과 적용             | seed 4/5 승자만 다음 round 해당 slot으로 진출               |
| `BRK-004` | 전체 bracket 완료        | champion과 5명 최종 순위가 중복·누락 없이 생성              |
| `BRK-005` | 동일 input 반복          | match/bye/slot ID와 결과가 결정적으로 동일                  |
| `BRK-006` | Web/API resolution       | 두 앱이 같은 workspace package type/runtime을 해석          |

검증 명령:

```bash
pnpm test:poke-lounge-battle
pnpm check:poke-lounge-battle-resolution
```

### Gate 2. API room과 결과 계약

| ID        | 절차                                    | 관찰값                    | 합격 기준                                                      |
| --------- | --------------------------------------- | ------------------------- | -------------------------------------------------------------- |
| `API-001` | 5명 join/ready 후 round 시작            | room JSONB, public DTO    | 첫 round match/bye에 5명 전원 포함                             |
| `API-002` | 올바른 casual `/result` 제출            | HTTP, revision, winner    | 현재 match 참가자와 session만 commit 가능                      |
| `API-003` | spectator/wait/bye/다른 session 제출    | HTTP, DB, Socket          | 400/403/409, mutation과 publish 없음                           |
| `API-004` | authority match에 casual `/result` 제출 | HTTP, DB                  | 거부되고 authority action만 허용                               |
| `API-005` | same key + exact body/`nowMs` replay    | command receipt, revision | 최초 snapshot 재사용, revision 추가 증가 없음                  |
| `API-006` | same key + changed winner/`nowMs`       | conflict snapshot         | idempotency conflict, 최신 redacted snapshot 반환              |
| `API-007` | 서로 다른 key로 반대 결과 동시 제출     | winner, revision          | 한 건만 commit되고 다른 요청은 revision conflict               |
| `API-008` | stale revision mutation                 | conflict snapshot         | 자동 재실행 없이 최신 snapshot으로 복구                        |
| `API-009` | legacy JSONB room 조회                  | version, status, TTL      | waiting만 결정적 변환, 진행 room은 restart-required와 10분 TTL |
| `API-010` | DTO/OpenAPI/type 생성                   | generated diff            | runtime shape와 계약이 일치하고 추가 diff 없음                 |

검증 명령:

```bash
pnpm --filter @vscoke/api test -- \
  poke-lounge-room-policy.spec.ts \
  poke-lounge-room.service.spec.ts \
  poke-lounge-room-conflict.spec.ts \
  --runInBand
pnpm generate:types
pnpm check:api-contract
```

### Gate 3. PostgreSQL migration과 권위 match 원자성

#### Migration

| ID       | 절차                                         | 합격 기준                                           |
| -------- | -------------------------------------------- | --------------------------------------------------- |
| `DB-001` | 빈 DB에 전체 migration up                    | 모든 schema/constraint/index 생성 성공              |
| `DB-002` | 기존 ranked row가 있는 DB upgrade            | UUID match/action FK 보존, kind가 ranked로 backfill |
| `DB-003` | 같은 room에 다른 `bracketMatchId` 두 건 삽입 | 두 row 모두 허용                                    |
| `DB-004` | 같은 `(roomId, bracketMatchId)` 중복 삽입    | PostgreSQL unique violation `23505`                 |
| `DB-005` | 다중 tournament row가 있는 상태에서 down     | 부분 변경 없이 명시적으로 중단                      |

#### 순차 authority match

| ID         | 절차                                   | 관찰값                              | 합격 기준                                            |
| ---------- | -------------------------------------- | ----------------------------------- | ---------------------------------------------------- |
| `AUTH-001` | 5개 account seat bind                  | seat rows                           | 5개 identity가 durable하게 분리                      |
| `AUTH-002` | 첫 active match assignment 조회        | room `activeMatchId`, match rows    | seed 4/5에게만 assignment, 동시에 하나만 active      |
| `AUTH-003` | 첫 match terminal 후 다음 조회         | bracket와 match rows                | terminal과 bracket 전진이 한 transaction으로 반영    |
| `AUTH-004` | 완료 match가 여러 개인 projection 조회 | public competitive projection       | 과거 `getOne()`이 아니라 `activeMatchId` 대상만 노출 |
| `AUTH-005` | terminal 처리 중 fault injection       | room/match/action/history           | 모든 write가 rollback되고 Socket publish 없음        |
| `AUTH-006` | tournament terminal 정상 처리          | `game_history`, publication         | tournament-unranked history 0건                      |
| `AUTH-007` | 기존 2인 ranked terminal               | verified history                    | 승자 100/패자 50이 각각 정확히 1건 유지              |
| `AUTH-008` | API/DataSource 재시작                  | room, assignment, submitted actions | 같은 active match/turn으로 복구                      |

검증 명령:

```bash
TEST_DATABASE_URL="$TEST_DATABASE_URL" \
pnpm --filter @vscoke/api migration:run:test

TEST_DATABASE_URL="$TEST_DATABASE_URL" \
pnpm --filter @vscoke/api test:e2e -- \
  poke-lounge-room.repository.integration-spec.ts \
  poke-lounge-competitive.repository.integration-spec.ts \
  poke-lounge-room.e2e-spec.ts
```

### Gate 4. Socket.IO commit과 복구

실제 Nest HTTP server와 5개 Socket.IO client를 사용한다.

| ID        | 절차                                           | 합격 기준                                             |
| --------- | ---------------------------------------------- | ----------------------------------------------------- |
| `SOC-001` | 5개 client가 같은 room subscribe               | 모두 같은 최초 public revision 수신                   |
| `SOC-002` | casual result 또는 authority terminal commit   | commit 이후에만 새 snapshot 관찰                      |
| `SOC-003` | replay/conflict/rollback 수행                  | 그 요청만으로 새 revision snapshot을 적용하지 않음    |
| `SOC-004` | 한 client disconnect 후 `afterRevision` 재구독 | REST와 Socket이 같은 최신 bracket 복구                |
| `SOC-005` | stale REST가 newer Socket 뒤에 도착            | 클라이언트 revision이 역행하지 않음                   |
| `SOC-006` | public payload redaction                       | session/account/server seed/command/history ID 미노출 |

동일 revision transport가 중복 수신될 수 있는 현재 계약을 유지한다면, 합격 기준은 “발행 횟수 정확히 1회”가 아니라 “클라이언트 적용 1회, revision 비역행, payload 동일”로 둔다. 정확히 1회 발행이 필요하면 먼저 이벤트 계약을 변경한다.

### Gate 5. Web projection과 모바일 입력

| ID        | 절차                            | 합격 기준                                               |
| --------- | ------------------------------- | ------------------------------------------------------- |
| `WEB-001` | server snapshot 적용            | Web이 participant 목록으로 bracket을 다시 계산하지 않음 |
| `WEB-002` | seed 4/5 projection             | 해당 두 client만 battle을 열음                          |
| `WEB-003` | seed 1/3/2 projection           | bye와 현재 경기 대기 상태가 구분되어 표시               |
| `WEB-004` | malformed/oversized bracket     | battle을 열지 않고 REST recovery                        |
| `WEB-005` | casual result network retry     | 같은 key와 body로 한 번만 commit                        |
| `WEB-006` | authority terminal              | casual `/result`나 generic score API 중복 호출 없음     |
| `MOB-001` | Chromium mobile touch controls  | 방향·결정·뒤로·battle action 입력 성공                  |
| `MOB-002` | WebKit mobile environment probe | `maxTouchPoints`, coarse pointer, UA/platform 기록      |
| `MOB-003` | WebKit mobile touch controls    | `maxTouchPoints=0`이어도 계약에 맞으면 입력 UI 표시     |
| `MOB-004` | 390×844, 430×932 layout         | canvas와 touch controls가 겹치거나 잘리지 않음          |

검증 명령:

```bash
pnpm type:check:web
pnpm lint:web

(cd apps/web && node scripts/playwright-runner.mjs test \
  tests/e2e/poke-lounge-multiplayer.spec.ts \
  --project=chromium)

(cd apps/web && PLAYWRIGHT_ENABLE_CROSS_BROWSER=1 \
  node scripts/playwright-runner.mjs test \
  tests/e2e/poke-lounge-mobile.spec.ts \
  --project=chromium-mobile-md \
  --project=webkit-mobile-lg)
```

### Gate 6. 실제 5-browser 첫 bracket round

#### 정상 시나리오

1. Tester 1이 server room을 만든다.
2. Tester 2~5가 동일 code로 지정된 순서에 따라 join한다.
3. 5명 모두 participant이며 spectator가 아닌지 확인한다.
4. 5명 모두 ready한다.
5. 모든 context가 같은 first round와 revision을 받을 때까지 기다린다.
6. seed 1/3/2는 bye, seed 4/5는 battle 진입을 확인한다.
7. seed 4/5가 각 turn action을 제출해 terminal까지 진행한다.
8. 다섯 context와 DB에서 같은 winner, completed match와 다음 round를 확인한다.

#### Checkpoint

| Checkpoint      | 필수 기록                                             | 합격 기준                              |
| --------------- | ----------------------------------------------------- | -------------------------------------- |
| `C0_JOINED`     | participant IDs, seed order, revision                 | 5명 고유, spectator 0                  |
| `C1_STARTED`    | bracket version, round, match/bye, active match       | `4 vs 5 + bye 1/3/2`, 5개 context 동일 |
| `C2_ACTION_1`   | UUID matchId, bracketMatchId, turn, submitted players | ID 종류가 구분되고 허용 actor만 제출   |
| `C3_TERMINAL`   | winner/loser, completed match, DB revision            | terminal과 bracket 전진이 원자적       |
| `C4_NEXT_ROUND` | round, slots, active match, five snapshot hashes      | DB/REST/Socket/5개 context 동일        |

추가 합격 기준:

- room/action REST와 Socket 요청에 `page.route()` mock이 없다.
- 예상하지 않은 HTTP 5xx와 browser page error가 0건이다.
- 정상 경로에서 Playwright retry와 mutation retry가 0건이다.
- seed 1/3/2는 첫 battle을 열지 않는다.
- tournament-unranked `game_history` row가 0건이다.
- 첫 terminal 이후 active authority match가 동시에 하나만 존재한다.
- 다섯 context의 최종 `revision`, `currentRound`, `activeMatchId`, champion/slots projection이 동일하다.
- committed ready/result는 10초 안에 다섯 context에서 같은 revision으로 수렴한다.

실행 명령:

```bash
PLAYWRIGHT_WORKERS=1 \
PLAYWRIGHT_ENABLE_CROSS_BROWSER=1 \
TEST_DATABASE_URL="$TEST_DATABASE_URL" \
pnpm --filter @vscoke/web e2e:integration -- \
  tests/e2e/poke-lounge-five-player-tournament.spec.ts
```

release 판정 전에는 새 room과 초기화된 DB로 이 시나리오를 3회 연속 통과시킨다.

### Gate 7. 장애 주입

정상 시나리오와 섞지 않고 별도 실행한다.

| ID          | 담당 환경                | 주입 시점                        | 합격 기준                                       |
| ----------- | ------------------------ | -------------------------------- | ----------------------------------------------- |
| `FAULT-001` | Firefox/Tester 2         | bye 대기 중 reload               | 같은 seed/bye/revision 복구, HTTP 500 없음      |
| `FAULT-002` | Mobile Chromium/Tester 4 | action 제출 후 Socket disconnect | 중복 action 없이 submitted/wait 복구            |
| `FAULT-003` | Mobile WebKit/Tester 5   | stale REST 지연                  | newer Socket bracket을 덮지 않음                |
| `FAULT-004` | seed 4/5                 | 같은 result 동시 재전송          | terminal과 다음 match가 한 번만 생성            |
| `FAULT-005` | API publisher            | DB commit 후 publish 실패        | DB commit 보존, REST/reconnect로 복구           |
| `FAULT-006` | active match             | terminal action과 leave 경쟁     | deadlock·중복 winner 없이 명시 정책 하나만 적용 |

Firefox 최소 방 입장 검증은 고유 dist/tsconfig로 3회 실행한다.

- 각 run은 새로운 Web process를 cold start한다.
- 첫 navigation부터 모든 response status를 기록하고 한 번이라도 500이면 실패한다.
- `gotoWithRetry` 같은 navigation retry로 최초 500을 숨기지 않는다.
- `pageerror`, console과 Web stderr에 `Module not found`가 없어야 한다.

```bash
for run in 1 2 3; do
  PLAYWRIGHT_ENABLE_CROSS_BROWSER=1 \
  NEXT_DIST_DIR=".next-e2e-firefox-$run" \
  NEXT_TYPESCRIPT_CONFIG_PATH=".next-e2e-firefox-$run.json" \
  pnpm --dir apps/web exec node scripts/playwright-runner.mjs test \
    tests/e2e/poke-lounge-multiplayer.spec.ts \
    --project=firefox \
    --grep="server room create는 URL을 room code로 갱신"
done
```

## 6. 5인 수동 게임성 검증

자동 검증이 Gate 6까지 통과한 build에서만 진행한다. 자동 검증과 같은 seed/환경 배정을 사용하지만, action 선택과 체감 평가는 각 테스터가 직접 수행한다.

### 공통 확인 항목

- 내 seed와 첫 상대/bye를 설명 없이 이해할 수 있는가?
- bye, 현재 경기 진행 중, 상대 연결 대기 상태가 서로 구분되는가?
- 내 차례와 상대 대기 상태를 즉시 이해할 수 있는가?
- 키보드 또는 터치 입력이 중복·누락 없이 반응하는가?
- battle 종료 후 결과와 다음 대진 전환이 자연스러운가?
- 대기 중 화면이 멈춘 것으로 오해되지 않는가?
- reconnect 이후 중복 battle이나 과거 결과가 표시되지 않는가?

### 환경별 임무

| 테스터   | 필수 임무                                                             |
| -------- | --------------------------------------------------------------------- |
| Tester 1 | 방 생성, 5명 확인, ready, bye 안내, 다음 round 전체 대진 확인         |
| Tester 2 | Firefox 대기 UI 확인, 대기 중 reload, 동일 상태 복구 확인             |
| Tester 3 | WebKit에서 다른 match 진행과 결과가 실시간 반영되는지 확인            |
| Tester 4 | Mobile Chromium에서 터치로 seed 4 action 수행, 대기/결과 확인         |
| Tester 5 | Mobile WebKit에서 터치 UI 노출과 seed 5 action 수행, 오입력 여부 확인 |

### 주관 평가 기준

각 항목을 1~5점으로 기록한다.

1. 대진과 내 역할의 명확성
2. bye/대기 상태의 명확성
3. 이동과 battle 입력 반응성
4. turn 전환과 결과 피드백
5. 1라운드 전체 흐름의 재미와 답답함 정도

게임성 정성 gate는 다음과 같다.

- 역할·대기·입력 명확성에서 2점 이하가 없어야 한다.
- 같은 혼란이 2명 이상에게 반복되면 기능이 통과해도 UX 결함으로 등록한다.
- 5명 중 4명 이상이 “다음에 무엇을 해야 하는지 별도 설명 없이 알 수 있었다”고 답해야 한다.
- bye 참가자 3명 중 2명 이상이 대기 명확성에 2점 이하를 주면 `기능 PASS / 게임성 FAIL`로 분리한다.

## 7. 테스터별 결과 문서

각 테스터는 다음 파일을 작성한다.

```txt
output/playwright/poke-lounge-five-player/
└─ <run-id>/
   ├─ validation-summary.md
   ├─ environment.json
   ├─ matrix.json
   ├─ tester-01-chromium-desktop.md
   ├─ tester-02-firefox-desktop.md
   ├─ tester-03-webkit-desktop.md
   ├─ tester-04-chromium-mobile.md
   ├─ tester-05-webkit-mobile.md
   ├─ db-assertions.json
   ├─ socket-revisions.json
   ├─ network-errors.json
   ├─ screenshots/
   ├─ videos/
   └─ traces/
```

`environment.json`에는 build commit, Node/pnpm/Playwright 버전, browser revision과 viewport를 기록한다.

테스터 문서 template:

```md
# Tester 0N 검증 결과

- 환경:
- viewport/input:
- seed/역할:
- build commit:
- room code:
- 시작/종료 시각:
- 결과: PASS | FAIL | BLOCKED

## Checkpoint

| checkpoint    | revision | round | active match | 화면 상태 | 판정 |
| ------------- | -------: | ----- | ------------ | --------- | ---- |
| C0_JOINED     |          |       |              |           |      |
| C1_STARTED    |          |       |              |           |      |
| C3_TERMINAL   |          |       |              |           |      |
| C4_NEXT_ROUND |          |       |              |           |      |

## 게임성 평가

| 항목               | 점수(1~5) | 근거 |
| ------------------ | --------: | ---- |
| 대진과 역할 명확성 |           |      |
| bye/대기 명확성    |           |      |
| 입력 반응성        |           |      |
| turn/결과 피드백   |           |      |
| 전체 재미/답답함   |           |      |

## 문제

- 재현 절차:
- 기대 결과:
- 실제 결과:
- 최초 발생 시각:
- screenshot/trace/network evidence:
- 심각도: S0 | S1 | S2 | S3

## 최종 의견

- 다음 행동을 설명 없이 알 수 있었는가: 예 | 아니오
- 다시 테스트가 필요한가:
```

보고서에는 bearer token, `sessionId`, account ID와 원본 server seed를 기록하지 않는다.

## 8. 심각도와 중단 조건

| 등급 | 정의                              | 예시                                                 |
| ---- | --------------------------------- | ---------------------------------------------------- |
| `S0` | 상태 무결성·권한·데이터 격리 위반 | 누락 참가자, 위조 action 허용, unranked history 생성 |
| `S1` | 핵심 진행 불가                    | round 미완료, battle 진입 실패, 5개 client 영구 분기 |
| `S2` | 진행은 가능하나 주요 오동작       | 잘못된 bye 표시, reconnect 후 일시적 중복 UI         |
| `S3` | 경미한 게임성·표현 문제           | 안내 문구 지연, 작은 layout 불편                     |

다음 상황에서는 해당 run을 즉시 중단하고 artifact를 보존한다.

- 5번째 참가자가 match/bye 모두에서 누락된다.
- 두 client의 bracket winner 또는 slot이 달라진다.
- wait/bye/spectator가 action을 제출할 수 있다.
- tournament-unranked가 공개 ranking history를 만든다.
- 동일 결과가 두 번 commit되거나 revision이 역행한다.
- 예상하지 않은 HTTP 500, browser crash 또는 DB migration 부분 적용이 발생한다.

브라우저 binary 누락, test 0건 수집, test DB 미기동은 `BLOCKED-INFRA`로 기록하며 제품 PASS/FAIL 통계에 넣지 않는다.

## 9. 최종 합격 기준

수정 완료 판정에는 아래 조건을 모두 요구한다.

- [ ] Gate 0~6의 P0 항목이 모두 통과한다.
- [ ] 5-browser 정상 시나리오가 retry 없이 3회 연속 통과한다.
- [ ] Firefox 최소 케이스가 고유 dist로 3회 연속 통과한다.
- [ ] 두 모바일 project가 Poke Lounge spec을 1건 이상 수집하고 실제 touch action을 수행한다.
- [ ] DB, REST, Socket과 5개 context의 최종 bracket/revision이 동일하다.
- [ ] tournament-unranked history가 0건이고 기존 ranked 2인 100/50 history가 유지된다.
- [ ] S0, S1 미해결 결함이 0건이다.
- [ ] 5개 테스터 보고서와 중앙 summary가 모두 작성되어 있다.
- [ ] 게임성 정성 gate를 통과한다.
- [ ] 전체 typecheck, lint, build, API contract와 관련 회귀 테스트가 통과한다.

최종 회귀 명령:

```bash
pnpm test:poke-lounge-battle
pnpm check:poke-lounge-battle-resolution
pnpm test:api -- --runInBand
TEST_DATABASE_URL="$TEST_DATABASE_URL" pnpm --filter @vscoke/api migration:run:test
TEST_DATABASE_URL="$TEST_DATABASE_URL" pnpm test:api:e2e
pnpm check:api-contract
pnpm type:check:web
pnpm lint
pnpm build
PLAYWRIGHT_WORKERS=1 \
PLAYWRIGHT_ENABLE_CROSS_BROWSER=1 \
TEST_DATABASE_URL="$TEST_DATABASE_URL" \
pnpm --filter @vscoke/web e2e:integration -- \
  tests/e2e/poke-lounge-five-player-tournament.spec.ts
git diff --check
```

## 10. 재검증 규칙

- S0/S1 수정 후에는 해당 test만 통과시킨 뒤 Gate 1~6 전체를 다시 실행한다.
- bracket 규칙 변경은 2~6명 table test와 5-browser 전체를 다시 실행한다.
- migration 변경은 fresh/upgrade/down 세 경로를 모두 다시 실행한다.
- Socket/revision 변경은 정상, disconnect, stale REST와 exact replay를 모두 다시 실행한다.
- 모바일 감지 변경은 Chromium/WebKit mobile `--list`와 실제 touch action을 다시 검증한다.
- flaky 후보는 retry 결과를 채택하지 않고 새 DB/room으로 3회 독립 실행해 분류한다.
