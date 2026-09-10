import { fork } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { appendFile, mkdir, readFile, writeFile, open } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { setTimeout as wait } from "node:timers/promises";
import { openDriver } from "./driver";
import { PlayerSession } from "./session";
import { socketPath, sendRequest, serveSession } from "./ipc";
import { sanitize, validateLocalUrl, validateSession, type Frame } from "./protocol";

const file = fileURLToPath(import.meta.url);
const root = fileURLToPath(new URL("../../../../output/player-browser/", import.meta.url));
async function main() {
  const [command, name, ...args] = process.argv.slice(2);
  if (command === "help" || !command) {
    console.log(
      'open NAME http://127.0.0.1:PORT/ko-KR/game/poke-lounge [chromium|webkit] [--headed]\nobserve NAME\nact NAME \'{"requestId":"unique-id","seen":{"frameId":"...","sha256":"...","observation":"what you saw"},"input":{"kind":"tap","target":{"role":"button","name":"싸운다"}}}\'\nstatus NAME\nimage NAME FRAME_ID\nclose NAME\nResponses contain frame.image.data (JPEG base64). Render it before declaring seen; a path/text is not visual confirmation.',
    );
    return;
  }
  validateSession(name);
  const directory = join(root, name);
  const socket = socketPath(directory);
  if (command === "serve") {
    const driver = await openDriver(
      args[0],
      directory,
      args[1] === "webkit" ? "webkit" : "chromium",
      args.includes("--headed"),
    );
    const audit = async (event: Record<string, unknown>) => {
      await appendFile(join(directory, "audit.jsonl"), JSON.stringify(event) + "\n", {
        mode: 0o600,
      });
    };
    const session = new PlayerSession(driver, audit);
    let stop: () => Promise<void>;
    try {
      stop = await serveSession(socket, session, audit);
    } catch (error) {
      await driver.close();
      throw error;
    }
    process.once("SIGTERM", () => {
      void stop().finally(() => process.exit(0));
    });
    process.once("SIGINT", () => {
      void stop().finally(() => process.exit(0));
    });
    await writeFile(join(directory, "ready.json"), JSON.stringify({ pid: process.pid, socket }), {
      mode: 0o600,
    });
    return;
  }
  if (command === "open") {
    const url = validateLocalUrl(args[0]);
    const engine = args[1] ?? "chromium";
    if (!["chromium", "webkit"].includes(engine) || args.slice(2).some(arg => arg !== "--headed"))
      throw Error("Unsupported browser option");
    await mkdir(root, { recursive: true, mode: 0o700 });
    await mkdir(directory, { mode: 0o700 }); // No silent reuse of an old session / old action receipts.
    const log = await open(join(directory, "driver.log"), "wx", 0o600);
    const child = fork(file, ["serve", name, url, engine, ...args.slice(2)], {
      detached: true,
      stdio: ["ignore", log.fd, log.fd, "ipc"],
    });
    child.unref();
    child.disconnect();
    await log.close();
    let ready = false;
    for (let i = 0; i < 160; i++) {
      try {
        await readFile(join(directory, "ready.json"));
        ready = true;
        break;
      } catch {}
      await wait(200);
    }
    if (!ready) {
      child.kill("SIGTERM");
      throw Error("Browser startup failed; inspect the session driver.log");
    }
  }
  if (command === "image") {
    if (!/^[0-9a-f-]{36}$/.test(args[0] ?? "")) throw Error("Invalid frame ID");
    const frame = JSON.parse(await readFile(join(directory, "latest-frame.json"), "utf8")) as Omit<
      Frame,
      "image"
    >;
    if (frame.id !== args[0]) throw Error("Not the latest frame; use observe");
    const bytes = await readFile(frame.imagePath);
    if (createHash("sha256").update(bytes).digest("hex") !== frame.sha256)
      throw Error("Image integrity failure");
    console.log(
      JSON.stringify({
        ...frame,
        image: { type: "image", mimeType: "image/jpeg", data: bytes.toString("base64") },
      }),
    );
    return;
  }
  if (!["open", "observe", "act", "status", "close"].includes(command))
    throw Error("Unsupported command");
  const request =
    command === "act"
      ? { ...JSON.parse(args.join(" ")), kind: "act" }
      : { kind: command === "open" ? "observe" : command, requestId: randomUUID() };
  const reply = await sendRequest(socket, request);
  if (reply.frame) {
    const { image, ...metadata } = reply.frame;
    void image;
    await writeFile(join(directory, "latest-frame.json"), JSON.stringify(metadata, null, 2), {
      mode: 0o600,
    });
  }
  await writeFile(join(directory, "last-reply.json"), JSON.stringify(reply), { mode: 0o600 });
  console.log(JSON.stringify(reply));
  if (!["OBSERVE_IMAGE", "SESSION_OPEN", "SESSION_CLOSED"].includes(reply.code))
    process.exitCode = 2;
}
main().catch(error => {
  console.log(
    JSON.stringify({
      code: "DRIVER_ERROR",
      input: "uncertain",
      interrupted: true,
      message: sanitize(String(error)).slice(0, 1000),
    }),
  );
  process.exitCode = 1;
});
