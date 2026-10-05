import type { GameBootstrapData } from "./types";
import { RequiredGameAssetError } from "./required-game-asset-error";

const BOOTSTRAP_PATH = "/game-data/bootstrap.json";

export async function loadBootstrapData(fetcher: typeof fetch = fetch): Promise<GameBootstrapData> {
  let response: Response;
  try {
    response = await fetcher(BOOTSTRAP_PATH);
  } catch {
    throw new RequiredGameAssetError(BOOTSTRAP_PATH, "NETWORK");
  }

  if (!response.ok) {
    throw new RequiredGameAssetError(BOOTSTRAP_PATH, "HTTP", response.status);
  }

  try {
    return (await response.json()) as GameBootstrapData;
  } catch {
    throw new RequiredGameAssetError(BOOTSTRAP_PATH, "INVALID_JSON");
  }
}
