import assert from "node:assert/strict";
import test from "node:test";
import { createServer, createConnection } from "node:net";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { PlayerSession } from "./session";
import { sendRequest, serveSession, socketPath } from "./ipc";

test("IPC는 이미지 전체 바이트와 한글을 전달하고 소켓은 소유자만 접근한다", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pl-ipc-"));
  const path = socketPath(directory);
  const bytes = Buffer.alloc(120_000, 100);
  const session = new PlayerSession(
    {
      async capture() {
        return {
          id: randomUUID(),
          capturedAt: Date.now(),
          expiresAt: Date.now() + 20000,
          sha256: createHash("sha256").update(bytes).digest("hex"),
          imagePath: "screen.jpg",
          text: "한글 화면".repeat(1000),
          timers: [],
          image: { type: "image", mimeType: "image/jpeg", data: bytes.toString("base64") },
        };
      },
      async perform() {},
      async close() {},
    },
    async () => {},
  );
  const stop = await serveSession(path, session, async () => {});
  try {
    assert.equal((await stat(path)).mode & 0o777, 0o600);
    const result = await sendRequest(path, { kind: "observe", requestId: "large-frame" });
    assert.equal(result.frame?.text, "한글 화면".repeat(1000));
    assert(Buffer.from(result.frame!.image.data, "base64").equals(bytes));
  } finally {
    await stop();
    await rm(directory, { recursive: true, force: true });
  }
});
test("중간에 끊긴 응답을 화면 확인 성공으로 파싱하지 않는다", async () => {
  const path = socketPath(randomUUID());
  const server = createServer(socket => {
    socket.once("data", () => socket.end('{"code":"OBSERVE_IMAGE","frame":'));
  });
  await new Promise<void>(resolve => server.listen(path, resolve));
  try {
    await assert.rejects(
      sendRequest(path, { kind: "observe", requestId: "incomplete" }),
      /Connection ended/,
    );
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
test("잘못된 JSON은 브라우저 조작 없이 명시적으로 거부한다", async () => {
  const path = socketPath(randomUUID());
  let inputs = 0;
  const session = new PlayerSession(
    {
      async capture() {
        throw Error("Must not capture");
      },
      async perform() {
        inputs++;
      },
      async close() {},
    },
    async () => {},
  );
  const stop = await serveSession(path, session, async () => {});
  try {
    const response = await new Promise<string>((resolve, reject) => {
      const socket = createConnection(path);
      socket.setEncoding("utf8");
      socket.on("error", reject);
      socket.on("connect", () => socket.write("invalid-json\n"));
      socket.once("data", chunk => {
        resolve(String(chunk));
        socket.end();
      });
    });
    assert.equal(JSON.parse(response).code, "INVALID_JSON");
    assert.equal(inputs, 0);
  } finally {
    await stop();
  }
});
test("오래 방치한 드라이버는 자체 브라우저·소켓만 정리한다", async () => {
  const path = socketPath(randomUUID());
  let closes = 0;
  const session = new PlayerSession(
    {
      async capture() {
        throw Error("No input");
      },
      async perform() {
        throw Error("No input");
      },
      async close() {
        closes++;
      },
    },
    async () => {},
  );
  const stop = await serveSession(path, session, async () => {}, 20);
  try {
    await new Promise(resolve => setTimeout(resolve, 1150));
    assert.equal(closes, 1);
    await assert.rejects(stat(path));
  } finally {
    await stop();
  }
});

test("이미지 없이 파일명만 반환한 구형 응답을 성공으로 받아들이지 않는다", async () => {
  const path = socketPath(randomUUID());
  const server = createServer(socket =>
    socket.once("data", () =>
      socket.end(
        JSON.stringify({
          code: "OBSERVE_IMAGE",
          input: "not-sent",
          interrupted: false,
          imagePath: "screen.jpg",
        }) + "\n",
      ),
    ),
  );
  await new Promise<void>(resolve => server.listen(path, resolve));
  try {
    await assert.rejects(
      sendRequest(path, { kind: "observe", requestId: "old-response" }),
      /Incomplete JSON or image/,
    );
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
test("한글 UTF-8 문자가 여러 소켓 청크로 쪼개져도 정확히 복원된다", async () => {
  const path = socketPath(randomUUID());
  const server = createServer(socket =>
    socket.once("data", () => {
      const bytes = Buffer.from(
        JSON.stringify({
          code: "SESSION_OPEN",
          input: "not-sent",
          interrupted: false,
          message: "한글 화면",
        }) + "\n",
      );
      const split = bytes.indexOf(Buffer.from("한")) + 1;
      socket.write(bytes.subarray(0, split));
      setTimeout(() => socket.end(bytes.subarray(split)), 5);
    }),
  );
  await new Promise<void>(resolve => server.listen(path, resolve));
  try {
    assert.equal(
      (await sendRequest(path, { kind: "status", requestId: "unicode" })).message,
      "한글 화면",
    );
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
