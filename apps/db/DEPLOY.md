# Web·Rust API·계산 워커 배포와 환경

구현 대조: `81a696b` · 2026-11-15 KST. 이 문서는 Git에서 제외된 내부 `docs/` 없이도 배포 조건을 확인할 수 있는 안내다. 운영 값·비밀번호·실제 방 ID는 기록하지 않는다.

## 배포 경로

[CI](../../.github/workflows/ci.yml)의 `verify`와 `rust`가 성공한 뒤 [Deploy](../../.github/workflows/deploy-api.yml)를 호출한다. `main`의 push 또는 `main`에서 CI를 수동 실행한 경우만 배포하며 PR 검증은 배포하지 않는다. 배포 체크아웃은 `github.sha`다. 같은 커밋으로 다시 실행하면 이미지·환경이 같아 컨테이너를 교체하지 않는다. 커밋이 바뀌면 `RELEASE_SHA`가 바뀌므로 문서만 바꾼 병합도 api·web·계산 워커·리그 심판을 다시 띄운다(약 10초 중단).

### 운영 호스트

2026-11-14부터 운영 호스트는 춘천 OCI 2호기 `oci-poke-lounge-prod-01`(Ubuntu 24.04 ARM64, 2 OCPU·12GB)이다. Docker Engine·Compose, runner `oci-poke-lounge-prod-01`(systemd), Cloudflare Tunnel `poke-lounge-oci`(systemd)가 모두 부팅 시 자동으로 올라오며 모든 서비스는 `restart: unless-stopped`다. 이전 운영 호스트였던 Mac mini 스택은 멈춘 채 복귀용으로 남겨 두었다. 터널 설정, 이관·복귀 절차와 호스트 운영 기록은 저장소 밖 운영 문서에서 관리한다.

운영 작업용 접속은 전용 계정 `poke-lounge`(홈 `/srv/poke-lounge`, docker 그룹, sudo 없음)다. 배포 runner `oci-poke-lounge-prod-01`도 이 계정으로 `/srv/poke-lounge/.local/actions-runner`에서 실행되며, 배포 checkout은 그 아래 `_work/poke-lounge/poke-lounge`(배포마다 덮어씀)다. 패키지·systemd·터널·백업은 관리자 계정이 맡는다. docker 그룹은 root와 같은 권한이라, 볼륨 삭제·운영 컨테이너 수동 재생성·DB 쓰기·호스트 경로를 마운트하는 컨테이너 실행은 운영자 확인 없이 하지 않는다. 서버에서 직접 `docker compose up`·빌드를 하지 않고 배포는 아래 workflow로만 한다.

호스트는 [setup-oci-host.sh](../../scripts/deploy/setup-oci-host.sh)(root: Docker Engine·Compose·git·cloudflared)와 [setup-oci-runner.sh](../../scripts/deploy/setup-oci-runner.sh)(서비스 사용자: runner 등록·systemd)로 준비한다. `setup-oci-runner.sh`는 아직 `ubuntu`·`~/actions-runner-poke-lounge` 기준이므로, 다시 설치할 때는 `poke-lounge` 계정·`/srv/poke-lounge/.local/actions-runner` 기준으로 고친 뒤 쓴다. 호스트에 Node·Rust를 설치하지 않는다. 배포 빌드는 Docker 안에서 이뤄진다. Mac mini runner는 [setup-mac-mini-runner.sh](../../scripts/deploy/setup-mac-mini-runner.sh)로 준비한다.

### 러너 선택

| 저장소 variable             | 현재 값                                               | 비어 있을 때                                              |
| --------------------------- | ----------------------------------------------------- | --------------------------------------------------------- |
| `POKE_LOUNGE_DEPLOY_RUNNER` | `["self-hosted","Linux","ARM64","poke-lounge","oci"]` | `["self-hosted","macOS","ARM64","poke-lounge"]`(Mac mini) |
| `POKE_LOUNGE_CI_RUNNER`     | `"ubuntu-24.04-arm"`(GitHub 호스팅)                   | `"ubuntu-latest"`                                         |

운영 호스트의 runner는 배포만 한다. `verify`·`rust`는 GitHub 호스팅 ARM64 runner에서 실행해 브랜치 코드·의존성 설치 스크립트·빌드 스크립트가 운영 호스트(docker 그룹 권한)에서 돌지 않게 한다. 저장소가 공개라서 포크 PR은 변수와 상관없이 `ubuntu-latest`에서만 실행한다.

### 비밀값과 설정

운영 비밀값은 GitHub `production` environment에만 있다. 이 environment는 배포 브랜치를 `main`으로 제한하고, deploy job만 `environment: production`을 선언한다. 저장소 단위 secret은 두지 않는다. 다른 브랜치의 워크플로는 운영 비밀값을 읽을 수 없다.

| 설정                       | 종류                      | 현재 소비 위치/의미                                                                                                                                                                                                                                                                                                                                      |
| -------------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DB_PASSWORD`              | `production` secret(필수) | PostgreSQL 비밀번호. 문서·로그에 출력하지 않는다.                                                                                                                                                                                                                                                                                                        |
| `BATTLE_WORKER_TOKEN`      | `production` secret(필수) | Rust API와 계산 워커 사이 인증.                                                                                                                                                                                                                                                                                                                          |
| `DISCORD_CLIENT_SECRET`    | `production` secret       | 디스코드 로그인. `DISCORD_CLIENT_ID`·`DISCORD_REDIRECT_URI` variable과 셋이 함께 있어야 한다.                                                                                                                                                                                                                                                            |
| `LEAGUE_JUDGE_TOKEN`       | `production` secret       | Rust API와 리그 심판 사이 인증.                                                                                                                                                                                                                                                                                                                          |
| `LEAGUE_AGENT_LOGIN_TOKEN` | `production` secret       | 운영 리그 테스트 계정 로그인.                                                                                                                                                                                                                                                                                                                            |
| `NEXT_PUBLIC_API_URL`      | 저장소 variable           | 브라우저가 실제 접근할 API 주소이며 이미지 빌드 인자로 들어간다. 변경 시 웹 이미지를 다시 빌드한다.                                                                                                                                                                                                                                                      |
| `CORS_ORIGINS`             | 저장소 variable           | 실제 웹 origin 목록.                                                                                                                                                                                                                                                                                                                                     |
| `RUST_API_TRUSTED_PROXIES` | 저장소 variable           | 신뢰할 프록시 CIDR. 운영은 Compose 기본 네트워크 대역 `172.18.0.0/16`이다. 터널 → 호스트 포트 → 컨테이너를 거치면 접속 peer가 Docker 게이트웨이라서, 이 값이 없으면 모든 접속자가 한 IP로 보여 요청 한도·IP당 방 상한이 사이트 전체에 걸린다. 설정하면 X-Forwarded-For 오른쪽부터 첫 비신뢰 IP를 쓴다. 네트워크를 다시 만들어 대역이 바뀌면 함께 바꾼다. |
| `BIND_ADDRESS`             | 저장소 variable           | `127.0.0.1`. Compose 단독 실행 기본도 `127.0.0.1`이다.                                                                                                                                                                                                                                                                                                   |
| `WEB_PORT` / `API_PORT`    | 저장소 variable           | 3100/3101. Compose 단독 기본 3000/3001.                                                                                                                                                                                                                                                                                                                  |

리그 설정 variable(`LEAGUE_*`)과 `AUTH_WEB_ORIGIN`·`DISCORD_*`는 [deploy-api.yml](../../.github/workflows/deploy-api.yml)의 `env`를 따른다. 위 값은 워크플로·저장소 설정 기준이며 비밀값은 기록하지 않는다.

### 배포 단계와 자동 롤백

배포는 [deploy-stack.sh](../../scripts/deploy/deploy-stack.sh)가 수행한다.

1. 현재 `poke-lounge-node:local`·`poke-lounge-api-rust:local` 이미지를 `:prev`로 태그한다.
2. 이미지를 하나씩 빌드한다(`COMPOSE_PARALLEL_LIMIT=1`). 실행 중인 앱은 그대로다.
3. PostgreSQL·Redis를 확인한다(`--no-recreate`로 기존 컨테이너를 유지한다).
4. 앱을 바꾸기 전에 migrate를 따로 실행한다. 실패하면 여기서 끝나고 기존 앱이 계속 서비스한다.
5. 바뀌기 전 컨테이너 로그를 보관하고 battle-worker·api·web을 교체한다. 리그가 켜져 있으면 league-judge도 교체한다.
6. 헬스를 확인한다(각 요청 10초 제한·재시도): API `/health`·`/health/ready`·`/poke-lounge/rooms/public`, Web `/ko-KR`, 리그가 켜져 있으면 `/league/v1/status` 200, 디스코드 값 셋이 있으면 `/auth/me`의 `discord` 제공자. API 로그 파일의 배포 SHA도 확인한다.
7. 5·6단계가 실패하면 `:prev`를 `:local`로 되돌리고 앱을 다시 띄운 뒤 배포를 실패로 끝낸다. 첫 배포처럼 `:prev`가 없으면 롤백 없이 실패한다.

롤백은 애플리케이션 이미지만 되돌린다. 이미 적용한 DB 마이그레이션은 되돌리지 않으므로, 마이그레이션은 이전 버전 앱과 함께 동작하도록(추가 먼저, 제거는 다음 배포) 작성한다. Linux 호스트에서는 배포 뒤 dangling 이미지만 지우고 빌드 캐시를 15GB 이하로 줄인다. `:prev` 태그 이미지와 볼륨은 지우지 않는다.

## Compose 실행 순서

[compose.yaml](../../compose.yaml)은 PostgreSQL·Redis·Node 마이그레이션·Node 계산 워커·Rust API·Web(리그 프로필에서는 리그 심판)을 실행한다. 마이그레이션·계산 워커·Web·리그 심판은 Node 이미지를 공유하고 Rust API는 별도 이미지다.

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

운영 배포는 `COMPOSE_PROJECT_NAME=poke-lounge-prod`로 위 단계를 나눠 실행한다. 운영 컨테이너 이름은 `poke-lounge-prod-<서비스>-1`(예: `poke-lounge-prod-api-1`)이다. 로그 조회 등 직접 확인은 [운영 오류 추적](../../OBSERVABILITY.md)처럼 컨테이너 이름을 지정한다. 이미지 태그는 `POKE_LOUNGE_IMAGE_TAG`(기본 `local`)로 바꿀 수 있어 같은 호스트의 격리 테스트가 운영 태그를 덮지 않는다. PostgreSQL·Redis named volume을 유지한다. `docker compose down -v`는 데이터 삭제이므로 일반 재시작/복구 절차에 사용하지 않는다.

### 이미지·액션 고정값 갱신

외부 이미지는 `태그@sha256:인덱스`로 고정한다. `docker buildx imagetools inspect <태그>`의 최상위 `Digest`와 `linux/amd64`·`linux/arm64` 포함 여부를 확인하고, Dockerfile·Compose·워크플로·배포 스크립트·이 문서의 같은 참조를 함께 갱신한다. Dockerfile frontend와 Rust 런타임 Debian 이미지도 포함한다. PostgreSQL 검증 이미지는 [백업 스크립트](../../scripts/deploy/backup-postgres.sh)와 Compose가 같아야 한다.

액션은 현재 메이저의 최신 정식 태그를 선택하고 `gh api repos/actions/<name>/git/ref/tags/<tag>`로 SHA를 확인한다. `object.type`이 `tag`면 `gh api repos/actions/<name>/git/tags/<sha>`를 따라가 최종 커밋 SHA로 고정하고 뒤에 버전 주석을 유지한다.

배포 스크립트의 `up --no-recreate postgres redis`는 이미지 참조가 바뀌어도 기존 데이터 컨테이너를 재생성하지 않는다. 이후 앱 실행도 `--no-deps`이므로 데이터 서비스를 교체하지 않는다. 따라서 이 배포 경로에서는 고정값 적용으로 인한 DB·Redis 재시작이 없다. 별도로 일반 `docker compose up`을 실행하면 변경을 감지해 재생성할 수 있으며 잠시 중단된다. 볼륨은 유지된다. 운영 이미지 ID를 대조하기 전에는 현재 운영 이미지와 새 다이제스트의 내용이 같다고 판단할 수 없다.

## PostgreSQL 백업과 Mac 사본

[backup-postgres.sh](../../scripts/deploy/backup-postgres.sh)는 운영 호스트의 관리자 계정(`ubuntu`)으로 실행한다. 백업 파일은 관리자 홈에 있어 운영 작업 계정 `poke-lounge`는 접근할 수 없다. Bash·Docker·Python 3·`sha256sum`이 필요하다. 운영 호스트(Ubuntu Minimal)에는 cron이 없어 systemd 타이머로 실행한다. 현재 설치는 `/home/ubuntu/poke-lounge-ops/backup-postgres.sh`와 `poke-lounge-backup.service`(oneshot, `User=ubuntu`, `SupplementaryGroups=docker`)·`poke-lounge-backup.timer`(매일 18:17 UTC 전후, `Persistent=true`)다.

```bash
# 수동 실행과 상태 확인
sudo systemctl start poke-lounge-backup.service
systemctl list-timers poke-lounge-backup.timer
tail ~/backups/poke-lounge/backup.log
```

컨테이너 `poke-lounge-prod-postgres-1`에서 `pg_dump -U poke_lounge -d poke_lounge -Fc --no-password`를 실행한다. Compose는 PostgreSQL 공식 이미지의 로컬 Unix 소켓 인증을 바꾸지 않으므로 비밀번호를 전달하지 않는다. TCP 접속의 비밀번호 설정과 별개다. 기존 볼륨의 `pg_hba.conf`를 수동 변경했다면 이 전제가 달라지므로 인증 정책을 먼저 확인한다. 인증 실패 시 백업은 실패로 종료하며 비밀번호를 명령줄·로그에 출력하지 않는다.

덤프는 `~/backups/poke-lounge/postgres/`의 임시 파일에 받고, 크기와 고정된 PostgreSQL 이미지의 `--network none` 컨테이너에서 `pg_restore --list` 성공을 확인한 뒤 `poke_lounge-YYYYmmddTHHMMSSZ.dump`로 원자적으로 이동한다. 같은 이름 뒤에 `.sha256`을 붙인 파일에는 덤프의 SHA-256과 파일명만 기록한다. 검증 실패 시 임시 덤프를 삭제한다. 디렉터리는 700, 덤프·체크섬·로그는 600이다.

가용 공간이 5GiB 미만이면 덤프·보관 정리를 시작하지 않고 실패한다. 최근 14개와 최근 8주(UTC 날짜 기준)의 각 일요일 마지막 백업 최대 8개를 합쳐 보관하고 나머지 덤프·체크섬을 삭제한다. Redis 방 상태는 최대 2시간 수명이므로 백업하지 않는다. 실행 결과는 `~/backups/poke-lounge/backup.log`에 한 줄로 남는다. 중복 실행은 `.postgres-backup.lock` 디렉터리로 차단한다. 호스트 강제 종료 후 잠금이 남으면 실행 중인 백업이 없음을 확인한 뒤 해당 빈 디렉터리만 제거한다.

격리 확인에서는 `POKE_LOUNGE_POSTGRES_CONTAINER`와 `POKE_LOUNGE_BACKUP_DIR`로 컨테이너 이름과 백업 디렉터리를 바꾼다. 백업 로그와 잠금은 지정 디렉터리의 부모에 생성된다. 운영 컨테이너 이름을 격리 확인에 사용하지 않는다.

Mac에서는 [pull-postgres-backups.sh](../../scripts/deploy/pull-postgres-backups.sh)에 사본을 저장할 폴더를 전달한다.

```bash
bash scripts/deploy/pull-postgres-backups.sh /원하는/로컬/백업/폴더
```

`ssh -F /Users/smlee/icecoke-ops/config/ssh-config oci-poke-lounge` 설정으로 원격 홈의 `backups/poke-lounge/postgres/`에서 scp로 덤프·체크섬을 가져온다(운영 호스트에 rsync가 없다). Python 3으로 모든 사본의 SHA-256과 짝 파일을 확인한다. 원격 파일과 원격 보관 정책으로 사라진 기존 Mac 사본은 삭제하지 않는다. 운영에서는 맥 LaunchAgent `kr.icecoke.poke-lounge-backup-pull`이 매일 04:40(맥이 켜져 있을 때, 로그인 시에도 한 번) 실행한다. 설치 위치는 저장소 밖 운영 문서에 있다. `pg_restore --list`는 아카이브 목록 검증이며 실제 복원·서비스 정상 동작 검증을 대신하지 않는다.

## 운영 로그 보관

Rust API는 콘솔과 `poke-lounge-runtime-logs` 외부 볼륨의 `/var/log/poke-lounge/api.jsonl`에 같은 JSON 로그를 기록한다. 외부 볼륨이므로 컨테이너 재생성이나 Compose 볼륨 삭제 대상에 포함되지 않는다. 파일은 20MiB를 넘긴 완전한 JSON 행 단위로 순환하며 이전 파일 24개를 유지한다. 최신 두 순환 파일은 원문, 나머지는 gzip이며 전체 원문 기준 보관량은 약 500MiB다. 보관 기간은 발생량에 따라 달라진다.

배포 workflow가 외부 볼륨 생성과 UID 10001 쓰기 권한을 준비한다. 로컬에서 위 Compose 명령을 직접 실행할 때는 다음 준비를 먼저 수행한다.

```bash
docker volume create poke-lounge-runtime-logs
docker run --rm -v poke-lounge-runtime-logs:/logs alpine:3.20@sha256:d9e853e87e55526f6b2917df91a2115c36dd7c696a35be12163d44e6e2a4b6bc \
  sh -c 'chown 10001:10001 /logs && chmod 0700 /logs'
```

교체되는 컨테이너 로그는 배포 직전 `poke-lounge-trace-archive` 볼륨에 gzip으로 보관하고(리그 심판 포함) 30일 지나면 정리한다. 새 파일 로그는 재시작 후에도 이어 쓰며, 종료 시 큐를 비운다. 정상 health 요청은 debug, 4xx 또는 1초 이상 걸린 요청은 warn, 5xx는 error로 기록한다. 명령 ID·방 생성 회차·배포 SHA·요청 ID로 브라우저 오류와 서버 처리를 연결할 수 있다. 요청 본문·인증 토큰·원본 세션 ID는 수집하지 않는다.

최신 API 파일 로그를 읽을 때는 읽기 전용 마운트를 사용한다.

```bash
docker run --rm -v poke-lounge-runtime-logs:/logs:ro alpine:3.20@sha256:d9e853e87e55526f6b2917df91a2115c36dd7c696a35be12163d44e6e2a4b6bc \
  tail -n 100 /logs/api.jsonl
```

### 브라우저·계산 실패 추적

- `browser.error`의 `timestamp`는 서버 수신 시각, `occurred_at_ms`는 브라우저에서 오류를 포착한 시각이다. 장애 후 지연 전송을 조사할 때 둘을 구분한다. 브라우저 시계가 부정확할 수 있으므로 서버 요청 기록도 함께 확인한다.
- `report_id`는 재전송·새로고침 복구 후에도 유지한다. 응답 유실이나 전송 중 화면 오류 코드가 추가되면 같은 ID가 다시 기록될 수 있다. 같은 ID의 보고를 연결하고 `delivery_attempt`와 `error_text` 안의 원인·최근 동작을 확인한다. `release`는 오류 발생 당시 웹 버전, `server_release`는 수신한 API 버전이다.
- 브라우저는 정제된 보고를 탭별 `sessionStorage`에 최대 16건·직렬화 문자열 200,000자 이내로 보관하고, 24시간이 지난 보고는 다음 복구·전송 처리 때 폐기한다. 새로고침·같은 탭 페이지 이동 후 복구하며 온라인 복귀 때 재전송한다. 탭 종료·저장소 삭제·저장 차단·브라우저 강제 종료까지 전달을 보장하지 않는다.
- 전송은 한 번에 하나, 시도당 5초 제한, 분당 최대 10회(배경 기록 2회)다. 네트워크 실패·429·5xx는 최대 60초 간격으로 재시도하며 전송량 제한은 폐기 대신 지연한다. 다른 4xx는 재전송하지 않는다. 큐가 가득 차면 배경 기록, 일반 API 오류 순으로 중요한 화면 오류에 자리를 내준다. 보관 한도·만료·중복·저장 실패 수치는 `error_text.delivery`에 남는다.
- Next의 클라이언트 초기 실행 단계에서 오류 리스너를 설치한다. 화면 코드·이미지·스타일 등 같은 origin의 허용된 리소스 경로와 히스토리 이동·페이지 캐시 복원·탭 숨김/복귀·온라인 상태를 기록한다. URL 쿼리·히스토리 state·입력 내용·파티 원문은 기록하지 않는다. 진단 코드 자체가 로드되기 전의 실패는 수집할 수 없다.
- 파티·전투 검증 실패는 API 영속 로그의 `compute.rejected`에서 `reason`을 확인한다. 예: `active-pokemon-fainted`, `hp-out-of-range`, `schema-invalid`, 파티 제출 규칙 `level-growth`·`move`·`catch-species`. 파티 제출 거부는 `room.party_rejected`의 `rule`에도 같은 값이 남는다. 예상하지 못한 계산 예외는 `error_name`과 경로·따옴표 값을 지운 `error_message`로 원인을 읽는다. `issues`는 최대 8개의 검증 코드·허용된 필드 경로이며 값·메시지·동적 플레이어 키를 포함하지 않는다. `frames`는 최대 4개의 코드 파일명·행·열이다. `compute_request_id`로 워커의 `compute.failed`와 연결하고 HTTP span의 요청 ID·명령 ID로 브라우저 요청을 연결한다.
- 워커는 실행 시간초과·큐 대기 시간초과·비정상 종료·프로토콜 불일치를 구분하고 대기 시간(`queueMs`)을 남긴다. API는 워커 연결 실패와 잘못된 응답을 별도로 기록한다. `backend.owner_lost`는 두 경우에 남는다. `failures` 필드가 없으면 Redis가 소유권 불일치를 응답한 경우이고, `failures`가 있으면 갱신 실패가 임대 만료 시점까지 이어진 경우다. 후자의 Redis 오류 분류는 직전 `backend.owner_renew_failed`의 `reason`·`storage_kind`에서 확인하며, 이벤트 이름만으로 다른 인스턴스가 소유권을 가져갔다고 단정하지 않는다.

이 기록은 진단용이며 오류를 자동 복구하거나 게임 규칙·파티 검증 조건을 바꾸지 않는다. 운영 반영은 Web·Rust API·계산 워커 배포 후 적용된다.

## DB 마이그레이션의 실제 변경 범위

**기존 스키마가 모두 보존되는 구현이 아니다.** `DropLegacyPokeLoungePostgresState1795132800000`은 다음 레거시 테이블을 잠그고 비어 있는지 확인한 뒤 제거한다.

`game_poke_lounge_state`, `poke_lounge_room`, `poke_lounge_room_command`, `poke_lounge_competitive_seat`, `poke_lounge_competitive_match`, `poke_lounge_competitive_action`.

예상 테이블이 없거나 하나라도 데이터가 남아 있으면 예외로 중단한다. 데이터를 자동 이전하거나 강제로 지워서 통과시키지 않는다. `down()`도 되돌리기를 거부하는 비가역 정리다. 적용 전에 마이그레이션 이력·잔존 데이터·검증된 백업을 확인한다. 코드를 되돌리는 것만으로 삭제된 스키마가 복구되지 않는다.

ROM import는 `poke_lounge_rom_document` 테이블에 검증한 문서를 upsert하고 그 테이블에서 현재 import 집합 밖의 키를 제거한다. 이 작업의 삭제 범위를 일반 계정/게임 테이블까지 확대해 설명하지 않는다. 변경 시 DB와 Web/API 공통 데이터의 호환성을 확인한다.

근거: [레거시 정리](src/migrations/1795132800000-drop-legacy-poke-lounge-postgres-state.ts), [ROM importer](scripts/import-poke-lounge-rom-data.ts), [데이터 소스](src/data-source.ts). 데이터 소스는 `synchronize: false`로 고정되어 있어 스키마 변경은 마이그레이션으로만 반영된다. compose의 `DB_SYNCHRONIZE` 값은 코드에서 읽지 않는다.

## 실행 전·후 확인

실행 전에는 백업, 마이그레이션 이력, 디스크·볼륨, API 주소·CORS·접근 범위를 확인한다. 설정 전체를 출력하면 secret이 포함될 수 있으므로 마스킹 없이 공유하지 않는다.

배포 workflow는 API `/health`, `/health/ready`, `/poke-lounge/rooms/public`과 Web `/ko-KR`을 확인한다. 게임 주소는 `/{locale}`, 소개 주소는 `/{locale}/intro`이며 기존 긴 경로는 현재 주소로 리디렉션한다. 이 응답만으로 ROM 데이터·AI·다인 전투가 정상이라고 판단하지 않는다. 직접 플레이의 기대 동작은 [현재 게임 흐름](../../README.md)을 기준으로 확인한다.

CI는 정적 검사와 프로덕션 빌드만 수행한다. Storybook은 제거했고, 자동 테스트는 루트 `pnpm test:korean-messages`(한국어 조사·현지화 문구를 `node:test`로 검사, CI 미실행)만 남아 있다. 플레이어 테스트는 [직접 조작 지침](../../PLAYER_TESTING.md)에 따라 실제 브라우저에서 별도로 수행하며 CI 성공을 플레이 PASS로 해석하지 않는다.

## 장애 확인·복구 경계

`migrate` 실패는 앱을 바꾸기 전에 멈추므로 기존 버전이 계속 서비스한다. API를 강제로 먼저 띄우지 않는다. 헬스 실패로 자동 롤백됐다면 배포 로그에서 실패한 확인 단계를 찾고, 이전 버전이 서비스 중인지 `/health/ready`로 확인한다. 어떤 마이그레이션 또는 ROM 문서가 실패했는지 확인하고 데이터 보존을 우선한다. 전투 계산이 멈추면 `battle-worker`의 준비 상태와 Rust API의 워커 연결·토큰 설정을 확인한다. AI 준비가 멈추면 Rust API의 Redis·ROM 데이터·계산 워커 연결을 확인한다. 웹 요청 실패는 브라우저용 API URL·CORS와 내부 컨테이너 주소를 구분한다.

방은 Redis, ROM 문서는 PostgreSQL에 있으므로 한 저장소의 복원으로 전체 게임 상태가 복구된다고 가정하지 않는다. 애플리케이션 버전 롤백과 DB 복원은 별도 판단이다. 검증된 백업/복원 절차와 운영자 승인이 없이 `FLUSHDB`, 테이블 삭제, volume 삭제, migration 이력 조작을 실행하지 않는다.

로컬 직접 실행 준비는 [README](../../README.md)의 절차를 사용한다. `docs/`가 존재하는 개발 환경의 내부 운영 기록은 보조 자료이며, 과거 테스트 통과 기록을 현재 배포의 검증으로 재사용하지 않는다.
