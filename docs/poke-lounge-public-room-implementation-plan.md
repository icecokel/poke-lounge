# Poke Lounge 공개방 구현 계획

확인 기준일: 2026-09-01
구현 기준: `main`
상태: 서버 구현 완료 · 2026-09-02 후속 요구로 공개 방 만들기 UI 비활성화

현재 화면은 공개/비공개 방 만들기 선택을 표시하되 공개 선택을 비활성화한다. quick-play 서버
계약은 유지하지만 일반 입장 화면에서는 호출하지 않는다.

이 문서는 임시 비밀번호 기반 비공개 게임은 유지하면서, 대기 중인 사용자끼리 자동으로 같은
서버 방에 입장하는 공개 게임을 추가하기 위한 구현 계획이다. 현재 서버 권위 상태와 명령 영수증의
원본은 Redis이며, 공개방도 같은 Redis room aggregate와 TTL을 사용한다.

제품·기술 경계는 [Poke Lounge Game Concept](./poke-lounge-game-concept.md), 대기실과 게임 진행
규칙은 [멀티플레이 규칙](./poke-lounge-rules/multiplayer-rules.md), 검증 절차는
[멀티플레이 테스트 시나리오](./poke-lounge-multiplayer-test-scenarios.md)를 따른다.

## 1. 결정 요약

- 공개방은 새로운 게임 종류가 아니라 **자동 검색 가능한 기존 서버 방**이다.
- 활성 공개방, 참가자, 준비 상태와 진행 상태는 기존 Redis room document에 저장한다.
- PostgreSQL 테이블, migration, 전적, MMR과 별도 매칭 큐는 추가하지 않는다.
- `visibility: "public" | "private"`를 room aggregate에 추가하고, 기존 room은 `private`로
  정규화한다.
- 클라이언트에는 공개방 목록을 노출하지 않고 `POST /poke-lounge/rooms/quick-play` 한 번으로
  기존 공개 대기방 참가 또는 새 공개방 생성을 처리한다.
- 동시 참가 제어, revision, idempotency와 Socket snapshot 전파는 기존 Redis Lua CAS 경로를
  재사용한다.
- 서버 API와 Redis 통합 검증을 먼저 완료한 뒤 Web의 비활성 공개 게임 버튼을 연결한다.

## 2. 현재 구현 기준선

현재 구현에는 공개방에 재사용할 기반이 이미 있다.

| 현재 요소        | 구현 기준                                          | 공개방에서의 사용               |
| ---------------- | -------------------------------------------------- | ------------------------------- |
| room 상태        | `poke-lounge:room:{roomCode}:state` Redis document | `visibility` 필드만 추가        |
| 활성 room 인덱스 | `poke-lounge:rooms` Redis Sorted Set               | 매칭 후보 코드 조회에 재사용    |
| 활성 room 상한   | 서버 전체 20개                                     | 초기 후보 전체 조회 비용을 제한 |
| room 참가 상한   | 6명                                                | 기존 `joinRoom()` 검증 재사용   |
| 대기 room TTL    | 마지막 갱신 후 30분                                | 공개방도 동일하게 적용          |
| 동시성           | Redis Lua CAS, room revision                       | 공개방 참가 경합 처리           |
| 재시도           | idempotency key와 command receipt                  | 빠른 참가 중복 요청 처리        |
| 실시간 전파      | room commit 후 Socket.IO snapshot                  | 매칭 완료 뒤 기존 흐름 재사용   |

Web 입장 화면에는 이미 `공개 게임` 영역이 있으나 버튼이 비활성화되어 있다. 비공개 게임은 임시
비밀번호를 브라우저에서 6자리 room code로 변환하고 기존 `POST /poke-lounge/rooms`의
create-or-join 동작을 사용한다. 공개 게임은 이 비밀번호 파생 room code를 사용하지 않는다.

## 3. 목표와 제외 범위

### 3.1 목표

```text
닉네임 입력
-> 공개 게임 빠른 참가
-> 참가 가능한 공개 waiting room 검색
-> 있으면 기존 room에 CAS 참가
-> 없으면 임의 room code로 공개 room 생성
-> 기존 대기실, ready, 방장 시작과 3라운드 진행
```

완료된 동작은 다음 조건을 만족해야 한다.

1. 공개 빠른 참가는 비공개 room에 입장하지 않는다.
2. 같은 시점의 여러 요청이 room 참가 상한 6명을 넘기지 않는다.
3. 참가 경쟁에서 revision이 바뀌면 다른 후보 또는 최신 후보로 제한된 횟수만 재시도한다.
4. 참가 가능한 공개방이 없으면 호출자가 방장인 새 공개방을 만든다.
5. 응답을 잃어 같은 idempotency key로 재시도해도 같은 참가를 중복 생성하지 않는다.
6. 매칭 뒤 새로고침과 Socket 재연결은 기존 room code 기반 복구를 그대로 사용한다.
7. 방 종료와 TTL 만료는 공개방 전용 정리 작업 없이 기존 Redis lifecycle을 따른다.

### 3.2 제외 범위

- PostgreSQL room, queue, 전적 또는 매칭 이력 테이블
- MMR, 랭크, 지역, 지연 시간과 파티 규모 기반 매칭
- 공개방 목록, 검색, 필터와 관전 목록 UI
- Redis Streams, 별도 worker, BullMQ 매칭 job 또는 분산 lock
- 봇 참가, 자동 ready와 자동 시작
- 비공개 게임의 임시 비밀번호 방식 변경
- room code, session ID 또는 참가자 내부 식별자의 공개 목록 제공

위 항목은 실제 요구나 측정된 병목이 생길 때 별도 계획으로 추가한다.

## 4. 상태 계약

### 4.1 room visibility

내부 room state와 공개 snapshot에 다음 필드를 추가한다.

```ts
export type PokeLoungeRoomVisibility = "public" | "private";

export interface PokeLoungeRoomState {
  visibility: PokeLoungeRoomVisibility;
  // existing fields
}
```

규칙은 다음과 같다.

- 기존 `POST /poke-lounge/rooms` 생성과 임시 비밀번호 create-or-join은 항상 `private`다.
- 새 quick-play endpoint가 생성한 room만 `public`이다.
- 생성 이후 visibility는 변경할 수 없다.
- Redis에 visibility가 없는 기존 document는 읽을 때 `private`로 정규화하고 다음 commit에 저장한다.
- `visibility`는 방 검색 가능 여부만 뜻한다. 참가 이후 대기실과 게임 규칙은 두 종류가 같다.

기존 legacy 정규화는 tournament version만 검사하므로 visibility 기본값도 독립적으로 보정하도록
확장한다. Redis document version을 올리거나 전체 room을 일괄 migration하지 않는다.

### 4.2 매칭 가능 조건

room은 다음 조건을 모두 만족할 때만 새 공개 참가자를 받는다.

```text
visibility = public
status = waiting
round.phase = waiting
participants.length < 8
expiresAtMs >= serverNowMs
```

`connected`, ready와 party snapshot은 후보 제외 조건으로 추가하지 않는다. 연결 승인 대기나 짧은
재접속 유예는 기존 presence lifecycle이 정리하며, 방장이 빠지면 기존 규칙대로 다음 참가자가
방장이 된다.

## 5. 서버 구현 계획

### 5.1 저장소 조회 확장

`PokeLoungeRoomRepository`에 활성 room code를 조회하는 최소 메서드를 추가한다.

```ts
listRoomCodes(nowMs: number): Promise<string[]>;
```

Redis 구현은 만료 인덱스를 먼저 정리하고 기존 `PokeLoungeLiveStateService.listRoomStateCodes()`를
호출한다. 테스트용 fake repository도 같은 계약만 구현한다.

현재 활성 room 상한이 20개이므로 서비스가 코드를 조회하고 기존 `getRoom()`으로 snapshot을 읽어
후보를 고르는 것으로 충분하다. 공개 waiting 전용 Sorted Set이나 secondary index는 추가하지
않는다.

### 5.2 quick-play 서비스

`PokeLoungeRoomService.quickPlay()`를 추가한다. 입력 validation과 참가자 생성 규칙은 기존
`JoinPokeLoungeRoomInput`, `normalizeJoinInput()`, `joinRoom()`과 `createRoom()`을 재사용한다.

처리 순서는 다음과 같다.

1. 서버 현재 시각으로 만료된 room code를 정리하고 활성 room code를 읽는다.
2. 각 room을 기존 `getRoom()` 경로로 읽어 clock과 legacy 상태를 정규화한다.
3. 같은 session/player identity가 이미 참가한 비종료 공개 room이 있으면 그 room 재참가를 먼저
   시도한다.
4. 나머지 중 매칭 가능한 공개 room을 `createdAtMs`, `roomCode` 순으로 정렬한다.
5. 각 후보에 최신 revision과 파생 idempotency key를 사용해 기존 `joinRoom()`을 호출한다.
6. revision conflict, room full, 만료 또는 시작 전환이면 다음 후보로 진행한다.
7. 후보가 없으면 기존 `createRoom()`에 내부 `visibility: "public"` 옵션을 전달해 공개 room을
   생성한다.
8. 생성 room code 충돌은 기존 최대 20회 재생성 로직을 사용한다.

재시도 횟수는 현재 활성 room 상한으로 제한한다. 무한 loop, polling과 sleep은 추가하지 않는다.

### 5.3 동시성 및 idempotency

공개방 참가 자체는 새 Lua script로 다시 구현하지 않는다. 후보 snapshot의 revision을
`joinRoom()`에 전달하고 기존 repository mutation이 다음을 보장하게 한다.

- 같은 room의 참가 mutation 직렬화
- revision 충돌 감지
- room 참가 상한 6명 검증
- 같은 actor와 idempotency key의 command replay
- commit된 snapshot만 room event로 발행

quick-play 참가용 command key는 원 요청의 UUID에서 결정론적으로 파생한다. 동일 HTTP 요청의
재실행이 이미 참가한 공개 room을 먼저 찾도록 하여 응답 유실 뒤에도 새 room에 중복 참가하지
않게 한다. 입력 payload가 바뀐 채 같은 key를 사용하면 기존 idempotency conflict 규칙을 따른다.

### 5.4 HTTP 계약

```http
POST /poke-lounge/rooms/quick-play
X-Idempotency-Key: <uuid-v4>
Content-Type: application/json
```

```json
{
  "playerId": "player-1",
  "sessionId": "session-1",
  "displayName": "레드"
}
```

- 요청 body는 새 DTO를 만들지 않고 기존 `JoinPokeLoungeRoomDto`를 재사용한다.
- 클라이언트는 후보 revision을 모르므로 `If-Match-Revision`을 보내지 않는다.
- 성공 응답은 기존 `PokeLoungeRoomResponseDto`를 사용한다.
- 응답에는 실제 `roomCode`와 `visibility: "public"`이 포함된다.
- 입력 validation, room capacity와 Redis 오류는 기존 전역 오류 형식을 유지한다.
- room 목록 endpoint는 추가하지 않는다.

Swagger JSON과 Web API 타입은 기존 생성 스크립트로 갱신한다.

### 5.5 개인정보와 노출 경계

- quick-play는 room 목록과 참가자 목록을 별도 검색 응답으로 제공하지 않는다.
- 매칭된 사용자는 기존 공개 room snapshot만 받는다.
- 내부 `sessionId`, `userId`, presence lease와 command receipt는 기존처럼 공개 snapshot에서
  제거한다.
- 닉네임은 현재 대기실 규칙과 동일하게 같은 room 참가자에게만 공개한다.
- 로그에는 session ID, token, cookie, idempotency key 원문을 추가하지 않는다.

## 6. Web 연결 계획

서버 Gate를 통과한 뒤 현재 비활성 공개 게임 버튼을 기존 서버 room adapter에 연결한다.

1. 공개 버튼에서도 기존 닉네임 정규화와 필수 검증을 재사용한다.
2. `RoomEntrySelection`과 `ServerRoomOptions`에 공개 quick-play 여부만 전달한다.
3. `server-room.ts`의 최초 open 요청이 일반 room create 대신 quick-play endpoint를 호출한다.
4. 성공 응답의 실제 room code를 URL과 기존 resume identity에 저장한다.
5. URL에 남은 quick-play/create 표시는 제거하고 `network=server&room=<code>` 형태로 교체한다.
6. 이후 party snapshot, 대기실, ready, 방장 시작, Socket snapshot과 leave는 기존 경로를 그대로
   사용한다.
7. 버튼 문구를 `빠른 참가 준비 중`에서 `빠른 참가`로 변경하고 요청 중 중복 클릭만 막는다.
8. 실패하면 입장 화면을 유지하고 기존 멀티플레이 접속 실패 문구를 표시한다.

비공개 form, 비밀번호 정규화와 room code 파생 코드는 변경하지 않는다.

## 7. 대상 파일

### 7.1 API와 Redis

| 파일                                                            | 변경 책임                                     |
| --------------------------------------------------------------- | --------------------------------------------- |
| `apps/api/src/poke-lounge/poke-lounge-room.types.ts`            | visibility 타입과 내부 생성 입력              |
| `apps/api/src/poke-lounge/poke-lounge-room-policy.ts`           | 기존 room의 private 정규화                    |
| `apps/api/src/poke-lounge/poke-lounge-room.repository.ts`       | 활성 room code 조회 계약                      |
| `apps/api/src/poke-lounge/redis-poke-lounge.repository.ts`      | 기존 Redis 인덱스 조회 연결                   |
| `apps/api/test/support/fake-poke-lounge-room.repository.ts`     | 서비스 단위 테스트용 조회 구현                |
| `apps/api/src/poke-lounge/poke-lounge-room.service.ts`          | quick-play 후보 선택, 재시도와 공개 room 생성 |
| `apps/api/src/poke-lounge/poke-lounge.controller.ts`            | quick-play route와 Swagger 계약               |
| `apps/api/src/poke-lounge/dto/poke-lounge-room-response.dto.ts` | visibility 응답 필드                          |
| `apps/api/src/poke-lounge/poke-lounge-room-command.ts`          | 필요 시 quick-play command hash namespace     |
| `apps/api/openapi.json`                                         | 생성된 API 계약                               |
| `apps/web/src/types/api.d.ts`                                   | 생성된 Web 타입                               |

### 7.2 Web

| 파일                                                                                   | 변경 책임                             |
| -------------------------------------------------------------------------------------- | ------------------------------------- |
| `apps/web/src/components/poke-lounge/poke-lounge-copy.ts`                              | 공개 버튼 문구                        |
| `apps/web/src/components/poke-lounge/runtime/game/ui/poke-lounge-runtime-screen.tsx`   | 공개 버튼 활성화와 닉네임 검증        |
| `apps/web/src/components/poke-lounge/runtime/game/network/room-entry-screen.ts`        | quick-play 선택 계약                  |
| `apps/web/src/components/poke-lounge/runtime/game/network/room-entry.ts`               | URL 진입값 파싱·정리                  |
| `apps/web/src/components/poke-lounge/runtime/game/network/multiplayer-room-factory.ts` | 서버 room option 전달                 |
| `apps/web/src/components/poke-lounge/runtime/game/network/server-room.ts`              | quick-play 최초 요청과 room code 반영 |
| `apps/web/src/components/poke-lounge/runtime/game/game-page-startup.ts`                | 선택값과 재접속 흐름 연결             |

실제 구현 중 기존 파일 안에서 해결할 수 있으면 새 helper나 새 파일을 만들지 않는다.

## 8. 단계별 작업과 Gate

### Phase 1. room 계약과 하위 호환

1. room state와 공개 DTO에 visibility를 추가한다.
2. 일반 생성은 private, 내부 공개 생성은 public으로 고정한다.
3. visibility 없는 Redis document를 private로 정규화한다.
4. OpenAPI와 생성 Web 타입을 갱신한다.

**Gate 1:** 기존 room fixture와 Redis document가 migration 없이 private room으로 읽히고, 신규
공개 room만 public snapshot을 반환해야 한다.

### Phase 2. Redis 후보 조회와 서버 매칭

1. repository에 bounded room code 조회를 추가한다.
2. quick-play 서비스의 기존 참가 복구, 후보 정렬, CAS 참가와 신규 생성 순서를 구현한다.
3. static quick-play route를 추가한다.
4. 기존 room commit publisher와 Socket 전파를 그대로 사용한다.

**Gate 2:** 비공개 room을 건너뛰고 공개 waiting room에 참가하며, 후보가 없을 때 공개 room을
하나만 생성해야 한다.

### Phase 3. API·Redis 경합 검증

1. 실제 Redis에서 동시 quick-play 요청을 실행한다.
2. 6명 상한, revision conflict 재시도와 idempotent replay를 검증한다.
3. room 시작·만료와 참가 요청이 겹칠 때 다른 후보 또는 신규 room으로 수렴하는지 확인한다.
4. API 재시작 뒤 room과 재접속 identity가 유지되는지 확인한다.

**Gate 3:** 중복 참가, 7번째 참가, private room 자동 참가와 무한 재시도가 없어야 한다.

### Phase 4. Web 공개 버튼 연결

1. 공개 게임 버튼을 활성화한다.
2. quick-play 요청과 URL·resume 갱신을 연결한다.
3. 비공개 게임과 솔로 진입 회귀를 확인한다.

**Gate 4:** 두 개의 격리 브라우저가 비밀번호 없이 같은 공개 대기실에 들어가고, 새로고침 뒤에도
같은 room으로 복구해야 한다.

### Phase 5. 운영 인수

1. API를 먼저 배포하고 Redis/API health를 확인한다.
2. quick-play endpoint의 공개 room 생성·참가를 확인한다.
3. Web을 배포하고 2인 공개 게임 한 사이클을 수행한다.
4. room 종료 뒤 TTL 정리와 새 공개 게임 생성을 확인한다.

**Gate 5:** 예상하지 않은 4xx·5xx, page error, 수동 Redis 수정과 브라우저 reload 없이 공개
게임 한 사이클이 완료되어야 한다.

## 9. 검증 계획

### 9.1 API 단위 테스트

- 일반 create와 임시 비밀번호 room은 private다.
- quick-play 신규 room은 public이다.
- visibility 없는 legacy room은 private로 정규화된다.
- 공개 waiting room을 생성 시각 순으로 선택한다.
- private, full, started, completed와 expired room은 신규 후보에서 제외한다.
- 동일 session의 기존 공개 참가를 신규 후보보다 먼저 복구한다.
- revision conflict와 room full에서 다음 후보를 시도한다.
- 후보가 없을 때 공개 room을 생성한다.
- 같은 idempotency key replay가 참가자를 중복 추가하지 않는다.

### 9.2 Redis·HTTP 통합 테스트

- quick-play HTTP 요청이 Redis document에 public visibility를 저장한다.
- 동시 7개 요청에서 한 room의 참가자는 최대 6명이며 나머지는 다른 room으로 수렴한다.
- quick-play 요청과 방장 start가 겹쳐도 시작된 room에 신규 참가자가 추가되지 않는다.
- room commit 뒤 두 Socket client가 같은 revision과 참가자 목록을 받는다.
- API 재시작 뒤 기존 공개 room 참가와 session 재접속이 동작한다.
- waiting TTL 만료 뒤 room code가 후보와 Redis 인덱스에서 제거된다.

### 9.3 Web 단위·브라우저 테스트

- 닉네임이 없으면 quick-play 요청을 보내지 않는다.
- 공개 버튼 연타는 최초 요청 하나만 보낸다.
- 성공 뒤 URL이 실제 server room code로 교체된다.
- 실패 뒤 입장 화면과 재시도 가능한 상태가 유지된다.
- 비공개 비밀번호가 같은 두 브라우저의 기존 create-or-join은 유지된다.
- 공개 사용자 두 명이 같은 대기실에 입장해 ready와 방장 시작을 완료한다.

### 9.4 실행 명령

구현 단계별로 좁은 테스트를 먼저 실행하고 마지막 Gate에서 전체 관련 검증을 실행한다.

```bash
pnpm --filter @poke-lounge/api test -- poke-lounge-room.service.spec.ts
pnpm --filter @poke-lounge/api test -- redis-poke-lounge.repository.spec.ts
pnpm test:api:e2e -- poke-lounge-room.e2e-spec.ts
pnpm test:web
pnpm generate:types
pnpm check:api-contract
pnpm --filter @poke-lounge/api lint
pnpm lint:web
pnpm type:check:web
```

브라우저 Gate는 격리 Redis와 실제 API를 사용하는 Poke Lounge browser playtest로 공개 참가,
재접속과 한 사이클을 확인한다.

## 10. 완료 조건

- [x] Redis room state와 공개 API 계약에 visibility가 반영된다.
- [x] 기존 room과 비공개 게임은 자동으로 private 취급된다.
- [x] quick-play가 공개 waiting room 참가 또는 공개 room 생성으로 한 번에 수렴한다.
- [ ] 동시 요청에서도 room당 최대 6명과 idempotent replay가 유지된다.
- [x] 별도 DB, migration, queue와 공개 room 목록 endpoint가 추가되지 않는다.
- [x] 공개 매칭 이후 기존 lobby, ready, start, Socket과 resume 흐름을 재사용한다.
- [ ] API 단위·Redis 통합·Web 단위·2브라우저 공개 게임 검증이 통과한다.
- [x] 비공개 게임과 솔로 플레이 관련 회귀 테스트가 통과한다.

## 11. 후속 확장 기준

다음 조건 중 하나가 실제로 발생할 때만 구조를 확장한다.

| 발생 조건                                             | 후속 검토                          |
| ----------------------------------------------------- | ---------------------------------- |
| 활성 room 상한을 크게 늘려 전체 후보 조회가 병목이 됨 | 공개 waiting 전용 Redis Sorted Set |
| 지역 또는 실력별 매칭 요구가 확정됨                   | 명시적 queue key와 매칭 정책       |
| 전적, 신고, 제재 또는 운영 감사가 필요함              | PostgreSQL 영속 모델               |
| 다중 리전에서 동일 queue를 운영함                     | 리전 분리와 cross-region 정책      |
| quick-play 지연 또는 충돌률이 목표를 넘음             | 계측 후 전용 원자 매칭 script 검토 |

초기 구현은 현재 최대 20개 활성 room과 room당 6명이라는 실제 경계 안에서 기존 Redis 인덱스와
CAS를 재사용하는 것으로 끝낸다.
