# Docker 실행

Docker Compose는 Web, API, 턴 워커, PostgreSQL과 Redis를 함께 실행한다. API는 PostgreSQL
migration이 성공한 뒤 시작한다.

```bash
docker compose up --build --detach
docker compose ps
```

- Web: `http://localhost:3000/ko-KR/game`
- API health: `http://localhost:3001/health`

로그와 종료:

```bash
docker compose logs --follow web api turn-worker
docker compose down
```

PostgreSQL과 Redis의 로컬 Docker 데이터까지 초기화하려면 다음 명령을 사용한다.

```bash
docker compose down --volumes
```

기본 DB 비밀번호는 로컬 실행 전용이다. 브라우저가 다른 API origin을 사용해야 하면 이미지를
다시 빌드한다.

```bash
NEXT_PUBLIC_API_URL=https://api.example.com docker compose build
```

## icenux 배포

`main` 반영 시 전용 self-hosted runner가 같은 Compose 스택을 빌드하고 실행한다. icenux에서는
기존 서비스와 충돌하지 않도록 Web `127.0.0.1:3100`, API `127.0.0.1:3101`을 사용한다.
PostgreSQL과 Redis 데이터는 Docker named volume에 유지된다.

공개값은 GitHub Actions Variables, 인증값과 DB 비밀번호는 Actions Secrets에 저장한다. 운영
컨테이너는 `restart: unless-stopped`, Docker와 runner는 systemd 서비스로 재부팅 시 복구된다.
