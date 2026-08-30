export type VirtualGamepadButton =
  "up" | "down" | "left" | "right" | "confirm" | "back" | "bag" | "help";

const pressedButtons = new Set<VirtualGamepadButton>();
const pendingPresses = new Set<VirtualGamepadButton>();

export function pressVirtualGamepadButton(button: VirtualGamepadButton): void {
  if (!pressedButtons.has(button)) {
    pendingPresses.add(button);
  }

  pressedButtons.add(button);
}

export function releaseVirtualGamepadButton(button: VirtualGamepadButton): void {
  pressedButtons.delete(button);
}

export function setVirtualGamepadButtonHeld(button: VirtualGamepadButton, isHeld: boolean): void {
  pendingPresses.delete(button);

  if (isHeld) {
    pressedButtons.add(button);
    return;
  }

  pressedButtons.delete(button);
}

export function isVirtualGamepadPressed(button: VirtualGamepadButton): boolean {
  return pressedButtons.has(button);
}

export function consumeVirtualGamepadPress(button: VirtualGamepadButton): boolean {
  if (!pendingPresses.has(button)) {
    return false;
  }

  pendingPresses.delete(button);
  return true;
}

export function resetVirtualGamepad(): void {
  pressedButtons.clear();
  pendingPresses.clear();
}
