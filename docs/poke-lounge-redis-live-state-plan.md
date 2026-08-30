# Poke Lounge Redis 실시간 상태 개선 작업 계획

> 이 문서는 위치 상태만 Redis로 옮기던 과거 계획이다. 현재 구현은 방, 경쟁전, 명령 영수증,
> 로그인 진행 상태까지 Redis TTL을 단일 런타임 저장소로 사용하며
> [Poke Lounge Game Concept](./poke-lounge-game-concept.md)을 기준으로 한다.

확인 기준일: 2026-08-24
상태: 코드 구현·격리 5인 한 사이클·운영 배포 health 검증 완료

## 1. 목적

운영 멀티플레이에서 위치 이벤트나 room snapshot이 유실됐을 때 일부 브라우저가 오래된 상태를
유지하는 문제를 해결한다. PostgreSQL의 영속 상태와 서버 권위 경쟁전은 유지하고, Redis는 게임
종료 전 shared world의 최신 상태와 Socket.IO fan-out에만 사용한다.

이 문서는 [Poke Lounge Game Concept](./poke-lounge-game-concept.md)에 반영된 Redis 실시간 상태
구현의 결정과 운영 검증 기준을 기록한다. 운영 한 사이클은
[플레이어 E2E 테스트 시나리오](./poke-lounge-multiplayer-test-scenarios.md)를 따른다.

## 2. 현재 문제

현재 PostgreSQL room mutation과 경쟁전 action은 transaction, row lock과 revision으로
직렬화된다. 문제는 저장 이후의 실시간 전달 경로에 있다.

- 플레이어 위치는 room aggregate에 포함되지 않고 Socket.IO 이벤트로만 중계된다.
- 위치 이벤트에는 서버 순번, 수신 확인과 최신 snapshot 재조회 기준이 없다.
- committed room snapshot 발행은 API 프로세스 내부 listener를 거치므로 유실 자체가 durable하게
  재생되지 않는다.
- Web 복구는 Socket disconnect나 명시적인 subscription 실패를 중심으로 동작한다. 연결된 Socket에서
  이벤트 하나만 유실되면 최신 상태와 다시 수렴하지 못할 수 있다.
- REST room snapshot으로 참가자를 다시 만들 때 서버 위치가 없어서 고정 시작 좌표를 사용한다.

따라서 PostgreSQL 저장 구조를 교체하지 않고, 실시간 상태의 서버 기준점과 누락 복구 경로를
추가한다.

## 3. 결정 사항

### 3.1 상태별 기준 저장소

| 상태                                  | 기준 저장소    | 설명                                         |
| ------------------------------------- | -------------- | -------------------------------------------- |
| 방 참가자, ready, round, 대진         | PostgreSQL     | 기존 room revision과 command receipt 유지    |
| 경쟁전 turn, HP, terminal, 점수, 우승 | PostgreSQL     | 기존 서버 권위 transaction 유지              |
| 플레이어 map, 좌표, 방향              | Redis          | 방이 살아 있는 동안의 최신 shared world 상태 |
| Socket.IO 인스턴스 간 fan-out         | Redis Pub/Sub  | Socket.IO Redis Adapter 사용                 |
| 개인 파티, 재화, UI 진행              | 기존 저장 경로 | 이 작업에서 변경하지 않음                    |

Redis를 경쟁전 결과의 source of truth로 사용하지 않는다. 이동마다 PostgreSQL을 갱신하거나 Redis
데이터를 영구 이력으로 보관하지 않는다.

### 3.2 통신 방식

Socket.IO를 유지한다. SSE와 WebRTC 전환은 이 문제의 해결 범위가 아니다.

```text
Web local movement
-> Socket.IO room.player-event
-> API validation
-> Redis latest world state + worldSeq
-> Socket.IO Redis Adapter
-> same-room browsers
```

ready, start와 경쟁전 action은 기존 REST와 PostgreSQL transaction을 사용하고, 결과 snapshot만
Socket.IO로 전파한다.

## 4. Redis 상태 모델

방마다 하나의 Hash를 사용한다.

```text
key: poke-lounge:room:{roomCode}:world

_epoch    -> Redis key 재생성 세대 UUID
_seq      -> 방 전체 worldSeq
{playerId} -> { map, x, y, facing, updatedAtMs }
```

이동을 승인할 때 다음 연산을 하나의 Redis Lua script로 처리한다.

1. `_seq`를 `HINCRBY`로 증가한다.
2. 해당 플레이어의 최신 위치를 `HSET`한다.
3. 방 TTL을 갱신한다.
4. 증가한 `worldSeq`를 포함해 이벤트를 전파한다.

정상 종료 시 key를 삭제한다. 명시적 종료가 누락돼도 제거되도록 room 만료 시간과 재접속 유예를
포함한 TTL을 둔다. TTL의 구체적인 값은 기존 room expiry 정책에서 계산하며 별도 고정 시간을
중복 정의하지 않는다. API 인스턴스 간 room 만료·종료 메타데이터도 Redis Adapter의
server-side event로 전파하며, live-state TTL은 기존 active room lease보다 짧아지지 않는다.

## 5. Socket 이벤트 계약

기존 `room.player-event` 이름은 유지하고 서버 응답에 `worldSeq`를 추가한다. 배포 중 Web/API 버전
차이를 허용하기 위해 한 릴리스 동안 순번 없는 기존 payload도 파싱하되, Redis 경로 활성화 뒤에는
순번 있는 이벤트만 최신 상태로 채택한다.

추가 이벤트:

| 이벤트                | 방향                | 용도                                                     |
| --------------------- | ------------------- | -------------------------------------------------------- |
| `room.player-event`   | Web → API → 방 전체 | 검증된 위치와 `worldSeq` 전파                            |
| `room.world-snapshot` | API → Web           | 현재 `_seq`와 방 전체 위치 반환                          |
| `room.world-resync`   | Web → API           | 순번 누락 시 전체 snapshot 요청                          |
| `room.world-cursor`   | API → Web           | 조용히 유실된 마지막 이벤트 감지를 위한 최신 `_seq` 알림 |

서버는 sender를 포함한 방 전체에 순번 이벤트를 보낸다. sender는 자신의 위치를 다시 렌더링하지
않고 cursor만 전진시킨다.

Web 적용 규칙:

1. `worldSeq <= lastWorldSeq` 이벤트는 무시한다.
2. `worldSeq === lastWorldSeq + 1`이면 적용한다.
3. `worldSeq > lastWorldSeq + 1`이면 이벤트를 임시 적용하지 않고 `room.world-resync`를 요청한다.
4. 재접속과 최초 구독에서는 항상 `room.world-snapshot`을 먼저 적용한다.
5. `room.world-cursor`가 로컬 cursor보다 크면 전체 snapshot을 요청한다.

`room.world-cursor`는 위치 payload를 반복 전송하지 않는 경량 heartbeat다. 구체적인 주기는 운영
목표인 2초 이내 재수렴을 만족하는 최소값으로 정하고 설정값을 불필요하게 늘리지 않는다.

## 6. 장애 정책

- Redis 연결 실패 시 API 인스턴스별 메모리 fallback을 사용하지 않는다. 서로 다른 인스턴스가
  서로 다른 상태를 제공하는 것보다 재시도 가능한 멀티플레이 연결 오류를 반환한다.
- Redis Pub/Sub 이벤트가 유실돼도 Hash의 최신 snapshot과 `worldSeq`로 복구한다.
- API 재시작이나 다른 인스턴스로 재접속해도 같은 Redis snapshot을 사용한다.
- Redis key가 만료됐지만 PostgreSQL room이 유효하면 참가자 자신의 현재 위치 제출부터 world
  상태를 다시 구성한다.
- PostgreSQL room revision과 Redis `worldSeq`는 서로 다른 cursor다. 둘을 비교하거나 하나의
  transaction처럼 취급하지 않는다.

## 7. 구현 순서

### 7.1 API 기반 구성

1. 현재 의존성을 확인하고 필요한 Redis client와 Socket.IO Redis Adapter만 추가한다.
2. `REDIS_URL`을 API 환경 변수 계약과 예제에 추가한다.
3. Redis 연결을 애플리케이션 lifecycle에 연결하고 종료 시 정리한다.
4. 운영에서 Redis가 필수인 경우 startup 또는 health에서 실패를 명확히 노출한다.

### 7.2 서버 live-state 경로

1. 방별 위치 저장, snapshot 조회와 삭제만 담당하는 Redis live-state 서비스를 추가한다.
2. gateway의 위치 검증 뒤 Redis 갱신이 성공한 이벤트만 전파한다.
3. 최초 구독과 재구독에서 `room.world-snapshot`을 보낸다.
4. leave, presence expiry와 room close에서 해당 플레이어 또는 방 key를 정리한다.
5. Socket.IO Redis Adapter를 namespace에 연결한다.

### 7.3 Web 재수렴

1. `serverRoom.ts`가 `lastWorldSeq`와 world snapshot을 소유하게 한다.
2. 순번 비교와 resync 요청을 network adapter 한 곳에서 처리한다.
3. `CURRENT_PLAYERS`는 참가·퇴장 lifecycle만 처리하고 원격 위치를 고정 좌표로 만들지 않는다.
4. `WorldScene`은 검증된 network snapshot만 렌더링한다.
5. reconnect 중 파괴된 scene sprite를 참조하지 않도록 기존 scene lifecycle guard를 함께 검증한다.

### 7.4 경쟁전 상태 보강

Redis로 경쟁전 상태를 옮기지 않는다. 다만 action 제출 뒤 상대 응답을 기다리는 동안 room revision이
장시간 전진하지 않으면 기존 REST snapshot 복구를 한 번 실행하는 bounded watchdog을 추가한다.
정상 상태의 상시 REST polling은 추가하지 않는다.

## 8. 예상 변경 범위

| 영역                 | 파일 또는 디렉터리                                                               |
| -------------------- | -------------------------------------------------------------------------------- |
| API module·gateway   | `apps/api/src/poke-lounge/`                                                      |
| API 환경 변수·health | `apps/api/src/config/`, `apps/api/src/health/`, `apps/api/.env.example`          |
| Web room adapter     | `apps/web/src/components/poke-lounge/runtime/game/network/serverRoom.ts`         |
| Web world scene      | `apps/web/src/components/poke-lounge/runtime/game/scenes/WorldScene.ts`          |
| API/Web 단위 테스트  | 대상 코드와 가까운 `*.spec.ts`, `*.test.ts`                                      |
| 운영 문서            | `docs/deployment-and-env.md`, `docs/operations-runbook.md`, `apps/api/DEPLOY.md` |

새 공통 패키지는 만들지 않는다. Web에서 API 소스를 import하지 않으며 Socket 계약은 각 앱 경계에서
검증한다.

## 9. 검증 계획

2026-08-24 코드 검증 결과:

- API unit 532건, Web unit 303건과 API·Web production build가 통과했다.
- 운영과 같은 loopback Redis 8.0.5에서 이동 순번 `1 → 2`, 제거 순번 `3`, 최신 좌표 snapshot과
  TTL 연장을 확인하고 테스트 key를 삭제했다.
- 서로 다른 두 Socket.IO 서버 사이의 room event와 server-side room 종료 metadata가 Redis
  Adapter를 통해 양방향 전달됨을 확인했다.
- 실제 NestJS, Next.js, PostgreSQL과 Redis를 사용한 격리 브라우저 한 사이클을 통과했다.
- 운영 배포 결과는 코드·격리 검증과 분리해 아래에 남긴다.

2026-08-24 격리 5인 한 사이클 결과:

| 항목            | 결과                                                                     |
| --------------- | ------------------------------------------------------------------------ |
| 실행 ID         | `manual-1787548782726`                                                   |
| 방              | `76T2XH`                                                                 |
| 환경            | Desktop Chromium 2, Desktop WebKit, Mobile Chromium, Mobile WebKit       |
| 실행 정책       | worker 1, retry 0, 전체 실행 시간 제한 없음                              |
| 게임 진행       | 게임 라운드 3개, 단일 제거 대진 12개 모두 완료                           |
| 서버 행동       | move 112건, 미완료 match 0건                                             |
| 최종 수렴       | 다섯 화면 모두 `Tester 3`을 1위 우승자로 표시                            |
| 연결 복구       | Chromium reload와 같은 탭 Socket reconnect 통과, HTTP 5xx·page error 0건 |
| Redis lifecycle | room close 전 world key 존재, 전원 명시적 퇴장 뒤 key 부재               |
| 캡처            | 입장·첫 대진·terminal·라운드 전환·최종 우승·퇴장 화면 54장               |
| 캡처 품질       | Desktop Chromium·Mobile WebKit 최종 우승과 모바일 퇴장 화면 육안 확인    |
| 결과            | PASS, 3분 42초                                                           |

세부 결과는 로컬 증적 디렉터리
`output/playwright/poke-lounge-five-player/manual-1787548782726/`에 있다. 이 디렉터리는 실행
산출물이며 커밋 대상이 아니다.

2026-08-24 이전 VSCoke 운영 배포 결과(standalone 배포 증거 아님):

| 항목         | 결과                                                                         |
| ------------ | ---------------------------------------------------------------------------- |
| commit       | `67fe2bd2f24a91d86ede7f659924b354af1380a7`                                   |
| API workflow | GitHub Actions `32693566315` success, Redis 연결·PM2 재시작·health 모두 통과 |
| Web 배포     | Vercel Production deployment success                                         |
| Redis        | 운영 loopback Redis `PONG`                                                   |
| API          | PM2 `vscoke-api` online, 내부·공개 health HTTP 200                           |
| Web          | `https://vscoke.icecoke.kr/ko-KR/game/poke-lounge` HTTP 200                  |
| 확인 시각    | 2026-08-24 14:27:55 KST                                                      |

위 결과는 배포와 기본 연결 검증이다. 실제 운영 URL에서 여러 플레이어가 진행하는 한 사이클은 아래
운영 인수 절차로 별도 실행하며, 격리 5인 한 사이클 결과를 운영 실행으로 대신 기록하지 않는다.

### 9.1 자동 검증

- Redis 이동 갱신이 `worldSeq`, 위치와 TTL을 함께 갱신한다.
- 오래된 위치 이벤트를 무시하고 순번 누락 시 한 번만 resync한다.
- 재접속 시 전체 world snapshot으로 중복 없이 복구한다.
- 서로 다른 Socket.IO 서버 인스턴스의 참가자가 같은 이벤트를 받는다.
- Redis 장애에서 메모리 fallback 없이 명시적인 오류가 발생한다.
- room close와 TTL 만료에서 Redis 상태가 제거된다.
- 기존 ready, 대진, 경쟁전 action과 최종 점수 테스트가 그대로 통과한다.

### 9.2 운영 한 사이클

[플레이어 E2E 테스트 시나리오](./poke-lounge-multiplayer-test-scenarios.md)의 Luna 분산 실행 절차를
그대로 사용한다. Firefox는 제외하고 다음 세 환경을 seed로 배정한다.

- Desktop Chromium
- Mobile Chromium
- Mobile WebKit

방 생성부터 3라운드 우승과 전원 퇴장까지 진행하며 다음 증적을 추가한다.

- 각 환경의 이동 전후 화면과 동일한 `worldSeq`
- 이벤트 한 건 유실 뒤 2초 이내 snapshot 재수렴
- 3초 이내 연결 중단과 재접속 뒤 동일 위치·identity
- API 인스턴스 재시작 또는 교체 뒤 동일 방 복구
- 최종 우승 화면과 room close
- room 종료 뒤 Redis key 부재

## 10. 완료 기준

- 원격 이동이 운영 화면에 500ms 이내 반영된다.
- 위치 이벤트 유실 뒤 2초 이내 서버 snapshot으로 수렴한다.
- 재접속 뒤 중복 캐릭터와 stale scene 객체 오류가 없다.
- API 인스턴스가 달라도 같은 방의 위치와 cursor가 일치한다.
- ready, 3라운드 대진, 점수와 최종 우승은 PostgreSQL 기준으로 기존 동작을 유지한다.
- 전원 퇴장 또는 room expiry 뒤 Redis 상태가 제거된다.
- 관련 API/Web 단위 테스트와 운영 한 사이클이 모두 통과한다.

## 11. 배포와 롤백

1. 운영 Redis를 먼저 준비하고 네트워크, 인증과 `REDIS_URL`을 확인한다.
2. 기존 순번 없는 이벤트와 호환되는 API를 먼저 배포한다.
3. Redis snapshot과 cursor를 사용하는 Web을 배포한다.
4. 운영 한 사이클을 통과한 뒤 기존 순번 없는 경로의 제거 여부를 별도 결정한다.

롤백은 Web을 먼저 이전 버전으로 되돌린 뒤 API를 되돌린다. Redis 데이터는 영속 결과가 아니므로
롤백 시 삭제할 수 있으며 PostgreSQL room과 경쟁전 기록은 유지한다.

## 12. 제외 범위

- SSE 또는 WebRTC 전환
- 경쟁전 상태와 최종 결과의 Redis 이전
- 플레이어 이동 이력 저장
- Redis Streams나 별도 event sourcing 도입
- 여러 지역 간 멀티리전 동기화

현재 2~6명 방과 단일 리전 운영에서는 Redis Hash, Pub/Sub와 기존 Socket.IO만으로 충분하다.
