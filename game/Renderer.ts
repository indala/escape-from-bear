import { GameEngine } from './GameEngine';
import { TILE_SIZE, MAP_WIDTH, MAP_HEIGHT } from './map/Level1';
import { VisibilitySystem } from './systems/VisibilitySystem';

export class Renderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private lightCanvas: HTMLCanvasElement;
  private lightCtx: CanvasRenderingContext2D;

  public width: number = 0;
  public height: number = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.lightCanvas = document.createElement('canvas');
    this.lightCtx = this.lightCanvas.getContext('2d')!;
  }

  resize(w: number, h: number) {
    if (w <= 0 || h <= 0) return;
    const dpr = window.devicePixelRatio || 1;
    this.width = w;
    this.height = h;

    // Reset transform before scaling to avoid accumulation on repeated calls
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    this.lightCanvas.width = Math.round(w * dpr);
    this.lightCanvas.height = Math.round(h * dpr);
    this.lightCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  render(engine: GameEngine) {
    const { ctx } = this;
    const cam = engine.camera;

    ctx.fillStyle = '#050508';
    ctx.fillRect(0, 0, this.width, this.height);

    ctx.save();
    cam.apply(ctx);

    this.drawFloor(engine.map);
    this.drawWalls(engine.map);
    this.drawEntry(engine.entry);
    this.drawItems(engine.items);
    this.drawExit(engine.exit);
    engine.draw(ctx);

    ctx.restore();

    // Light mask is drawn in screen space (no camera transform)
    this.drawLightMask(engine);

    // Vignette on top
    this.drawVignette();
  }

  private drawFloor(map: number[][]) {
    this.ctx.fillStyle = '#0d0d12';
    this.ctx.fillRect(0, 0, MAP_WIDTH, MAP_HEIGHT);

    // Subtle floor grid
    this.ctx.strokeStyle = 'rgba(255,255,255,0.025)';
    this.ctx.lineWidth = 0.5;
    for (let y = 0; y < map.length; y++) {
      for (let x = 0; x < map[y].length; x++) {
        if (map[y][x] === 0) {
          this.ctx.strokeRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        }
      }
    }
  }

  private drawWalls(map: number[][]) {
    for (let y = 0; y < map.length; y++) {
      for (let x = 0; x < map[y].length; x++) {
        if (map[y][x] !== 1) continue;
        const px = x * TILE_SIZE;
        const py = y * TILE_SIZE;

        // Base wall
        this.ctx.fillStyle = '#1c1c24';
        this.ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);

        // Top highlight (gives depth)
        this.ctx.fillStyle = 'rgba(255,255,255,0.04)';
        this.ctx.fillRect(px, py, TILE_SIZE, 3);

        // Left highlight
        this.ctx.fillStyle = 'rgba(255,255,255,0.02)';
        this.ctx.fillRect(px, py, 3, TILE_SIZE);

        // Inner shadow
        this.ctx.fillStyle = 'rgba(0,0,0,0.3)';
        this.ctx.fillRect(px + 3, py + 3, TILE_SIZE - 6, TILE_SIZE - 6);
      }
    }
  }

  private drawEntry(entry: { x: number; y: number }) {
    this.ctx.save();
    this.ctx.strokeStyle = 'rgba(0, 245, 212, 0.25)';
    this.ctx.lineWidth = 1.5;
    this.ctx.setLineDash([4, 4]);
    this.ctx.beginPath();
    this.ctx.arc(entry.x, entry.y, 28, 0, Math.PI * 2);
    this.ctx.stroke();
    this.ctx.setLineDash([]);

    this.ctx.fillStyle = 'rgba(0, 245, 212, 0.35)';
    this.ctx.font = 'bold 8px monospace';
    this.ctx.textAlign = 'center';
    this.ctx.fillText('START', entry.x, entry.y + 3);
    this.ctx.restore();
  }

  private drawItems(items: { x: number; y: number; collected: boolean }[]) {
    const t = performance.now() / 1000;
    this.ctx.save();
    for (const item of items) {
      if (item.collected) continue;
      const pulse = Math.sin(t * 3) * 0.3 + 0.7;

      // Outer glow ring
      this.ctx.shadowBlur = 20 * pulse;
      this.ctx.shadowColor = 'rgba(255, 220, 50, 0.8)';
      this.ctx.strokeStyle = `rgba(255, 220, 50, ${0.4 * pulse})`;
      this.ctx.lineWidth = 1.5;
      this.ctx.beginPath();
      this.ctx.arc(item.x, item.y, 10 * pulse, 0, Math.PI * 2);
      this.ctx.stroke();

      // Core
      this.ctx.fillStyle = `rgba(255, 220, 50, ${0.9 * pulse})`;
      this.ctx.beginPath();
      this.ctx.arc(item.x, item.y, 5, 0, Math.PI * 2);
      this.ctx.fill();
    }
    this.ctx.restore();
  }

  private drawExit(exit: { x: number; y: number; active: boolean }) {
    if (!exit.active) {
      // Draw inactive exit as a faint marker
      this.ctx.save();
      this.ctx.strokeStyle = 'rgba(255,255,255,0.05)';
      this.ctx.lineWidth = 1;
      this.ctx.setLineDash([3, 6]);
      this.ctx.beginPath();
      this.ctx.arc(exit.x, exit.y, 22, 0, Math.PI * 2);
      this.ctx.stroke();
      this.ctx.setLineDash([]);
      this.ctx.fillStyle = 'rgba(255,255,255,0.06)';
      this.ctx.font = 'bold 7px monospace';
      this.ctx.textAlign = 'center';
      this.ctx.fillText('EXIT', exit.x, exit.y + 3);
      this.ctx.restore();
      return;
    }

    const t = performance.now() / 1000;
    const pulse = Math.sin(t * 4) * 0.25 + 0.75;

    this.ctx.save();
    this.ctx.shadowBlur = 30 * pulse;
    this.ctx.shadowColor = 'rgba(0, 245, 212, 0.7)';

    // Outer ring
    this.ctx.strokeStyle = `rgba(0, 245, 212, ${0.6 * pulse})`;
    this.ctx.lineWidth = 3;
    this.ctx.beginPath();
    this.ctx.arc(exit.x, exit.y, 28 * pulse, 0, Math.PI * 2);
    this.ctx.stroke();

    // Fill
    this.ctx.fillStyle = `rgba(0, 245, 212, ${0.12 * pulse})`;
    this.ctx.fill();

    // Label
    this.ctx.shadowBlur = 0;
    this.ctx.fillStyle = `rgba(0, 245, 212, ${0.8 * pulse})`;
    this.ctx.font = 'bold 9px monospace';
    this.ctx.textAlign = 'center';
    this.ctx.fillText('EXIT', exit.x, exit.y + 3);
    this.ctx.restore();
  }

  private drawLightMask(engine: GameEngine) {
    const { player, isFlashlightOn, camera } = engine;
    const lctx = this.lightCtx;
    const dpr = window.devicePixelRatio || 1;

    // Convert world positions to screen positions
    const ps = camera.toScreen(player.x, player.y);

    lctx.setTransform(1, 0, 0, 1, 0, 0);
    lctx.scale(dpr, dpr);
    // Full darkness
    lctx.globalCompositeOperation = 'source-over';
    lctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
    lctx.fillRect(0, 0, this.width, this.height);

    lctx.globalCompositeOperation = 'destination-out';

    // Ambient light around player (increases with items)
    const itemsCollected = engine.items.filter(i => i.collected).length;
    const ambientBase = 130;
    const ambientBonus = itemsCollected * 20;
    const ambientRadius = ambientBase + ambientBonus;

    const ambient = lctx.createRadialGradient(ps.x, ps.y, 2, ps.x, ps.y, ambientRadius);
    ambient.addColorStop(0, 'rgba(255,255,255,1)');
    ambient.addColorStop(0.3, 'rgba(255,255,255,0.8)');
    ambient.addColorStop(1, 'rgba(255,255,255,0)');
    lctx.fillStyle = ambient;
    lctx.beginPath();
    lctx.arc(ps.x, ps.y, ambientRadius, 0, Math.PI * 2);
    lctx.fill();

    // Directional flashlight cone (increases with items)
    if (isFlashlightOn) {
      const angle = player.facingAngle;
      const coneAngle = Math.PI / 2.5;

      const coneBase = 450;
      const coneBonus = itemsCollected * 60;
      const coneLength = coneBase + coneBonus;

      const poly = VisibilitySystem.getVisiblePolygon(player.x, player.y, angle, coneAngle, coneLength, engine.map);

      const flashGrad = lctx.createRadialGradient(ps.x, ps.y, 20, ps.x, ps.y, coneLength);
      flashGrad.addColorStop(0, 'rgba(255,255,255,1)');
      flashGrad.addColorStop(0.5, 'rgba(255,255,255,0.85)');
      flashGrad.addColorStop(1, 'rgba(255,255,255,0)');

      lctx.fillStyle = flashGrad;
      lctx.beginPath();
      poly.forEach((p, i) => {
        const sp = camera.toScreen(p.x, p.y);
        if (i === 0) lctx.moveTo(sp.x, sp.y);
        else lctx.lineTo(sp.x, sp.y);
      });
      lctx.closePath();
      lctx.fill();
    }

    // Bear vision cones reveal area (so player can see them)
    for (const bear of engine.bears) {
      const bs = camera.toScreen(bear.x, bear.y);
      const bearPoly = VisibilitySystem.getVisiblePolygon(bear.x, bear.y, bear.direction, bear.visionAngle, bear.visionRange, engine.map);

      const bearGrad = lctx.createRadialGradient(bs.x, bs.y, 10, bs.x, bs.y, bear.visionRange);
      bearGrad.addColorStop(0, 'rgba(255,255,255,0.4)');
      bearGrad.addColorStop(1, 'rgba(255,255,255,0)');

      lctx.fillStyle = bearGrad;
      lctx.beginPath();
      bearPoly.forEach((p, i) => {
        const sp = camera.toScreen(p.x, p.y);
        if (i === 0) lctx.moveTo(sp.x, sp.y);
        else lctx.lineTo(sp.x, sp.y);
      });
      lctx.closePath();
      lctx.fill();
    }

    // Composite onto main canvas
    this.ctx.drawImage(this.lightCanvas, 0, 0, this.width, this.height);
  }

  private drawVignette() {
    const grad = this.ctx.createRadialGradient(
      this.width / 2, this.height / 2, this.width * 0.35,
      this.width / 2, this.height / 2, this.width * 0.95
    );
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.5)');
    this.ctx.fillStyle = grad;
    this.ctx.fillRect(0, 0, this.width, this.height);
  }
}
