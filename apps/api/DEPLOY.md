# Web·API·워커 배포와 환경

구현 대조: `617a60c` · 2026-09-08 KST. 이 문서는 Git에서 제외된 내부 `docs/` 없이도 배포 조건을 확인할 수 있는 안내다. 운영 값·비밀번호·실제 방 ID는 기록하지 않는다.

## 배포 경로

[CI](../../.github/workflows/ci.yml)의 `verify`가 성공한 뒤 [Deploy](../../.github/workflows/deploy-api.yml)를 호출한다. `main`의 push 또는 `main`에서 CI를 수동 실행한 경우만 배포하며 PR 검증은 배포하지 않는다. runner는 `[self-hosted, linux, x64, poke-lounge]` 라벨과 Docker Compose가 필요하다. 배포 체크아웃은 `github.sha`다.

| 설정                    | 현재 소비 위치/의미                                                                                                  |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_API_URL`   | 저장소 variable. 브라우저가 실제 접근할 API 주소이며 이미지 빌드 인자로 들어간다. 변경 시 웹 이미지를 다시 빌드한다. |
| `CORS_ORIGINS`          | 저장소 variable. 실제 웹 origin 목록.                                                                                |
| `DB_PASSWORD`           | 필수 저장소 secret. 문서·로그에 출력하지 않는다.                                                                     |
| `BIND_ADDRESS`          | 배포 workflow 기본 `127.0.0.1`. Compose 단독 실행 기본은 `0.0.0.0`이므로 외부 노출을 별도 확인한다.                  |
| `WEB_PORT` / `API_PORT` | workflow 기본 3100/3101, Compose 단독 기본 3000/3001.                                                                |

위 값은 템플릿/워크플로 기준이며 실제 운영 환경의 설정값을 조회한 결과가 아니다.

## Compose 실행 순서

[compose.yaml](../../compose.yaml)은 PostgreSQL·Redis·마이그레이션·API·턴 워커·Web을 실행한다. API와 워커는 같은 앱 이미지를 사용한다.

```text
PostgreSQL healthy → migrate: migration:run → rom-data:import
Redis healthy + migrate 성공 → API healthy → 턴 워커와 Web
```

턴 워커에는 AI 초기화·이동·전투와 경쟁 턴 작업이 포함된다. 워커가 없으면 AI 준비 및 제한 시간 처리가 완료되지 않을 수 있다. 워커의 `AI_RUNTIME_API_URL`은 Compose 내부 `http://api:3001`이며 브라우저용 URL과 혼동하지 않는다. API/워커의 `DB_HOST=postgres`, `REDIS_URL=redis://redis:6379`도 컨테이너 내부 주소다.

로컬에서 전체 스택을 실행할 때:

```bash
# 개발용 값은 환경 또는 저장소 루트 .env에서 설정한다.
# 다른 작업의 스택과 포트/프로젝트 이름이 충돌하지 않는지 먼저 확인한다.
docker compose up --build --detach --wait --wait-timeout 180
```

배포 workflow는 같은 명령에 `--remove-orphans`를 추가한다. PostgreSQL·Redis named volume을 유지한다. `docker compose down -v`는 데이터 삭제이므로 일반 재시작/복구 절차에 사용하지 않는다.

## DB 마이그레이션의 실제 변경 범위

**기존 스키마가 모두 보존되는 구현이 아니다.** `DropLegacyPokeLoungePostgresState1795132800000`은 다음 레거시 테이블을 잠그고 비어 있는지 확인한 뒤 제거한다.

`game_poke_lounge_state`, `poke_lounge_room`, `poke_lounge_room_command`, `poke_lounge_competitive_seat`, `poke_lounge_competitive_match`, `poke_lounge_competitive_action`.

예상 테이블이 없거나 하나라도 데이터가 남아 있으면 예외로 중단한다. 데이터를 자동 이전하거나 강제로 지워서 통과시키지 않는다. `down()`도 되돌리기를 거부하는 비가역 정리다. 적용 전에 마이그레이션 이력·잔존 데이터·검증된 백업을 확인한다. 코드를 되돌리는 것만으로 삭제된 스키마가 복구되지 않는다.

ROM import는 `poke_lounge_rom_document` 테이블에 검증한 문서를 upsert하고 그 테이블에서 현재 import 집합 밖의 키를 제거한다. 이 작업의 삭제 범위를 일반 계정/게임 테이블까지 확대해 설명하지 않는다. 변경 시 DB와 Web/API 공통 데이터의 호환성을 확인한다.

근거: [레거시 정리](src/migrations/1795132800000-drop-legacy-poke-lounge-postgres-state.ts), [ROM importer](scripts/import-poke-lounge-rom-data.ts), [데이터 소스](src/data-source.ts). production의 `DB_SYNCHRONIZE=true`는 금지되어 있다.

## 실행 전·후 확인

실행 전에는 백업, 마이그레이션 이력, 디스크·볼륨, API 주소·CORS·접근 범위를 확인한다. 설정 전체를 출력하면 secret이 포함될 수 있으므로 마스킹 없이 공유하지 않는다.

실행 후 기본 health 확인은 API `/health`, Web `/ko-KR/game`이다. 이 응답만으로 ROM 데이터·AI·다인 전투가 정상이라고 판단하지 않는다. 게임 smoke test의 기대 동작은 [현재 게임 흐름](../../README.md)을 기준으로 확인한다.

CI는 정적 검사·단위 테스트·프로덕션/Storybook 빌드를 수행하지만 Playwright 전체 회귀 및 실제 DB E2E는 현재 필수 단계가 아니다. 별도 실행 결과는 커밋·환경·범위·실패 사유와 함께 기록한다.

## 장애 확인·복구 경계

`migrate` 실패라면 API를 강제로 먼저 띄우지 않는다. 어떤 마이그레이션 또는 ROM 문서가 실패했는지 확인하고 데이터 보존을 우선한다. AI 준비에서 멈추면 워커 프로세스, Redis 큐, 워커가 접근하는 ROM API와 public 파일을 확인한다. 웹 요청 실패는 브라우저용 API URL·CORS와 내부 컨테이너 주소를 구분한다.

방은 Redis, ROM 문서는 PostgreSQL에 있으므로 한 저장소의 복원으로 전체 게임 상태가 복구된다고 가정하지 않는다. 애플리케이션 버전 롤백과 DB 복원은 별도 판단이다. 검증된 백업/복원 절차와 운영자 승인이 없이 `FLUSHDB`, 테이블 삭제, volume 삭제, migration 이력 조작을 실행하지 않는다.

로컬 직접 실행·분리 테스트 DB 준비는 [README](../../README.md)의 절차를 사용한다. `docs/`가 존재하는 개발 환경의 내부 운영 기록은 보조 자료이며, 과거 테스트 통과 기록을 현재 배포의 검증으로 재사용하지 않는다.
