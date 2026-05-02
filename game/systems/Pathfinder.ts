import { TILE_SIZE } from '../map/MapData';

// ─── Binary Min-Heap ──────────────────────────────────────────────────────────
class MinHeap {
  private data: Node[] = [];

  get size() { return this.data.length; }

  push(node: Node) {
    this.data.push(node);
    this.bubbleUp(this.data.length - 1);
  }

  pop(): Node {
    const top  = this.data[0];
    const last = this.data.pop()!;
    if (this.data.length > 0) {
      this.data[0] = last;
      this.sinkDown(0);
    }
    return top;
  }

  private bubbleUp(i: number) {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.data[parent].f <= this.data[i].f) break;
      [this.data[parent], this.data[i]] = [this.data[i], this.data[parent]];
      i = parent;
    }
  }

  private sinkDown(i: number) {
    const n = this.data.length;
    while (true) {
      let smallest = i;
      const l = 2 * i + 1, r = 2 * i + 2;
      if (l < n && this.data[l].f < this.data[smallest].f) smallest = l;
      if (r < n && this.data[r].f < this.data[smallest].f) smallest = r;
      if (smallest === i) break;
      [this.data[smallest], this.data[i]] = [this.data[i], this.data[smallest]];
      i = smallest;
    }
  }
}

interface Node {
  x: number;
  y: number;
  g: number;
  h: number;
  f: number;
  parent: Node | null;
}

// ─── Walkability cache ────────────────────────────────────────────────────────
let cachedMap: number[][] | null = null;
let walkable:  Uint8Array | null = null;
let mapCols = 0;
let mapRows = 0;

function buildCache(map: number[][]) {
  if (map === cachedMap) return;
  cachedMap = map;
  mapRows   = map.length;
  mapCols   = map[0].length;
  walkable  = new Uint8Array(mapRows * mapCols);
  for (let y = 0; y < mapRows; y++)
    for (let x = 0; x < mapCols; x++)
      walkable[y * mapCols + x] = map[y][x] === 0 ? 1 : 0;
}

function isWalkable(x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= mapCols || y >= mapRows) return false;
  return walkable![y * mapCols + x] === 1;
}

// ─── 8-directional neighbours (cardinal only to prevent corner-cutting shaking)
// IMPORTANT: Using only 4 cardinal directions so the bear NEVER cuts corners.
// Diagonal movement causes the bear to oscillate against wall corners because
// tile-level diagonal LOS doesn't guarantee pixel-level clearance.
const DIRS = [
  { x:  0, y: -1, cost: 1 },
  { x:  0, y:  1, cost: 1 },
  { x: -1, y:  0, cost: 1 },
  { x:  1, y:  0, cost: 1 },
];

// ─── Octile heuristic (works for cardinal-only movement too) ──────────────────
function heuristic(ax: number, ay: number, bx: number, by: number): number {
  return Math.abs(ax - bx) + Math.abs(ay - by); // Manhattan for 4-dir
}

// ─── Main A* Pathfinder ───────────────────────────────────────────────────────
export class Pathfinder {
  /**
   * A* with binary min-heap and walkability cache.
   * Returns tile-center pixel waypoints, or null if no path exists.
   *
   * NO path smoothing and NO LOS shortcuts — both caused pixel-level
   * corner clipping which made the bear shake/oscillate against walls.
   * Tile-center waypoints from A* are always wall-safe.
   */
  static findPath(
    startX: number, startY: number,
    targetX: number, targetY: number,
    map: number[][]
  ): { x: number; y: number }[] | null {
    buildCache(map);

    const sx = Math.floor(startX  / TILE_SIZE);
    const sy = Math.floor(startY  / TILE_SIZE);
    let   tx = Math.floor(targetX / TILE_SIZE);
    let   ty = Math.floor(targetY / TILE_SIZE);

    // If target tile is a wall, search for nearest walkable tile
    if (!isWalkable(tx, ty)) {
      const nearest = Pathfinder.nearestWalkable(tx, ty);
      if (!nearest) return null;
      tx = nearest.x;
      ty = nearest.y;
    }

    // Already at destination tile
    if (sx === tx && sy === ty) return [];

    const heap    = new MinHeap();
    const gScore  = new Float32Array(mapRows * mapCols).fill(Infinity);
    const closed  = new Uint8Array(mapRows * mapCols);
    const parents = new Array<Node | null>(mapRows * mapCols).fill(null);

    const startNode: Node = {
      x: sx, y: sy,
      g: 0, h: heuristic(sx, sy, tx, ty),
      f: heuristic(sx, sy, tx, ty),
      parent: null,
    };
    heap.push(startNode);
    gScore[sy * mapCols + sx] = 0;

    while (heap.size > 0) {
      const cur    = heap.pop();
      const curIdx = cur.y * mapCols + cur.x;

      if (closed[curIdx]) continue;
      closed[curIdx] = 1;

      if (cur.x === tx && cur.y === ty) {
        return Pathfinder.buildPath(cur);
      }

      for (const d of DIRS) {
        const nx = cur.x + d.x;
        const ny = cur.y + d.y;
        if (!isWalkable(nx, ny)) continue;

        const nIdx = ny * mapCols + nx;
        if (closed[nIdx]) continue;

        const g = cur.g + d.cost;
        if (g >= gScore[nIdx]) continue;

        gScore[nIdx] = g;
        const h = heuristic(nx, ny, tx, ty);
        const node: Node = { x: nx, y: ny, g, h, f: g + h, parent: cur };
        parents[nIdx] = node;
        heap.push(node);
      }
    }

    return null; // no path
  }

  /** Find the nearest walkable tile to (tx, ty) using BFS */
  private static nearestWalkable(tx: number, ty: number): { x: number; y: number } | null {
    // Ensure initial target is within map bounds for visited array
    const startX = Math.max(0, Math.min(mapCols - 1, tx));
    const startY = Math.max(0, Math.min(mapRows - 1, ty));
    
    const visited = new Uint8Array(mapRows * mapCols);
    const queue: [number, number][] = [[startX, startY]];
    visited[startY * mapCols + startX] = 1;

    while (queue.length > 0) {
      const [cx, cy] = queue.shift()!;
      if (isWalkable(cx, cy)) return { x: cx, y: cy };
      
      for (const d of DIRS) {
        const nx = cx + d.x, ny = cy + d.y;
        if (nx < 0 || ny < 0 || nx >= mapCols || ny >= mapRows) continue;
        
        const nIdx = ny * mapCols + nx;
        if (visited[nIdx]) continue;
        visited[nIdx] = 1;
        queue.push([nx, ny]);
      }
    }
    return null;
  }


  /** Reconstruct path from goal node, return tile-centre pixel coords.
   *  IMPORTANT: we slice off index 0 (the bear's own current tile centre).
   *  Without this, every path refresh makes the bear turn back to re-visit
   *  a point it already passed, causing visible oscillation.
   */
  private static buildPath(node: Node): { x: number; y: number }[] {
    const path: { x: number; y: number }[] = [];
    let cur: Node | null = node;
    while (cur) {
      path.push({
        x: cur.x * TILE_SIZE + TILE_SIZE / 2,
        y: cur.y * TILE_SIZE + TILE_SIZE / 2,
      });
      cur = cur.parent;
    }
    // Reverse gives [start, ..., goal]. Skip start — bear is already in that tile.
    return path.reverse().slice(1);
  }
}
