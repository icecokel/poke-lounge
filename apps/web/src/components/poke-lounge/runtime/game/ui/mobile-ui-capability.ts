export function usesPokeLoungeMobileShell(documentRef: Document): boolean {
  return documentRef.querySelector("[data-poke-lounge-mobile-shell='true']") !== null;
}

export function hasPokeLoungeMobileFullscreenScene(documentRef: Document): boolean {
  return documentRef.querySelector("[data-poke-lounge-mobile-fullscreen-scene='true']") !== null;
}
