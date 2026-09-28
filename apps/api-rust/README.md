# Rust 게임 백엔드

브랜치: `feat/rust-backend-migration`, 시작점 `main@cfcd039`.

**대기실 실험 서버가 아니라, 실제 프런트와 연결된 로컬 게임 서버다.** 방 생성·참가·준비, 스타터 준비 장벽, 3라운드 탐험·토너먼트, AI, 누적 점수·최종 결과, WebSocket 구독·재접속을 실제 실행 경로에서 처리한다. `migration-draft/`는 이전 중간 코드 보관용이며 실행 대상이 아니다.

운영 `compose.yaml`은 Rust API와 `apps/battle-worker` 계산 워커를 실행한다. 기존 NestJS API 코드는 런타임 서버로 실행하지 않고 PostgreSQL migration과 ROM 데이터 import를 위한 빌드 도구로만 재사용한다. 운영 웹은 `NEXT_PUBLIC_POKE_BACKEND=rust`로 빌드하며 기존 외부 API 포트 계약은 유지한다.

## 로컬 실행

저장소 루트에서 Docker Desktop, Node.js 22+, pnpm 및 설치된 워크스페이스 의존성을 준비한 뒤 실행한다. 호스트에 Rust를 설치하지 않아도 컴파일러와 서버는 Docker에서 실행된다.

```sh
pnpm install --frozen-lockfile
pnpm dev:rust
```

브라우저: `http://127.0.0.1:3300/ko-KR/game/poke-lounge`

명령은 공통 엔진·계산 워커·마이그레이션 도구·Rust를 빌드하고, 독립 PostgreSQL·Redis를 준비한 뒤 스키마/정적 게임 데이터를 가져온다. 계산 워커와 Rust 준비 상태를 확인한 후 Next.js를 Rust 연결 모드로 시작한다. 기존 NestJS API나 BullMQ 게임 워커는 실행하지 않는다. 현재 TypeScript 기반 스키마/정적 데이터 가져오기 명령만 개발 준비 도구로 재사용한다.

| 구성                 | 로컬 주소 / 역할                                 |
| -------------------- | ------------------------------------------------ |
| 웹                   | `127.0.0.1:3300`                                 |
| Rust API / WebSocket | `127.0.0.1:3011`                                 |
| 로컬 PostgreSQL      | `127.0.0.1:35432`, 독립 DB·볼륨                  |
| 로컬 Redis           | `127.0.0.1:36379`, 독립 볼륨                     |
| TypeScript 계산 워커 | Compose 내부 `battle-worker:3021`, 호스트 비공개 |

환경은 `compose.rust-local.yaml`에 정의한다. `compose.rust.yaml`은 이 파일을 포함하는 이전 이름 호환용이다. 운영 `compose.yaml`과 겹쳐 실행하는 오버레이가 아니다. 이미 3300 포트를 사용 중이면 그 웹 프로세스를 먼저 종료한다. 재실행 시 새 빌드를 반영하도록 이 로컬 스택의 API·계산 워커를 재생성하므로 진행 중인 로컬 플레이를 먼저 끝내는 것이 좋다.

`Ctrl+C`로 웹을 끝낸 뒤 다음 명령으로 로컬 컨테이너도 중지한다. 볼륨은 삭제하지 않는다.

```sh
pnpm dev:rust:stop
```

개발 DB 비밀번호와 워커 토큰은 Git 제외 경로 `output/rust-local/local.env`에 최초 자동 생성된다. 파일 권한은 `0600`이고 기존 파일은 덮어쓰지 않는다. 이 파일을 지우고 기존 DB 볼륨만 남기면 생성된 비밀번호와 DB 비밀번호가 달라질 수 있다. 토큰을 브라우저 번들·`NEXT_PUBLIC_*`에 넣지 않는다.

웹은 `NEXT_PUBLIC_POKE_BACKEND=rust`일 때 네이티브 WebSocket 어댑터를 선택하며 운영 빌드는 이 값을 `rust`로 고정한다. 로컬 `pnpm dev:rust`도 같은 연결 모드를 사용하지만 출력·타입 설정은 `.next-rust-local`, `tsconfig.rust-local.json`으로 분리한다. 실행기가 종료되면 `next-env.d.ts`의 Next 자동 생성 참조만 원래 내용으로 복원하고 외부 편집은 덮어쓰지 않는다.

## 책임과 안정성 규칙

Rust가 방·참가자·라운드·대진·점수·명령 기록의 저장을 결정한다. 기존 `@poke-lounge/battle` / `@pkmn/sim@0.10.11`은 `apps/battle-worker`의 계산 전용 프로세스에서 재사용한다. 계산 워커는 방을 저장하거나 다음 라운드를 시작하지 않는다. 요청·응답의 요청 ID, 방 생성 회차 ID, 저장 버전, 엔진 버전을 확인한 뒤 Rust가 결과를 반영한다.

방 코드는 입장용이고, 생성 회차마다 새 `roomInstanceId`를 발급한다. 프런트는 이를 저장하고 HTTP/소켓 재접속에도 전달한다. 같은 코드를 다른 방이 재사용해도 이전 생성 회차의 명령을 적용하지 않는다. 기존/새 백엔드의 브라우저 세션 저장 키도 분리했다.

같은 방은 상한이 있는 전담 태스크 큐에서 순차 처리한다. 상태와 중복 방지 기록은 Redis Lua로 함께 저장하며 저장 버전 비교와 서버 소유권 검사를 거친다. 공개 revision과 내부 저장 버전을 분리했다. 결과를 받지 못한 명령은 같은 ID로 재시도하고, 불확실한 메모리 상태를 다음 저장의 기준으로 삼지 않는다.

현재는 단일 활성 Rust 서버 구성이다. 15초 임대를 3초마다 갱신하고 실제 저장 시 소유자를 다시 검사한다. Redis failover·다중 서버 분산 합의까지 보장하는 구현은 아니다.

세션 상한 2시간은 탐험 시간과 독립적이다. 대기실 상한은 10분, 첫 구독 유예 15초, 재접속 유예 60초, 종료 데이터 보관 60초다. 기한에는 Redis 시각을 사용한다. 종료된 방은 다시 진행 상태로 바꾸지 않는다. 기존 타이밍을 임의로 가속하지 않았고 전투 턴 제한은 30초다.

실시간 전송은 Rust 네이티브 WebSocket이다. 구독 시 세션/참가자/생성 회차를 확인하고 Origin, 메시지 크기, 연결 수, 입력 빈도, 보내기 제한시간을 적용한다. 지연된 수신자는 전체 스냅샷으로 복원하고 이전 연결의 이동 입력을 무제한 버퍼링하지 않는다. WebRTC는 추가하지 않았다.

ROM/상점 자료는 기존 PostgreSQL 스키마에서 읽으며 원래 정적 데이터 해시의 JSON 속성 순서를 맞춰 검증한다. 공개 기록 조회 경로는 이식했지만 전체 기록 API 실사용 검증은 별도다. 계정 인증 비활성 정책은 유지한다. MCP 연결은 이 로컬 플레이 범위에 포함하지 않았다.

## 공개방 백엔드 기반

공개방은 자동 매칭과 분리해서 단계적으로 구현한다. 현재 1차 백엔드 계약은 다음과 같다.

- `POST /poke-lounge/rooms`: `visibility: private | public`을 받으며 생략 시 `private`이다. `public`이어도 기존 공개방을 자동 탐색하지 않고 새 방을 만든다.
- `GET /poke-lounge/rooms/public`: 활성 공개방의 방 코드, 생성 회차, 상태, revision, 참가자 수, 정원, 탐험 시간, 만료 시각과 `joinable` 요약을 반환한다. 비공개·완료·폐쇄·만료 방은 제외한다.
- `POST /poke-lounge/rooms/:code/join`: 공개방 목록에서 선택한 특정 방에 직접 참가하는 기존 경로를 재사용한다.
- `POST /poke-lounge/rooms/quick-play`: 기존 호환 경로로 격리되어 있으며 공개방 목록/직접 참가 흐름이 안정된 뒤 마지막 단계에서 자동 참가 UX에 연결한다.

즉 공개방 생성과 자동 참가는 서로 다른 동작이다. 이번 단계에서는 서버가 사용자의 방 선택을 대신하지 않는다.

## 실제 확인한 범위

`output/rust-local-play-20260916/`에 로컬 빌드·실행 로그와 브라우저 캡처를 보존했다. 실제 UI에서 비공개 방 생성 → 준비 → 스타터 선택 → 탐험 중 새로고침/같은 파티와 시간으로 복귀 → 1~3라운드 → 최종 결과 → 설정/방 나가기/확인 → 입장 화면 복귀를 확인했다.

첫 전체 경로에서 플레이어는 공동 3위·누적 135점으로 완료했다. 전투 제한시간 기본 행동이 포함돼 있으며, 이를 수동 기술 제출 성공 실적으로 세지 않았다. 모든 버튼·브라우저·다인 접속·모바일 잠금/네트워크 변경·서버 장애 복구까지 검증한 결과는 아니다. 최종 결과가 수신된 후 종료 데이터가 정리되면 연결 끊김 표시가 나타날 수 있지만 확인한 화면에서는 결과가 유지됐다.

## 개발 검사

```sh
cargo fmt --all --check
cargo check --workspace --locked
cargo clippy --workspace --all-targets --locked -- -D warnings
cargo build --workspace --release --locked
pnpm --filter @poke-lounge/battle-worker type:check
pnpm --filter @poke-lounge/web exec tsc --noEmit -p tsconfig.rust-local.json
```

컴파일·타입·린트·포맷은 개발 검사이지 플레이어 테스트를 대신하지 않는다. 실제 검증 방법은 루트 `PLAYER_TESTING.md`를 따른다. API 직접 조작, 상태 주입, 자동 플레이 루프, 단위/API/E2E 테스트 runner를 추가하거나 실행하지 않았다.

## 운영 전환과 남은 검증

운영 이미지는 Rust API, TypeScript 계산 워커, Rust 연결 모드 웹으로 구성한다. 배포 게이트는 Rust `/health/ready`와 공개방 목록 경로까지 확인해 기존 Nest 런타임이 남아 있는 경우 성공으로 처리하지 않는다. 기존 PostgreSQL·Redis 볼륨과 외부 API 포트는 유지한다.

수동 기술·강제 교체·취소·중복 입력, 여러 사람이 동시에 참가하는 경우, Safari·삼성 인터넷·카카오 브라우저, 화면 잠금과 네트워크 전환, 서버/워커 재기동은 계속 운영 검증 대상이다. 배포 전 존재하던 Nest 방 상태는 Rust 전용 Redis namespace로 승계하지 않으므로 전환 이후 새 방을 기준으로 검증한다.
