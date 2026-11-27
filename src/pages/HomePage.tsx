import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  ChevronRight,
  Crown,
  Dices,
  Download,
  Flame,
  Gift,
  Plane,
  Play,
  ShieldCheck,
  Sparkles,
  Trophy,
  Users,
  Wallet,
  Zap,
} from 'lucide-react';
import { AvatarBadge } from '../components/AvatarBadge';
import { GENERATED_ASSETS, VIRTUAL_COIN_DISCLAIMER } from '../config/assets';
import { useApp } from '../context/AppContext';
import { soundEngine } from '../services/soundEngine';
import {
  fetchGameHistory,
  fetchLeaderboard,
  subscribeToRecentBigWins,
} from '../services/walletService';
import type { GameHistoryRecord, GameId, PublicProfile } from '../types';

type LobbyCategory = 'all' | 'crash' | 'casino' | 'board';

interface PromoSlide {
  id: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  ctaLabel: string;
  ctaTo: string;
  gradient: string;
  border: string;
  accentText: string;
  Icon: React.ComponentType<{ className?: string }>;
}

const PROMO_SLIDES: PromoSlide[] = [
  {
    id: 'daily_spin',
    eyebrow: 'Daily Bonus Spin',
    title: 'Spin & Win Up to ₹5,000',
    subtitle: 'Free daily wheel spin + 7-day check-in streak rewards.',
    ctaLabel: 'Spin Free',
    ctaTo: '/rewards',
    gradient: 'from-[#3b125f] via-[#1c103b] to-[#0e0b22]',
    border: 'border-[#f6dc93]/40',
    accentText: 'text-[#fde68a]',
    Icon: Gift,
  },
  {
    id: 'vip_cashback',
    eyebrow: 'VIP Loyalty Cashback',
    title: 'Up to 10% Daily Cashback',
    subtitle: 'Climb Bronze to Diamond for priority payouts & bonus drops.',
    ctaLabel: 'View VIP',
    ctaTo: '/rewards',
    gradient: 'from-[#4a2b06] via-[#241508] to-[#110c19]',
    border: 'border-amber-400/45',
    accentText: 'text-amber-300',
    Icon: Crown,
  },
  {
    id: 'instant_upi',
    eyebrow: 'Instant UPI Withdrawals',
    title: 'Zero-Wait UPI Payouts',
    subtitle: 'Direct PhonePe, GPay & Paytm intent + Promo Bonus codes.',
    ctaLabel: 'Add / Withdraw',
    ctaTo: '/wallet',
    gradient: 'from-[#064234] via-[#0a2324] to-[#0b1024]',
    border: 'border-emerald-400/40',
    accentText: 'text-emerald-300',
    Icon: Zap,
  },
];

const CATEGORY_TABS: Array<{ id: LobbyCategory; label: string }> = [
  { id: 'all', label: 'All Games' },
  { id: 'crash', label: 'Crash' },
  { id: 'casino', label: 'Casino' },
  { id: 'board', label: 'Board' },
];

interface LobbyGameCard {
  id: GameId;
  title: string;
  tagline: string;
  category: Exclude<LobbyCategory, 'all'>;
  categoryLabel: string;
  path: string;
  basePlayers: number;
  featured?: boolean;
  defaultMinEntry: number;
  payoutHighlight: string;
}

const LOBBY_GAMES: LobbyGameCard[] = [
  {
    id: 'aviator',
    title: 'Aviator Crash',
    tagline: 'Cash out before takeoff · 100x+ Multipliers',
    category: 'crash',
    categoryLabel: 'Crash',
    path: '/games/aviator',
    basePlayers: 1480,
    featured: true,
    defaultMinEntry: 1,
    payoutHighlight: 'Up to 100x',
  },
  {
    id: 'teen_patti',
    title: 'Teen Patti 3D',
    tagline: '5-Seat Royal Tables · Blind & Side Show',
    category: 'casino',
    categoryLabel: 'Casino',
    path: '/games/teen-patti',
    basePlayers: 1360,
    defaultMinEntry: 1,
    payoutHighlight: 'Boot ₹1 – ₹500',
  },
  {
    id: 'dragon_tiger',
    title: 'Dragon Tiger',
    tagline: '15s Live Rounds · 8:1 Tie',
    category: 'casino',
    categoryLabel: 'Casino',
    path: '/games/dragon-tiger',
    basePlayers: 1240,
    defaultMinEntry: 1,
    payoutHighlight: '1:1 · 8:1 Tie',
  },
  {
    id: 'ludo',
    title: 'Ludo 3D',
    tagline: 'Quick 1-Token · 1v1 · Friends',
    category: 'board',
    categoryLabel: 'Board',
    path: '/games/ludo',
    basePlayers: 980,
    defaultMinEntry: 1,
    payoutHighlight: 'Quick & Classic',
  },
];

function AviatorEmblemBadge() {
  return (
    <div className="relative w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-gradient-to-br from-rose-500 via-red-600 to-amber-600 p-[2px] shadow-[0_0_24px_rgba(244,63,94,0.55)] shrink-0">
      <div className="w-full h-full rounded-[14px] bg-gradient-to-br from-[#2a0714] via-[#1c0819] to-[#0d0a1a] flex items-center justify-center relative overflow-hidden">
        <svg viewBox="0 0 64 64" className="w-11 h-11" aria-hidden="true">
          <defs>
            <linearGradient id="avJetGrad" x1="0" y1="1" x2="1" y2="0">
              <stop offset="0%" stopColor="#f43f5e" />
              <stop offset="60%" stopColor="#fb923c" />
              <stop offset="100%" stopColor="#fef08a" />
            </linearGradient>
          </defs>
          <path
            d="M8 50 Q26 48 48 18"
            fill="none"
            stroke="url(#avJetGrad)"
            strokeWidth="3.5"
            strokeLinecap="round"
          />
          <path
            d="M8 50 Q26 48 48 18 L48 50 Z"
            fill="url(#avJetGrad)"
            fillOpacity="0.18"
          />
          <path
            d="M36 17 L55 12 L46 28 L42 22 L32 25 L36 17 Z"
            fill="#fff7ed"
            stroke="#fb7185"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </svg>
        <span className="absolute bottom-1 right-1 font-mono-num text-[9px] font-black text-amber-300 leading-none">
          2.8x
        </span>
      </div>
    </div>
  );
}

function DragonTigerEmblemBadge() {
  return (
    <div className="relative flex items-center justify-center h-16 sm:h-20">
      <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full p-[2px] bg-gradient-to-tr from-sky-400 via-blue-500 to-amber-200 shadow-[0_0_16px_rgba(56,189,248,0.65)] -mr-2.5 z-10 overflow-hidden">
        <img
          src={GENERATED_ASSETS.dtDragonMascot}
          alt=""
          aria-hidden="true"
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover rounded-full"
        />
      </div>
      <div className="relative z-20 w-7 h-7 rounded-full bg-gradient-to-b from-[#fff3c4] via-[#d9a62e] to-[#7c5308] border border-white/80 shadow-lg flex items-center justify-center">
        <span className="font-display text-[9px] font-black text-[#1c0f02]">VS</span>
      </div>
      <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full p-[2px] bg-gradient-to-tr from-amber-300 via-orange-500 to-red-500 shadow-[0_0_16px_rgba(251,191,36,0.65)] -ml-2.5 z-10 overflow-hidden">
        <img
          src={GENERATED_ASSETS.dtTigerMascot}
          alt=""
          aria-hidden="true"
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover rounded-full"
        />
      </div>
    </div>
  );
}

function LudoEmblemBadge() {
  return (
    <div className="relative flex items-center justify-center h-16 sm:h-20">
      <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl p-[2px] bg-gradient-to-br from-[#fde047] via-[#f59e0b] to-[#b45309] shadow-[0_0_20px_rgba(250,204,21,0.5)]">
        <div className="w-full h-full rounded-[14px] grid grid-cols-2 grid-rows-2 overflow-hidden relative bg-[#0c1124]">
          <div className="bg-gradient-to-br from-rose-500 to-red-700" />
          <div className="bg-gradient-to-br from-emerald-400 to-green-700" />
          <div className="bg-gradient-to-br from-sky-400 to-blue-700" />
          <div className="bg-gradient-to-br from-amber-300 to-yellow-600" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-7 h-7 rounded-lg bg-white shadow-[0_3px_10px_rgba(0,0,0,0.6)] border border-amber-300 flex items-center justify-center">
              <Dices className="w-4 h-4 text-[#b45309]" aria-hidden="true" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TeenPattiEmblemBadge() {
  return (
    <div className="relative flex items-center justify-center h-16 sm:h-20">
      <div className="flex items-center -space-x-3">
        <div className="w-9 h-12 sm:w-10 sm:h-14 -rotate-12 rounded-lg bg-gradient-to-br from-[#fffdf7] to-[#e9dec4] border border-amber-300 shadow-[0_6px_14px_rgba(0,0,0,0.65)] p-1 flex flex-col justify-between text-zinc-900">
          <span className="font-mono-num text-[10px] font-black leading-none">A</span>
          <span className="self-center text-sm leading-none">♠</span>
        </div>
        <div className="w-9 h-12 sm:w-10 sm:h-14 z-10 -translate-y-1 rounded-lg bg-gradient-to-br from-[#fffdf7] to-[#e9dec4] border-2 border-[#f6dc93] shadow-[0_8px_18px_rgba(212,175,55,0.45)] p-1 flex flex-col justify-between text-rose-600">
          <span className="font-mono-num text-[10px] font-black leading-none">A</span>
          <span className="self-center text-sm leading-none">♥</span>
        </div>
        <div className="w-9 h-12 sm:w-10 sm:h-14 rotate-12 rounded-lg bg-gradient-to-br from-[#fffdf7] to-[#e9dec4] border border-amber-300 shadow-[0_6px_14px_rgba(0,0,0,0.65)] p-1 flex flex-col justify-between text-rose-600">
          <span className="font-mono-num text-[10px] font-black leading-none">A</span>
          <span className="self-center text-sm leading-none">♦</span>
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  const { apkConfig, gameConfigs } = useApp();
  const [activeSlide, setActiveSlide] = useState(0);
  const [category, setCategory] = useState<LobbyCategory>('all');
  const [leaders, setLeaders] = useState<PublicProfile[]>([]);
  const [recentGames, setRecentGames] = useState<GameHistoryRecord[]>([]);
  const [bigWins, setBigWins] = useState<Array<GameHistoryRecord & { maskedUsername: string }>>([]);
  const [playerJitter, setPlayerJitter] = useState<Record<GameId, number>>({
    aviator: 0,
    dragon_tiger: 0,
    ludo: 0,
    teen_patti: 0,
  });

  // Rotate promo banner every 5s (respecting reduced motion)
  useEffect(() => {
    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) return;
    const id = window.setInterval(() => {
      setActiveSlide((prev) => (prev + 1) % PROMO_SLIDES.length);
    }, 5200);
    return () => window.clearInterval(id);
  }, []);

  // Gentle realistic live active-player count drift
  useEffect(() => {
    const id = window.setInterval(() => {
      setPlayerJitter({
        aviator: Math.floor(Math.random() * 45) - 18,
        dragon_tiger: Math.floor(Math.random() * 38) - 15,
        ludo: Math.floor(Math.random() * 32) - 14,
        teen_patti: Math.floor(Math.random() * 42) - 16,
      });
    }, 6500);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    void fetchLeaderboard('allTime', 5)
      .then(setLeaders)
      .catch(() => {});
    void fetchGameHistory(undefined, 5)
      .then(setRecentGames)
      .catch(() => {});
    const unsubWins = subscribeToRecentBigWins(setBigWins);
    return () => unsubWins();
  }, []);

  const visibleGames = useMemo(() => {
    if (category === 'all') return LOBBY_GAMES;
    return LOBBY_GAMES.filter((g) => g.category === category);
  }, [category]);

  const currentSlide = PROMO_SLIDES[activeSlide];
  const SlideIcon = currentSlide.Icon;

  const tickerWins = useMemo(() => {
    if (bigWins.length > 0) {
      return bigWins.map((w) => ({
        id: w.historyId,
        user: w.maskedUsername,
        game: w.game.replace('_', ' '),
        payout: w.payout,
      }));
    }
    return recentGames
      .filter((g) => g.payout > 0)
      .map((g) => ({
        id: g.historyId,
        user: `${g.username.slice(0, 2)}***`,
        game: g.game.replace('_', ' '),
        payout: g.payout,
      }));
  }, [bigWins, recentGames]);

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 pt-3 sm:pt-5 pb-6 space-y-4 sm:space-y-6">
      {/* 1. COMPACT PROMOTIONAL HERO BANNER (h-[140px] on mobile, h-[164px] on sm+) */}
      <section aria-label="Featured Promotions" className="relative">
        <div
          className={`relative h-[140px] sm:h-[164px] rounded-2xl border ${currentSlide.border} bg-gradient-to-r ${currentSlide.gradient} overflow-hidden px-4 sm:px-6 py-3.5 sm:py-5 flex items-center justify-between gap-3 shadow-[0_10px_32px_rgba(0,0,0,0.45)] transition-all duration-300`}
        >
          {/* Ambient Decorative Glow */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-10 -top-10 w-44 h-44 rounded-full opacity-25 blur-2xl"
            style={{ background: 'radial-gradient(circle, rgba(246,220,147,0.85) 0%, transparent 70%)' }}
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -left-8 -bottom-10 w-40 h-40 rounded-full opacity-20 blur-2xl"
            style={{ background: 'radial-gradient(circle, rgba(168,85,247,0.8) 0%, transparent 70%)' }}
          />

          <div className="relative z-10 min-w-0 flex-1 flex flex-col justify-between h-full">
            <div className="space-y-1">
              <div className={`text-[11px] font-bold tracking-wider uppercase ${currentSlide.accentText} flex items-center gap-1.5`}>
                <SlideIcon className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{currentSlide.eyebrow}</span>
              </div>
              <h1 className="font-display text-lg sm:text-2xl lg:text-3xl font-bold text-[#faf6ee] leading-tight truncate">
                {currentSlide.title}
              </h1>
              <p className="text-[11px] sm:text-sm text-zinc-300 line-clamp-1 sm:line-clamp-2 max-w-xl">
                {currentSlide.subtitle}
              </p>
            </div>

            <div className="flex items-center justify-between gap-2 pt-1">
              <Link
                to={currentSlide.ctaTo}
                onClick={() => soundEngine.playClick()}
                className="gold-button inline-flex items-center gap-1.5 px-3.5 sm:px-5 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-extrabold whitespace-nowrap"
              >
                <span>{currentSlide.ctaLabel}</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>

              {/* Slide Selector Controls */}
              <div className="flex items-center gap-1.5" role="tablist" aria-label="Promotion slides">
                {PROMO_SLIDES.map((s, idx) => (
                  <button
                    key={s.id}
                    type="button"
                    role="tab"
                    aria-selected={idx === activeSlide}
                    aria-label={s.eyebrow}
                    onClick={() => {
                      soundEngine.playClick();
                      setActiveSlide(idx);
                    }}
                    className={`h-2 rounded-full transition-all ${
                      idx === activeSlide
                        ? 'w-6 bg-[#f6dc93]'
                        : 'w-2 bg-white/30 hover:bg-white/55'
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Right Icon Showcase (Compact on mobile, prominent on sm+) */}
          <div className="hidden xs:flex sm:flex relative z-10 shrink-0 w-20 h-20 sm:w-28 sm:h-28 rounded-2xl border border-white/15 bg-black/30 items-center justify-center">
            <SlideIcon className={`w-10 h-10 sm:w-14 sm:h-14 ${currentSlide.accentText} drop-shadow-[0_0_18px_rgba(246,220,147,0.4)]`} />
          </div>
        </div>
      </section>

      {/* 2. SLIM LIVE RECENT BIG WINS TICKER STRIP */}
      <section
        aria-label="Recent Big Wins"
        className="rounded-xl border border-[#d4af37]/25 bg-gradient-to-r from-[#130d24] via-[#1a1130] to-[#130d24] px-3 py-1.5 flex items-center gap-2.5 overflow-hidden"
      >
        <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-[#f6dc93] shrink-0">
          <Sparkles className="w-3.5 h-3.5 text-[#d4af37]" aria-hidden="true" />
          <span>Big Wins</span>
        </span>
        <span aria-hidden="true" className="text-zinc-600 text-xs">|</span>
        <div className="flex-1 min-w-0 overflow-x-auto no-scrollbar">
          {tickerWins.length > 0 ? (
            <div className="flex items-center gap-4 text-xs whitespace-nowrap">
              {tickerWins.map((w) => (
                <span key={w.id} className="inline-flex items-center gap-1.5 shrink-0">
                  <span className="font-semibold text-zinc-100">{w.user}</span>
                  <span className="text-zinc-400 capitalize">{w.game}</span>
                  <span className="font-mono-num font-bold text-emerald-300">
                    +₹{w.payout.toLocaleString()}
                  </span>
                </span>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-4 text-xs text-zinc-300 whitespace-nowrap">
              <span>Provably Fair SHA-256 RNG</span>
              <span aria-hidden="true" className="text-zinc-600">·</span>
              <span>Instant UPI Deposits &amp; Payouts</span>
              <span aria-hidden="true" className="text-zinc-600">·</span>
              <span className="text-emerald-300 font-medium">Daily Spin Up to ₹5,000 Active</span>
            </div>
          )}
        </div>
      </section>

      {/* 3. QUICK-ACCESS CATEGORY FILTER BAR */}
      <section aria-label="Game Categories" className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
          {CATEGORY_TABS.map((tab) => {
            const active = category === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  soundEngine.playClick();
                  setCategory(tab.id);
                }}
                className={`min-h-[38px] px-3.5 sm:px-4 rounded-xl text-xs sm:text-sm font-semibold transition-all whitespace-nowrap shrink-0 border ${
                  active
                    ? 'bg-gradient-to-r from-[#efd27a] to-[#cfa432] text-[#120b02] border-[#fff1c2] shadow-[0_4px_14px_rgba(212,175,55,0.3)]'
                    : 'bg-[#120e21] text-zinc-300 border-white/10 hover:border-[#d4af37]/35 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <Link
          to="/games"
          onClick={() => soundEngine.playClick()}
          className="hidden sm:inline-flex items-center gap-1 text-xs font-semibold text-[#f6dc93] hover:underline whitespace-nowrap shrink-0"
        >
          <span>Full Lobby</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </section>

      {/* 4. VIBRANT 2-COLUMN MOBILE / 4-COLUMN DESKTOP GAME GRID */}
      <section aria-label="Play Games" className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {visibleGames.map((game) => {
          const cfg = gameConfigs[game.id];
          const isEnabled = cfg?.enabled !== false;
          const minEntry = Math.max(1, cfg?.minBet ?? game.defaultMinEntry);
          const livePlayers = Math.max(120, game.basePlayers + (playerJitter[game.id] ?? 0));

          const isDragonTiger = game.id === 'dragon_tiger';
          const isAviator = game.id === 'aviator';
          const isTeenPatti = game.id === 'teen_patti';
          const cardTheme = isDragonTiger
            ? 'border-sky-400/40 from-[#0c1d4d] via-[#17133a] to-[#3a1608]'
            : isAviator
              ? 'border-rose-400/45 from-[#340a1d] via-[#1c0c27] to-[#110c21]'
              : isTeenPatti
                ? 'border-[#d4af37]/50 from-[#073a29] via-[#0d2124] to-[#23140b]'
                : 'border-emerald-400/40 from-[#0b2e26] via-[#131738] to-[#231538]';

          const spanClass =
            visibleGames.length === 1
              ? 'col-span-2 lg:col-span-2'
              : visibleGames.length === 2
                ? 'col-span-1 lg:col-span-2'
                : 'col-span-1';

          return (
            <article
              key={game.id}
              className={`${spanClass} relative rounded-2xl border bg-gradient-to-b ${cardTheme} overflow-hidden shadow-[0_10px_28px_rgba(0,0,0,0.48)] flex flex-col justify-between group`}
            >
              {/* Subtle Ambient Artwork Layer */}
              <img
                src={
                  isDragonTiger
                    ? GENERATED_ASSETS.dtTempleBackdrop
                    : isAviator
                      ? GENERATED_ASSETS.aviatorPreview
                      : isTeenPatti
                        ? GENERATED_ASSETS.teenPattiPreview
                        : GENERATED_ASSETS.ludoPreview
                }
                alt=""
                aria-hidden="true"
                referrerPolicy="no-referrer"
                className="pointer-events-none absolute inset-0 w-full h-full object-cover opacity-22 group-hover:scale-105 transition-transform duration-500"
              />
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#090814]/95 via-[#0c0a1a]/55 to-transparent"
              />

              <div className="relative z-10 p-3 sm:p-4 flex-1 flex flex-col justify-between gap-2.5">
                {/* Top Meta Row: Category + Min Entry */}
                <div className="flex items-center justify-between gap-1 text-[10px] font-mono-num">
                  <span className="font-semibold uppercase tracking-wider text-zinc-200 truncate inline-flex items-center gap-1">
                    {isAviator && <Flame className="w-3 h-3 text-amber-400 shrink-0" aria-hidden="true" />}
                    <span>{game.categoryLabel}</span>
                  </span>
                  <span className="font-bold text-[#f6dc93] whitespace-nowrap">
                    Min ₹{minEntry}
                  </span>
                </div>

                {/* Illustrated Vibrant Emblem */}
                <div className="py-1 flex items-center justify-center">
                  {isDragonTiger ? (
                    <DragonTigerEmblemBadge />
                  ) : isAviator ? (
                    <AviatorEmblemBadge />
                  ) : isTeenPatti ? (
                    <TeenPattiEmblemBadge />
                  ) : (
                    <LudoEmblemBadge />
                  )}
                </div>

                {/* Title + Live Players + PLAY CTA */}
                <div className="space-y-2">
                  <div className="text-center space-y-0.5">
                    <h2 className="font-display text-sm sm:text-lg font-bold text-white leading-tight truncate">
                      {game.title}
                    </h2>
                    <div className="flex items-center justify-center gap-1 text-[10px] sm:text-xs font-mono-num text-emerald-300 font-semibold">
                      <Users className="w-3 h-3 shrink-0" aria-hidden="true" />
                      <span>{livePlayers.toLocaleString()} Playing</span>
                    </div>
                  </div>

                  <Link
                    to={game.path}
                    onClick={() => soundEngine.playClick()}
                    className="w-full gold-button min-h-[40px] py-2 px-3 rounded-xl text-xs sm:text-sm font-black tracking-wide inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>{isEnabled ? 'PLAY' : 'VIEW'}</span>
                  </Link>
                </div>
              </div>
            </article>
          );
        })}
      </section>

      {/* 5. QUICK LOBBY SHORTCUTS (Deposit, Withdraw, Daily Spin, Refer & VIP) */}
      <section aria-label="Quick Actions" className="grid grid-cols-4 gap-2 sm:gap-3">
        {[
          {
            to: '/wallet',
            label: 'Deposit',
            sub: 'Instant UPI',
            Icon: Wallet,
            tone: 'text-emerald-300 border-emerald-400/25 bg-emerald-950/25',
          },
          {
            to: '/rewards',
            label: 'Daily Spin',
            sub: 'Free Coins',
            Icon: Gift,
            tone: 'text-amber-300 border-amber-400/25 bg-amber-950/25',
          },
          {
            to: '/rewards',
            label: 'VIP & Refer',
            sub: '10% Cashback',
            Icon: Crown,
            tone: 'text-purple-300 border-purple-400/25 bg-purple-950/25',
          },
          {
            to: '/download-apk',
            label: 'Get App',
            sub: apkConfig.available ? 'APK Ready' : 'PWA Ready',
            Icon: Download,
            tone: 'text-sky-300 border-sky-400/25 bg-sky-950/25',
          },
        ].map(({ to, label, sub, Icon, tone }) => (
          <Link
            key={label}
            to={to}
            onClick={() => soundEngine.playClick()}
            className={`rounded-xl border ${tone} px-2 py-2.5 sm:px-3 sm:py-3 flex flex-col items-center text-center gap-1 hover:brightness-110 transition-all min-h-[68px] justify-center`}
          >
            <Icon className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" aria-hidden="true" />
            <span className="text-[11px] sm:text-xs font-bold text-zinc-100 leading-none truncate w-full">
              {label}
            </span>
            <span className="text-[9px] sm:text-[10px] text-zinc-400 leading-none truncate w-full">
              {sub}
            </span>
          </Link>
        ))}
      </section>

      {/* 6. COMPACT TOP WINNERS & RECENT VERIFIED RESULTS */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-6 surface-panel rounded-2xl p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display text-base sm:text-lg font-bold text-[#faf6ee] inline-flex items-center gap-2">
              <Trophy className="w-4 h-4 text-[#d4af37]" aria-hidden="true" />
              <span>Top Players</span>
            </h2>
            <Link to="/leaderboard" className="text-xs font-medium text-[#f6dc93] hover:underline whitespace-nowrap">
              Full Ranks
            </Link>
          </div>

          {leaders.length === 0 ? (
            <div className="py-5 text-center text-xs sm:text-sm text-zinc-400">
              Play a round to claim Rank #1 on the live leaderboard.
            </div>
          ) : (
            <div className="divide-y divide-white/10">
              {leaders.slice(0, 4).map((p, idx) => (
                <div key={p.uid} className="py-2 flex items-center justify-between gap-2.5">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="font-mono-num text-xs font-bold text-[#d4af37] w-5 shrink-0">
                      #{idx + 1}
                    </span>
                    <AvatarBadge name={p.username} seed={p.avatarSeed} size="sm" />
                    <div className="min-w-0">
                      <div className="text-xs sm:text-sm font-medium text-zinc-100 truncate">{p.username}</div>
                      <div className="text-[11px] text-zinc-500 font-mono-num">
                        {p.wins}W · {p.winRate}%
                      </div>
                    </div>
                  </div>
                  <div className="font-mono-num text-xs sm:text-sm font-semibold text-[#f6dc93] whitespace-nowrap">
                    ₹{p.balance.toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="lg:col-span-6 surface-panel rounded-2xl p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display text-base sm:text-lg font-bold text-[#faf6ee] inline-flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" aria-hidden="true" />
              <span>Verified Live Rounds</span>
            </h2>
            <Link to="/fair-play" className="text-xs font-medium text-[#f6dc93] hover:underline whitespace-nowrap">
              SHA-256 Fair
            </Link>
          </div>

          {recentGames.length === 0 ? (
            <div className="py-5 text-center text-xs sm:text-sm text-zinc-400">
              Completed rounds with SHA-256 Provably Fair hashes stream here automatically.
            </div>
          ) : (
            <div className="divide-y divide-white/10">
              {recentGames.slice(0, 4).map((h) => (
                <div key={h.historyId} className="py-2 flex items-center justify-between gap-2.5 text-xs sm:text-sm">
                  <div className="min-w-0">
                    <div className="font-medium text-zinc-100 truncate">
                      {h.username}{' '}
                      <span className="text-zinc-500 font-normal capitalize">
                        · {h.game.replace('_', ' ')}
                      </span>
                    </div>
                    <div className="text-[11px] text-zinc-400 truncate">{h.summary}</div>
                  </div>
                  <div
                    className={`font-mono-num text-xs font-semibold whitespace-nowrap ${
                      h.netProfit >= 0 ? 'text-emerald-300' : 'text-rose-300'
                    }`}
                  >
                    {h.netProfit >= 0 ? `+₹${h.netProfit.toLocaleString()}` : `-₹${Math.abs(h.netProfit).toLocaleString()}`}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Subtle Entertainment & Fair Play Footer Note */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-[11px] text-zinc-500">
        <span>{VIRTUAL_COIN_DISCLAIMER}</span>
        <span className="inline-flex items-center gap-1.5 text-zinc-400">
          <Plane className="w-3 h-3 text-[#d4af37]" aria-hidden="true" />
          <span>18+ Only · Provably Fair SHA-256</span>
        </span>
      </div>
    </div>
  );
}
