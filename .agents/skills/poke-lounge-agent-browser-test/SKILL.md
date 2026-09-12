---
name: poke-lounge-agent-browser-test
description: Run or coordinate agent-operated Poke Lounge browser playtests with Vercel agent-browser. Use for local, integration, or production browser play, diagnosis, and captures; not for unit/API-only tests.
---

# Poke Lounge Agent Browser Test

구현 기준: `617a60c` · 2026-09-08 KST. 직접 플레이의 기본 드라이버는 Vercel Labs `agent-browser`다. Playwright 시나리오는 공식 Playwright 러너로 실행한다.

## 플레이어 관점 직접 테스트 요청 시 우선 규칙

사용자가 “플레이어처럼”, “직접 화면 조작”, “Playwright로 브라우저를 열어 테스트”라고 요청하면 일반 자동화 시나리오와 구분한다. Playwright CLI/브라우저를 열고 **스크린샷 확인 → 에이전트 판단 → 개별 입력 → 변경 화면 확인**을 반복한다. 사전 spec/자동 플레이 루프를 실행하고 결과만 읽는 것은 직접 플레이 완료로 세지 않는다.

이 모드에서는 아래의 일반 지침에 있는 서버 권위 상태·E2E getter 허용보다 엄격하게, 실제 화면과 접근 가능한 UI 문구만으로 판단한다. DB/Redis/저장소/게임 스토어/테스트 getter, 정적 지도·전투 카탈로그를 읽어 플레이하거나 판정을 대신하지 않는다. 화면에서 발견한 버그의 사후 소스 분석은 플레이와 분리한다. 입력 전달·화면 저장 helper는 가능하지만 행동을 자동 선택·반복하는 driver는 금지한다. 브라우저 에뮬레이션을 실제 휴대폰 앱 검증으로 보고하지 않는다.

우승·순위는 목표나 PASS 조건이 아니다. 3라운드 최종 결과까지 실제 조작으로 정상 완료하고 퇴장하는지를 검사한다. 연속 3회 PASS 또는 총 10회 시도에서 종료하며 버그 발견 즉시 연속 PASS를 0으로 초기화한다. 포획·거래는 가능한 상황에서 점검하되 성공 횟수를 완주의 전제로 삼지 않는다. 조작 공백과 미검증 기능을 구분하며 이전 실적을 소급 PASS하지 않는다. 최신 상세 기준은 [반복 테스트 프롬프트](../../../apps/web/scripts/player-browser/playtest-prompt.md)를 따른다.

## 직접 플레이 드라이버 — 2026-09-10 보완

직접 플레이는 루트의 `pnpm player:browser`를 사용한다. 구현·명령 계약은 [플레이어 브라우저 사용법](../../../apps/web/scripts/player-browser/README.md)을 따른다. 지속적인 Playwright 브라우저와 단일 입력만 사용하며 자동 spec/전투 루프가 아니다.

게임 시작 전 `open`/`observe`가 반환한 실제 JPEG를 이미지 뷰어에서 열어 프레임 ID와 해시를 확인한다. 응답에 파일명만 있거나 Base64를 아직 디코딩·표시하지 못했으면 직접 플레이를 시작하지 않는다. 이미지 전용 MCP 도구가 없는 연결에서는 이미지 바이트를 전달해 뷰어로 여는 사전 점검이 필수다. 공개 터널이나 경로만 출력하는 임시 helper를 만들지 않는다.

각 `act`는 실제로 본 최신 프레임의 `seen` 기록과 단일 UI 입력을 요구한다. 20초 프레임 만료·화면 타이머에 따른 입력 차단·2분 무응답 자동 종료는 제거했다. 시간만으로 입력을 거부하지 않지만 화면이 바뀌었을 가능성이 있으면 다시 보고 판단한다. 입력/캡처/전송 실패를 나눠 기록하고, 같은 요청을 자동 재실행하지 않는다. `OPERATOR_GAP`은 입력·종료를 강제하지 않는 관찰 공백 기록이며, 미확인 자동 진행을 직접 플레이 완료로 계산하지 않는다. 작업 후 `close`로 해당 브라우저를 명시적으로 닫는다. 게임 서버의 턴 제한시간과 라운드 시계는 그대로다.

아래 일반 지침의 agent-browser 준비 절차·읽기 전용 getter 허용은 직접 플레이 모드에 적용하지 않는다. 게임 규칙이나 서버 시계를 변경해 테스트 도구 지연을 숨기지 않는다. 운영자가 이미지를 봤다는 것은 선언으로 기록할 뿐 코드가 시각적 인지를 증명한다고 주장하지 않는다.

## 시작 전

1. 저장소 [README](../../../README.md)의 현재 라운드 흐름과 검증 구분을 읽는다. 로컬 `docs/`가 있으면 `docs/poke-lounge-multiplayer-test-scenarios.md`도 확인한다.
2. 첫 브라우저 명령 전에 `agent-browser --version`, `agent-browser skills get core --full`을 실행한다. CLI/Chrome이 준비되지 않으면 `INFRA-BLOCKED`로 분류한다.
3. 매 참가자는 `poke-<run-id>-mp1`처럼 고유 named session을 사용한다. 기본 세션·다른 작업의 세션·`close --all`을 사용하지 않는다. 같은 브라우저 프로필의 탭은 `localStorage` 신원을 공유할 수 있다.

## 환경과 진입

- 기본은 headless다. 사용자가 요청했거나 캡처만으로 진단할 수 없는 경우만 headed를 사용한다.
- Desktop Web은 1440×900으로 설정한다.
- Mobile Web은 빈 세션에서 `open --init-script .agents/skills/poke-lounge-agent-browser-test/scripts/mobile-touch-init.js` → `set device "iPhone 12"` → 대상 URL 순서로 연다. 390×844와 `navigator.maxTouchPoints > 0`을 확인한다. 좁은 viewport만으로 모바일이라고 보고하지 않는다.
- 일반 입장은 비공개 방 생성·초대 UI다. 존재하지 않는 Solo→Multiplayer 탭을 찾지 않는다. 개발 로컬 테스트는 허용 환경에서 별도 영역으로 표시된다.
- 대기실에는 설정 메뉴가 있다. 가능한 첫 시점에 소리를 끄고 UI 상태를 확인한 뒤 `AUDIO-MUTED <MP role>`을 기록한다.
- 사용자가 요청하지 않으면 조정자는 플레이어 자리를 차지하지 않는다.

제품의 첫 출발/후속 라운드 규칙은 README를 기준으로 판정한다. 테스트 지침에서 타이머 정책을 다시 정의하지 않는다.

## 조작

1. 화면 이동·대화상자·장면 변경 뒤 `snapshot -i`를 새로 얻는다. 오래된 ref를 재사용하지 않는다.
2. 준비·라운드·턴은 보이는 UI 또는 안전하게 필터링한 서버 권위 상태를 기다린다. 임의 sleep으로 완료를 대신하지 않는다.
3. 모든 행동은 공개 UI로 한다. 내부 API, `fetch`, 요청 재실행, route/mock, E2E setter로 준비·전투·승자·결과를 만들지 않는다.
4. 캡처는 `output/agent-browser/poke-lounge/<run-id>/`에 역할·환경·체크포인트별로 저장한다. 비밀번호·token·cookie·sessionId·실제 방 코드·초대 링크·전체 Socket payload를 남기지 않는다.
5. 실패와 최종 판정 전 `console`, `errors`, 필요한 네트워크 메타 정보를 확인한다.
6. 필드 이동 전에 도움말/작업 화면이 닫혔는지 확인한다. Desktop은 게임 영역에 포커스를 주고 `node .agents/skills/poke-lounge-agent-browser-test/scripts/desktop-arrow-hold.mjs <session> <Arrow>`를 사용한다. 이 helper는 물리 키 코드를 포함해 50ms 누르고 놓는다. Mobile은 pointer-down → 좌표/방향 변화 확인 → pointer-up으로 조작한다.
7. 퇴장 버튼과 확인은 필요한 단계에서 한 번씩 실행한다. 실행자가 같은 명령을 반복 제출하지 않는다.

포커스를 주려고 게임 영역을 클릭하지 않는다. 클릭 자체가 현재 선택 확정일 수 있다. 단계 전환 뒤 새 스냅샷으로 포커스를 다시 확인한다. projection이 없어 복구할 때는 60초 재접속 유예 내 새로고침을 한 번만 허용하되, 보이는 결과 확인이 남아 있으면 먼저 정확히 한 번 처리한다.

## 전투 판정

- **메뉴 조작**: 싸운다·가방·포켓몬을 열거나 후보를 고르는 것은 턴 제출이 아니다. 화면 상태만 확인하고 HTTP 요청을 요구하지 않는다.
- **야생전/로컬 전투**: 실제 행동 뒤 턴·PP·HP·상태·파티·결과의 관련 변화를 확인한다. `session-actions` 요청 부재는 실패 근거가 아니다.
- **서버 권위 전투**: 서버 전투임을 확인한 뒤 실제 제출 요청과 서버 확정 턴/결과를 본다. 클라이언트는 익명 세션일 때 `/session-actions`, 인증 토큰이 있을 때 `/actions` 경로를 선택한다. 경로 존재만으로 현재 환경의 인증 요청이 허용된다고 단정하지 않는다. 실제 제출 뒤 5초 동안 요청이 없다면 단계·포커스와 같은 턴임을 확인하고 절차를 한 번만 재시도한다. 2xx 이후에는 같은 턴을 다시 제출하지 않는다.
- 상태이상·준비·회복 기술처럼 즉시 피해가 없는 정상 행동을 피해량만으로 실패 판정하지 않는다.

## 읽기 전용 관찰 허용 범위

공개 UI 또는 읽기 전용 E2E getter에서 **필요한 값만 브라우저 안에서 투영**한다. 원본 getter 반환값이나 request/response 본문을 저장하지 않는다.

| 분류     | 기록 가능 정보                                                                       |
| -------- | ------------------------------------------------------------------------------------ |
| 환경     | 커밋, 브라우저, viewport, touch 지원, 테스트 역할                                    |
| 방·준비  | 상태, revision, 라운드 index/phase/duration/start/end, 사람·AI·연결·준비 인원 집계   |
| 필드     | 본인 x/y/facing, 열린 작업, 이동/준비 잠금                                           |
| 전투     | 종류, phase, turn, 입력/강제 교체, 공개 전투 HP·상태·PP, 결과 reason, 서버 전투 여부 |
| 결과     | bracket 완료 여부, rank/score, ID를 역할/AI 순번으로 익명화한 승패                   |
| 네트워크 | method, 식별자를 제거한 route template, statusCode, duration                         |
| 정리     | 마지막 퇴장 성공, closed/completed, 연결 사람·남은 AI 집계                           |

실제 playerId/sessionId·방 ID/코드·계정 식별자·token·cookie·원본 terminal·Socket payload는 기록하지 않는다. 안전하게 관찰할 방법이 없으면 `DOC-GAP`으로 남긴다.

## 완료와 정리

전체 사이클 PASS는 3라운드 최종 순위가 참가자 사이에서 수렴하고 각 플레이어가 결과 확인 후 UI로 퇴장했을 때만 사용한다. 그보다 적게 실행했으면 확인한 구간만 보고한다.

마지막 사람의 명시적 퇴장 후 `closed`, 연결 사람 0, AI 정리를 확인한다. 종료 이력·TTL과 비동기 live 상태 삭제 때문에 모든 Redis 키가 즉시 사라져야 한다고 요구하지 않는다. UI 복귀만 확인했다면 서버 정리는 미검증으로 구분한다.

마지막으로 이번 실행에서 만든 named session만 닫는다. `DOC-GAP`, `CODE-FAIL`, `TEST-RUNNER`, `INFRA-BLOCKED`를 구분하고 관찰하지 않은 진행을 만들어내지 않는다.
