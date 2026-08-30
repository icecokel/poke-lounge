export const GAME_SETTINGS_OPEN_EVENT = "poke-lounge-settings-open";

const cleanupByMount = new WeakMap<HTMLElement, AbortController>();

export function renderMobileSettingsToggle(mount: HTMLElement): HTMLButtonElement {
  cleanupByMount.get(mount)?.abort();
  mount.querySelector("[data-poke-lounge-mobile-settings-toggle='true']")?.remove();

  const controller = new AbortController();
  cleanupByMount.set(mount, controller);

  const button = document.createElement("button");
  button.type = "button";
  button.className = "mobile-settings-button mobile-settings-button--mobile";
  button.textContent = "⚙";
  button.setAttribute("aria-label", "설정 열기");
  button.setAttribute("aria-haspopup", "dialog");
  button.setAttribute("data-poke-lounge-mobile-settings-toggle", "true");

  button.addEventListener(
    "click",
    () => {
      mount.ownerDocument.dispatchEvent(new Event(GAME_SETTINGS_OPEN_EVENT));
    },
    { signal: controller.signal },
  );

  mount.appendChild(button);

  return button;
}
