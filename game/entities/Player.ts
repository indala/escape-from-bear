import { Input } from '../Input';

export class Player {
  x: number = 60;
  y: number = 60;
  radius: number = 10;
  speed: number = 160;
  isMoving: boolean = false;
  facingAngle: number = 0;

  // Visual feedback
  pickupFlash: number = 0; // countdown in seconds

  update(dt: number, input: Input) {
    const vx = input.axisX;
    const vy = input.axisY;

    this.isMoving = vx !== 0 || vy !== 0;

    if (this.isMoving) {
      const length = Math.sqrt(vx * vx + vy * vy);
      const nx = vx / length;
      const ny = vy / length;
      const maxStep = 35;
      const step = Math.min(this.speed * dt, maxStep);
      this.x += nx * step;
      this.y += ny * step;
      this.facingAngle = Math.atan2(ny, nx);
    }

    if (this.pickupFlash > 0) this.pickupFlash -= dt;
  }

  /** Called by GameEngine after axis-separated collision to sync state */
  updateState(dt: number, input: Input) {
    const vx = input.axisX;
    const vy = input.axisY;
    this.isMoving = vx !== 0 || vy !== 0;
    if (this.isMoving) {
      const len = Math.sqrt(vx * vx + vy * vy);
      this.facingAngle = Math.atan2(vy / len, vx / len);
    }
    if (this.pickupFlash > 0) this.pickupFlash -= dt;
  }

  triggerPickup() {
    this.pickupFlash = 0.4;
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.save();

    const flash = this.pickupFlash > 0;
    const glowColor = flash ? 'rgba(255, 255, 100, 0.9)' : 'rgba(0, 245, 212, 0.5)';
    const fillColor = flash ? '#ffff88' : '#00f5d4';

    ctx.shadowBlur = this.isMoving ? 22 : 12;
    ctx.shadowColor = glowColor;
    ctx.fillStyle = fillColor;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();

    // White core for visibility
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius * 0.4, 0, Math.PI * 2);
    ctx.fill();

    // Direction dot
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(
      this.x + Math.cos(this.facingAngle) * this.radius * 0.7,
      this.y + Math.sin(this.facingAngle) * this.radius * 0.7,
      3.5, 0, Math.PI * 2
    );
    ctx.fill();

    ctx.restore();
  }
}
