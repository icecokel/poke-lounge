import type { Viewport } from "next";

/**
 * Full-screen game routes (multiplayer game and league). `viewportFit: "cover"` lets the
 * page reach under the notch, home indicator and mobile browser toolbars; the game shells
 * already pad themselves with `env(safe-area-inset-*)`, which is 0 without it. The theme
 * colour matches the game shell so the browser does not tint its toolbar area white.
 */
export const GAME_VIEWPORT: Viewport = {
  colorScheme: "only light",
  themeColor: "#17201a",
  viewportFit: "cover",
};
