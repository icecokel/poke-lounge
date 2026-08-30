# Poke Lounge 게임 서버 안정화 작업 계획

확인 기준일: 2026-08-28

상태: 구현 및 로컬 검증 완료 · 운영 2회 인수 대기

운영 3인 한 사이클 `prod-cycle-20260827-203105`에서는 Redis의 서버 권위 상태가 3라운드와
최종 순위까지 전진했지만, 연결된 브라우저의 room revision과 경쟁 turn이 장시간 갱신되지 않아
수동 reload가 반복적으로 필요했다. 이 문서는 해당 실패를 기준선으로 삼아 Redis, BullMQ,
Socket.IO와 Web 복구 경로를 안정화하는 범위와 검증 기준을 정의한다.

제품 규칙은 [Poke Lounge 게임 규칙 인덱스](./poke-lounge-rules/index.md), 현재 구현 경계는
[Poke Lounge Game Concept](./poke-lounge-game-concept.md), 운영 한 사이클 절차는
[Poke Lounge 플레이어 E2E 테스트 시나리오](./poke-lounge-multiplayer-test-scenarios.md)를 따른다.

## 1. 작업 목표

Redis를 room, 경쟁전과 결과의 유일한 서버 권위 상태로 유지하면서, API 또는 BullMQ worker가
커밋한 revision을 모든 연결 브라우저가 reload 없이 같은 순서로 적용하게 한다.

구체적인 목표는 다음과 같다.

1. API와 worker의 모든 committed room snapshot이 같은 실시간 전파 경로를 사용한다.
2. Socket 이벤트가 누락돼도 Web이 `afterRevision` 복구로 3초 이내 최신 상태에 수렴한다.
3. BullMQ turn timeout 작업이 API 프로세스의 인메모리 listener와 무관하게 연속 예약된다.
4. 멀티플레이 준비 시간, turn, HP, 상태이상, terminal과 최종 순위는 서버 snapshot으로만
   전진한다.
5. match 전환에서 탈락자의 이전 상대·참가 상태를 제거하고, 완료된 참가자는 reload 후에도 최종
   결과를 다시 볼 수 있다.
6. game scene 종료와 재생성 중 stale callback이 실행되지 않아 홈 이탈이나 `null.add` 오류가
   발생하지 않는다.
7. 운영 3인 한 사이클을 2회 연속 수행해 수동 reload, 예상하지 않은 4xx·5xx, page error 없이
   같은 우승자와 순위에 수렴한다.

정상 네트워크의 committed snapshot 전파는 p95 500ms 이내, 일시적인 이벤트 누락이나 Socket
재연결 뒤 자동 복구는 3초 이내를 목표로 한다.

---

## 2. 작업 범위

### 2.1 포함 범위

| 영역             | 작업 범위                                                                       |
| ---------------- | ------------------------------------------------------------------------------- |
| Redis 상태 알림  | room commit 뒤 `roomCode + revision`만 전달하는 Redis Pub/Sub 알림 경로         |
| API 실시간 전파  | Redis 알림 구독, 최신 public snapshot 조회, revision 중복 제거와 Socket.IO 전파 |
| BullMQ turn 처리 | worker의 다음 turn job 직접 예약, 동일 job 중복 제거, 시작·주기 복구            |
| Web 복구         | Socket이 연결된 채 stale한 경우를 포함한 bounded `afterRevision` watchdog       |
| 서버 권위 시간   | 준비 countdown과 turn 전환의 로컬 자율 진행 제거, 서버 시각 기반 표시           |
| match lifecycle  | terminal 우선 적용, 다음 assignment 전환, 탈락자 projection 정리                |
| 완료 lifecycle   | 최종 결과 보존, reload·재진입 복구, 명시적 leave·만료 시 identity 정리          |
| Scene lifecycle  | scene 종료 뒤 callback·subscription·tween 실행 방지와 오류 경계 보강            |
| 운영 가시성      | revision 지연, 자동 복구, queue 지연·실패와 Socket 재구독 지표                  |
| 문서·테스트      | 구현 경계, 운영 runbook, 관련 단위·통합·브라우저 검증 갱신                      |

Redis Pub/Sub은 상태 원본이 아니라 변경 알림으로만 사용한다. 알림이 유실되더라도 Redis snapshot과
room revision, `competitiveTransitions`와 `afterRevision`으로 복구한다.

### 2.2 유지할 구조

```text
Web command
-> NestJS API
-> Redis Lua CAS + revision
-> Redis room-commit notification
-> API subscriber
-> canonical public snapshot
-> Socket.IO room.snapshot
-> same-room browsers

BullMQ deadline
-> turn worker
-> Redis competitive state commit
-> next turn job ensure
-> 같은 room-commit notification 경로
```

- REST는 command와 초기·누락 복구를 담당한다.
- Socket.IO는 committed snapshot의 정상 실시간 전파를 담당한다.
- Redis는 room, match, action receipt와 최종 결과의 TTL source of truth다.
- BullMQ는 30초 turn deadline을 처리하며, timeout은 해당 turn의 미제출 행동만 생략한다.
- Web의 낙관적 상태는 `전송 중`, `다른 플레이어 기다리는 중` 같은 표시 상태에만 사용한다.

### 2.3 제외 범위

- SSE 또는 WebRTC로의 전송 방식 교체
- Redis Streams, Kafka 또는 별도 event-sourcing 도입
- 멀티리전 room 복제
- 전투 규칙, 대미지, 점수와 대진 방식 변경
- 서버 판정 전 HP, 승패 또는 순위를 확정하는 낙관적 업데이트
- Poke Lounge 외 기능의 성능 최적화나 UI 개편

Redis Pub/Sub과 revision 복구로 목표를 달성하지 못하거나 durable event audit이 필요해질 때만
Redis Streams를 후속 대안으로 검토한다.

---

## 3. 작업 계획

### 단계 0. 실패 기준선 고정

1. 운영 실행 `prod-cycle-20260827-203105`의 안전한 screenshot, turn 불일치, page error와 최종 화면
   불일치를 회귀 기준으로 정리한다.
2. 다음 실패를 각각 독립적인 자동 재현으로 만든다.
   - 서버 `waiting`인데 Web HUD가 준비 countdown을 시작하는 경우
   - Socket 연결 표시는 유지되지만 room revision과 turn이 갱신되지 않는 경우
   - terminal 뒤 이전 match 또는 참가 상태가 남는 경우
   - 완료 room reload가 최종 결과 대신 입장 화면으로 이동하는 경우
   - scene 전환 중 `Cannot read properties of null (reading 'add')`가 발생하는 경우
3. API commit 시각, Redis revision, Socket emit·수신 시각과 Web 적용 revision을 민감정보 없이
   연결할 수 있는 계측 기준을 추가한다.

**Gate 0:** 수정 전 실패를 결정론적으로 재현하고, room 비밀번호·session ID·token·cookie가 로그와
artifact에 남지 않아야 한다.

### 단계 1. Redis 기반 room commit 알림 통합

1. 기존 Redis 연결과 `PokeLoungeRoomEventsService`를 재사용해 room commit 알림 channel을 추가한다.
2. API command와 worker timeout이 Redis 상태를 커밋한 뒤 `{ roomCode, revision }`만 publish한다.
3. 모든 API 인스턴스는 알림을 구독하고 Redis에서 해당 revision 이상의 public snapshot을 읽는다.
4. API는 room별 마지막 발행 revision을 관리해 중복과 역순 알림을 무시하고 Socket.IO
   `room.snapshot`을 전파한다.
5. 현재 `QueueEvents -> API 인메모리 listener`에만 의존하는 worker 결과 전파를 제거한다.
6. Pub/Sub 연결이 끊기면 상태를 메모리로 대체하지 않고 health와 운영 로그에 명확히 노출한다.

**Gate 1:** API commit과 worker commit이 같은 경로로 두 브라우저에 전달되고, 중복·역순 알림이
room revision을 되돌리지 않아야 한다.

### 단계 2. BullMQ turn job 연속성 보장

1. `expirePendingTurn()` 결과에 다음 active turn의 `matchId`, turn과 deadline을 명시한다.
2. worker는 현재 turn 커밋 뒤 다음 turn job을 직접 `ensure`하고 나서 현재 job을 완료한다.
3. job ID는 기존 `matchId + turn` 규칙을 유지해 API action 경로와 worker가 동시에 예약해도 한
   job만 남게 한다.
4. worker 시작 시 Redis의 진행 중 match를 스캔해 누락된 deadline job을 복구한다.
5. 낮은 빈도의 reconciliation이 진행 중 match와 BullMQ delayed job을 비교해 커밋과 다음 job 예약
   사이의 프로세스 종료도 복구한다.
6. completed match, 이미 전진한 turn과 재생된 job은 부작용 없이 `ignored`로 끝낸다.

**Gate 2:** 두 플레이어가 행동을 제출하지 않아도 turn이 30초마다 계속 전진하고, API 또는 worker를
재시작해도 다음 deadline job이 하나만 존재해야 한다. timeout만으로 승패가 결정돼서는 안 된다.

### 단계 3. Web revision watchdog과 서버 권위 시간 적용

1. `serverRoom.ts`의 기존 recovery queue와 `afterRevision` 요청을 단일 복구 경로로 유지한다.
2. 다음 상황에서 기대 revision이 일정 시간 전진하지 않으면 bounded recovery를 한 번 시작한다.
   - Socket connect·reconnect 또는 브라우저 visibility 복귀
   - room mutation이나 경쟁 action 2xx 수신
   - 서버 `endsAtMs` 또는 turn deadline 경과
   - Socket은 online이지만 같은 revision이 3초 이상 유지되는 기대 전환
3. 한 room에는 recovery 요청 하나만 실행하고, 성공·terminal·close에서 retry를 중단한다.
4. `createRoundHud()`가 경쟁 모드의 `waiting` 상태에서 로컬 preparation을 시작하지 않게 한다.
5. countdown은 서버 `startedAtMs`와 `endsAtMs`로 표시하되, 0이 된 뒤 서버 snapshot 전까지
   `다른 플레이어를 기다리는 중...`을 표시한다.
6. HP, PP, 상태이상, turn과 terminal은 authoritative projection으로만 적용한다.

**Gate 3:** Socket 이벤트 한 건을 의도적으로 누락해도 사용자 reload 없이 3초 이내 최신 revision과
turn으로 수렴하고, 서버 시작 전 countdown이나 조기 `round-ready` 요청이 없어야 한다.

### 단계 4. match·terminal·완료 lifecycle 정리

1. terminal transition을 같은 snapshot의 다음 assignment보다 먼저 한 번만 적용한다.
2. match ID가 바뀌면 이전 command, 상대, submitted 상태와 BattleScene launch cache를 제거한다.
3. 현재 assignment 참가자가 아닌 플레이어는 월드로 전환하고 전투 control과 `내 상태 참가`를
   노출하지 않는다.
4. 다음 대진 진입 때 서버가 제공한 full HP·PP와 상태이상 없음 상태를 적용한다.
5. room `completed`에서는 stored identity를 즉시 지우지 않고 최종 결과 보존 시간 동안 resume을
   허용한다.
6. 명시적 leave, room `closed` 또는 TTL 만료에서만 resume identity를 제거한다.
7. BattleScene과 WorldScene 전환에서 subscription, tween과 delayed callback을 먼저 정리하고,
   파괴된 scene object에 접근하는 callback을 무시한다.

**Gate 4:** 승자·패자·부전승 플레이어가 같은 terminal, 다음 대진과 최종 순위를 보며, 완료 화면을
reload해도 입장 화면으로 이탈하지 않아야 한다. page error는 0건이어야 한다.

### 단계 5. 운영 가시성·배포

1. 다음 지표와 구조화 로그를 추가한다.
   - Redis commit부터 Socket emit까지의 지연
   - 브라우저가 보고한 last revision과 자동 recovery 횟수
   - BullMQ waiting, delayed, active, stalled, failed job 수
   - turn deadline 예정 시각과 실제 처리 지연
   - room별 terminal·final result 수렴 실패
2. 운영 health에서 API Redis subscriber와 turn worker 준비 상태를 분리해 확인한다.
3. API·worker를 먼저 배포하고 health와 queue를 확인한 뒤 Web을 배포한다.
4. 운영 한 사이클 실패 시 Web, API·worker 순서로 이전 버전을 복원한다. Redis room 값을 수동으로
   수정해 승패나 점수를 보정하지 않는다.

**Gate 5:** 운영 배포 직후 API·worker·Redis health가 정상이고, queue stalled·failed 0건 상태에서
운영 인수 테스트를 시작할 수 있어야 한다.

---

## 4. 검증 방법

### 4.1 정적 검사와 단위 테스트

```bash
pnpm --filter @poke-lounge/api lint
pnpm lint:web
pnpm type:check:web
pnpm test:api
pnpm test:web
```

관련 테스트는 최소한 다음 동작을 검증한다.

- Redis room commit 알림의 중복·역순 제거와 public snapshot 재조회
- worker timeout 뒤 다음 turn job 예약과 동일 job ID 중복 제거
- worker 재시작과 reconciliation의 누락 job 복구
- Socket online 상태에서 revision이 멈췄을 때 bounded `afterRevision` 복구
- 경쟁 대기실에서 로컬 준비 countdown이 시작되지 않는 동작
- terminal 우선 적용, 탈락자 projection 제거와 final result resume
- scene destroy 뒤 callback이 scene object를 다시 생성하지 않는 동작

### 4.2 Redis·API·worker 통합 검증

실제 Redis에 API 1개, turn worker 1개와 Socket client 2개를 연결해 다음 순서로 검증한다.

1. API action commit과 worker timeout commit이 모두 두 client에 같은 revision으로 전달된다.
2. 한 client의 Pub/Sub 또는 Socket 이벤트를 의도적으로 누락하고 자동 REST 복구를 확인한다.
3. API를 재시작해도 room과 match가 유지되고 client가 중복 avatar 없이 재구독한다.
4. worker를 turn commit 직후와 다음 job 예약 전후에 재시작해 deadline job 복구를 확인한다.
5. Redis 알림을 중복·역순으로 전달해도 Web과 API cursor가 뒤로 가지 않는지 확인한다.
6. terminal commit, 다음 assignment와 final standings가 동일 revision 흐름으로 재생되는지 확인한다.

프로세스 중단과 이벤트 유실 주입은 로컬·격리 환경에서만 수행하고 운영 room에는 적용하지 않는다.

### 4.3 브라우저 한 사이클

[Poke Lounge agent-browser 테스트 스킬](../.agents/skills/poke-lounge-agent-browser-test/SKILL.md)과
플레이어 E2E 시나리오를 사용한다. Firefox는 제외하며 seed로 다음 환경을 배정한다.

- Desktop Chromium 1440×900
- Mobile Chromium 390×844 두 개

세 플레이어는 설정에서 소리를 끄고, 방 생성·순차 참가·전원 ready·방장 시작·3분 준비·3라운드
전투·최종 우승·전원 퇴장까지 공개 UI만 사용한다. 루트 관리자는 플레이어 슬롯에 들어가지 않는다.

운영 한 사이클 통과 조건:

1. 세 화면의 room revision, round, active match와 turn이 checkpoint마다 일치한다.
2. tester가 수동 reload하지 않아도 Socket 누락과 재연결이 3초 이내 자동 복구된다.
3. 유효한 ready, round-ready와 action에서 예상하지 않은 400·409·5xx가 없다.
4. turn timeout은 해당 행동만 생략하고 다음 turn을 계속 예약한다.
5. 각 대진 진입 시 HP·PP가 가득 차고 상태이상이 없다.
6. 탈락자는 전투 control과 stale 상대·참가 상태를 보지 않는다.
7. 세 화면 모두 같은 terminal HP, 라운드 점수, 최종 순위와 우승자를 표시한다.
8. 홈 이탈, `null.add`를 포함한 page error와 중복 action 요청이 없다.
9. 완료 결과 reload가 같은 최종 순위를 복구하고, 명시적 leave 뒤 입장 화면으로 돌아간다.
10. 같은 조건의 운영 한 사이클이 2회 연속 통과한다.

### 4.4 완료 기준

| 항목           | 완료 기준                                                 |
| -------------- | --------------------------------------------------------- |
| 정상 전파      | commit부터 모든 연결 client 적용까지 p95 500ms 이내       |
| 누락 복구      | Socket·Pub/Sub 이벤트 유실 뒤 3초 이내 자동 수렴          |
| turn 연속성    | active match마다 다음 delayed job 1개, stalled·failed 0건 |
| 상태 일치      | checkpoint별 세 화면의 revision·round·match·turn 일치     |
| 화면 lifecycle | 강제 홈 이동, stale opponent, `null.add`와 page error 0건 |
| 최종 결과      | 세 화면의 최종 순위·우승자 일치와 reload 복구             |
| 운영 인수      | 3인 3라운드 운영 한 사이클 2회 연속 PASS                  |

검증 결과와 screenshot은 `output/agent-browser/poke-lounge/` 아래 실행별 디렉터리에 저장하고
커밋하지 않는다. 실패하면 `DOC-GAP`, `CODE-FAIL`, `TEST-RUNNER`, `INFRA-BLOCKED` 중 하나로
분류하고 코드 결함과 테스트 절차 위반을 섞어 집계하지 않는다.

---

## 5. 구현 및 로컬 검증 결과

2026-08-27–28에 단계 1–4를 구현하고 다음 로컬 검증을 완료했다.

| 검증                        | 결과 | 확인 내용                                                                                   |
| --------------------------- | ---- | ------------------------------------------------------------------------------------------- |
| 5인 자동 통합 사이클        | PASS | C0~C7, 3라운드, Redis/REST/Socket 수렴, reload, Socket 재연결, 전원 퇴장                    |
| 3인 agent-browser 한 사이클 | PASS | Desktop Chromium 1명 + Mobile Chromium 2명, 3라운드, 최종 순위, 완료 room reload, 전원 퇴장 |
| timeout 연속성              | PASS | 한 플레이어 미제출 시 해당 행동만 생략하고 다음 turn과 terminal까지 진행                    |
| 완료 lifecycle              | PASS | 세 화면 최종 순위 일치, reload에서 room 재생성 없이 복구, 방장 퇴장 뒤 `closed`             |
| 정적·단위 검증              | PASS | lint, Web type check, API contract, build, 전체 923건과 최종 Web 317건                      |

수동 사이클에서 부전승 플레이어의 접근성 요약이 다른 참가자의 활성 경기를 `현재 상대`로
안내하는 결함을 발견했다. 활성 match에 본인이 포함된 경우에만 상대를 안내하도록 수정하고 3인
부전승 회귀 테스트를 추가했다. 한 Mobile 자동화의 stale control 참조는 서버 요청이 발생하지 않은
`TEST-RUNNER`로 분리했으며, 같은 경기에서 다른 플레이어의 행동과 30초 timeout으로 서버 진행이
계속됨을 확인했다.

운영 배포와 동일 조건의 운영 3인 사이클 2회 연속 PASS는 아직 수행하지 않았으므로 Gate 5와 운영
인수 완료로 판정하지 않는다.
