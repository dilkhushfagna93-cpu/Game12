import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Play } from 'lucide-react';
import { GraphicsAudioBar } from '../components/GraphicsAudioBar';
import { GENERATED_ASSETS, VIRTUAL_COIN_DISCLAIMER } from '../config/assets';
import { useApp } from '../context/AppContext';
import { soundEngine } from '../services/soundEngine';

const CATALOG = [
  {
    id: 'teen_patti' as const,
    name: 'Teen Patti 3D',
    category: 'table' as const,
    path: '/games/teen-patti',
    image: GENERATED_ASSETS.teenPattiPreview,
    summary:
      'Authentic 5-seat Indian 3-Card Poker on a royal emerald velvet oval table with ₹1–₹500 Boot tables, Blind/Chaal betting, Side Show, Private 6-digit codes, and SHA-256 Fair dealing.',
    specs: '5-Seat Royal Table · Trail to High Card · Side Show & Showdown',
  },
  {
    id: 'dragon_tiger' as const,
    name: 'Dragon Tiger 3D',
    category: 'table' as const,
    path: '/games/dragon-tiger',
    image: GENERATED_ASSETS.dragonTigerPreview,
    summary:
      'High-speed single-card showdown on a physically rendered emerald casino table with walnut rails, 3D card dealing, and metallic chip stacks.',
    specs: '52-Card Deck · Ace High · 1:1 & 8:1 Virtual Odds',
  },
  {
    id: 'ludo' as const,
    name: 'Ludo 3D',
    category: 'board' as const,
    path: '/games/ludo',
    image: GENERATED_ASSETS.ludoPreview,
    summary:
      'Handcrafted raised wooden Ludo board with glossy lathe-turned tokens, physical ivory dice rolling, 2–4 player AI, local pass-and-play, and real-time online rooms.',
    specs: '2–4 Players · AI / Local / Online Rooms · Official Rules',
  },
  {
    id: 'aviator' as const,
    name: 'Aviator Ascent 3D',
    category: 'flight' as const,
    path: '/games/aviator',
    image: GENERATED_ASSETS.aviatorPreview,
    summary:
      'Brushed-gold stunt monoplane climbing through sunlit volumetric 3D clouds with live multiplier curve, auto cash-out, and server-verified fair crash points.',
    specs: 'Server-Authoritative Crash · Auto Cash-Out · 3D Flight',
  },
];

export default function GamesPage() {
  const { gameConfigs } = useApp();
  const [filter, setFilter] = useState<'all' | 'table' | 'board' | 'flight'>('all');

  const visible = filter === 'all' ? CATALOG : CATALOG.filter((g) => g.category === filter);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 space-y-8">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl font-bold gold-gradient-text">
            All 3D Games
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Select a title to launch its dedicated WebGL 3D environment directly in your browser.
          </p>
        </div>
        <GraphicsAudioBar />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="inline-flex items-center gap-1 bg-black/50 border border-white/10 rounded-xl p-1 text-xs">
          {(
            [
              { id: 'all', label: 'All Titles' },
              { id: 'table', label: 'Card Table' },
              { id: 'board', label: 'Tabletop Board' },
              { id: 'flight', label: '3D Flight' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                soundEngine.playClick();
                setFilter(tab.id);
              }}
              className={`px-3.5 py-2 rounded-lg font-medium transition-colors whitespace-nowrap ${
                filter === tab.id ? 'bg-[#d4af37] text-[#09070d] font-semibold' : 'text-zinc-400 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <Link
          to="/rules"
          className="inline-flex items-center gap-2 text-xs text-[#f6dc93] hover:underline"
        >
          <BookOpen className="w-4 h-4" />
          <span>Read Official Rules</span>
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {visible.map((g) => {
          const cfg = gameConfigs[g.id];
          const enabled = cfg?.enabled !== false;
          const minEntry = Math.max(1, cfg?.minBet ?? 1);
          return (
            <div key={g.id} className="surface-panel rounded-2xl overflow-hidden flex flex-col">
              <div className="aspect-video bg-[#110c1e] overflow-hidden">
                <img
                  src={g.image}
                  alt={g.name}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="p-6 flex-1 flex flex-col justify-between space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-zinc-400">
                    <span className="font-mono-num font-bold text-[#f6dc93]">Min ₹{minEntry}</span>
                    <span className={enabled ? 'text-emerald-400' : 'text-rose-400'}>
                      {enabled ? 'Available' : 'Maintenance'}
                    </span>
                  </div>
                  <h2 className="font-display text-xl font-bold text-[#faf6ee]">{g.name}</h2>
                  <p className="text-sm text-zinc-400 leading-relaxed">{g.summary}</p>
                </div>

                <div className="space-y-3 pt-3 border-t border-white/10">
                  <div className="text-xs font-mono-num text-zinc-500">{g.specs}</div>
                  <Link
                    to={g.path}
                    onClick={() => soundEngine.playClick()}
                    className="w-full gold-button py-2.5 px-4 rounded-xl text-sm font-bold inline-flex items-center justify-center gap-2"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    <span>Launch 3D Engine</span>
                  </Link>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-zinc-500 text-center pt-4">{VIRTUAL_COIN_DISCLAIMER}</p>
    </div>
  );
}
