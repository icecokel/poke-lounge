# 운영 오류 추적

운영 스택은 `compose.yaml`의 `web`, `api`(Rust), `battle-worker`를 사용한다. 브라우저 오류는 API의 `browser.error` JSON 로그로 모인다. API는 모든 HTTP 응답에 `X-Request-Id`를 붙이고, 브라우저가 보낸 UUID v4 요청 ID를 그대로 사용한다. 워커 계산 실패는 `compute_request_id`/`requestId`로 API와 워커에서 이어진다.

## 문제 발생 시 조회

운영 호스트에서 실행한다. `docker compose logs`는 배포 비밀 환경변수를 요구하므로 조회에는 컨테이너 이름을 지정하는 `docker logs`를 사용한다. 쿼리·응답 본문, 토큰, 방 코드, 세션 ID를 로그나 공유 문서에 붙이지 않는다.

```bash
# 최근 오류: FE 수집 이벤트, API 실패, 소켓 오류, 전투 계산 실패
for name in poke-lounge-api-1 poke-lounge-battle-worker-1 poke-lounge-web-1; do
  docker logs --since 2h --timestamps "$name" 2>&1
done | grep -E 'browser.error|api.error|compute.failed|compute.timeout|socket.*error|api.request' | grep -v '"route":"/health'

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

`api.request`의 `route`는 템플릿 경로이며 요청 본문은 기록하지 않는다. `browser.error`에는 종류·오류 코드·연관 요청 ID·페이지 범주·실행 코드 위치·오류 이름·검증된 공개 정적 리소스 경로만 기록한다. 실제 게임 중 UI에 표시된 방 코드를 검색 키로 사용하지 않는다. Rust `api.error`의 `source`는 Redis·PostgreSQL·전투 계산 등 실패 계층이다. `compute.failed`에 기록된 작업 종류와 상태로 워커의 같은 ID를 찾는다. `backend.started`, `compute.started`의 `release`와 브라우저 오류의 `release`로 배포 버전을 대조한다.

게임 시작 실패 화면이 표시되면 `browser.error`의 `GAME_ASSET_*`, `STARTER_DATA_FAILED`, `GAME_START_FAILED`, `GAME_MODULE_LOAD_FAILED`, `GAME_RUNTIME_INIT_FAILED` 코드를 찾는다. 정적 리소스 실패는 공개 `/assets/` 또는 `/game-data/` 경로와 HTTP 상태를 기록한다. 오류 이름은 `error_name`으로 구분한다. 오류 메시지·스택·전체 URL은 수집하지 않는다.

## 보존과 한계

Compose 서비스는 Docker `local` 로깅 드라이버를 사용하며 컨테이너당 최대 20 MiB 파일 10개를 보존한다. 배포 스크립트는 그 시점에 남아 있는 로그만 보관하고, 30일이 지난 보관 파일은 다음 배포 때 정리한다. 이는 크기 기준 회전이므로 배포 사이의 24시간 보존도 보장하지 않는다. 수동으로 컨테이너를 제거하면 배포 전 보관을 거치지 않는다. 디스크가 가득 차면 로그가 누락될 수 있다. 별도 장기 보존·검색 UI·알림은 제공하지 않는다. 브라우저 수집은 분당 최대 10건/탭, 서버는 분당 최대 600건/IP를 허용한다. 네트워크가 완전히 끊기면 브라우저 오류 전송도 실패할 수 있다. 오류 텍스트·스택·개인정보를 수집하지 않으므로 런타임 오류는 빌드 버전과 스크립트 위치로 원인을 좁힌다.

## 적용 확인

배포 후 `docker ps --filter name=poke-lounge`에서 `api`, `web`, `battle-worker` 상태, 보관 볼륨의 새 파일, `docker logs`의 시작 로그 및 `release`를 확인한다. 실제 브라우저에서 페이지를 열고 플레이어 입력 한 번을 실행한 뒤, 새 `api.request`가 남는지 확인한다. 브라우저 오류 수집 자체는 실제 오류가 관찰될 때 `browser.error`로 확인한다. 정상 플레이만으로 수집 성공을 단정하지 않는다. 플레이 검증은 [PLAYER_TESTING.md](PLAYER_TESTING.md)의 직접 조작 기준을 따른다.
