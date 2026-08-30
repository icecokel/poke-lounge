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

기본 인증값과 DB 비밀번호는 로컬 실행 전용이다. 실제 Google 로그인 또는 외부 배포에서는
`AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `AUTH_SECRET`, `GOOGLE_CLIENT_ID`를 별도로 설정한다.
브라우저가 다른 API origin을 사용해야 하면 이미지를 다시 빌드한다.

```bash
NEXT_PUBLIC_API_URL=https://api.example.com docker compose build
```
