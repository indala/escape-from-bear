export interface LevelData {
  bearCount: number;
  itemCount: number;
  visionRange: number;
  visionAngle: number;
  mapIndex: number;
  bearSpeedMult: number;   // Multiplier for BEAR_SPEED_BASE
  hearingRange: number;    // px
  difficultyLabel: string; // e.g. "EASY", "PREDATOR"
}

export const LEVELS: Record<number, LevelData> = {
  1: { 
    bearCount: 1, itemCount: 4, visionRange: 260, visionAngle: Math.PI / 2.3, mapIndex: 0, 
    bearSpeedMult: 1.0, hearingRange: 180, difficultyLabel: "EASY" 
  },
  2: { 
    bearCount: 1, itemCount: 5, visionRange: 280, visionAngle: Math.PI / 2.2, mapIndex: 0,
    bearSpeedMult: 1.1, hearingRange: 200, difficultyLabel: "EASY"
  },
  3: { 
    bearCount: 2, itemCount: 6, visionRange: 300, visionAngle: Math.PI / 2.1, mapIndex: 0,
    bearSpeedMult: 1.15, hearingRange: 210, difficultyLabel: "NORMAL"
  },
  4: { 
    bearCount: 2, itemCount: 6, visionRange: 320, visionAngle: Math.PI / 2.0, mapIndex: 1,
    bearSpeedMult: 1.2, hearingRange: 220, difficultyLabel: "NORMAL"
  },
  5: { 
    bearCount: 2, itemCount: 8, visionRange: 340, visionAngle: Math.PI / 1.9, mapIndex: 1,
    bearSpeedMult: 1.25, hearingRange: 240, difficultyLabel: "STALKER"
  },
  6: { 
    bearCount: 3, itemCount: 8, visionRange: 360, visionAngle: Math.PI / 1.8, mapIndex: 1,
    bearSpeedMult: 1.3, hearingRange: 260, difficultyLabel: "STALKER"
  },
  7: { 
    bearCount: 3, itemCount: 10, visionRange: 380, visionAngle: Math.PI / 1.7, mapIndex: 2,
    bearSpeedMult: 1.35, hearingRange: 280, difficultyLabel: "ELITE"
  },
  8: { 
    bearCount: 4, itemCount: 12, visionRange: 400, visionAngle: Math.PI / 1.6, mapIndex: 2,
    bearSpeedMult: 1.4, hearingRange: 300, difficultyLabel: "ELITE"
  },
  9: { 
    bearCount: 5, itemCount: 15, visionRange: 440, visionAngle: Math.PI / 1.4, mapIndex: 2,
    bearSpeedMult: 1.5, hearingRange: 340, difficultyLabel: "PREDATOR"
  },
  10: { 
    bearCount: 6, itemCount: 20, visionRange: 500, visionAngle: Math.PI / 1.1, mapIndex: 2,
    bearSpeedMult: 1.7, hearingRange: 400, difficultyLabel: "NIGHTMARE"
  },
};

