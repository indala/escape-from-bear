import { Player } from './Player';
import { Pathfinder } from '../systems/Pathfinder';
import { LEVEL1_MAP, TILE_SIZE } from '../map/Level1';

export type BearState = 'PATROL' | 'ALERT' | 'INVESTIGATE' | 'CHASE';

// ── Tuning constants (change here, affects everything) ──────────────────────
const BEAR_SPEED_BASE        = 75;   // px/s in PATROL
const BEAR_SPEED_ALERT_MULT  = 1.25;
const BEAR_SPEED_INVEST_MULT = 1.35;
const BEAR_SPEED_CHASE_MULT  = 1.60;
const BEAR_SPEED_CHASE_MAX   = 2.40; // ramp cap (multiplier)
const BEAR_CHASE_RAMP_RATE   = 0.08; // how fast chase speed ramps per second

const PATH_REFRESH_PATROL_MS = 400;  // ms between A* calls while patrolling
const PATH_REFRESH_CHASE_MS  = 80;   // ms between A* calls while chasing

const SCAN_DURATION_PATROL   = 0.35; // s — brief look-around at patrol waypoints
const SCAN_DURATION_ALERT    = 0.60; // s — look-around when reaching alert spot
const SCAN_SPEED             = 2.2;  // rad/s during scan

const ALERT_TIMEOUT          = 5.0;  // s before ALERT reverts to PATROL
const INVESTIGATE_TIMEOUT    = 8.0;  // s before INVESTIGATE reverts to PATROL

const NODE_REACH_DIST        = 20;   // px — advance path when bear enters tile's half-width
const WAYPOINT_REACH_DIST    = 28;   // px — how close to a patrol waypoint counts as "arrived"

// ── Bear entity ──────────────────────────────────────────────────────────────
export class Bear {
  x: number = 600;
  y: number = 380;
  radius: number = 16;

  state: BearState = 'PATROL';
  direction: number = 0;        // radians — current facing angle (for vision cone)

  visionRange: number = 240;    // px
  visionAngle: number = Math.PI / 2.2; // ~82°

  alertTarget: { x: number; y: number } | null = null;
  alertTimer:  number = 0;

  lastGrowlTime: number = 0;

  // ── Dynamically computed from map — no hardcoding ──────────────────────────
  // Waypoints are chosen as centres of known open-corridor tiles.
  // Generation: scan LEVEL1_MAP for tiles[y][x]===0 with some spacing.
  waypoints: { x: number; y: number }[] = Bear.generateWaypoints();

  currentWaypointIndex: number = 0; // initialized properly in constructor

  // ── Internal ────────────────────────────────────────────────────────────────
  private path: { x: number; y: number }[] = [];
  private lastPathRefreshMs: number = 0;
  private chaseTime: number = 0;  // accumulated seconds in CHASE for speed ramp

  private scanTimer: number = 0;
  private scanDir:   number = 1;

  constructor() {
    // Safe: initialize only after waypoints array exists
    this.currentWaypointIndex = Math.floor(Math.random() * this.waypoints.length);
  }

  // ── Static: auto-generate walkable patrol waypoints from the map ──────────
  static generateWaypoints(): { x: number; y: number }[] {
    const map  = LEVEL1_MAP;
    const rows = map.length;
    const cols = map[0].length;
    const pts: { x: number; y: number }[] = [];

    const spacing = 5; // sample every N tiles
    for (let ty = 1; ty < rows - 1; ty += spacing) {
      for (let tx = 1; tx < cols - 1; tx += spacing) {
        if (map[ty][tx] === 0) {
          pts.push({
            x: tx * TILE_SIZE + TILE_SIZE / 2,
            y: ty * TILE_SIZE + TILE_SIZE / 2,
          });
        }
      }
    }
    // Fallback if map too sparse
    if (pts.length === 0) pts.push({ x: 60, y: 60 });
    return pts;
  }

  // ── Main update ─────────────────────────────────────────────────────────────
  update(dt: number, player: Player) {
    const nowMs = performance.now();

    // Speed ramp for chase
    this.chaseTime = this.state === 'CHASE' ? this.chaseTime + dt : 0;

    // Scan-animation: DOES NOT block state transitions or CHASE movement
    if (this.scanTimer > 0 && this.state !== 'CHASE') {
      this.scanTimer -= dt;
      this.direction += this.scanDir * SCAN_SPEED * dt;
      if (this.scanTimer <= 0 && this.state === 'PATROL') {
        this.pickNewWaypoint();
      }
      return; // only return early if NOT chasing
    }

    // Decide path refresh interval
    const refreshMs = this.state === 'CHASE' ? PATH_REFRESH_CHASE_MS : PATH_REFRESH_PATROL_MS;
    if (nowMs - this.lastPathRefreshMs > refreshMs || this.path.length === 0) {
      this.refreshPath(player);
      this.lastPathRefreshMs = nowMs;
    }

    this.followPath(dt);
    this.tickAlertTimer(dt);
  }

  // ── State setters (called from GameEngine) ──────────────────────────────────
  setAlert(targetX: number, targetY: number) {
    if (this.state === 'CHASE') return;
    this.state       = 'ALERT';
    this.alertTimer  = ALERT_TIMEOUT;
    this.alertTarget = { x: targetX, y: targetY };
    this.path        = [];          // force immediate re-path
    this.lastPathRefreshMs = 0;     // bypass interval
  }

  setChase() {
    if (this.state === 'CHASE') return;
    this.state             = 'CHASE';
    this.path              = [];
    this.lastPathRefreshMs = 0;     // immediately re-path toward player
    this.scanTimer         = 0;     // cancel any scan
  }

  setInvestigate(targetX: number, targetY: number) {
    if (this.state === 'CHASE') return;
    this.state       = 'INVESTIGATE';
    this.alertTarget = { x: targetX, y: targetY };
    this.alertTimer  = INVESTIGATE_TIMEOUT;
    this.path        = [];
    this.lastPathRefreshMs = 0;
  }

  /** Force the bear to forget everything and just patrol */
  forcePatrol() {
    this.state             = 'PATROL';
    this.alertTarget       = null;
    this.alertTimer        = 0;
    this.scanTimer         = 0;
    this.chaseTime         = 0;
    this.path              = [];
    this.lastPathRefreshMs = 0;
    this.pickNewWaypoint();
  }

  // ── Path computation ─────────────────────────────────────────────────────────
  private refreshPath(player: Player) {
    const target = this.currentTarget(player);
    const result = Pathfinder.findPath(this.x, this.y, target.x, target.y, LEVEL1_MAP);

    if (result && result.length > 0) {
      this.path = result;
    } else if (result === null && this.state === 'PATROL') {
      this.pickNewWaypoint();
    }
    // result===[] means already at target — onPathExhausted handles it
  }

  private currentTarget(player: Player): { x: number; y: number } {
    if (this.state === 'CHASE') {
      return { x: player.x, y: player.y };
    }
    if ((this.state === 'ALERT' || this.state === 'INVESTIGATE') && this.alertTarget) {
      return this.alertTarget;
    }
    return this.waypoints[this.currentWaypointIndex];
  }

  // ── Movement along path ──────────────────────────────────────────────────────
  private followPath(dt: number) {
    if (this.path.length === 0) {
      this.onPathExhausted();
      return;
    }

    const node = this.path[0];
    const dx   = node.x - this.x;
    const dy   = node.y - this.y;
    const dist = Math.hypot(dx, dy);

    if (dist < NODE_REACH_DIST) {
      this.path.shift();
      return;
    }

    const targetAngle = Math.atan2(dy, dx);

    // Smooth turn toward movement direction
    let diff = targetAngle - this.direction;
    while (diff < -Math.PI) diff += Math.PI * 2;
    while (diff > Math.PI)  diff -= Math.PI * 2;
    const turnRate = this.state === 'CHASE' ? 18 : 10;
    this.direction += diff * Math.min(turnRate * dt, 1.0);

    // Speed
    const chaseMult = Math.min(
      BEAR_SPEED_CHASE_MULT + this.chaseTime * BEAR_CHASE_RAMP_RATE,
      BEAR_SPEED_CHASE_MAX
    );
    const multByState: Record<BearState, number> = {
      PATROL:      1.0,
      ALERT:       BEAR_SPEED_ALERT_MULT,
      INVESTIGATE: BEAR_SPEED_INVEST_MULT,
      CHASE:       chaseMult,
    };
    const spd = BEAR_SPEED_BASE * multByState[this.state];

    // Move in exact direction of path node (avoids wall hugging from direction drift)
    this.x += Math.cos(targetAngle) * spd * dt;
    this.y += Math.sin(targetAngle) * spd * dt;
  }

  private onPathExhausted() {
    switch (this.state) {
      case 'PATROL':
        // Arrived at waypoint — brief scan, then move on
        if (Math.hypot(this.x - this.waypoints[this.currentWaypointIndex].x,
                       this.y - this.waypoints[this.currentWaypointIndex].y) < WAYPOINT_REACH_DIST) {
          this.scanTimer = SCAN_DURATION_PATROL;
          this.scanDir   = Math.random() < 0.5 ? 1 : -1;
        } else {
          // Didn't reach waypoint — just pick a new one
          this.pickNewWaypoint();
        }
        break;

      case 'ALERT':
        this.state     = 'INVESTIGATE';
        this.scanTimer = SCAN_DURATION_ALERT;
        this.scanDir   = Math.random() < 0.5 ? 1 : -1;
        break;

      case 'INVESTIGATE':
        this.state       = 'PATROL';
        this.alertTarget = null;
        this.pickNewWaypoint();
        break;

      case 'CHASE':
        // Path exhausted while chasing = we're right next to the player.
        // refreshPath will immediately get a new path next interval.
        break;
    }
  }

  private tickAlertTimer(dt: number) {
    if (this.state !== 'ALERT' && this.state !== 'INVESTIGATE') return;
    this.alertTimer -= dt;
    if (this.alertTimer <= 0) {
      this.state       = 'PATROL';
      this.alertTarget = null;
      this.pickNewWaypoint();
    }
  }

  public pickNewWaypoint() {
    if (this.waypoints.length <= 1) return;
    let next: number;
    do { next = Math.floor(Math.random() * this.waypoints.length); }
    while (next === this.currentWaypointIndex);
    this.currentWaypointIndex = next;
    this.path              = [];
    this.lastPathRefreshMs = 0; // force immediate re-path
  }

  // ── Rendering ────────────────────────────────────────────────────────────────
  draw(ctx: CanvasRenderingContext2D) {
    this.drawVisionCone(ctx);
    this.drawBody(ctx);
  }

  private drawVisionCone(ctx: CanvasRenderingContext2D) {
    const alphas: Record<BearState, number> = {
      PATROL: 0.07, ALERT: 0.18, INVESTIGATE: 0.22, CHASE: 0.30,
    };
    const colors: Record<BearState, string> = {
      PATROL:      `rgba(255,80,80,${alphas.PATROL})`,
      ALERT:       `rgba(255,160,0,${alphas.ALERT})`,
      INVESTIGATE: `rgba(255,200,0,${alphas.INVESTIGATE})`,
      CHASE:       `rgba(255,0,0,${alphas.CHASE})`,
    };

    ctx.save();
    ctx.fillStyle = colors[this.state];
    ctx.beginPath();
    ctx.moveTo(this.x, this.y);
    ctx.arc(this.x, this.y, this.visionRange,
      this.direction - this.visionAngle / 2,
      this.direction + this.visionAngle / 2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  private drawBody(ctx: CanvasRenderingContext2D) {
    const stateColors: Record<BearState, string> = {
      PATROL:      '#8B4513',
      ALERT:       '#cc6600',
      INVESTIGATE: '#cc9900',
      CHASE:       '#cc1100',
    };
    const color = stateColors[this.state];
    const r     = this.radius;

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.direction + Math.PI / 2);

    ctx.shadowBlur  = this.state === 'CHASE' ? 24 : 10;
    ctx.shadowColor = color;

    // Body
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(0, 0, r, r * 1.2, 0, 0, Math.PI * 2);
    ctx.fill();

    // Head
    ctx.beginPath();
    ctx.arc(0, -r * 1.1, r * 0.7, 0, Math.PI * 2);
    ctx.fill();

    // Ears
    ctx.beginPath(); ctx.arc(-r * 0.55, -r * 1.65, r * 0.30, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc( r * 0.55, -r * 1.65, r * 0.30, 0, Math.PI * 2); ctx.fill();

    // Eye whites
    ctx.shadowBlur = 0;
    ctx.fillStyle  = 'white';
    ctx.beginPath(); ctx.arc(-r * 0.28, -r * 1.15, r * 0.18, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc( r * 0.28, -r * 1.15, r * 0.18, 0, Math.PI * 2); ctx.fill();

    // Pupils
    ctx.fillStyle = this.state === 'CHASE' ? '#ff0000' : '#111';
    ctx.beginPath(); ctx.arc(-r * 0.28, -r * 1.15, r * 0.10, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc( r * 0.28, -r * 1.15, r * 0.10, 0, Math.PI * 2); ctx.fill();

    ctx.restore();
  }

  // ── Detection check (called from GameEngine) ─────────────────────────────────
  checkDetection(player: Player): boolean {
    const dx = player.x - this.x;
    const dy = player.y - this.y;
    if (Math.hypot(dx, dy) > this.visionRange) return false;
    const angle = Math.atan2(dy, dx);
    let diff    = angle - this.direction;
    while (diff < -Math.PI) diff += Math.PI * 2;
    while (diff >  Math.PI) diff -= Math.PI * 2;
    return Math.abs(diff) < this.visionAngle / 2;
  }
}
