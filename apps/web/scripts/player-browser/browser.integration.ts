/** Tooling regression only. This fixture is not Poke Lounge gameplay or a completed campaign. */
import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { setTimeout as wait } from "node:timers/promises";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { openDriver } from "./driver";
import { PlayerSession } from "./session";
import type { Frame, Input, Reply } from "./protocol";

const exec = promisify(execFile);
const webRoot = fileURLToPath(new URL("../../", import.meta.url));
const evidence = fileURLToPath(
  new URL("../../../../output/player-browser-tool-verification/", import.meta.url),
);
const html = `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Player browser transport check</title><style>body{font:20px system-ui;margin:24px}button,input{display:block;font-size:22px;margin:20px 0;padding:12px}h1{font-size:26px}#pad{height:110px;border:2px solid;touch-action:none}</style><h1>브라우저 도구 검증</h1><p>게임 플레이가 아닌 입력·화면 전달 검사</p><p role="timer">선택 시간 1s</p><p role="status" id="result">입력 횟수: 0</p><button id="inc">증가</button><button disabled>사용 불가</button><label>검사용 입력<input aria-label="검사용 입력" value="lowerSecret123"></label><div id="pad">드래그 영역</div><p id="keys">키 대기</p><script>let n=0;document.querySelector('#inc').onclick=()=>document.querySelector('#result').textContent='입력 횟수: '+(++n);document.onkeydown=e=>document.querySelector('#keys').textContent='누름 '+e.key;document.onkeyup=e=>document.querySelector('#keys').textContent='해제 '+e.key;</script></html>`;
async function pageServer() {
  const server = createServer((_req, res) =>
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(html),
  );
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address !== "string");
  return {
    url: `http://127.0.0.1:${address.port}/`,
    close: () => new Promise<void>(resolve => server.close(() => resolve())),
  };
}
function input(frame: Frame, action: Input, requestId = randomUUID()) {
  return {
    kind: "act",
    requestId,
    seen: {
      frameId: frame.id,
      sha256: frame.sha256,
      observation: "도구 검증용 화면의 버튼과 상태를 검사하는 자동 회귀",
    },
    input: action,
  };
}
for (const browser of ["chromium", "webkit"] as const) {
  test(`${browser}: 실제 브라우저에서 UI 입력·JPEG 전달·실패 후 화면 재조회`, async () => {
    const http = await pageServer();
    const directory = await mkdtemp(join(tmpdir(), "pl-browser-"));
    const driver = await openDriver(http.url, directory, browser, false);
    const session = new PlayerSession(driver, async () => {});
    try {
      const first = await session.handle({ kind: "observe", requestId: "initial" });
      assert(first.frame);
      assert.match(first.frame.text, /브라우저 도구 검증/);
      assert.doesNotMatch(first.frame.text, /lowerSecret123/);
      assert.deepEqual(first.frame.timers, ["선택 시간 1s"]);
      assert.equal("expiresAt" in first.frame, false);
      const request = input(first.frame, { kind: "tap", target: { role: "button", name: "증가" } });
      const second = await session.handle(request);
      assert(second.frame);
      assert.equal(second.input, "sent");
      assert.match(second.frame.text, /입력 횟수: 1/);
      assert.equal((await session.handle(request)).code, "INPUT_ALREADY_ATTEMPTED");
      const third = await session.handle(
        input(second.frame, { kind: "hold", key: "ArrowRight", ms: 30 }),
      );
      assert(third.frame);
      assert.match(third.frame.text, /해제 ArrowRight/);
      const blocked = await session.handle(
        input(third.frame, { kind: "tap", target: { role: "button", name: "사용 불가" } }),
      );
      assert.equal(blocked.code, "INPUT_UNCERTAIN");
      assert(blocked.frame);
      assert.match(blocked.frame.text, /입력 횟수: 1/);
      const bytes = Buffer.from(blocked.frame.image.data, "base64");
      assert((await readFile(blocked.frame.imagePath)).equals(bytes));
      assert.equal(createHash("sha256").update(bytes).digest("hex"), blocked.frame.sha256);
      await mkdir(evidence, { recursive: true });
      await writeFile(join(evidence, `${browser}-received.jpg`), bytes);
      await writeFile(join(evidence, `${browser}-reply.json`), JSON.stringify(blocked));
    } finally {
      await session.shutdown();
      await http.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
}
test("CLI 새 프로세스 사이에도 같은 브라우저 유지·프레임 응답 전송·명시적 종료", async context => {
  const http = await pageServer();
  const name = `bridge-${randomUUID().slice(0, 8)}`;
  const cli = async (...args: string[]) => {
    const { stdout } = await exec(
      "pnpm",
      ["exec", "tsx", "scripts/player-browser/cli.ts", ...args],
      { cwd: webRoot, timeout: 40_000, maxBuffer: 1_000_000 },
    );
    return JSON.parse(stdout.trim()) as Reply;
  };
  try {
    const first = await cli("open", name, http.url, "chromium");
    assert(first.frame);
    assert.equal(first.code, "OBSERVE_IMAGE");
    if (process.env.PLAYER_BROWSER_VERIFY_IDLE === "1") {
      // No polling, mocked clocks, or game processes: exercise a real idle browser.
      const startedAt = Date.now();
      await wait(125_000);
      assert(Date.now() - startedAt >= 125_000);
      context.diagnostic("125초 무요청 뒤 같은 브라우저와 첫 프레임으로 입력 재개 검증");
    }
    const result = await cli(
      "act",
      name,
      JSON.stringify(input(first.frame, { kind: "tap", target: { role: "button", name: "증가" } })),
    );
    assert(result.frame);
    assert.match(result.frame.text, /입력 횟수: 1/);
    const view = await cli("observe", name);
    assert(view.frame);
    assert.match(view.frame.text, /입력 횟수: 1/);
    assert.equal((await cli("close", name)).code, "SESSION_CLOSED");
  } finally {
    await cli("close", name).catch(() => {});
    await http.close();
  }
});
