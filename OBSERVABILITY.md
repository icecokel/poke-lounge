# 운영 오류 추적

운영 스택은 `compose.yaml`의 `web`, `api`(Rust), `battle-worker`를 사용한다. 브라우저 오류는 API의 `browser.error` JSON 로그로 모인다. API는 모든 HTTP 응답에 `X-Request-Id`를 붙이고, 브라우저가 보낸 UUID v4 요청 ID를 그대로 사용한다. 워커 계산 실패는 `compute_request_id`/`requestId`로 API와 워커에서 이어진다.

## 문제 발생 시 조회

운영 호스트에서 `cd /home/icenux/actions-runner-poke-lounge/_work/poke-lounge/poke-lounge` 후 실행한다. 쿼리·응답 본문, 토큰, 방 코드, 세션 ID를 로그나 공유 문서에 붙이지 않는다.

```bash
# 최근 오류: FE 수집 이벤트, API 실패, 소켓 오류, 전투 계산 실패
docker compose logs --since 2h --timestamps api battle-worker web | grep -E 'browser.error|api.error|compute.failed|compute.timeout|socket.*error|api.request'

# 브라우저 오류의 related_request_id 또는 HTTP 응답의 X-Request-Id로 연관 기록 조회
docker compose logs --since 24h --timestamps api battle-worker | grep -F '여기에-요청-UUID'

# API compute.failed의 compute_request_id를 워커 requestId와 대조
docker compose logs --since 24h --timestamps api battle-worker | grep -F '여기에-계산-UUID'

# room_instance_id로 비동기 방 명령, 틱, 소켓, 계산 기록 연결
docker compose logs --since 24h --timestamps api battle-worker | grep -F '여기에-방-인스턴스-UUID'
```

`api.request`의 `route`는 템플릿 경로이며 요청 본문은 기록하지 않는다. `browser.error`에는 종류·오류 코드·연관 요청 ID·페이지 범주와 실행 코드 위치만 기록한다. 실제 게임 중 UI에 표시된 방 코드를 검색 키로 사용하지 않는다. Rust `api.error`의 `source`는 Redis·PostgreSQL·전투 계산 등 실패 계층이다. `compute.failed`에 기록된 작업 종류와 상태로 워커의 같은 ID를 찾는다. `backend.started`, `compute.started`의 `release`와 브라우저 오류의 `release`로 배포 버전을 대조한다.

## 보존과 한계

Compose 서비스는 Docker `local` 로깅 드라이버를 사용하며 컨테이너당 최대 20 MiB 파일 10개를 보존한다. 이는 크기 기준 회전이므로 24시간 보존을 보장하지 않는다. 디스크가 가득 차면 로그가 누락될 수 있다. 장기 보존·검색·알림이 필요하면 운영 로그 집계 저장소에 이 JSON 로그를 전달해야 한다. 브라우저 수집은 분당 최대 10건/탭, 서버는 분당 최대 600건/IP를 허용한다. 네트워크가 완전히 끊기면 브라우저 오류 전송도 실패할 수 있다. 오류 텍스트·스택·개인정보를 수집하지 않으므로 런타임 오류는 빌드 버전과 스크립트 위치로 원인을 좁힌다.

## 적용 확인

배포 후 `docker compose ps`에서 `api`, `web`, `battle-worker` 상태와 `docker compose logs`의 시작 로그 및 `release`를 확인한다. 실제 브라우저에서 페이지를 열고 플레이어 입력 한 번을 실행한 뒤, 새 `api.request`가 남는지 확인한다. 브라우저 오류 수집 자체는 실제 오류가 관찰될 때 `browser.error`로 확인한다. 정상 플레이만으로 수집 성공을 단정하지 않는다. 플레이 검증은 [PLAYER_TESTING.md](PLAYER_TESTING.md)의 직접 조작 기준을 따른다.
