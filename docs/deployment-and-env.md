# Deployment and Environment

Poke Lounge는 Web과 API를 별도로 배포한다.

```text
apps/web -> Vercel
apps/api + turn worker -> self-hosted runner -> PM2
```

## Web

Vercel Root Directory는 `apps/web`, Node.js는 22.x로 설정한다. 빌드는
`pnpm build`를 사용한다.

필수 환경 변수:

| 이름                  | 설명                              |
| --------------------- | --------------------------------- |
| `NEXT_PUBLIC_API_URL` | 브라우저가 호출할 공개 API origin |
| `AUTH_GOOGLE_ID`      | Google OAuth client ID            |
| `AUTH_GOOGLE_SECRET`  | Google OAuth client secret        |
| `AUTH_SECRET`         | Auth.js 서명 secret               |

`AUTH_URL`은 플랫폼이 URL을 추론하지 못할 때만 설정한다. 공개 배포를 권리 상태와 함께
차단하려면 `POKE_LOUNGE_PROVENANCE_STRICT=1`을 설정한다.

## API

API와 턴 워커는 같은 release와 `.env`를 사용한다. 실제 값은 저장소에 커밋하지 않고
`apps/api/.env.example`을 기준으로 배포 호스트에 구성한다.

필수 환경 변수:

| 이름                                                              | 설명                                             |
| ----------------------------------------------------------------- | ------------------------------------------------ |
| `PORT`                                                            | API 포트, 기본값 `3001`                          |
| `CORS_ORIGINS`                                                    | 허용할 Web origin 목록                           |
| `GOOGLE_CLIENT_ID`                                                | Google ID token 검증 client ID                   |
| `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_DATABASE` | PostgreSQL 연결                                  |
| `DB_SYNCHRONIZE=false`                                            | 운영 schema 자동 변경 금지                       |
| `REDIS_URL`                                                       | room, Socket fan-out, player state와 BullMQ 연결 |

Redis 연결에 실패하면 API와 worker는 시작하지 않으며 메모리 fallback을 사용하지 않는다.

`.github/workflows/deploy-api.yml`을 사용하려면 repository variables에 다음 값을 등록한다.

| 이름                           | 필수 | 설명                       |
| ------------------------------ | ---- | -------------------------- |
| `API_DEPLOY_DIR`               | 필수 | 호스트의 절대 release 경로 |
| `API_HEALTH_URL`               | 필수 | 공개 `/health` URL         |
| `API_LOCAL_HEALTH_URL`         | 선택 | 호스트 내부 `/health` URL  |
| `API_PROCESS_NAME`             | 선택 | PM2 API 이름               |
| `API_TURN_WORKER_PROCESS_NAME` | 선택 | PM2 worker 이름            |

## Database migrations

배포 workflow는 migration을 자동 실행하지 않는다. 운영 반영 전 backup을 만들고 다음 순서로
실행한다.

```bash
pnpm build:api
pnpm --filter @poke-lounge/api migration:show
pnpm --filter @poke-lounge/api migration:run
```

legacy baseline은 기존 `user`, `game_history` schema가 정확히 일치할 때만 채택한다. 일부 객체나
schema 차이가 있으면 자동 수리하지 않고 실패한다.

## Release gate

기술 배포 성공은 에셋 배포 권리 승인이 아니다. 공개 배포 전
[Poke Lounge Release Gate](./poke-lounge-release-gate.md)를 확인한다.
