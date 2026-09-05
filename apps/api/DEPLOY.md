# API Deployment

전체 환경 기준은 [Deployment and Environment](../../docs/deployment-and-env.md)를 따른다.

1. self-hosted Linux runner에 Docker와 Compose를 준비한다.
2. repository variables에 NEXT_PUBLIC_API_URL, CORS_ORIGINS를 설정하고 secrets에 DB_PASSWORD를 등록한다.
3. main에 push하거나 GitHub Actions의 CI를 main에서 수동 실행한다.
4. verify 성공 후 deploy-api.yml이 동일 커밋으로 Web·API·턴 워커를 Docker Compose로 배포한다.
5. API /health와 Web /ko-KR/game 응답을 확인한다.

Compose는 PostgreSQL health 확인 후 migrate 서비스에서 migration과 ROM 데이터 import를 실행한다.
이 작업과 Redis health 확인이 성공한 경우에만 API·턴 워커를 시작한다. 배포 전 DB backup은 별도로 준비한다.

Google 인증 관련 시크릿은 필요하지 않다. 운영 플레이는 익명이며 기존 계정용 API는 비활성화되어 있다.
개발 테스트 토큰은 production에서 활성화되지 않는다. 기존 DB 스키마와 데이터는 이 변경으로 삭제하지 않는다.

장애 복구는 [Operations Runbook](../../docs/operations-runbook.md)을 따른다.
