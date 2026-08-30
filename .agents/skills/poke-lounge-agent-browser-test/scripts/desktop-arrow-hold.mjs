#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { once } from "node:events";
import { setTimeout as wait } from "node:timers/promises";
import { pathToFileURL } from "node:url";

const HOLD_MS = 50;
const KEY_CODES = {
  ArrowDown: 40,
  ArrowLeft: 37,
  ArrowRight: 39,
  ArrowUp: 38,
};

export function createArrowEvent(eventType, key) {
  const keyCode = KEY_CODES[key];

  if (!keyCode) {
    throw new Error(`Unsupported arrow key: ${key}`);
  }

  return {
    type: "input_keyboard",
    eventType,
    key,
    code: key,
    windowsVirtualKeyCode: keyCode,
    nativeVirtualKeyCode: keyCode,
  };
}

function getStreamPort(sessionName) {
  const result = JSON.parse(
    execFileSync("agent-browser", ["--session", sessionName, "stream", "status", "--json"], {
      encoding: "utf8",
    }),
  );
  const port = result.data?.port;

  if (!result.success || !Number.isInteger(port)) {
    throw new Error("The agent-browser stream is unavailable");
  }

  return port;
}

async function holdArrow(sessionName, key) {
  const socket = new WebSocket(`ws://127.0.0.1:${getStreamPort(sessionName)}`);

  await once(socket, "open", { signal: AbortSignal.timeout(2_000) });

  try {
    socket.send(JSON.stringify(createArrowEvent("keyDown", key)));
    await wait(HOLD_MS);
  } finally {
    if (socket.readyState !== WebSocket.OPEN) {
      throw new Error("The agent-browser stream closed before key release");
    }

    socket.send(JSON.stringify(createArrowEvent("keyUp", key)));
  }

  await wait(20);
  socket.close();
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [sessionName, key] = process.argv.slice(2);

  if (!sessionName || !key) {
    throw new Error("Usage: desktop-arrow-hold.mjs <session-name> <ArrowDirection>");
  }

  await holdArrow(sessionName, key);
  process.stdout.write(JSON.stringify({ key, holdMs: HOLD_MS, released: true }) + "\n");
}
