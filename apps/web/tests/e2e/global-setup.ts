import type { FullConfig } from "@playwright/test";

const warmupRoutes = ["/ko-KR", "/ko-KR/game/poke-lounge", "/api/auth/session"];

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export default async function globalSetup(config: FullConfig) {
  if (!process.env.PLAYWRIGHT_BASE_URL) {
    return;
  }

  const project = config.projects[0];
  const baseURL =
    typeof project?.use?.baseURL === "string" ? project.use.baseURL.replace(/\/$/, "") : undefined;

  if (!baseURL) {
    return;
  }

  for (const route of warmupRoutes) {
    let lastError: unknown;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        const response = await fetch(`${baseURL}${route}`);
        if (response.ok || response.status === 404) {
          break;
        }
        lastError = new Error(`${route} returned ${response.status}`);
      } catch (error) {
        lastError = error;
      }

      await delay(500 * (attempt + 1));

      if (attempt === 4 && lastError) {
        throw lastError;
      }
    }
  }
}
