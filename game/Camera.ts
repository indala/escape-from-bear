// Camera is now dimension-agnostic and receives bounds during update


export class Camera {
  x: number = 0;
  y: number = 0;
  width: number = 0;
  height: number = 0;

  // Mobile/Rotation state
  public isMobile: boolean = false;
  public currentRotation: number = 0;

  // Zoom factor: 1.5 on mobile, 2.0 on PC for better visibility
  get zoom(): number {
    return this.isMobile ? 1.5 : 2.0;
  }
  // Screen shake
  private shakeIntensity: number = 0;
  private shakeDuration:  number = 0;
  private shakeOffsetX:   number = 0;
  private shakeOffsetY:   number = 0;

  // Exit reveal animation
  private exitRevealTarget?: { x: number; y: number };
  private exitRevealTimer: number = 0;
  private exitRevealProgress: number = 0;
  private exitRevealZoom: number = 1.0;
  private exitRevealOriginalPos?: { x: number; y: number };

  // Look-ahead: smoothly offset toward movement direction
  private lookAheadX: number = 0;
  private lookAheadY: number = 0;



  // Look-ahead distance (px) — how far ahead the camera peeks (reduced to 35 to prevent eye strain)
  private readonly LOOK_AHEAD_DIST = 35;

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

  revealExit(exitX: number, exitY: number) {
    // Store current camera position to return to
    this.exitRevealOriginalPos = { x: this.x, y: this.y };
    this.exitRevealTarget = { x: exitX, y: exitY };
    this.exitRevealTimer = 3.0; // 3 second reveal animation
    this.exitRevealProgress = 0;
    this.exitRevealZoom = 1.2; // Zoom out slightly
  }

  /**
   * @param targetX      player world X
   * @param targetY      player world Y
   * @param dt           delta time in seconds
   * @param velX         player direction X (normalised, -1..1)
   * @param velY         player direction Y (normalised, -1..1)
   * @param isMoving     whether the player is moving
   * @param mapWidth     current map width
   * @param mapHeight    current map height
   * @param isFlashlightOn whether the flashlight is active
   */
  update(
    targetX: number,
    targetY: number,
    dt: number,
    velX: number = 0,
    velY: number = 0,
    isMoving: boolean = false,
    _mapWidth: number = 0,
    _mapHeight: number = 0,
    isFlashlightOn: boolean = false
  ) {
    // Handle exit reveal animation
    if (this.exitRevealTimer > 0) {
      this.exitRevealTimer -= dt;
      this.exitRevealProgress = 1 - (this.exitRevealTimer / 3.0); // 0 to 1 progress

      if (this.exitRevealTarget && this.exitRevealOriginalPos) {
        // Calculate target position centered on exit
        const targetCenterX = this.exitRevealTarget.x - this.width / 2;
        const targetCenterY = this.exitRevealTarget.y - this.height / 2;

        // Interpolate between original position and exit position
        const t = this.exitRevealProgress;
        this.x = this.exitRevealOriginalPos.x * (1 - t) + targetCenterX * t;
        this.y = this.exitRevealOriginalPos.y * (1 - t) + targetCenterY * t;

        // Apply zoom effect (slight zoom out)
        const zoomT = Math.sin(t * Math.PI); // Ease in/out effect
        const currentZoom = 1.0 + (this.exitRevealZoom - 1.0) * zoomT;

        // Temporarily override zoom during exit reveal
        Object.defineProperty(this, 'zoom', {
          value: currentZoom,
          writable: true,
          configurable: true
        });

        // When animation completes, return to normal camera behavior
        if (this.exitRevealTimer <= 0) {
          this.exitRevealTarget = undefined;
          this.exitRevealOriginalPos = undefined;
          // Restore original zoom
          Object.defineProperty(this, 'zoom', {
            get: function() { return this.isMobile ? 1.5 : 2.0; }
          });
        }

        // Skip normal camera logic during reveal animation
        return;
      }
    }

    // We no longer rotate the map on mobile to prevent motion sickness and improve UX
    this.currentRotation = 0;

    // Center view: no deadzone on both PC and Mobile to keep the player centered
    const deadzoneX = 0;
    const deadzoneY = 0;

    // Use a smaller look-ahead distance to prevent eye strain
    const lookAheadDist = this.isMobile 
      ? (isFlashlightOn ? this.LOOK_AHEAD_DIST * 1.5 : 0) 
      : this.LOOK_AHEAD_DIST;

    // 1. Calculate Look-ahead (smoothly offset toward movement or light direction)
    const isActive = isMoving || (this.isMobile && isFlashlightOn);
    const targetLookX = isActive ? velX * lookAheadDist : 0;
    const targetLookY = isActive ? velY * lookAheadDist : 0;


    this.lookAheadX += (targetLookX - this.lookAheadX) * Math.min(1, this.LOOK_AHEAD_SPEED * dt);
    this.lookAheadY += (targetLookY - this.lookAheadY) * Math.min(1, this.LOOK_AHEAD_SPEED * dt);

    // 2. Determine desired camera position (top-left)
    const desiredX = targetX + this.lookAheadX - this.width  / 2;
    const desiredY = targetY + this.lookAheadY - this.height / 2;

    // 3. Apply Deadzone and Smoothing
    const diffX = desiredX - this.x;
    const diffY = desiredY - this.y;

    if (Math.abs(diffX) > deadzoneX) {
      const speedX = Math.min(4 + (Math.abs(diffX) - deadzoneX) * 0.05, 14);
      this.x += diffX * Math.min(1, speedX * dt);
    }
    if (Math.abs(diffY) > deadzoneY) {
      const speedY = Math.min(4 + (Math.abs(diffY) - deadzoneY) * 0.05, 14);
      this.y += diffY * Math.min(1, speedY * dt);
    }

    // No clamping to map bounds - camera always stays centered on the player (on both PC and Mobile)

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
    // 1. Move to screen center with shake offset
    ctx.translate(this.width / 2 + this.shakeOffsetX, this.height / 2 + this.shakeOffsetY);
    
    // 2. Apply scale (PC zoom)
    const z = this.zoom;
    if (z !== 1.0) {
      ctx.scale(z, z);
    }

    // 3. Rotate (if any)
    if (this.currentRotation !== 0) {
      ctx.rotate(this.currentRotation);
    }
    
    // 4. Move to world position (centering on the camera's current world center)
    ctx.translate(-(this.x + this.width / 2), -(this.y + this.height / 2));
  }

  toScreen(worldX: number, worldY: number): { x: number; y: number } {
    const z = this.zoom;
    const dx = worldX - (this.x + this.width / 2);
    const dy = worldY - (this.y + this.height / 2);

    // If we have rotation, we need to apply it manually for coordinate conversion
    if (this.currentRotation !== 0) {
      const cos = Math.cos(this.currentRotation);
      const sin = Math.sin(this.currentRotation);
      
      const rx = (dx * cos - dy * sin) * z;
      const ry = (dx * sin + dy * cos) * z;
      
      return {
        x: Math.round(rx + this.width / 2 + this.shakeOffsetX),
        y: Math.round(ry + this.height / 2 + this.shakeOffsetY)
      };
    }

    // Default non-rotating screen conversion
    return {
      x: Math.round(dx * z + this.width / 2 + this.shakeOffsetX),
      y: Math.round(dy * z + this.height / 2 + this.shakeOffsetY),
    };
  }

  getExitRevealProgress(): number {
    return this.exitRevealProgress;
  }

  getExitRevealTarget(): { x: number; y: number } | undefined {
    return this.exitRevealTarget;
  }
}

