# 운영 오류 추적

운영 스택은 `compose.yaml`의 `web`, `api`(Rust), `battle-worker`를 사용한다. 브라우저 오류는 API의 `browser.error` JSON 로그로 모인다. API는 모든 HTTP 응답에 `X-Request-Id`를 붙이고, 브라우저가 보낸 UUID v4 요청 ID를 그대로 사용한다. 워커 계산 실패는 `compute_request_id`/`requestId`로 API와 워커에서 이어진다.

## 문제 발생 시 조회

운영 호스트에서 실행한다. `docker compose logs`는 배포 비밀 환경변수를 요구하므로 조회에는 컨테이너 이름을 지정하는 `docker logs`를 사용한다. 과거 브라우저 오류 로그에는 방 코드와 세션 ID가 포함될 수 있으므로 로그 공유 범위를 운영 담당자로 제한한다. 현재 프론트는 방 접속 코드와 세션 ID를 전송하지 않는다. 요청·응답 본문과 인증 토큰은 기록하지 않는다.

```bash
# 최근 오류: FE 수집 이벤트, API 실패, 소켓 오류, 전투 계산 실패
for name in poke-lounge-api-1 poke-lounge-battle-worker-1 poke-lounge-web-1; do
  docker logs --since 2h --timestamps "$name" 2>&1
done | grep -E 'browser.error|api.error|compute.failed|compute.timeout|socket.*error|api.request' | grep -v '"route":"/health'

# 화면 코드 11004의 단계와 오류 텍스트를 사람이 읽기 좋게 출력
docker logs --since 2h poke-lounge-api-1 2>&1 |
  jq -Rr 'fromjson? | select(.fields.event == "browser.error" and .fields.user_code == "11004") | "\(.timestamp) step=\(.fields.startup_step)\n\(.fields.error_text)"'

# 브라우저 오류의 related_request_id 또는 HTTP 응답의 X-Request-Id로 연관 기록 조회
for name in poke-lounge-api-1 poke-lounge-battle-worker-1; do
  docker logs --since 24h --timestamps "$name" 2>&1
done | grep -F '여기에-요청-UUID'

# API compute.failed의 compute_request_id를 워커 requestId와 대조
for name in poke-lounge-api-1 poke-lounge-battle-worker-1; do
  docker logs --since 24h --timestamps "$name" 2>&1
done | grep -F '여기에-계산-UUID'

# room_instance_id로 비동기 방 명령, 틱, 소켓, 계산 기록 연결
for name in poke-lounge-api-1 poke-lounge-battle-worker-1; do
  docker logs --since 24h --timestamps "$name" 2>&1
done | grep -F '여기에-방-인스턴스-UUID'

# 오류 시점의 화면·요청·최근 행동 읽기 (새 프론트의 error_text는 JSON 문자열)
docker logs --since 2h poke-lounge-api-1 2>&1 |
  jq -R 'fromjson? | select(.fields.event == "browser.error") | {timestamp, code: .fields.code, user_code: .fields.user_code, request_id: .fields.related_request_id, detail: (.fields.error_text | fromjson?)}'
```

## 배포 이전 기록

배포 직전에 기존 Web·API·전투 워커·마이그레이션·DB 컨테이너의 로그를 `poke-lounge-trace-archive` Docker 볼륨에 gzip으로 저장한다. 컨테이너가 교체된 뒤에도 같은 요청·계산 ID로 조회할 수 있다.

```bash
# 보관된 파일 목록
docker run --rm -v poke-lounge-trace-archive:/archive:ro alpine:3.20 ls -1 /archive

# 교체 이전 컨테이너의 연관 기록
docker run --rm -v poke-lounge-trace-archive:/archive:ro alpine:3.20 sh -c '
for file in /archive/*.log.gz; do
  if gzip -dc "$file" | grep -F "$1"; then
    echo "archive: ${file##*/}"
  fi
done' sh '여기에-요청-또는-계산-UUID'
```

`api.request`의 `route`는 템플릿 경로이며 요청 본문은 기록하지 않는다. `browser.error`의 기존 최상위 계약은 유지한다. 프론트는 방 코드·세션 ID·User-Agent를 생략하며, 검증된 요청 UUID·방 인스턴스 UUID·40자리 release SHA·화면 오류 코드·공개 정적 리소스 경로를 보낸다. `error_text`는 **JSON을 담은 문자열**이며 다음 값을 포함한다.

- `at`, `context`: 오류 시각과 당시 scene·round·phase·서버 revision·roomInstanceId. 없는 값은 생략한다.
- `request`: 요청 생성 시의 X-Request-Id, 기존 commandId, 메서드와 익명화된 route, 실패 stage, 확인된 HTTP status, causeType.
- `causes`: name·message·최대 4개 스택 프레임과 cause·transportCause·parseCause·originalError. 최대 8개 원인과 깊이 4로 제한하며, 순환 참조·throwing getter·문자열 예외를 처리한다.
- `breadcrumbs`: 메모리에서 최근 24개의 씬·라운드·연결 변화, 주요 명령 전송·응답·실패를 시간순으로 저장한다. 프레임·이동 좌표·키 입력·전체 게임 상태는 수집하지 않는다.
- `delivery`: 이전 전송 성공·실패, 최종 전송 포기·예산 제한·큐 제한·중복 억제의 누적 건수. 다음 오류가 없으면 서버에서 최신 카운터를 볼 수 없으며, 프론트 모듈의 `getClientDiagnosticStats()`로 같은 값의 복사본을 읽을 수 있다.

`fetch_failure`는 fetch가 실패했다는 관측값이다. DNS·CORS·서버 중단 등을 추측하지 않는다. 직접 설정한 요청 타이머만 `timeout`으로 분류한다. 응답 본문 읽기·JSON 파싱·스키마 검사·HTTP 실패를 분리한다. 방 HTTP 예외의 메시지에는 형식을 검증한 서버 오류 코드도 포함하며 응답 본문은 보내지 않는다. WebSocket error 이벤트에서는 HTTP 상태나 원인이 노출되지 않으므로 추정하지 않고, 실제 close code만 breadcrumb에 남긴다.

오류 발생 즉시 컨텍스트와 원인 텍스트를 복사하며, 방 퇴장·런타임 종료·새 방 생성 시 현재 방 컨텍스트와 breadcrumb를 정리한다. 이미 큐에 들어간 오류는 자신의 스냅샷을 유지한다. 같은 예외/요청이 여러 핸들러를 거치면 한 건으로 합치고, 큐에 남아 있는 동안 최종 방 오류의 `user_code`를 보완한다. 전송 중이거나 이미 전송한 오류의 뒤늦은 핸들러는 중복 억제하므로 최종 코드 보완은 불가능할 수 있다.

허용된 오류 필드만 추출하고 임의 객체·요청/응답 본문·인증 헤더는 보내지 않는다. 오류 텍스트의 토큰·쿠키·비밀번호·접속 코드·명시된 개인정보 필드·이메일·전화 형태·URL 쿼리/해시를 가린다. JSON 파싱 오류의 응답 미리보기도 생략한다. 문자열 전체를 8,000 UTF-8 바이트 이내로 유지하기 위해 오래된 breadcrumb와 스택부터 줄이며, Rust 계약의 8,192바이트 제한을 넘지 않는다. Rust `api.error`의 `source`는 Redis·PostgreSQL·전투 계산 등 실패 계층이고, `compute.failed`의 작업 종류·상태 및 `compute_request_id`로 워커 로그를 연결한다. `release`는 브라우저와 서버의 배포 버전을 대조할 때 사용한다.

씬·commandId·revision 등을 서버의 별도 최상위 로그 필드로 검색하려면 Rust `ClientError`의 strict 스키마와 tracing 필드를 함께 변경해야 한다. 이번 작업은 기존 `error_text` 안에 담으므로 서버 수정이 필요하지 않다.

게임 시작 실패 화면이 표시되면 `browser.error`의 `GAME_ASSET_*`, `STARTER_DATA_FAILED`, `GAME_START_FAILED`, `GAME_MODULE_LOAD_FAILED`, `GAME_RUNTIME_INIT_FAILED` 코드를 찾는다. `startup_step`으로 런타임 데이터, 리소스, 방 생성, 월드 모델, 아틀라스, 게임 생성 단계 등을 구분하고 `error_text`로 실제 예외를 읽는다. ROM 데이터 응답이나 게임 데이터 검증 실패는 메시지에 실패한 문서·검증 항목의 고정 이름을 포함한다. 정적 리소스 실패는 공개 `/assets/` 또는 `/game-data/` 경로와 HTTP 상태도 기록한다. 전체 URL과 요청·응답 본문은 수집하지 않는다.

## 화면 오류 코드

게임 시작·방 연결 실패 화면에는 고정된 5자리 코드를 표시한다. 같은 숫자가 API의 `browser.error.user_code`에도 남는다. `code`는 내부 원인 분류이며, 화면의 숫자로 로그를 먼저 검색한 다음 `code`·`resource_path`·`release`를 대조한다.

| 코드    | 의미                                |
| ------- | ----------------------------------- |
| `11001` | 게임 화면 모듈 로드 실패            |
| `11002` | 게임 런타임 초기화 실패             |
| `11003` | 스타터 선택 데이터 로드 실패        |
| `11004` | 게임 시작 처리 실패                 |
| `11101` | 필수 정적 리소스 HTTP 오류          |
| `11102` | 필수 정적 리소스 네트워크 오류      |
| `11103` | 필수 JSON 파싱 오류                 |
| `11104` | 필수 정적 데이터 형식 오류          |
| `11105` | 필수 이미지 로드 실패               |
| `21001` | 방 생성 실패                        |
| `21002` | 분류되지 않은 방 참가 실패          |
| `21003` | 파티 동기화 실패                    |
| `21004` | 준비 상태 반영 실패                 |
| `21005` | 방 연결 실패                        |
| `21006` | 방 인원 초과                        |
| `21007` | 방 종료·만료                        |
| `21008` | 방 연결 정보 만료                   |
| `21009` | 이미 시작된 방의 신규 참가 거절     |
| `21010` | 방을 찾을 수 없음                   |
| `21011` | 참가 세션 인증 실패                 |
| `21012` | 방 접근 권한 없음                   |
| `21013` | 참가자 ID·세션 불일치               |
| `21014` | 접속 종료 후 진행 중 방 재참가 거절 |
| `21015` | 잘못된 참가 요청                    |
| `21016` | 참가 요청·방 상태 충돌              |
| `21017` | 서버 혼잡·요청 제한                 |
| `21018` | 서버 처리 실패                      |
| `21019` | 참가 요청 시간 초과                 |
| `21020` | 참가 요청 전송·응답 수신 연결 실패  |
| `21021` | 참가 응답 JSON·스키마·경로 오류     |

`21009`~`21021`은 최초 방 참가·재접속의 방 열기 단계에서 원인을 구분한다. 방 생성·파티 저장·준비 등 기존 단계별 코드는 유지한다. 방 인원 초과는 기존 `21006`, 종료·만료는 `21007`이다. 공개방의 복구 불가능한 참가 실패는 원인별 안내 후 기존 입장 화면으로 복귀한다. 재시도 여부와 참가 규칙은 바꾸지 않는다.

Rust 참가 거절은 `POKE_LOUNGE_ROOM_ALREADY_STARTED`(400), `POKE_LOUNGE_ROOM_IDENTITY_MISMATCH`(403), `POKE_LOUNGE_ROOM_REJOIN_BLOCKED`(410)로 구분한다. `api.rejected`에는 `code`와 고정된 거절 사유 `reason`을 기록한다. 잘못된 이름·방 코드·요청 본문 등 일반 `INVALID_INPUT`도 사유를 남기지만 실제 입력값·본문·토큰은 기록하지 않는다. HTTP 404는 서버 코드 `ROOM_NOT_FOUND`일 때만 방 없음으로 분류하고, 그 외에는 응답·경로 오류로 구분한다. 시간 초과는 클라이언트 타이머 또는 HTTP 408/504 응답으로 확인하며, 네트워크 오류의 DNS·CORS 등 세부 원인은 추정하지 않는다.

기존 브라우저 탭은 새 코드를 표시하거나 전송하지 않을 수 있다. `11101`의 HTTP 상태는 `code`의 `GAME_ASSET_HTTP_<상태>` 값으로 확인한다.

## 보존과 한계

API와 워커는 이벤트를 **한 줄 JSON 문자열**로 표준 출력에 쓰고, Compose 서비스는 Docker `local` 로깅 드라이버로 컨테이너당 최대 20 MiB 파일 10개를 보존한다. 배포 스크립트는 그 시점에 남아 있는 로그만 `poke-lounge-trace-archive` 볼륨에 gzip으로 보관하고, 30일이 지난 보관 파일은 다음 배포 때 정리한다. 이는 크기 기준 회전이므로 배포 사이의 24시간 보존도 보장하지 않는다. 수동으로 컨테이너를 제거하면 배포 전 보관을 거치지 않는다.

Rust API는 표준 출력과 함께 `poke-lounge-runtime-logs` 외부 볼륨의 `api.jsonl`에도 같은 로그를 기록한다. 파일 순환·압축·권한과 읽기 전용 조회는 [배포 가이드의 운영 로그 보관](apps/api/DEPLOY.md#운영-로그-보관)을 따른다. 이 파일은 컨테이너 재생성 후에도 유지되지만 보관 일수를 보장하지 않으며, 디스크가 가득 차면 로그가 누락될 수 있다. 별도 검색 UI·알림은 제공하지 않는다.

브라우저 전송은 재시도를 포함해 분당 최대 10회/탭이며 일반 진단(예: 처리 중인 409 충돌)은 최대 2회만 사용한다. 오류를 큐 앞에 배치하고 큐가 가득 차면 일반 진단부터 버린다. 큐는 16건, 각 전송은 5초, 재시도는 429·5xx·전송 실패에 한해 1회로 제한하며 대기시간은 최소 1초다. HTTP 성공 여부를 확인하고 진단 실패를 다시 진단 이벤트로 보내지 않는다. 서버는 분당 최대 600건/IP를 허용한다. 네트워크가 완전히 끊기면 브라우저 오류 전송도 실패할 수 있다. 오류 텍스트의 자동 가림은 모든 민감값을 완벽하게 탐지하지 못할 수 있으므로 운영 로그 접근을 제한한다.

## 적용 확인

배포 후 `docker ps --filter name=poke-lounge`에서 `api`, `web`, `battle-worker` 상태, 보관 볼륨의 새 파일, `docker logs`의 시작 로그 및 `release`를 확인한다. 실제 브라우저에서 페이지를 열고 플레이어 입력 한 번을 실행한 뒤, 새 `api.request`가 남는지 확인한다. 브라우저 오류 수집 자체는 실제 오류가 관찰될 때 `browser.error`로 확인한다. 정상 플레이만으로 수집 성공을 단정하지 않는다. 플레이 검증은 [PLAYER_TESTING.md](PLAYER_TESTING.md)의 직접 조작 기준을 따른다.
