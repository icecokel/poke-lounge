# Poke Lounge Three Phase Roadmap

> Historical roadmap. The phase descriptions and completion logs below preserve their dates and are not current architecture claims. The 2026-07-10 hardening supersedes the memory-only room, REST polling, generic Poke Lounge ranking and client-result authority conclusions. See [Poke Lounge Game Concept](../../poke-lounge-game-concept.md) for current state.

이 문서는 `feature/poke-lounge` 브랜치에서 Poke Lounge를 VSCoke에 완전히 붙이기 위한 남은 작업을 3단계로 나눈다.

기준 문서:

- 원본 Poke Lounge: `/Users/smlee/Documents/poke-lounge/docs/implementation-guide.md`
- 원본 Poke Lounge: `/Users/smlee/Documents/poke-lounge/docs/game-concept.md`
- 원본 Poke Lounge: `/Users/smlee/Documents/poke-lounge/docs/testing-guide.md`
- VSCoke 포트 계획: `docs/superpowers/plans/2026-07-06-poke-lounge-port.md`

현재 브랜치 상태:

- 프론트 smoke 이식 완료
- `/[locale]/game/poke-lounge` route 존재
- Game Center, search, explorer, sitemap, locale 메시지 연결 완료
- 최소 정적 자산만 포함
- 백엔드 game API, ranking, server-authoritative multiplayer는 미구현

## Phase 1: 프론트 이식 완성

**목표:** 백엔드 의존 없이 Poke Lounge가 VSCoke 안에서 단독 플레이와 로컬 개발용 멀티 흐름까지 안정적으로 동작하게 만든다.

**선행 조건:** 현재 브랜치의 프론트 smoke 이식 상태에서 시작한다.

**작업 범위:**

- `world` scene 직접 진입 smoke 추가
- 스타터 선택 후 `solo` 시작이 world canvas로 진입하는지 검증
- `scene=battle&e2eBattle=wild-victory`가 battle 결과 상태까지 도달하는지 검증
- `scene=battle&e2eBattle=wild-defeat`가 battle 결과 상태까지 도달하는지 검증
- `wildEncounterRate=1`로 필드 이동 후 야생 전투 전환 검증
- battle command menu에서 `싸운다` 선택 후 move select 전환 검증
- `network=local&room=<code>` local room 생성, 참가, 나가기 smoke 추가
- `roundMs=1000`로 라운드 타이머가 tournament phase로 넘어가는지 검증
- canvas desktop/mobile framing과 fullscreen fallback 확인
- Poke Lounge runtime을 VSCoke 전용 wrapper 밖에서 import하지 않는지 점검
- 로컬 게임 원본/raw 파일과 전체 source `public` payload가 유입되지 않았는지 반복 확인
- Poke Lounge 현재 상태를 VSCoke docs에 반영할지 결정

**명시적 제외:**

- `apps/api` 변경
- ranking/score submit 연결
- 서버 room state
- WebSocket gateway
- WebRTC 운영화
- 전체 원본 데이터 진단 화면 이식

**완료 기준:**

- 사용자가 `/ko-KR/game/poke-lounge`에서 스타터 선택, 솔로 시작, 필드 이동, 야생 전투, battle 결과 흐름을 확인할 수 있다.
- local room은 운영용이 아니라 개발/preview 용도로만 동작 범위를 명확히 한다.
- source Poke Lounge 문서의 P0 E2E 항목 중 VSCoke 1차 이식 범위가 통과한다.

**검증 명령:**

```bash
pnpm type:check:web
pnpm lint:web
pnpm knip
pnpm build:web
pnpm --filter @vscoke/web e2e -- tests/e2e/poke-lounge.spec.ts --project=chromium
pnpm --filter @vscoke/web e2e -- tests/e2e/hobby-games.spec.ts --project=chromium
pnpm --filter @vscoke/web e2e -- tests/e2e/i18n-integrity.spec.ts --project=chromium
```

**권장 커밋 예시:**

```text
test(poke-lounge):월드와 배틀 스모크 보강
fix(poke-lounge):모바일 캔버스 프레이밍 수정
docs(poke-lounge):프론트 이식 상태 정리
```

## Phase 2: API 구현

**목표:** Poke Lounge 결과를 VSCoke API의 게임 결과/랭킹 체계에 등록하고, 프론트에서 결과 제출과 조회를 할 수 있게 만든다.

**선행 조건:** Phase 1 완료. 게임 결과로 삼을 점수와 play time 정의가 확정되어야 한다.

**작업 범위:**

- Poke Lounge 최종 점수 산식 정의
- `GameType`에 `POKE_LOUNGE` 추가
- PostgreSQL enum migration 추가
- `GAME_SCORE_POLICIES`에 Poke Lounge 정책 추가
- `CreateGameHistoryDto`의 Swagger min/max 설명이 게임별 정책과 모순되지 않게 수정
- `GameService` ranking/best score 로직이 `POKE_LOUNGE`에서도 통과하는지 테스트 추가
- `GameController` 테스트에 Poke Lounge result/ranking 케이스 추가
- API 문서 E2E에 `POKE_LOUNGE` enum 반영
- OpenAPI 타입 재생성
- `apps/web/src/types/api.d.ts` 갱신
- `apps/web/src/services/score-service.ts`에 `"poke-lounge" -> "POKE_LOUNGE"` 매핑 추가
- Poke Lounge result submit UI를 붙일지, final result 화면만 붙일지 결정
- share page에서 `POKE_LOUNGE` title과 play link 처리

**명시적 제외:**

- 실시간 방 관리
- server-authoritative tournament
- ready state
- reconnect/host election

**완료 기준:**

- 로그인 사용자가 Poke Lounge 결과를 API에 제출할 수 있다.
- `/game/ranking?gameType=POKE_LOUNGE`가 Poke Lounge 랭킹을 반환한다.
- 공유 결과 조회가 `POKE_LOUNGE`를 깨지 않고 렌더링한다.
- Swagger와 web generated type이 실제 API와 일치한다.

**검증 명령:**

```bash
pnpm test:api
pnpm build:api
pnpm generate:types
pnpm type:check:web
pnpm lint
pnpm build
```

필요 시:

```bash
pnpm test:api:e2e
pnpm --filter @vscoke/web e2e -- tests/e2e/poke-lounge.spec.ts --project=chromium
```

**권장 커밋 예시:**

```text
feat(api):포케 라운지 게임 타입 추가
feat(poke-lounge):결과 제출 API 연동
test(api):포케 라운지 랭킹 검증 추가
```

## Phase 3: 백엔드 관리 멀티플레이

**목표:** 현재 client-host/local preview 중심 멀티를 서버가 방, 참가자, 라운드, 토너먼트 결과를 관리하는 구조로 전환한다.

**선행 조건:** Phase 1과 Phase 2 완료. 방/참가자 identity 정책과 실시간 전송 방식이 확정되어야 한다.

**핵심 결정 사항:**

- 실시간 전송 방식: WebSocket gateway를 기본 후보로 둔다.
- room 식별자, `sessionId`, 로그인 `userId`, 게임 내 `playerId` 역할을 분리한다.
- 서버가 authoritative source가 될 상태와 클라이언트 local-only 상태를 구분한다.
- 서버 저장 대상과 메모리-only 대상의 경계를 정한다.

**작업 범위:**

- API 의존성 검토: Nest WebSocket gateway와 adapter 도입 여부 결정
- room 생성, 참가, 나가기, 종료 모델 설계
- participant ready 상태 설계
- party snapshot submit/update 설계
- 서버 기준 round timer 설계
- tournament bracket 생성과 match assignment를 서버에서 수행
- battle result payload 검증
- round score와 cumulative score를 서버에서 확정
- final standings를 서버에서 확정
- host client 권위 제거 또는 최소화
- host 이탈/재선출 정책 정의
- 연결 끊김, 포기, 시간 초과 결과 처리
- spectator 입력 차단
- reconnect 정책 정의
- 프론트 network adapter를 `BroadcastChannel`/수동 WebRTC에서 서버 room gateway로 전환
- local preview room은 개발 fallback으로 유지할지 제거할지 결정

**데이터 모델 후보:**

- `poke_lounge_room`
- `poke_lounge_room_participant`
- `poke_lounge_room_event`
- `poke_lounge_party_snapshot`
- `poke_lounge_round`
- `poke_lounge_tournament_match`

초기에는 모든 이벤트를 영구 저장하지 않고, 운영/복구에 필요한 최소 상태만 DB에 둘 수 있다. 이 결정은 reconnect 요구사항과 운영 비용에 맞춰 Phase 3 초반에 확정한다.

**서버 이벤트 후보:**

- `room.created`
- `room.joined`
- `room.left`
- `participant.readyChanged`
- `partySnapshot.updated`
- `round.started`
- `round.timerSynced`
- `tournament.started`
- `match.assigned`
- `match.resultSubmitted`
- `match.resultAccepted`
- `round.completed`
- `game.completed`
- `room.closed`

**완료 기준:**

- 2명 이상이 같은 서버 room에 참가해 동일한 round/tournament 상태를 본다.
- 참가자 ready가 모두 충족되기 전에는 서버가 라운드를 시작하지 않는다.
- 서버가 라운드 타이머와 토너먼트 대진을 확정한다.
- 클라이언트가 임의 result payload를 보내도 서버 검증에서 거부할 수 있다.
- 연결 끊김, 나가기, 시간 초과가 일관된 결과로 처리된다.
- 최종 결과는 Phase 2의 API 결과/랭킹 체계와 연결된다.

**검증 명령:**

```bash
pnpm test:api
pnpm test:api:e2e
pnpm build:api
pnpm type:check:web
pnpm build:web
```

추가 E2E는 별도 spec으로 둔다:

```bash
pnpm --filter @vscoke/web e2e -- tests/e2e/poke-lounge-multiplayer.spec.ts --project=chromium
```

**권장 커밋 예시:**

```text
feat(poke-lounge):서버 방 모델 추가
feat(poke-lounge):멀티플레이 게이트웨이 추가
feat(poke-lounge):서버 토너먼트 진행 연동
test(poke-lounge):서버 멀티플레이 스모크 추가
```

## Phase Gate

Phase는 순서대로 진행한다.

1. Phase 1이 끝나야 Phase 2를 시작한다.
2. Phase 2에서 점수/결과 API가 안정되어야 Phase 3의 최종 결과 저장을 붙인다.
3. Phase 3 전에는 client-host local preview를 운영 멀티로 취급하지 않는다.

각 phase 종료 시점에는 다음을 반드시 남긴다.

- 통과한 검증 명령
- 남은 known gap
- 다음 phase에서 이어받을 결정 사항

## Phase Completion Log

### Phase 1 완료: 2026-07-06

완료 커밋:

- `458e3c3 test(poke-lounge):프론트 이식 흐름 검증`

통과한 검증 명령:

- `pnpm type:check:web`
- `pnpm lint:web`
- `pnpm knip`
- `pnpm build:web`
- `pnpm --filter @vscoke/web e2e -- tests/e2e/poke-lounge.spec.ts --project=chromium`
- `pnpm --filter @vscoke/web e2e -- tests/e2e/hobby-games.spec.ts --project=chromium`
- `pnpm --filter @vscoke/web e2e -- tests/e2e/i18n-integrity.spec.ts --project=chromium`
- `git diff --check`
- `git ls-files | rg '(^|/)(node_modules|\.next|output|test-results|data/raw|data/processed|assets/raw|assets/processed)(/|$)' || true`
- `git ls-files | rg '\.(nds|gba|gbc|gb|cia|3ds|zip|7z)$' || true`

남은 known gap:

- `network=local` room은 개발 preview 용도다. 운영 멀티플레이나 서버 권위 모델로 취급하지 않는다.
- E2E probe는 로컬 개발과 E2E 검증을 위한 훅이며, Phase 3의 서버 검증을 대체하지 않는다.
- Poke Lounge 결과 제출, 랭킹, 공유 결과 연동은 아직 없다.

Phase 2 인계 결정 사항:

- `POKE_LOUNGE`를 VSCoke 게임 결과 API의 정식 `GameType`으로 추가한다.
- 점수는 Poke Lounge 최종 결과 화면의 누적 점수를 기준으로 API에 제출한다.
- `playTime`은 클라이언트에서 측정 가능한 전체 플레이 시간을 초 단위로 제출하되, API 정책의 최소/최대 범위를 게임별 정책과 맞춘다.
- Phase 2에서는 server-authoritative room, ready state, reconnect, tournament authority를 구현하지 않는다.

### 2026-07-07 Source Document Compliance

source docs read:

- `/Users/smlee/Documents/poke-lounge/docs/implementation-guide.md`
- `/Users/smlee/Documents/poke-lounge/docs/game-concept.md`
- `/Users/smlee/Documents/poke-lounge/docs/testing-guide.md`
- `docs/superpowers/plans/2026-07-06-poke-lounge-port.md`
- `.superpowers/sdd/task-1-brief.md`

commands passed:

- `pnpm --filter @vscoke/web e2e -- tests/e2e/poke-lounge.spec.ts --project=chromium`
- `pnpm type:check:web`
- `pnpm lint:web`
- `git diff --check`

remaining gaps moved into later phases:

- Phase 2: JSON 기반 데이터 마이그레이션, backend DTO/API 계약 정비, `POKE_LOUNGE` 결과 제출 및 랭킹 연결
- Phase 3: 서버 권한 멀티플레이, room state/round authority, reconnect와 host election hardening

### Phase 2 완료: 2026-07-06

통과한 검증 명령:

- `pnpm test:api`
- `pnpm test:api:e2e`
- `pnpm build:api`
- `pnpm type:check:web`
- `pnpm lint`
- `pnpm build`
- `pnpm --filter @vscoke/web e2e -- tests/e2e/poke-lounge.spec.ts --project=chromium`
- `python3 /Users/smlee/.codex/skills/api-no-mock-fallback/scripts/find_mock_fallback.py apps/web/src/services/score-service.ts`
- `git diff --check`
- `git ls-files | rg '(^|/)(node_modules|\.next|output|test-results|data/raw|data/processed|assets/raw|assets/processed)(/|$)' || true`
- `git ls-files | rg '\.(nds|gba|gbc|gb|cia|3ds|zip|7z)$' || true`

남은 known gap:

- `apps/web/src/types/api.d.ts`는 로컬 API 변경을 수동 반영했다. 기존 `pnpm generate:types`는 원격 `https://api.icecoke.kr/api-json` 기준이라 배포 전에는 `POKE_LOUNGE`를 누락할 수 있다.
- Poke Lounge 결과 제출은 최종 `game-result`에서 명시 버튼으로 동작한다. 자동 제출이나 상세 랭킹 패널은 아직 붙이지 않았다.
- 멀티플레이 방, 라운드, 토너먼트 권위는 여전히 클라이언트/local preview 중심이며 운영 멀티로 취급하지 않는다.

Phase 3 인계 결정 사항:

- 서버 관리 멀티플레이는 Phase 2의 `POKE_LOUNGE` 결과 API를 최종 저장 경로로 사용한다.
- 서버는 room, participant, ready, round timer, tournament bracket, result acceptance를 authoritative source로 관리한다.
- 클라이언트가 보내는 final score는 서버 확정 standings와 연결해야 하며, 임의 payload를 신뢰하지 않는다.
- 기존 `network=local` preview는 개발 fallback으로만 유지할지 Phase 3 초반에 결정한다.

### Phase 3 구현 기록: 2026-07-06

이 기록은 Phase 3 서버 권위 MVP 완료 상태를 남긴다. 2026-07-06 기준 리뷰어 최종 판정은 `APPROVED`이며, 아래 최종 검증 명령을 실제로 통과했다.

구현 결정:

- REST polling server-authoritative MVP로 완료했다. WebSocket은 향후 전송 최적화로 남긴다.
- 새 WebSocket dependency는 추가하지 않았다.
- 서버 room state는 API 프로세스 메모리에서 관리한다.
- `network=local`은 개발 preview로만 유지하고, 서버 관리 멀티는 `network=server&room=<code>`로 진입한다.
- `round-started` 이후 신규 participant join은 거절한다. 기존 participant reconnect만 `waiting`/`round-started`에서 허용한다.
- `waiting` 중 participant leave는 participant slot을 해제한다. replacement participant가 들어와 ready gate를 다시 통과할 수 있다.
- 참가자 leave/disconnect는 tournament 중 pending match가 있으면 서버가 forfeit 결과로 확정한다. 1:1 room에서 `round-started` 중 한 참가자가 나가도 남은 참가자의 forfeit 승리로 final standings를 확정한다. 남은 connected participant가 없으면 room은 `closed`로 전환한다.
- 서버 final standings의 score를 Poke Lounge final result submit의 우선 score로 사용할 수 있게 web adapter가 `TOURNAMENT_COMPLETED`에 서버 확정 standings를 전달한다.

통과한 focused 검증 명령:

- `pnpm --filter @vscoke/api test -- poke-lounge/poke-lounge-room.service.spec.ts --runInBand`
- `pnpm --filter @vscoke/api test:e2e -- poke-lounge-room.e2e-spec.ts --runInBand`
- `pnpm --filter @vscoke/web e2e -- tests/e2e/poke-lounge-multiplayer.spec.ts --project=chromium`
- `pnpm type:check:web`
- `pnpm lint`
- `python3 /Users/smlee/.codex/skills/api-no-mock-fallback/scripts/find_mock_fallback.py apps/web/src/components/poke-lounge/runtime/game/network`
- `git diff --check`

통과한 최종 검증 명령:

- `pnpm test:api`
- `pnpm test:api:e2e`
- `pnpm build:api`
- `pnpm lint`
- `pnpm type:check:web`
- `pnpm build:web`
- `pnpm --filter @vscoke/web e2e -- tests/e2e/poke-lounge.spec.ts --project=chromium`
- `pnpm --filter @vscoke/web e2e -- tests/e2e/poke-lounge-multiplayer.spec.ts --project=chromium`
- `python3 /Users/smlee/.codex/skills/api-no-mock-fallback/scripts/find_mock_fallback.py apps/web/src/components/poke-lounge/runtime/game/network`
- `git diff --check`
- `git ls-files | rg '(^|/)(node_modules|\.next|output|test-results|data/raw|data/processed|assets/raw|assets/processed)(/|$)' || true`
- `git ls-files | rg '\.(nds|gba|gbc|gb|cia|3ds|zip|7z)$' || true`

남은 known gap:

- room state는 메모리-only라 API 프로세스 재시작, horizontal scaling, reconnect 복구에는 아직 대응하지 않는다.
- server room 생성/입장 UI는 최소 MVP 범위로 직접 query 진입을 지원한다. 운영형 lobby UX는 별도 작업이다.
- polling은 상태 동기화 MVP다. WebSocket은 필요성이 확인되면 전송 최적화 단계에서 도입한다.

### Final Acceptance 기록: 2026-07-07

이 기록은 Task 4 최종 acceptance, 스크린샷 캡처, 문서 마감을 남긴다. 2026-07-07 기준 현재 구현은 브리프의 최종 acceptance 기준을 통과했고, 아래 명령과 아티팩트로 확인했다.

실행한 검증 명령:

- `pnpm test:api`
- `pnpm test:api:e2e`
- `pnpm build:api`
- `pnpm type:check:web`
- `pnpm lint`
- `pnpm build:web`
- `pnpm --filter @vscoke/web e2e -- tests/e2e/poke-lounge.spec.ts --project=chromium`
- `pnpm --filter @vscoke/web e2e -- tests/e2e/poke-lounge-multiplayer.spec.ts --project=chromium`
- `python3 /Users/smlee/.codex/skills/api-no-mock-fallback/scripts/find_mock_fallback.py apps/web/src/components/poke-lounge/runtime/game/network`
- `git diff --check`
- `git ls-files | rg '(^|/)(node_modules|\.next|output|test-results|data/raw|data/processed|assets/raw|assets/processed)(/|$)' || true`
- `git ls-files | rg '\.(nds|gba|gbc|gb|cia|3ds|zip|7z)$' || true`

금지 자산 체크 결과:

- 두 `git ls-files | rg ... || true` 명령은 모두 출력이 없었다.

스크린샷 아티팩트:

- `/Users/smlee/vscoke/worktrees/feat/poke-lounge/apps/web/test-results/poke-lounge-final-acceptance/starter-selection.png`
- `/Users/smlee/vscoke/worktrees/feat/poke-lounge/apps/web/test-results/poke-lounge-final-acceptance/world-scene-desktop.png`
- `/Users/smlee/vscoke/worktrees/feat/poke-lounge/apps/web/test-results/poke-lounge-final-acceptance/battle-scene-wild-opponent.png`
- `/Users/smlee/vscoke/worktrees/feat/poke-lounge/apps/web/test-results/poke-lounge-final-acceptance/final-result-submit-overlay.png`
- `/Users/smlee/vscoke/worktrees/feat/poke-lounge/apps/web/test-results/poke-lounge-final-acceptance/server-room-final-result.png`
- `/Users/smlee/vscoke/worktrees/feat/poke-lounge/apps/web/test-results/poke-lounge-final-acceptance/mobile-canvas-framing.png`

최종 acceptance 상태:

- source document compliance check인 wild encounter rate 선택과 battle Pokemon sprite dimension 검증은 `tests/e2e/poke-lounge.spec.ts`에서 계속 통과한다.
- tunable gameplay data는 JSON 우선 로딩과 TypeScript fallback 검증이 유지되고, 다음 마이그레이션 대상이라는 문서 상태도 그대로다.
- `/ko-KR/game/poke-lounge`에서 starter selection, solo world, wild battle, final result submit, server room 진입을 focused E2E와 수동 스크린샷으로 다시 확인했다.
- `network=server` room state는 현재도 `apps/api`가 관리하고 client-host authority로 되돌아가지 않았다.
- server room API DTO/Swagger 노출과 frontend server-room adapter 무 mock fallback 상태는 이번 최종 검증 범위에서도 유지됐다.

남은 known gap:

- server room state는 여전히 API 프로세스 메모리-only다.
- REST polling 기반 server-authoritative MVP는 유지되고, WebSocket은 이번 작업에서도 범위 밖이다.
- server room 생성/입장 UX는 query 기반 MVP 수준이며 운영형 lobby UX는 별도 작업이다.
- `pnpm generate:types`는 여전히 원격 `https://api.icecoke.kr/api-json` 기준이라 로컬 미배포 API 차이를 자동 반영하지 않는다.
- Phase 3의 REST polling server-authoritative 구현은 기술적 MVP다. `pnpm check:poke-lounge-provenance`가 승인된 manifest로 통과하기 전에는 Poke Lounge route와 public asset의 권리가 승인된 것으로 취급하지 않는다. 현재 오디오 9개 행은 승인됐고 나머지 57개 행은 `blocked`다. 기본 Vercel 빌드는 이 상태를 경고로 취급하며 strict 환경에서만 차단한다.

### Hardening 완료: 2026-07-11

2026-07-10 계획의 Tasks 1-7 구현과 Task 8 문서 감사를 거쳐 다음 항목이 현재 기준이 됐다.

- 로그인 GET hydration과 versioned local fallback이 game runtime/autosave보다 먼저 실행된다.
- PostgreSQL이 room snapshot, revision, TTL, command receipt의 source of truth다.
- Socket.IO `/poke-lounge`가 committed snapshot을 전송하고 REST GET은 initial/outage/conflict recovery를 담당한다.
- `WorldScene`은 HUD, interactions, tournament, encounters collaborator를 조합한다.
- 정확히 두 개의 서로 다른 인증 seat가 각자 자기 action만 제출하며, 공유 `@vscoke/poke-lounge-battle` 엔진을 API가 전진시킨다.
- terminal 승자 100점/패자 50점, durable action receipt, verified history와 publication mapping은 한 transaction에서 기록된다.
- 일반 `/game/result`, casual room `/result`, anonymous/extra/multi tournament/solo는 client-asserted unranked다. 공개 Poke Lounge ranking은 `verified-room`만 사용한다.
- strict adopt-or-create legacy baseline, `_test` DB safety와 PostgreSQL CI migration/integration evidence가 추가됐다. 운영 migration은 backup/ledger 확인 뒤 수동 적용한다.

[Poke Lounge Release Gate](../../poke-lounge-release-gate.md)의 권리 상태는 `UNRESOLVED`이며 기본 배포 성공과 무관하게 owner/legal review가 필요하다.
