import { TILE_SIZE } from '../map/MapData';

export class VisibilitySystem {
  // Cache for raycast results to avoid redundant calculations
  private static raycastCache: Map<string, number> = new Map();
  private static readonly CACHE_SIZE = 1000;

  /**
   * Casts a single ray and returns the distance to the first wall hit.
   * Uses the DDA (Digital Differential Analyzer) algorithm for grid-accurate checks.
   * Includes caching to avoid redundant calculations.
   */
  static raycast(
    startX: number,
    startY: number,
    angle: number,
    range: number,
    map: number[][]
  ): number {
    // Create cache key
    const key = `${startX.toFixed(2)}|${startY.toFixed(2)}|${angle.toFixed(4)}|${range.toFixed(2)}`;
    
    // Check cache first
    if (this.raycastCache.has(key)) {
      return this.raycastCache.get(key)!;
    }
    
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    // Direction vector
    const dirX = cos;
    const dirY = sin;

    // Current tile
    let mapX = Math.floor(startX / TILE_SIZE);
    let mapY = Math.floor(startY / TILE_SIZE);

    // Length of ray from one x or y-side to next x or y-side
    const deltaDistX = Math.abs(1 / dirX);
    const deltaDistY = Math.abs(1 / dirY);

    // Step direction and initial sideDist
    let stepX: number, stepY: number;
    let sideDistX: number, sideDistY: number;

    if (dirX < 0) {
      stepX = -1;
      sideDistX = (startX / TILE_SIZE - mapX) * deltaDistX;
    } else {
      stepX = 1;
      sideDistX = (mapX + 1.0 - startX / TILE_SIZE) * deltaDistX;
    }

    if (dirY < 0) {
      stepY = -1;
      sideDistY = (startY / TILE_SIZE - mapY) * deltaDistY;
    } else {
      stepY = 1;
      sideDistY = (mapY + 1.0 - startY / TILE_SIZE) * deltaDistY;
    }

    let dist = 0;
    const maxTiles = Math.ceil(range / TILE_SIZE) + 2;
    let iterations = 0;

    // Perform DDA
    while (iterations < maxTiles) {
      // Jump to next square
      if (sideDistX < sideDistY) {
        dist = sideDistX;
        sideDistX += deltaDistX;
        mapX += stepX;
      } else {
        dist = sideDistY;
        sideDistY += deltaDistY;
        mapY += stepY;
      }

      const worldDist = dist * TILE_SIZE;
      if (worldDist > range) {
        const result = range;
        this.cacheResult(key, result);
        return result;
      }

      // Check for wall
      if (
        mapY < 0 ||
        mapY >= map.length ||
        mapX < 0 ||
        mapX >= map[0].length ||
        map[mapY][mapX] === 1
      ) {
        const result = worldDist;
        this.cacheResult(key, result);
        return result;
      }

      iterations++;
    }

    const result = range;
    this.cacheResult(key, result);
    return result;
  }
  
  private static cacheResult(key: string, result: number): void {
    // Simple cache management - clear cache if it gets too large
    if (this.raycastCache.size > this.CACHE_SIZE) {
      this.raycastCache.clear();
    }
    this.raycastCache.set(key, result);
  }
  
  static clearCache(): void {
    this.raycastCache.clear();
  }

  /**
   * Fast check to see if there is an unobstructed line between two points.
   */
  static hasLineOfSight(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    map: number[][]
  ): boolean {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dist = Math.hypot(dx, dy);
    if (dist < 1) return true;

    const angle = Math.atan2(dy, dx);
    const hitDist = this.raycast(x1, y1, angle, dist, map);

    // Allow a small margin of error (2 pixels) to prevent false negatives at corners
    return hitDist >= dist - 2;
  }

  /**
   * Generates a polygon (array of points) representing the visible area within a cone.
   */
  static getVisiblePolygon(
    startX: number,
    startY: number,
    centerAngle: number,
    coneAngle: number,
    range: number,
    map: number[][]
  ): { x: number; y: number }[] {
    const points: { x: number; y: number }[] = [];
    points.push({ x: startX, y: startY });

    const startAngle = centerAngle - coneAngle / 2;

    // Determine number of rays based on cone size for performance/quality balance
    // Approx 1 ray per 2 degrees
    const stepCount = Math.max(10, Math.ceil((coneAngle * 180 / Math.PI) / 2));
    const step = coneAngle / stepCount;

    for (let i = 0; i <= stepCount; i++) {
      const angle = startAngle + i * step;
      const dist = this.raycast(startX, startY, angle, range, map);

      points.push({
        x: startX + Math.cos(angle) * dist,
        y: startY + Math.sin(angle) * dist
      });
    }

    return points;
  }
}
