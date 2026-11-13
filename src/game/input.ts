const CODES = [
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "KeyE",
  "KeyC",
  "KeyK",
  "ShiftLeft",
  "ShiftRight",
  "Escape",
] as const;

export class Input {
  private readonly down = new Set<string>();
  private readonly pressed = new Set<string>();
  private attached = false;

  private readonly onKeyDown = (event: KeyboardEvent) => {
    if (!CODES.includes(event.code as (typeof CODES)[number])) return;
    event.preventDefault();
    if (!this.down.has(event.code)) this.pressed.add(event.code);
    this.down.add(event.code);
  };

  private readonly onKeyUp = (event: KeyboardEvent) => {
    this.down.delete(event.code);
  };

  private readonly onBlur = () => {
    this.down.clear();
  };

  attach(): void {
    if (this.attached) return;
    this.attached = true;
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
  }

  detach(): void {
    if (!this.attached) return;
    this.attached = false;
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    this.down.clear();
    this.pressed.clear();
  }

  endFrame(): void {
    this.pressed.clear();
  }

  held(code: string): boolean {
    return this.down.has(code);
  }

  edge(code: string): boolean {
    return this.pressed.has(code);
  }

  get forward(): boolean {
    return this.held("KeyW") || this.held("ArrowUp");
  }

  get back(): boolean {
    return this.held("KeyS") || this.held("ArrowDown");
  }

  get left(): boolean {
    return this.held("KeyA") || this.held("ArrowLeft");
  }

  get right(): boolean {
    return this.held("KeyD") || this.held("ArrowRight");
  }

  get handbrake(): boolean {
    return this.held("ShiftLeft") || this.held("ShiftRight");
  }
}
