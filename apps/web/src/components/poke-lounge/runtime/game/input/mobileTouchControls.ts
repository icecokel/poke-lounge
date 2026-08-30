import {
  pressVirtualGamepadButton,
  releaseVirtualGamepadButton,
  resetVirtualGamepad,
  type VirtualGamepadButton,
} from "./virtualGamepad";
import { primePokeLoungeAudio } from "../audio/poke-lounge-audio";

const CONTROL_BUTTONS: ReadonlyArray<{
  button: VirtualGamepadButton;
  label: string;
  ariaLabel: string;
  group: "dpad" | "actions";
}> = [
  { button: "up", label: "▲", ariaLabel: "위", group: "dpad" },
  { button: "left", label: "◀", ariaLabel: "왼쪽", group: "dpad" },
  { button: "right", label: "▶", ariaLabel: "오른쪽", group: "dpad" },
  { button: "down", label: "▼", ariaLabel: "아래", group: "dpad" },
  { button: "confirm", label: "A", ariaLabel: "결정", group: "actions" },
  { button: "back", label: "B", ariaLabel: "뒤로", group: "actions" },
  { button: "bag", label: "I", ariaLabel: "가방", group: "actions" },
  { button: "help", label: "?", ariaLabel: "도움말", group: "actions" },
];

export interface TouchGameDeviceEnvironment {
  maxTouchPoints: number;
  coarsePointer: boolean;
  platform: string;
  userAgent: string;
}

export interface MobileTouchControlsOptions {
  touchDeviceEnvironment?: TouchGameDeviceEnvironment;
}

export function detectTouchGameDevice(environment: TouchGameDeviceEnvironment): boolean {
  const userAgent = environment.userAgent;
  const platform = environment.platform;
  const isAppleMobilePlatform =
    /\b(iPad|iPhone|iPod)\b/i.test(userAgent) ||
    /\b(iPad|iPhone|iPod)\b/i.test(platform) ||
    (platform === "MacIntel" && /Mobile\//i.test(userAgent));
  const isMobilePlatform =
    isAppleMobilePlatform ||
    /Android|Windows Phone|webOS|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);

  return isMobilePlatform && (environment.maxTouchPoints > 0 || environment.coarsePointer);
}

export function renderMobileTouchControls(
  mount: HTMLElement,
  options: MobileTouchControlsOptions = {},
): HTMLElement {
  resetVirtualGamepad();
  mount.classList.toggle(
    "has-touch-game-device",
    detectTouchGameDevice(options.touchDeviceEnvironment ?? readTouchGameDeviceEnvironment()),
  );

  const existingControls = mount.querySelector("[data-mobile-touch-controls]");
  existingControls?.remove();

  const controls = document.createElement("div");
  controls.className = "mobile-touch-controls";
  controls.setAttribute("data-mobile-touch-controls", "true");
  controls.setAttribute("aria-hidden", "false");

  const dpad = document.createElement("div");
  dpad.className = "mobile-touch-controls__dpad";
  dpad.setAttribute("aria-label", "이동");

  const actions = document.createElement("div");
  actions.className = "mobile-touch-controls__actions";
  actions.setAttribute("aria-label", "동작");

  CONTROL_BUTTONS.forEach(control => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = [
      "mobile-touch-controls__button",
      `mobile-touch-controls__button--${control.button}`,
    ].join(" ");
    button.textContent = control.label;
    button.setAttribute("aria-label", control.ariaLabel);
    button.setAttribute("data-mobile-control", control.button);
    const setPressed = (pressed: boolean) => {
      button.classList.toggle("is-pressed", pressed);

      if (pressed) {
        button.setAttribute("data-pressed", "true");
        return;
      }

      button.removeAttribute("data-pressed");
    };
    const releaseButton = (event?: PointerEvent) => {
      if (event) {
        event.preventDefault();
        try {
          button.releasePointerCapture?.(event.pointerId);
        } catch {
          // Synthetic pointer events in tests may not be capturable.
        }
      }

      setPressed(false);
      releaseVirtualGamepadButton(control.button);
    };

    button.addEventListener("pointerdown", event => {
      event.preventDefault();
      try {
        button.setPointerCapture?.(event.pointerId);
      } catch {
        // Synthetic pointer events in tests may not be capturable.
      }
      void primePokeLoungeAudio();
      setPressed(true);
      pressVirtualGamepadButton(control.button);
    });
    button.addEventListener("pointerup", event => {
      releaseButton(event);
    });
    button.addEventListener("pointercancel", event => {
      releaseButton(event);
    });
    button.addEventListener("pointerleave", () => {
      releaseButton();
    });

    if (control.group === "dpad") {
      dpad.appendChild(button);
    } else {
      actions.appendChild(button);
    }
  });

  controls.append(dpad, actions);
  mount.appendChild(controls);

  return controls;
}

function readTouchGameDeviceEnvironment(): TouchGameDeviceEnvironment {
  return {
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
    coarsePointer: window.matchMedia?.("(pointer: coarse)").matches ?? false,
    platform: navigator.platform ?? "",
    userAgent: navigator.userAgent ?? "",
  };
}
