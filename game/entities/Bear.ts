import { Player } from './Player';
import { Pathfinder } from '../systems/Pathfinder';
import { TILE_SIZE } from '../map/MapData';
import { VisibilitySystem } from '../systems/VisibilitySystem';
import { LevelData } from '../config/LevelConfig';

export type BearState = 'PATROL' | 'ALERT' | 'INVESTIGATE' | 'CHASE' | 'MEETING';

// ── Tuning constants (change here, affects everything) ──────────────────────
const BEAR_SPEED_BASE = 75;   // px/s in PATROL
const BEAR_SPEED_ALERT_MULT = 1.25;
const BEAR_SPEED_INVEST_MULT = 1.35;
const BEAR_SPEED_CHASE_MULT = 1.60;
const BEAR_SPEED_CHASE_MAX = 2.40; // ramp cap (multiplier)
const BEAR_CHASE_RAMP_RATE = 0.08; // how fast chase speed ramps per second

const PATH_REFRESH_PATROL_MS = 400;  // ms between A* calls while patrolling
const PATH_REFRESH_CHASE_MS = 80;   // ms between A* calls while chasing

const SCAN_DURATION_PATROL = 0.35; // s — brief look-around at patrol waypoints
const SCAN_DURATION_ALERT = 0.60; // s — look-around when reaching alert spot
const SCAN_SPEED = 2.2;  // rad/s during scan

const ALERT_TIMEOUT = 5.0;  // s before ALERT reverts to PATROL
const INVESTIGATE_TIMEOUT = 8.0;  // s before INVESTIGATE reverts to PATROL
const MEETING_COOLDOWN = 10.0; // s before another meeting can trigger

const NODE_REACH_DIST = 20;   // px — advance path when bear enters tile's half-width
const WAYPOINT_REACH_DIST = 28;   // px — how close to a patrol waypoint counts as "arrived"

// ── Bear entity ──────────────────────────────────────────────────────────────
export class Bear {
  x: number = 600;
  y: number = 380;
  radius: number = 16;

  state: BearState = 'PATROL';
  direction: number = 0;        // radians — current facing angle (for vision cone)

  visionRange: number;
  visionAngle: number;
  speedMult: number;
  hearingRange: number;

  alertTarget: { x: number; y: number } | null = null;
  alertTimer: number = 0;
  meetingTimer: number = 0;
  meetingCooldown: number = 0;
  private searchPointsCount: number = 0;
  public lastKnownPlayerPos: { x: number; y: number } | null = null;
  public canSeePlayer: boolean = false;



  lastGrowlTime: number = 0;

  private map: number[][];
  private waypoints: { x: number; y: number }[] = [];
  private currentWaypointIndex: number = 0;

  // ── Internal ────────────────────────────────────────────────────────────────
  private path: { x: number; y: number }[] = [];
  private lastPathRefreshMs: number = 0;
  private chaseTime: number = 0;  // accumulated seconds in CHASE for speed ramp

  private scanTimer: number = 0;
  private scanDir: number = 1;

  constructor(levelData: LevelData, map: number[][]) {
    this.map = map;
    this.visionRange = levelData.visionRange;
    this.visionAngle = levelData.visionAngle;
    this.speedMult = levelData.bearSpeedMult;
    this.hearingRange = levelData.hearingRange;
    this.waypoints = Bear.generateWaypoints(map);
    // Safe: initialize only after waypoints array exists
    this.currentWaypointIndex = Math.floor(Math.random() * this.waypoints.length);
  }

  // ── Static: auto-generate walkable patrol waypoints from the map ──────────
  static generateWaypoints(map: number[][]): { x: number; y: number }[] {
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

    if (this.meetingCooldown > 0) this.meetingCooldown -= dt;

    if (this.state === 'MEETING') {
      this.meetingTimer -= dt;
      if (this.meetingTimer <= 0) {
        this.forcePatrol();
        this.meetingCooldown = MEETING_COOLDOWN;
      }
      return; // Stop all logic while meeting
    }

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

    this.followPath(dt, player);

    this.tickAlertTimer(dt);

    // Update last known position if player is visible
    if (this.canSeePlayer) {
      this.lastKnownPlayerPos = { x: player.x, y: player.y };
    }
  }


  // ── State setters (called from GameEngine) ──────────────────────────────────
  setAlert(targetX: number, targetY: number) {
    if (this.state === 'CHASE') return;
    this.state = 'ALERT';
    this.alertTimer = ALERT_TIMEOUT;
    this.alertTarget = { x: targetX, y: targetY };
    this.path = [];          // force immediate re-path
    this.lastPathRefreshMs = 0;     // bypass interval
  }

  setChase() {
    if (this.state === 'CHASE') return;
    this.state = 'CHASE';
    this.path = [];
    this.lastPathRefreshMs = 0;     // immediately re-path toward player
    this.scanTimer = 0;     // cancel any scan
  }

  setInvestigate(targetX: number, targetY: number) {
    if (this.state === 'CHASE') return;
    this.state = 'INVESTIGATE';
    this.alertTarget = { x: targetX, y: targetY };
    this.alertTimer = INVESTIGATE_TIMEOUT;
    this.path = [];
    this.lastPathRefreshMs = 0;
  }

  setMeeting(duration: number) {
    if (this.state === 'CHASE' || this.meetingCooldown > 0) return;
    this.state = 'MEETING';
    this.meetingTimer = duration;
    this.path = [];
  }

  /** Force the bear to forget everything and just patrol */
  forcePatrol() {
    this.state = 'PATROL';
    this.alertTarget = null;
    this.alertTimer = 0;
    this.scanTimer = 0;
    this.chaseTime = 0;
    this.path = [];
    this.lastPathRefreshMs = 0;
    this.pickNewWaypoint();
  }

  // ── Path computation ─────────────────────────────────────────────────────────
  private refreshPath(player: Player) {
    const target = this.currentTarget(player);
    const result = Pathfinder.findPath(this.x, this.y, target.x, target.y, this.map);

    if (result && result.length > 0) {
      this.path = result;
    } else if (result && result.length === 0) {
      // Already in the same tile — just move directly to target pixels
      this.path = [target];
    } else if (result === null) {
      // If pathfinding fails, handle based on state
      if (this.state === 'PATROL') {
        this.pickNewWaypoint();
      } else if (this.state === 'INVESTIGATE' || this.state === 'ALERT') {
        this.endSearch();
      }
    }


    // result===[] means already at target — onPathExhausted handles it
  }

  private currentTarget(player: Player): { x: number; y: number } {
    if (this.state === 'CHASE') {
      let tx = player.x;
      let ty = player.y;

      // ── SMART: Anticipation (Lead the target) ─────────────────────────────
      // If player is moving, aim slightly ahead based on their speed
      if (player.isMoving) {
        const leadTime = 0.45; // seconds to look ahead
        tx += Math.cos(player.facingAngle) * player.speed * leadTime;
        ty += Math.sin(player.facingAngle) * player.speed * leadTime;
        
        // Don't lead into walls (simple bounds check)
        const mx = Math.floor(tx / TILE_SIZE);
        const my = Math.floor(ty / TILE_SIZE);
        if (!this.map[my] || this.map[my][mx] !== 0) {
          tx = player.x; // Fallback to current pos if prediction is in a wall
          ty = player.y;
        }
      }

      if (this.canSeePlayer) return { x: tx, y: ty };
      return this.lastKnownPlayerPos || { x: tx, y: ty };
    }
    if ((this.state === 'ALERT' || this.state === 'INVESTIGATE') && this.alertTarget) {
      return this.alertTarget;
    }
    return this.waypoints[this.currentWaypointIndex];
  }



  // ── Movement along path ──────────────────────────────────────────────────────
  private followPath(dt: number, player: Player) {
    if (this.path.length === 0) {
      this.onPathExhausted();
      return;
    }

    const node = this.path[0];
    const target = this.currentTarget(player);

    
    // ── SMART: Direct Charge (Smooth movement) ───────────────────────────────
    // If we have a direct LOS to the FINAL target, ignore the A* path nodes
    // and move straight. This removes the robotic tile-by-tile movement.
    const dxFull = target.x - this.x;
    const dyFull = target.y - this.y;
    const distFull = Math.hypot(dxFull, dyFull);
    
    let useDirectCharge = false;
    if (this.state === 'CHASE' && distFull < 400) {
      if (VisibilitySystem.hasLineOfSight(this.x, this.y, target.x, target.y, this.map)) {
        useDirectCharge = true;
      }
    }

    const moveTarget = useDirectCharge ? target : node;
    const dx = moveTarget.x - this.x;
    const dy = moveTarget.y - this.y;
    const dist = Math.hypot(dx, dy);

    if (dist < NODE_REACH_DIST && !useDirectCharge) {
      this.path.shift();
      return;
    }

    const targetAngle = Math.atan2(dy, dx);

    // Smooth turn toward movement direction
    let diff = targetAngle - this.direction;
    while (diff < -Math.PI) diff += Math.PI * 2;
    while (diff > Math.PI) diff -= Math.PI * 2;
    const turnRate = this.state === 'CHASE' ? 25 : 10;
    this.direction += diff * Math.min(turnRate * dt, 1.0);


    // Speed
    const chaseMult = Math.min(
      BEAR_SPEED_CHASE_MULT + this.chaseTime * BEAR_CHASE_RAMP_RATE,
      BEAR_SPEED_CHASE_MAX
    );
    const multByState: Record<BearState, number> = {
      PATROL: 1.0,
      ALERT: BEAR_SPEED_ALERT_MULT,
      INVESTIGATE: BEAR_SPEED_INVEST_MULT,
      CHASE: chaseMult,
      MEETING: 0,
    };
    const spd = BEAR_SPEED_BASE * multByState[this.state] * this.speedMult;

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
          this.scanDir = Math.random() < 0.5 ? 1 : -1;
        } else {
          // Didn't reach waypoint — just pick a new one
          this.pickNewWaypoint();
        }
        break;

      case 'ALERT':
        this.state = 'INVESTIGATE';
        this.scanTimer = SCAN_DURATION_ALERT;
        this.scanDir = Math.random() < 0.5 ? 1 : -1;
        break;

      case 'INVESTIGATE':
        if (this.searchPointsCount < 2) {
          // Pick a random spot nearby to continue searching
          const angle = Math.random() * Math.PI * 2;
          const dist = 80 + Math.random() * 100;
          const tx = this.x + Math.cos(angle) * dist;
          const ty = this.y + Math.sin(angle) * dist;
          
          // Verify if walkable (simple grid check)
          const mx = Math.floor(tx / TILE_SIZE);
          const my = Math.floor(ty / TILE_SIZE);
          if (this.map[my] && this.map[my][mx] === 0) {
            this.alertTarget = { x: tx, y: ty };
            this.searchPointsCount++;
            this.path = [];
            this.lastPathRefreshMs = 0;
            this.scanTimer = SCAN_DURATION_ALERT; // brief look before moving to next search spot
          } else {
            this.endSearch();
          }
        } else {
          this.endSearch();
        }
        break;


      case 'CHASE':
        if (!this.canSeePlayer && this.lastKnownPlayerPos) {
          // Reached last known pos but player is gone — start searching
          this.setInvestigate(this.x, this.y);
        }
        break;

    }
  }

  private tickAlertTimer(dt: number) {
    if (this.state !== 'ALERT' && this.state !== 'INVESTIGATE') return;
    this.alertTimer -= dt;
    if (this.alertTimer <= 0) {
      this.state = 'PATROL';
      this.alertTarget = null;
      this.pickNewWaypoint();
    }
  }

  private endSearch() {
    this.state = 'PATROL';
    this.alertTarget = null;
    this.searchPointsCount = 0;
    this.pickNewWaypoint();
  }

  public pickNewWaypoint() {

    if (this.waypoints.length <= 1) return;
    let next: number;
    do { next = Math.floor(Math.random() * this.waypoints.length); }
    while (next === this.currentWaypointIndex);
    this.currentWaypointIndex = next;
    this.path = [];
    this.lastPathRefreshMs = 0; // force immediate re-path
  }

  // ── Rendering ────────────────────────────────────────────────────────────────
  draw(ctx: CanvasRenderingContext2D) {
    this.drawVisionCone(ctx);
    this.drawBody(ctx);
  }

  private drawVisionCone(ctx: CanvasRenderingContext2D) {
    const alphas: Record<BearState, number> = {
      PATROL: 0.07, ALERT: 0.18, INVESTIGATE: 0.22, CHASE: 0.30, MEETING: 0.15,
    };
    const colors: Record<BearState, string> = {
      PATROL: `rgba(255,80,80,${alphas.PATROL})`,
      ALERT: `rgba(255,160,0,${alphas.ALERT})`,
      INVESTIGATE: `rgba(255,200,0,${alphas.INVESTIGATE})`,
      CHASE: `rgba(255,0,0,${alphas.CHASE})`,
      MEETING: `rgba(0,255,255,${alphas.MEETING})`,
    };

    ctx.save();
    ctx.fillStyle = colors[this.state];
    ctx.beginPath();

    const poly = VisibilitySystem.getVisiblePolygon(this.x, this.y, this.direction, this.visionAngle, this.visionRange, this.map);
    poly.forEach((p, i) => {
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });

    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  private drawBody(ctx: CanvasRenderingContext2D) {
    const stateColors: Record<BearState, string> = {
      PATROL: '#8B4513',
      ALERT: '#cc6600',
      INVESTIGATE: '#cc9900',
      CHASE: '#cc1100',
      MEETING: '#22aaaa',
    };
    const color = stateColors[this.state];
    const r = this.radius;

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.direction + Math.PI / 2);

    ctx.shadowBlur = this.state === 'CHASE' ? 24 : 10;
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
    ctx.beginPath(); ctx.arc(r * 0.55, -r * 1.65, r * 0.30, 0, Math.PI * 2); ctx.fill();

    // Eye whites
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'white';
    ctx.beginPath(); ctx.arc(-r * 0.28, -r * 1.15, r * 0.18, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(r * 0.28, -r * 1.15, r * 0.18, 0, Math.PI * 2); ctx.fill();

    // Pupils
    ctx.fillStyle = this.state === 'CHASE' ? '#ff0000' : '#111';
    ctx.beginPath(); ctx.arc(-r * 0.28, -r * 1.15, r * 0.10, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(r * 0.28, -r * 1.15, r * 0.10, 0, Math.PI * 2); ctx.fill();

    ctx.restore();
  }

  // ── Detection check (called from GameEngine) ─────────────────────────────────
  checkDetection(player: Player): boolean {
    const dx = player.x - this.x;
    const dy = player.y - this.y;
    const dist = Math.hypot(dx, dy);

    if (dist > this.visionRange) return false;

    // ── New: Line of Sight check ───────────────────────────────────────────────
    if (!VisibilitySystem.hasLineOfSight(this.x, this.y, player.x, player.y, this.map)) {
      return false;
    }

    const angle = Math.atan2(dy, dx);
    let diff = angle - this.direction;
    while (diff < -Math.PI) diff += Math.PI * 2;
    while (diff > Math.PI) diff -= Math.PI * 2;
    return Math.abs(diff) < this.visionAngle / 2;
  }
}
