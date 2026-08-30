# Poke Lounge 플레이 성능 최적화 계획

확인 기준일: 2026-08-26
상태: 진행 중 — 단계 1~4 구현, 정적·단위·핵심 Chromium 회귀 완료

## 1. 목적

Poke Lounge의 2~6인 플레이에서 전투 애니메이션 프레임 저하, 원격 이동 끊김, 라운드 전환
요청 충돌과 최종 결과 화면 정체를 줄인다. 기존 서버 권위 전투와 저장소 책임은 유지하고, 실제
플레이 감각과 다중 브라우저 상태 수렴을 함께 개선한다.

이 문서는 구현 순서와 완료 기준을 정의한다. 제품 규칙은
[Poke Lounge 게임 규칙 인덱스](./poke-lounge-rules/index.md), 멀티플레이 인수 기준은
[Poke Lounge 플레이어 E2E 테스트 시나리오](./poke-lounge-multiplayer-test-scenarios.md)를 따른다.

## 2. 기준선과 확인된 문제

### 2.1 운영 한 사이클 기준선

2026-08-26 운영 `agent-browser` 3인 실행 `prod-20260826-074857`에서 다음 현상을 확인했다.

| 항목              | 결과                                                                  |
| ----------------- | --------------------------------------------------------------------- |
| 서버 최종 수렴    | 세 참가자의 점수와 최종 순위 확정, room `closed`                      |
| 서버 오류         | HTTP 5xx 0건, page error 0건                                          |
| 라운드 ready 요청 | 예상하지 않은 HTTP 400 9건, 409 8건                                   |
| 최종 화면         | 두 화면은 최종 순위 표시, 한 Desktop 화면은 전투 승리 terminal에 잔류 |
| 테스트 증적       | screenshot 등 87개, 약 4.4MB                                          |
| 테스트 실행 병목  | 한 Desktop session의 `read` 지연과 screenshot 정체                    |

서버가 최종 결과와 정리 상태까지 수렴했으므로 Redis 또는 Socket.IO 전체 교체가 필요한 장애로 보지
않는다. 아래 네 경로를 독립적으로 개선한다.

### 2.2 전투 렌더링

`BattleScene`은 HP, 피격, 등장, 포획과 진화 tween의 매 `onUpdate`에서 전체 `render()`를 호출한다.
`render()`는 `children.removeAll(true)`로 모든 Phaser 오브젝트를 제거하고 배경, 포켓몬, HP 패널,
메시지와 overlay를 다시 만든다. 접근성 상태와 모바일 전투 UI 상태도 같은 주기로 다시 발행한다.

이 구조는 Canvas renderer와 headless 실행에서 객체 할당, 해제, 텍스트 생성과 DOM 이벤트를
애니메이션 프레임마다 반복한다. 전투 화면의 가장 우선적인 렌더링 병목으로 취급한다.

### 2.3 월드 이동

로컬 플레이어는 즉시 이동하고 위치 전송은 90ms 간격으로 제한되어 있다. 수신 화면은 새 좌표를
원격 sprite에 즉시 적용하므로 10~11Hz 좌표가 화면에서 순간이동처럼 보일 수 있다. 서버는 각
이동 이벤트마다 Redis 최신 상태와 `worldSeq`를 갱신한 뒤 방 전체에 전파한다.

전송 빈도를 높이지 않고 최신 좌표 보간으로 체감 부드러움을 높여야 한다.

### 2.4 라운드 진입 ready

대기실 준비와 라운드 진입 준비가 같은 participant `ready` 필드와 `/ready` 명령을 사용한다.
라운드 종료 시각에 모든 브라우저가 같은 room revision을 조회하고 동시에 ready를 보내면 한
요청만 성공하고 나머지는 revision conflict가 된다. 충돌 이후 room이 tournament 상태로 전환되면
늦은 재요청은 잘못된 단계의 ready가 되어 400으로 끝날 수 있다.

이는 서버 처리량 부족이 아니라 서로 독립적인 플레이어 확인을 하나의 전역 revision 경쟁으로
처리하는 구조 문제다.

### 2.5 전투 완료 화면

서버가 전투 완료를 확정해도 `BattleScene`에서 결과 확인 입력이 처리되어야 월드 또는 다음 대진으로
이동한다. 결과 입력이 누락되거나 scene 전환과 snapshot 적용이 경합하면 완료된 전투 화면에 남을
수 있다. 같은 완료 결과를 여러 번 받아도 한 번만 전환되는 명시적인 상태 전이가 필요하다.

## 3. 목표와 성능 예산

아래 값은 구현 전·후를 비교할 운영 목표다. 물리 기기 측정값이 확보되면 수치는 별도 근거와 함께
조정한다.

| 영역                | 목표                                                             |
| ------------------- | ---------------------------------------------------------------- |
| Desktop 전투 렌더링 | 주요 tween 구간 p95 frame time 16.7ms 이하                       |
| Mobile 전투 렌더링  | 주요 tween 구간 p95 frame time 33.3ms 이하                       |
| 메인 스레드         | 정상 전투 10턴 동안 50ms 초과 long task 0건                      |
| 이동 전송량         | 지속 이동 시 플레이어당 초당 최대 12건                           |
| 원격 이동 표시      | 정상 네트워크에서 최신 서버 좌표까지 p95 200ms 이내              |
| 위치 복구           | 이벤트 유실 또는 재접속 뒤 2초 이내 Redis snapshot 수렴          |
| 라운드 진입 ready   | 플레이어당 라운드별 성공 명령 1회, 예상하지 않은 400·409 0건     |
| 전투 완료 전환      | 결과 확인 뒤 1초 이내 월드 또는 다음 대진으로 전환               |
| 최종 결과           | 서버 완료 뒤 모든 연결 화면이 같은 순위와 우승자에 수렴          |
| 테스트 자동화       | 같은 browser session의 동시 명령 0건, 제품 turn timeout 유발 0건 |

## 4. 유지할 구조

상태 특성에 맞춰 현재 저장소와 전송 경계를 유지한다.

| 상태                                     | 처리 방식                         |
| ---------------------------------------- | --------------------------------- |
| 로컬 입력과 자기 캐릭터 이동             | 브라우저 즉시 반영                |
| map, 좌표, 방향                          | Socket.IO와 Redis 최신 상태       |
| 방 참가, lobby ready, start와 round      | REST와 Redis Lua CAS              |
| 경쟁전 action, turn, HP, terminal과 점수 | REST와 Redis 서버 권위 CAS        |
| committed snapshot 전파와 연결 복구      | Socket.IO와 bounded REST recovery |

다음 경로를 새로 도입하지 않는다.

- SSE 또는 WebRTC 전환
- Redis Streams, Kafka, BullMQ 등 별도 메시지 큐
- 경쟁전 상태나 최종 결과의 별도 영속 DB 이중 기록
- 이동 이력 저장과 event sourcing
- 서버 판정 전에 HP, 승패나 점수를 확정하는 낙관적 업데이트

전투 행동은 유실하거나 마지막 값만 남길 수 없는 명령이다. latest-wins 처리는 이동 좌표에만 사용한다.

## 5. 구현 단계

### 단계 0. 측정 기준선 고정

목적은 최적화 전후를 같은 입력으로 비교하고 추측성 변경을 막는 것이다.

1. Desktop Chromium 1440×900과 Mobile Chromium 390×844에서 같은 전투 fixture를 실행한다.
2. 등장, HP 감소, 피격과 terminal 구간의 frame time, long task와 Phaser object 수를 기록한다.
3. 3인과 6인 지속 이동 30초 동안 플레이어별 Socket 전송 건수, Redis 갱신 건수와 수신 지연을
   기록한다.
4. 3인 라운드 종료에서 ready 요청 수, 응답 code와 room revision 전진을 기록한다.
5. 측정용 로그는 개발·E2E 경계에 두고 운영 console 로그를 추가하지 않는다.

**Gate 0:** 같은 seed와 행동으로 재현 가능한 기준선이 있고 민감한 room credential이 artifact에
남지 않아야 한다.

### 단계 1. BattleScene 부분 렌더링

목적은 tween 프레임마다 전체 scene을 파괴하고 다시 만드는 경로를 제거하는 것이다.

1. 배경, 포켓몬 sprite, HP panel, 메시지와 animation overlay를 scene 생성 시 한 번 만든다.
2. 전투 state나 화면 phase가 바뀔 때만 정적 UI를 갱신한다.
3. HP tween은 해당 HP bar와 숫자만 갱신한다.
4. 피격 tween은 대상 sprite의 위치, alpha 또는 tint만 갱신한다.
5. 등장·포획·진화 tween은 전용 animation layer의 객체만 갱신한다.
6. 접근성 상태와 모바일 UI 이벤트는 의미 있는 phase, 선택, 메시지 또는 HP 값이 바뀔 때만
   발행한다.
7. scene 종료에서 기존 tween과 보존 객체를 한 번 정리한다.

예상 변경 범위:

- `apps/web/src/components/poke-lounge/runtime/game/scenes/BattleScene.ts`
- `apps/web/src/components/poke-lounge/runtime/game/ui/mobile-battle-ui.ts`
- 가까운 Web unit test와 Poke Lounge 전투 E2E

**Gate 1:** 애니메이션 `onUpdate`가 전체 `render()`나 `children.removeAll(true)`를 호출하지 않고,
기존 전투 결과·사운드·입력·접근성 동작이 유지되어야 한다.

#### 2026-08-26 1차 구현 결과

- HP, 피격, 등장, 포획과 진화 tween의 `onUpdate`에서 전체 `render()` 호출을 제거했다.
- HP bar, 포켓몬 image, 진입 overlay, 포획 graphics와 진화 graphics/image를 보존하고 해당 객체만
  갱신한다.
- E2E snapshot에 전체 render 횟수와 animation frame update 횟수를 추가해 프레임별 전체 재렌더
  회귀를 검출한다.
- Desktop Chromium의 등장·공격·포획·진화 시나리오와 Mobile Chromium 390×844의 전투·진화
  시나리오가 통과했다.
- 검증된 전체 render 증분 상한은 등장 2회, 공격 4회, 포획 3회, 진화 4회다. 이는 animation frame
  수가 아니라 시작·완료·메시지 등 이산 상태 전환에 한정된다.
- 실제 기기 frame time, long task와 Phaser object 수 측정은 남아 있으므로 Gate 0과 성능 예산 달성
  판정은 아직 완료하지 않는다.

### 단계 2. 원격 이동 보간과 latest-wins 유지

목적은 서버 이벤트 빈도를 늘리지 않고 원격 플레이어를 부드럽게 표시하는 것이다.

```text
로컬 입력
-> 자기 sprite 즉시 이동
-> 기존 90ms 제한으로 최신 위치 전송
-> API 검증과 Redis latest snapshot 갱신
-> peer가 목표 좌표 저장
-> Phaser update에서 현재 좌표를 목표 좌표로 보간
```

1. 기존 90ms 전송 제한과 `worldSeq` 복구를 유지한다.
2. `WorldScene`은 원격 snapshot 수신 시 sprite를 순간이동시키지 않고 목표 위치와 수신 시각을
   저장한다.
3. 매 render frame에 짧은 보간 구간으로 목표 위치를 따라간다.
4. 맵 변경, 최초 생성, 큰 거리 차이와 resync snapshot은 즉시 위치를 맞춘다.
5. `PLAYER_MOVEMENT_ENDED`는 최종 좌표를 신뢰성 있게 적용하고 잔여 보간을 끝낸다.
6. 연결 전 대기열에 이동이 여러 건 생기면 마지막 이동 하나만 남기고, 전투·ready·leave 명령은
   합치지 않는다.
7. Socket buffer 적체가 계측될 때만 `PLAYER_MOVED`의 volatile 전송을 검토한다.

예상 변경 범위:

- `apps/web/src/components/poke-lounge/runtime/game/scenes/WorldScene.ts`
- `apps/web/src/components/poke-lounge/runtime/game/network/serverRoom.ts`
- `apps/web/src/components/poke-lounge/runtime/game/network/server-room-snapshot-replay.test.ts`
- `apps/api/src/poke-lounge/poke-lounge.gateway.spec.ts`

**Gate 2:** 이동 전송량이 증가하지 않고 원격 이동 지연과 복구 기준을 만족하며, 최종 좌표가 서버
Redis snapshot과 일치해야 한다.

#### 2026-08-26 2차 구현 결과

- 원격 이동 snapshot은 `GameStateStore` 전체 구독 경로에서 분리하고 `WorldScene`의 목표 좌표로만
  저장한다.
- 이동 중에는 120ms 선형 보간을 적용하고 최초 등장, 맵 변경, 96px 이상 이격과 이동 종료는 서버
  좌표로 즉시 맞춘다.
- 연결 전 `PLAYER_MOVED`는 마지막 한 건만 남기며, Redis·Socket 전송 빈도와 `worldSeq` 계약은
  변경하지 않았다.
- 로컬 위치 저장은 이동 프레임마다 수행하지 않고 1초 간격과 이동 종료 시점에만 수행한다.
- 재화·순위·파티 HUD는 값이 실제로 바뀔 때만 다시 그린다.
- 보간 경계 단위 테스트와 Web 타입 검사·단위 회귀는 통과했다. 실제 다중 브라우저 이동 지연과
  Redis 최종 좌표 대조는 로컬 한 사이클에서 확인해야 한다.

### 단계 3. lobby ready와 round ready 분리

목적은 라운드 진입 확인을 room revision 경쟁이 아닌 플레이어별 멱등 barrier로 처리하는 것이다.

1. 기존 `/ready`는 대기실 준비와 취소만 담당한다.
2. 라운드 종료 뒤에는 `roundIndex`를 포함한 별도 round-ready 명령을 사용한다.
3. 서버는 `(roomCode, roundIndex, playerId)` 의미로 같은 확인을 멱등 처리한다.
4. 이미 준비된 플레이어가 다시 요청하면 오류 대신 최신 snapshot을 반환한다.
5. Redis Lua CAS로 확인을 직렬화하고 마지막 연결 참가자의 확인이 들어올 때 한 번만
   tournament로 전환한다.
6. 클라이언트는 round별 `inFlight`와 `acknowledged` 상태를 가져 동일 명령을 동시에 보내지 않는다.
7. revision conflict를 무작위 지연으로 숨기거나 무한 재시도하지 않는다.

예상 변경 범위:

- `apps/api/src/poke-lounge/poke-lounge.controller.ts`
- `apps/api/src/poke-lounge/poke-lounge-room.service.ts`
- `apps/api/src/poke-lounge/poke-lounge-room.repository.ts`
- `apps/api/src/poke-lounge/redis-poke-lounge.repository.ts`
- `apps/api/src/poke-lounge/dto/`
- `apps/web/src/components/poke-lounge/runtime/game/network/serverRoom.ts`
- API OpenAPI와 생성 Web 타입
- API service·repository와 Web snapshot replay test

핵심 회귀 테스트는 세 플레이어가 같은 revision에서 `Promise.all`로 round-ready를 보내도 세 요청이
2xx로 끝나고 room이 정확히 한 번 tournament로 전환되는 경우다.

**Gate 3:** 2·3·6인 동시 round-ready에서 예상하지 않은 400·409가 없고 다음 라운드와 대진이 모든
snapshot에서 동일해야 한다.

#### 2026-08-26 구현 결과

- 기존 `/ready`는 대기실 준비·취소만 처리하고, `roundIndex`를 받는 `/round-ready`를 추가했다.
- round-ready는 `If-Match-Revision` 없이 Redis room CAS 안에서 직렬화하며 플레이어별
  `X-Idempotency-Key`로 재전송한다.
- 클라이언트는 라운드마다 같은 key를 유지하고 한 번에 하나만 전송한다. 같은 확인의 재전송은
  저장 당시 응답이 아니라 최신 room snapshot을 받는다.
- 3명의 동시 `Promise.all` 확인이 모두 성공하고 room revision이 참가자 수만큼 전진한 뒤 정확히
  한 번 tournament로 전환되는 service 회귀를 추가했다.
- DTO, Swagger, OpenAPI와 생성 Web 타입을 같은 변경에 반영했다. 실제 2·3·6인 브라우저의 4xx
  0건 판정은 로컬 한 사이클에서 확인해야 한다.

### 단계 4. 전투 완료 전환을 명시적 상태로 고정

목적은 terminal 결과를 보존하면서 결과 확인 뒤 완료된 BattleScene에 남지 않게 하는 것이다.

1. 완료 match별 `terminal-visible`, `acknowledged`, `transitioned` 상태를 구분한다.
2. 결과 control은 terminal 화면과 함께 한 번 표시하고 Desktop·Mobile 모두 같은 의미의 확인
   동작을 사용한다.
3. 결과 확인은 match ID와 assignment revision을 기준으로 멱등 처리한다.
4. 다음 assignment가 먼저 도착하거나 room이 completed가 되어도 terminal 캡처 전에는 화면을
   건너뛰지 않는다.
5. 확인 뒤에는 cached completed launch key를 사용해 월드 또는 다음 대진으로 한 번만 전환한다.
6. 화면 control이 사라졌지만 완료 BattleScene이 남는 불가능 상태는 snapshot을 기준으로 복구한다.

예상 변경 범위:

- `apps/web/src/components/poke-lounge/runtime/game/scenes/BattleScene.ts`
- `apps/web/src/components/poke-lounge/runtime/game/scenes/WorldScene.ts`
- `apps/web/src/components/poke-lounge/runtime/game/scenes/competitive-battle-launch.test.ts`
- `apps/web/src/components/poke-lounge/runtime/game/network/server-room-snapshot-replay.test.ts`
- 관련 Poke Lounge Playwright spec

**Gate 4:** terminal 캡처와 결과 확인 한 번 뒤 승자는 다음 대진 또는 최종 결과, 패자는 월드로
전환하며 추가 입력 없이 모든 화면이 같은 서버 상태에 수렴해야 한다.

#### 2026-08-26 구현 결과

- authoritative terminal을 match ID와 assignment revision 기준 `visible → acknowledged →
transitioned` 상태로 고정했다.
- 마지막 턴 제출자가 terminal에서도 입력 대기 상태로 남아 Mobile `다음` control이 잠기던 문제를
  완료 projection 수신 시 해제했다.
- terminal 확인 전에는 round-ready room snapshot이 BattleScene을 선점하지 못하고, 확인 뒤에는
  completed launch key를 넘겨 WorldScene 전환과 다음 assignment 시작을 한 번만 수행한다.
- 마지막 제출자가 두 명 모두인 terminal fixture에서 승자·패자 결과 확인과 WorldScene 복귀
  Chromium 회귀 2건이 통과했다. 실제 Mobile touch와 다음 대진 연속 전환은 로컬 한 사이클에서
  확인해야 한다.

### 단계 5. 테스트 실행 비용 정리

이 단계는 제품 deadline이나 판정 규칙을 바꾸지 않고 테스트 도구의 낭비만 줄인다.

1. 각 named `agent-browser` session에 명령 mutex를 두어 `read`, `snapshot`, `click`과 screenshot을
   겹치지 않는다.
2. 필수 checkpoint만 정상 캡처하고, 추가 screenshot·network·console은 실패 시에만 남긴다.
3. 전투 입력은 새 snapshot ref를 얻은 뒤 한 번 수행하고 2xx 또는 서버 state 전진을 확인한 뒤에만
   다음 입력으로 간다.
4. Desktop과 Mobile 결과 확인 control을 접근성 이름으로 안정적으로 찾을 수 있게 한다.
5. 제품의 3분 준비, 30초 turn deadline과 재접속 유예는 테스트 편의를 위해 단축하지 않는다.

**Gate 5:** runner 지연 때문에 발생한 전투 timeout이 없고, 동일한 필수 증적을 더 적은 명령과
artifact로 수집해야 한다.

## 6. 구현 순서와 커밋 경계

각 단계는 독립적으로 검증하고 이전 단계가 통과한 뒤 다음 단계로 진행한다.

1. `perf(poke-lounge):전투 애니메이션 부분 렌더링`
2. `perf(poke-lounge):원격 이동 보간 적용`
3. `fix(poke-lounge):라운드 준비 충돌 제거`
4. `fix(poke-lounge):전투 완료 화면 전환 보장`
5. `test(poke-lounge):브라우저 실행 비용 축소`

단계 3에서 API 계약이 바뀌면 같은 커밋에서 DTO, Swagger, OpenAPI, 생성 Web 타입과 양쪽 사용처를
함께 반영한다. 단계 간 임시 호환 코드를 장기간 유지하지 않는다.

## 7. 검증 계획

### 7.1 정적·단위 검증

- `pnpm lint:web`
- `pnpm type:check:web`
- `pnpm --filter @poke-lounge/api lint`
- `pnpm test:web`
- round-ready 관련 API service·repository test
- `pnpm check:api-contract`
- `pnpm build`

API 계약을 변경하지 않은 단계에서는 `check:api-contract` 생성물 변경이 없어야 한다.

### 7.2 로컬 브라우저 검증

1. Desktop Chromium과 Mobile Chromium에서 전투 애니메이션 성능 기준을 재측정한다.
2. 3인 shared world에서 양방향 이동, 정지, 맵 변경과 위치 이벤트 한 건 유실 복구를 확인한다.
3. 2·3·6인이 같은 라운드 종료 시각에 round-ready를 보내는 통합 시나리오를 실행한다.
4. 첫 대진 terminal, 결과 확인, 결승 진입, 패자 월드 복귀와 최종 결과를 확인한다.
5. console error, page error, 예상하지 않은 4xx·5xx가 없어야 한다.

### 7.3 운영 한 사이클

[Poke Lounge 플레이어 E2E 테스트 시나리오](./poke-lounge-multiplayer-test-scenarios.md)와 프로젝트
`poke-lounge-agent-browser-test` 스킬을 사용한다.

- Firefox 제외, headless Chromium 사용
- 실행 seed로 Desktop 1440×900 또는 Mobile 390×844 무작위 배정
- 플레이어별 독립 named session과 저장 상태 유지
- 전원 설정에서 소리를 끈 뒤 시작
- 루트 오케스트레이터는 플레이어로 참가하지 않음
- 방 생성부터 3라운드 우승, 최종 순위 수렴과 전원 퇴장까지 진행
- 각 player의 console, page error, 4xx·5xx와 연결 복구 확인

## 8. 배포와 롤백

1. 단계 1·2 Web 최적화는 각각 독립 배포하고 frame time과 이동 수렴을 확인한다.
2. 단계 3은 API가 새 round-ready 명령을 먼저 수용한 뒤 Web을 배포한다.
3. 배포 중 구버전 Web의 기존 ready 요청을 안전하게 처리할 호환 기간이 필요하면 한 릴리스로
   제한하고 제거 조건을 같은 변경에 기록한다.
4. 단계 4·5는 Web 배포 뒤 운영 한 사이클로 확인한다.

롤백 시 Web을 먼저 이전 버전으로 되돌리고 API를 되돌린다. Redis 경쟁전 결과와 위치 snapshot은
TTL 데이터이므로 데이터 변환 롤백은 만들지 않는다. round-ready에 schema 변경이
필요해지는 경우에는 migration의 역방향 안전성을 구현 전에 별도로 검토한다.

## 9. 완료 기준

다음을 모두 만족하면 최적화 작업을 완료한다.

1. 단계 0과 동일한 fixture에서 전투 frame time과 long task 목표를 만족한다.
2. 이동 전송량을 늘리지 않고 Desktop·Mobile 원격 이동이 목표 지연 안에서 부드럽게 보인다.
3. Redis `worldSeq` 누락과 재접속 복구가 기존 2초 기준을 유지한다.
4. 2·3·6인 round-ready 동시 요청에서 예상하지 않은 400·409가 없다.
5. terminal 결과 확인 한 번으로 모든 참가자가 다음 scene에 수렴한다.
6. 3라운드 우승자, 점수와 최종 순위가 서버 판정과 모든 화면에서 같다.
7. 전원 퇴장 뒤 room이 `closed`, 모든 참가자가 `connected=false`이고 Redis world key가 제거된다.
8. 로컬 한 사이클과 운영 한 사이클이 연속으로 통과한다.

## 10. 제외 범위

- 게임 규칙, 준비 시간, turn deadline와 점수 계산 변경
- 6명을 초과하는 room 확장
- 병렬 토너먼트 대진 도입
- 멀티리전 room 동기화
- 새로운 렌더링 엔진 도입
- 성능 근거 없는 전체 room delta protocol 재설계

현재 최대 6명, 단일 리전과 단일 활성 대진에서는 기존 Phaser, Socket.IO와 Redis를 유지하는 것이
가장 작은 구조다.
