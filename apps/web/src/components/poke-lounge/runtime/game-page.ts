import { startGamePage, type GamePageHandle } from "./game/gamePageStartup";
import type { PokeLoungeGameResult } from "./game/createPokeLoungeGame";
import type { GameViewportDisplaySize } from "./game/gameViewport";

export async function startGamePageFromDocument(
  documentRef: Document = document,
  location: URL = new URL(window.location.href),
  options: {
    accountId?: string;
    idToken?: string;
    localTestModeActive?: boolean;
    getIdToken?: () => string | undefined;
    onGameResult?: (result: PokeLoungeGameResult) => void;
    renderMobileControls?: boolean;
    viewportSize?: GameViewportDisplaySize;
  } = {},
): Promise<GamePageHandle> {
  const mount = documentRef.querySelector<HTMLElement>("#game-root");

  if (!mount) {
    throw new Error("Missing #game-root mount element");
  }

  return startGamePage(mount, location, {
    accountId: options.accountId,
    idToken: options.idToken,
    localTestModeActive: options.localTestModeActive,
    getIdToken: options.getIdToken,
    onGameResult: options.onGameResult,
    renderMobileControls: options.renderMobileControls,
    viewportSize: options.viewportSize,
  });
}
