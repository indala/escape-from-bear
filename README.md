# Escape From Bear

A survival game where you must escape from aggressive bears in a maze-like environment.

## Project Structure

```
escape-from-bear/
├── app/
│   └── page.tsx              # Main game page
├── game/
│   ├── entities/
│   │   ├── Bear.ts           # Bear AI and behavior
│   │   └── Player.ts          # Player character
│   ├── systems/
│   │   ├── CollisionSystem.ts # Collision detection
│   │   ├── Pathfinder.ts      # Pathfinding (A* algorithm)
│   │   └── VisibilitySystem.ts # Line of sight and vision cones
│   ├── GameEngine.ts          # Main game logic
│   ├── GameLoop.ts            # Game loop management
│   ├── Renderer.ts            # Rendering system
│   ├── config/
│   │   └── LevelConfig.ts      # Game levels and difficulty
│   └── map/
│       └── MapData.ts          # Map data and constants
├── package.json              # Project configuration
└── README.md                 # This file
```

## Key Improvements

### 1. Fixed Bear Chasing Logic
- **Bear.ts:270** - Fixed `currentTarget` method to properly use last known player position when in CHASE state
- Bears now correctly track and chase players even when temporarily out of line of sight

### 2. Performance Optimizations
- **Pathfinder.ts:204** - Replaced `queue.shift()` with manual queue management for O(1) dequeue operations
- **VisibilitySystem.ts** - Added raycast caching to avoid redundant calculations
- **GameEngine.ts** - Pre-calculated player position to avoid repeated property access

### 3. Code Quality Improvements
- Fixed package.json name from "python-notes" to "escape-from-bear"
- Optimized detection logic with better variable scoping
- Reduced redundant calculations in flashlight detection

## Game Features

- **Bear AI**: Multiple bears with different behaviors (patrol, alert, investigate, chase)
- **Vision System**: Line of sight checks and vision cones
- **Pathfinding**: A* algorithm with 8-directional movement
- **Flashlight**: Dynamic lighting system that affects bear detection
- **Items**: Collectible items that increase flashlight range
- **Multiple Levels**: Progressive difficulty with increasing bear aggression

## Controls

- Arrow keys or WASD: Move player
- F: Toggle flashlight

## How to Play

1. Navigate through the maze to find and collect all items
2. Avoid detection by bears using walls and shadows
3. Use the flashlight strategically to see bears and deter them
4. Reach the exit to escape!

## Technical Details

- **Engine**: Built with TypeScript and Next.js
- **Rendering**: Canvas 2D API with WebGL-like optimizations
- **Physics**: Axis-separated collision resolution
- **Performance**: Optimized for smooth gameplay at 60fps
