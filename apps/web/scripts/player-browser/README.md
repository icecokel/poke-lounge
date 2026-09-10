# 플레이어 관점 브라우저 드라이버

게임을 자동으로 이기는 테스트가 아니다. 에이전트가 실제 스크린샷을 보고 결정한 **단일 UI 입력**을 지속적인 Playwright 브라우저에 전달한다. 제품의 전투 계산·서버 타이머·AI·저장 데이터를 읽거나 변경하지 않는다. 기존 `output/.../step.ts`를 새로운 실행에 사용하지 않는다.

## 코드에서 보장하는 것

`observe`와 입력 후 응답에는 **JPEG 이미지 바이트, SHA-256, 프레임 ID, 캡처 시각, 만료 시각, 보조 UI 텍스트**가 함께 있다. 이미지 없이 경로만 있는 응답, 잘린 JSON·한글 청크·해시 불일치는 성공으로 처리하지 않는다. 브라우저와 클라이언트는 외부 HTTP 터널이 아닌 현재 사용자의 로컬 Unix 소켓으로 연결된다.

다음 입력은 `seen.frameId`, `seen.sha256`, `seen.observation`이 있어야 한다. 이는 **실제 이미지를 본 운영자의 선언**이다. 소프트웨어가 사람이 이미지를 봤다는 사실까지 증명하지는 못한다. ID를 자동 복사해 확인을 대신하거나 전체 행동을 반복하는 프로그램을 붙이지 않는다.

프레임은 최대 20초 또는 화면에 표시된 턴/라운드 종료 2초 전까지만 입력 근거로 유효하다. 만료된 프레임으로 요청하면 **입력 없이 새 이미지만 반환**한다. 두 동시 입력을 뒤늦게 실행하는 대기열도 없다.

입력과 캡처의 결과는 분리된다. 입력 후 캡처가 실패해도 같은 요청 ID는 다시 실행되지 않는다. 타임아웃은 `uncertain`으로 남기며, 정상 여부를 새 화면으로 판정한다. 30초 넘는 관찰 공백은 `OPERATOR_GAP`과 `interrupted: true`로 남고, 이후 조회로 지워지지 않는다. 어떤 명령도 우승·회차 완료·무버그 PASS를 자동으로 판정하지 않는다.

2분 동안 요청이 없으면 해당 드라이버의 브라우저와 소켓만 닫는다. **게임 시간은 멈추지 않는다.** 정상 완료 전에는 게임의 `방 나가기` UI를 직접 거쳐야 한다. 브라우저 종료를 서버의 방 정리 완료로 해석하지 않는다.

## 실행

루트에서 실행한다. 저장소에 설치된 `@playwright/test`와 `tsx`를 사용하며, `output` 안의 임시 Playwright CLI 설치에 의존하지 않는다. 브라우저가 없다면 `pnpm --filter @poke-lounge/web exec playwright install chromium webkit`으로 설치한다.

```sh
pnpm player:browser open manual-001 http://127.0.0.1:3000/ko-KR/game/poke-lounge webkit --headed
pnpm player:browser observe manual-001
```

각 실행 이름은 재사용하지 않는다. 기본 크기는 iPhone 12 모바일 에뮬레이션이다. 실제 Safari/Chrome/카카오 앱 실기기 검사는 아니다. 로컬 HTTP 주소만 허용하고 `e2e`, `localTest`, 인카운트 조정 쿼리는 거부한다. 운영 주소 접근이나 게임 상태 주입은 이 도구의 범위가 아니다.

### 이미지 수신을 먼저 검증

CLI 출력은 **JSON이지 자동으로 표시되는 이미지가 아니다.** 이미지 뷰어가 같은 파일시스템을 읽으면 `frame.imagePath`를 열고, 원격이면 `frame.image.data`를 디코딩해 이미지 뷰어에 전달한다. MIME은 `image/jpeg`이고 해시는 원본 JPEG 바이트를 기준으로 한다. 정상 캡처가 있어도 화면을 실제로 열지 못하면 **테스트를 시작하지 않는다.** Base64 문자열이나 접근성 텍스트를 읽은 것만으로 스크린샷을 봤다고 기록하지 않는다.

연결 도구가 응답을 자르면 출력 한도를 최소 600,000바이트로 지정한다. 이미 저장된 프레임의 바이트는 아래 명령으로 다시 받을 수 있다. 이것은 **원본 프레임 재전달**이지 새 화면 캡처가 아니며, 만료시간을 연장하지 않는다.

```sh
pnpm player:browser image manual-001 FRAME_ID
```

`output/player-browser/manual-001/last-reply.json`에는 원본 응답, `latest-frame.json`에는 이미지 외 메타데이터가 저장된다. 해시 확인 없이 일부 청크만 이미지로 쓰지 않는다. 이미지 전달이 실패한 동안 게임 타이머가 흐른 구간은 직접 플레이 횟수에 넣지 않는다. 플랫폼의 도구 응답 전달이나 에이전트 판단 속도 자체를 이 저장소 코드로 보장할 수는 없다.

### 화면 확인 후 한 행동

아래 ID와 해시는 **이미지를 보고 결정한 운영자**가 방금 응답에서 가져온 값이다. `requestId`는 그 행동의 고유 ID이며 결과가 불명확할 때 같은 행동을 새 ID로 자동 재시도해서는 안 된다.

```sh
pnpm player:browser act manual-001 '{"requestId":"manual-step-001","seen":{"frameId":"FRAME_ID","sha256":"IMAGE_SHA256","observation":"현재 화면에서 준비 버튼이 활성화되어 있다"},"input":{"kind":"tap","target":{"role":"button","name":"준비"}}}'
```

지원 입력은 정확한 접근성 이름의 `tap`/`click`/`fill`, `press`, 최대 1.5초 `hold`, 현재 화면 좌표의 `drag`, `scroll`이다. 화면의 버튼 이름은 그대로 입력한다. 임의 JavaScript·CSS 선택자·강제 클릭·입력 배열·내부 API·게임 훅은 없다. 텍스트 입력 후 Tab이나 바깥 클릭이 필요하면 화면 확인 후 별도 행동으로 지정한다. 원시 입력값과 비밀번호는 감사 로그에 기록하지 않는다. 스크린샷의 입력 필드·방 코드는 마스킹하며 접근성 텍스트에서도 제외한다.

```sh
pnpm player:browser status manual-001
pnpm player:browser close manual-001
```

`close` 성공이면 `SESSION_CLOSED`와 `audit.jsonl`의 `BROWSER_CLOSED`를 확인한다. 서버·DB·Redis를 이 도구가 임의로 종료하지 않는다. 이미지를 받지 못한 경우, 입력 실패, 브라우저 종료를 하나의 “Playwright 장애”로 합치지 않는다.

## 검증 구분

```sh
pnpm test:player-browser
pnpm test:player-browser:integration
```

첫 명령은 프로토콜·프레임 확인·중복 입력·관찰 공백·IPC의 단위 회귀다. 두 번째는 별도의 작은 HTML 페이지에 Chromium·WebKit을 연결하는 **도구 통합 회귀**다. 포켓몬 3회 포획·상점 구매·3라운드 우승을 수행한 실제 플레이 1회로 계산하지 않는다. 단위 회귀는 `pnpm test:web`에도 포함된다.

상세 플레이 결과 문서는 기존 `docs/` 정책을 따르고, 프레임·감사 로그·검증 증거는 `output/`에 둔다. 코드와 이 사용법만 버전 관리한다.
