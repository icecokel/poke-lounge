# Poke Lounge 계산 전용 워커

기존 `@poke-lounge/battle`과 `@pkmn/sim@0.10.11` 실행기를 별도 Node.js 프로세스와 worker thread 풀로 분리했다. 게임의 최종 상태 관리자는 될 수 없다. 방·참가자·점수·라운드·명령 처리 기록을 저장하거나 변경하는 기능과 DB 연결이 없다.

현재 `apps/api-rust/src/compute.rs`를 통해 Rust 로컬 게임 서버에 연결돼 있다. `pnpm dev:rust`가 별도 내부 서비스로 실행하며 기존 NestJS API나 BullMQ를 게임 런타임으로 사용하지 않는다. 운영 배포에는 아직 연결하지 않았다.

## 구현

계산 요청은 프로토콜 버전, 요청 UUID, 방 생성 회차 UUID, 상태 revision, 엔진 버전을 포함한다. 응답은 같은 메타데이터와 계산 결과만 반환한다. 입력 범위는 Zod로 검사하고 파티 수치·행동 유효성은 기존 공통 엔진을 사용한다.

지원하는 계산은 파티 정규화·회복, AI 초기 파티, 전투 초기화, 행동 검증, 턴 계산, AI 행동 선택, 기권 결과 계산, AI 필드 진행이다. 계산 결과가 현재 게임에 여전히 유효한지와 실제 저장 여부는 연결될 Rust 서버가 결정해야 한다.

전투 계산은 최대 4개 worker thread에서 처리한다. 전체 대기·처리 요청 상한은 64개이고 작업 제한시간은 8초다. 제한시간을 넘기거나 실패한 thread는 종료 후 교체한다. 본문·응답 상한은 각각 8MiB다. 계산 thread 환경변수는 `NODE_ENV`와 게임 데이터 경로만 전달한다.

`/compute`와 `/health`는 모두 별도 `X-Worker-Token`을 요구한다. 공개 프런트엔드가 호출하거나 토큰을 전달받는 API가 아니다. 토큰은 `BATTLE_WORKER_TOKEN` 또는 `BATTLE_WORKER_TOKEN_FILE` 경로의 파일로 주입하며 최소 32바이트다. 기본 바인딩은 `127.0.0.1:3021`이다.

## 빌드와 실행 설정

저장소 루트에서 공통 패키지를 먼저 빌드한다.

```sh
pnpm build:poke-lounge-battle
pnpm --filter @poke-lounge/battle-worker build
```

실행은 별도 환경변수를 준비한 후 `pnpm --filter @poke-lounge/battle-worker start`를 사용한다. `BATTLE_WEB_ROOT` 기본값은 worker 패키지 기준 `../web`이며 커밋된 추출 게임 데이터와 맵을 읽는다. 잘못된 메타데이터나 누락된 자료가 있으면 준비된 worker로 취급하지 않는다.

`BATTLE_WORKER_HOST`와 `BATTLE_WORKER_PORT`로 수신 주소를 지정할 수 있지만 운영 공개 포트로 노출하면 안 된다. 실제 배포용 내부 네트워크·토큰 배포·Rust 준비 상태 점검 연결은 아직 반영되지 않았다.

## 검증 범위

TypeScript 빌드와 타입 검사는 개발 검사다. 계산 정확성, 제한시간 발생 시 복구, Rust와의 실제 요청·응답, 플레이어 3라운드 완주 검증을 대신하지 않는다. 테스트 runner, 자동 API 호출, 상태 주입은 추가하지 않았다. 실제 플레이 검증은 저장소의 `PLAYER_TESTING.md`를 따른다.
