import { TILE_SIZE } from '../map/MapData';

export class CollisionSystem {

  /**
   * Resolve X axis only — push out of walls horizontally.
   * Samples at center and ±40% radius vertically to catch corners.
   */
  static resolveX(x: number, y: number, radius: number, map: number[][]): number {
    const cols = map[0].length;
    let nx = Math.max(radius, Math.min(cols * TILE_SIZE - radius, x));

    for (const yo of [-radius * 0.4, 0, radius * 0.4]) {
      const ty = Math.floor((y + yo) / TILE_SIZE);

      const leftTX = Math.floor((nx - radius) / TILE_SIZE);
      if (this.isWall(leftTX, ty, map)) {
        nx = (leftTX + 1) * TILE_SIZE + radius;
      }

      const rightTX = Math.floor((nx + radius) / TILE_SIZE);
      if (this.isWall(rightTX, ty, map)) {
        nx = rightTX * TILE_SIZE - radius;
      }
    }

    return nx;
  }

  /**
   * Resolve Y axis only — push out of walls vertically.
   * Samples at center and ±40% radius horizontally to catch corners.
   */
  static resolveY(x: number, y: number, radius: number, map: number[][]): number {
    const rows = map.length;
    let ny = Math.max(radius, Math.min(rows * TILE_SIZE - radius, y));

    for (const xo of [-radius * 0.4, 0, radius * 0.4]) {
      const tx = Math.floor((x + xo) / TILE_SIZE);

      const topTY = Math.floor((ny - radius) / TILE_SIZE);
      if (this.isWall(tx, topTY, map)) {
        ny = (topTY + 1) * TILE_SIZE + radius;
      }

      const bottomTY = Math.floor((ny + radius) / TILE_SIZE);
      if (this.isWall(tx, bottomTY, map)) {
        ny = bottomTY * TILE_SIZE - radius;
      }
    }

    return ny;
  }

  /** Full resolve — kept for bear (doesn't need sliding) */
  static resolve(x: number, y: number, radius: number, map: number[][]): { x: number; y: number } {
    const nx = this.resolveX(x, y, radius, map);
    const ny = this.resolveY(nx, y, radius, map);
    return { x: nx, y: ny };
  }

  static isWall(tx: number, ty: number, map: number[][]): boolean {
    if (ty < 0 || ty >= map.length || tx < 0 || tx >= map[0].length) return true;
    return map[ty][tx] === 1;
  }
}
