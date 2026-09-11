import { chromium, devices, webkit, type Page } from "@playwright/test";
import { createHash, randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as wait } from "node:timers/promises";
import {
  ProtocolError,
  sanitize,
  validateLocalUrl,
  type Frame,
  type Input,
  type Target,
} from "./protocol";
import type { Driver } from "./session";

export function sanitizeSnapshot(snapshot: string): string {
  // A textbox may contain a password even when its HTML type is text.
  let fieldIndent = -1;
  const lines: string[] = [];
  for (const line of snapshot.split("\n")) {
    const indent = line.length - line.trimStart().length;
    if (fieldIndent >= 0 && indent > fieldIndent) continue;
    fieldIndent = -1;
    if (/^\s*- textbox\b/.test(line)) {
      fieldIndent = indent;
      lines.push(sanitize(line.replace(/(:\s*).+$/, "$1[redacted]")));
    } else lines.push(sanitize(line));
  }
  return lines.join("\n");
}
export function locator(page: Page, target: Target) {
  const parent = target.within
    ? page.getByRole(target.within.role, { name: target.within.name, exact: true })
    : page;
  return parent.getByRole(target.role, { name: target.name, exact: true });
}
export async function performInput(page: Page, input: Input): Promise<void> {
  const timeout = 2500;
  switch (input.kind) {
    case "click":
      await locator(page, input.target).click({ timeout });
      break;
    case "tap":
      await locator(page, input.target).tap({ timeout });
      break;
    case "fill":
      await locator(page, input.target).fill(input.text, { timeout });
      break;
    case "press":
      await page.keyboard.press(input.key);
      break;
    case "hold": {
      try {
        await page.keyboard.down(input.key);
        await wait(input.ms);
      } finally {
        await page.keyboard.up(input.key);
      }
      break;
    }
    case "drag": {
      const viewport = page.viewportSize();
      if (
        !viewport ||
        [...input.from, ...input.to].some((n, i) => n >= (i % 2 ? viewport.height : viewport.width))
      ) {
        throw new ProtocolError(
          "INPUT_OUTSIDE_VIEWPORT",
          "Pointer must stay in the visible viewport",
        );
      }
      await page.mouse.move(...input.from);
      try {
        await page.mouse.down();
        await page.mouse.move(...input.to, { steps: 4 });
        await wait(input.ms);
      } finally {
        await page.mouse.up();
      }
      break;
    }
    case "scroll":
      await page.mouse.wheel(input.dx, input.dy);
      break;
  }
}
export async function capturePage(page: Page, directory: string): Promise<Frame> {
  const capturedAt = Date.now();
  const timers = (await page.getByRole("timer").allTextContents()).map(sanitize);
  const text = sanitizeSnapshot(await page.locator("body").ariaSnapshot({ timeout: 2500 }));
  if (text.length > 32_000)
    throw new ProtocolError(
      "SCREEN_TEXT_TOO_LARGE",
      "Capture the screen again; metadata was not truncated",
    );
  const bytes = await page.screenshot({
    type: "jpeg",
    quality: 55,
    scale: "css",
    timeout: 5000,
    // Masks are screenshot-only. Do not mutate the game DOM, animation or time.
    mask: [
      page.locator('input:not([type="radio"]):not([type="checkbox"]), textarea'),
      page.getByText(/^[A-Z0-9]{5,8}$/),
    ],
  });
  if (bytes.length > 350_000)
    throw new ProtocolError(
      "SCREEN_IMAGE_TOO_LARGE",
      "Image delivery budget exceeded; no filename-only success",
    );
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes.at(-2) !== 0xff || bytes.at(-1) !== 0xd9) {
    throw new ProtocolError("INVALID_SCREEN_IMAGE", "Screenshot is not a complete JPEG");
  }
  const id = randomUUID();
  const imagePath = join(directory, id + ".jpg");
  await writeFile(imagePath, bytes, { flag: "wx", mode: 0o600 });
  await writeFile(join(directory, id + ".txt"), text, { flag: "wx", mode: 0o600 });
  return {
    id,
    capturedAt,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    imagePath,
    text,
    timers,
    image: { type: "image", mimeType: "image/jpeg", data: bytes.toString("base64") },
  };
}
export async function openDriver(
  url: string,
  directory: string,
  engine: "chromium" | "webkit",
  headed: boolean,
): Promise<Driver> {
  validateLocalUrl(url);
  const browser = await { chromium, webkit }[engine].launch({ headless: !headed });
  try {
    const context = await browser.newContext({ ...devices["iPhone 12"] });
    const page = await context.newPage();
    // Do not swallow blocking dialogs; the operator must see them as a capture/input failure.
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20_000 });
    return {
      capture: () => {
        validateLocalUrl(page.url());
        return capturePage(page, directory);
      },
      perform: input => {
        validateLocalUrl(page.url());
        return performInput(page, input);
      },
      close: () => browser.close(),
    };
  } catch (error) {
    await browser.close();
    throw error;
  }
}
