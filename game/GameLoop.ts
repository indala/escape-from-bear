export class GameLoop {
  private lastTime: number = 0;
  private onUpdate: (dt: number) => void;
  private onRender: () => void;
  private animationId?: number;

  constructor(onUpdate: (dt: number) => void, onRender: () => void) {
    this.onUpdate = onUpdate;
    this.onRender = onRender;
  }

  start() {
    this.lastTime = performance.now();
    this.loop(this.lastTime);
  }

  stop() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }
  }

  private loop = (currentTime: number) => {
    const dt = (currentTime - this.lastTime) / 1000; // Convert to seconds
    this.lastTime = currentTime;

    // Cap dt to avoid huge jumps on tab switch / tunnel latency
    const cappedDt = Math.min(dt, 0.05); // max 50ms = 20fps minimum

    this.onUpdate(cappedDt);
    this.onRender();

    this.animationId = requestAnimationFrame(this.loop);
  };
}
