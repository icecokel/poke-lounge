import { expect, Page } from "@playwright/test";

export const gotoWithRetry = async (page: Page, routePath: string, attempts = 4, strict = true) => {
  let latest: Awaited<ReturnType<Page["goto"]>> | null = null;
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      latest = await page.goto(routePath);
      if ((latest?.status() ?? 500) < 400) break;
    } catch (error) {
      lastError = error;
    }

    await page.waitForLoadState("domcontentloaded").catch(() => {});
    await page.waitForTimeout(250 * (attempt + 1));
  }

  if (strict) {
    if (lastError && !latest) throw lastError;
    expect(latest?.status(), `${routePath} 응답 상태가 비정상입니다.`).toBeLessThan(400);
  }

  return latest;
};
