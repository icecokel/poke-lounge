# Deployment and Environment

Poke Lounge는 Web, API, 턴 워커, PostgreSQL과 Redis를 Docker Compose로 함께 배포한다.

```text
main -> CI verify -> icenux self-hosted runner -> Docker Compose
```

## CI와 배포 실행

PR은 검증만 실행한다. main push 또는 main에서 수동으로 실행한 CI는 verify 성공 후에만
재사용 workflow인 deploy-api.yml을 호출하며, 검증한 동일 커밋 SHA를 배포한다.
수동 배포는 GitHub Actions의 CI에서 main을 선택해 실행한다. Deploy를 직접 실행하는 우회 경로는 없다.

CI는 공통 전투 패키지를 먼저 빌드하고 정적 검사·단위 테스트·전체 production build를 실행한다.
Web type check는 Next.js route type 생성 이후에 실행하며 Docker에서 사용하는 Storybook도 빌드한다.
에셋 권리 승인 게이트와 Google 인증 시크릿은 사용하지 않는다. 포맷 검사는 기존처럼 advisory다.

## 익명 플레이와 계정 API

운영 Web은 계정 세션 요청 없이 익명으로 시작한다. 개인 진행은 기존 브라우저 로컬 저장을 사용하며,
멀티플레이 room UUID와 private sessionId 검증은 그대로 유지한다.
Google 토큰 검증과 NextAuth 의존성은 제거했다. 기존 계정 저장·결과·계정 기반 경쟁 API는
인증 없이 개방하지 않고 503 ACCOUNT_AUTH_DISABLED를 반환한다. DB 스키마와 기존 계정 데이터는 유지한다.

개발 환경에서 명시적으로 활성화한 로컬 테스트 계정만 기존 테스트용 저장 API를 사용할 수 있다.
LOCAL_TEST_AUTH_TOKEN은 선택 사항이고 production에서는 무시한다. 테스트 세션은
/api/local-test-mode/session에서만 제공하며 /api/auth/* 경로는 제거했다.

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
