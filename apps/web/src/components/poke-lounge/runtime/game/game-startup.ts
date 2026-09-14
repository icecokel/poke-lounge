export type InitialGameScene = "world" | "battle";

/** All sessions enter through the normal world and starter flow. */
export function readInitialGameScene(): InitialGameScene {
  return "world";
}
