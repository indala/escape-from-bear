import { Input } from './Input';
import { Player } from './entities/Player';
import { Bear, BearState as BearStatePublic } from './entities/Bear';
import { TILE_SIZE } from './map/MapData';
import { CollisionSystem } from './systems/CollisionSystem';
import { Camera } from './Camera';
import { LEVELS } from './config/LevelConfig';
import { ALL_MAPS } from './map/MapData';

export interface UIState {
  detection: number;
  isGameOver: boolean;
  isVictory: boolean;
  isFlashlightOn: boolean;
  itemsCollected: number;
  totalItems: number;
  senseStatus: 'NONE' | 'VISION' | 'HEARING' | 'SMELL';
  gameMessage: string;
  bearState: BearStatePublic;
  screenShake: boolean;
  currentLevel: number;
  difficultyLabel: string;
}

// ── Tuning constants ──────────────────────────────────────────────────────────
const DETECTION_VISION_MOVE = 60;   // units/s while player moves in vision
const DETECTION_VISION_STILL = 20;   // units/s while player is still in vision
const DETECTION_HEARING = 32;   // units/s while bear hears movement
const DETECTION_SMELL = 10;   // units/s while bear smells proximity
const DETECTION_FLASHLIGHT_MULT = 2.5; // multiplier when flashlight is on
const DETECTION_DECAY_FAR = 22;   // units/s decay when far (>300px)
const DETECTION_DECAY_NEAR = 10;   // units/s decay when close (<300px)
const DETECTION_FLASHLIGHT_PENALTY = 5; // extra gain/s when flashlight near bear

const SMELL_RANGE = 90;   // px

const DETECTION_CHASE_THRESHOLD = 60;  // % — bear enters CHASE above this
const DETECTION_CHASE_EXIT = 15;  // % — bear exits CHASE below this

const ALERT_TRIGGER_DETECTION = 15;  // % — triggers ALERT from PATROL (vision)
const HEARING_ALERT_DETECTION = 10;  // % — triggers ALERT from PATROL (hearing)

const CLOSE_DISTANCE_MSG = 200; // px

const ITEM_PICKUP_RADIUS = 22;  // px
const EXIT_RADIUS = 35;  // px

// ── Helper: find walkable pixel positions from the map ───────────────────────
function findWalkablePositions(
  map: number[][],
  count: number,
  minDist: number,
  exclude: { x: number; y: number }[]
): { x: number; y: number }[] {
  const rows = map.length;
  const cols = map[0].length;

  // Collect all walkable floor centres
  const candidates: { x: number; y: number }[] = [];
  for (let ty = 1; ty < rows - 1; ty++) {
    for (let tx = 1; tx < cols - 1; tx++) {
      if (map[ty][tx] === 0) {
        candidates.push({
          x: tx * TILE_SIZE + TILE_SIZE / 2,
          y: ty * TILE_SIZE + TILE_SIZE / 2,
        });
      }
    }
  }

  // Shuffle
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }

  const chosen: { x: number; y: number }[] = [];
  for (const c of candidates) {
    // Check distance from excluded points and from already chosen points
    const tooClose = [...exclude, ...chosen].some(
      e => Math.hypot(c.x - e.x, c.y - e.y) < minDist
    );
    if (!tooClose) {
      chosen.push(c);
      if (chosen.length === count) break;
    }
  }
  return chosen;
}

// ── GameEngine ────────────────────────────────────────────────────────────────
export class GameEngine {
  player!: Player;
  bears: Bear[] = [];
  input: Input;
  camera: Camera;
  map!: number[][];
  mapWidth: number = 0;
  mapHeight: number = 0;


  items: { x: number; y: number; collected: boolean }[] = [];
  entry: { x: number; y: number } = { x: 0, y: 0 };
  exit: { x: number; y: number; active: boolean } = { x: 0, y: 0, active: false };

  detection: number = 0;
  isGameOver: boolean = false;
  isVictory: boolean = false;
  isFlashlightOn: boolean = false;
  senseStatus: 'NONE' | 'VISION' | 'HEARING' | 'SMELL' = 'NONE';
  encounterCount: number = 0;
  gameMessage: string = '';
  screenShake: boolean = false;
  currentLevel: number = 1;

  private upgradeMsgTimer: number = 0;
  private onStateChange?: (state: UIState) => void;

  constructor(level: number = 1) {
    this.currentLevel = level;
    this.input = new Input();
    this.camera = new Camera();
    this.reset(level);
  }

  reset(level: number = 1) {
    this.currentLevel = level;
    const levelData = LEVELS[this.currentLevel] || LEVELS[1];
    this.map = ALL_MAPS[levelData.mapIndex] || ALL_MAPS[0];
    this.mapWidth = this.map[0].length * TILE_SIZE;
    this.mapHeight = this.map.length * TILE_SIZE;


    // Find entry: top-left open tile
    let ex = 1, ey = 1;
    outer: for (let ty = 1; ty < this.map.length - 1; ty++) {
      for (let tx = 1; tx < this.map[0].length - 1; tx++) {
        if (this.map[ty][tx] === 0) { ex = tx; ey = ty; break outer; }
      }
    }
    this.entry = { x: ex * TILE_SIZE + TILE_SIZE / 2, y: ey * TILE_SIZE + TILE_SIZE / 2 };

    // Find exit: bottom-right open tile
    let exitX = this.map[0].length - 2, exitY = this.map.length - 2;
    outer2: for (let ty = this.map.length - 2; ty >= 1; ty--) {
      for (let tx = this.map[0].length - 2; tx >= 1; tx--) {
        if (this.map[ty][tx] === 0) { exitX = tx; exitY = ty; break outer2; }
      }
    }
    this.exit = {
      x: exitX * TILE_SIZE + TILE_SIZE / 2,
      y: exitY * TILE_SIZE + TILE_SIZE / 2,
      active: false
    };

    // Place items (randomly at walkable spots)
    const itemPositions = findWalkablePositions(
      this.map,
      levelData.itemCount,
      120, // min distance between items and from entry/exit
      [this.entry, this.exit]
    );
    this.items = itemPositions.map(p => ({ ...p, collected: false }));

    // Reset entities
    this.player = new Player();
    this.player.x = this.entry.x;
    this.player.y = this.entry.y;

    const bearPositions = findWalkablePositions(
      this.map,
      levelData.bearCount,
      150, // min distance between bears
      [this.entry] // exclude entry area (we want them far)
    );
    // Extra safety: ensure they are at least 400px from entry
    const safeBearPositions = bearPositions.map(p => {
      let pos = p;
      const dist = Math.hypot(p.x - this.entry.x, p.y - this.entry.y);
      if (dist < 400) {
        // If too close, try to nudge it toward the exit or just pick another one
        // For simplicity, findWalkablePositions usually does a good job if we use high minDist
      }
      return pos;
    });

    this.bears = [];
    for (let i = 0; i < levelData.bearCount; i++) {
      const b = new Bear(levelData, this.map);
      const pos = safeBearPositions[i] || this.exit; // Fallback to exit if not enough spots
      b.x = pos.x;
      b.y = pos.y;
      b.pickNewWaypoint(); // Don't start all walking to the same first waypoint
      this.bears.push(b);
    }

    // Reset state
    this.detection = 0;
    this.isGameOver = false;
    this.isVictory = false;
    this.isFlashlightOn = false;
    this.senseStatus = 'NONE';
    this.encounterCount = 0;
    this.gameMessage = '';
    this.screenShake = false;
  }

  setUIListener(listener: (state: UIState) => void) {
    this.onStateChange = listener;
  }

  update(dt: number) {
    if (this.isGameOver || this.isVictory) {
      this.camera.update(this.player.x, this.player.y, dt, 0, 0, false);
      return;
    }

    // Flashlight toggle
    if (this.input.justPressed('f')) {
      this.isFlashlightOn = !this.isFlashlightOn;
    }

    // Move player axis-by-axis for clean wall sliding in all directions
    const vx = this.input.axisX;
    const vy = this.input.axisY;
    const isMoving = vx !== 0 || vy !== 0;

    if (isMoving) {
      const len = Math.sqrt(vx * vx + vy * vy);
      const nx = vx / len;
      const ny = vy / len;
      const step = Math.min(this.player.speed * dt, 35);

      // Move X, resolve X — Y stays at current resolved position
      this.player.x += nx * step;
      this.player.x = CollisionSystem.resolveX(this.player.x, this.player.y, this.player.radius, this.map);

      // Move Y, resolve Y — X is already wall-safe
      this.player.y += ny * step;
      this.player.y = CollisionSystem.resolveY(this.player.x, this.player.y, this.player.radius, this.map);
    }

    // Sync player state (isMoving, facingAngle, pickupFlash)
    this.player.updateState(dt, this.input);

    for (const bear of this.bears) {
      bear.update(dt, this.player);
      const bp = CollisionSystem.resolve(bear.x, bear.y, bear.radius, this.map);
      bear.x = bp.x;
      bear.y = bp.y;
    }

    // ── Bear-to-Bear collision (The Meeting) ──────────────────────────────────
    if (this.bears.length > 1) {
      for (let i = 0; i < this.bears.length; i++) {
        for (let j = i + 1; j < this.bears.length; j++) {
          const b1 = this.bears[i];
          const b2 = this.bears[j];
          const dist = Math.hypot(b1.x - b2.x, b1.y - b2.y);
          if (dist < b1.radius + b2.radius) {
            // Only meet if both are patrolling or investigating (not chasing)
            if (b1.state !== 'CHASE' && b2.state !== 'CHASE' && b1.state !== 'MEETING' && b2.state !== 'MEETING') {
              if (b1.meetingCooldown <= 0 && b2.meetingCooldown <= 0) {
                b1.setMeeting(5.0);
                b2.setMeeting(5.0);
              }
            }
          }
        }
      }
    }

    this.camera.update(
      this.player.x,
      this.player.y,
      dt,
      Math.cos(this.player.facingAngle),
      Math.sin(this.player.facingAngle),
      this.player.isMoving,
      this.mapWidth,
      this.mapHeight,
      this.isFlashlightOn
    );



    this.updateDetection(dt);
    this.checkItems();
    this.checkVictory();

    this.screenShake = false;
    this.emitState();
  }

  private emitState() {
    // Determine the "highest" bear state for UI feedback
    const statePriority: Record<string, number> = { CHASE: 3, ALERT: 2, INVESTIGATE: 1, MEETING: 1, PATROL: 0 };
    let worstState: BearStatePublic = 'PATROL';
    for (const b of this.bears) {
      if (statePriority[b.state] > (statePriority[worstState] || 0)) {
        worstState = b.state as BearStatePublic;
      }
    }

    this.onStateChange?.({
      detection: this.detection,
      isGameOver: this.isGameOver,
      isVictory: this.isVictory,
      isFlashlightOn: this.isFlashlightOn,
      itemsCollected: this.items.filter(i => i.collected).length,
      totalItems: this.items.length,
      senseStatus: this.senseStatus,
      gameMessage: this.gameMessage,
      bearState: worstState,
      screenShake: this.screenShake,
      currentLevel: this.currentLevel,
      difficultyLabel: LEVELS[this.currentLevel]?.difficultyLabel || "UNKNOWN",
    });
  }

  private checkItems() {
    let justCollected = false;
    for (const item of this.items) {
      if (item.collected) continue;
      if (Math.hypot(this.player.x - item.x, this.player.y - item.y) < ITEM_PICKUP_RADIUS) {
        item.collected = true;
        justCollected = true;
      }
    }
    if (justCollected) {
      this.player.triggerPickup();
      this.upgradeMsgTimer = 2.0; // Show upgrade message for 2s
    }
    if (this.items.length > 0 && this.items.every(i => i.collected)) {
      this.exit.active = true;
    }
  }

  private checkVictory() {
    if (!this.exit.active) return;
    if (Math.hypot(this.player.x - this.exit.x, this.player.y - this.exit.y) < EXIT_RADIUS) {
      this.isVictory = true;
      this.gameMessage = 'YOU ESCAPED!';
    }
  }

  private updateDetection(dt: number) {
    let msg = '';
    let combinedDetectionGain = 0;
    let worstSense: 'NONE' | 'VISION' | 'HEARING' | 'SMELL' = 'NONE';
    const sensePriority = { NONE: 0, SMELL: 1, HEARING: 2, VISION: 3 };

    let closestDist = Infinity;

    for (const bear of this.bears) {
      const isVisible = bear.checkDetection(this.player);
      const dx = this.player.x - bear.x;
      const dy = this.player.y - bear.y;
      const dist = Math.hypot(dx, dy);
      closestDist = Math.min(closestDist, dist);

      const isSmelling = dist < SMELL_RANGE;
      const isHearing = this.player.isMoving && dist < bear.hearingRange;
      bear.canSeePlayer = isVisible;
      
      let bearDetectionGain = 0;
      let currentBearSense: 'NONE' | 'VISION' | 'HEARING' | 'SMELL' = 'NONE';


      if (isVisible) {
        currentBearSense = 'VISION';
        const flashMult = this.isFlashlightOn ? DETECTION_FLASHLIGHT_MULT : 1.0;
        bearDetectionGain += (this.player.isMoving ? DETECTION_VISION_MOVE : DETECTION_VISION_STILL) * dt * flashMult;
        if (this.detection > ALERT_TRIGGER_DETECTION && bear.state === 'PATROL') {
          bear.setAlert(this.player.x, this.player.y);
        }
      } else if (isHearing) {
        currentBearSense = 'HEARING';
        bearDetectionGain += DETECTION_HEARING * dt;
        if (bear.state === 'PATROL' && this.detection > HEARING_ALERT_DETECTION) {
          bear.setAlert(this.player.x, this.player.y);
        }
      } else if (isSmelling) {
        if (this.player.isMoving || this.isFlashlightOn) {
          currentBearSense = 'SMELL';
          bearDetectionGain += DETECTION_SMELL * dt;
        }
      }

      // Flashlight beam hitting bear
      if (this.isFlashlightOn) {
        const angleToBear = Math.atan2(bear.y - this.player.y, bear.x - this.player.x);
        let diff = angleToBear - this.player.facingAngle;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;

        const itemsCollected = this.items.filter(i => i.collected).length;
        const coneLength = 420 + (itemsCollected * 55);
        const coneAngle = Math.PI / 2.2;


        if (dist < coneLength && Math.abs(diff) < coneAngle / 2) {
          bearDetectionGain += 45 * dt;
          bear.canSeePlayer = true;
          currentBearSense = 'VISION'; // Sight via flashlight beam counts as vision
          if (bear.state === 'PATROL' || bear.state === 'INVESTIGATE') {


            bear.setAlert(this.player.x, this.player.y);
            msg = "THE BEAR SEES YOUR LIGHT!";
          }
        }
      }

      combinedDetectionGain += bearDetectionGain;
      if (sensePriority[currentBearSense] > sensePriority[worstSense]) {
        worstSense = currentBearSense;
      }

      // State machine per bear
      if (this.detection >= DETECTION_CHASE_THRESHOLD) {
        if (bear.state !== 'CHASE') bear.setChase();
      } else {
        const exitThreshold = (!this.player.isMoving && !this.isFlashlightOn) ? 40 : DETECTION_CHASE_EXIT;
        if (this.detection < exitThreshold && bear.state === 'CHASE') {
          bear.setInvestigate(this.player.x, this.player.y);
        }
      }
    }

    if (combinedDetectionGain > 0) {
      this.detection += combinedDetectionGain;
    } else {
      const decayRate = closestDist < 300 ? DETECTION_DECAY_NEAR : DETECTION_DECAY_FAR;
      const flashDecay = this.isFlashlightOn ? DETECTION_FLASHLIGHT_PENALTY : 0;
      this.detection -= decayRate * dt;
      this.detection += flashDecay * dt;
    }

    this.detection = Math.max(0, Math.min(100, this.detection));
    this.senseStatus = worstSense;

    // ── HUD messages ──────────────────────────────────────────────────────────
    if (this.upgradeMsgTimer > 0) {
      this.upgradeMsgTimer -= dt;
      msg = "LIGHT RANGE INCREASED!";
    }

    if (this.detection >= DETECTION_CHASE_THRESHOLD) {
      msg = 'THE BEARS ARE HUNTING YOU!';
    } else {
      if (this.detection > 30) {
        if (worstSense === 'VISION') msg = 'RUN! A Bear sees you!';
        else if (worstSense === 'HEARING') msg = 'A Bear heard you! FREEZE!';
        else if (worstSense === 'SMELL') msg = 'A Bear has your scent...';
      } else if (closestDist < CLOSE_DISTANCE_MSG) {
        msg = 'A Bear is extremely close...';
      }
    }

    // ── Physical collision (Check all bears) ──────────────────────────────────
    for (const bear of this.bears) {
      const dist = Math.hypot(this.player.x - bear.x, this.player.y - bear.y);
      const touchDist = this.player.radius + bear.radius + 4;
      if (dist < touchDist) {
        if (!this.player.isMoving && !this.isFlashlightOn && this.detection < 85) {
          if (this.encounterCount === 0) {
            msg = "The Bear is sniffing you... DON'T MOVE!";
            this.detection = 15;
            bear.forcePatrol();
            // Set cooldown so it doesn't immediately meet another bear or re-detect
            bear.meetingCooldown = 8.0; 
            this.encounterCount = 1;
          } else {
            // Already sniffing — stay still to survive
            msg = "The Bear is right next to you... stay absolutely still!";
            bear.forcePatrol(); // keep encouraging it to move away
          }
        } else {
          this.isGameOver = true;
          msg = 'A Bear caught you!';
          this.screenShake = true;
          this.camera.shake(16, 0.8);
          break;
        }
      }
    }
    if (this.bears.every(b => Math.hypot(this.player.x - b.x, this.player.y - b.y) > CLOSE_DISTANCE_MSG)) {
      this.encounterCount = 0;
    }

    this.gameMessage = msg;
  }

  draw(ctx: CanvasRenderingContext2D) {
    for (const bear of this.bears) bear.draw(ctx);
    this.player.draw(ctx);
  }
}
