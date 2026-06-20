'use client';

import { useEffect, useRef } from 'react';

export function MiniMap({
  playerX,
  playerY,
  exitX,
  exitY,
  mapWidth,
  mapHeight,
  bears = []
}: {
  playerX: number;
  playerY: number;
  exitX: number;
  exitY: number;
  mapWidth: number;
  mapHeight: number;
  bears?: { x: number; y: number }[];
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const size = 120; // Mini-map size in pixels

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, size, size);

    // Calculate scale to fit map in mini-map
    const scaleX = size / mapWidth;
    const scaleY = size / mapHeight;
    const scale = Math.min(scaleX, scaleY);

    // Calculate offset to center the map
    const offsetX = (size - mapWidth * scale) / 2;
    const offsetY = (size - mapHeight * scale) / 2;

    // Draw map background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.fillRect(0, 0, size, size);

    // Draw exit (red)
    const exitScreenX = exitX * scale + offsetX;
    const exitScreenY = exitY * scale + offsetY;
    ctx.fillStyle = 'rgba(255, 50, 50, 0.8)';
    ctx.beginPath();
    ctx.arc(exitScreenX, exitScreenY, 4, 0, Math.PI * 2);
    ctx.fill();

    // Draw bears (yellow)
    ctx.fillStyle = 'rgba(255, 200, 0, 0.8)';
    for (const bear of bears) {
      const bearScreenX = bear.x * scale + offsetX;
      const bearScreenY = bear.y * scale + offsetY;
      ctx.beginPath();
      ctx.arc(bearScreenX, bearScreenY, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw player (cyan)
    const playerScreenX = playerX * scale + offsetX;
    const playerScreenY = playerY * scale + offsetY;
    ctx.fillStyle = 'rgba(0, 245, 212, 0.9)';
    ctx.beginPath();
    ctx.arc(playerScreenX, playerScreenY, 5, 0, Math.PI * 2);
    ctx.fill();

    // Draw player direction indicator
    ctx.strokeStyle = 'rgba(0, 245, 212, 0.7)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(playerScreenX, playerScreenY);
    ctx.lineTo(
      playerScreenX + Math.cos(0) * 8, // Using 0 angle for now
      playerScreenY + Math.sin(0) * 8
    );
    ctx.stroke();

  }, [playerX, playerY, exitX, exitY, mapWidth, mapHeight, bears]);

  return (
    <div className="relative w-[120px] h-[120px] rounded-lg overflow-hidden border border-white/10">
      <canvas
        ref={canvasRef}
        width={size}
        height={size}
        className="w-full h-full bg-black/20"
      />
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1 left-1 text-[8px] font-bold uppercase tracking-wider text-white/50">
          Mini Map
        </div>
      </div>
    </div>
  );
}
