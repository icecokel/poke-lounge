# Poke Lounge 5인 토너먼트 수정 계획

> 이 계획은 게임성 문제만 다룬다. 에셋 권리, 공개 배포 승인, 일반 사이트 기능, Poke Lounge 공개 랭킹 정책 변경은 범위 밖이다.

**목표:** 서로 다른 5개 브라우저 환경의 참가자가 같은 서버 방에 입장해 동일한 5인 대진과 부전승 상태를 보고, 각자 배정된 2인 매치를 진행하며, 1라운드 결과가 PostgreSQL과 Socket.IO를 통해 모든 참가자에게 동일하게 반영되도록 한다.

**아키텍처:** 서버 방의 PostgreSQL snapshot을 대진·부전승·현재 활성 매치의 단일 기준으로 사용한다. 한 배틀의 참가자 수는 계속 2명으로 유지하고, 5인 토너먼트는 여러 2인 매치를 순차 배정하는 방식으로 구성한다. Web은 서버 대진을 다시 계산하지 않고 snapshot을 검증해 표시한다. 캐주얼 결과는 명시적으로 unranked로 유지하고, 권위 매치는 기존 결정론적 배틀 엔진을 재사용하되 토너먼트 match에서는 공개 랭킹 이력을 만들지 않는다.

**기술 스택:** Next.js 15, React 19, Phaser 3.90, NestJS 11, TypeORM, PostgreSQL, Socket.IO, `@vscoke/poke-lounge-battle`, Jest, Supertest, Playwright 1.60, pnpm 9.12.0.

---

## 1. 확인된 문제

1. Web의 5인 single-elimination bracket은 부전승을 만들지만 API는 참가자를 단순히 두 명씩 묶는다.
2. API의 현재 반복문은 5번째 참가자를 매치와 부전승 모두에서 누락한다.
3. 서버 방 Web transport는 `TOURNAMENT_MATCH_RESULT`를 무시해 casual `/result` endpoint까지 결과가 도달하지 않는다.
4. 경쟁 match repository는 방당 match 한 개만 허용하고, 활성 참가자가 정확히 2명일 때만 assignment를 만든다.
5. 모바일 Playwright project는 `mobile-behavior.spec.ts`만 수집해 Poke Lounge 멀티플레이 테스트를 0건 수집한다.
6. WebKit 모바일 probe에서 `maxTouchPoints=0`이 관찰되어 coarse pointer 환경에서 터치 컨트롤이 숨을 수 있다.
7. 실제 API, PostgreSQL, Socket.IO와 5개 브라우저를 함께 사용하는 종단 테스트가 없다.
8. Firefox 재실행에서 `@/hooks/use-history` module resolution HTTP 500이 한 번 관찰됐지만 현재 파일은 존재하고 별도 Firefox 방 입장 검증은 통과했다.

## 2. 목표 동작

5인 토너먼트의 첫 bracket round는 다음과 같이 고정한다.

```txt
seed 1 -> bye
seed 4 vs seed 5 -> match 1
seed 3 -> bye
seed 2 -> bye
```

match 1이 완료되면 seed 1, match 1 승자, seed 3, seed 2가 다음 bracket round로 진출한다. 다음 round의 두 경기는 동시에 실행하지 않고 서버가 한 경기씩 순차 활성화한다. 순차 실행을 사용하면 현재의 단일 `competitive` projection과 복구 경로를 유지하면서 방 안에서 여러 match를 안전하게 진행할 수 있다.

각 클라이언트의 동작은 다음과 같다.

- 현재 활성 match 참가자: 배틀로 진입하고 자기 action만 제출한다.
- bye 참가자: 부전승과 다음 상대 대기 상태를 표시한다.
- 아직 배정되지 않은 참가자: 현재 경기와 대기 상태를 표시한다.
- spectator: 대진과 결과는 볼 수 있지만 ready/action/result를 제출하지 못한다.
- reconnect 참가자: REST snapshot 이후 Socket revision을 적용하고 같은 match/turn 상태로 복구한다.

## 3. 범위와 비범위

### 포함

- 2~6인 공통 bracket 및 bye 규칙
- 서버 canonical bracket snapshot
- 캐주얼 unranked 결과 제출 복구
- 방당 여러 2인 권위 match를 순차 생성하는 경로
- 5인 첫 bracket round와 전체 bracket 진행
- 모바일 Chromium/WebKit Poke Lounge 수집 및 터치 입력 검증
- Firefox module resolution 재현과 runner 안정화
- 실제 PostgreSQL/Socket.IO 기반 5-browser E2E

### 제외

- 한 배틀에 3명 이상이 동시에 참가하는 규칙
- 두 경기 이상을 동시에 실행하는 병렬 bracket
- Poke Lounge 공개 랭킹 점수 정책 변경
- lobby/matchmaking UI 재설계
- Poke Lounge 이외 게임과 사이트 기능 변경

## 4. 전역 제약

- Web 코드는 `apps/web`, API 코드는 `apps/api`, 공통 결정 규칙은 `packages/poke-lounge-battle`에서 관리한다.
- 서버 방의 bracket은 PostgreSQL snapshot이 단일 기준이다. Web은 참가자 배열로 bracket을 재생성하지 않는다.
- room mutation은 기존 `X-Idempotency-Key`와 `If-Match-Revision` 계약을 유지한다.
- Socket 이벤트는 transaction commit 이후의 snapshot만 발행한다.
- casual result와 tournament authority match는 공개 Poke Lounge 랭킹 row를 만들지 않는다.
- 기존 정확히 2명인 ranked head-to-head 경로와 100/50 verified 결과는 변경하지 않는다.
- 새 파일은 kebab-case를 사용한다.
- 현재 `main` worktree에 사용자 변경이 있으므로 구현은 별도 worktree에서 시작한다.

---

## 5. 계획 파일 맵

### 공통 규칙

- Create: `packages/poke-lounge-battle/src/tournament-bracket.ts`
- Create: `packages/poke-lounge-battle/src/tournament-bracket.spec.ts`
- Create: `packages/poke-lounge-battle/src/tournament-scoring.ts`
- Create: `packages/poke-lounge-battle/src/tournament-scoring.spec.ts`
- Modify: `packages/poke-lounge-battle/src/index.ts`
- Modify: `apps/web/src/components/poke-lounge/runtime/game/tournament/tournamentState.ts`
- Modify: `apps/web/src/components/poke-lounge/runtime/game/tournament/scoringPolicy.ts`
- Modify: `apps/web/package.json`
- Modify: `apps/web/next.config.ts`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `scripts/check-poke-lounge-battle-resolution.mjs`

### API bracket와 권위 match

- Modify: `apps/api/package.json`
- Modify: `apps/api/src/poke-lounge/poke-lounge-room.types.ts`
- Modify: `apps/api/src/poke-lounge/poke-lounge-room-policy.ts`
- Modify: `apps/api/src/poke-lounge/poke-lounge-room.service.ts`
- Modify: `apps/api/src/poke-lounge/poke-lounge-room.repository.ts`
- Modify: `apps/api/src/poke-lounge/postgres-poke-lounge-room.repository.ts`
- Modify: `apps/api/src/poke-lounge/poke-lounge-room-conflict.ts`
- Create: `apps/api/src/poke-lounge/poke-lounge-room-conflict.spec.ts`
- Modify: `apps/api/src/poke-lounge/dto/poke-lounge-room-response.dto.ts`
- Modify: `apps/api/src/poke-lounge/dto/submit-poke-lounge-match-result.dto.ts`
- Modify: `apps/api/src/poke-lounge/competitive/competitive-match.repository.ts`
- Modify: `apps/api/src/poke-lounge/competitive/competitive-match.service.ts`
- Modify: `apps/api/src/poke-lounge/competitive/postgres-competitive-match.repository.ts`
- Modify: `apps/api/src/poke-lounge/competitive/postgres-competitive-action.repository.ts`
- Modify: `apps/api/src/poke-lounge/entities/poke-lounge-competitive-match.entity.ts`
- Create: `apps/api/src/migrations/<timestamp>-support-poke-lounge-tournament-matches.ts`
- Modify: `apps/api/openapi.json`
- Modify: `apps/web/src/types/api.d.ts`
- Modify: focused API unit/integration/E2E specs under `apps/api/src/poke-lounge` and `apps/api/test`

### Web server room과 UI state

- Modify: `apps/web/src/components/poke-lounge/runtime/game/network/localPreviewRoom.ts`
- Modify: `apps/web/src/components/poke-lounge/runtime/game/network/serverRoom.ts`
- Modify: `apps/web/src/components/poke-lounge/runtime/game/network/tournamentRoomProtocol.ts`
- Modify: `apps/web/src/components/poke-lounge/runtime/game/network/tournamentAuthority.ts`
- Modify: `apps/web/src/components/poke-lounge/runtime/game/state/gameStateStore.ts`
- Modify: `apps/web/src/components/poke-lounge/runtime/game/scenes/WorldScene.ts`
- Modify: `apps/web/src/components/poke-lounge/runtime/game/scenes/world-scene-tournament.ts`
- Modify: `apps/web/src/components/poke-lounge/runtime/game/scenes/BattleScene.ts`
- Modify: `apps/web/tests/e2e/poke-lounge-multiplayer.spec.ts`

### 모바일과 통합 브라우저 테스트

- Modify: `apps/web/playwright.config.ts`
- Modify: `apps/web/src/components/poke-lounge/runtime/game/input/mobileTouchControls.ts`
- Modify: `apps/web/src/components/poke-lounge/poke-lounge-game.tsx`
- Create: `apps/web/tests/e2e/poke-lounge-mobile.spec.ts`
- Create: `apps/web/tests/e2e/poke-lounge-five-player-tournament.spec.ts`
- Create: `apps/api/scripts/start-poke-lounge-e2e-api.ts`
- Modify: `apps/web/scripts/playwright-integration-runner.mjs`
- Modify: `apps/web/scripts/playwright-runner.mjs`
- Modify: `apps/web/scripts/playwright-web-server.mjs`
- Modify: `.github/workflows/pull-request-check.yml`

### 문서

- Modify: `docs/vscoke-monorepo-concept.md`
- Modify: `docs/game-score-policy.md`

---

## Task 0. 격리 worktree와 재현 기준선

### 목적

현재 dirty `main`을 건드리지 않고 문제를 재현하며, Firefox HTTP 500을 실제 결함과 일시적 실행 오류로 구분한다.

- [ ] `main` 최신화 후 별도 worktree를 만든다.

```bash
git fetch origin
git merge --ff-only origin/main
git worktree add -b codex/fix/poke-lounge-five-player-tournament \
  worktrees/fix/poke-lounge-five-player-tournament main
git worktree list
```

- [ ] 작업 시작 전 다음 기준선을 기록한다.

```bash
pnpm test:poke-lounge-battle
pnpm --filter @vscoke/api test -- poke-lounge-room-policy.spec.ts poke-lounge-room.service.spec.ts --runInBand
(cd apps/web && node scripts/playwright-runner.mjs test \
  tests/e2e/poke-lounge-multiplayer.spec.ts --project=chromium)
```

- [ ] 5인 bracket red test를 먼저 추가한다.

Expected red assertion:

```ts
expect(firstRound.matches).toEqual([
  expect.objectContaining({ participantIds: ["player-4", "player-5"] }),
]);
expect(firstRound.byes.map(bye => bye.playerId)).toEqual(["player-1", "player-3", "player-2"]);
```

- [ ] Firefox 최소 방 입장 케이스를 고유 dist/tsconfig로 3회 연속 실행한다.

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

판정:

- 3회 모두 통과: HTTP 500은 일시적 이력으로 닫고 app import를 수정하지 않는다.
- 한 번이라도 실패: server stderr, 생성된 tsconfig의 `baseUrl/paths`, 실제 `src/hooks/use-history.ts` 존재 여부를 artifact로 남기고 runner 안정화 작업에 포함한다.

**Gate 0:** 5인 red test가 의도한 현재 실패를 보여주고, Firefox 오류가 재현/비재현으로 분류되어야 한다.

---

## Task 1. 공통 bracket과 점수 규칙 추출

### 목적

Web과 API가 서로 다른 5인 대진을 만들지 못하도록 순수 결정 규칙을 workspace package로 이동한다.

- [ ] `tournament-bracket.ts`에 2~6인 bracket 생성과 결과 전진 규칙을 구현한다.
- [ ] participant 정렬은 `joinedAtMs`, `playerId`로 서버에서 seed input을 확정한 뒤 공통 함수에 전달한다.
- [ ] match/bye ID에는 game round와 bracket round를 모두 포함한다.

```txt
game-round-1-bracket-1-match-1
game-round-1-bracket-1-bye-1
```

- [ ] 공통 state는 다음 최소 필드를 가진다.

```ts
type TournamentBracketState = {
  version: 1;
  status: "in-progress" | "completed";
  participants: TournamentParticipant[];
  currentRound: TournamentRound | null;
  completedRounds: TournamentRound[];
  championPlayerId: string | null;
};
```

- [ ] 2, 3, 4, 5, 6명 각각에 대해 match/bye/slot과 다음 round 진출을 table test로 검증한다.
- [ ] 5인 첫 round는 `4 vs 5 + bye 1/3/2`를 정확히 검증한다.
- [ ] casual tournament score는 최종 rank 기반 `100/70/45/30/15/5`를 공통 함수로 이동한다.
- [ ] 기존 verified 2인 경쟁 결과 `100/50`은 이 함수로 교체하지 않는다.
- [ ] Web의 `tournamentState.ts`, `scoringPolicy.ts`는 공통 규칙 re-export/adapter로 축소한다.
- [ ] Web에 `@vscoke/poke-lounge-battle: workspace:*`를 추가하고 Next workspace transpilation과 개발 watch를 보장한다.
- [ ] resolution checker가 API와 Web의 type/runtime resolution을 모두 확인하도록 확장한다.

검증:

```bash
pnpm test:poke-lounge-battle
pnpm check:poke-lounge-battle-resolution
pnpm type:check:web
```

**Gate 1:** Web과 API가 동일 함수로 5인 bracket을 만들고 별도 seed/match 계산 코드가 남지 않아야 한다.

---

## Task 2. API room snapshot을 canonical bracket으로 전환

### 목적

PostgreSQL room snapshot이 bracket, bye, active match와 완료 round의 단일 기준이 되도록 한다.

- [ ] `PokeLoungeRoomState.tournament`를 versioned bracket state로 확장한다.

```ts
tournament: {
  version: 2;
  bracket: TournamentBracketState | null;
  activeMatchId: string | null;
  cumulativeScores: Record<string, number>;
}
```

- [ ] 준비 시간이 끝날 때 active participant seed를 확정하고 공통 bracket을 생성한다.
- [ ] bye는 자동 진출시키되 match result나 점수를 위조 생성하지 않는다.
- [ ] 현재 round의 모든 match가 완료되면 공통 함수로 다음 round를 만든다.
- [ ] champion이 확정된 경우에만 room을 `completed`로 전환한다.
- [ ] `finalStandings`는 공통 rank score로 생성하고 누락 참가자가 없어야 한다.
- [ ] result reporter가 해당 match 참가자인지, session이 일치하는지, winner/loser가 정확히 그 match의 두 명인지 검증한다.
- [ ] same-key replay, changed-body idempotency conflict, stale revision conflict 계약을 유지한다.
- [ ] public DTO와 conflict snapshot에 bracket round, matches, byes, slots, champion을 노출한다.
- [ ] OpenAPI와 Web generated type을 갱신한다.

### 기존 JSONB room 호환

기존 `tournament.version`이 없는 room을 자동으로 새 진행 중 bracket으로 추정하지 않는다.

- waiting/round-started이고 완료 match가 없는 room: participant seed로 version 2를 생성할 수 있다.
- tournament/completed legacy room: 상태를 조용히 재해석하지 않고 `legacy-room-restart-required`로 닫아 10분 TTL을 적용한다.
- migration 또는 repository normalization test에서 기존 snapshot이 무한 active TTL로 남지 않음을 검증한다.

검증:

```bash
pnpm --filter @vscoke/api test -- \
  poke-lounge-room-policy.spec.ts \
  poke-lounge-room.service.spec.ts \
  poke-lounge-room-conflict.spec.ts \
  --runInBand
pnpm generate:types
pnpm check:api-contract
```

**Gate 2:** API 단위 테스트에서 5명이 모두 match 또는 bye에 포함되고, 전체 bracket 완료 전 room이 완료되지 않아야 한다.

---

## Task 3. 서버 방의 casual 결과 경로 복구

### 목적

권위 match가 준비되지 않은 casual/unranked 방도 실제 5인 게임 흐름을 완료할 수 있게 하되 verified 결과와 섞이지 않게 한다.

- [ ] `serverRoom.send("TOURNAMENT_MATCH_RESULT", payload)`를 `/poke-lounge/rooms/:roomCode/result` mutation으로 연결한다.
- [ ] body는 현재 snapshot의 match와 local identity로부터 만든다. 임의의 room/match/player ID를 신뢰하지 않는다.
- [ ] 동일 battle 결과의 network retry는 같은 UUID idempotency key를 재사용한다.
- [ ] 첫 committed 결과 이후 반대 결과가 도착하면 fresh snapshot을 적용하고 로컬 상태를 rollback/resync한다.
- [ ] server response와 Socket snapshot이 모두 같은 bracket revision을 적용하도록 한다.
- [ ] 이 경로는 언제나 casual/unranked이며 `game_history` verified row를 만들지 않는다.
- [ ] 기존 테스트 `server room은 client-asserted tournament result 이벤트를 무시한다`는 다음 계약으로 교체한다.

```txt
assigned casual match result -> POST /result 1회 -> committed snapshot 적용
unknown match/result -> 전송하지 않음 또는 API 400 후 fresh GET
verified authority match -> casual /result 사용 금지
```

검증:

```bash
(cd apps/web && node scripts/playwright-runner.mjs test \
  tests/e2e/poke-lounge-multiplayer.spec.ts \
  --project=chromium \
  --grep="casual tournament result|revision conflict|network retry")
```

**Gate 3:** mock server E2E에서 5인 bracket을 끝까지 전진시킬 수 있고 casual 결과가 verified score endpoint에 전달되지 않아야 한다.

---

## Task 4. 방 안의 여러 2인 권위 match를 순차 지원

### 목적

한 배틀의 2인 규칙을 유지하면서 5인 room에서 각 참가자가 자기 match action을 제출하도록 한다.

### 데이터 모델

- [ ] `poke_lounge_competitive_match`의 방당 1개 unique constraint를 제거한다.
- [ ] stable bracket match ID와 match kind를 추가한다.

```ts
bracketMatchId: string;
kind: "ranked-head-to-head" | "tournament-unranked";
```

- [ ] unique key는 `(room_id, bracket_match_id)`로 변경한다.
- [ ] 기존 ranked match row는 `ranked-head-to-head`로 backfill한다.
- [ ] tournament-unranked terminal은 canonical result로 bracket을 전진시키지만 `game_history`를 쓰지 않는다.
- [ ] ranked-head-to-head terminal의 기존 history publication transaction은 그대로 유지한다.

### assignment와 진행

- [ ] seat binding은 active participant가 2명보다 많아도 계정과 player를 durable하게 바인딩한다.
- [ ] bracket의 `activeMatchId` 두 참가자 모두 seat가 바인딩됐을 때만 tournament assignment를 만든다.
- [ ] 한 room에서 동시에 active authority match는 하나만 허용한다.
- [ ] 현재 match가 terminal이면 같은 transaction에서 bracket result와 room revision을 전진시키고 다음 match를 선택한다.
- [ ] 다음 match의 두 seat가 준비됐으면 commit 이후 assignment snapshot을 발행한다.
- [ ] 현재 match에 속하지 않은 참가자의 action은 403/409로 거부한다.
- [ ] reconnect는 현재 자기 match가 있으면 기존 submitted action/turn을 복구하고, bye/wait 참가자는 battle을 열지 않는다.
- [ ] leave는 현재 match 참가자일 때만 forfeit를 만들고 bye/wait 참가자는 bracket에서 제거하지 않고 명시적 정책으로 처리한다.

### migration 검증

- migration up: 기존 unique 제거, 새 열/constraint/index 추가, 기존 row backfill.
- migration down: tournament match가 한 방에 둘 이상 존재하면 데이터 손실 방지를 위해 실패.
- PostgreSQL integration: 같은 room의 서로 다른 bracket match 두 개는 허용하고 같은 bracket match 중복은 거부.

검증:

```bash
pnpm build:poke-lounge-battle
pnpm --filter @vscoke/api test -- \
  competitive-match.repository.spec.ts \
  competitive-match.service.spec.ts \
  postgres-competitive-match.repository.spec.ts \
  postgres-competitive-action.repository.spec.ts \
  --runInBand
TEST_DATABASE_URL=<isolated_test_db> pnpm --filter @vscoke/api migration:run:test
TEST_DATABASE_URL=<isolated_test_db> pnpm test:api:e2e
```

**Gate 4:** 5인 bracket의 여러 match가 한 room에서 순차 생성되고, tournament match 결과는 unranked이며, 기존 ranked 2인 history 원자성이 유지되어야 한다.

---

## Task 5. Web을 서버 bracket projection 기반으로 전환

### 목적

서버 방 클라이언트가 participant 목록으로 별도 bracket을 생성하지 않고 서버 snapshot만 표시·실행하도록 한다.

- [ ] server room state parser가 bracket 전체 shape와 크기 제한을 검증한다.
- [ ] `TOURNAMENT_STARTED`의 participant/match ID 요약 대신 revisioned `TOURNAMENT_STATE` projection을 추가한다.
- [ ] `gameStateStore.applyTournamentSnapshotFromRoom`이 bracket을 atomic하게 적용한다.
- [ ] server mode에서는 `createTournamentSession(participants)`를 호출하지 않는다.
- [ ] local preview/WebRTC mode는 기존 공통 bracket 함수로 로컬 tournament를 계속 실행할 수 있다.
- [ ] 현재 match에 자기 player ID가 포함된 클라이언트만 battle을 연다.
- [ ] bye/wait 참가자는 다음 상태를 구분해 표시한다.

```txt
부전승 — 다음 대진을 기다리는 중
현재 경기 진행 중 — 다음 대진을 기다리는 중
상대 연결 대기 중
```

- [ ] server authority match에서는 `COMPETITIVE_ACTION`만 사용하고 casual `/result`를 중복 제출하지 않는다.
- [ ] casual match에서는 returned battle result를 `/result`로 한 번만 제출한다.
- [ ] stale Socket/REST projection이 최신 bracket revision을 덮지 못하도록 회귀 테스트를 추가한다.

검증:

```bash
pnpm type:check:web
pnpm lint:web
(cd apps/web && node scripts/playwright-runner.mjs test \
  tests/e2e/poke-lounge-multiplayer.spec.ts --project=chromium)
```

**Gate 5:** 다섯 클라이언트가 동일한 bracket round, match, bye, champion을 표시하고 자기에게 배정되지 않은 battle을 열지 않아야 한다.

---

## Task 6. 모바일 수집과 터치 감지 수정

### 목적

Chromium/WebKit 모바일 project에서 Poke Lounge 게임·방 입장·전투 조작 테스트를 실제로 수집한다.

- [ ] `poke-lounge-mobile.spec.ts`를 만들고 모바일 project의 `testMatch`에 포함한다.
- [ ] 기존 `mobile-behavior.spec.ts` 전용 제한을 명시적 두-spec regex로 바꾼다.
- [ ] 각 모바일 project에서 `--list` 결과가 0이 아닌지 CI preflight로 검증한다.
- [ ] WebKit 모바일 project에서 `navigator.maxTouchPoints`, `(pointer: coarse)`, UA, platform을 characterization test로 기록한다.
- [ ] 실제 project에서도 `maxTouchPoints=0`과 coarse pointer가 재현될 때만 detection fallback을 변경한다.

권장 detection 계약:

```ts
type TouchGameDeviceEnvironment = {
  maxTouchPoints: number;
  coarsePointer: boolean;
  platform: string;
  userAgent: string;
};

isMobilePlatform && (maxTouchPoints > 0 || coarsePointer);
```

- [ ] 단순 coarse pointer만으로 데스크톱 touch UI를 켜지 않도록 mobile UA/platform 조건을 함께 유지한다.
- [ ] 방향, 결정, 뒤로, 가방, 도움말의 pointer down/up/cancel/leave를 실제 모바일 project에서 검증한다.
- [ ] 390×844와 430×932에서 canvas와 touch control이 겹치지 않는지 검증한다.

검증:

```bash
pnpm --filter @vscoke/web exec playwright test \
  tests/e2e/poke-lounge-mobile.spec.ts \
  --project=chromium-mobile-md
PLAYWRIGHT_ENABLE_CROSS_BROWSER=1 \
pnpm --filter @vscoke/web exec playwright test \
  tests/e2e/poke-lounge-mobile.spec.ts \
  --project=webkit-mobile-lg
```

**Gate 6:** 두 모바일 project가 Poke Lounge 테스트를 수집하고 touch control로 이동과 battle action을 입력해야 한다.

---

## Task 7. 실제 5-browser 통합 E2E 구축

### 목적

mock route가 아닌 실제 API, PostgreSQL, Socket.IO에서 5개 브라우저가 같은 room revision을 공유하는지 검증한다.

### 통합 runner

- [ ] `playwright-integration-runner.mjs`를 hobby 고정 실행기에서 spec 인자 기반 공용 실행기로 일반화한다.
- [ ] `TEST_DATABASE_URL`의 `_test` suffix와 regular DB 분리 검증을 유지한다.
- [ ] migration을 적용하고 Poke Lounge 관련 table을 격리 초기화한다.
- [ ] API와 Web을 한 번만 시작하고 모든 browser context가 같은 base URL/API URL을 사용한다.
- [ ] `start-poke-lounge-e2e-api.ts`는 TestingModule에서 auth guard를 override해 `e2e-user-1`부터 `e2e-user-5`까지 서로 다른 테스트 identity만 허용한다.
- [ ] 테스트 auth override는 `NODE_ENV=test` 전용 script에만 존재하고 production bootstrap에는 추가하지 않는다.

### 중앙 오케스트레이터

Playwright project 다섯 개를 별도로 실행하면 같은 test state를 공유할 수 없으므로, 한 spec이 다음 browser/context를 직접 연다.

1. Desktop Chromium 1440×900
2. Desktop Firefox 1366×768
3. Desktop WebKit 1440×900
4. Mobile Chromium 390×844, touch
5. Mobile WebKit 430×932, touch

- [ ] 각 context는 서로 다른 storage, player/session ID, bearer identity를 사용한다.
- [ ] host가 room을 만들고 네 참가자가 같은 code로 join한다.
- [ ] 다섯 참가자가 모두 participant이고 spectator가 아님을 확인한다.
- [ ] 모두 ready 후 같은 revision의 첫 bracket round를 받는다.
- [ ] seed 4/5만 첫 battle에 진입하고 seed 1/3/2는 bye 상태를 본다.
- [ ] 두 match 참가자가 각자 action을 제출하고 terminal 결과를 받는다.
- [ ] 나머지 세 context도 Socket으로 같은 winner와 다음 bracket round를 받는다.
- [ ] 모바일 두 context에서 touch control이 보이고 실제 입력이 Phaser state에 반영된다.
- [ ] Firefox context에서 module resolution HTTP 500이 발생하지 않는다.
- [ ] 한 context reconnect 후 같은 room revision, bracket round, match turn을 복구한다.

artifact:

```txt
output/playwright/poke-lounge-five-player/
├─ summary.md
├─ chromium-desktop.png
├─ firefox-desktop.png
├─ webkit-desktop.png
├─ chromium-mobile.png
├─ webkit-mobile.png
└─ trace.zip
```

검증:

```bash
TEST_DATABASE_URL=<isolated_test_db> \
pnpm --filter @vscoke/web e2e:integration -- \
  tests/e2e/poke-lounge-five-player-tournament.spec.ts
```

**Gate 7:** 실제 DB와 Socket을 사용하는 5-browser 첫 bracket round가 한 번의 retry 없이 통과하고 모든 context가 같은 revision을 확인해야 한다.

---

## Task 8. CI, 문서, 최종 회귀

- [ ] PR API job에 shared bracket, migration, tournament authority integration을 포함한다.
- [ ] PR Web job에 Chromium Poke Lounge focused test와 모바일 test collection을 포함한다.
- [ ] 실제 5-browser 통합 E2E는 PostgreSQL과 브라우저 세 엔진이 있는 전용 job 또는 로컬 release gate로 둔다.
- [ ] `docs/vscoke-monorepo-concept.md`의 Poke Lounge 흐름을 canonical bracket + sequential match queue로 갱신한다.
- [ ] `docs/game-score-policy.md`에 casual tournament가 공개 랭킹 근거가 아님을 유지하면서 authority battle과 구분한다.
- [ ] 이전 5인 테스터 보고서를 새 통합 E2E 결과로 교체한다.

최종 명령:

```bash
pnpm test:poke-lounge-battle
pnpm check:poke-lounge-battle-resolution
pnpm test:api -- --runInBand
TEST_DATABASE_URL=<isolated_test_db> pnpm --filter @vscoke/api migration:run:test
TEST_DATABASE_URL=<isolated_test_db> pnpm test:api:e2e
pnpm check:api-contract
pnpm type:check:web
pnpm lint
pnpm build
(cd apps/web && node scripts/playwright-runner.mjs test \
  tests/e2e/poke-lounge.spec.ts \
  tests/e2e/poke-lounge-multiplayer.spec.ts \
  --project=chromium)
PLAYWRIGHT_ENABLE_CROSS_BROWSER=1 \
pnpm --dir apps/web exec node scripts/playwright-runner.mjs test \
  tests/e2e/poke-lounge-mobile.spec.ts \
  --project=chromium-mobile-md \
  --project=webkit-mobile-lg
TEST_DATABASE_URL=<isolated_test_db> \
pnpm --filter @vscoke/web e2e:integration -- \
  tests/e2e/poke-lounge-five-player-tournament.spec.ts
git diff --check
```

---

## 6. 완료 기준

- [ ] 5명 모두 bracket의 match 또는 bye에 정확히 한 번 포함된다.
- [ ] 서버와 모든 Web client가 같은 bracket version/revision을 표시한다.
- [ ] 첫 bracket round의 seed 4/5만 battle을 열고 seed 1/3/2는 bye 상태를 본다.
- [ ] match terminal과 다음 bracket round 생성이 한 transaction에 반영된다.
- [ ] reconnect, duplicate command, stale revision에서 결과가 두 번 기록되지 않는다.
- [ ] tournament-unranked match가 public ranking history를 만들지 않는다.
- [ ] 기존 ranked 2인 match의 verified history 원자성이 유지된다.
- [ ] Chromium/Firefox/WebKit desktop과 Chromium/WebKit mobile이 같은 실제 room을 통과한다.
- [ ] 모바일 Poke Lounge spec 수집 수가 0보다 크다.
- [ ] WebKit mobile touch control이 실제 project에서 표시되고 입력된다.
- [ ] Firefox 최소 케이스가 3회 연속 통과한다.
- [ ] 전체 typecheck, lint, build, API contract, focused E2E가 통과한다.

## 7. 위험과 완화

| 위험                                     | 완화                                                                 |
| ---------------------------------------- | -------------------------------------------------------------------- |
| 서버/클라이언트 bracket 재분기           | 공통 package만 bracket을 생성하고 server mode Web은 snapshot만 소비  |
| bye 참가자의 낮은 match 수로 점수 불공정 | 승/패 누적이 아니라 최종 rank 기반 casual score 사용                 |
| casual 결과와 authority 결과 중복 제출   | match kind별 transport 분기와 API 거부 테스트                        |
| 방당 여러 match migration의 history 회귀 | ranked/unranked kind 분리와 기존 history integration test 유지       |
| 여러 match projection이 Socket에 섞임    | 한 room당 authority match를 한 개씩 순차 활성화                      |
| 테스트 전용 auth가 production에 노출     | TestingModule bootstrap script에서만 guard override                  |
| 모바일 emulation을 실기기로 오인         | Playwright gate와 실제 Safari/iOS 수동 확인을 별도 결과로 기록       |
| Firefox HTTP 500을 추측으로 수정         | 3회 재현 gate 후 runner 또는 app 수정 여부 결정                      |
| 기존 active JSONB room shape             | versioned normalization과 legacy room restart 정책을 명시적으로 적용 |

## 8. 권장 커밋 경계

```txt
test(poke-lounge):5인 토너먼트 회귀 추가
refactor(poke-lounge):공통 대진 규칙 통합
fix(poke-lounge):서버 대진과 부전승 동기화
fix(poke-lounge):캐주얼 결과 전송 복구
feat(poke-lounge):순차 권위 매치 지원
test(poke-lounge):모바일 멀티 검증 추가
test(poke-lounge):5개 브라우저 종단 검증
docs(poke-lounge):5인 토너먼트 검증 기록
```

로컬 `main` 반영은 모든 gate 통과 후 squash merge로 진행하고 최종 메시지는 다음을 권장한다.

```txt
fix(poke-lounge):5인 토너먼트 진행 수정
```
