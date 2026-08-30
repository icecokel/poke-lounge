import type { GameBootstrapData } from "./types";

const BOOTSTRAP_PATH = "/game-data/bootstrap.json";

export async function loadBootstrapData(fetcher: typeof fetch = fetch): Promise<GameBootstrapData> {
  const response = await fetcher(BOOTSTRAP_PATH);

  if (!response.ok) {
    throw new Error(`Unable to load game bootstrap data: ${response.status}`);
  }

  return response.json() as Promise<GameBootstrapData>;
}
