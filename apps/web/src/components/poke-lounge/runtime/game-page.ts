import { startGamePage, type GamePageHandle } from "./game/gamePageStartup";
import type { PokeLoungeGameResult } from "./game/createPokeLoungeGame";
import type { GameViewportDisplaySize } from "./game/gameViewport";
import type { PokeLoungeRuntimeState } from "./game/game-page-state";
import type { PokeLoungeRoomLeaveRequestDetail } from "./game/ui/poke-lounge-ui-events";

export async function startGamePageFromDocument(
  documentRef: Document = document,
  location: URL = new URL(window.location.href),
  options: {
    accountId?: string;
    idToken?: string;
    localTestModeActive?: boolean;
    getIdToken?: () => string | undefined;
    onGameResult?: (result: PokeLoungeGameResult) => void;
    onRoomLeaveRequest?: (request: PokeLoungeRoomLeaveRequestDetail) => void;
    onRuntimeStateChange?: (state: PokeLoungeRuntimeState) => void;
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
    onRoomLeaveRequest: options.onRoomLeaveRequest,
    onRuntimeStateChange: options.onRuntimeStateChange,
    viewportSize: options.viewportSize,
  });
}
