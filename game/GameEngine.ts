import { Input } from './Input';
import { Player } from './entities/Player';
import { Bear } from './entities/Bear';
import { LEVEL1_MAP, TILE_SIZE } from './map/Level1';
import { CollisionSystem } from './systems/CollisionSystem';
import { Camera } from './Camera';

export type BearStatePublic = 'PATROL' | 'ALERT' | 'INVESTIGATE' | 'CHASE';

export interface UIState {
  detection:      number;
  isGameOver:     boolean;
  isVictory:      boolean;
  isFlashlightOn: boolean;
  itemsCollected: number;
  totalItems:     number;
  senseStatus:    'NONE' | 'VISION' | 'HEARING' | 'SMELL';
  gameMessage:    string;
  bearState:      BearStatePublic;
  screenShake:    boolean;
}

// ── Tuning constants ──────────────────────────────────────────────────────────
const DETECTION_VISION_MOVE    = 60;   // units/s while player moves in vision
const DETECTION_VISION_STILL   = 20;   // units/s while player is still in vision
const DETECTION_HEARING        = 32;   // units/s while bear hears movement
const DETECTION_SMELL          = 10;   // units/s while bear smells proximity
const DETECTION_FLASHLIGHT_MULT = 2.5; // multiplier when flashlight is on
const DETECTION_DECAY_FAR      = 22;   // units/s decay when far (>300px)
const DETECTION_DECAY_NEAR     = 10;   // units/s decay when close (<300px)
const DETECTION_FLASHLIGHT_PENALTY = 5; // extra gain/s when flashlight near bear

const SMELL_RANGE   = 90;   // px
const HEARING_RANGE = 220;  // px

const DETECTION_CHASE_THRESHOLD = 60;  // % — bear enters CHASE above this
const DETECTION_CHASE_EXIT      = 15;  // % — bear exits CHASE below this

const ALERT_TRIGGER_DETECTION   = 15;  // % — triggers ALERT from PATROL (vision)
const HEARING_ALERT_DETECTION   = 10;  // % — triggers ALERT from PATROL (hearing)

const CLOSE_DISTANCE_MSG        = 200; // px

const ITEM_COUNT                = 5;   // number of collectibles to place
const ITEM_PICKUP_RADIUS        = 22;  // px
const EXIT_RADIUS               = 35;  // px

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
  bear!:   Bear;
  input:   Input;
  camera:  Camera;
  map:     number[][] = LEVEL1_MAP;

  items:   { x: number; y: number; collected: boolean }[] = [];
  entry:   { x: number; y: number } = { x: 0, y: 0 };
  exit:    { x: number; y: number; active: boolean } = { x: 0, y: 0, active: false };

  detection:      number  = 0;
  isGameOver:     boolean = false;
  isVictory:      boolean = false;
  isFlashlightOn: boolean = false;
  senseStatus:    'NONE' | 'VISION' | 'HEARING' | 'SMELL' = 'NONE';
  encounterCount: number  = 0;
  gameMessage:    string  = '';
  screenShake:    boolean = false;

  private upgradeMsgTimer:  number  = 0;
  private onStateChange?: (state: UIState) => void;

  constructor() {
    this.input  = new Input();
    this.camera = new Camera();
    this.reset();
  }

  reset() {
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
      x:      exitX * TILE_SIZE + TILE_SIZE / 2,
      y:      exitY * TILE_SIZE + TILE_SIZE / 2,
      active: false,
    };

    // Place items dynamically on walkable tiles, away from entry/exit
    const itemPositions = findWalkablePositions(
      this.map,
      ITEM_COUNT,
      120, // min distance between items and from entry/exit
      [this.entry, this.exit]
    );
    this.items = itemPositions.map(p => ({ ...p, collected: false }));

    // Reset entities
    this.player = new Player();
    this.player.x = this.entry.x;
    this.player.y = this.entry.y;

    this.bear = new Bear();

    // Reset state
    this.detection      = 0;
    this.isGameOver     = false;
    this.isVictory      = false;
    this.isFlashlightOn = false;
    this.senseStatus    = 'NONE';
    this.encounterCount = 0;
    this.gameMessage    = '';
    this.screenShake    = false;
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

    this.bear.update(dt, this.player);
    const bp = CollisionSystem.resolve(this.bear.x, this.bear.y, this.bear.radius, this.map);
    this.bear.x = bp.x;
    this.bear.y = bp.y;

    this.camera.update(
      this.player.x,
      this.player.y,
      dt,
      Math.cos(this.player.facingAngle),
      Math.sin(this.player.facingAngle),
      this.player.isMoving,
      this.player.facingAngle,
    );

    this.updateDetection(dt);
    this.checkItems();
    this.checkVictory();

    this.screenShake = false;
    this.emitState();
  }

  private emitState() {
    this.onStateChange?.({
      detection:      this.detection,
      isGameOver:     this.isGameOver,
      isVictory:      this.isVictory,
      isFlashlightOn: this.isFlashlightOn,
      itemsCollected: this.items.filter(i => i.collected).length,
      totalItems:     this.items.length,
      senseStatus:    this.senseStatus,
      gameMessage:    this.gameMessage,
      bearState:      this.bear.state,
      screenShake:    this.screenShake,
    });
  }

  private checkItems() {
    let justCollected = false;
    for (const item of this.items) {
      if (item.collected) continue;
      if (Math.hypot(this.player.x - item.x, this.player.y - item.y) < ITEM_PICKUP_RADIUS) {
        item.collected   = true;
        justCollected    = true;
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
      this.isVictory   = true;
      this.gameMessage = 'YOU ESCAPED!';
    }
  }

  private updateDetection(dt: number) {
    let msg = '';
    const isVisible = this.bear.checkDetection(this.player);
    const dx        = this.player.x - this.bear.x;
    const dy        = this.player.y - this.bear.y;
    const dist      = Math.hypot(dx, dy);

    const isSmelling = dist < SMELL_RANGE;
    const isHearing  = this.player.isMoving && dist < HEARING_RANGE;

    let currentSense: 'NONE' | 'VISION' | 'HEARING' | 'SMELL' = 'NONE';
    let detectionGain = 0;

    if (isVisible) {
      currentSense   = 'VISION';
      const flashMult = this.isFlashlightOn ? DETECTION_FLASHLIGHT_MULT : 1.0;
      detectionGain  += (this.player.isMoving ? DETECTION_VISION_MOVE : DETECTION_VISION_STILL) * dt * flashMult;
      if (this.detection > ALERT_TRIGGER_DETECTION && this.bear.state === 'PATROL') {
        this.bear.setAlert(this.player.x, this.player.y);
      }
    } else if (isHearing) {
      currentSense  = 'HEARING';
      detectionGain += DETECTION_HEARING * dt;
      if (this.bear.state === 'PATROL' && this.detection > HEARING_ALERT_DETECTION) {
        this.bear.setAlert(this.player.x, this.player.y);
      }
    } else if (isSmelling) {
      // Only smell if player is moving OR light is on (represents panic/heavy breathing)
      if (this.player.isMoving || this.isFlashlightOn) {
        currentSense  = 'SMELL';
        detectionGain += DETECTION_SMELL * dt;
      }
    }

    // ── Flashlight beam hitting bear (Alerts the bear!) ───────────────────────
    if (this.isFlashlightOn) {
      const angleToBear = Math.atan2(this.bear.y - this.player.y, this.bear.x - this.player.x);
      let diff = angleToBear - this.player.facingAngle;
      while (diff < -Math.PI) diff += Math.PI * 2;
      while (diff > Math.PI)  diff -= Math.PI * 2;

      const itemsCollected = this.items.filter(i => i.collected).length;
      const coneLength = 280 + (itemsCollected * 50);
      const coneAngle  = Math.PI / 3.5;

      if (dist < coneLength && Math.abs(diff) < coneAngle / 2) {
        // Flashlight hit the bear!
        detectionGain += 45 * dt; // Rapid detection increase
        if (this.bear.state === 'PATROL' || this.bear.state === 'INVESTIGATE') {
          this.bear.setAlert(this.player.x, this.player.y);
          msg = "THE BEAR SEES YOUR LIGHT!";
        }
      }
    }

    if (detectionGain > 0) {
      this.detection += detectionGain;
    } else {
      const decayRate = dist < 300 ? DETECTION_DECAY_NEAR : DETECTION_DECAY_FAR;
      const flashDecay = this.isFlashlightOn ? DETECTION_FLASHLIGHT_PENALTY : 0;
      this.detection -= decayRate * dt;
      this.detection += flashDecay * dt; // flashlight hurts even while idle
    }

    this.detection = Math.max(0, Math.min(100, this.detection));
    this.senseStatus = currentSense;

    // ── State machine ──────────────────────────────────────────────────────────
    if (this.detection >= DETECTION_CHASE_THRESHOLD) {
      if (this.bear.state !== 'CHASE') this.bear.setChase();
    } else {
      // Exit CHASE faster if hiding
      const exitThreshold = (!this.player.isMoving && !this.isFlashlightOn) ? 40 : DETECTION_CHASE_EXIT;
      if (this.detection < exitThreshold && this.bear.state === 'CHASE') {
        this.bear.setInvestigate(this.player.x, this.player.y);
      }
    }

    // ── HUD messages ──────────────────────────────────────────────────────────

    // Handle upgrade message priority
    if (this.upgradeMsgTimer > 0) {
      this.upgradeMsgTimer -= dt;
      msg = "LIGHT RANGE INCREASED!";
    }

    if (this.detection >= DETECTION_CHASE_THRESHOLD) {
      msg = 'THE BEAR IS HUNTING YOU!';
    } else {
      if (this.detection > 30) {
        if (currentSense === 'VISION')   msg = 'RUN! The Bear sees you!';
        else if (currentSense === 'HEARING') msg = 'The Bear heard you! FREEZE!';
        else if (currentSense === 'SMELL')   msg = 'The Bear has your scent...';
      } else if (dist < CLOSE_DISTANCE_MSG) {
        msg = 'The Bear is extremely close...';
      }
    }

    // ── Physical collision ─────────────────────────────────────────────────────
    const touchDist = this.player.radius + this.bear.radius + 4;
    if (dist < touchDist) {
      // Mercy rule: if perfectly still and light off, bear just sniffs and leaves
      if (!this.player.isMoving && !this.isFlashlightOn && this.detection < 85) {
        if (this.encounterCount === 0) {
           msg = "The Bear is sniffing you... DON'T MOVE!";
           this.detection = 20; // Drop detection so it leaves
           this.bear.forcePatrol(); // Make it actually walk away
           this.encounterCount = 1; 
        }
      } else {
        this.isGameOver    = true;
        msg                = 'The Bear caught you!';
        this.screenShake   = true;
        this.camera.shake(16, 0.8);
      }
    } else {
      // Reset encounter count when bear leaves
      this.encounterCount = 0;
    }

    this.gameMessage = msg;
  }

  draw(ctx: CanvasRenderingContext2D) {
    this.bear.draw(ctx);
    this.player.draw(ctx);
  }
}
