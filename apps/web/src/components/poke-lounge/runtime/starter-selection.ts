import type { GameBootstrapData, StarterPokemon, UiAssetManifest } from "./types";
import { renderRomAssetBrowser } from "./rom-asset-browser";
import {
  getUiManifestForStarterSurface,
  isRomWebConversionData,
  renderRomWebConversionPanel,
  type RomWebConversionData,
} from "./rom-web-conversion";
import { isDevelopmentRuntime } from "./runtimeEnvironment";
import { findFirstSuitableUiAsset, findItemIconAssets } from "./ui-assets";
import { playPokeLoungeSfx, primePokeLoungeAudio } from "./game/audio/poke-lounge-audio";

export interface StarterSelectionOptions {
  completeAfterSelection?: boolean;
  onStarterSelect?: (starter: StarterPokemon) => void;
}

export function renderStarterSelectionScreen(
  mount: HTMLElement,
  bootstrap: GameBootstrapData,
  conversionDataOrManifest?: RomWebConversionData | UiAssetManifest | null,
  options: StarterSelectionOptions = {},
): void {
  const uiAssetManifest = getUiManifestForStarterSurface(conversionDataOrManifest);
  const shouldRenderRomDiagnostics = conversionDataOrManifest != null;
  let selectedStarterId = bootstrap.starters[0]?.id ?? "";

  const render = () => {
    mount.innerHTML = "";
    const selectedStarter =
      bootstrap.starters.find(starter => starter.id === selectedStarterId) ??
      bootstrap.starters[0] ??
      null;
    const screen = createScreen(
      bootstrap,
      selectedStarter,
      uiAssetManifest,
      shouldRenderRomDiagnostics,
      starter => {
        selectedStarterId = starter.id;
        render();
      },
      starter => {
        options.onStarterSelect?.(starter);
      },
    );

    if (conversionDataOrManifest && isRomWebConversionData(conversionDataOrManifest)) {
      screen.append(renderRomWebConversionPanel(conversionDataOrManifest));
    }

    mount.append(screen);
  };

  render();
}

function createScreen(
  bootstrap: GameBootstrapData,
  selectedStarter: StarterPokemon | null,
  uiAssetManifest: UiAssetManifest | null | undefined,
  shouldRenderRomDiagnostics: boolean,
  onStarterPreviewSelect: (starter: StarterPokemon) => void,
  onStarterConfirm: (starter: StarterPokemon) => void,
): HTMLElement {
  const screen = document.createElement("section");
  screen.className = "game-screen game-screen--starter-modal";
  screen.dataset.screen = "starter-selection";

  const panel = document.createElement("div");
  panel.className = "selection-panel starter-selection-modal";

  const header = document.createElement("header");
  header.className = "selection-header";
  header.append(createTitleBlock(uiAssetManifest));

  const body = document.createElement("div");
  body.className = "selection-body";
  body.append(
    createStarterPreview(selectedStarter, onStarterConfirm),
    createStarterGrid(bootstrap.starters, selectedStarter?.id ?? "", onStarterPreviewSelect),
  );

  panel.append(header, body);
  screen.append(panel);

  if (shouldRenderRomDiagnostics) {
    screen.append(renderRomAssetBrowser(uiAssetManifest));
  }

  applyUiAssetSurface(screen, panel, uiAssetManifest, shouldRenderRomDiagnostics);

  return screen;
}

function createTitleBlock(uiAssetManifest: UiAssetManifest | null | undefined): HTMLElement {
  const block = document.createElement("div");
  block.className = "title-block";

  const kicker = document.createElement("p");
  kicker.className = "kicker";
  kicker.textContent = "Poke Lounge";

  const title = document.createElement("h1");
  title.textContent = "첫 파트너 선택";

  block.append(kicker, title);

  const icons = findItemIconAssets(uiAssetManifest, 6);
  if (icons.length > 0) {
    const iconStrip = document.createElement("div");
    iconStrip.className = "rom-ui-icon-strip";
    iconStrip.setAttribute("aria-label", "ROM item UI assets");
    for (const icon of icons) {
      const image = document.createElement("img");
      image.className = "rom-ui-icon";
      image.src = icon.path;
      image.alt = "";
      image.width = 32;
      image.height = 32;
      iconStrip.append(image);
    }
    block.append(iconStrip);
  }

  return block;
}

function applyUiAssetSurface(
  screen: HTMLElement,
  panel: HTMLElement,
  uiAssetManifest: UiAssetManifest | null | undefined,
  shouldShowMissingAssetStatus: boolean,
): void {
  const uiAsset = findFirstSuitableUiAsset(uiAssetManifest);

  if (uiAsset) {
    screen.dataset.uiAssets = "loaded";
    panel.dataset.uiAssetPath = uiAsset.path;
    panel.style.setProperty("--rom-ui-panel-image", `url("${uiAsset.path}")`);
    panel.classList.add("selection-panel--rom-ui");
    return;
  }

  if (findItemIconAssets(uiAssetManifest, 1).length > 0) {
    screen.dataset.uiAssets = "loaded";
    return;
  }

  if (uiAssetManifest && uiAssetManifest.assets.length > 0) {
    screen.dataset.uiAssets = "loaded";
    return;
  }

  screen.dataset.uiAssets = "not-loaded";

  if (isDevelopmentRuntime() && shouldShowMissingAssetStatus) {
    const status = document.createElement("p");
    status.className = "dev-ui-asset-status";
    status.setAttribute("role", "status");
    status.textContent = "ROM UI assets are not loaded";
    screen.append(status);
  }
}

function createStarterPreview(
  starter: StarterPokemon | null,
  onStarterConfirm: (starter: StarterPokemon) => void,
): HTMLElement {
  const preview = document.createElement("section");
  preview.className = "starter-modal-preview";
  preview.dataset.starterPreview = "";
  preview.setAttribute("aria-label", "Selected starter preview");

  if (!starter) {
    preview.textContent = "선택 가능한 스타터가 없습니다.";
    return preview;
  }

  preview.dataset.selectedStarter = starter.id;

  const stage = document.createElement("div");
  stage.className = "starter-preview-stage";

  const sprite = createStarterSprite(starter, "starter-preview-sprite");
  stage.append(sprite);

  const meta = document.createElement("div");
  meta.className = "starter-preview-meta";

  const name = document.createElement("strong");
  name.className = "starter-preview-name";
  name.textContent = starter.displayName;

  const type = document.createElement("span");
  type.className = `starter-type starter-type--${starter.type.toLowerCase()}`;
  type.textContent = starter.type;

  const confirm = document.createElement("button");
  confirm.className = "starter-confirm-button";
  confirm.type = "button";
  confirm.dataset.starterConfirm = "";
  confirm.textContent = "이 포켓몬으로 시작";
  confirm.addEventListener("click", () => {
    void primePokeLoungeAudio();
    playPokeLoungeSfx("button-confirm");
    onStarterConfirm(starter);
  });

  meta.append(name, type, confirm);
  preview.append(stage, meta);

  return preview;
}

function createStarterGrid(
  starters: StarterPokemon[],
  selectedStarterId: string,
  onStarterPreviewSelect: (starter: StarterPokemon) => void,
): HTMLElement {
  const grid = document.createElement("div");
  grid.className = "starter-grid";
  grid.setAttribute("aria-label", "Starter Pokemon options");

  for (const starter of starters) {
    const card = document.createElement("button");
    card.className = `starter-card starter-card--${starter.type.toLowerCase()}`;
    card.type = "button";
    card.dataset.starterCard = starter.id;
    card.setAttribute("aria-pressed", starter.id === selectedStarterId ? "true" : "false");
    card.addEventListener("click", () => {
      void primePokeLoungeAudio();
      playPokeLoungeSfx("button-confirm", { volume: 0.4 });
      onStarterPreviewSelect(starter);
    });

    if (starter.id === selectedStarterId) {
      card.classList.add("is-selected");
    }

    const sprite = createStarterSprite(starter, "starter-sprite");

    const assetStatus = document.createElement("span");
    assetStatus.className = "starter-asset-status";
    assetStatus.hidden = true;
    assetStatus.setAttribute("role", "status");

    const probe = document.createElement("img");
    probe.className = "starter-asset-probe";
    probe.alt = "";
    probe.setAttribute("aria-hidden", "true");
    probe.addEventListener("error", () => {
      card.classList.add("is-missing-asset");
      sprite.hidden = true;
      assetStatus.hidden = false;
      assetStatus.textContent = `ROM asset missing: ${starter.assetPath}`;
    });
    probe.src = starter.assetPath;

    const name = document.createElement("span");
    name.className = "starter-name";
    name.textContent = starter.displayName;

    const type = document.createElement("span");
    type.className = "starter-type";
    type.textContent = starter.type;

    card.append(sprite, probe, assetStatus, name, type);
    grid.append(card);
  }

  return grid;
}

function createStarterSprite(starter: StarterPokemon, className: string): HTMLElement {
  const sprite = document.createElement("span");
  sprite.className = className;
  sprite.dataset.assetPath = starter.assetPath;
  sprite.style.backgroundImage = `url("${starter.assetPath}")`;
  sprite.setAttribute("role", "img");
  sprite.setAttribute("aria-label", starter.displayName);

  return sprite;
}
