import { createConnection, createServer, type Socket } from "node:net";
import { chmod, unlink } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ProtocolError, type Reply } from "./protocol";
import type { Audit, PlayerSession } from "./session";

export function socketPath(directory: string): string {
  return join(
    tmpdir(),
    `poke-player-${createHash("sha256").update(directory).digest("hex").slice(0, 12)}.sock`,
  );
}
function end(socket: Socket, reply: Reply) {
  socket.end(JSON.stringify(reply) + "\n");
}
export async function serveSession(
  path: string,
  session: PlayerSession,
  audit: Audit,
): Promise<() => Promise<void>> {
  let closing = false;
  const clients = new Set<Socket>();
  const server = createServer(socket => {
    clients.add(socket);
    socket.setEncoding("utf8");
    socket.setTimeout(10_000, () => socket.destroy());
    socket.on("error", () => {});
    socket.on("close", () => clients.delete(socket));
    let input = "";
    let dispatched = false;
    socket.on("data", chunk => {
      if (dispatched) return;
      input += chunk.toString("utf8");
      if (Buffer.byteLength(input) > 8192) {
        dispatched = true;
        end(socket, { code: "REQUEST_TOO_LARGE", input: "not-sent", interrupted: true });
        return;
      }
      if (!input.includes("\n")) return;
      dispatched = true;
      void (async () => {
        let request: unknown;
        try {
          request = JSON.parse(input.trim());
        } catch {
          end(socket, { code: "INVALID_JSON", input: "not-sent", interrupted: true });
          return;
        }
        const result = await session.handle(request);
        // This is successful byte transmission, NOT proof the operator viewed the image.
        socket.end(JSON.stringify(result) + "\n", () => {
          void audit({
            event: "RESPONSE_WRITTEN",
            at: Date.now(),
            code: result.code,
            frameId: result.frame?.id ?? null,
          }).catch(() => {});
          if (result.code === "SESSION_CLOSED") void stop();
        });
      })().catch(() =>
        end(socket, { code: "TRANSPORT_FAILED", input: "uncertain", interrupted: true }),
      );
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(path, resolve);
  });
  await chmod(path, 0o600);
  // Audit observation gaps without expiring the session or closing its browser.
  const auditTimer = setInterval(() => {
    void session.noteIdle().catch(() => {});
  }, 1000);
  async function stop() {
    if (closing) return;
    closing = true;
    clearInterval(auditTimer);
    try {
      await session.shutdown();
    } finally {
      for (const socket of clients) socket.destroy();
      await new Promise<void>(resolve => server.close(() => resolve()));
      await unlink(path).catch(() => {});
    }
  }
  return stop;
}
export function sendRequest(path: string, request: unknown): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const socket = createConnection(path);
    socket.setEncoding("utf8");
    let output = "";
    let done = false;
    const fail = (error: Error) => {
      if (!done) {
        done = true;
        socket.destroy();
        reject(error);
      }
    };
    socket.setTimeout(12_000, () =>
      fail(new ProtocolError("TRANSPORT_TIMEOUT", "Outcome unknown: observe; do not replay input")),
    );
    socket.on("error", error => fail(error));
    socket.on("connect", () => socket.write(JSON.stringify(request) + "\n"));
    socket.on("data", chunk => {
      output += chunk.toString("utf8");
      if (Buffer.byteLength(output) > 600_000) {
        fail(new ProtocolError("TRUNCATED_RESPONSE", "Response exceeds image delivery limit"));
        return;
      }
      if (!output.includes("\n")) return;
      try {
        const parsed = JSON.parse(output.trim()) as Reply;
        if (
          typeof parsed.code !== "string" ||
          !["not-sent", "sent", "uncertain"].includes(parsed.input)
        )
          throw Error("Invalid response");
        if (parsed.code === "OBSERVE_IMAGE" && !parsed.frame) throw Error("Image payload missing");
        if (parsed.frame) {
          if (parsed.frame.image.type !== "image" || parsed.frame.image.mimeType !== "image/jpeg")
            throw Error("Invalid image type");
          const bytes = Buffer.from(parsed.frame.image.data, "base64");
          if (
            !bytes.length ||
            bytes.toString("base64") !== parsed.frame.image.data ||
            createHash("sha256").update(bytes).digest("hex") !== parsed.frame.sha256
          )
            throw Error("Image integrity check failed");
        }
        done = true;
        socket.end();
        resolve(parsed);
      } catch {
        fail(
          new ProtocolError("INVALID_RESPONSE", "Incomplete JSON or image bytes; no usable screen"),
        );
      }
    });
    socket.on("end", () => {
      if (!done)
        fail(
          new ProtocolError(
            "TRUNCATED_RESPONSE",
            "Connection ended before the full screen arrived",
          ),
        );
    });
  });
}
