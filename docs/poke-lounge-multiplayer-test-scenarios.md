# Poke Lounge 플레이어 E2E 테스트 시나리오

확인 기준일: 2026-08-27
구현 기준: `main`

## 1. 목적

이 문서는 Poke Lounge 플레이어 흐름의 유일한 E2E 인수 테스트 기준이다. 제품 규칙 자체는
[Poke Lounge 게임 규칙 인덱스](./poke-lounge-rules/index.md)에서 관리한다.

이 문서의 모든 `P0` 시나리오를 통과해야 현재 멀티플레이 기능을 정상으로 판정한다. 공개
멀티플레이의 세부 판정은 규칙 인덱스와 연결된 하위 문서를 따른다.

각 플레이어의 최종 목적은 3라운드 누적 점수 1위로 우승하는 것이다. E2E는 최초 플레이어의
서버 방 자동 생성, 후속 플레이어의 같은 방 자동 참가, 각자의 탐색·육성·전투, 최종 우승자
확정까지 하나의 경쟁 흐름으로 검증한다.

### 1.1 기본 테스트 원칙

1. 플레이어마다 독립된 browser context와 저장 상태를 사용한다.
2. 각 플레이어의 실행 환경은 seed를 사용해 Desktop Web 또는 Mobile Web으로 무작위 배정한다.
3. 한 시나리오는 방 생성·참가, 준비, 플레이, 승부, 복구 중 하나의 사용자 관찰 결과를
   중심으로 검증한다.
4. 환경 seed, 파티와 행동 순서를 기록해 실행 입력을 재현한다. 전투 RNG 결과는 실행마다 달라질
   수 있으므로 우승자 자체를 고정하지 않고 각 실행 안에서 모든 화면이 서버 판정에 수렴하는지
   확인한다.
5. 임의 대기 시간보다 서버 시각, room snapshot과 화면 상태 전환을 기준으로 기다린다.
6. 주요 상태 전환과 최종 우승 화면을 캡처하고 실패 시 screenshot, trace와 video를 남긴다.
7. 임시 비밀번호, session ID, token과 cookie는 캡처나 로그에 노출하지 않는다.

## 2. 제품 계약

테스트는 [멀티플레이 규칙](./poke-lounge-rules/multiplayer-rules.md)과
[3라운드 챔피언십 규칙](./poke-lounge-rules/three-round-championship.md)의 사용자 관찰 결과를
검증한다. 이 문서에는 규칙을 다시 정의하지 않고 테스트 환경, 절차와 증적만 기록한다.

이 문서에서 방 생성은 최초 플레이어의 `create-or-join` 요청으로 서버 room이 자동 생성되는
동작을, 방 참가는 같은 임시 비밀번호를 입력한 후속 플레이어가 해당 room에 자동 합류하는
동작을 뜻한다. 사용자에게 별도의 방 만들기·방 들어가기 선택 화면을 노출하지 않는다.

### 2.1 테스트 제외 범위

다음 항목은 공개 멀티플레이 인수 테스트에서 제외한다.

- Google 로그인, 계정 선택과 OAuth callback
- 사용자에게 보이는 방 코드, 방 생성·참가 선택과 초대 링크
- 방장 강퇴·방 설정, 준비 시간 선택과 경쟁 모드 설정
- Google 계정에 바인딩하는 competitive seat
- direct room URL, 수동 WebRTC와 내부 경쟁 API
- 사용자 간 파티·재화·인벤토리 공유

공통 셸이 `/api/auth/session`을 조회할 수는 있지만, 멀티플레이 접속 성공 조건으로 로그인이나
Authorization header를 요구해서는 안 된다.

## 3. 상태와 우선순위

| 표기 | 의미                                                           |
| ---- | -------------------------------------------------------------- |
| `A`  | 현재 단위·API·브라우저 테스트 중 하나 이상으로 자동화되어 있음 |
| `P`  | 하위 계층은 자동화됐지만 실제 다중 브라우저 검증이 필요함      |
| `N`  | 자동화되지 않았으며 신규 자동화가 필요함                       |
| `M`  | 운영 환경에서 수동으로 확인해야 함                             |

| 우선순위 | 실행 시점                               | 실패 처리                 |
| -------- | --------------------------------------- | ------------------------- |
| `P0`     | 모든 PR, 배포 전                        | 배포 중단                 |
| `P1`     | main 반영 전 또는 일일 전체 회귀        | 원인 확인 후 승인 필요    |
| `P2`     | 릴리즈 후보, 크로스 브라우저, 정기 점검 | 알려진 제약으로 기록 가능 |

## 4. 테스트 환경

### 4.1 환경 계층

| 환경      | Web           | API           | DB             | 실시간 상태 | 목적                       |
| --------- | ------------- | ------------- | -------------- | ----------- | -------------------------- |
| UI 격리   | 로컬 Next.js  | 응답 fixture  | 없음           | 없음        | 입력·오류·레이아웃         |
| 로컬 통합 | 로컬 Next.js  | 실제 NestJS   | 테스트 계정 DB | 격리 Redis  | 참가·Socket·leave·재접속   |
| 운영 인수 | 운영 배포 Web | 운영 배포 API | 운영 정책      | 운영 Redis  | 실제 배포·CORS·Socket·화면 |

운영 인수 테스트는 임시 비밀번호 원문, 쿠키, token과 전체 Socket payload를 artifact에 저장하지
않는다. 운영 room에는 테스트 전용 닉네임 prefix를 사용하고 완료 후 모든 참가자가 명시적으로
나간다.

### 4.2 브라우저 구성

| 환경          | 기본 viewport        | 입력   | 브라우저 매트릭스          |
| ------------- | -------------------- | ------ | -------------------------- |
| `Desktop Web` | 1440×900             | 키보드 | Chromium, P2 WebKit        |
| `Mobile Web`  | Pixel 7 기준 390×844 | 터치   | Chromium, P2 Mobile WebKit |

플레이어 역할은 `MP1`부터 `MP7`까지 유지하되 환경은 고정하지 않는다. 실행 시작 시 seed로 환경
목록을 섞어 각 플레이어에게 배정하고, 해당 실행이 끝날 때까지 같은 환경을 유지한다.

`agent-browser` 에이전트 실행에서 `Mobile Web`은 viewport만 줄이지 않고 방 입장 전에
`open --init-script .agents/skills/poke-lounge-agent-browser-test/scripts/mobile-touch-init.js`로 빈 named
session을 시작하고 `set device "iPhone 12"`를 적용한 뒤 대상 URL을 연다. `agent-browser` 0.34.0의
device preset이 적용하지 않는 touch capability만 리포지토리에서 검토한 init script로 보정한다.
viewport `390×844`와 `navigator.maxTouchPoints > 0`을 확인한 뒤에만 `ENV-READY`를 보고한다. `Desktop Web`은
`set viewport 1440 900`을 적용하고 touch device를 에뮬레이션하지 않는다. 모바일 조작 deck과 터치
방향 패드는 라운드 시작 후 `C1-WORLD`에서 확인하며, 그때 없으면 `CODE-FAIL`이다.

- 2인 시나리오: `Desktop Web` 1개와 `Mobile Web` 1개를 섞어 배정한다.
- 3인 한 사이클: `Desktop Chromium` 1개와 `Mobile Chromium` 2개를 세 플레이어에게 섞어
  배정한다.
- 6·7인 시나리오: `Desktop Web` 4개와 `Mobile Web` 3개를 섞어 배정한다.
- 실행 seed와 `playerId → 환경` 배정 결과를 artifact에 기록하고 같은 seed로 재현할 수 있어야
  한다.

3인 실행의 배정은 실행마다 새 무작위 seed를 만들고 `SHA-256("<seed>|<MP 역할>")` 오름차순으로
역할을 정렬한 뒤 `Desktop Chromium` 1개, `Mobile Chromium` 2개 순서로 할당한다. 환경 선택은
무작위지만 seed와 계산식으로 재현 가능해야 한다. WebKit은 P2 scripted regression에서만 확인하고
agent-operated 한 사이클에는 배정하지 않는다.

모든 context는 서로 다른 `sessionStorage`를 사용한다. 같은 사용자 재접속 시나리오에서만 기존
탭과 storage를 유지한다.

### 4.3 테스트 데이터

- `PW_A`: 실행 시 생성한 동일 세션용 임시 비밀번호
- `PW_B`: `PW_A`와 다른 격리 확인용 임시 비밀번호
- 닉네임: `MP-1`부터 `MP-7`
- 환경 배정: 실행 seed로 결정한 Desktop Web 또는 Mobile Web
- 저장 상태: 최초 실행은 빈 상태, 독립 진행 검증에서는 `MP1`만 파티·재화 fixture 보유

### 4.4 3인 반복 실행 fixture

| 항목      | 기준                                                                                          |
| --------- | --------------------------------------------------------------------------------------------- |
| 참가 순서 | `MP1` 방 자동 생성 완료 보고 뒤 `MP2`, `MP3` 순차 참가                                        |
| 대진 seed | `joinedAtMs`, 동률이면 `playerId` 오름차순으로 `MP1=1`, `MP2=2`, `MP3=3`                      |
| 스타터    | 발견 실행은 각자 첫 번째 스타터, 재현 실행은 발견 실행에서 저장한 같은 파티                   |
| 전투 행동 | 매 턴 첫 번째 사용 가능한 공격 기술, 강제 교체 시 첫 번째 생존 슬롯                           |
| Desktop   | fresh canvas ref focus 뒤 `Fight` Enter → fresh ref로 `move-select` 확인 → 첫 공격 기술 Enter |
| Mobile    | 화면의 `Fight` touch → 기술 목록 확인 → 첫 공격 기술 touch                                    |
| 턴 시한   | 서버 turn 진입부터 30,000ms, 미제출자는 해당 턴 행동만 생략                                   |
| 결과 확인 | terminal 캡처 뒤 Desktop은 Enter, Mobile은 화면의 `다음`을 한 번 입력                         |
| 금지 행동 | 기권이나 브라우저 종료로 승패 유도                                                            |
| 준비 시간 | 분산 테스터는 제품 기본값 180,000ms, 단일 자동화만 30,000ms 허용                              |
| 승패 판정 | 실행마다 서버가 확정한 점수·순위·우승자와 세 화면이 같은지 확인                               |

전투 참가자는 공유 관리자 채널에
`ACTION-ARMED <gameRound> <matchId> <turn> <MP 역할>`을 보낸다. 관리자는 같은 match·turn의 두
보고를 확인한 뒤 `ACTION-GO <gameRound> <matchId> <turn>`을 한 번 보낸다. turn 0만 이 시작 신호를
사용하고 이후 turn은 서버의 `command` phase와 turn 증가를 각 runner가 직접 감시해 진행한다.
`<matchId>`에는 authoritative competitive projection의 UUID `matchId`만 사용하고
`bracketMatchId`는 사용하지 않는다. 첫 대진은 `MP2`·`MP3`, 결승은 `MP1`·첫 대진 승자가 보고
대상이다.

30초 준비는 모든 watcher와 입력 루프를 시작 전에 대기시킬 수 있는 단일 자동화 runner 전용이다.
독립 서브에이전트나 수동 테스터가 각자 브라우저를 조작할 때는 제품 기본값 180초를 그대로
사용한다. 세 화면의 `startedAtMs`, `endsAtMs`가 같은지 확인하며, 단축 실행 결과로 3분 제품 계약을
대체하지 않는다.

로컬 분산 테스트의 세 플레이어는 공개 입장 URL에 `e2e=1`만 지정하고 같은 임시 비밀번호로
참가한다. 공개 생성 화면은 URL의 `roundMs`를 방 생성 요청에 전달하지 않으므로 분산 fixture에
`roundMs`를 사용하지 않는다. `MP1`의 방 생성 요청 body에는 `roundDurationMs`가 없어야 하고 서버
room의 `durationMs`는 기본값 `180000`이어야 한다. 단일 자동화의 30초 값은 기존 통합 테스트처럼
방 생성 POST를 가로채 `roundDurationMs: 30000`을 병합할 때만 사용한다. 해당 route는 최초 방 생성
응답 직후 `finally`에서 설치할 때 보존한 handler 참조로 제거한다. 다음 실행 시작 시 목록 조회에
의존하지 않고 각 Playwright page에서 `page.unrouteAll({ behavior: "wait" })`을 호출한다. 같은 browser
context를 재사용하더라도 이전 실행의 30초 override가 다음 방 생성에 적용되면 안 된다.

`agent-browser` 분산 실행은 내부 API를 새로 호출하지 않고, 브라우저가 이미 완료한
요청의 response만 읽어 authoritative room projection을 확인한다. 방 입장 전에 각 named
session의 network log를 비우고, checkpoint마다 다음 명령으로 가장 최신의 room 요청 ID와
response body를 읽는다.

```sh
agent-browser --session <name> network requests --filter "poke-lounge/rooms" --status 2xx --json
agent-browser --session <name> network request <request-id> --json
```

방 생성 response에서 `round.durationMs`와 request body를, 시작·자동 복구 response에서
`round.startedAtMs`, `round.endsAtMs`, `round.index`를, 대진 배정 response에서
`competitive.matchId`, `competitive.currentTurn`, `competitive.status`만 추출한다. 상태가 누락되거나
예전 revision이면 재접속 유예 내에 UI reload를 정확히 한 번 수행하고, 페이지가 자동으로 보낸
최신 room GET response를 다시 읽는다. `fetch`, `curl`, request replay로 room 상태를 직접 조회하거나
route로 바꾸지 않는다. 전체 response, 방 코드, `playerId`, `sessionId`, token, cookie는 artifact나
관리자 채널에 남기지 않는다. 이 수동 읽기 절차는 UI 조작을 대신하는 내부 API 호출이 아니다.

`PW_A`, `PW_B` 원문은 문서, URL, screenshot, trace 제목과 JSON 결과에 기록하지 않는다.
해시에서 파생된 내부 6자리 key도 사용자 화면 증거로 사용하지 않는다.

## 5. 상세 시나리오

### 5.1 입장 화면

| ID             | 우선순위/상태 | 절차                                   | 기대 결과                                                         |
| -------------- | ------------- | -------------------------------------- | ----------------------------------------------------------------- |
| `MP-ENTRY-001` | P0/A          | 비로그인으로 Poke Lounge에 진입        | 닉네임, 임시 비밀번호와 접속 CTA가 표시된다.                      |
| `MP-ENTRY-002` | P0/A          | 닉네임을 비우고 접속                   | 닉네임 필수 안내와 입력 focus가 표시된다.                         |
| `MP-ENTRY-003` | P0/A          | 닉네임만 입력하고 접속                 | 임시 비밀번호 필수 안내와 입력 focus가 표시된다.                  |
| `MP-ENTRY-004` | P0/A          | 공개 control을 모두 확인               | 방 코드·초대·생성/참가·로그인·경쟁전 설정이 없다.                 |
| `MP-ENTRY-005` | P1/A          | 전각·공백을 포함한 임시 비밀번호 입력  | NFKC·trim 결과가 같은 값이면 같은 내부 key를 사용한다.            |
| `MP-ENTRY-006` | P1/A          | 12자를 넘는 닉네임 입력                | Unicode 문자 기준 앞 12자만 사용하고 빈 문자열은 허용하지 않는다. |
| `MP-ENTRY-007` | P0/A          | Desktop과 390×844 Mobile에서 화면 확인 | 입력, 설명과 CTA가 game frame을 벗어나지 않고 overflow가 없다.    |

### 5.2 세션 자동 생성·참가와 비밀값

| ID               | 우선순위/상태 | 절차                                    | 기대 결과                                                                                       |
| ---------------- | ------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `MP-SESSION-001` | P0/A          | `MP1`이 닉네임과 `PW_A`로 접속          | 별도 선택 없이 세션을 생성하고 스타터 선택 뒤 대기실에 입장한다.                                |
| `MP-SESSION-002` | P0/A          | `MP2`가 다른 닉네임과 `PW_A`로 접속     | 같은 대기실에 자동 참가하고 양쪽이 두 닉네임을 본다.                                            |
| `MP-SESSION-003` | P0/P          | 새 context가 `PW_B`로 접속              | `PW_A` 세션 참가자와 서로 보이지 않는다.                                                        |
| `MP-SESSION-004` | P0/A          | URL, storage, API body와 console을 검사 | 임시 비밀번호 원문이 남지 않고 API에는 파생 key만 전달된다.                                     |
| `MP-SESSION-005` | P0/A          | room REST·Socket 요청을 관찰            | party snapshot은 자동 전송하지만 ready는 자동 전송하지 않고 competitive seat도 호출하지 않는다. |
| `MP-SESSION-006` | P0/A          | 인증 쿠키가 없는 `MP1`, `MP2`로 접속    | Google 로그인이나 bearer token 없이 create-or-join과 Socket 승인이 성공한다.                    |
| `MP-SESSION-007` | P0/A          | 두 참가자의 파티 동기화 완료            | 양쪽이 대기실에 머물며 ready나 1라운드 3분 준비가 자동 시작되지 않는다.                         |

### 5.3 방장·ready·수동 시작 대기실

| ID             | 우선순위/상태 | 절차                                 | 기대 결과                                                               |
| -------------- | ------------- | ------------------------------------ | ----------------------------------------------------------------------- |
| `MP-LOBBY-001` | P0/A          | `MP1`이 먼저 대기실에 입장           | `MP1`에 방장 표시가 있고 준비 타이머는 시작되지 않는다.                 |
| `MP-LOBBY-002` | P0/A          | 2분 뒤 `MP2`가 같은 대기실에 입장    | 양쪽 타이머가 시작되지 않고 참가자 2명이 표시된다.                      |
| `MP-LOBBY-003` | P0/A          | `MP1`만 ready 선택                   | `MP2`는 준비 전이며 방장 시작 버튼은 비활성화된다.                      |
| `MP-LOBBY-004` | P0/A          | `MP1`, `MP2` 모두 ready              | `MP1`만 시작할 수 있고 `MP2`는 방장 시작 대기 안내를 본다.              |
| `MP-LOBBY-005` | P0/A          | 방장 `MP1`이 시작                    | 양쪽이 같은 `startedAtMs`, `endsAtMs`와 정확한 3분 준비를 받는다.       |
| `MP-LOBBY-006` | P0/A          | 시작 전에 `MP3` 참가                 | `MP3`도 ready 조건에 포함되며 세 명 모두 준비해야 시작할 수 있다.       |
| `MP-LOBBY-007` | P0/A          | 시작 뒤 신규 context로 참가          | 신규 참가를 거부하고 기존 참가자 명단과 준비 종료 시각을 바꾸지 않는다. |
| `MP-LOBBY-008` | P0/A          | 대기실에서 `MP1`이 명시적으로 나감   | 다음 최초 입장자인 `MP2`가 방장이 된다.                                 |
| `MP-LOBBY-009` | P1/A          | 방장 Socket을 끊고 15초 안에 재연결  | 유예 중 방장을 유지하고 시작을 막으며 재연결 뒤 기존 방장으로 복구한다. |
| `MP-LOBBY-010` | P0/A          | 참가자 6명을 Desktop·Mobile에서 확인 | 전체 목록에 접근할 수 있고 필수 버튼이 game frame 안에 남는다.          |
| `MP-LOBBY-011` | P0/A          | 준비 중 이탈로 참가자가 1명이 됨     | `waiting`으로 돌아가 남은 ready를 해제하고 대기실을 다시 연다.          |

### 5.4 최대 6명과 7번째 접속 거부

| ID           | 우선순위/상태 | 절차                                           | 기대 결과                                                                |
| ------------ | ------------- | ---------------------------------------------- | ------------------------------------------------------------------------ |
| `MP-CAP-001` | P0/P          | `MP1`~`MP6`이 순서대로 `PW_A`에 접속           | 여섯 사용자 모두 참가자이며 관전자로 전환되는 사용자가 없다.             |
| `MP-CAP-002` | P0/A          | `MP7`이 같은 `PW_A`로 접속                     | HTTP 409와 `POKE_LOUNGE_ROOM_FULL`로 거부되고 참가자 수는 6명이다.       |
| `MP-CAP-003` | P0/A          | `MP7`의 오류 화면 확인                         | “6명이 접속 중” 안내와 입장 화면 복귀만 제공하며 자동 재시도하지 않는다. |
| `MP-CAP-004` | P0/A          | 정원이 찬 상태에서 `MP1`의 같은 탭을 새로고침  | 같은 identity로 복원되고 참가자 수가 7명으로 늘지 않는다.                |
| `MP-CAP-005` | P0/P          | `MP6`이 방 나가기를 확인하고 `MP7`이 다시 접속 | `MP6` 자리가 즉시 제거되고 `MP7`이 여섯 번째 신규 참가자로 성공한다.     |
| `MP-CAP-006` | P1/A          | `MP5` Socket을 끊고 14,999ms 동안 관찰         | 재접속 유예 중에는 자리를 유지해 다른 신규 사용자의 접속을 거부한다.     |
| `MP-CAP-007` | P1/A          | `MP5`가 15초 안에 같은 탭으로 재연결           | 만료를 취소하고 동일 참가자로 복원한다.                                  |
| `MP-CAP-008` | P1/P          | `MP5`를 재연결하지 않고 유예 종료 후 신규 접속 | 만료된 참가자를 제거하고 신규 사용자가 빈자리에 입장한다.                |

정원 검증은 `role === participant` 개수만 보지 않고 room에 남아 있는 전체 사용자 행이 6개를
넘지 않는지 확인한다.

### 5.5 동일 사용자와 재접속

| ID          | 우선순위/상태 | 절차                                       | 기대 결과                                                              |
| ----------- | ------------- | ------------------------------------------ | ---------------------------------------------------------------------- |
| `MP-ID-001` | P0/A          | 같은 탭을 새로고침                         | 저장된 `playerId + sessionId`로 같은 참가자를 복원한다.                |
| `MP-ID-002` | P0/A          | 다른 context에서 같은 닉네임·`PW_A` 입력   | 닉네임과 비밀번호가 같아도 신규 참가자로 계산한다.                     |
| `MP-ID-003` | P0/A          | 명시적 방 나가기 후 같은 값을 다시 입력    | 저장 identity를 지우고 신규 참가자로 입장한다.                         |
| `MP-ID-004` | P1/A          | 다른 sessionId로 기존 playerId 재사용 시도 | session 불일치로 거부하고 기존 참가자 identity를 탈취하지 못한다.      |
| `MP-ID-005` | P1/A          | 일시 disconnect 후 같은 탭 재연결          | 한 Socket identity로 REST 복구·재구독하고 중복 avatar를 만들지 않는다. |

### 5.6 같은 월드와 각자의 플레이

| ID             | 우선순위/상태 | 절차                                           | 기대 결과                                                                      |
| -------------- | ------------- | ---------------------------------------------- | ------------------------------------------------------------------------------ |
| `MP-WORLD-001` | P0/P          | Desktop Web 플레이어를 키보드로 이동           | Mobile Web 화면에서 상대의 좌표와 방향이 갱신된다.                             |
| `MP-WORLD-002` | P0/P          | Mobile Web 플레이어를 터치 방향 패드로 이동    | Desktop Web 화면에서 상대의 좌표와 방향이 갱신된다.                            |
| `MP-WORLD-003` | P0/A          | 위조 playerId·sessionId·displayName event 전송 | 서버가 durable identity와 닉네임으로 덮어쓰고 승인된 좌표·방향만 중계한다.     |
| `MP-WORLD-004` | P0/P          | `MP1`이 야생전에 진입하고 `MP2`는 계속 이동    | 전투는 `MP1` 탭에서만 열리고 `MP2` 플레이와 이동은 계속된다.                   |
| `MP-WORLD-005` | P0/P          | `MP1` 파티·재화·인벤토리를 변경                | `MP2`의 파티·재화·인벤토리는 변하지 않고 네트워크 payload에도 포함되지 않는다. |
| `MP-WORLD-006` | P1/P          | `MP1`이 전투 종료 후 월드로 복귀               | 상대 avatar와 최신 위치를 다시 보고 자신의 HP·PP·보상만 유지한다.              |
| `MP-WORLD-007` | P0/P          | 3명 이상 중 한 명이 명시적으로 나가기          | 다른 화면에서 해당 avatar가 제거되고 2명 이상 남은 사용자는 계속 플레이한다.   |
| `MP-WORLD-008` | P0/P          | 위치 이벤트 한 건을 누락시킨 뒤 cursor 수신    | 2초 안에 Redis snapshot을 다시 받아 모든 화면의 위치와 worldSeq가 수렴한다.    |
| `MP-WORLD-009` | P0/P          | 연결된 API 인스턴스를 교체하고 같은 탭 재접속  | 같은 Redis snapshot으로 복구하며 중복 avatar나 고정 시작 좌표가 생기지 않는다. |

### 5.7 3라운드 챔피언십

| ID             | 우선순위/상태 | 절차                                         | 기대 결과                                                                       |
| -------------- | ------------- | -------------------------------------------- | ------------------------------------------------------------------------------- |
| `MP-CHAMP-001` | P0/A          | 2명의 party snapshot·수동 ready 뒤 방장 시작 | 정확히 3분 준비가 시작되고 현재 라운드와 남은 시간이 같은 기준 시각으로 보인다. |
| `MP-CHAMP-002` | P0/A          | 준비 중 한 명이 나가 참가자가 1명이 됨       | 이탈자의 파티를 제거하고 ready를 해제한 뒤 대진 없이 `waiting`으로 돌아간다.    |
| `MP-CHAMP-003` | P0/P          | 준비 종료 뒤 첫 대진에서 행동 제출           | 로그인 없이 private session identity로 자기 행동만 제출할 수 있다.              |
| `MP-CHAMP-004` | P0/P          | 전투를 terminal까지 진행                     | 서버가 승패·bracket 전진·각 파티 terminal HP 비율 점수를 확정한다.              |
| `MP-CHAMP-005` | P0/P          | 3개 라운드를 모두 완료                       | 누적 점수 내림차순 최종 순위가 표시되고 동점 최고 점수는 공동 우승이다.         |
| `MP-CHAMP-006` | P0/A          | 1·2라운드 토너먼트 완료                      | 별도 ready 없이 다음 라운드의 정확한 3분 준비가 자동 시작된다.                  |
| `MP-CHAMP-007` | P0/P          | 3명이 참가 순서대로 대진에 배치              | 매 게임 라운드에서 seed 1은 부전승, seed 2와 3이 첫 대진을 치른다.              |
| `MP-CHAMP-008` | P0/P          | seed 2와 3이 전투하는 동안 seed 1 관찰       | seed 1은 월드에 남고 해당 대진 행동은 제출할 수 없으며 같은 대진을 본다.        |
| `MP-CHAMP-009` | P0/P          | 첫 대진 종료 후 결승 진행                    | seed 1과 첫 대진 승자가 결승에 진입하고 세 화면의 대진·결과가 같다.             |
| `MP-CHAMP-010` | P0/P          | 다음 게임 라운드 준비 시작                   | 탈락자를 포함한 세 참가자가 다시 포함되고 새 라운드 준비가 자동 시작된다.       |
| `MP-CHAMP-011` | P0/P          | terminal 결과를 화면에서 확인                | 승자는 다음 대진, 탈락자는 월드로 전환하며 비참가자는 행동을 제출할 수 없다.    |

### 5.8 오류·복구·화면

| ID             | 우선순위/상태 | 절차                                     | 기대 결과                                                                            |
| -------------- | ------------- | ---------------------------------------- | ------------------------------------------------------------------------------------ |
| `MP-ERROR-001` | P0/A          | room create-or-join API 5xx·network 실패 | 일반 연결 오류와 재시도·입장 복귀를 표시하고 무한 요청을 만들지 않는다.              |
| `MP-ERROR-002` | P0/A          | 정원 초과 409 수신                       | 일반 네트워크 오류가 아닌 정원 6명 안내를 표시한다.                                  |
| `MP-ERROR-003` | P1/A          | Socket disconnect 후 복구                | 로컬 게임 상태를 잃지 않고 REST snapshot과 Socket 구독이 최신 revision으로 수렴한다. |
| `MP-ERROR-004` | P1/A          | stale identity 또는 cursor regression    | 이전 identity를 종료하고 닉네임·임시 비밀번호 화면으로 돌아간다.                     |
| `MP-ERROR-005` | P0/P          | Desktop과 Mobile에서 오류 화면 확인      | 버튼과 문구가 frame 안에 있고 keyboard·touch로 입장 화면에 복귀한다.                 |
| `MP-ERROR-006` | P1/A          | ko-KR, en-US, ja-JP 정원 초과 문구 확인  | 각 locale에 대응하는 6명 정원 안내가 표시된다.                                       |
| `MP-ERROR-007` | P1/N          | ready 또는 시작 mutation 실패            | 대기실을 유지하고 최신 snapshot과 인라인 재시도 안내로 수렴한다.                     |
| `MP-ERROR-008` | P0/P          | 여러 참가자가 동시에 명시적으로 나가기   | revision 충돌을 복구해 모두 입장 화면으로 돌아가고 room은 `closed`로 수렴한다.       |

## 6. 실행 시나리오

### 6.1 Luna 분산 실행 오케스트레이션

| 실행 주체               | 책임                                                                | 금지 사항                                     |
| ----------------------- | ------------------------------------------------------------------- | --------------------------------------------- |
| 루트 오케스트레이터     | 실행 준비, 환경 배정, 단계 동기화, 장애 분류, 증적 취합과 최종 보고 | 방 참가, 플레이어 입력과 승패 개입            |
| `Luna xhigh` runner 3개 | 배정된 독립 context의 입장·이동·전투·캡처와 상태 보고               | 다른 runner의 context 조작, 서버 판정 우회    |
| `MP` 플레이어 context   | 하나의 `playerId + sessionId`, 저장 상태와 Desktop·Mobile 환경 유지 | 다른 플레이어와 storage·cookie·입력 상태 공유 |

1. 루트 오케스트레이터는 browser를 열기 전에 실행 ID와 환경 seed를 만들고 `MP` 역할, runner,
   Desktop Web 또는 Mobile Web 환경을 무작위로 연결한다. 배정 결과는 같은 seed로 재현할 수 있게
   기록한다.
2. `LUNA-1`~`LUNA-3`의 `Luna xhigh` runner 3개를 구성하고 환경 seed로 Desktop Chromium 1개와
   Mobile Chromium 2개를 섞어 배정한다. 각 runner는 하나의 플레이어 context를 소유하며 루트는
   어떤 경우에도 플레이어가 되지 않는다.
3. 각 runner는 배정된 context에서 Poke Lounge 입장 화면을 연 직후 배정된 viewport와 Mobile touch
   emulation을 확인하고 named session의 network log를 비운 뒤 `ENV-READY`를 보고한다. 공개 입장
   화면과 waiting 대기실에는 설정 control이 없다. 방장이 시작해 대기실이 닫히면 각 runner는
   shortcut 또는 Mobile guide를 canonical control로 먼저 닫고, 이동·전투 입력 전에 설정을 즉시
   연다. 소리 control을 `소리 꺼짐`으로 맞추고 접근성 이름이 `소리 음소거`인지 확인한 뒤 설정을
   닫는다. 이미 꺼져 있으면 추가로 누르지 않는다. 완료한 플레이어마다
   `AUDIO-MUTED <MP 역할>`을 보고한다.
4. `MP1` runner가 최초 접속과 자동 방 생성을 담당하는 방장이다. 루트 오케스트레이터를 `MP1`,
   방장 또는 플레이어 슬롯으로 계산하지 않는다.
5. 루트는 `ENV-READY` 보고를 모두 받은 뒤 `MP1`에게 방 생성을 지시하고, `C0-HOST`를 확인한 뒤
   후속 참가를 순서대로 허용한다. ready·시작·대진 전환은 해당 checkpoint의 전원 보고가 모인
   뒤에만 다음 단계로 진행한다. 시작 뒤에는 전원의 `AUDIO-MUTED`와 이동 증적이 모두 모여야
   `C1-WORLD`를 통과시킨다.
6. 전투 첫 turn은 두 참가자의 `ACTION-ARMED`를 대조한 뒤 루트가 같은 `matchId`와 turn의
   `ACTION-GO`를 한 번 보낸다. 이후 turn은 각 runner가 서버 phase와 turn 전진을 따라 진행하며
   루트가 플레이 입력을 대신하지 않는다.
7. 전체 실행에는 별도 종료 시간 제한을 두지 않고 서버가 3라운드 누적 우승자를 확정할 때까지
   한 사이클을 진행한다. 제품의 준비 시간, turn deadline과 재접속 유예는 그대로 지킨다.
8. 각 runner는 필수 checkpoint와 연결 중단·REST 복구·Socket 재구독 전후 화면을 캡처한다. 루트는
   실행 ID, `MP` 역할, 환경, checkpoint와 시각을 대조하고 민감값을 제거한 증적만 취합한다.
9. runner가 `DOC-GAP`, `CODE-FAIL`, `TEST-RUNNER` 또는 `INFRA-BLOCKED`를 보고하면 루트가
   중단·재현·계속 여부를 결정한다. 내부 API로 행동이나 승패를 대신 만들지 않으며, 안전한
   checkpoint부터만 재개한다.
10. 루트는 중간 진행을 결과 보고로 간주하지 않는다. 우승자 확정과 room 정리가 끝난 뒤 환경별
    성공 여부, 최종 순위, 연결 복구 결과, 캡처와 결함만 하나의 최종 보고로 전달한다.

### 6.2 기본 2인 shared world

1. `MP1`, `MP2`의 storage를 비우고 Poke Lounge 입장 화면을 연다.
2. seed로 `MP1`, `MP2`의 환경을 배정하고 Desktop Web과 Mobile Web 입장 화면을 각각 캡처한다.
3. 두 context가 서로 다른 닉네임과 같은 `PW_A`로 접속한다.
4. 양쪽 대기실에서 두 닉네임, `MP1` 방장 표시와 준비 전 상태를 확인한다.
5. 두 사용자가 ready를 선택하고 방장 `MP1`이 시작한다.
6. 양쪽에 같은 3분 준비가 시작된 뒤 대기실이 닫히는지 확인한다.
7. 각 플레이어가 배정된 환경의 키보드 또는 터치로 이동하고 상대 화면의 좌표·방향 변화를
   확인한다.
8. `MP1`만 야생전에 진입한 동안 `MP2`가 계속 월드를 이동하는지 확인한다.
9. `MP1`의 전투 보상과 파티 변경이 `MP2`에 반영되지 않는지 확인한다.
10. 두 사용자가 방에서 나가고 입장 화면으로 돌아오는지 확인한다.

### 6.3 6명 정원·7번째 거부·재입장

1. `MP1`~`MP6`이 같은 `PW_A`에 순서대로 접속한다.
2. REST snapshot에서 참가자 6명과 서로 다른 identity를 확인한다.
3. `MP7`이 같은 `PW_A`로 접속해 409 정원 초과 화면을 확인한다.
4. 정원이 찬 상태에서 `MP1`을 새로고침해 동일 identity와 참가자 6명을 확인한다.
5. `MP6`이 명시적으로 나가고 `MP7`이 다시 접속해 여섯 번째 자리를 얻는지 확인한다.
6. 한 참가자의 Socket을 일시 중단하고 15초 안에 재연결해 같은 자리를 유지하는지 확인한다.
7. 다시 연결을 끊고 유예를 넘겨 참가자 제거와 다음 신규 참가자의 입장을 확인한다.
8. 남은 모든 참가자가 명시적으로 나가도록 정리한다.

### 6.4 기본 2인 챔피언십

1. `MP1`, `MP2`가 같은 `PW_A`에 접속해 각자의 파티를 준비한다.
2. 자동 party snapshot 뒤에도 대기실과 준비 전 상태가 유지되는지 확인한다.
3. 두 사용자가 ready를 선택하고 방장 `MP1`이 시작한다.
4. 양쪽 HUD의 현재 라운드와 남은 시간이 같은 서버 종료 시각을 기준으로 감소하는지 확인한다.
5. 각 플레이어가 우승을 목표로 합법적인 전투 행동을 제출하고 양쪽에 같은 전투 상태가
   표시되는지 확인한다.
6. 고정된 행동 순서로 첫 대진을 끝내고 terminal HP 비율 점수와 다음 대진 또는 다음 라운드
   전환을 확인한다.
7. 2·3라운드 준비가 별도 ready 없이 자동 시작되는지 확인한다.
8. 3라운드 완료 뒤 모든 화면에 같은 누적 최종 순위와 예상 우승자가 표시되는지 확인한다.
9. 최고 누적 점수가 같을 때는 공동 우승으로 표시되는지 별도 fixture로 확인한다.

### 6.5 3인 shared world·3라운드 챔피언십 반복 실행

#### 실행 전

1. 관리자는 격리 DB와 실제 API·Web을 준비하고 실행 ID, 환경 배정 seed, 임시 비밀번호와 artifact
   경로를 만든다. 관리자는 플레이어 context를 조작하지 않는다.
2. 각 플레이어는 이전 실행에서 설치한 route handler를 `page.unrouteAll({ behavior: "wait" })`로
   무조건 제거한다. 단일 자동화의 30초 생성 override는 설치할 때 handler 참조를 보존하고 생성
   응답 직후 `finally`에서도 제거한다.
3. 세 플레이어는 이 문서와 연결된 멀티플레이·챔피언십·전투 규칙을 읽고 자신의 환경, 입력,
   참가 순서와 캡처 목록을 관리자에게 확인 보고한다.
4. 이번 실행에서 문서만으로 다음 행동이나 기대 결과를 결정할 수 없으면 브라우저를 시작하지
   않고 `DOC-GAP`으로 중단한다. 관리자가 문서를 개정한 뒤 세 플레이어 모두 처음부터 다시
   읽는다.

#### C0 방 생성·순차 참가

1. `MP1`만 입장 화면을 열어 닉네임과 `PW_A`를 제출한다. 자동 방 생성 뒤 스타터 선택 화면이
   열리면 첫 번째 스타터를 확정하고 party snapshot 동기화가 끝날 때까지 기다린다.
2. 분산 실행에서는 방 생성 요청 body에 `roundDurationMs`가 없고 서버 room의 `durationMs`가
   `180000`인지 확인한다. 단일 자동화에서는 요청과 서버 값이 모두 `30000`인지 확인한다. 이전
   route 값이 남아 기준과 다르면 제품 assertion 전에 중단·정리하고 `INFRA-BLOCKED`로 보고한다.
3. `MP1`은 대기실에서 자신이 유일한 참가자이자 방장이고 파티 동기화가 완료됐음을 캡처한 뒤
   관리자에게 `C0-HOST`를 보고한다.
4. 관리자 승인 뒤 `MP2`, 이어서 `MP3`이 서로 다른 context에서 닉네임과 같은 `PW_A`를
   제출한다. 각자 스타터 선택 화면에서 첫 번째 스타터를 확정하고 자신의 party snapshot 동기화
   완료를 보고한 뒤에만 다음 플레이어가 참가한다.
5. 각 참가자는 세 닉네임, `MP1` 방장, 세 파티 동기화 완료, 모두 준비 전, 타이머 미시작을 자기
   화면에서 확인하고 `C0-JOINED`를 보고한다.

#### C1 ready·수동 시작·shared world

1. `MP2`, `MP3`, `MP1` 순서로 ready를 선택한다. 두 명만 ready일 때 시작 버튼이 비활성인지,
   전원 ready 뒤 `MP1`에게만 활성인지 캡처한다.
2. 비방장 두 플레이어가 전환 watcher와 4의 이동 절차 준비를, `MP1`이 시작 직후 이동 연속 절차
   준비를 보고한 뒤 `MP1`이 시작한다. 세 화면의 `startedAtMs`, `endsAtMs`, 라운드 번호가 같은지
   확인한다.
3. `waiting` 대기실에서는 이동할 수 없어야 한다. 시작 후 `round-started` 준비 단계에서는
   대기실이 닫히고 각자 월드를 탐색할 수 있어야 한다.
4. Mobile은 `모바일 조작` deck이 열려 있으면 접근성 이름 `뒤로` control로 먼저 닫고
   `shortcutGuideOpen=false`, world-help 제거, explore deck과 joystick 표시를 확인한다. Desktop도
   shortcut guide가 열려 있으면 `Escape`를 정확히 한 번 입력해 `shortcutGuideOpen=false`와 help UI
   제거를 확인한다. guide를 닫은 뒤 설정을 열어 소리 control을 `소리 꺼짐`으로 맞추고 접근성 이름
   `소리 음소거`를 확인한 뒤 설정을 닫아 `AUDIO-MUTED`를 보고한다. 입력 전 화면 경계·장애물을 피한
   이동 가능 방향 중 현재 avatar가 바라보는 방향과 다른 방향을 고른다. Desktop은 canvas focus 뒤
   `node .agents/skills/poke-lounge-agent-browser-test/scripts/desktop-arrow-hold.mjs <session> <Arrow>`를 한 번
   실행한다. 이 helper는 공식 `agent-browser` stream 입력으로 물리 방향키 code를 포함한 keyDown을 보내고
   50ms 뒤 같은 키의 keyUp을 보장한다. `agent-browser` 0.34.0의 CLI `keydown`은 방향키의 물리 code를
   보내지 않으므로 사용하지 않고, 유지 시간이 없는 `press`도 이동에 사용하지 않는다. Mobile은 해당
   joystick 방향을 100ms 이하로 한 번 입력한다. 변화가
   없을 때만 같은 방향으로 한 번 더 입력하고 다른 두 화면에 avatar 좌표·방향이 반영되는지 확인한다. 경계·장애물 방향이나 현재 바라보는 방향을 골라
   좌표·방향 변화를 만들지 못하면 `TEST-RUNNER`로 중단한다. 각 runner는 자신의 시작 전환을 관찰하면
   다른 runner의 timing field나 이동
   보고를 기다리지 않고 이 절차까지 연속·병렬 수행한다. 루트는 전원 보고 뒤 timing field와 동기화
   증적을 대조한다. 준비 `endsAtMs` 전에 전원 checkpoint를 끝내지 못하면 `TEST-RUNNER`로 중단한다.
5. 이동으로 야생전이 열리면 해당 화면을 캡처하되 파티 상태를 바꿀 수 있는 battle command를
   입력하지 않는다. 다른 두 플레이어의 world 진행이 유지되는지 확인하고 서버 경쟁 대진을
   기다린다. 첫 대진 참가자에게 competitive assignment가 생기면 로컬 야생전 대신 해당 전투가,
   seed 1 부전승이면 결승 assignment 시 해당 전투가 열려야 한다. 배정 뒤에도 야생전이 남으면
   `CODE-FAIL`이다.
6. 첫 대진 참가자는 준비 `endsAtMs + 15000ms`, seed 1은 첫 대진 `completedAtMs + 15000ms`까지
   자신의 authoritative room projection에서 UUID `competitive.matchId`와 server competitive battle
   scene을 확인한다. 배정 전 로컬 야생전과 배정 뒤 `matchId`·scene을 각각 캡처한다. 제한 시간까지
   배정이나 scene 전환이 없으면 민감값을 뺀 최신 room projection과 scene을 캡처하고
   `CODE-FAIL`로 중단한다.

#### C2 각 게임 라운드의 3인 대진

1. 준비 종료 뒤 세 화면에서 seed 1=`MP1`의 부전승과 seed 2=`MP2` 대 seed 3=`MP3` 첫 대진이
   같은지 확인한다. 첫 대진 참가자의 scene은 server competitive battle이어야 하며 준비 중 열린
   로컬 야생전이 남아 있으면 안 된다.
2. 두 전투 참가자는 입력 watcher와 다음 turn 반복 루프까지 준비한 뒤 공유 관리자 채널에 정확한
   `ACTION-ARMED` 메시지를 보낸다. 관리자가 두 보고를 대조하고 같은 match·turn의 `ACTION-GO`를
   보내기 전에는 누구도 첫 action을 제출하지 않는다. 시작 신호 뒤 Desktop은 fresh interactive
   snapshot에서 `Poke Lounge 대화형 게임 캔버스` ref를 얻어 `focus`한 다음 `Fight` Enter를
   입력한다. canvas `click`은 pointer confirm까지 발생시키므로 focus 용도로 사용하지 않는다.
   `move-select` 전환 뒤 fresh snapshot에서 canvas ref를 다시 얻어 `focus`하고 첫 공격 기술 Enter를
   입력한다. Mobile은 화면에 표시된 `Fight`, 첫 공격 기술을 차례로 touch한다. `ACTION-GO` 뒤 첫
   입력 전에는 screenshot이나 추가 관리자 보고를 기다리지 않는다. 한쪽 action이 2xx로 접수된
   서버 projection의 turn 진입부터 양쪽 모두 30초 turn deadline 안에 제출하며 이후 turn마다 관리자
   보고를 기다리지 않는다. deadline을 넘긴 플레이어는 해당 턴 행동만 생략되고 매치는 계속되어야 한다.
3. 각 입력은 5초 안에 `session-actions` 요청이 발생하는지 확인한다. 응답이 2xx이면 재입력하지
   않고, 자신의 `submittedPlayerIds` 관찰 또는 서버 revision·turn·status·terminal·다음 대진 중
   하나의 전진으로 반영을 확인한다. 두 번째 참가자의 제출로 turn이 즉시 처리되면 submitted
   배열이 비워질 수 있으므로 2xx와 상태 전진을 성공 증적으로 인정한다.
4. 요청 자체가 없으면 현재 phase와 focus를 캡처하고 같은 UI 절차를 한 번만 다시 수행한다. 두
   번째에도 요청이 없거나 응답이 non-2xx이면 `CODE-FAIL`로 중단하고 응답 code와 최신 snapshot을
   보존하며 내부 API로 대신 제출하지 않는다. `MP1`은 월드에 남아 이동할 수 있고 해당 대진
   행동을 제출할 수 없어야 한다.
5. 첫 대진 terminal 화면에서 같은 승자와 양 참가자의 원시 terminal HP 상태를 캡처한다. 서버가
   이미 결승을 배정했더라도 이 시점의 로컬 terminal 화면은 정상이다.
6. 로컬 `phase=ended`, `result` 존재와 화면 결과 control을 모두 확인한 시점을 UI terminal
   checkpoint로 삼아 승자와 패자가 먼저 결과를 캡처한다. visible·enabled 결과 control이 남아 있는
   동안에는 page reload를 금지하며 캡처가 끝나기 전에는 키나 touch를 보내지 않는다. 캡처 뒤
   Desktop은 canvas focus 후 Enter, Mobile은 화면의 `다음`을 정확히 한 번 입력하고 scene·match가
   바뀔 때까지 추가 입력을 금지한다. 같은 UUID의 서버 완료 증적은 마지막 action 2xx response의
   `status=completed`·`terminal`, room `competitiveTransitions` 또는 완료된 bracket match history 중
   하나에서 별도로 확인한다. terminal 참가자·승패는 반드시 이 같은 UUID의 완료 증적과 action
   요청 주체로 판정하며, 이미 다음 대진으로 바뀐 active competitive projection에서 추론하지 않는다.
   결과 확인 뒤에도 최신 projection이 없을 때만 안정된 전환 장면에서
   page reload를 정확히 한 번 수행해 자동 room GET을 관찰한다. atomic bracket 전진으로 현재 active
   competitive projection이 이미 다음 match `pending`이어도 정상이다. 이 캡처·결과 확인은 각
   runner가 연속 수행하고 관리자 승인을 기다리지 않는다. 승자는 `MP1`과의 결승 battle로, 패자는
   world로 전환하고 전투 action control이 없어야 한다. 세 화면에서 같은 결승 대진을 확인한다. 이
   시점에는 게임 라운드 점수가 아직 확정되지 않는다.
7. 결승 참가자들은 새 match의 `command`, turn 0과 입력 control을 확인하고 정확한
   `ACTION-ARMED`를 공유 관리자 채널에 보고한다. 관리자의 `ACTION-GO` 뒤 2~4의 행동 규칙으로
   terminal까지 진행한다. 결승 terminal도 6의 캡처 → 결과 확인 1회 → 추가 입력 금지 순서를
   관리자 승인 없이 연속 수행한다. 비참가자는 월드에서 대기하며 대진 상태만 관찰한다.
8. 결승 종료 뒤 세 화면에서 라운드 우승자, 해당 게임 라운드의 확정 terminal HP 점수와 누적
   순위를 대조한다. 1·2라운드 뒤에는 별도 ready 없이 탈락자를 포함한 세 명 모두의 다음 준비가
   시작되어야 한다.
9. 1~8을 게임 라운드 3까지 반복한다.

#### C3 최종 결과·정리·재현

1. 세 화면의 3라운드 누적 점수, 순위와 최종 우승자가 서버 snapshot과 같은지 확인한다.
2. 발견 실행은 파티 snapshot, 행동 순서, 라운드별 승자·점수와 최종 우승자를 민감값 없이
   관찰 결과로 저장한다.
3. `MP3`, `MP2`, `MP1` 순서로 한 명씩 정리한다. 같은 match의 결과를 아직 확인하지 않았고
   visible·enabled 결과 control이 있을 때만 C2의 결과 확인을 정확히 한 번 먼저 수행한다. 이미
   확인한 match의 cached `phase=ended` 또는 `result`만 남고 결과 control이 없으면 추가 키나 touch
   없이 leave 단계로 진행한다. Mobile world-help는 접근성 이름 `뒤로`, Desktop shortcut guide는
   `Escape`, settings overlay는 실제 접근성 `닫기`로 한 번 닫아 header leave hit target이 입력을
   받는지 확인한다.
   leave POST watcher를 먼저 설치하고 header leave를 한 번 입력한다. 즉시 POST가 발생하면 추가
   click을 금지하고, POST가 없으면서 confirm dialog가 표시될 때만 confirm의 leave를 한 번 입력한다.
   실제 leave POST가 정확히 한 번 발생해 2xx와 최신 revision, `connected=false` 또는 참가자 제거로
   반영된 뒤 다음 플레이어를 진행한다. POST 이후에는 자동으로 재시도하지 않는다. 전원이 입장
   화면으로 돌아오고 room이 `closed`, 모든 참가자가 `connected=false`로 수렴하는지 확인한다.
   완료된 tournament의 audit 참가자 행은 남을 수 있으며 연결된 ghost 참가자로 판정하지 않는다.
   동시 leave 복구는 `MP-ERROR-008`에서 별도 검증한다.
4. 같은 세 browser context의 저장 상태를 보존하고 새 임시 비밀번호를 사용해 같은 seed, 환경
   배정, 파티와 행동 순서로 재현 실행을 수행한다. 명중·급소·대미지 RNG로 승자와 점수는 달라질
   수 있으며, 각 실행 안에서 세 화면과 서버 결과가 일치하는지를 통과 조건으로 삼는다.
5. 완료 후 세 플레이어가 각각 문서 개정 필요 여부를 보고한다. 한 명이라도 개정 필요를
   보고하면 문서를 보강하고 다시 실행하며, 두 번 연속 전원이 개정 불필요로 판정하면 종료한다.

#### 중단·분류 기준

- `DOC-GAP`: 절차, 환경, 대진, 행동, 기대 결과 또는 캡처 기준이 없거나 서로 모순된다. 즉시
  중단하고 브라우저·서버 상태와 문서 위치만 보고한다.
- `CODE-FAIL`: 문서와 제품 규칙의 기대 결과는 명확하지만 화면, API, Socket 또는 DB가 다르게
  동작한다. 안전한 다음 checkpoint까지 증적을 보존한 뒤 관리자가 계속 여부를 정한다.
- `TEST-RUNNER`: `ACTION-GO` 전 입력, 2xx 뒤 같은 turn 재입력, Desktop battle의 stale ref 재사용·
  canvas focus용 click, 지정하지 않은 UI 입력 또는 서버 phase 전환 전에 필수 checkpoint를 끝내지
  못하거나 terminal 참가자를 다음 대진에서 추론한 경우처럼 runner가 절차를 위반했다. 제품 실패로
  세지 않고 새 입력을 즉시 중단해 증적을 보존한 뒤 room을 정리하고 같은 seed·환경 배정·파티·행동
  순서로 처음부터 다시 실행한다.
- `INFRA-BLOCKED`: 브라우저 실행 파일, 격리 DB, 포트 또는 서버 기동 문제로 제품 동작에 도달하지
  못했거나 이전 실행의 request route가 새 fixture를 오염시켰다. 제품 실패로 세지 않고 환경 로그를
  남긴다.

## 7. 필수 증적

| 번호 | 증적                                                   |
| ---- | ------------------------------------------------------ |
| `01` | 무작위 배정된 Desktop Web 입장 화면                    |
| `02` | 무작위 배정된 Mobile Web 390×844 입장 화면             |
| `03` | 최초 플레이어 접속 뒤 자동 생성된 방과 방장 상태       |
| `04` | 후속 플레이어 자동 참가 뒤 양쪽의 동일 참가자 목록     |
| `05` | Mobile 대기실의 두 참가자와 준비 상태                  |
| `06` | 한 명만 ready인 상태의 비활성화된 시작 버튼            |
| `07` | 전원 ready 뒤 방장에게만 활성화된 시작 버튼            |
| `08` | 방장 시작 뒤 같은 준비 종료 시각이 표시된 양쪽 화면    |
| `09` | 여섯 참가자가 모두 들어온 대기실                       |
| `10` | 7번째 사용자의 6명 정원 초과 안내                      |
| `11` | 시작 뒤 신규 참가자의 접속 거부 안내                   |
| `12` | 대기실 방장 이탈 뒤 다음 참가자에게 권한이 승계된 상태 |
| `13` | 한 사용자는 전투, 다른 사용자는 월드인 독립 상태       |
| `14` | 양쪽 플레이어의 같은 경쟁 전투 진행 상태               |
| `15` | 서버 확정 대진 결과와 terminal HP 라운드 점수          |
| `16` | 1·2라운드 종료 뒤 현재 누적 순위                       |
| `17` | 3라운드 누적 최종 순위와 우승자                        |
| `18` | 테스트 종료 후 입장 화면 또는 정리된 room 상태         |

3인 반복 실행은 아래 담당 플레이어가 checkpoint를 캡처한다. `전원` checkpoint는 세 화면에서
각각 남긴다.

| checkpoint           | 담당   | 필수 증적                                                                 |
| -------------------- | ------ | ------------------------------------------------------------------------- |
| `C0-HOST`            | `MP1`  | `MP1` 한 명, 방장, 파티 동기화 완료, 준비 전인 자동 생성 대기실           |
| `C0-JOINED`          | 전원   | 세 닉네임, `MP1` 방장, 세 파티 동기화 완료, 전원 준비 전, 타이머 미시작   |
| `C1-PARTIAL-READY`   | `MP1`  | 두 명 ready와 비활성 시작 버튼                                            |
| `C1-ALL-READY`       | 전원   | 전원 ready와 `MP1`에게만 활성인 시작 버튼                                 |
| `C1-WORLD`           | 전원   | 같은 준비 종료 시각, Desktop Chromium 1개·Mobile Chromium 2개 이동 동기화 |
| `C2-BYE`             | 전원   | seed 1 부전승, seed 2 대 3 대진, 참가·비참가 화면                         |
| `C2-FIRST-ACTION`    | 참가자 | 두 실제 UI 입력과 2xx 응답, submitted 또는 즉시 상태 전진                 |
| `C2-FIRST-TERMINAL`  | 전원   | 첫 대진 승자, 원시 terminal HP 상태, 결승 대진, 라운드 점수 미확정        |
| `C2-FIRST-CONFIRMED` | 전원   | 결과 확인 뒤 승자의 결승 battle, 패자의 world, 비참가자의 action 없음     |
| `C2-ROUND-RESULT`    | 전원   | 결승 뒤 게임 라운드별 우승자, 확정 점수, 누적 순위                        |
| `C3-FINAL`           | 전원   | 세 화면의 같은 최종 순위와 우승자                                         |
| `C3-CLEANUP`         | 전원   | 순차 leave 성공, 입장 화면 복귀, room `closed`, 전원 `connected=false`    |

각 screenshot은 시나리오 ID, browser, viewport와 시각을 함께 기록한다. 추가로 다음 JSON 또는
로그를 남긴다.

- commit SHA와 배포 URL
- 실행 seed와 플레이어별 Desktop Chromium 1개·Mobile Chromium 2개 배정 결과
- 공개 participant 수와 room status
- 예상된 409 한 건과 `POKE_LOUNGE_ROOM_FULL` code
- 자동 party snapshot, 수동 ready·start와 session action 요청 경로, competitive seat 요청 건수 0
- 공개 `hostPlayerId`, room status와 세 화면의 준비 시작·종료 시각
- 3인 참가 순서와 seed, 부전승, 대진별 참가자·승자, 게임 라운드별 terminal HP 점수
- 전투 입력별 화면 phase, 실제 keyboard·touch 입력, `session-actions` 응답과 submitted 반영
- terminal 결과 확인 전·후 scene과 다음 대진 참가 여부
- 발견·재현 실행의 파티 요약, 행동 순서, 최종 점수·우승자 비교
- console error, page error와 예상하지 않은 4xx/5xx
- 가로 overflow 여부

임시 비밀번호 원문, sessionId, token, cookie와 전체 Socket payload는 남기지 않는다.

## 8. 통과 기준

다음을 모두 만족해야 통과다.

1. `MP1`~`MP6`은 대기실에 참가하고 `MP7`은 정원 초과로 거부된다.
2. 최초 참가자가 방장이며 명시적 이탈이나 재접속 유예 만료 뒤 다음 참가자에게 승계된다.
3. party snapshot은 자동 동기화되지만 ready와 1라운드 준비는 자동 시작되지 않는다.
4. 2~6명이 모두 ready일 때 방장만 시작할 수 있다.
5. 방장 시작 뒤 모든 참가자의 준비 시작·종료 시각이 같고 정확히 3분이다.
6. 시작 뒤 신규 참가자는 거부되고 기존 identity 재접속은 허용된다.
7. 준비 취소로 `waiting`에 돌아오면 ready를 해제하고 대기실을 다시 연다.
8. Desktop 키보드와 Mobile 터치 이동이 시작 이후 서로의 화면에 반영된다.
9. 각 사용자의 파티·재화·전투 진행은 다른 사용자에게 공유되지 않는다.
10. 임시 비밀번호 원문과 identity credential이 URL, 저장소, 로그와 artifact에 노출되지 않는다.
11. 경쟁전은 competitive seat 없이 private session identity를 사용한다.
12. 3분 준비, 서버 권위 대진, terminal HP 점수와 3라운드 누적 순위가 규칙대로 진행된다.
13. 예상된 접속 거부 외에 예상하지 않은 4xx/5xx, page error와 console error가 없다.
14. Desktop과 Mobile에서 entry, 대기실, world, 챔피언십과 오류 화면이 frame을 벗어나지 않는다.
15. 3인 실행은 모든 게임 라운드에서 `MP1` 부전승, `MP2` 대 `MP3` 첫 대진과 이어지는 결승이
    세 화면에서 같고 비참가자가 다른 대진 행동을 제출할 수 없다.
16. 3인 발견·재현 실행 각각에서 세 화면의 라운드별 점수와 최종 우승자가 서버 판정과 같고,
    두 번 연속 세 플레이어 모두 문서 개정이 불필요하다고 판정한다.

## 9. 현재 자동화 근거와 공백

| 범위                      | 현재 근거                                                                                                                | 남은 공백                                      |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------- |
| 입장 입력·금지 control    | `room-entry.test.ts`, `poke-lounge.spec.ts`, `poke-lounge-mobile.spec.ts`                                                | 없음                                           |
| 임시 비밀번호 파생·비노출 | `room-entry.test.ts`, `server-room-snapshot-replay.test.ts`                                                              | 운영 artifact 수동 점검                        |
| 자동 create-or-join       | `poke-lounge-room.service.spec.ts`, `poke-lounge-room.e2e-spec.ts`, `poke-lounge-public-lobby.spec.ts`                   | 다른 비밀번호 세션 격리의 실제 browser 검증    |
| 방장·수동 ready·시작      | `poke-lounge-room.service.spec.ts`, `poke-lounge-multiplayer.spec.ts`, `poke-lounge-public-lobby.spec.ts`                | 3명 이상 실제 browser 시작 검증                |
| 6명 정원·7번째 거부       | `poke-lounge-room.service.spec.ts`, `server-room-snapshot-replay.test.ts`                                                | 실제 7 browser UI 통합                         |
| 동일 세션 재접속          | `poke-lounge-room.service.spec.ts`, `poke-lounge.gateway.spec.ts`                                                        | 정원 6명 상태의 실제 browser reload            |
| disconnect 유예           | `poke-lounge.gateway.spec.ts`, `poke-lounge-room-policy.spec.ts`                                                         | 실제 Socket 연결 중단·복귀                     |
| 위치 중계·identity 보호   | `poke-lounge.gateway.spec.ts`, `server-room-snapshot-replay.test.ts`                                                     | Desktop↔Mobile 실제 양방향 이동                |
| 독립 게임 진행            | `game-state-store.test.ts`, `server-room-snapshot-replay.test.ts`, Poke Lounge 전투 E2E                                  | 한쪽 전투·한쪽 월드의 실제 2 browser 동시 검증 |
| 5인 부전승·12대진         | `tournament-bracket.test.ts`, `poke-lounge-five-player-tournament.spec.ts`                                               | 없음                                           |
| 서버 권위 대진·3라운드    | `poke-lounge-room.service.spec.ts`, `redis-poke-lounge.repository.spec.ts`, `poke-lounge-five-player-tournament.spec.ts` | 운영 배포 환경 반복 실행                       |
| 이탈·점수·누적 순위       | `poke-lounge-room-policy.spec.ts`, `redis-poke-lounge.repository.spec.ts`, `poke-lounge-five-player-tournament.spec.ts`  | 동점 공동 우승 실제 browser fixture            |
| 오류·복구                 | `server-room-snapshot-replay.test.ts`, `server-room-error-copy.test.ts`, `poke-lounge-multiplayer.spec.ts`               | 운영 API·Socket 장애 수동 smoke                |

2026-08-24 격리 실행 `manual-1787548782726`에서 Desktop Chromium 2개, Desktop WebKit,
Mobile Chromium, Mobile WebKit의 독립 context 5개가 방 `76T2XH`를 함께 플레이했다. worker 1,
retry 0, 전체 실행 시간 제한 없이 게임 라운드 3개와 단일 제거 대진 12개를 완료했다. 다섯 화면이
`Tester 3` 우승에 수렴했고 전원 명시적 퇴장 뒤 Redis world key 부재를 확인했다. 총 112개 서버
권위 move, HTTP 5xx·page error 0건과 상황별 screenshot 54장이 기록됐다.

Desktop Chromium과 Mobile WebKit의 최종 우승 화면에서 도움말·설정 overlay가 닫힌 상태를,
Mobile WebKit의 퇴장 화면에서 입장 화면 복귀를 육안 확인했다. 로컬 증적은
`output/playwright/poke-lounge-five-player/manual-1787548782726/`에 있으며 실행 산출물이므로
커밋하지 않는다. 남은 운영 인수 범위는 실제 배포 URL 반복 실행, 동점 공동 우승 browser fixture와
정원 검증용 7개 context다.

## 10. 기준 문서

- [Poke Lounge 게임 규칙 인덱스](./poke-lounge-rules/index.md)
- [Poke Lounge Game Concept](./poke-lounge-game-concept.md)
- [Playwright 테스트](./playwright-testing.md)
