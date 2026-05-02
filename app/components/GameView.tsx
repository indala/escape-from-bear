'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { GameEngine } from '@/game/GameEngine';
import { Renderer } from '@/game/Renderer';
import { GameLoop } from '@/game/GameLoop';
import { AudioManager } from '@/game/AudioManager';

type BearState = 'PATROL' | 'ALERT' | 'INVESTIGATE' | 'CHASE' | 'MEETING';


export default function GameView() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const loopRef = useRef<GameLoop | null>(null);
  const audioRef = useRef<AudioManager | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const prevItemsRef = useRef(0);
  const prevBearStateRef = useRef<BearState>('PATROL');
  const gameOverSoundedRef = useRef(false);
  const victorySoundedRef = useRef(false);

  const [detection, setDetection] = useState(0);
  const [isGameOver, setIsGameOver] = useState(false);
  const [isVictory, setIsVictory] = useState(false);
  const [isMoving, setIsMoving] = useState(false);
  const [isFlashlightOn, setIsFlashlightOn] = useState(false);
  const [senseStatus, setSenseStatus] = useState<'NONE' | 'VISION' | 'HEARING' | 'SMELL'>('NONE');
  const [gameMessage, setGameMessage] = useState('');
  const [items, setItems] = useState({ collected: 0, total: 5 });
  const [bearState, setBearState] = useState<BearState>('PATROL');
  const [currentLevel, setCurrentLevel] = useState(1);
  const [difficultyLabel, setDifficultyLabel] = useState('EASY');
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const [joystickPos, setJoystickPos] = useState({ x: 0, y: 0 });
  const [joystickBase, setJoystickBase] = useState({ x: 0, y: 0 });
  const [isJoystickActive, setIsJoystickActive] = useState(false);
  const joystickTouchId = useRef<number | null>(null);
  const JOYSTICK_RADIUS = 64; // half of the base size

  const startGame = useCallback((level: number = 1) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    loopRef.current?.stop();
    engineRef.current?.input.destroy();

    const engine = new GameEngine(level);
    const renderer = rendererRef.current ?? new Renderer(canvas);
    const audio = audioRef.current ?? new AudioManager();

    engineRef.current = engine;
    rendererRef.current = renderer;
    audioRef.current = audio;
    prevItemsRef.current = 0;
    gameOverSoundedRef.current = false;
    victorySoundedRef.current = false;

    setDetection(0); setIsGameOver(false); setIsVictory(false);
    setIsMoving(false); setIsFlashlightOn(false); setSenseStatus('NONE');
    setGameMessage(''); setItems({ collected: 0, total: 5 }); setBearState('PATROL');
    setDifficultyLabel('EASY');
    setCurrentLevel(level);

    engine.setUIListener((state) => {
      setDetection(state.detection);
      setIsGameOver(state.isGameOver);
      setIsVictory(state.isVictory);
      setIsMoving(engine.player.isMoving);
      setIsFlashlightOn(state.isFlashlightOn);
      setSenseStatus(state.senseStatus);
      setGameMessage(state.gameMessage);
      setItems({ collected: state.itemsCollected, total: state.totalItems });
      setBearState(state.bearState as BearState);
      setCurrentLevel(state.currentLevel);
      setDifficultyLabel(state.difficultyLabel);

      if (state.itemsCollected > prevItemsRef.current) {
        audio.playPickup();
        prevItemsRef.current = state.itemsCollected;
      }
      if (state.bearState !== prevBearStateRef.current) {
        prevBearStateRef.current = state.bearState as BearState;
      }
      if (state.isGameOver && !gameOverSoundedRef.current) {
        gameOverSoundedRef.current = true;
        audio.playGameOver();
      }
      if (state.isVictory && !victorySoundedRef.current) {
        victorySoundedRef.current = true;
        audio.playVictory();
      }
      audio.update(state.detection, engine.player.isMoving, state.bearState);
    });

    const container = containerRef.current;
    if (container) {
      const w = window.innerWidth;
      const h = window.innerHeight;
      engine.camera.resize(w, h);
      renderer.resize(w, h);
    }

    const loop = new GameLoop(
      (dt) => engine.update(dt),
      () => renderer.render(engine)
    );
    loopRef.current = loop;
    loop.start();
  }, []);

  useEffect(() => {
    setIsTouchDevice('ontouchstart' in window || navigator.maxTouchPoints > 0);
    startGame(1);

    const handleResize = () => {
      const engine = engineRef.current;
      const renderer = rendererRef.current;
      if (engine && renderer) {
        const w = window.innerWidth;
        const h = window.innerHeight;
        if (w > 0 && h > 0) {
          engine.camera.resize(w, h);
          renderer.resize(w, h);
        }
      }
    };

    const ro = new ResizeObserver(handleResize);
    if (containerRef.current) ro.observe(containerRef.current);
    setTimeout(handleResize, 100);
    return () => { loopRef.current?.stop(); ro.disconnect(); };
  }, [startGame]);

  // ── Floating joystick handlers ─────────────────────────────────────────────
  const handleJoystickStart = (e: React.TouchEvent) => {
    e.preventDefault();
    const touch = e.changedTouches[0];
    joystickTouchId.current = touch.identifier;
    setJoystickBase({ x: touch.clientX, y: touch.clientY });
    setJoystickPos({ x: 0, y: 0 });
    setIsJoystickActive(true);
    // Haptic feedback
    if (navigator.vibrate) navigator.vibrate(10);
  };

  const handleJoystickMove = (e: React.TouchEvent) => {
    e.preventDefault();
    const input = engineRef.current?.input;
    if (!input) return;

    // Find the right touch by identifier
    let touch: React.Touch | null = null;
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === joystickTouchId.current) {
        touch = e.changedTouches[i];
        break;
      }
    }
    if (!touch) return;

    const base = joystickBase;
    const dx = touch.clientX - base.x;
    const dy = touch.clientY - base.y;
    const dist = Math.hypot(dx, dy);

    if (dist > 4) {
      const norm = dist / JOYSTICK_RADIUS;
      const clampedNorm = Math.min(1, norm);
      const nx = dx / dist;
      const ny = dy / dist;

      input.virtualX = nx * clampedNorm;
      input.virtualY = ny * clampedNorm;

      // Thumb visual — clamped to radius
      const visualDist = Math.min(dist, JOYSTICK_RADIUS - 16);
      setJoystickPos({ x: nx * visualDist, y: ny * visualDist });
    } else {
      input.virtualX = 0;
      input.virtualY = 0;
      setJoystickPos({ x: 0, y: 0 });
    }
  };

  const handleJoystickEnd = (e: React.TouchEvent) => {
    e.preventDefault();
    // Only reset if the lifted finger is the joystick finger
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === joystickTouchId.current) {
        const input = engineRef.current?.input;
        if (input) { input.virtualX = 0; input.virtualY = 0; }
        setJoystickPos({ x: 0, y: 0 });
        setIsJoystickActive(false);
        joystickTouchId.current = null;
        break;
      }
    }
  };

  const detectionBarColor =
    detection > 75 ? 'bg-red-500' :
      detection > 40 ? 'bg-orange-400' : 'bg-slate-400';

  const detectionTextColor =
    detection > 75 ? 'text-red-500' :
      detection > 40 ? 'text-orange-400' : 'text-slate-400';

  const bearConfig: Record<BearState, { label: string; text: string; border: string; bg: string }> = {
    PATROL: { label: '🐻 Patrolling', text: 'text-slate-400', border: 'border-slate-500/30', bg: 'bg-slate-500/10' },
    ALERT: { label: '🐻 Alerted!', text: 'text-orange-400', border: 'border-orange-400/40', bg: 'bg-orange-400/10' },
    INVESTIGATE: { label: '🐻 Investigating', text: 'text-yellow-400', border: 'border-yellow-400/40', bg: 'bg-yellow-400/10' },
    CHASE: { label: '🐻 CHASING!', text: 'text-red-500', border: 'border-red-500/50', bg: 'bg-red-500/10' },
    MEETING: { label: '🐻 Meeting', text: 'text-cyan-400', border: 'border-cyan-400/40', bg: 'bg-cyan-400/10' },
  };

  const bc = bearConfig[bearState];

  const msgTextColor =
    gameMessage.includes('HUNTING') || gameMessage.includes('caught') ? 'text-red-500' :
      gameMessage.includes('sniffing') || gameMessage.includes('scent') ? 'text-orange-400' :
        'text-white';

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 bg-[#050508] text-white font-sans"
      style={{ width: '100vw', height: '100dvh', touchAction: 'none' }}
    >
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full z-1" />

      <div
        className="absolute inset-0 z-2 pointer-events-none transition-opacity duration-500"
        style={{
          opacity: Math.max(0, (detection - 40) / 60),
          background: 'radial-gradient(circle at center, rgba(220,38,38,0.2) 0%, transparent 70%)',
        }}
      />
      {/* ── TOP BAR ── */}
      <div className="absolute top-0 left-0 right-0 z-10 flex justify-between items-center px-4 pt-4 pb-6 pointer-events-none"
        style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.85), transparent)' }}>

        {/* Objectives */}
        <div className="glass-panel px-3 py-2 rounded-xl flex items-center gap-3">
          <div className="flex flex-col">
            <span className="text-[10px] uppercase tracking-widest text-white/40 font-bold leading-none mb-1">Items</span>
            <div className="flex items-center gap-1">
              {Array.from({ length: items.total }).map((_, i) => (
                <div key={i} className={`w-2 h-2 rounded-full transition-all duration-300 ${i < items.collected
                  ? 'bg-yellow-400 shadow-[0_0_8px_#facc15]'
                  : 'bg-white/10 border border-white/20'
                  }`} />
              ))}
            </div>
          </div>
        </div>

        {/* Title */}
        <div className="text-center">
          <h1 className="text-base md:text-xl font-black italic uppercase tracking-tight leading-none">
            Escape <span className="text-red-600">Bear</span>
          </h1>
          <p className="text-[8px] tracking-[0.3em] uppercase text-white/30">Survival</p>
        </div>

        {/* Status */}
        <div className={`glass-panel px-3 py-2 rounded-xl flex items-center gap-2.5 transition-all duration-300 ${isFlashlightOn ? 'border-yellow-400/40 shadow-[0_0_12px_rgba(250,204,21,0.15)]' : ''
          }`}>
          <div className={`w-2 h-2 rounded-full transition-all duration-300 ${isFlashlightOn ? 'bg-yellow-400 shadow-[0_0_8px_#facc15] animate-pulse' : 'bg-white/15'
            }`} />
          <span className={`text-[10px] font-black uppercase tracking-widest ${isFlashlightOn ? 'text-yellow-400' : 'text-white/30'}`}>
            {isFlashlightOn ? 'LIGHT' : 'OFF'}
          </span>
        </div>
      </div>

      {(gameMessage || senseStatus !== 'NONE') && !isGameOver && !isVictory && (
        <div className="absolute z-10 pointer-events-none w-[94%] max-w-lg"
          style={{ top: 80, left: '50%', transform: 'translateX(-50%)' }}>
          <div className="glass-panel rounded-2xl px-5 py-4 border border-white/5 shadow-2xl">
            <div className="flex justify-between items-center mb-1.5">
              <span className="text-[10px] uppercase tracking-widest text-white/40 font-bold">Encrypted Radio</span>
              <span className="text-[10px] text-red-500 font-bold animate-pulse">● LIVE</span>
            </div>
            <p className={`text-base font-bold italic uppercase leading-snug ${msgTextColor} ${gameMessage.includes('HUNTING') ? 'animate-pulse' : ''
              }`}>
              {gameMessage || `${senseStatus} DETECTED...`}
            </p>
          </div>
        </div>
      )}

      <div className="absolute bottom-0 left-0 right-0 z-10 flex justify-between items-center px-4 pt-4 pb-3 pointer-events-none"
        style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.8), transparent)' }}>

        {/* Detection meter */}
        <div className="w-32 md:w-44">
          <div className="flex justify-between items-end mb-1.5">
            <span className="text-[10px] uppercase tracking-widest text-white/50 font-bold">Detection</span>
            <span className={`text-sm md:text-base font-black italic leading-none ${detectionTextColor}`}>
              {Math.floor(detection)}%
            </span>
          </div>
          <div className="h-1.5 w-full bg-white/8 rounded-full overflow-hidden border border-white/10">
            <div
              className={`h-full rounded-full transition-all duration-200 ${detectionBarColor} ${detection > 75 ? 'shadow-[0_0_8px_currentColor]' : ''
                }`}
              style={{ width: `${detection}%` }}
            />
          </div>
        </div>

        {/* Keyboard hints — desktop only */}
        {!isTouchDevice && (
          <div className="hidden lg:flex gap-4 text-[10px] uppercase tracking-widest text-white/30 font-bold">
            <span>[WASD] Move</span>
            <span>·</span>
            <span>Freeze to hide</span>
          </div>
        )}

        {/* Status badges */}
        <div className="flex gap-2">
          <div className={`px-2.5 py-1.5 rounded-lg border text-[10px] font-black uppercase tracking-wider transition-all duration-300 ${bc.bg} ${bc.border} ${bc.text} ${bearState === 'CHASE' ? 'animate-pulse' : ''
            }`}>
            {bearState === 'CHASE' ? '⚠' : '🐻'}
          </div>
          <div className="px-2.5 py-1.5 rounded-lg border border-white/20 bg-white/5 text-[10px] font-black uppercase tracking-wider text-white/60">
            {difficultyLabel}
          </div>
          <div className={`px-2.5 py-1.5 rounded-lg border text-[10px] font-black uppercase tracking-wider transition-all duration-300 ${isMoving
            ? 'bg-red-500/10 border-red-500/40 text-red-400'
            : 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400'
            }`}>
            {isMoving ? 'MOVE' : 'HIDE'}
          </div>
        </div>
      </div>

      {/* ── GAME OVER ── */}
      {isGameOver && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/80 backdrop-blur-md p-6">
          <div className="glass-panel rounded-3xl w-full max-w-sm px-8 py-12 flex flex-col items-center gap-6 text-center border border-red-500/30">
            <span className="text-7xl animate-bounce">🐻</span>
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-red-500/70 font-bold mb-3">You were caught</p>
              <h2 className="text-4xl font-black italic uppercase text-red-500 text-glow-red">Game Over</h2>
            </div>
            <button
              onClick={() => startGame(currentLevel)}
              className="w-full py-4 rounded-2xl bg-red-600 hover:bg-red-500 active:scale-90 text-white font-black uppercase tracking-widest text-base transition-all cursor-pointer shadow-[0_0_30px_rgba(220,38,38,0.5)]"
            >
              Try Again
            </button>
          </div>
        </div>
      )}

      {/* ── VICTORY ── */}
      {isVictory && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/80 backdrop-blur-md p-6">
          <div className="glass-panel rounded-3xl w-full max-w-sm px-8 py-12 flex flex-col items-center gap-6 text-center border border-cyan-500/30">
            <span className="text-7xl animate-pulse">🏃</span>
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-cyan-400/70 font-bold mb-3">You made it out!</p>
              <h2 className="text-4xl font-black italic uppercase text-cyan-400 text-glow-cyan">
                {currentLevel < 10 ? `Level ${currentLevel} Cleared!` : 'Ultimate Victory!'}
              </h2>
            </div>

            {currentLevel < 10 ? (
              <button
                onClick={() => startGame(currentLevel + 1)}
                className="w-full py-4 rounded-2xl bg-cyan-600 hover:bg-cyan-500 active:scale-95 text-white font-black uppercase tracking-widest text-base transition-all cursor-pointer shadow-[0_0_30px_rgba(6,182,212,0.5)]"
              >
                Next Level (Level {currentLevel + 1})
              </button>
            ) : (
              <button
                onClick={() => startGame(1)}
                className="w-full py-4 rounded-2xl bg-cyan-600 hover:bg-cyan-500 active:scale-95 text-white font-black uppercase tracking-widest text-base transition-all cursor-pointer shadow-[0_0_30px_rgba(6,182,212,0.5)]"
              >
                Start Over
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── MOBILE CONTROLS — touch only ── */}
      {isTouchDevice && (
        <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 15 }}>

          {/* Joystick touch zone — left half of screen */}
          <div
            className="absolute left-0 top-0 bottom-0 pointer-events-auto"
            style={{ width: '55%', touchAction: 'none' }}
            onTouchStart={handleJoystickStart}
            onTouchMove={handleJoystickMove}
            onTouchEnd={handleJoystickEnd}
            onTouchCancel={handleJoystickEnd}
          >
            {/* Floating joystick base — appears at touch point */}
            {isJoystickActive && (
              <div
                className="absolute pointer-events-none"
                style={{
                  left: joystickBase.x - JOYSTICK_RADIUS,
                  top: joystickBase.y - JOYSTICK_RADIUS,
                  width: JOYSTICK_RADIUS * 2,
                  height: JOYSTICK_RADIUS * 2,
                }}
              >
                {/* Outer ring */}
                <div className="absolute inset-0 rounded-full border-2 border-white/25 bg-white/5 backdrop-blur-sm" />

                {/* Direction indicators */}
                {['↑', '↓', '←', '→'].map((arrow, i) => {
                  const positions = [
                    { top: 4, left: '50%', transform: 'translateX(-50%)' },
                    { bottom: 4, left: '50%', transform: 'translateX(-50%)' },
                    { left: 4, top: '50%', transform: 'translateY(-50%)' },
                    { right: 4, top: '50%', transform: 'translateY(-50%)' },
                  ];
                  return (
                    <div key={i} className="absolute text-white/20 text-xs font-bold" style={positions[i]}>
                      {arrow}
                    </div>
                  );
                })}

                {/* Thumb knob */}
                <div
                  className="absolute rounded-full bg-white/40 border-2 border-white/60 shadow-[0_0_12px_rgba(255,255,255,0.3)]"
                  style={{
                    width: 44, height: 44,
                    left: JOYSTICK_RADIUS - 22 + joystickPos.x,
                    top: JOYSTICK_RADIUS - 22 + joystickPos.y,
                    transition: 'box-shadow 0.1s',
                  }}
                />
              </div>
            )}

            {/* Hint when inactive */}
            {!isJoystickActive && (
              <div className="absolute bottom-24 left-8 text-white/15 text-xs font-bold uppercase tracking-widest">
                Touch to move
              </div>
            )}
          </div>

          {/* Flashlight button — right side */}
          <div className="absolute right-0 top-0 bottom-0 flex items-end justify-center pb-20 pr-8 pointer-events-auto" style={{ width: '45%' }}>
            <button
              className={`w-20 h-20 rounded-3xl border-2 flex flex-col items-center justify-center gap-1.5 active:scale-90 transition-all cursor-pointer shadow-xl ${isFlashlightOn
                ? 'bg-yellow-400/25 border-yellow-400/60 text-yellow-400 shadow-[0_0_20px_rgba(250,204,21,0.3)]'
                : 'bg-white/5 border-white/20 text-white/40'
                }`}
              onTouchStart={(e) => {
                e.stopPropagation();
                if (engineRef.current) engineRef.current.input.virtualFlashlight = true;
                if (navigator.vibrate) navigator.vibrate(15);
              }}
            >
              <span className="text-2xl">{isFlashlightOn ? '💡' : '🔦'}</span>
              <span className="text-[9px] font-black uppercase tracking-widest">[F] Light</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
