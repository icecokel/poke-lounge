# Poke Lounge 방장·준비 기반 멀티플레이 대기실 작업 계획

> 작성일: 2026-08-20
>
> 구현 기준: `main`
> 상태: Phase 4 회귀 검증 완료, Phase 5 커밋·push 전

이 문서는 Poke Lounge 공개 멀티플레이를 자동 시작 방식에서 방장·플레이어 준비·방장 수동
시작 방식으로 전환하기 위한 구현 계획이다. 제품 규칙의 현재 원본은
[Poke Lounge 게임 규칙 인덱스](../../poke-lounge-rules/index.md)와 연결 문서이며, Phase 1에서
이 계획의 확정 내용을 규칙 문서에 반영했다.

## 1. 목표

공개 멀티플레이 참가자 전원이 방장이 게임을 시작한 시점을 기준으로 동일한 5분의 1라운드
준비 시간을 받게 한다.

```text
닉네임 + 임시 비밀번호 입력
→ 대기실 입장
→ 플레이어별 준비
→ 방장 시작
→ 모든 참가자에게 같은 시각부터 5분 준비 제공
→ 1라운드 토너먼트
→ 2·3라운드는 기존 규칙대로 자동 진행
```

완료된 사용자 경험은 다음 조건을 만족해야 한다.

- 먼저 들어온 사용자가 혼자 기다리는 동안 준비 타이머가 흐르지 않는다.
- 두 번째나 세 번째 사용자가 늦게 들어와도 방장 시작 후 동일한 5분을 받는다.
- 2~6명의 참가자가 모두 준비해야 방장이 시작할 수 있다.
- 시작 이후에는 신규 참가자가 진행 중인 세션에 합류하지 못한다.
- 기존 참가자의 새로고침과 15초 이내 재접속은 유지한다.
- 방장이 대기실에서 나가면 남은 참가자 중 최초 입장자가 방장이 된다.
- 방 코드, 방 생성·참가 선택과 경쟁 설정은 공개 화면에 추가하지 않는다.

## 2. 현재 문제와 변경 이유

Phase 2 시작 전 Web `serverRoom.ts`의 초기 workflow는 다음 순서로 실행됐다.

```text
open
→ party snapshot
→ ready=true
→ complete
```

API `PokeLoungeRoomService`는 연결이 승인된 참가자가 2명 이상이고 모두 ready가 되면
`startRoundWhenReady()`를 호출해 즉시 `round-started`로 전환했다. 준비 중 새 참가자도 기존
종료 시각을 연장하지 않고 합류할 수 있었다.

이 구조에서는 A의 준비가 시작된 뒤 B가 2분 후 들어오면 B가 2분 적은 준비 시간을 받는다.
세 번째 참가자도 기존 종료 시각만 공유하므로 같은 문제가 반복된다.

Phase 1 시작 전 규칙 문서도 자동 ready와 자동 준비 시작을 명시했다. Phase 1에서
방장·수동 준비·수동 시작 계약과 테스트 시나리오를 먼저 갱신했다.

## 3. 확정 범위

### 3.1 대기실

- 기존 room 상태 `waiting`을 대기실 상태로 재사용한다.
- 새 `lobby` 상태, 새 DB 테이블과 새 런타임 의존성은 추가하지 않는다.
- 임시 비밀번호가 같은 사용자는 지금처럼 같은 room을 자동 생성하거나 자동 참가한다.
- 대기실은 월드 위의 DOM overlay로 표시한다.
- 대기실이 열려 있는 동안 월드 이동, NPC 상호작용, 야생 조우와 모바일 방향 입력을 막는다.
- 명시적 방 나가기는 기존 흐름을 유지한다.

### 3.2 방장

- 최초 입장자가 방장이다.
- 서버가 참가자를 `joinedAtMs`, `playerId` 순서로 정렬해 방장을 계산한다.
- 방장 ID는 room JSONB에 별도로 저장하지 않는다.
- 공개 room snapshot에 계산된 `hostPlayerId`를 포함한다.
- 방장이 명시적으로 나가거나 재접속 유예 만료로 제거되면 다음 참가자가 자동 승계한다.
- Socket이 일시적으로 끊긴 15초 유예 동안에는 기존 방장을 유지한다.

### 3.3 준비

- `ready`는 `waiting`에서만 사용자가 직접 변경한다.
- 각 참가자는 준비와 준비 취소를 할 수 있다.
- `ready=true`는 유효한 party snapshot이 서버에 반영된 뒤에만 허용한다.
- ready 변경만으로 room 상태를 전환하지 않는다.
- 대기실에서 파티가 변경돼도 ready를 자동 해제하지 않는다. ready는 참가 의사이며, 실제 파티는
  기존 규칙대로 준비 5분 종료 시점의 최신 snapshot을 동결한다.

### 3.4 방장 시작

방장 시작 요청은 서버에서 다음 조건을 모두 검증한다.

1. room과 round가 모두 `waiting`이다.
2. 요청자의 `playerId + sessionId`가 현재 방장과 일치한다.
3. 참가자는 2~6명이다.
4. room에 남아 있는 모든 참가자가 연결되어 있다.
5. 재접속 유예 중인 참가자가 없다.
6. 모든 참가자가 `ready=true`다.
7. 모든 참가자에게 유효한 party snapshot이 있다.

성공하면 서버 현재 시각을 기준으로 한 번만 다음 상태를 확정한다.

```text
status = round-started
round.phase = round-started
round.startedAtMs = serverNowMs
round.endsAtMs = serverNowMs + 300,000ms
```

시작 요청은 기존 room mutation과 동일하게 revision과 idempotency key를 사용한다. 더블 클릭,
네트워크 재시도와 동시 요청이 준비 시각을 다시 설정하면 안 된다.

### 3.5 시작 이후 참가

- 신규 참가자는 `waiting`에서만 허용한다.
- `round-started`, `tournament`, `completed`에는 신규 사용자를 받지 않는다.
- 기존 identity의 재접속은 `waiting`, `round-started`, `tournament`에서 허용한다.
- 1라운드 준비 중 참가자가 나가도 2명 이상이면 남은 참가자로 계속 진행한다.
- 2명 미만이 되면 대진을 만들지 않고 `waiting`으로 돌아간다.
- `waiting`으로 돌아간 뒤 새 참가자를 받을 수 있으며, 방장이 다시 시작해야 새 5분이 열린다.

### 3.6 2·3라운드

- 정상 흐름의 방장 수동 시작과 ready는 1라운드 시작 전에만 적용한다.
- 1·2라운드 토너먼트가 끝나고 참가자가 2명 이상이면 다음 라운드의 5분 준비를 자동 시작한다.
- 준비가 참가자 부족으로 취소돼 `waiting`으로 돌아온 예외에서는 현재 라운드도 전원 ready와
  방장 시작으로 새 5분을 시작한다.
- 기존 서버 권위 대진, frozen party, terminal HP 점수와 3라운드 누적 순위는 변경하지 않는다.

## 4. 상태 전이

| 현재 상태       | 입력·사건               | 조건                              | 다음 상태       |
| --------------- | ----------------------- | --------------------------------- | --------------- |
| `waiting`       | 신규 참가               | 전체 인원 6명 미만                | `waiting`       |
| `waiting`       | ready/ready 취소        | 본인 identity와 파티 유효         | `waiting`       |
| `waiting`       | 방장 시작               | 2~6명, 전원 연결·ready·파티 유효  | `round-started` |
| `waiting`       | 방장 나가기             | 남은 참가자 존재                  | `waiting`       |
| `round-started` | 신규 참가               | 항상                              | 거부            |
| `round-started` | 기존 identity 재접속    | 기존 참가자                       | `round-started` |
| `round-started` | 이탈 후 참가자 2명 미만 | 재접속 유예 만료 또는 명시적 이탈 | `waiting`       |
| `round-started` | 준비 5분 종료           | 참가자와 frozen party 유효        | `tournament`    |
| `tournament`    | 1·2라운드 토너먼트 완료 | 참가자 2명 이상                   | `round-started` |
| `tournament`    | 3라운드 토너먼트 완료   | 최종 점수 확정                    | `completed`     |

## 5. API 변경 계획

### 5.1 공개 room 계약

`PokeLoungePublicRoomState`에 아래 필드를 추가한다.

```ts
hostPlayerId: string | null;
```

`hostPlayerId`는 공개 snapshot 변환 시 참가자 목록으로 계산한다. 내부 room state에 저장하지
않으므로 entity와 migration은 변경하지 않는다.

### 5.2 시작 endpoint

```http
POST /poke-lounge/rooms/:roomCode/start
X-Idempotency-Key: <uuid>
If-Match-Revision: <revision>
```

```json
{
  "playerId": "player-1",
  "sessionId": "private-session-id"
}
```

추가 항목:

- `StartPokeLoungeRoomDto`
- `StartPokeLoungeRoomInput`
- room command operation `start`
- `PokeLoungeRoomService.startRoom()`
- controller의 `/start` route
- Swagger response와 생성 Web 타입

### 5.3 기존 mutation 변경

- `setReady()`에서 `startRoundWhenReady()` 호출을 제거한다.
- Socket presence 승인에서 `startRoundWhenReady()` 호출을 제거한다.
- `setReady()`는 `waiting` 상태와 본인 identity를 검증한다.
- `ready=true` 전에 해당 참가자의 party snapshot을 검증한다.
- `assertRoomJoinable()`은 신규 참가자에 대해 `waiting`만 허용한다.
- 기존 참가자의 재접속 허용 상태는 유지한다.

### 5.4 API 대상 파일

| 파일                                                            | 변경 책임                                  |
| --------------------------------------------------------------- | ------------------------------------------ |
| `apps/api/src/poke-lounge/poke-lounge-room.types.ts`            | 시작 입력과 공개 방장 계약                 |
| `apps/api/src/poke-lounge/poke-lounge-room-command.ts`          | `start` operation과 request hash           |
| `apps/api/src/poke-lounge/poke-lounge-room-policy.ts`           | 결정론적 방장 계산 helper                  |
| `apps/api/src/poke-lounge/poke-lounge-room-conflict.ts`         | 공개 snapshot의 `hostPlayerId` 구성        |
| `apps/api/src/poke-lounge/poke-lounge-room.service.ts`          | 자동 시작 제거, ready 제한, 방장 시작 검증 |
| `apps/api/src/poke-lounge/poke-lounge.controller.ts`            | `/start` 전송 계층                         |
| `apps/api/src/poke-lounge/dto/start-poke-lounge-room.dto.ts`    | 시작 요청 validation과 Swagger 입력        |
| `apps/api/src/poke-lounge/dto/poke-lounge-room-response.dto.ts` | 공개 방장 응답 문서화                      |
| `apps/api/openapi.json`                                         | 생성 계약                                  |
| `apps/web/src/types/api.d.ts`                                   | 생성 Web 타입                              |

## 6. Web 네트워크 변경 계획

### 6.1 초기 workflow

`serverRoom.ts` 초기 workflow를 다음과 같이 줄인다.

```text
기존: open → competitive-seat → party → ready → complete
변경: open → competitive-seat → party → complete
```

공개 비로그인 흐름에서는 기존처럼 competitive seat 단계를 건너뛴다. 자동 ready 전송과 해당
retry/idempotency 상태는 제거한다.

### 6.2 수동 room 명령

대기실 버튼이 요청 결과를 처리할 수 있도록 `MultiplayerRoom`에 서버 room용 비동기 명령을
제공한다.

```ts
setLobbyReady(ready: boolean): Promise<void>;
startChampionship(): Promise<void>;
```

- mutation은 기존 Web mutation queue, revision과 conflict snapshot 복구를 재사용한다.
- 요청 중 같은 버튼을 비활성화한다.
- 실패 시 대기실을 닫지 않고 최신 snapshot과 인라인 오류를 표시한다.
- 별도 Socket event나 polling을 추가하지 않는다.

### 6.3 대기실 projection

기존 `TOURNAMENT_STATE` payload에 다음 대기실 표시값을 포함한다.

- `hostPlayerId`
- 참가자별 `partyReady`
- 기존 `ready`, `connected`, `displayName`, `ownPlayerId`

`partyReady`는 공개 room의 `partySnapshots` 존재 여부로 Web transport가 계산한다. 서버에 동일한
파생 필드를 중복 저장하지 않는다.

## 7. 대기실 UI 계획

### 7.1 구성

`#game-root` 안에 semantic DOM으로 대기실 overlay를 만든다.

- 제목: `멀티플레이 대기실`
- 참가 인원: `현재 인원/6`
- 참가자 목록
  - 닉네임
  - 방장 배지
  - 준비 완료/준비 전
  - 연결됨/재연결 중
  - 파티 동기화 중
- 내 준비/준비 취소 버튼
- 방장 시작 버튼
- 비방장 대기 안내
- 시작할 수 없는 이유와 mutation 오류

방장이 아닌 사용자는 시작 요청을 보낼 수 없다. 방장 버튼도 아래 조건을 모두 만족할 때만
활성화한다.

- 참가자 2명 이상
- 모든 참가자 연결 완료
- 모든 참가자 party snapshot 완료
- 모든 참가자 ready
- 진행 중인 ready/start mutation 없음

클라이언트의 버튼 조건은 사용자 안내용이며 최종 권한 검증은 항상 API가 수행한다.

### 7.2 월드 입력 잠금

대기실이 열려 있으면 `WorldScene.update()`에서 다음 입력 전에 조기 반환한다.

- 키보드와 모바일 이동
- NPC, 상점, PC와 주사위 상호작용
- 야생 조우
- 월드 위치 전송

플레이어 velocity는 0으로 유지한다. `round-started` snapshot을 받으면 대기실을 제거하고 입력을
활성화한다.

### 7.3 화면 경계와 접근성

- overlay와 panel은 `.gameFrame`, `#game-root` 경계를 기준으로 배치한다.
- 참가자 목록만 제한 높이와 `overflow-y: auto`를 사용한다.
- 준비·시작·나가기 조작은 항상 프레임 안에 둔다.
- 모바일은 단일 열로 전환하고 버튼의 최소 터치 높이를 44px로 유지한다.
- Desktop 1440×900과 Mobile 390×844에서 가로 overflow가 없어야 한다.
- 참가자 6명의 마지막 행까지 내부 스크롤과 키보드로 접근할 수 있어야 한다.
- 버튼에 `disabled`, 상태 문구에 `aria-live`, 목록에 의미 있는 label을 제공한다.
- 문구는 기존 Poke Lounge locale copy 구조에서 한국어·영어·일본어를 관리한다.

### 7.4 사용자에게 보이는 방 코드 제거

대기실은 내부 `roomCode`를 표시하지 않는다. 현재 토너먼트 안내와 결과 제목의
`방 ${roomCode}` 문구도 제거한다. roomCode는 임시 비밀번호에서 파생된 내부 session key로만
사용한다.

### 7.5 Web 대상 파일

| 파일                                                                                | 변경 책임                                     |
| ----------------------------------------------------------------------------------- | --------------------------------------------- |
| `apps/web/src/components/poke-lounge/runtime/game/network/localPreviewRoom.ts`      | room 명령 interface                           |
| `apps/web/src/components/poke-lounge/runtime/game/network/serverRoom.ts`            | 자동 ready 제거, ready/start 요청, projection |
| `apps/web/src/components/poke-lounge/runtime/game/network/tournament-projection.ts` | host와 party ready 표시 계약                  |
| `apps/web/src/components/poke-lounge/runtime/game/ui/room-lobby-screen.ts`          | 대기실 DOM 생성·갱신·정리                     |
| `apps/web/src/components/poke-lounge/runtime/game/scenes/WorldScene.ts`             | 대기실 lifecycle과 월드 입력 잠금             |
| `apps/web/src/components/poke-lounge/runtime/game/scenes/world-scene-tournament.ts` | 내부 roomCode 문구 제거                       |
| `apps/web/src/components/poke-lounge/poke-lounge-copy.ts`                           | 대기실 locale 문구                            |
| `apps/web/src/components/poke-lounge/poke-lounge.module.css`                        | frame 내부 반응형 대기실 스타일               |

## 8. 사용자 시나리오

### 8.1 두 번째 사용자가 2분 후 참가

```text
A 입장
→ 대기실, 준비 타이머 없음
→ 2분 경과
B 입장
→ 대기실, 준비 타이머 없음
A와 B 준비
→ 방장 A 시작
→ A와 B가 같은 startedAtMs, endsAtMs 수신
```

### 8.2 세 번째 사용자가 시작 전 참가

- C를 대기실 참가자에 추가한다.
- C도 ready와 party snapshot 시작 조건에 포함한다.
- C가 준비 전이면 A와 B가 준비했어도 시작할 수 없다.
- 방장 시작 후 A, B, C가 같은 5분을 받는다.

### 8.3 세 번째 사용자가 시작 후 참가

- 신규 C의 join 요청을 거부한다.
- C를 관전자나 다음 라운드 대기자로 전환하지 않는다.
- 기존 A와 B의 대진과 종료 시각을 바꾸지 않는다.

### 8.4 방장 연결 끊김

- 15초 유예 중에는 기존 방장을 유지하고 시작을 막는다.
- 같은 identity가 유예 안에 돌아오면 기존 ready와 방장 상태를 복구한다.
- 유예가 끝나 참가자가 제거되면 다음 최초 입장자가 방장이 된다.

### 8.5 준비 중 참가자 이탈

- 3명 중 1명이 나가고 2명이 남으면 기존 종료 시각으로 계속한다.
- 2명 중 1명이 나가면 준비를 취소하고 `waiting`으로 돌아간다.
- 새 사용자가 들어온 뒤 전원 ready와 방장 시작을 다시 거쳐 새로운 5분을 시작한다.

## 9. 문서 변경 계획

Phase 1에서 다음 현재 기준 문서를 갱신했다.

| 문서                                                 | 변경 내용                                              |
| ---------------------------------------------------- | ------------------------------------------------------ |
| `docs/poke-lounge-rules/index.md`                    | 전체 진행에 대기실·ready·방장 시작 추가                |
| `docs/poke-lounge-rules/multiplayer-rules.md`        | 자동 시작 제거, 방장·승계·참가 잠금 정의               |
| `docs/poke-lounge-rules/three-round-championship.md` | 1라운드 수동 시작, 2·3라운드 자동 준비 정의            |
| `docs/poke-lounge-game-concept.md`                   | 공개 플레이 흐름과 현재 구현 경계 갱신                 |
| `docs/poke-lounge-multiplayer-test-scenarios.md`     | ready·방장을 제외 범위에서 제거하고 인수 시나리오 추가 |

규칙 문서가 갱신되기 전에는 코드 구현을 시작하지 않는다. 과거 계획인 이 문서를 런타임 정책
원본으로 사용하지 않는다.

## 10. 테스트 계획

### 10.1 API 단위 테스트

- 두 참가자가 ready여도 자동 시작하지 않는다.
- 방장 시작 요청만 `round-started`로 전환한다.
- 비방장 시작 요청을 거부한다.
- 참가자 1명, ready 누락, party 누락과 pending presence에서 시작을 거부한다.
- 시작 이후 신규 참가자를 거부한다.
- 시작 이후 기존 identity 재접속을 허용한다.
- 방장 이탈 후 `hostPlayerId`를 결정론적으로 승계한다.
- 동일 `joinedAtMs`에서는 `playerId`로 방장을 결정한다.
- 중복 시작 요청은 같은 결과를 재생하고 준비 시각을 바꾸지 않는다.
- 서버 시작 결과의 `endsAtMs - startedAtMs`가 운영에서 정확히 300,000ms다.

### 10.2 API 통합·E2E 테스트

- PostgreSQL transaction에서 start mutation, command receipt와 room revision을 함께 commit한다.
- 동시에 들어온 ready/start 요청의 revision conflict snapshot이 최신 상태와 일치한다.
- Socket committed snapshot의 `hostPlayerId`, ready와 round 종료 시각이 REST와 일치한다.
- presence 유예 만료와 시작 요청 경쟁에서 ghost 참가자 대진을 만들지 않는다.

### 10.3 Web 단위 테스트

- 초기 workflow가 `/ready`를 호출하지 않는다.
- 준비 버튼이 `/ready`를 한 번 호출하고 committed snapshot을 반영한다.
- 방장 시작 버튼이 `/start`를 한 번 호출한다.
- 비방장과 시작 조건 미충족 상태에서 시작 요청을 보내지 않는다.
- conflict 뒤 최신 host/ready snapshot으로 수렴한다.
- host ID의 server/local player ID mapping이 일치한다.
- 대기실 열림과 닫힘에 따라 월드 입력 잠금이 전환된다.
- 내부 roomCode가 대기실·토너먼트 문구에 포함되지 않는다.

### 10.4 Playwright 인수 테스트

1. A가 입장한 뒤 시간이 지나도 1라운드 타이머가 시작되지 않는다.
2. B가 늦게 입장해도 타이머가 시작되지 않는다.
3. 한 명만 ready이면 시작 버튼이 비활성화된다.
4. 전원 ready 뒤 방장에게만 시작 권한이 생긴다.
5. 방장 시작 뒤 두 브라우저의 서버 종료 시각이 같다.
6. C가 시작 전에 들어오면 시작 조건에 포함된다.
7. C가 시작 뒤 신규 참가하면 거부된다.
8. 방장 이탈 후 다음 참가자에게 방장 표시와 권한이 이동한다.
9. 방장 Socket disconnect 유예 중 시작이 막히고 재접속 시 복구된다.
10. 6명 목록과 필수 버튼이 Desktop과 Mobile game frame 안에 남는다.
11. 1·2라운드 뒤 다음 5분 준비는 자동 시작된다.
12. 3라운드 최종 순위와 공동 우승 규칙이 기존과 동일하다.

## 11. 구현 순서

### Task 1. 규칙 문서 확정

- [x] 게임 규칙 인덱스의 전체 흐름을 대기실 기준으로 수정한다.
- [x] 멀티플레이 규칙에 방장, ready, 시작, 승계와 참가 잠금을 정의한다.
- [x] 3라운드 문서에 1라운드 수동 시작과 2·3라운드 자동 진행을 구분한다.
- [x] 테스트 시나리오의 제외 범위와 P0 기준을 갱신한다.

### Task 2. API RED 테스트

- [x] ready가 자동 시작하지 않는 실패 테스트를 작성한다.
- [x] 방장·시작 조건·승계·참가 잠금 테스트를 작성한다.
- [x] controller, DTO와 command hash 계약 테스트를 작성한다.

### Task 3. API 구현과 계약 생성

- [x] 결정론적 방장 계산을 추가한다.
- [x] 자동 시작 호출을 제거하고 ready 검증을 제한한다.
- [x] `/start` mutation을 추가한다.
- [x] 시작 이후 신규 join을 잠근다.
- [x] OpenAPI와 Web 생성 타입을 갱신한다.

### Task 4. Web 네트워크 구현

- [x] 초기 자동 ready workflow를 제거한다.
- [x] 수동 ready/start 명령을 기존 mutation queue에 연결한다.
- [x] `hostPlayerId`와 `partyReady`를 tournament projection에 반영한다.
- [x] revision conflict와 요청 실패를 대기실 상태로 복구한다.

### Task 5. 대기실 UI 구현

- [x] 기존 DOM screen 패턴으로 대기실을 만든다.
- [x] 참가자·방장·ready·연결·파티 상태를 표시한다.
- [x] 준비와 방장 시작 버튼을 연결한다.
- [x] 대기실에서 WorldScene 입력을 잠근다.
- [x] frame 내부 Desktop/Mobile CSS와 접근성을 적용한다.
- [x] 사용자 문구에서 내부 roomCode를 제거한다.

### Task 6. 회귀 테스트와 검증

- [x] API 단위·통합·E2E를 실행한다.
- [x] Web unit과 멀티플레이 Playwright를 실행한다.
- [x] Desktop/Mobile frame 경계를 검증한다.
- [x] API 계약, lint, type check와 build를 실행한다.
- [x] 공개 임시 비밀번호를 입력하는 Desktop·Mobile 2개 context에서 수동 시작과 동일한 5분을 검증한다.

이 Phase의 실제 브라우저 완료 범위는 공개 입력 기반 2인 대기실 시작까지다. 실제 2인
3라운드 완주와 7개 context 정원 검증은
`docs/poke-lounge-multiplayer-test-scenarios.md`의 확장 인수 공백으로 유지한다.

### Task 7. 커밋과 push

예상 커밋 경계:

1. `docs:멀티플레이 대기실 규칙 정의`
2. `feat(poke-lounge):방장 시작 대기실 추가`
3. `test(poke-lounge):대기실 시나리오 보강`

전체 검증이 통과한 뒤 사용자 지시에 따라 원격에 push한다.

## 12. 검증 명령

변경 범위에 맞춰 저장소 루트에서 실행한다.

```bash
pnpm generate:types
pnpm check:api-contract
pnpm test:api
pnpm test:web
pnpm test:api:e2e
pnpm lint
pnpm type:check:web
pnpm build
```

실제 PostgreSQL과 서로 다른 sessionStorage를 가진 두 개 이상의 브라우저 context에서 공개
입력 기반 멀티플레이 시나리오를 추가로 확인한다.

## 13. 비목표

- 사용자에게 보이는 방 코드와 방 목록
- 수동 방 생성·참가 선택
- 초대 링크, 친구 목록, matchmaking과 대기열
- 방장 강퇴, 방 설정과 준비 시간 선택
- 관전자 모드
- 라운드마다 다시 ready하는 기능
- 세션 완료 후 같은 room에서 재경기
- 여러 API 인스턴스 사이의 Socket fan-out
- 서버 권위 포획·성장 ledger와 공개 랭킹 재활성화

## 14. 완료 기준

- [x] 입장과 party sync만으로 준비 시간이 시작되지 않는다.
- [x] 모든 참가자가 직접 ready를 변경할 수 있다.
- [x] 방장만 시작할 수 있고 API가 권한을 검증한다.
- [x] 시작 시 모든 참가자의 `startedAtMs`, `endsAtMs`가 같다.
- [x] 시작 후 신규 참가자는 거부되고 기존 참가자 재접속은 허용된다.
- [x] 방장 이탈과 15초 reconnect 유예가 ghost 참가자 없이 수렴한다.
- [x] 2·3라운드 자동 준비와 3라운드 점수 규칙이 유지된다.
- [x] 내부 roomCode가 사용자 화면에 노출되지 않는다.
- [x] 6명 대기실이 Desktop과 Mobile game frame 안에서 완전히 조작 가능하다.
- [x] 규칙 문서, API DTO, OpenAPI, Web 생성 타입과 런타임이 일치한다.
- [x] 관련 API·Web·Playwright 테스트와 필수 정적 검사가 통과한다.
