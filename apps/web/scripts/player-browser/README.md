# 로컬 플레이어 입력 전달 도구

현재 테스트 기준은 루트 [PLAYER_TESTING.md](../../../../PLAYER_TESTING.md)다. 이 도구는 **화면을 본 운영자가 결정한 단일 사용자 입력**을 지속적인 Playwright 브라우저에 전달한다. 자동 시나리오나 PASS 판정기는 아니다.

## 허용 범위

`playwright`의 브라우저 API와 `tsx`를 사용한다. Playwright Test Runner, 자동 E2E·단위·API·통합 검사 및 테스트 도구 자체의 자동 검사는 제거했다. 기본 범용 도구는 `agent-browser`이며 이 CLI는 로컬 HTTP 전용 대안이다.

이 CLI의 운영 주소 제한을 우회하는 임시 어댑터나 복제 드라이버를 만들지 않는다. 운영 테스트는 운영 접근을 지원하는 기존 `agent-browser`로 수행한다. 도구가 차단되면 해당 단계와 원인을 보고하고 보안 차단을 우회하지 않는다.

## 시작과 관찰

저장소 루트에서 고유한 세션 이름을 사용한다. 브라우저 설치가 필요하면 `pnpm --filter @poke-lounge/web exec playwright install chromium webkit`을 실행한다.

```sh
pnpm player:browser open manual-001 http://127.0.0.1:3000/ko-KR/game/poke-lounge webkit
pnpm player:browser observe manual-001
```

`open`·`observe`와 입력 결과에는 JPEG 바이트·SHA-256·프레임 ID·캡처 시각·타이머·보조 UI 문구가 포함된다. 응답은 JSON이며 자동으로 보이는 이미지가 아니다. 원본을 이미지 뷰어에서 실제로 열고 해시를 확인한다. 파일명·Base64·접근성 텍스트만 읽고 화면을 보았다고 처리하지 않는다. 읽을 수 없는 축소 이미지로 버튼을 검증하지 않는다.

같은 파일시스템이면 `frame.imagePath`를 열고, 원격이면 `frame.image.data`를 디코딩해 기존 이미지 뷰어로 확인한다. 전송이 잘렸다면 출력 한도를 조정하고 원본을 다시 받는다. 재전달은 새로운 화면 관찰이 아니다.

```sh
pnpm player:browser image manual-001 FRAME_ID
```

## 한 번의 입력

실제로 본 최신 프레임의 ID·SHA-256·관찰 내용을 `seen`에 전달한다. ID를 자동 복사해 시각 확인을 대신하는 코드를 붙이지 않는다.

```sh
pnpm player:browser act manual-001 '{"requestId":"manual-step-001","seen":{"frameId":"FRAME_ID","sha256":"IMAGE_SHA256","observation":"현재 화면에서 준비 버튼이 활성화되어 있다"},"input":{"kind":"tap","target":{"role":"button","name":"준비"}}}'
```

지원 동작은 정확한 접근성 이름을 통한 `tap`·`click`·`fill`, `press`, 최대 1.5초 `hold`, 화면 좌표의 `drag`, `scroll`이다. 임의 게임 JavaScript, 상태/HP/아이템 주입, 내부 API, 강제 클릭, 입력 배열은 허용하지 않는다. 한 동작 뒤에는 새 이미지를 보고 다음 동작을 결정한다.

입력 전송 성공과 게임의 실제 반영은 다르다. 기술 실행, 아이템 소모·효과, 교체·취소·복귀를 화면으로 확인한다. 모든 버튼을 확인하지 못했다면 전체 완료/PASS로 보고하지 않는다.

## 불명확한 결과와 종료

입력과 캡처 결과는 별개다. 입력 후 캡처 실패나 timeout은 `uncertain`으로 기록하며 같은 요청을 자동 재실행하지 않는다. 먼저 `observe`로 새 화면을 확인한다. 프레임의 시간 만료나 무응답 자동 종료는 없지만 게임 시간은 계속 흐른다. `OPERATOR_GAP`은 관찰 공백 기록이며 이를 자동 진행의 직접 플레이 실적으로 세지 않는다.

```sh
pnpm player:browser status manual-001
pnpm player:browser close manual-001
```

게임의 방 나가기 UI를 거친 뒤 `close`로 자신이 연 브라우저만 종료한다. `SESSION_CLOSED`와 `BROWSER_CLOSED`는 브라우저 종료를 뜻하며 서버 방 정리 성공을 보장하지 않는다.

입력 필드와 방 코드는 캡처·문구에서 마스킹한다. 증거는 `output/player-browser/`, 실행 원장은 `docs/`에 보관하고 Git 제외를 유지한다. 자동 테스트 실행 명령과 과거 임시 `output/.../step.ts`·`ui.ts`는 더 이상 사용하지 않는다.
