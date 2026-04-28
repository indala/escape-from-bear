export class Input {
  private keys: Set<string> = new Set();
  public virtualX: number = 0;
  public virtualY: number = 0;
  public virtualFlashlight: boolean = false;
  private justPressedKeys: Set<string> = new Set();

  private onKeyDown: (e: KeyboardEvent) => void;
  private onKeyUp:   (e: KeyboardEvent) => void;

  constructor() {
    this.onKeyDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (!this.keys.has(k)) this.justPressedKeys.add(k);
      this.keys.add(k);
    };
    this.onKeyUp = (e: KeyboardEvent) => {
      this.keys.delete(e.key.toLowerCase());
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', this.onKeyDown);
      window.addEventListener('keyup',   this.onKeyUp);
    }
  }

  isPressed(key: string): boolean {
    return this.keys.has(key.toLowerCase());
  }

  justPressed(key: string): boolean {
    const k = key.toLowerCase();

    // Virtual flashlight button (mobile)
    if (k === 'f' && this.virtualFlashlight) {
      this.virtualFlashlight = false;
      return true;
    }

    const wasJust = this.justPressedKeys.has(k);
    this.justPressedKeys.delete(k); // consume
    return wasJust;
  }

  private static readonly VIRTUAL_DEADZONE = 0.15;

  get axisX(): number {
    if (this.virtualX !== 0 || this.virtualY !== 0) {
      const v = Math.max(-1, Math.min(1, this.virtualX));
      return Math.abs(v) < Input.VIRTUAL_DEADZONE ? 0 : v;
    }
    let x = 0;
    if (this.isPressed('a') || this.isPressed('arrowleft'))  x -= 1;
    if (this.isPressed('d') || this.isPressed('arrowright')) x += 1;
    return x;
  }

  get axisY(): number {
    if (this.virtualX !== 0 || this.virtualY !== 0) {
      const v = Math.max(-1, Math.min(1, this.virtualY));
      return Math.abs(v) < Input.VIRTUAL_DEADZONE ? 0 : v;
    }
    let y = 0;
    if (this.isPressed('w') || this.isPressed('arrowup'))   y -= 1;
    if (this.isPressed('s') || this.isPressed('arrowdown')) y += 1;
    return y;
  }

  /** Call this when the game restarts to remove old listeners */
  destroy() {
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', this.onKeyDown);
      window.removeEventListener('keyup',   this.onKeyUp);
    }
    this.keys.clear();
    this.justPressedKeys.clear();
  }
}
