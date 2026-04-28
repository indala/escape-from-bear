import { MAP_WIDTH, MAP_HEIGHT } from './map/Level1';

export class Camera {
  x: number = 0;
  y: number = 0;
  width: number = 0;
  height: number = 0;

  // Mobile/Rotation state
  public isMobile: boolean = false;
  public currentRotation: number = 0;
  private targetX: number = 0;
  private targetY: number = 0;

  // Screen shake
  private shakeIntensity: number = 0;
  private shakeDuration:  number = 0;
  private shakeOffsetX:   number = 0;
  private shakeOffsetY:   number = 0;

  // Look-ahead: smoothly offset toward movement direction
  private lookAheadX: number = 0;
  private lookAheadY: number = 0;

  // Deadzone per axis (px) — camera only moves when player leaves this band
  private readonly DEADZONE_X = 30;
  private readonly DEADZONE_Y = 20;

  // Look-ahead distance (px) — how far ahead the camera peeks
  private readonly LOOK_AHEAD_DIST = 90;

  // Look-ahead smoothing speed
  private readonly LOOK_AHEAD_SPEED = 3.5;

  resize(w: number, h: number) {
    this.width  = w;
    this.height = h;
    // Auto-detect mobile based on width (standard breakpoint)
    this.isMobile = w < 768;
  }

  shake(intensity: number, duration: number) {
    this.shakeIntensity = intensity;
    this.shakeDuration  = duration;
  }

  /**
   * @param targetX      player world X
   * @param targetY      player world Y
   * @param dt           delta time in seconds
   * @param velX         player velocity X (normalised, -1..1)
   * @param velY         player velocity Y (normalised, -1..1)
   * @param isMoving     whether the player is moving
   * @param facingAngle  player's current rotation in radians
   */
  update(
    targetX: number,
    targetY: number,
    dt: number,
    velX: number = 0,
    velY: number = 0,
    isMoving: boolean = false,
    facingAngle: number = 0
  ) {
    this.targetX = targetX;
    this.targetY = targetY;

    if (this.isMobile) {
      // ── MOBILE: Centered & Rotating ─────────────────────────────────────────
      // We want the player facing UP (-Math.PI/2).
      // Map rotation = -facingAngle - Math.PI/2
      const targetRot = -facingAngle - Math.PI / 2;
      
      // Smoothly interpolate rotation to prevent motion sickness
      let diff = targetRot - this.currentRotation;
      while (diff < -Math.PI) diff += Math.PI * 2;
      while (diff >  Math.PI) diff -= Math.PI * 2;
      
      this.currentRotation += diff * Math.min(1, 4.5 * dt);
      
      // Look-ahead is disabled or minimized on mobile to keep player centered
      this.lookAheadX = 0;
      this.lookAheadY = 0;
      
      // For mobile, x and y are the "centered" camera pos
      this.x = targetX - this.width / 2;
      this.y = targetY - this.height / 2;
    } else {
      // ── DESKTOP: Traditional deadzone ───────────────────────────────────────
      this.currentRotation = 0;
      const targetLookX = isMoving ? velX * this.LOOK_AHEAD_DIST : 0;
      const targetLookY = isMoving ? velY * this.LOOK_AHEAD_DIST : 0;

      this.lookAheadX += (targetLookX - this.lookAheadX) * Math.min(1, this.LOOK_AHEAD_SPEED * dt);
      this.lookAheadY += (targetLookY - this.lookAheadY) * Math.min(1, this.LOOK_AHEAD_SPEED * dt);

      const desiredX = targetX + this.lookAheadX - this.width  / 2;
      const desiredY = targetY + this.lookAheadY - this.height / 2;

      const diffX = desiredX - this.x;
      const diffY = desiredY - this.y;

      if (Math.abs(diffX) > this.DEADZONE_X) {
        const speedX = Math.min(4 + (Math.abs(diffX) - this.DEADZONE_X) * 0.05, 14);
        this.x += diffX * Math.min(1, speedX * dt);
      }
      if (Math.abs(diffY) > this.DEADZONE_Y) {
        const speedY = Math.min(4 + (Math.abs(diffY) - this.DEADZONE_Y) * 0.05, 14);
        this.y += diffY * Math.min(1, speedY * dt);
      }

      // Clamp to map bounds (Desktop only)
      this.x = Math.max(0, Math.min(MAP_WIDTH  - this.width,  this.x));
      this.y = Math.max(0, Math.min(MAP_HEIGHT - this.height, this.y));
    }

    // ── Screen shake ──────────────────────────────────────────────────────────
    if (this.shakeDuration > 0) {
      this.shakeDuration  -= dt;
      this.shakeOffsetX    = (Math.random() - 0.5) * 2 * this.shakeIntensity;
      this.shakeOffsetY    = (Math.random() - 0.5) * 2 * this.shakeIntensity;
      this.shakeIntensity *= 0.88;
    } else {
      this.shakeOffsetX = 0;
      this.shakeOffsetY = 0;
    }
  }

  apply(ctx: CanvasRenderingContext2D) {
    // 1. Move to screen center
    ctx.translate(this.width / 2 + this.shakeOffsetX, this.height / 2 + this.shakeOffsetY);
    
    // 2. Rotate if on mobile
    if (this.isMobile && this.currentRotation !== 0) {
      ctx.rotate(this.currentRotation);
    }
    
    // 3. Move back to world position
    if (this.isMobile) {
      ctx.translate(-this.targetX, -this.targetY);
    } else {
      ctx.translate(-(this.x + this.width / 2), -(this.y + this.height / 2));
    }
  }

  toScreen(worldX: number, worldY: number): { x: number; y: number } {
    let dx, dy;
    
    if (this.isMobile) {
      dx = worldX - this.targetX;
      dy = worldY - this.targetY;
      
      const cos = Math.cos(this.currentRotation);
      const sin = Math.sin(this.currentRotation);
      
      const rx = dx * cos - dy * sin;
      const ry = dx * sin + dy * cos;
      
      return {
        x: rx + this.width / 2 + this.shakeOffsetX,
        y: ry + this.height / 2 + this.shakeOffsetY
      };
    } else {
      return {
        x: worldX - Math.round(this.x + this.shakeOffsetX),
        y: worldY - Math.round(this.y + this.shakeOffsetY),
      };
    }
  }
}
