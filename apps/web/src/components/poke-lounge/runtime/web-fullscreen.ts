const FALLBACK_CLASS = "is-game-fullscreen-fallback";
const BODY_FALLBACK_CLASS = "is-game-fullscreen-fallback-active";
export const GAME_FULLSCREEN_STATE_EVENT = "poke-lounge-fullscreen-state-change";

export async function toggleGameFullscreen(target: HTMLElement): Promise<void> {
  const doc = target.ownerDocument;

  if (doc.fullscreenElement) {
    if (doc.exitFullscreen) {
      await doc.exitFullscreen();
    }
    disableFullscreenFallback(target);
    return;
  }

  if (target.classList.contains(FALLBACK_CLASS)) {
    disableFullscreenFallback(target);
    return;
  }

  if (!target.requestFullscreen) {
    enableFullscreenFallback(target);
    return;
  }

  try {
    await target.requestFullscreen({ navigationUI: "hide" });
    disableFullscreenFallback(target);
  } catch {
    enableFullscreenFallback(target);
  }
}

export function isGameFullscreenActive(target: HTMLElement): boolean {
  return (
    target.ownerDocument.fullscreenElement === target || target.classList.contains(FALLBACK_CLASS)
  );
}

function enableFullscreenFallback(target: HTMLElement): void {
  target.classList.add(FALLBACK_CLASS);
  target.ownerDocument.body.classList.add(BODY_FALLBACK_CLASS);
  dispatchFullscreenStateChange(target);
}

function disableFullscreenFallback(target: HTMLElement): void {
  target.classList.remove(FALLBACK_CLASS);
  target.ownerDocument.body.classList.remove(BODY_FALLBACK_CLASS);
  dispatchFullscreenStateChange(target);
}

function dispatchFullscreenStateChange(target: HTMLElement): void {
  target.ownerDocument.dispatchEvent(new Event(GAME_FULLSCREEN_STATE_EVENT));
}
