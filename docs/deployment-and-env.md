# Deployment and Environment

Poke Lounge는 Web, API, 턴 워커, PostgreSQL과 Redis를 Docker Compose로 함께 배포한다.

```text
main -> icenux self-hosted runner -> Docker Compose
```

## 운영 주소

운영 Web origin은 <https://poke-lounge.icecoke.kr>이다. API의 `CORS_ORIGINS` 허용값도 이
origin을 기준으로 설정한다.

## Web

필수 환경 변수:

| 이름                  | 설명                              |
| --------------------- | --------------------------------- |
| `NEXT_PUBLIC_API_URL` | 브라우저가 호출할 공개 API origin |

## API

API와 턴 워커는 같은 image와 Compose 환경을 사용한다. 실제 값은 저장소에 커밋하지 않고
GitHub Actions Variables와 Secrets에서 주입한다.

필수 환경 변수:

| 이름                                                              | 설명                                             |
| ----------------------------------------------------------------- | ------------------------------------------------ |
| `PORT`                                                            | API 포트, 기본값 `3001`                          |
| `CORS_ORIGINS`                                                    | 허용할 Web origin 목록                           |
| `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_DATABASE` | PostgreSQL 연결                                  |
| `DB_SYNCHRONIZE=false`                                            | 운영 schema 자동 변경 금지                       |
| `REDIS_URL`                                                       | room, Socket fan-out, player state와 BullMQ 연결 |

Redis 연결에 실패하면 API와 worker는 시작하지 않으며 메모리 fallback을 사용하지 않는다.

`.github/workflows/deploy-api.yml`은 다음 repository variables를 사용한다.

| 이름                  | 필수 | 설명                         |
| --------------------- | ---- | ---------------------------- |
| `BIND_ADDRESS`        | 선택 | 기본 `127.0.0.1`             |
| `WEB_PORT`            | 선택 | 기본 `3100`                  |
| `API_PORT`            | 선택 | 기본 `3101`                  |
| `NEXT_PUBLIC_API_URL` | 필수 | 브라우저가 호출할 API origin |
| `CORS_ORIGINS`        | 필수 | 허용할 Web origin            |

Repository secrets에는 `DB_PASSWORD`를 등록한다.

## Database migrations

배포 workflow는 PostgreSQL health 확인 뒤 migration을 실행하고, 성공한 경우에만 API와 턴
워커를 시작한다.

legacy baseline은 기존 `user`, `game_history` schema가 정확히 일치할 때만 채택한다. 일부 객체나
schema 차이가 있으면 자동 수리하지 않고 실패한다.

## Release gate

기술 배포 성공은 에셋 배포 권리 승인이 아니다. 공개 배포 전
[Poke Lounge Release Gate](./poke-lounge-release-gate.md)를 확인한다.
