'use client';

import dynamic from 'next/dynamic';

const GameView = dynamic(() => import('./components/GameView'), { ssr: false });

export default function Home() {
  return <GameView />;
}
