export class RuntimeKeyboard {
  private readonly held = new Set<string>();
  private readonly pressed = new Set<string>();

  constructor(private readonly target: HTMLElement) {
    // Key-up must survive a button unmounting, a focus change, or a modal's stopPropagation.
    target.ownerDocument.addEventListener("keydown", this.handleKeyDown);
    target.ownerDocument.addEventListener("keyup", this.handleKeyUp, true);
    target.ownerDocument.defaultView?.addEventListener("blur", this.reset);
  }

  isDown(...codes: string[]): boolean {
    return codes.some(
      function testItem(this: RuntimeKeyboard, code: string): boolean {
        return this.held.has(code);
      }.bind(this),
    );
  }

  consume(...codes: string[]): boolean {
    const code = codes.find(
      function findItem(this: RuntimeKeyboard, candidate: string): boolean {
        return this.pressed.has(candidate);
      }.bind(this),
    );
    if (!code) return false;
    this.pressed.delete(code);
    return true;
  }

  clearPresses(): void {
    this.pressed.clear();
  }

  destroy(): void {
    this.target.ownerDocument.removeEventListener("keydown", this.handleKeyDown);
    this.target.ownerDocument.removeEventListener("keyup", this.handleKeyUp, true);
    this.target.ownerDocument.defaultView?.removeEventListener("blur", this.reset);
    this.reset();
  }

  private readonly handleKeyDown = (event: KeyboardEvent) => {
    const document = this.target.ownerDocument;
    const element = event.target instanceof Element ? event.target : null;
    if (
      !element ||
      event.defaultPrevented ||
      event.isComposing ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      !isGameControlKey(event.code) ||
      !this.target.isConnected
    )
      return;
    if (
      element.closest(
        'input, textarea, select, [contenteditable="true"], [role="dialog"], [role="alertdialog"]',
      ) ||
      document.querySelector(
        '[role="dialog"], [role="alertdialog"], [data-poke-lounge-mobile-task]',
      )
    )
      return;
    const inside = this.target.contains(element);
    // React removes the currently focused command at phase changes. Resume from body without a mouse click.
    const lostFocus =
      element === document.body &&
      Boolean(
        this.target.querySelector("[data-poke-lounge-battle-screen], [data-poke-lounge-world-ui]"),
      );
    if (!inside && !lostFocus) return;
    // Native buttons/links keep Enter/Space and Tab semantics; never confirm a second game action.
    if (
      element.closest('button, a[href], [role="button"]') &&
      ["Enter", "Space"].includes(event.code)
    )
      return;
    if (lostFocus || element !== this.target) this.target.focus({ preventScroll: true });
    if (!this.held.has(event.code) && !event.repeat) this.pressed.add(event.code);
    this.held.add(event.code);
    event.preventDefault();
  };

  private readonly handleKeyUp = (event: KeyboardEvent) => {
    this.held.delete(event.code);
  };

  private readonly reset = () => {
    this.held.clear();
    this.pressed.clear();
  };
}

function isGameControlKey(code: string): boolean {
  return (
    code.startsWith("Arrow") ||
    [
      "Backspace",
      "Enter",
      "Escape",
      "KeyA",
      "KeyD",
      "KeyH",
      "KeyI",
      "KeyS",
      "KeyW",
      "KeyZ",
      "KeyX",
      "Space",
    ].includes(code)
  );
}
