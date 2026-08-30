const battleSceneMarker = "battle";

export function setBattleSceneMarker(gameRoot: HTMLElement, active: boolean): void {
  const gamePage = gameRoot.closest<HTMLElement>("[data-testid='poke-lounge-page']");

  if (active) {
    gameRoot.dataset.pokeLoungeActiveScene = battleSceneMarker;
    if (gamePage) {
      gamePage.dataset.pokeLoungeActiveScene = battleSceneMarker;
    }
    return;
  }

  if (gameRoot.dataset.pokeLoungeActiveScene === battleSceneMarker) {
    delete gameRoot.dataset.pokeLoungeActiveScene;
  }
  if (gamePage?.dataset.pokeLoungeActiveScene === battleSceneMarker) {
    delete gamePage.dataset.pokeLoungeActiveScene;
  }
}
