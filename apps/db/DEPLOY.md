# Web·Rust API·계산 워커 배포와 환경

구현 대조: `13f230f`와 현재 작업 트리 · 2026-10-11 KST. 이 문서는 Git에서 제외된 내부 `docs/` 없이도 배포 조건을 확인할 수 있는 안내다. 운영 값·비밀번호·실제 방 ID는 기록하지 않는다.

## 배포 경로

[CI](../../.github/workflows/ci.yml)의 `verify`가 성공한 뒤 [Deploy](../../.github/workflows/deploy-api.yml)를 호출한다. `main`의 push 또는 `main`에서 CI를 수동 실행한 경우만 배포하며 PR 검증은 배포하지 않는다. runner는 `[self-hosted, linux, x64, poke-lounge]` 라벨과 Docker Compose가 필요하다. 배포 체크아웃은 `github.sha`다.

| 설정                       | 현재 소비 위치/의미                                                                                                                                                                                                |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `NEXT_PUBLIC_API_URL`      | 저장소 variable. 브라우저가 실제 접근할 API 주소이며 이미지 빌드 인자로 들어간다. 변경 시 웹 이미지를 다시 빌드한다.                                                                                               |
| `CORS_ORIGINS`             | 저장소 variable. 실제 웹 origin 목록.                                                                                                                                                                              |
| `RUST_API_TRUSTED_PROXIES` | 선택. 앞단 리버스 프록시(및 Docker 게이트웨이) CIDR. 설정 시 X-Forwarded-For 오른쪽부터 첫 비신뢰 IP로 요청 한도를 센다. 비우면 접속 peer IP 기준. 프록시가 X-Forwarded-For를 덮어쓰거나 추가하도록 설정해야 한다. |
| `DB_PASSWORD`              | 필수 저장소 secret. 문서·로그에 출력하지 않는다.                                                                                                                                                                   |
| `BATTLE_WORKER_TOKEN`      | 필수 저장소 secret. Rust API와 계산 워커 사이 인증에 사용한다.                                                                                                                                                     |
| `BIND_ADDRESS`             | 배포 workflow 기본 `127.0.0.1`. Compose 단독 실행 기본은 `0.0.0.0`이므로 외부 노출을 별도 확인한다.                                                                                                                |
| `WEB_PORT` / `API_PORT`    | workflow 기본 3100/3101, Compose 단독 기본 3000/3001.                                                                                                                                                              |

위 값은 템플릿/워크플로 기준이며 실제 운영 환경의 설정값을 조회한 결과가 아니다.

## Compose 실행 순서

[compose.yaml](../../compose.yaml)은 PostgreSQL·Redis·Node 마이그레이션·Node 계산 워커·Rust API·Web을 실행한다. 마이그레이션과 계산 워커는 Node 이미지를 공유하고 Rust API는 별도 이미지다.

```text
PostgreSQL healthy → migrate: migration:run → rom-data:import
계산 워커 healthy + migrate 성공 + PostgreSQL/Redis healthy → Rust API ready → Web
```

계산 워커는 `http://battle-worker:3021`에서 Rust API의 전투 계산 요청을 처리한다. Rust API는 Compose 내부 `0.0.0.0:3011`에서 실행하고 외부 `API_PORT`로 노출된다. 내부 워커 URL과 브라우저용 `NEXT_PUBLIC_API_URL`을 혼동하지 않는다. PostgreSQL과 Redis는 Compose 내부 호스트명 `postgres`, `redis`로 접근한다.

로컬에서 전체 스택을 실행할 때:

```bash
# 개발용 값은 환경 또는 저장소 루트 .env에서 설정한다.
# 다른 작업의 스택과 포트/프로젝트 이름이 충돌하지 않는지 먼저 확인한다.
docker compose up --build --detach --wait --wait-timeout 180
```

배포 workflow는 같은 명령에 `--remove-orphans`를 추가한다. PostgreSQL·Redis named volume을 유지한다. `docker compose down -v`는 데이터 삭제이므로 일반 재시작/복구 절차에 사용하지 않는다.

## 운영 로그 보관

Rust API는 콘솔과 `poke-lounge-runtime-logs` 외부 볼륨의 `/var/log/poke-lounge/api.jsonl`에 같은 JSON 로그를 기록한다. 외부 볼륨이므로 컨테이너 재생성이나 Compose 볼륨 삭제 대상에 포함되지 않는다. 파일은 20MiB를 넘긴 완전한 JSON 행 단위로 순환하며 이전 파일 24개를 유지한다. 최신 두 순환 파일은 원문, 나머지는 gzip이며 전체 원문 기준 보관량은 약 500MiB다. 보관 기간은 발생량에 따라 달라진다.

배포 workflow가 외부 볼륨 생성과 UID 10001 쓰기 권한을 준비한다. 로컬에서 위 Compose 명령을 직접 실행할 때는 다음 준비를 먼저 수행한다.

```bash
docker volume create poke-lounge-runtime-logs
docker run --rm -v poke-lounge-runtime-logs:/logs alpine:3.20 \
  sh -c 'chown 10001:10001 /logs && chmod 0700 /logs'
```

기존 컨테이너 로그의 배포 전 gzip 보관·30일 정리는 유지한다. 새 파일 로그는 재시작 후에도 이어 쓰며, 종료 시 큐를 비운다. 정상 health 요청은 debug, 4xx 또는 1초 이상 걸린 요청은 warn, 5xx는 error로 기록한다. 명령 ID·방 생성 회차·배포 SHA·요청 ID로 브라우저 오류와 서버 처리를 연결할 수 있다. 요청 본문·인증 토큰·원본 세션 ID는 수집하지 않는다.

최신 API 파일 로그를 읽을 때는 읽기 전용 마운트를 사용한다.

```bash
docker run --rm -v poke-lounge-runtime-logs:/logs:ro alpine:3.20 \
  tail -n 100 /logs/api.jsonl
```

### 브라우저·계산 실패 추적

- `browser.error`의 `timestamp`는 서버 수신 시각, `occurred_at_ms`는 브라우저에서 오류를 포착한 시각이다. 장애 후 지연 전송을 조사할 때 둘을 구분한다. 브라우저 시계가 부정확할 수 있으므로 서버 요청 기록도 함께 확인한다.
- `report_id`는 재전송·새로고침 복구 후에도 유지한다. 응답 유실이나 전송 중 화면 오류 코드가 추가되면 같은 ID가 다시 기록될 수 있다. 같은 ID의 보고를 연결하고 `delivery_attempt`와 `error_text` 안의 원인·최근 동작을 확인한다. `release`는 오류 발생 당시 웹 버전, `server_release`는 수신한 API 버전이다.
- 브라우저는 정제된 보고를 탭별 `sessionStorage`에 최대 16건·직렬화 문자열 200,000자 이내로 보관하고, 24시간이 지난 보고는 다음 복구·전송 처리 때 폐기한다. 새로고침·같은 탭 페이지 이동 후 복구하며 온라인 복귀 때 재전송한다. 탭 종료·저장소 삭제·저장 차단·브라우저 강제 종료까지 전달을 보장하지 않는다.
- 전송은 한 번에 하나, 시도당 5초 제한, 분당 최대 10회(배경 기록 2회)다. 네트워크 실패·429·5xx는 최대 60초 간격으로 재시도하며 전송량 제한은 폐기 대신 지연한다. 다른 4xx는 재전송하지 않는다. 큐가 가득 차면 배경 기록, 일반 API 오류 순으로 중요한 화면 오류에 자리를 내준다. 보관 한도·만료·중복·저장 실패 수치는 `error_text.delivery`에 남는다.
- Next의 클라이언트 초기 실행 단계에서 오류 리스너를 설치한다. 화면 코드·이미지·스타일 등 같은 origin의 허용된 리소스 경로와 히스토리 이동·페이지 캐시 복원·탭 숨김/복귀·온라인 상태를 기록한다. URL 쿼리·히스토리 state·입력 내용·파티 원문은 기록하지 않는다. 진단 코드 자체가 로드되기 전의 실패는 수집할 수 없다.
- 파티·전투 검증 실패는 API 영속 로그의 `compute.rejected`에서 `reason`을 확인한다. 예: `active-pokemon-fainted`, `hp-out-of-range`, `schema-invalid`, 파티 제출 규칙 `level-growth`·`move`·`catch-species`. 파티 제출 거부는 `room.party_rejected`의 `rule`에도 같은 값이 남는다. 예상하지 못한 계산 예외는 `error_name`과 경로·따옴표 값을 지운 `error_message`로 원인을 읽는다. `issues`는 최대 8개의 검증 코드·허용된 필드 경로이며 값·메시지·동적 플레이어 키를 포함하지 않는다. `frames`는 최대 4개의 코드 파일명·행·열이다. `compute_request_id`로 워커의 `compute.failed`와 연결하고 HTTP span의 요청 ID·명령 ID로 브라우저 요청을 연결한다.
- 워커는 실행 시간초과·큐 대기 시간초과·비정상 종료·프로토콜 불일치를 구분하고 대기 시간(`queueMs`)을 남긴다. API는 워커 연결 실패와 잘못된 응답을 별도로 기록한다. `backend.owner_lost`의 `reason`·`storage_kind`는 실제 소유권 불일치와 Redis 오류 분류를 구분하는 근거이며, 이 이벤트 이름만으로 소유권 만료를 단정하지 않는다.

이 기록은 진단용이며 오류를 자동 복구하거나 게임 규칙·파티 검증 조건을 바꾸지 않는다. 운영 반영은 Web·Rust API·계산 워커 배포 후 적용된다.

## DB 마이그레이션의 실제 변경 범위

**기존 스키마가 모두 보존되는 구현이 아니다.** `DropLegacyPokeLoungePostgresState1795132800000`은 다음 레거시 테이블을 잠그고 비어 있는지 확인한 뒤 제거한다.

`game_poke_lounge_state`, `poke_lounge_room`, `poke_lounge_room_command`, `poke_lounge_competitive_seat`, `poke_lounge_competitive_match`, `poke_lounge_competitive_action`.

예상 테이블이 없거나 하나라도 데이터가 남아 있으면 예외로 중단한다. 데이터를 자동 이전하거나 강제로 지워서 통과시키지 않는다. `down()`도 되돌리기를 거부하는 비가역 정리다. 적용 전에 마이그레이션 이력·잔존 데이터·검증된 백업을 확인한다. 코드를 되돌리는 것만으로 삭제된 스키마가 복구되지 않는다.

ROM import는 `poke_lounge_rom_document` 테이블에 검증한 문서를 upsert하고 그 테이블에서 현재 import 집합 밖의 키를 제거한다. 이 작업의 삭제 범위를 일반 계정/게임 테이블까지 확대해 설명하지 않는다. 변경 시 DB와 Web/API 공통 데이터의 호환성을 확인한다.

근거: [레거시 정리](src/migrations/1795132800000-drop-legacy-poke-lounge-postgres-state.ts), [ROM importer](scripts/import-poke-lounge-rom-data.ts), [데이터 소스](src/data-source.ts). production의 `DB_SYNCHRONIZE=true`는 금지되어 있다.

## 실행 전·후 확인

실행 전에는 백업, 마이그레이션 이력, 디스크·볼륨, API 주소·CORS·접근 범위를 확인한다. 설정 전체를 출력하면 secret이 포함될 수 있으므로 마스킹 없이 공유하지 않는다.

배포 workflow는 API `/health`, `/health/ready`, `/poke-lounge/rooms/public`과 Web `/ko-KR`을 확인한다. 게임 주소는 `/{locale}`, 소개 주소는 `/{locale}/intro`이며 기존 긴 경로는 현재 주소로 리디렉션한다. 이 응답만으로 ROM 데이터·AI·다인 전투가 정상이라고 판단하지 않는다. 직접 플레이의 기대 동작은 [현재 게임 흐름](../../README.md)을 기준으로 확인한다.

CI는 정적 검사와 프로덕션 빌드만 수행한다. 자동 테스트와 Storybook은 제거했다. 플레이어 테스트는 [직접 조작 지침](../../PLAYER_TESTING.md)에 따라 실제 브라우저에서 별도로 수행하며 CI 성공을 플레이 PASS로 해석하지 않는다.

## 장애 확인·복구 경계

`migrate` 실패라면 API를 강제로 먼저 띄우지 않는다. 어떤 마이그레이션 또는 ROM 문서가 실패했는지 확인하고 데이터 보존을 우선한다. 전투 계산이 멈추면 `battle-worker`의 준비 상태와 Rust API의 워커 연결·토큰 설정을 확인한다. AI 준비가 멈추면 Rust API의 Redis·ROM 데이터·계산 워커 연결을 확인한다. 웹 요청 실패는 브라우저용 API URL·CORS와 내부 컨테이너 주소를 구분한다.

방은 Redis, ROM 문서는 PostgreSQL에 있으므로 한 저장소의 복원으로 전체 게임 상태가 복구된다고 가정하지 않는다. 애플리케이션 버전 롤백과 DB 복원은 별도 판단이다. 검증된 백업/복원 절차와 운영자 승인이 없이 `FLUSHDB`, 테이블 삭제, volume 삭제, migration 이력 조작을 실행하지 않는다.

로컬 직접 실행 준비는 [README](../../README.md)의 절차를 사용한다. `docs/`가 존재하는 개발 환경의 내부 운영 기록은 보조 자료이며, 과거 테스트 통과 기록을 현재 배포의 검증으로 재사용하지 않는다.
