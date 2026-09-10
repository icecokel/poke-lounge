import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { PlayerSession, type Driver } from "./session";
import {
  frameExpiry,
  parseInput,
  parseRequest,
  sanitize,
  validateLocalUrl,
  validateSession,
  type Frame,
} from "./protocol";
import { sanitizeSnapshot } from "./driver";

function fixture() {
  let now = 1_000;
  let sequence = 0;
  let inputs = 0;
  let closed = 0;
  let captureFails = false;
  let inputFails = false;
  const events: Record<string, unknown>[] = [];
  const driver: Driver = {
    async capture() {
      if (captureFails) throw Error("Screenshot timed out");
      const image = Buffer.from([0xff, 0xd8, ++sequence, 0xff, 0xd9]);
      return {
        id: `frame-${sequence}`,
        capturedAt: now,
        expiresAt: now + 20_000,
        sha256: createHash("sha256").update(image).digest("hex"),
        imagePath: "/test/screen.jpg",
        timers: [],
        text: "- button 싸운다",
        image: { type: "image", mimeType: "image/jpeg", data: image.toString("base64") },
      };
    },
    async perform() {
      inputs++;
      if (inputFails) throw Error("Input may have arrived");
    },
    async close() {
      closed++;
    },
  };
  const session = new PlayerSession(
    driver,
    async event => {
      events.push(event);
    },
    () => now,
  );
  return {
    session,
    driver,
    events,
    counts: () => ({ inputs, closed }),
    advance: (ms: number) => {
      now += ms;
    },
    failCapture: () => {
      captureFails = true;
    },
    recoverCapture: () => {
      captureFails = false;
    },
    failInput: () => {
      inputFails = true;
    },
  };
}
const observe = (s: PlayerSession) => s.handle({ kind: "observe", requestId: "observation" });
function action(frame: Frame, requestId = "input-1") {
  return {
    kind: "act",
    requestId,
    seen: { frameId: frame.id, sha256: frame.sha256, observation: "화면에 싸운다 버튼이 보인다" },
    input: { kind: "tap", target: { role: "button", name: "싸운다" } },
  };
}
test("경로뿐 아닌 전체 이미지 바이트·해시·프레임 ID가 한 응답에 포함된다", async () => {
  const f = fixture();
  const r = await observe(f.session);
  assert(r.frame);
  assert.equal(r.code, "OBSERVE_IMAGE");
  assert.equal(r.input, "not-sent");
  assert.equal(
    createHash("sha256").update(Buffer.from(r.frame.image.data, "base64")).digest("hex"),
    r.frame.sha256,
  );
  assert.equal(f.counts().inputs, 0);
});
test("현재 이미지 확인 영수증 없이는 입력하지 않는다", async () => {
  const f = fixture();
  const screen = (await observe(f.session)).frame!;
  assert.equal(
    (await f.session.handle({ ...action(screen), seen: undefined })).code,
    "INVALID_REQUEST",
  );
  assert.equal(
    (await f.session.handle(action({ ...screen, id: "old-frame" }))).code,
    "IMAGE_RECEIPT_REQUIRED",
  );
  assert.equal(
    (await f.session.handle(action({ ...screen, sha256: "0".repeat(64) }))).code,
    "IMAGE_RECEIPT_REQUIRED",
  );
  assert.equal(f.counts().inputs, 0);
});
test("확인한 최신 프레임에 입력 하나만 수행하고 새 이미지로 교체한다", async () => {
  const f = fixture();
  const screen = (await observe(f.session)).frame!;
  const r = await f.session.handle(action(screen));
  assert.equal(r.input, "sent");
  assert.notEqual(r.frame?.id, screen.id);
  assert.equal(f.counts().inputs, 1);
  assert.equal(
    (await f.session.handle(action(screen, "old-again"))).code,
    "IMAGE_RECEIPT_REQUIRED",
  );
  assert.equal(f.counts().inputs, 1);
});
test("동일 요청 ID 재전송은 성공·불확실 여부와 관계없이 다시 입력하지 않는다", async () => {
  const f = fixture();
  const r = action((await observe(f.session)).frame!);
  await f.session.handle(r);
  assert.equal((await f.session.handle(r)).code, "INPUT_ALREADY_ATTEMPTED");
  assert.equal(
    (await f.session.handle({ ...r, input: { kind: "press", key: "Enter" } })).code,
    "REQUEST_ID_CONFLICT",
  );
  assert.equal(f.counts().inputs, 1);
});
test("20초 지난 이미지의 클릭은 보내지 않고 새 화면만 반환한다", async () => {
  const f = fixture();
  const screen = (await observe(f.session)).frame!;
  f.advance(20_001);
  const r = await f.session.handle(action(screen));
  assert.equal(r.code, "STALE_FRAME");
  assert.equal(r.input, "not-sent");
  assert.notEqual(r.frame?.id, screen.id);
  assert.equal(f.counts().inputs, 0);
});
test("입력 성공 후 캡처 실패를 입력 실패로 오인하거나 재전송하지 않는다", async () => {
  const f = fixture();
  const r = action((await observe(f.session)).frame!);
  f.failCapture();
  const failed = await f.session.handle(r);
  assert.equal(failed.input, "sent");
  assert.equal(failed.frame, undefined);
  assert.equal(failed.interrupted, true);
  assert.equal((await f.session.handle(r)).code, "INPUT_ALREADY_ATTEMPTED");
  f.recoverCapture();
  assert((await observe(f.session)).frame);
  assert.equal(f.counts().inputs, 1);
});
test("입력 타임아웃 뒤에도 새 이미지를 반환하고 불확실로 표시한다", async () => {
  const f = fixture();
  const before = (await observe(f.session)).frame!;
  f.failInput();
  const r = await f.session.handle(action(before));
  assert.equal(r.code, "INPUT_UNCERTAIN");
  assert.equal(r.input, "uncertain");
  assert(r.frame);
  assert.notEqual(r.frame.id, before.id);
  assert.equal(f.counts().inputs, 1);
});
test("이미지 바이트 손상은 경로가 있어도 확인 성공이 아니다", async () => {
  const f = fixture();
  const original = f.driver.capture;
  f.driver.capture = async () => ({ ...(await original()), sha256: "0".repeat(64) });
  assert.equal((await observe(f.session)).code, "IMAGE_INTEGRITY_FAILED");
});
test("긴 조작 공백을 자동 플레이 완료로 처리하지 않고 계속 기록한다", async () => {
  const f = fixture();
  await observe(f.session);
  f.advance(31_000);
  await f.session.noteIdle();
  await f.session.noteIdle();
  assert.equal(f.events.filter(e => e.event === "OPERATOR_GAP").length, 1);
  assert.equal((await observe(f.session)).interrupted, true);
  assert.equal(f.counts().inputs, 0);
});
test("동시 명령은 대기열에 쌓지 않아 오래된 입력을 뒤늦게 실행하지 않는다", async () => {
  const f = fixture();
  const screen = (await observe(f.session)).frame!;
  let release = () => {};
  f.driver.perform = () =>
    new Promise<void>(resolve => {
      release = resolve;
    });
  const pending = f.session.handle(action(screen));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal((await f.session.handle(action(screen, "concurrent"))).code, "SESSION_BUSY");
  release();
  assert.equal((await pending).code, "OBSERVE_IMAGE");
});
test("종료는 자기 브라우저만 닫으며 방 퇴장이나 우승을 주장하지 않는다", async () => {
  const f = fixture();
  await f.session.handle({ kind: "close", requestId: "close-1" });
  await f.session.shutdown();
  assert.equal(f.counts().closed, 1);
  assert.equal(f.events.at(-1)?.roomLeaveVerified, false);
  assert.equal((await observe(f.session)).code, "SESSION_CLOSED");
});
test("실제 화면의 턴 제한시간으로 오래된 행동을 조기에 차단한다", () => {
  assert.equal(frameExpiry(100, ["선택 시간 3s"]), 1100);
  assert.equal(frameExpiry(100, ["선택 시간 1s"]), 100);
  assert.equal(frameExpiry(100, ["라운드 1/3 시작까지 04:00"]), 20100);
});
test("자동 스크립트·배열·강제클릭·게임 스토어 접근 입력을 허용하지 않는다", () => {
  for (const input of [
    { kind: "eval", code: "window.store.win()" },
    [{ kind: "press", key: "Enter" }],
    { kind: "click", target: { role: "button", name: "확인" }, force: true },
    { kind: "hold", key: "ArrowUp", ms: 70000 },
    { kind: "press", key: "Control+Shift+I" },
  ])
    assert.throws(() => parseInput(input));
  assert.throws(() =>
    parseRequest({ kind: "observe", requestId: "read", input: { kind: "press", key: "Enter" } }),
  );
});
test("정확한 UI 이름을 문자열로만 처리하고 필드 값을 로그에서 숨긴다", () => {
  const tricky = 'Click "); await fetch("https://bad"); //';
  assert.equal(
    (
      parseInput({ kind: "tap", target: { role: "button", name: tricky } }) as {
        target: { name: string };
      }
    ).target.name,
    tricky,
  );
  const snapshot =
    '- textbox "임시 비밀번호":\n  - text: secretlower123\n- button "준비"\n- strong: A1B2C3\n- link: https://site/secret?sessionId=123';
  const clean = sanitizeSnapshot(snapshot);
  assert.doesNotMatch(clean, /secretlower123|A1B2C3|sessionId=123/);
  assert.match(clean, /준비/);
  assert.doesNotMatch(sanitize("password=secretlower123"), /secretlower123/);
});
test("새 실행 이름과 루프백 URL만 허용하고 테스트용 게임 진입은 차단한다", () => {
  assert.equal(validateSession("manual-session-1"), "manual-session-1");
  for (const name of ["../other", "default/../../", ""]) assert.throws(() => validateSession(name));
  assert.match(validateLocalUrl("http://127.0.0.1:3000/ko-KR/game/poke-lounge"), /127/);
  for (const url of [
    "https://prod.example",
    "file:///etc/passwd",
    "http://127.0.0.1/?e2e=1",
    "http://localhost/?localTest=1",
    "http://user:secret@localhost/",
  ])
    assert.throws(() => validateLocalUrl(url));
});

test("탐험 종료 직전 화면도 경계 이후 입력 근거로 재사용하지 않는다", () => {
  assert.equal(frameExpiry(100, ["라운드 1/3 시작까지 00:05"]), 3100);
  assert.equal(frameExpiry(100, ["선택 시간 15s", "시작까지 00:03"]), 1100);
});
test("상태 폴링만으로 관찰 공백을 없애지 않는다", async () => {
  const f = fixture();
  await observe(f.session);
  f.advance(20_000);
  await f.session.handle({ kind: "status", requestId: "status-only" });
  f.advance(11_000);
  await f.session.noteIdle();
  assert.equal(f.events.filter(e => e.event === "OPERATOR_GAP").length, 1);
});

test("Playwright 입력 오류의 원문에 필드 값이 있어도 감사 로그에는 남기지 않는다", async () => {
  const f = fixture();
  const frame = (await observe(f.session)).frame!;
  f.driver.perform = async () => {
    throw new Error('fill("privateLower123") timed out');
  };
  await f.session.handle(action(frame));
  assert.doesNotMatch(JSON.stringify(f.events), /privateLower123/);
  assert.match(JSON.stringify(f.events), /errorName/);
});
