# Poke Lounge

Poke Lounge는 같은 마을에서 포켓몬을 탐색·포획·육성하고 3라운드 챔피언십을 진행하는 브라우저형 비공식 Pokémon 팬 게임이다.

문서 기준: `main`의 `617a60c` · 2026-09-08 KST. 아래는 현재 구현을 설명하며, 모든 조합이나 실기기 환경의 검증 완료를 뜻하지 않는다.

## 현재 구현

| 항목      | 현재 동작                                                                              |
| --------- | -------------------------------------------------------------------------------------- |
| 입장      | 로그인 없는 비공개 방 생성·초대. 공개방 선택은 현재 UI에서 비활성화                    |
| 참가자    | 사람·AI 합계 최대 8명. 시작 시 현재 인원이 4명 미만이면 4명, 그 외에는 8명까지 AI 충원 |
| 진행      | 탐험·육성 → 토너먼트를 총 3라운드 진행                                                 |
| 탐험 시간 | 90초·3분·5분 중 선택, 기본 90초                                                        |
| 필드      | 야생전·포획·성장·상점·인벤토리·PC 박스·회복·주사위                                     |
| 전투      | ROM 수치 데이터 + `@pkmn/sim` 4세대 실행기. ROM 자체를 실행하는 에뮬레이터는 아님      |
| 입력      | 데스크톱 키보드·모바일 터치, 플레이 화면 4:3, 모바일 논리 카메라 384×288               |
| 저장      | 브라우저 `localStorage`, 기존 `sessionStorage`는 일회 이전, 방 실행 UUID별 진행 격리   |

### 라운드 시작 규칙

첫 방장 시작은 바로 탐험 시간을 시작하지 않는다.

```text
대기실 준비 → 방장 시작 → 스타터/파티 준비 → 필드 렌더링·중앙 집결
→ 사람·AI 전원 준비 → 3 → 2 → 1 → 탐험 시작
```

이 경로에서는 `startRoom()` 직후 시작·종료 시각이 `null`이고, 전원 준비 후 서버가 3초 미래의 공통 시작 시각을 설정한다. 선택·로딩·카운트다운 시간은 탐험 시간에서 차감하지 않는다.

정상 **2·3라운드 전환은 다르다.** 앞 토너먼트가 끝나고 연결 참가자가 2명 이상이면 서버가 다음 탐험 시간을 즉시 시작한다. 스타터 재선택·전원 준비·3초 카운트다운을 반복하지 않는다. 2명 미만이면 대기실로 돌아간다.

대진 예고와 서버의 실제 대진은 입장 시각, 동률이면 서버 플레이어 ID 순으로 같은 시드를 사용한다. 클라이언트 로컬 저장용 ID로 바꾸기 전에 정렬하며, 확정된 서버 대진이 있으면 그것을 우선 표시한다.

### 점수·전투 진행

- 각 토너먼트가 끝나면 순위 점수를 3라운드 동안 합산한다. 우승 100점, 준우승 70점, 공동 3위 45점, 공동 5위 15점이다. 같은 단계에서 탈락하면 같은 점수이며, 남은 HP와 파티 수는 점수에 영향을 주지 않는다. 누적 동점은 공동 순위다.
- 일반 전투 메시지는 300ms(0.3초) 간격으로 자동 진행한다. 모바일 일반 메시지에는 ‘다음’ 버튼을 표시하지 않으며, 결과·기술 습득의 ‘확인’ 버튼은 유지한다. 데스크톱 확인 입력·메시지 클릭으로 기다리지 않고 넘기는 동작과 메시지박스 위치는 그대로다. 전투 연출 중에는 메시지 진행과 입력을 잠그고, 결과·기술 습득 확인은 자동으로 넘기지 않는다.
- 전투 메시지의 동적 주어 뒤 `이/가`는 받침과 관계없이 `이(가)`로 표기한다. 예: `파이리의 방어이(가) 떨어졌다!`. 영어·일본어는 해당 언어의 문장으로 번역하며, 다른 조사나 전투 규칙은 이 표기 정책의 대상이 아니다.
- AI는 타입 상성·물리/특수 능력치·능력치 변화·화상·명중률·고정 피해를 고려해 공격한다. 서버 대전에서는 강제 교체 시 상성을 비교하고, 위험이 뚜렷하게 줄어드는 경우 자발적으로 교체한다. 다중 턴 예측·특성·날씨까지 시뮬레이션하는 전략 AI는 아니다.

점수 규칙 변경 전 방의 누적 점수는 소급 재계산하지 않는다. 배포 후에는 새 방에서 시작해야 세 라운드 모두 같은 기준을 적용한다.

### 전투 상대 파티 표시

트레이너전·토너먼트에서는 상대 HP 패널 바로 아래에 참가 파티 수만큼 몬스터볼과 `남은 수/전체 수`를 표시한다. 현재 출전 포켓몬도 남은 수에 포함하고, 전투불능 슬롯은 회색·× 표시로 자리를 유지한다. 현재 출전 슬롯은 밑줄로 구분한다. 상대 HP가 화면에서 0으로 내려가는 시점에 숫자를 갱신하며, 미공개 종족·기술·대기 포켓몬의 HP는 이 표시줄에 노출하지 않는다. 모바일·웹 모두 기술 선택 중에도 표시하고, 모바일 전체화면 교체·가방에서는 상단 전투 정보에 같은 표시를 유지한다. 야생전에서는 생략한다.

### 결과 표시와 모바일 재접속

라운드 결과에서는 **이번 라운드 우승자**와 **현재 누적 순위**를 구분한다. 누적 공동 1위가 여러 명이어도 해당 라운드 준우승자를 우승으로 표시하지 않는다. 3라운드 종료 화면의 **최종 우승**만 누적 순위를 따르며, 종료된 방의 AI는 늦게 도착한 활동 정보와 관계없이 **대회 종료**로 표시한다.

모바일 방 만들기·초대 화면은 문서 전체가 스크롤되고, 필드·전투는 고정 플레이 화면을 유지한다. 입장 입력란의 포커스만으로 제목·라운드 설정을 숨기거나 폼을 재배치하지 않는다. 화면 키보드가 열려도 같은 폼을 스크롤하여 첫 탭으로 제출한다. 입장 화면과 설정의 새로고침 버튼은 문서를 다시 불러오되 저장 데이터나 참가 신원을 삭제하지 않는다. 일반 비공개 방 생성이 완료되면 생성용 URL 플래그를 제거하고, 새로고침 시 저장된 방과 실행 UUID로 복원한다. 진행 중인 야생전·미완료 선택은 복원을 보장하지 않으며 서버 시간은 계속 흐른다.

## 구조

| 경로                                  | 역할                                         |
| ------------------------------------- | -------------------------------------------- |
| `apps/web/src/components/poke-lounge` | React 화면, 입력, 연출, 기존 런타임 연결부   |
| `apps/web/src/features/poke-lounge`   | 분리한 도메인·응용·표시 모델·어댑터          |
| `apps/api`                            | REST/Socket.IO, 방·서버 권위 경기·AI/턴 워커 |
| `packages/poke-lounge-battle`         | Web/API가 공유하는 전투·대진·라운드 규칙     |

Redis는 방·경기·실시간 상태와 작업 큐를, PostgreSQL은 ROM 문서와 영속 스키마를 담당한다.

## 로컬 실행

Node.js 22와 pnpm 9.12.0을 기준으로 한다. PostgreSQL과 Redis를 먼저 준비하고, 기존 환경 파일은 덮어쓰지 않는다.

```bash
pnpm install --frozen-lockfile
cp -n apps/web/.env.example apps/web/.env.local
cp -n apps/api/.env.example apps/api/.env
```

복사한 API `.env`의 `DB_*`·`REDIS_URL`을 실제 로컬 서비스에 맞추고, `CORS_ORIGINS`에 웹 origin을 지정한다. 웹 `.env.local`의 `NEXT_PUBLIC_API_URL`도 일치시킨다. 템플릿의 DB 비밀번호를 그대로 사용하지 않는다. 일반 플레이에는 `LOCAL_TEST_AUTH_TOKEN`이 필요 없다.

최초 개발 DB 또는 스키마/ROM 데이터 변경 후:

```bash
pnpm build:api
pnpm --filter @poke-lounge/api migration:run
pnpm --filter @poke-lounge/api rom-data:import
pnpm dev
```

`pnpm dev`에는 AI/턴 워커가 포함되지 않는다. API가 준비된 뒤 별도 터미널에서 실행한다.

```bash
pnpm --filter @poke-lounge/api start:turn-worker
```

워커는 빌드된 `dist`를 실행하므로 API/워커 변경 후에는 다시 빌드하고 재시작한다. 호스트 워커가 다른 API 포트를 사용하면 `AI_RUNTIME_API_URL` 또는 `PORT`를 맞춘다.

기본 Web은 `http://localhost:3000`, API는 `http://localhost:3001`이다. Docker 전체 실행과 배포·DB 변경 주의사항은 [API 배포 가이드](apps/api/DEPLOY.md)를 따른다.

## 검증

기본 정적·단위·빌드 검사는 다음과 같다.

```bash
pnpm lint
pnpm test
pnpm build
pnpm type:check:web
pnpm check:api-contract
```

실제 API E2E는 제품 환경과 분리된 PostgreSQL `_test` DB와 루프백 Redis DB 15(`/15`)를 사용한다. **해당 Redis DB는 테스트가 비우므로 반드시 폐기 가능한 전용 인스턴스를 사용한다.** PostgreSQL 테스트 URL은 일반 `DATABASE_URL`·`DB_URL`과 달라야 하며 DB 이름도 `DB_DATABASE`와 같으면 안 된다. 테스트 DB에는 마이그레이션을 먼저 적용한다.

```bash
export TEST_DATABASE_URL='postgresql://USER:PASSWORD@127.0.0.1:5432/poke_lounge_test'
export REDIS_URL='redis://127.0.0.1:6379/15'
pnpm build:poke-lounge-battle
pnpm --filter @poke-lounge/api migration:run:test
pnpm test:api:e2e
```

Playwright·실제 DB 통합·에이전트 직접 플레이는 별도 검증이다. CI 성공을 이들 검사의 성공으로 해석하지 않는다. 직접 플레이 지침은 [에이전트 브라우저 테스트](.agents/skills/poke-lounge-agent-browser-test/SKILL.md)를 사용한다.

첫 탭·대진 예고 회귀는 이미 빌드해 실행한 **격리된 로컬 Web/API/워커**에 연결한다. `POKE_LOUNGE_REAL_API_TESTS=1`인 경우만 실제 방을 생성하며, 기본값에서는 실제 API 검사를 건너뛴다. 다음 검사는 Playwright UI 회귀이고, 3라운드 직접 플레이 완주로 계산하지 않는다.

```bash
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 \
PLAYWRIGHT_ENABLE_CROSS_BROWSER=1 POKE_LOUNGE_REAL_API_TESTS=1 \
pnpm --filter @poke-lounge/web exec playwright test \
  tests/e2e/poke-lounge-entry-first-tap.spec.ts --project=chromium --project=webkit
```

## 문서

Git에서 추적하는 기준 문서는 다음 네 개다.

- 이 README: 제품 개요·현재 흐름·로컬 실행
- [API 배포 가이드](apps/api/DEPLOY.md): Compose·CI 배포·DB 변경·복구 경계
- [기능 경계](apps/web/src/features/poke-lounge/README.md): UI와 비즈니스 로직의 책임 분리
- [에이전트 브라우저 테스트](.agents/skills/poke-lounge-agent-browser-test/SKILL.md): 직접 플레이 절차·안전한 관찰

`docs/`는 기존 정책대로 Git에서 제외된 내부 문서다. 내부 문서는 `docs/README.md`에서 현재 기준과 과거 기록을 구분한다.
