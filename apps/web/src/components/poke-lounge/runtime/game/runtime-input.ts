export class RuntimeKeyboard {
  private readonly held = new Set<string>();
  private readonly pressed = new Set<string>();

  constructor(private readonly target: HTMLElement) {
    target.addEventListener("keydown", this.handleKeyDown);
    target.addEventListener("keyup", this.handleKeyUp);
    target.addEventListener("blur", this.reset);
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
    this.target.removeEventListener("keydown", this.handleKeyDown);
    this.target.removeEventListener("keyup", this.handleKeyUp);
    this.target.removeEventListener("blur", this.reset);
    this.reset();
  }

  private readonly handleKeyDown = (event: KeyboardEvent) => {
    if (!this.held.has(event.code)) this.pressed.add(event.code);
    this.held.add(event.code);
    if (isGameControlKey(event.code)) event.preventDefault();
  };

  private readonly handleKeyUp = (event: KeyboardEvent) => {
    this.held.delete(event.code);
    if (isGameControlKey(event.code)) event.preventDefault();
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
      "Space",
    ].includes(code)
  );
}
