import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Coins,
  Crown,
  HelpCircle,
  History,
  ShieldCheck,
  Sparkles,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { AvatarBadge } from '../../components/AvatarBadge';
import { GameRulesModal } from '../../components/GameRulesModal';
import { ProvablyFairModal } from '../../components/ProvablyFairModal';
import { GENERATED_ASSETS } from '../../config/assets';
import { useApp } from '../../context/AppContext';
import { GameExitModal, useGameBackGuard } from '../../hooks/useGameBackGuard';
import { soundEngine } from '../../services/soundEngine';
import type { ProvablyFairProof } from '../../types';
import { DragonTigerCanvas, type PlayingCard } from './DragonTigerCanvas';
import { DragonTigerWinnerFX } from './DragonTigerWinnerFX';

const CHIPS = [1, 10, 50, 100, 500, 1000] as const;
type ChipValue = (typeof CHIPS)[number];
type BetZone = 'dragon' | 'tie' | 'tiger';

const BETTING_SECONDS = 15;

interface ChipVisual {
  id: string;
  value: ChipValue;
  offsetX: number;
  offsetY: number;
  rotate: number;
  owner: 'player' | 'left_seat' | 'right_seat' | 'table';
  landed?: boolean;
}

interface FlyingChip {
  id: string;
  zone: BetZone;
  value: ChipValue;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  rotate: number;
}

interface SweepingChip {
  id: string;
  value: ChipValue;
  fromX: number;
  fromY: number;
  midX: number;
  midY: number;
  toX: number;
  toY: number;
  rotate: number;
  delayMs: number;
}

interface PrepareResponse {
  roundId: string;
  serverSeedHash: string;
  seedHash: string;
  timestamp: number;
}

interface DealResponse {
  roundId: string;
  dragonCard: PlayingCard;
  tigerCard: PlayingCard;
  winner: 'dragon' | 'tiger' | 'tie';
  serverSeed: string;
  serverSeedHash: string;
  seedHash: string;
  maxRoundPayoutCap?: number;
  rawPayout?: number;
  payout?: number;
  payoutCapped?: boolean;
}

interface RoundHistoryEntry {
  id: string;
  dragonText: string;
  tigerText: string;
  winner: BetZone;
  wager: number;
  payout: number;
  net: number;
  time: string;
}

interface SeatPlayer {
  name: string;
  seed: string;
  coins: number;
  lastBetZone?: BetZone;
  lastWin?: number;
}

const CHIP_STYLES: Record<
  ChipValue,
  { bg: string; ring: string; text: string; label: string }
> = {
  1: {
    bg: 'from-emerald-400 via-emerald-600 to-emerald-950',
    ring: 'border-emerald-200',
    text: 'text-white',
    label: '1',
  },
  10: {
    bg: 'from-cyan-400 via-teal-600 to-teal-900',
    ring: 'border-cyan-200',
    text: 'text-white',
    label: '10',
  },
  50: {
    bg: 'from-rose-400 via-red-600 to-rose-900',
    ring: 'border-rose-200',
    text: 'text-white',
    label: '50',
  },
  100: {
    bg: 'from-sky-400 via-blue-600 to-indigo-900',
    ring: 'border-sky-200',
    text: 'text-white',
    label: '100',
  },
  500: {
    bg: 'from-fuchsia-400 via-purple-600 to-purple-950',
    ring: 'border-fuchsia-200',
    text: 'text-white',
    label: '500',
  },
  1000: {
    bg: 'from-amber-200 via-amber-500 to-amber-800',
    ring: 'border-amber-100',
    text: 'text-[#1b1002]',
    label: '1K',
  },
};

const INITIAL_SEATS_LEFT: SeatPlayer[] = [
  { name: 'Aarav', seed: 'seat_l1', coins: 24800 },
  { name: 'Priya', seed: 'seat_l2', coins: 18450 },
  { name: 'Kabir', seed: 'seat_l3', coins: 31200 },
];

const INITIAL_SEATS_RIGHT: SeatPlayer[] = [
  { name: 'Meera', seed: 'seat_r1', coins: 42600 },
  { name: 'Rohan', seed: 'seat_r2', coins: 15900 },
  { name: 'Zoya', seed: 'seat_r3', coins: 27400 },
];

const INITIAL_ROADMAP: Array<'D' | 'T' | 'X'> = ['D', 'T', 'D', 'D', 'T', 'X', 'T', 'D', 'T', 'D'];

const AMBIENT_EMBERS = [
  { left: '6%', bottom: '8%', size: 4, duration: 7.4, delay: 0.2, drift: 18 },
  { left: '12%', bottom: '18%', size: 3, duration: 8.8, delay: 1.5, drift: -14 },
  { left: '19%', bottom: '4%', size: 5, duration: 6.9, delay: 2.7, drift: 22 },
  { left: '26%', bottom: '14%', size: 3, duration: 9.2, delay: 0.9, drift: -16 },
  { left: '34%', bottom: '6%', size: 4, duration: 7.8, delay: 3.4, drift: 14 },
  { left: '44%', bottom: '10%', size: 3, duration: 8.5, delay: 1.8, drift: -20 },
  { left: '56%', bottom: '5%', size: 4, duration: 7.2, delay: 4.1, drift: 16 },
  { left: '65%', bottom: '15%', size: 3, duration: 8.9, delay: 0.6, drift: -18 },
  { left: '74%', bottom: '7%', size: 5, duration: 6.7, delay: 2.3, drift: 20 },
  { left: '82%', bottom: '19%', size: 3, duration: 9.1, delay: 3.8, drift: -15 },
  { left: '89%', bottom: '9%', size: 4, duration: 7.6, delay: 1.1, drift: 17 },
  { left: '94%', bottom: '16%', size: 3, duration: 8.2, delay: 2.9, drift: -12 },
  { left: '8%', bottom: '42%', size: 3, duration: 7.9, delay: 3.1, drift: 15 },
  { left: '92%', bottom: '46%', size: 4, duration: 7.5, delay: 0.4, drift: -16 },
] as const;

function CornerGoldFiligree({ position }: { position: 'tl' | 'tr' | 'bl' | 'br' }) {
  const posClasses =
    position === 'tl'
      ? 'top-1 left-1'
      : position === 'tr'
        ? 'top-1 right-1 -scale-x-100'
        : position === 'bl'
          ? 'bottom-1 left-1 -scale-y-100'
          : 'bottom-1 right-1 scale-x-[-1] scale-y-[-1]';
  const gradId = `dtCornerGold_${position}`;

  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 40 40"
      className={`pointer-events-none absolute ${posClasses} z-20 w-7 h-7 sm:w-8 sm:h-8 drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]`}
      fill="none"
    >
      <path
        d="M3 25V9C3 5.686 5.686 3 9 3H25"
        stroke={`url(#${gradId})`}
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <path
        d="M7 18V10C7 8.343 8.343 7 10 7H18"
        stroke="#fff3c4"
        strokeOpacity="0.7"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <path
        d="M3 13C6.5 13 9 10.5 9 7C9 10.5 11.5 13 15 13"
        stroke="#f6dc93"
        strokeOpacity="0.85"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <circle cx="8.5" cy="8.5" r="2.2" fill="#ffe799" />
      <defs>
        <linearGradient id={gradId} x1="3" y1="3" x2="25" y2="25" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#fff4c2" />
          <stop offset="50%" stopColor="#e6b84c" />
          <stop offset="100%" stopColor="#8a5a10" />
        </linearGradient>
      </defs>
    </svg>
  );
}

const WINNER_SPARKLES = [
  { angle: -155, dist: 56, delay: 0, size: 7 },
  { angle: -125, dist: 64, delay: 45, size: 5 },
  { angle: -85, dist: 48, delay: 90, size: 6 },
  { angle: -45, dist: 62, delay: 30, size: 7 },
  { angle: -18, dist: 72, delay: 75, size: 5 },
  { angle: 18, dist: 74, delay: 40, size: 6 },
  { angle: 48, dist: 58, delay: 110, size: 7 },
  { angle: 95, dist: 46, delay: 60, size: 5 },
  { angle: 132, dist: 64, delay: 20, size: 6 },
  { angle: 162, dist: 70, delay: 85, size: 5 },
] as const;

function PagodaRoofCanopy() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none select-none relative w-full max-w-[470px] sm:max-w-[514px] mx-auto -mb-2 z-20 shrink-0"
    >
      {/* Left & Right Subtle Red-Gold Silk Tassels Hanging From Pagoda Eaves */}
      <div className="dt-tassel-sway absolute left-4 sm:left-6 top-5 flex flex-col items-center">
        <div className="w-[2px] h-2.5 bg-gradient-to-b from-[#fde047] to-[#b91c1c]" />
        <div className="w-2 h-2 rounded-full bg-gradient-to-b from-[#fff3b0] to-[#b45309] border border-[#fef08a]/80 shadow-[0_0_6px_rgba(251,191,36,0.85)]" />
        <div className="w-1.5 h-4 rounded-b-full bg-gradient-to-b from-red-600 via-rose-700 to-amber-300 shadow-[0_2px_6px_rgba(220,38,38,0.65)]" />
      </div>
      <div className="dt-tassel-sway absolute right-4 sm:right-6 top-5 flex flex-col items-center">
        <div className="w-[2px] h-2.5 bg-gradient-to-b from-[#fde047] to-[#b91c1c]" />
        <div className="w-2 h-2 rounded-full bg-gradient-to-b from-[#fff3b0] to-[#b45309] border border-[#fef08a]/80 shadow-[0_0_6px_rgba(251,191,36,0.85)]" />
        <div className="w-1.5 h-4 rounded-b-full bg-gradient-to-b from-red-600 via-rose-700 to-amber-300 shadow-[0_2px_6px_rgba(220,38,38,0.65)]" />
      </div>

      {/* Ornate Golden Asian Temple Pagoda Roof Arch */}
      <svg
        viewBox="0 0 460 44"
        preserveAspectRatio="none"
        className="w-full h-[34px] sm:h-[42px] drop-shadow-[0_6px_14px_rgba(0,0,0,0.85)]"
        fill="none"
      >
        <defs>
          <linearGradient id="dtPagodaGold" x1="0" y1="4" x2="460" y2="40" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#9a6812" />
            <stop offset="22%" stopColor="#fde68a" />
            <stop offset="50%" stopColor="#fff7cc" />
            <stop offset="78%" stopColor="#e6b647" />
            <stop offset="100%" stopColor="#8a5910" />
          </linearGradient>
          <linearGradient id="dtPagodaLacquer" x1="230" y1="8" x2="230" y2="42" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#7f1d1d" />
            <stop offset="55%" stopColor="#450a0a" />
            <stop offset="100%" stopColor="#1e0507" />
          </linearGradient>
          <radialGradient id="dtCrestGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#fef08a" stopOpacity="0.95" />
            <stop offset="55%" stopColor="#f59e0b" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Temple Crest Soft Radial Halo */}
        <circle cx="230" cy="14" r="24" fill="url(#dtCrestGlow)" />

        {/* Sweeping Upturned Pagoda Roof Silhouette */}
        <path
          d="M8 32 C34 32, 62 24, 96 18 C144 10, 192 8, 230 8 C268 8, 316 10, 364 18 C398 24, 426 32, 452 32 C442 23, 434 15, 430 12 C416 20, 384 26, 344 29 L116 29 C76 26, 44 20, 30 12 C26 15, 18 23, 8 32 Z"
          fill="url(#dtPagodaGold)"
        />
        {/* Crimson-Mahogany Lacquer Under-Arch */}
        <path
          d="M26 33 C72 26, 138 18, 230 18 C322 18, 388 26, 434 33 L424 41 L36 41 Z"
          fill="url(#dtPagodaLacquer)"
          stroke="url(#dtPagodaGold)"
          strokeWidth="1.6"
        />
        {/* Ribbed Gold Tile Ridges */}
        {[92, 130, 168, 292, 330, 368].map((rx) => (
          <line
            key={rx}
            x1={rx}
            y1="19"
            x2={rx + (rx < 230 ? -6 : 6)}
            y2="37"
            stroke="#f6dc93"
            strokeOpacity="0.35"
            strokeWidth="1.4"
          />
        ))}
        {/* Glowing Center Temple Lotus Crest */}
        <path
          d="M214 14 L230 2 L246 14 L238 22 L222 22 Z"
          fill="url(#dtPagodaGold)"
          stroke="#fffbeb"
          strokeWidth="1"
        />
        <circle cx="230" cy="13" r="4.5" fill="#fef08a" stroke="#92400e" strokeWidth="1" />
      </svg>
    </div>
  );
}

function CasinoChipToken({
  value,
  size = 'md',
  selected = false,
}: {
  value: ChipValue;
  size?: 'xs' | 'sm' | 'md';
  selected?: boolean;
}) {
  const s = CHIP_STYLES[value];
  const dims =
    size === 'xs'
      ? 'w-[22px] h-[22px] text-[7.5px] leading-none font-black tracking-tighter border-2'
      : size === 'sm'
        ? 'w-9 h-9 text-[10px] border-2'
        : 'w-10 h-10 sm:w-12 sm:h-12 text-[11px] sm:text-xs border-[3px]';
  return (
    <span
      className={`relative inline-flex items-center justify-center rounded-full bg-gradient-to-b ${s.bg} ${s.ring} ${s.text} ${dims} font-mono-num font-extrabold shadow-[0_3px_8px_rgba(0,0,0,0.6)] select-none shrink-0 ${
        selected ? 'ring-2 ring-[#ffe38a] ring-offset-2 ring-offset-[#0c1028]' : ''
      }`}
    >
      <span
        aria-hidden="true"
        className={`absolute rounded-full border-dashed pointer-events-none ${
          size === 'xs'
            ? 'inset-[2px] border-[1.5px] border-white/80'
            : 'inset-[3px] border border-white/60'
        }`}
      />
      <span className="relative z-10 drop-shadow-[0_1px_1px_rgba(0,0,0,0.75)]">{s.label}</span>
    </span>
  );
}

function FlyingChipOverlayItem({
  chip,
  onLanded,
}: {
  chip: FlyingChip;
  onLanded: (id: string, zone: BetZone) => void;
}) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const finishedRef = useRef(false);
  const onLandedRef = useRef(onLanded);
  onLandedRef.current = onLanded;

  useEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) {
      onLandedRef.current(chip.id, chip.zone);
      return;
    }

    const complete = () => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      onLandedRef.current(chip.id, chip.zone);
    };

    let raf2 = 0;
    const raf1 = window.requestAnimationFrame(() => {
      outer.getBoundingClientRect();
      raf2 = window.requestAnimationFrame(() => {
        outer.style.transform = `translate3d(${chip.toX - 11}px, ${chip.toY - 11}px, 0)`;
      });
    });

    const arcHeight = Math.min(
      46,
      Math.max(24, Math.hypot(chip.toX - chip.fromX, chip.toY - chip.fromY) * 0.14),
    );
    let anim: Animation | undefined;
    if (typeof inner.animate === 'function') {
      anim = inner.animate(
        [
          {
            transform: 'translate3d(0, 0, 0) scale(1.25) rotate(0deg)',
            offset: 0,
          },
          {
            transform: `translate3d(0, ${-arcHeight}px, 0) scale(1.13) rotate(${(chip.rotate * 0.55).toFixed(1)}deg)`,
            offset: 0.4,
          },
          {
            transform: `translate3d(0, 0, 0) scale(0.94) rotate(${chip.rotate}deg)`,
            offset: 0.818,
          },
          {
            transform: `translate3d(0, -2.5px, 0) scale(1.03) rotate(${chip.rotate}deg)`,
            offset: 0.91,
          },
          {
            transform: `translate3d(0, 0, 0) scale(1) rotate(${chip.rotate}deg)`,
            offset: 1,
          },
        ],
        {
          duration: 440,
          easing: 'linear',
          fill: 'forwards',
        },
      );
      anim.onfinish = complete;
    }

    const fallbackId = window.setTimeout(complete, 470);

    return () => {
      window.cancelAnimationFrame(raf1);
      if (raf2) window.cancelAnimationFrame(raf2);
      window.clearTimeout(fallbackId);
      anim?.cancel();
    };
  }, [chip]);

  return (
    <div
      ref={outerRef}
      className="absolute left-0 top-0 will-change-transform"
      style={{
        transform: `translate3d(${chip.fromX - 11}px, ${chip.fromY - 11}px, 0)`,
        transition: 'transform 360ms cubic-bezier(0.22, 1, 0.36, 1)',
      }}
    >
      <div ref={innerRef} className="will-change-transform">
        <CasinoChipToken value={chip.value} size="xs" />
      </div>
    </div>
  );
}

function SweepingChipOverlayItem({ chip }: { chip: SweepingChip }) {
  const elRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = elRef.current;
    if (!el || typeof el.animate !== 'function') return;

    const anim = el.animate(
      [
        {
          transform: `translate3d(${chip.fromX - 11}px, ${chip.fromY - 11}px, 0) scale(1) rotate(${chip.rotate}deg)`,
          opacity: 1,
          filter: 'drop-shadow(0 0 2px rgba(251,191,36,0.4))',
          offset: 0,
        },
        {
          transform: `translate3d(${chip.midX - 11}px, ${chip.midY - 11}px, 0) scale(1.08) rotate(${(chip.rotate * 0.4).toFixed(1)}deg)`,
          opacity: 0.96,
          filter: 'drop-shadow(0 0 9px rgba(253,224,71,0.92))',
          offset: 0.5,
        },
        {
          transform: `translate3d(${chip.toX - 11}px, ${chip.toY - 11}px, 0) scale(0.55) rotate(0deg)`,
          opacity: 0,
          filter: 'drop-shadow(0 0 12px rgba(251,191,36,0.95))',
          offset: 1,
        },
      ],
      {
        duration: 920,
        delay: chip.delayMs,
        easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
        fill: 'both',
      },
    );

    return () => {
      anim.cancel();
    };
  }, [chip]);

  return (
    <div
      ref={elRef}
      className="absolute left-0 top-0 will-change-transform"
      style={{
        transform: `translate3d(${chip.fromX - 11}px, ${chip.fromY - 11}px, 0)`,
      }}
    >
      <div className="relative">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -inset-1 rounded-full bg-amber-300/35 blur-[3px]"
        />
        <CasinoChipToken value={chip.value} size="xs" />
      </div>
    </div>
  );
}

interface WinnerCelebrationState {
  key: number;
  winner: 'dragon' | 'tiger';
  boxLeft: number;
  boxTop: number;
  boxWidth: number;
  boxHeight: number;
}

function WinnerBoxCelebration({ celebration }: { celebration: WinnerCelebrationState }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDragon = celebration.winner === 'dragon';

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(80, Math.round(celebration.boxWidth));
    const h = Math.max(120, Math.round(celebration.boxHeight));
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    interface Particle {
      x: number;
      y: number;
      vx: number;
      vy: number;
      size: number;
      maxSize: number;
      life: number;
      maxLife: number;
      kind: 'blueFlame' | 'goldFlame' | 'spark' | 'amberFlame';
      wobble: number;
    }

    interface Ring {
      x: number;
      y: number;
      radius: number;
      maxRadius: number;
      color: string;
      lineWidth: number;
    }

    interface ClawArc {
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      delay: number;
    }

    const particles: Particle[] = [];
    const rings: Ring[] = [];
    const claws: ClawArc[] = [];
    let ringTimer = 0;

    if (!isDragon) {
      const cx = w * 0.5;
      const cy = h * 0.58;
      for (let i = 0; i < 3; i++) {
        const off = (i - 1) * 14;
        claws.push({
          x1: cx + w * 0.28 + off * 0.35,
          y1: cy - h * 0.22 + off,
          x2: cx - w * 0.3 + off * 0.35,
          y2: cy + h * 0.24 + off,
          delay: 0.16 + i * 0.1,
        });
      }
    }

    const startTime = performance.now();
    let lastTime = startTime;
    let rafId = 0;
    let alive = true;

    const getDragonMouth = (tNorm: number) => {
      // Mirrors the serpentine zig-zag loop directly over the DRAGON box
      const zigX =
        w * 0.5 +
        Math.sin(tNorm * Math.PI * 4.5) * (w * 0.25);
      const zigY =
        h * 0.22 +
        Math.sin(tNorm * Math.PI * 2.2) * (h * 0.14) +
        (1 - Math.abs(tNorm - 0.5) * 1.4) * (h * 0.08);
      return { x: zigX, y: zigY };
    };

    const getTigerMouth = (tNorm: number) => {
      // Mirrors the leap & fierce roar posture directly over the TIGER box
      const leapLift = Math.sin(Math.min(1, tNorm / 0.55) * Math.PI) * (h * 0.15);
      return {
        x: w * 0.5,
        y: h * 0.36 - leapLift,
      };
    };

    const renderFrame = (now: number) => {
      if (!alive) return;
      const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
      lastTime = now;
      const elapsed = (now - startTime) / 1000;
      const tNorm = Math.min(1, elapsed / 1.5);

      ctx.clearRect(0, 0, w, h);

      if (isDragon) {
        if (elapsed < 1.28) {
          const mouth = getDragonMouth(tNorm);
          const fadeOut = elapsed > 1.05 ? Math.max(0, (1.28 - elapsed) / 0.23) : 1;
          const count = Math.max(2, Math.round(dt * 190 * fadeOut));
          for (let i = 0; i < count; i++) {
            const roll = Math.random();
            const kind: Particle['kind'] =
              roll < 0.42 ? 'blueFlame' : roll < 0.72 ? 'goldFlame' : 'spark';
            // Breathe roaring blue-and-gold fire downward & outward onto the DRAGON table itself
            const angle = Math.PI * 0.5 + (Math.random() - 0.5) * 0.95;
            const speed = kind === 'spark' ? 110 + Math.random() * 140 : 85 + Math.random() * 125;
            particles.push({
              x: mouth.x + (Math.random() - 0.5) * 14,
              y: mouth.y + 10 + (Math.random() - 0.5) * 8,
              vx: Math.cos(angle) * speed * 0.85,
              vy: Math.sin(angle) * speed,
              size: kind === 'spark' ? 2 + Math.random() * 2.2 : 8 + Math.random() * 7,
              maxSize: kind === 'spark' ? 3.2 : 22 + Math.random() * 10,
              life: 0,
              maxLife: kind === 'spark' ? 0.42 + Math.random() * 0.28 : 0.36 + Math.random() * 0.22,
              kind,
              wobble: Math.random() * Math.PI * 2,
            });
          }

          // Sapphire-gold furnace glow at the Dragon's mouth
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          const mg = ctx.createRadialGradient(mouth.x, mouth.y + 8, 2, mouth.x, mouth.y + 16, 44);
          mg.addColorStop(0, `rgba(254, 249, 195, ${0.9 * fadeOut})`);
          mg.addColorStop(0.35, `rgba(56, 189, 248, ${0.75 * fadeOut})`);
          mg.addColorStop(0.72, `rgba(245, 158, 11, ${0.35 * fadeOut})`);
          mg.addColorStop(1, 'rgba(37, 99, 235, 0)');
          ctx.fillStyle = mg;
          ctx.beginPath();
          ctx.arc(mouth.x, mouth.y + 12, 44, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      } else {
        if (elapsed < 1.25) {
          const mouth = getTigerMouth(tNorm);
          const fadeOut = elapsed > 1.0 ? Math.max(0, (1.25 - elapsed) / 0.25) : 1;

          ringTimer -= dt;
          if (ringTimer <= 0) {
            ringTimer = 0.22;
            rings.push({
              x: mouth.x,
              y: mouth.y + 10,
              radius: 12,
              maxRadius: Math.max(w, h) * 0.72,
              color: rings.length % 2 === 0 ? '#fde047' : '#f97316',
              lineWidth: 4,
            });
          }

          // Blazing amber fire bursts erupting across the TIGER box
          const count = Math.max(2, Math.round(dt * 145 * fadeOut));
          for (let i = 0; i < count; i++) {
            const isSpark = Math.random() > 0.65;
            const angle = Math.PI * 0.5 + (Math.random() - 0.5) * 1.65;
            const speed = isSpark ? 115 + Math.random() * 145 : 75 + Math.random() * 115;
            particles.push({
              x: mouth.x + (Math.random() - 0.5) * 16,
              y: mouth.y + 8 + (Math.random() - 0.5) * 10,
              vx: Math.cos(angle) * speed * 0.85,
              vy: Math.sin(angle) * speed * 0.9,
              size: isSpark ? 2 + Math.random() * 2.5 : 7 + Math.random() * 7,
              maxSize: isSpark ? 3.5 : 21 + Math.random() * 10,
              life: 0,
              maxLife: isSpark ? 0.42 + Math.random() * 0.26 : 0.34 + Math.random() * 0.2,
              kind: isSpark ? 'spark' : 'amberFlame',
              wobble: Math.random() * Math.PI * 2,
            });
          }
        }

        // Expanding golden roar shockwave rings strictly inside TIGER box
        if (rings.length > 0) {
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          for (let i = rings.length - 1; i >= 0; i--) {
            const r = rings[i];
            r.radius += dt * 195;
            const ratio = r.radius / r.maxRadius;
            if (ratio >= 1) {
              rings.splice(i, 1);
              continue;
            }
            ctx.strokeStyle = r.color;
            ctx.globalAlpha = Math.max(0, (1 - ratio) * 0.88);
            ctx.lineWidth = Math.max(1.2, r.lineWidth * (1 - ratio * 0.6));
            ctx.beginPath();
            ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
            ctx.stroke();
          }
          ctx.restore();
        }

        // Triple golden-amber claw slash energy across TIGER box
        if (claws.length > 0) {
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.lineCap = 'round';
          for (const slash of claws) {
            if (elapsed < slash.delay) continue;
            const lt = elapsed - slash.delay;
            const progress = Math.min(1, lt / 0.2);
            const alpha = lt < 0.42 ? 1 : Math.max(0, 1 - (lt - 0.42) / 0.55);
            if (alpha <= 0.01) continue;
            const cx = slash.x1 + (slash.x2 - slash.x1) * progress;
            const cy = slash.y1 + (slash.y2 - slash.y1) * progress;
            const grad = ctx.createLinearGradient(slash.x1, slash.y1, cx, cy);
            grad.addColorStop(0, 'rgba(249, 115, 22, 0)');
            grad.addColorStop(0.55, `rgba(251, 191, 36, ${0.88 * alpha})`);
            grad.addColorStop(1, `rgba(255, 255, 232, ${0.98 * alpha})`);
            ctx.strokeStyle = grad;
            ctx.lineWidth = 4.5;
            ctx.beginPath();
            ctx.moveTo(slash.x1, slash.y1);
            ctx.quadraticCurveTo((slash.x1 + cx) * 0.5 - 6, (slash.y1 + cy) * 0.5 - 8, cx, cy);
            ctx.stroke();
          }
          ctx.restore();
        }
      }

      // Render flames & sparks confined inside the winning box canvas
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life += dt;
        if (p.life >= p.maxLife) {
          particles.splice(i, 1);
          continue;
        }
        const pt = p.life / p.maxLife;
        p.x = Math.max(4, Math.min(w - 4, p.x + p.vx * dt + Math.sin(elapsed * 20 + p.wobble) * 18 * dt));
        p.y = Math.max(4, Math.min(h - 4, p.y + p.vy * dt));
        const curSize = p.size + (p.maxSize - p.size) * Math.pow(pt, 0.72);
        const alpha = pt < 0.15 ? pt / 0.15 : Math.max(0, 1 - Math.pow((pt - 0.15) / 0.85, 1.3));

        if (p.kind === 'spark') {
          ctx.fillStyle = isDragon
            ? Math.random() < 0.5
              ? `rgba(125, 211, 252, ${alpha})`
              : `rgba(253, 224, 71, ${alpha})`
            : `rgba(254, 240, 138, ${alpha})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, Math.max(1.2, curSize), 0, Math.PI * 2);
          ctx.fill();
        } else if (p.kind === 'blueFlame') {
          const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, curSize);
          g.addColorStop(0, `rgba(224, 242, 254, ${alpha * 0.92})`);
          g.addColorStop(0.38, `rgba(56, 189, 248, ${alpha * 0.85})`);
          g.addColorStop(0.76, `rgba(37, 99, 235, ${alpha * 0.55})`);
          g.addColorStop(1, 'rgba(30, 58, 138, 0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(p.x, p.y, curSize, 0, Math.PI * 2);
          ctx.fill();
        } else if (p.kind === 'goldFlame') {
          const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, curSize);
          g.addColorStop(0, `rgba(255, 251, 235, ${alpha * 0.95})`);
          g.addColorStop(0.4, `rgba(253, 224, 71, ${alpha * 0.85})`);
          g.addColorStop(0.78, `rgba(245, 158, 11, ${alpha * 0.52})`);
          g.addColorStop(1, 'rgba(180, 83, 9, 0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(p.x, p.y, curSize, 0, Math.PI * 2);
          ctx.fill();
        } else {
          const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, curSize);
          g.addColorStop(0, `rgba(255, 247, 204, ${alpha * 0.9})`);
          g.addColorStop(0.36, `rgba(251, 191, 36, ${alpha * 0.85})`);
          g.addColorStop(0.75, `rgba(234, 88, 12, ${alpha * 0.55})`);
          g.addColorStop(1, 'rgba(154, 52, 18, 0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(p.x, p.y, curSize, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();

      if (elapsed < 1.5) {
        rafId = window.requestAnimationFrame(renderFrame);
      } else {
        ctx.clearRect(0, 0, w, h);
      }
    };

    rafId = window.requestAnimationFrame(renderFrame);

    return () => {
      alive = false;
      window.cancelAnimationFrame(rafId);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, [celebration, isDragon]);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute"
      style={{
        left: `${celebration.boxLeft}px`,
        top: `${celebration.boxTop}px`,
        width: `${celebration.boxWidth}px`,
        height: `${celebration.boxHeight}px`,
      }}
    >
      {/* Box Surface Flame Illumination (confined to winning box) */}
      <div
        className="dt-box-fire-pulse absolute inset-0 rounded-xl overflow-hidden"
        style={{
          boxShadow: isDragon
            ? 'inset 0 0 28px rgba(56,189,248,0.88), inset 0 0 14px rgba(251,191,36,0.75), 0 0 26px rgba(56,189,248,0.75)'
            : 'inset 0 0 30px rgba(251,191,36,0.92), inset 0 0 14px rgba(234,88,12,0.8), 0 0 28px rgba(251,191,36,0.82)',
          background: isDragon
            ? 'radial-gradient(ellipse 85% 70% at 50% 45%, rgba(56,189,248,0.34), rgba(251,191,36,0.18) 55%, transparent 82%)'
            : 'radial-gradient(ellipse 85% 70% at 50% 45%, rgba(251,191,36,0.38), rgba(234,88,12,0.22) 55%, transparent 82%)',
        }}
      />

      {/* 60fps Box-Confined Fire / Shockwave / Claw Canvas */}
      <canvas
        ref={canvasRef}
        className="pointer-events-none absolute inset-0 w-full h-full rounded-xl"
      />

      {/* Celebrating Winner Mascot Directly Over Its Own Betting Box */}
      <div className="pointer-events-none absolute inset-x-0 top-[14%] flex justify-center">
        {isDragon ? (
          <div className="dt-dragon-serpentine relative w-14 h-14 sm:w-16 sm:h-16 rounded-full p-[2.5px] bg-gradient-to-br from-[#e0f2fe] via-[#38bdf8] to-[#f59e0b] shadow-[0_0_24px_rgba(56,189,248,0.98),0_0_14px_rgba(251,191,36,0.9)]">
            <div className="w-full h-full rounded-full overflow-hidden bg-[#06143a] border border-sky-200/80">
              <img
                src={GENERATED_ASSETS.dtDragonMascot}
                alt=""
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover object-center scale-110"
              />
            </div>
          </div>
        ) : (
          <div className="dt-tiger-leap-roar relative w-14 h-14 sm:w-16 sm:h-16 rounded-full p-[2.5px] bg-gradient-to-br from-[#fef9c3] via-[#f59e0b] to-[#dc2626] shadow-[0_0_24px_rgba(251,191,36,0.98),0_0_16px_rgba(234,88,12,0.9)]">
            <div className="w-full h-full rounded-full overflow-hidden bg-[#351506] border border-amber-200/85">
              <img
                src={GENERATED_ASSETS.dtTigerMascot}
                alt=""
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover object-center scale-110"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function TempleCourtyardPatrolArena({
  phase,
  winner,
}: {
  phase: 'betting' | 'dealing' | 'revealing' | 'result';
  winner: 'dragon' | 'tiger' | 'tie' | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef({ phase, winner });
  stateRef.current = { phase, winner };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const syncSize = () => {
      const parent = canvas.parentElement;
      if (!parent) return { w: 460, h: 96 };
      const r = parent.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(240, Math.floor(r.width));
      const h = Math.max(76, Math.floor(r.height));
      if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
        canvas.width = Math.floor(w * dpr);
        canvas.height = Math.floor(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return { w, h };
    };

    let dims = syncSize();
    const ro = new ResizeObserver(() => {
      dims = syncSize();
    });
    if (canvas.parentElement) ro.observe(canvas.parentElement);

    interface ArenaParticle {
      x: number;
      y: number;
      vx: number;
      vy: number;
      size: number;
      life: number;
      maxLife: number;
      kind: 'blueEmber' | 'blueFire' | 'goldFire' | 'goldDust';
    }

    interface RoarRing {
      x: number;
      y: number;
      r: number;
      maxR: number;
      color: string;
    }

    const particles: ArenaParticle[] = [];
    const roarRings: RoarRing[] = [];
    const startTime = performance.now();
    let lastTime = startTime;
    let dragonReact = 0;
    let tigerReact = 0;
    let roarCooldown = 0;
    let rafId = 0;
    let alive = true;

    const drawDragon3D = (w: number, h: number, t: number, dt: number, react: number) => {
      const getFigure8Pos = (phaseT: number) => {
        const patrolX = w * 0.255 + Math.sin(phaseT * 1.15) * (w * 0.145);
        const patrolY = h * 0.58 + Math.sin(phaseT * 2.3) * (h * 0.14);
        if (react <= 0.001) return { x: patrolX, y: patrolY };
        const surgeX = w * 0.255 + Math.sin(phaseT * 3.2) * (w * 0.035);
        const surgeY = h * 0.36;
        return {
          x: patrolX + (surgeX - patrolX) * react,
          y: patrolY + (surgeY - patrolY) * react,
        };
      };

      const head = getFigure8Pos(t);
      const ahead = getFigure8Pos(t + 0.04);
      const rawAngle = Math.atan2(ahead.y - head.y, ahead.x - head.x);
      const targetWinAngle = -Math.PI / 2;
      let angleDiff = targetWinAngle - rawAngle;
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
      const headAngle = rawAngle + angleDiff * react;

      // Swirling Sapphire Energy Aura & Volumetric Mist Beneath Dragon
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const auraR = Math.max(36, Math.min(w, h) * 0.48) * (1 + react * 0.25);
      const auraGrad = ctx.createRadialGradient(head.x, head.y, 4, head.x, head.y, auraR);
      auraGrad.addColorStop(0, `rgba(56, 189, 248, ${0.34 + react * 0.26})`);
      auraGrad.addColorStop(0.55, `rgba(37, 99, 235, ${0.18 + react * 0.14})`);
      auraGrad.addColorStop(1, 'rgba(14, 165, 233, 0)');
      ctx.fillStyle = auraGrad;
      ctx.beginPath();
      ctx.arc(head.x, head.y, auraR, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Soft volumetric ground contact shadow beneath undulating body
      ctx.save();
      for (let i = 17; i >= 0; i--) {
        const segPos = getFigure8Pos(t - i * 0.088);
        const segScale = 1 - (i / 18) * 0.6;
        const rad = Math.max(4, Math.min(w, h) * 0.125 * segScale);
        ctx.fillStyle = `rgba(2, 6, 23, ${0.44 * (1 - i * 0.035)})`;
        ctx.beginPath();
        ctx.ellipse(segPos.x, segPos.y + rad * 0.85 + 6, rad * 1.32, rad * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      // Tail-to-neck high-detail metallic 3D-shaded serpentine segments + golden dorsal ridge
      for (let i = 17; i >= 1; i--) {
        const segT = t - i * 0.088;
        const p = getFigure8Pos(segT);
        const nextP = getFigure8Pos(segT + 0.05);
        const segAngle = Math.atan2(nextP.y - p.y, nextP.x - p.x);
        const taper = 1 - (i / 18) * 0.65;
        const radius = Math.max(4.5, Math.min(w, h) * 0.128 * taper);

        // Metallic 3D lit blue-sapphire sphere body
        const grad = ctx.createRadialGradient(
          p.x - radius * 0.36,
          p.y - radius * 0.42,
          radius * 0.08,
          p.x,
          p.y,
          radius,
        );
        grad.addColorStop(0, '#f0f9ff');
        grad.addColorStop(0.24, '#7dd3fc');
        grad.addColorStop(0.58, '#2563eb');
        grad.addColorStop(0.88, '#1e3a8a');
        grad.addColorStop(1, '#070f2e');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
        ctx.fill();

        // Metallic gold scale collar ring every 2nd segment
        if (i % 2 === 0) {
          ctx.strokeStyle = 'rgba(253, 224, 71, 0.72)';
          ctx.lineWidth = Math.max(1, radius * 0.16);
          ctx.beginPath();
          ctx.arc(p.x, p.y, radius * 0.82, -0.5, Math.PI + 0.5);
          ctx.stroke();
        }

        // Golden underbelly shimmer on alternating plates
        if (i % 2 === 1) {
          ctx.fillStyle = 'rgba(254, 240, 138, 0.52)';
          ctx.beginPath();
          ctx.arc(p.x, p.y + radius * 0.34, radius * 0.56, 0, Math.PI * 2);
          ctx.fill();
        }

        // Sculpted metallic gold dorsal spine crest
        const finX = p.x - Math.sin(segAngle) * radius * 0.86;
        const finY = p.y - Math.abs(Math.cos(segAngle)) * radius * 0.56 - radius * 0.36;
        ctx.fillStyle = '#fde047';
        ctx.strokeStyle = '#92400e';
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        ctx.moveTo(finX, finY - radius * 0.62);
        ctx.lineTo(finX + radius * 0.38, finY + radius * 0.28);
        ctx.lineTo(finX - radius * 0.38, finY + radius * 0.28);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }

      // Sculpted Larger Metallic 3D Dragon Head
      const headSize = Math.max(11, Math.min(w, h) * 0.158);
      ctx.save();
      ctx.translate(head.x, head.y);
      ctx.rotate(headAngle);

      // Burnished gold sweeping antler horns
      ctx.strokeStyle = '#fde047';
      ctx.lineWidth = 2.8;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-headSize * 0.18, -headSize * 0.56);
      ctx.quadraticCurveTo(-headSize * 0.92, -headSize * 1.24, -headSize * 1.45, -headSize * 0.9);
      ctx.moveTo(-headSize * 0.18, headSize * 0.56);
      ctx.quadraticCurveTo(-headSize * 0.92, headSize * 1.24, -headSize * 1.45, headSize * 0.9);
      ctx.stroke();

      // 3D metallic-shaded head cranium & snout
      const hGrad = ctx.createRadialGradient(
        -headSize * 0.22,
        -headSize * 0.36,
        1,
        0,
        0,
        headSize * 1.2,
      );
      hGrad.addColorStop(0, '#ffffff');
      hGrad.addColorStop(0.25, '#7dd3fc');
      hGrad.addColorStop(0.65, '#1d4ed8');
      hGrad.addColorStop(1, '#071134');
      ctx.fillStyle = hGrad;
      ctx.beginPath();
      ctx.ellipse(headSize * 0.24, 0, headSize * 1.18, headSize * 0.84, 0, 0, Math.PI * 2);
      ctx.fill();

      // Golden metallic snout ridge & brow plate
      ctx.fillStyle = 'rgba(253, 224, 71, 0.92)';
      ctx.beginPath();
      ctx.ellipse(headSize * 0.7, 0, headSize * 0.52, headSize * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();

      // Flowing golden whiskers
      ctx.strokeStyle = 'rgba(254, 240, 138, 0.95)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(headSize * 0.9, -headSize * 0.34);
      ctx.quadraticCurveTo(headSize * 0.5, -headSize * 1.15, -headSize * 0.28, -headSize * 1.12);
      ctx.moveTo(headSize * 0.9, headSize * 0.34);
      ctx.quadraticCurveTo(headSize * 0.5, headSize * 1.15, -headSize * 0.28, headSize * 1.12);
      ctx.stroke();

      // Intense Glowing Sapphire Eyes
      ctx.shadowColor = '#38bdf8';
      ctx.shadowBlur = 11;
      ctx.fillStyle = '#f0f9ff';
      ctx.beginPath();
      ctx.arc(headSize * 0.34, -headSize * 0.38, headSize * 0.21, 0, Math.PI * 2);
      ctx.arc(headSize * 0.34, headSize * 0.38, headSize * 0.21, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.restore();

      // Richer swirling mist & drifting blue embers from patrolling Dragon
      if (!prefersReduced && Math.random() < dt * 36) {
        const tailTip = getFigure8Pos(t - 1.4);
        const src = Math.random() < 0.55 ? head : tailTip;
        particles.push({
          x: src.x + (Math.random() - 0.5) * 14,
          y: src.y + (Math.random() - 0.5) * 10,
          vx: (Math.random() - 0.5) * 24,
          vy: -16 - Math.random() * 28,
          size: 1.8 + Math.random() * 2.5,
          life: 0,
          maxLife: 0.72 + Math.random() * 0.48,
          kind: 'blueEmber',
        });
      }

      // Winner surge: breathe blue fire upward toward the DRAGON table
      if (!prefersReduced && react > 0.35) {
        const burstCount = Math.max(1, Math.round(dt * 125 * react));
        for (let i = 0; i < burstCount; i++) {
          const isGold = Math.random() < 0.3;
          const ang = -Math.PI / 2 + (Math.random() - 0.5) * 0.65;
          const spd = 75 + Math.random() * 120;
          particles.push({
            x: head.x + (Math.random() - 0.5) * 10,
            y: head.y - 8,
            vx: Math.cos(ang) * spd,
            vy: Math.sin(ang) * spd,
            size: 6 + Math.random() * 7.5,
            life: 0,
            maxLife: 0.35 + Math.random() * 0.24,
            kind: isGold ? 'goldFire' : 'blueFire',
          });
        }
      }
    };

    const drawTiger3D = (w: number, h: number, t: number, dt: number, react: number) => {
      const patrolAngle = t * 0.92 + 0.5;
      const patrolX = w * 0.745 + Math.sin(patrolAngle) * (w * 0.135);
      const patrolY = h * 0.6 + Math.cos(patrolAngle * 2) * (h * 0.1);
      const vx = Math.cos(patrolAngle);

      const leapCycle = react > 0.05 ? Math.abs(Math.sin(t * 5.2)) : 0;
      const leapLift = react * (11 + leapCycle * 12);
      const posX = patrolX + (w * 0.73 - patrolX) * react * 0.65;
      const posY = patrolY + (h * 0.46 - patrolY) * react * 0.55 - leapLift;
      const facing = react > 0.3 ? -1 : vx >= 0 ? 1 : -1;

      const bodyScale = Math.max(0.95, Math.min(1.42, Math.min(w, h) / 72));
      const stride = t * 5.8;
      const bob = Math.abs(Math.sin(stride)) * 2.1 * (1 - react * 0.4);

      // Glowing Imperial Amber Energy Aura Beneath Tiger
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const auraR = Math.max(38, Math.min(w, h) * 0.5) * (1 + react * 0.25);
      const auraGrad = ctx.createRadialGradient(posX, posY, 4, posX, posY, auraR);
      auraGrad.addColorStop(0, `rgba(251, 191, 36, ${0.34 + react * 0.28})`);
      auraGrad.addColorStop(0.55, `rgba(234, 88, 12, ${0.18 + react * 0.16})`);
      auraGrad.addColorStop(1, 'rgba(217, 119, 6, 0)');
      ctx.fillStyle = auraGrad;
      ctx.beginPath();
      ctx.arc(posX, posY, auraR, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Soft volumetric ground contact shadow anchored on the marble floor below the leap
      ctx.save();
      const shadowY = patrolY + 13 * bodyScale;
      const shadowAlpha = Math.max(0.26, 0.56 - leapLift * 0.012);
      ctx.fillStyle = `rgba(2, 6, 23, ${shadowAlpha})`;
      ctx.beginPath();
      ctx.ellipse(posX, shadowY, 23 * bodyScale, 7 * bodyScale, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.translate(posX, posY - bob);
      ctx.scale(facing * bodyScale, bodyScale);

      const drawLeg = (hipX: number, hipY: number, phaseOffset: number, isFar: boolean) => {
        const swing = react > 0.25 ? 0.55 : Math.sin(stride + phaseOffset) * 0.46;
        const lift = react > 0.25 ? -3 : Math.max(0, -Math.cos(stride + phaseOffset)) * 3.5;
        const footX = hipX + Math.sin(swing) * 8.5;
        const footY = hipY + 13 - lift;
        const kneeX = (hipX + footX) * 0.5 + 2.2;
        const kneeY = (hipY + footY) * 0.5 - 1;

        ctx.strokeStyle = isFar ? '#92400e' : '#f59e0b';
        ctx.lineWidth = isFar ? 4.4 : 5.1;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(hipX, hipY);
        ctx.lineTo(kneeX, kneeY);
        ctx.lineTo(footX, footY);
        ctx.stroke();

        // Dark tiger leg stripes
        ctx.strokeStyle = '#291003';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(hipX - 1.5, hipY + 4);
        ctx.lineTo(hipX + 2.2, hipY + 4.5);
        ctx.stroke();

        // Golden-ivory paw
        ctx.fillStyle = isFar ? '#b45309' : '#fef3c7';
        ctx.beginPath();
        ctx.ellipse(footX + 1.4, footY, 3.2, 2, 0, 0, Math.PI * 2);
        ctx.fill();
      };

      // Swaying articulated Tiger tail
      const tailSway = Math.sin(t * 4.2) * 7;
      ctx.strokeStyle = '#d97706';
      ctx.lineWidth = 3.8;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-16, -2);
      ctx.bezierCurveTo(-24, -4 + tailSway * 0.4, -29, -11 + tailSway, -34, -8 + tailSway * 0.8);
      ctx.stroke();
      ctx.strokeStyle = '#1f0b02';
      ctx.lineWidth = 2.1;
      ctx.beginPath();
      ctx.moveTo(-28, -9 + tailSway * 0.65);
      ctx.lineTo(-32, -8.5 + tailSway * 0.78);
      ctx.stroke();

      // Far-side legs (depth shaded)
      drawLeg(-12, 3, Math.PI, true);
      drawLeg(11, 3, 0, true);

      // 3D-shaded metallic-gold muscular Tiger torso
      const bodyGrad = ctx.createRadialGradient(4, -5.5, 2, 0, 0, 23);
      bodyGrad.addColorStop(0, '#fffbeb');
      bodyGrad.addColorStop(0.28, '#fde047');
      bodyGrad.addColorStop(0.62, '#d97706');
      bodyGrad.addColorStop(1, '#5c1d07');
      ctx.fillStyle = bodyGrad;
      ctx.beginPath();
      ctx.ellipse(0, 0, 19.5, 9.6, react > 0.25 ? -0.18 : 0, 0, Math.PI * 2);
      ctx.fill();

      // Pale golden belly fur
      ctx.fillStyle = 'rgba(254, 243, 199, 0.78)';
      ctx.beginPath();
      ctx.ellipse(1, 6.2, 12.5, 2.9, 0, 0, Math.PI * 2);
      ctx.fill();

      // Curved obsidian-brown Tiger stripes along 3D body contour
      ctx.strokeStyle = '#1f0b02';
      ctx.lineWidth = 2.1;
      ctx.lineCap = 'round';
      [-10, -4, 2, 8].forEach((sx, idx) => {
        ctx.beginPath();
        ctx.moveTo(sx, -7.5 + (idx === 0 ? 1.5 : 0));
        ctx.quadraticCurveTo(sx - 2.2, -1, sx + 0.5, 4.6);
        ctx.stroke();
      });

      // Near-side legs
      drawLeg(-11, 3, 0, false);
      drawLeg(12, 3, Math.PI, false);

      // Sculpted Metallic 3D Imperial Tiger Head
      const headX = 18.5;
      const headY = -5 - react * 2;
      ctx.save();
      ctx.translate(headX, headY);

      // Rounded golden ears with dark rims
      ctx.fillStyle = '#d97706';
      ctx.beginPath();
      ctx.arc(-4, -7.8, 3.4, 0, Math.PI * 2);
      ctx.arc(3, -8, 3.4, 0, Math.PI * 2);
      ctx.fill();

      const hGrad = ctx.createRadialGradient(-1, -3.5, 1, 0, 0, 11);
      hGrad.addColorStop(0, '#fffbeb');
      hGrad.addColorStop(0.32, '#fde047');
      hGrad.addColorStop(0.7, '#d97706');
      hGrad.addColorStop(1, '#5c1d07');
      ctx.fillStyle = hGrad;
      ctx.beginPath();
      ctx.ellipse(1, 0, 10, 8.6, 0, 0, Math.PI * 2);
      ctx.fill();

      // Cheek ruff + muzzle
      ctx.fillStyle = '#fef3c7';
      ctx.beginPath();
      ctx.ellipse(5.5, 2.8, 4.6, 3.4, 0, 0, Math.PI * 2);
      ctx.fill();

      // Forehead stripes
      ctx.strokeStyle = '#1f0b02';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-2, -6);
      ctx.lineTo(1.5, -4);
      ctx.moveTo(-4, -3.5);
      ctx.lineTo(0, -2.5);
      ctx.stroke();

      // Intense Glowing Amber Eyes
      ctx.shadowColor = '#fbbf24';
      ctx.shadowBlur = 9;
      ctx.fillStyle = '#fef08a';
      ctx.beginPath();
      ctx.arc(4.2, -2, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Nose
      ctx.fillStyle = '#450a0a';
      ctx.beginPath();
      ctx.arc(8.8, 1.4, 1.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
      ctx.restore();

      // Richer swirling golden dust sparks kicked up around prowling paws
      if (!prefersReduced && Math.random() < dt * 32) {
        particles.push({
          x: posX + (Math.random() - 0.5) * 28,
          y: shadowY - 2 + (Math.random() - 0.5) * 6,
          vx: -facing * (10 + Math.random() * 18),
          vy: -10 - Math.random() * 18,
          size: 1.6 + Math.random() * 2.2,
          life: 0,
          maxLife: 0.62 + Math.random() * 0.42,
          kind: 'goldDust',
        });
      }

      // Winner reaction: Tiger leaps forward & unleashes golden roar shockwaves
      if (!prefersReduced && react > 0.35) {
        roarCooldown -= dt;
        if (roarCooldown <= 0) {
          roarCooldown = 0.26;
          roarRings.push({
            x: posX + facing * 14 * bodyScale,
            y: posY - bob - 5,
            r: 8,
            maxR: Math.max(w * 0.26, 78),
            color: roarRings.length % 2 === 0 ? '#fde047' : '#f97316',
          });
        }
        if (Math.random() < dt * 54) {
          const ang = -Math.PI * 0.55 + (Math.random() - 0.5) * 1.3;
          const spd = 70 + Math.random() * 95;
          particles.push({
            x: posX + facing * 12,
            y: posY - bob - 4,
            vx: Math.cos(ang) * spd,
            vy: Math.sin(ang) * spd,
            size: 4.5 + Math.random() * 5.5,
            life: 0,
            maxLife: 0.36 + Math.random() * 0.22,
            kind: 'goldFire',
          });
        }
      }
    };

    const renderFrame = (now: number) => {
      if (!alive) return;
      const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
      lastTime = now;
      const elapsed = (now - startTime) / 1000;
      const { w, h } = dims;

      const isDragonWin = stateRef.current.phase === 'result' && stateRef.current.winner === 'dragon';
      const isTigerWin = stateRef.current.phase === 'result' && stateRef.current.winner === 'tiger';
      dragonReact = isDragonWin
        ? Math.min(1, dragonReact + dt * 3.8)
        : Math.max(0, dragonReact - dt * 2.6);
      tigerReact = isTigerWin
        ? Math.min(1, tigerReact + dt * 3.8)
        : Math.max(0, tigerReact - dt * 2.6);

      ctx.clearRect(0, 0, w, h);

      const animTime = prefersReduced ? 0.5 : elapsed;
      drawDragon3D(w, h, animTime, dt, dragonReact);
      drawTiger3D(w, h, animTime, dt, tigerReact);

      // Golden Roar Shockwave Rings
      if (roarRings.length > 0) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (let i = roarRings.length - 1; i >= 0; i--) {
          const ring = roarRings[i];
          ring.r += dt * 135;
          const ratio = ring.r / ring.maxR;
          if (ratio >= 1) {
            roarRings.splice(i, 1);
            continue;
          }
          ctx.strokeStyle = ring.color;
          ctx.globalAlpha = Math.max(0, (1 - ratio) * 0.85);
          ctx.lineWidth = Math.max(1.2, 3.2 * (1 - ratio * 0.6));
          ctx.beginPath();
          ctx.ellipse(ring.x, ring.y, ring.r, ring.r * 0.62, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.restore();
      }

      // Embers, Dust & Fire Sparks
      if (particles.length > 0) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (let i = particles.length - 1; i >= 0; i--) {
          const p = particles[i];
          p.life += dt;
          if (p.life >= p.maxLife) {
            particles.splice(i, 1);
            continue;
          }
          const pt = p.life / p.maxLife;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          const alpha = pt < 0.2 ? pt / 0.2 : Math.max(0, 1 - (pt - 0.2) / 0.8);

          if (p.kind === 'blueEmber') {
            ctx.fillStyle = `rgba(125, 211, 252, ${alpha * 0.9})`;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
          } else if (p.kind === 'goldDust') {
            ctx.fillStyle = `rgba(253, 224, 71, ${alpha * 0.85})`;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
          } else if (p.kind === 'blueFire') {
            const r = p.size * (0.7 + pt * 0.8);
            const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
            g.addColorStop(0, `rgba(224, 242, 254, ${alpha * 0.95})`);
            g.addColorStop(0.45, `rgba(56, 189, 248, ${alpha * 0.85})`);
            g.addColorStop(1, 'rgba(29, 78, 216, 0)');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
            ctx.fill();
          } else {
            const r = p.size * (0.7 + pt * 0.8);
            const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
            g.addColorStop(0, `rgba(255, 251, 235, ${alpha * 0.95})`);
            g.addColorStop(0.45, `rgba(251, 191, 36, ${alpha * 0.85})`);
            g.addColorStop(1, 'rgba(217, 119, 6, 0)');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        ctx.restore();
      }

      rafId = window.requestAnimationFrame(renderFrame);
    };

    rafId = window.requestAnimationFrame(renderFrame);

    return () => {
      alive = false;
      window.cancelAnimationFrame(rafId);
      ro.disconnect();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none select-none relative w-full max-w-[460px] sm:max-w-[500px] lg:max-w-[560px] mx-auto h-[98px] sm:h-[112px] shrink-0"
    >
      {/* Perspective-Tilted 3D Dark-Marble & Gold-Inlaid Temple Courtyard Floor */}
      <div
        className="pointer-events-none absolute inset-x-1 sm:inset-x-2 inset-y-0 flex items-end justify-center"
        style={{ perspective: '620px' }}
      >
        <div
          className="relative w-full h-[94px] sm:h-[106px] rounded-2xl border-2 border-[#d4af37]/75 border-b-[5px] border-b-[#6b460a] overflow-hidden shadow-[0_14px_30px_rgba(2,4,16,0.92),inset_0_2px_14px_rgba(251,191,36,0.22)]"
          style={{
            transform: 'rotateX(46deg) scale(0.98, 1.06)',
            transformOrigin: '50% 65%',
            background:
              'linear-gradient(125deg, rgba(255,255,255,0.03) 0%, transparent 18%, rgba(255,255,255,0.025) 36%, transparent 56%), radial-gradient(ellipse 85% 75% at 50% 42%, #141838 0%, #090b1d 60%, #050610 100%)',
          }}
        >
          {/* Inlaid Brushed-Gold Inner Courtyard Border */}
          <div className="absolute inset-[5px] rounded-xl border border-[#f6dc93]/40 shadow-[inset_0_0_14px_rgba(212,175,55,0.16)]" />

          {/* Glowing Rune Tracks & Center Temple Crest */}
          <svg
            viewBox="0 0 400 100"
            preserveAspectRatio="none"
            className="absolute inset-0 w-full h-full opacity-85"
            fill="none"
          >
            {/* Left Dragon Figure-Eight Glowing Sapphire Rune Track */}
            <path
              d="M42 52 C42 24, 96 24, 110 52 C124 80, 174 80, 174 52 C174 24, 124 24, 110 52 C96 80, 42 80, 42 52 Z"
              stroke="rgba(56, 189, 248, 0.48)"
              strokeWidth="2.4"
              strokeDasharray="6 4"
            />
            <ellipse
              cx="108"
              cy="52"
              rx="74"
              ry="34"
              stroke="rgba(56, 189, 248, 0.22)"
              strokeWidth="1.2"
            />

            {/* Right Tiger Prowling Golden Rune Track */}
            <ellipse
              cx="292"
              cy="52"
              rx="74"
              ry="34"
              stroke="rgba(251, 191, 36, 0.48)"
              strokeWidth="2.4"
              strokeDasharray="6 4"
            />
            <ellipse
              cx="292"
              cy="52"
              rx="52"
              ry="22"
              stroke="rgba(245, 158, 11, 0.26)"
              strokeWidth="1.2"
            />

            {/* Center Gold Inlaid Temple Seal */}
            <line
              x1="200"
              y1="10"
              x2="200"
              y2="90"
              stroke="rgba(246, 220, 147, 0.32)"
              strokeWidth="1.4"
            />
            <circle
              cx="200"
              cy="52"
              r="14"
              stroke="rgba(246, 220, 147, 0.65)"
              strokeWidth="1.6"
              fill="rgba(16, 18, 44, 0.7)"
            />
            <circle cx="200" cy="52" r="5" fill="rgba(253, 224, 71, 0.65)" />
          </svg>
        </div>
      </div>

      {/* 60fps Animated 3D-Shaded Dragon & Tiger Canvas */}
      <canvas
        ref={canvasRef}
        className="pointer-events-none absolute inset-0 z-10 w-full h-full"
      />
    </div>
  );
}

export default function DragonTigerPage() {
  const {
    balance,
    profile,
    graphicsQuality,
    soundEnabled,
    gameConfigs,
    placeBet,
    settleRound,
    updateAudio,
    pushToast,
  } = useApp();
  const cfg = gameConfigs.dragon_tiger;

  const [selectedChip, setSelectedChip] = useState<ChipValue>(10);
  const [bets, setBets] = useState<{ dragon: number; tiger: number; tie: number }>({
    dragon: 0,
    tiger: 0,
    tie: 0,
  });
  const [tablePool, setTablePool] = useState<{ dragon: number; tiger: number; tie: number }>({
    dragon: 0,
    tiger: 0,
    tie: 0,
  });
  const [zoneChips, setZoneChips] = useState<Record<BetZone, ChipVisual[]>>({
    dragon: [],
    tie: [],
    tiger: [],
  });
  const [leftSeats, setLeftSeats] = useState<SeatPlayer[]>(INITIAL_SEATS_LEFT);
  const [rightSeats, setRightSeats] = useState<SeatPlayer[]>(INITIAL_SEATS_RIGHT);

  // Live auto-running table by default!
  const [phase, setPhase] = useState<'betting' | 'dealing' | 'revealing' | 'result'>('betting');
  const [revealStep, setRevealStep] = useState<0 | 1 | 2>(0);
  const [countdown, setCountdown] = useState(BETTING_SECONDS);
  const [autoLoop] = useState(true);
  const [splashBanner, setSplashBanner] = useState<{
    text: string;
    tone: 'gold' | 'crimson' | 'dragon' | 'tiger' | 'tie';
  } | null>({ text: 'START BETTING!', tone: 'gold' });
  const [winPopup, setWinPopup] = useState<number>(0);

  const [dragonCard, setDragonCard] = useState<PlayingCard | null>(null);
  const [tigerCard, setTigerCard] = useState<PlayingCard | null>(null);
  const [winner, setWinner] = useState<'dragon' | 'tiger' | 'tie' | null>(null);
  const [lastOutcomeMsg, setLastOutcomeMsg] = useState<string>('');
  const [preparedRound, setPreparedRound] = useState<PrepareResponse | null>(null);
  const [fairProof, setFairProof] = useState<ProvablyFairProof | null>(null);
  const [fairModalOpen, setFairModalOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [myHistory, setMyHistory] = useState<RoundHistoryEntry[]>([]);
  const [roadmap, setRoadmap] = useState<Array<'D' | 'T' | 'X'>>(INITIAL_ROADMAP);
  const [stats, setStats] = useState({ dragon: 5, tiger: 4, tie: 1 });

  const [flyingChips, setFlyingChips] = useState<FlyingChip[]>([]);
  const [sweepingChips, setSweepingChips] = useState<SweepingChip[]>([]);
  const [winnerCelebration, setWinnerCelebration] = useState<WinnerCelebrationState | null>(null);
  const [zoneShockwaves, setZoneShockwaves] = useState<Record<BetZone, number>>({
    dragon: 0,
    tie: 0,
    tiger: 0,
  });

  const betsRef = useRef(bets);
  betsRef.current = bets;
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const balanceRef = useRef(balance);
  balanceRef.current = balance;
  const preparedRoundRef = useRef<PrepareResponse | null>(null);
  preparedRoundRef.current = preparedRound;
  const leftSeatsRef = useRef(leftSeats);
  leftSeatsRef.current = leftSeats;
  const rightSeatsRef = useRef(rightSeats);
  rightSeatsRef.current = rightSeats;
  const timersRef = useRef<number[]>([]);
  const mountedRef = useRef(true);
  const dealingLockRef = useRef(false);
  const shellRef = useRef<HTMLDivElement>(null);
  const playerAvatarRef = useRef<HTMLDivElement>(null);
  const zoneRefs = useRef<Record<BetZone, HTMLButtonElement | null>>({
    dragon: null,
    tie: null,
    tiger: null,
  });
  const seatRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const chipButtonRefs = useRef<Partial<Record<ChipValue, HTMLButtonElement | null>>>({});
  const zoneChipsRef = useRef<Record<BetZone, ChipVisual[]>>({
    dragon: [],
    tie: [],
    tiger: [],
  });

  const totalBet = bets.dragon + bets.tiger + bets.tie;
  // Live visual available balance updates instantly as chips are tossed onto Dragon/Tie/Tiger
  const liveAvailableBalance =
    phase === 'betting' ? Math.max(0, balance - totalBet) : balance;

  const backGuard = useGameBackGuard(totalBet > 0 || phase === 'dealing' || phase === 'revealing', '/games');

  const scheduleTimer = useCallback((fn: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      timersRef.current = timersRef.current.filter((t) => t !== id);
      if (mountedRef.current) fn();
    }, ms);
    timersRef.current.push(id);
    return id;
  }, []);

  const flashSplash = useCallback(
    (
      text: string,
      tone: 'gold' | 'crimson' | 'dragon' | 'tiger' | 'tie',
      durationMs = 1100,
    ) => {
      setSplashBanner({ text, tone });
      scheduleTimer(() => {
        setSplashBanner((curr) => (curr?.text === text ? null : curr));
      }, durationMs);
    },
    [scheduleTimer],
  );

  // Unlock browser Web Audio on first tap anywhere in Dragon Tiger
  useEffect(() => {
    const unlock = () => soundEngine.unlock();
    window.addEventListener('pointerdown', unlock, { once: true, passive: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
    };
  }, []);

  // Cleanup all scheduled timers & speech on unmount
  useEffect(() => {
    mountedRef.current = true;
    const hideInitSplash = window.setTimeout(() => {
      if (mountedRef.current) setSplashBanner(null);
    }, 1200);
    return () => {
      mountedRef.current = false;
      window.clearTimeout(hideInitSplash);
      timersRef.current.forEach((id) => window.clearTimeout(id));
      timersRef.current = [];
      try {
        window.speechSynthesis?.cancel();
      } catch {
        // ignore
      }
    };
  }, []);

  // Pre-commit next round SHA-256 serverSeedHash BEFORE player places bets
  const prepareNextRound = useCallback(async () => {
    try {
      const resp = await fetch('/api/games/dragon-tiger/prepare', { method: 'POST' });
      if (!resp.ok || !mountedRef.current) return;
      const data = (await resp.json()) as PrepareResponse;
      setPreparedRound(data);
      setFairProof((prev) => {
        if (prev && prev.status === 'revealed') return prev;
        return {
          game: 'dragon_tiger',
          roundId: data.roundId,
          serverSeedHash: data.serverSeedHash || data.seedHash,
          status: 'committed',
        };
      });
    } catch {
      // non-fatal, deal endpoint falls back cleanly
    }
  }, []);

  useEffect(() => {
    void prepareNextRound();
  }, [prepareNextRound]);

  const handleFlyingChipLanded = useCallback((chipId: string, zone: BetZone) => {
    const updatedList = zoneChipsRef.current[zone].map((c) =>
      c.id === chipId ? { ...c, landed: true } : c,
    );
    zoneChipsRef.current = { ...zoneChipsRef.current, [zone]: updatedList };
    setZoneChips(zoneChipsRef.current);
    setFlyingChips((prev) => prev.filter((fc) => fc.id !== chipId));
    setZoneShockwaves((prev) => ({ ...prev, [zone]: prev[zone] + 1 }));
  }, []);

  const appendChipVisual = useCallback(
    (
      zone: BetZone,
      value: ChipValue,
      owner: 'player' | 'left_seat' | 'right_seat' | 'table',
      forcedId?: string,
      originSeatSeed?: string,
    ) => {
      const chipId = forcedId || `${owner}_${zone}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

      const hashSeed = (str: string) => {
        let h = 2166136261;
        for (let i = 0; i < str.length; i++) {
          h ^= str.charCodeAt(i);
          h = Math.imul(h, 16777619);
        }
        return h >>> 0;
      };

      const createSeededRng = (seed: number) => {
        let s = seed || 1;
        return () => {
          s = (s + 0x6d2b79f5) | 0;
          let t = Math.imul(s ^ (s >>> 15), 1 | s);
          t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
          return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
      };

      const rng = createSeededRng(hashSeed(`${zone}_${chipId}`));
      const phaseX = rng();
      const phaseY = rng();
      const rotate = Number((rng() * 30 - 15).toFixed(1));

      // Reference box dimensions to enforce clean spacing first, then natural 10-14px pile overlap
      const refW = zone === 'tie' ? 86 : 124;
      const refH = 160;
      const idealDistPx = 20;
      const pileMinDistPx = 10;

      // R2 low-discrepancy organic scatter inside x: [16%, 84%] and y: [52%, 84%]
      const phi1 = 0.7548776662466927;
      const phi2 = 0.5698402909980532;

      const pickSpot = (list: ChipVisual[]) => {
        let bestX = 16 + phaseX * 68;
        let bestY = 52 + phaseY * 32;
        let bestMinDist = -1;
        let pileX = bestX;
        let pileY = bestY;
        let pileBestDist = -1;

        for (let k = 0; k < 96; k++) {
          const u = (phaseX + k * phi1) % 1;
          const v = (phaseY + k * phi2) % 1;
          const x = 16 + u * 68;
          const y = 52 + v * 32;

          let minDist = Infinity;
          for (const existing of list) {
            const dx = ((existing.offsetX - x) / 100) * refW;
            const dy = ((existing.offsetY - y) / 100) * refH;
            const d = Math.hypot(dx, dy);
            if (d < minDist) minDist = d;
          }

          if (minDist >= idealDistPx) {
            return { x, y };
          }
          if (minDist >= pileMinDistPx && minDist <= 14 && minDist > pileBestDist) {
            pileBestDist = minDist;
            pileX = x;
            pileY = y;
          }
          if (minDist > bestMinDist) {
            bestMinDist = minDist;
            bestX = x;
            bestY = y;
          }
        }

        if (pileBestDist >= pileMinDistPx) {
          return { x: pileX, y: pileY };
        }
        return { x: bestX, y: bestY };
      };

      const currentList = zoneChipsRef.current[zone];
      const chosen = pickSpot(currentList);
      const offsetX = Number(chosen.x.toFixed(2));
      const offsetY = Number(chosen.y.toFixed(2));

      const shellRect = shellRef.current?.getBoundingClientRect();
      const zoneRect = zoneRefs.current[zone]?.getBoundingClientRect();

      let originEl: HTMLElement | null = null;
      if (owner === 'player') {
        originEl = chipButtonRefs.current[value] ?? null;
      } else if (originSeatSeed) {
        const deskEl = seatRefs.current[`desk_${originSeatSeed}`];
        const mobEl = seatRefs.current[`mob_${originSeatSeed}`];
        if (deskEl && deskEl.getBoundingClientRect().width > 0) {
          originEl = deskEl;
        } else if (mobEl && mobEl.getBoundingClientRect().width > 0) {
          originEl = mobEl;
        } else {
          const fallbackSeed = owner === 'left_seat' ? 'seat_l2' : 'seat_r2';
          const fallbackMob = seatRefs.current[`mob_${fallbackSeed}`];
          if (fallbackMob && fallbackMob.getBoundingClientRect().width > 0) {
            originEl = fallbackMob;
          }
        }
      }

      const originRect = originEl?.getBoundingClientRect();
      const canFly = Boolean(
        shellRect &&
          zoneRect &&
          originRect &&
          zoneRect.width > 0 &&
          zoneRect.height > 0 &&
          originRect.width > 0,
      );

      const chipItem: ChipVisual = {
        id: chipId,
        value,
        offsetX,
        offsetY,
        rotate,
        owner,
        landed: !canFly,
      };

      zoneChipsRef.current = {
        ...zoneChipsRef.current,
        [zone]: [...currentList, chipItem],
      };
      setZoneChips(zoneChipsRef.current);

      if (canFly && shellRect && zoneRect && originRect) {
        const fromX = originRect.left + originRect.width / 2 - shellRect.left;
        const fromY = originRect.top + originRect.height / 2 - shellRect.top;
        const toX = zoneRect.left - shellRect.left + (offsetX / 100) * zoneRect.width;
        const toY = zoneRect.top - shellRect.top + (offsetY / 100) * zoneRect.height;
        setFlyingChips((prev) => [
          ...prev,
          { id: chipId, zone, value, fromX, fromY, toX, toY, rotate },
        ]);
      } else {
        setZoneShockwaves((prev) => ({ ...prev, [zone]: prev[zone] + 1 }));
      }

      return chipId;
    },
    [],
  );

  // Place player chip on Dragon, Tie, or Tiger
  const addChipToZone = useCallback(
    (zone: BetZone, customAmount?: ChipValue) => {
      soundEngine.unlock();
      if (phaseRef.current !== 'betting') {
        pushToast('Betting closed for this hand — wait for next round!', 'gold');
        return;
      }
      if (!cfg.enabled) {
        pushToast('Dragon Tiger is temporarily paused by administrator.', 'crimson');
        return;
      }
      const chipVal = customAmount ?? selectedChip;
      const currentTotal = betsRef.current.dragon + betsRef.current.tiger + betsRef.current.tie;
      if (currentTotal + chipVal > balanceRef.current) {
        pushToast('Insufficient virtual coins for that chip.', 'crimson');
        return;
      }
      if (currentTotal + chipVal > cfg.maxBet) {
        pushToast(`Table max wager is ${cfg.maxBet.toLocaleString()} coins.`, 'gold');
        return;
      }
      soundEngine.playChipPlace();
      setBets((prev) => ({ ...prev, [zone]: prev[zone] + chipVal }));
      appendChipVisual(zone, chipVal, 'player');
    },
    [appendChipVisual, cfg.enabled, cfg.maxBet, pushToast, selectedChip],
  );

  // Live side-seat players placing animated chips during the betting window
  useEffect(() => {
    if (phase !== 'betting' || !autoLoop) return;
    const interval = window.setInterval(() => {
      if (!mountedRef.current || phaseRef.current !== 'betting') return;
      const roll = Math.random();
      const zone: BetZone = roll < 0.44 ? 'dragon' : roll < 0.88 ? 'tiger' : 'tie';
      const chipChoices: ChipValue[] = [10, 50, 100, 500];
      const chip = chipChoices[Math.floor(Math.random() * chipChoices.length)];
      const isLeft = Math.random() < 0.5;
      const idx = Math.floor(Math.random() * 3);
      const seatSeed = (isLeft ? INITIAL_SEATS_LEFT : INITIAL_SEATS_RIGHT)[idx]?.seed;
      setTablePool((prev) => ({ ...prev, [zone]: prev[zone] + chip }));
      appendChipVisual(zone, chip, isLeft ? 'left_seat' : 'right_seat', undefined, seatSeed);
      soundEngine.playSoftTableChip();
      const updater = (seats: SeatPlayer[]) =>
        seats.map((s, i) =>
          i === idx
            ? { ...s, coins: Math.max(1200, s.coins - chip), lastBetZone: zone, lastWin: 0 }
            : s,
        );
      if (isLeft) setLeftSeats(updater);
      else setRightSeats(updater);
    }, 1050);
    return () => window.clearInterval(interval);
  }, [appendChipVisual, autoLoop, phase]);

  // Execute authoritative server deal -> sequential 3D flips -> Dragon/Tiger audio & payout
  const runDeal = useCallback(async () => {
    if (phaseRef.current !== 'betting' || dealingLockRef.current) return;
    dealingLockRef.current = true;

    let activeBets = { ...betsRef.current };
    let wager = activeBets.dragon + activeBets.tiger + activeBets.tie;

    // Never freeze the auto-table if wager < minBet; cleanly refund uncommitted chips and deal watch-mode
    const effectiveMin = Math.max(1, cfg.minBet || 1);
    if (wager > 0 && wager < effectiveMin) {
      pushToast(`Minimum wager is ₹${effectiveMin} — round running in watch mode.`, 'gold');
      activeBets = { dragon: 0, tiger: 0, tie: 0 };
      wager = 0;
      setBets({ dragon: 0, tiger: 0, tie: 0 });
    }

    setPhase('dealing');
    setRevealStep(0);
    setWinner(null);
    setWinPopup(0);
    setLastOutcomeMsg('STOP BETTING · DEALING CARDS');
    soundEngine.playBettingStop(true);
    flashSplash('STOP BETTING!', 'crimson', 850);

    const committedId = preparedRoundRef.current?.roundId;
    let dealData: DealResponse;
    try {
      const resp = await fetch('/api/games/dragon-tiger/deal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roundId: committedId, betAmount: wager, bets: activeBets }),
      });
      if (!resp.ok) throw new Error('Deal service unavailable');
      dealData = (await resp.json()) as DealResponse;
    } catch {
      pushToast('Reconnecting to fair-deal server...', 'crimson');
      dealingLockRef.current = false;
      setCountdown(BETTING_SECONDS);
      setPhase('betting');
      return;
    }

    if (!mountedRef.current) return;

    if (wager > 0) {
      try {
        await placeBet(
          'dragon_tiger',
          wager,
          dealData.roundId,
          `Dragon Tiger wager (D:${activeBets.dragon} / T:${activeBets.tiger} / Tie:${activeBets.tie})`,
        );
      } catch (err) {
        pushToast(err instanceof Error ? err.message : 'Unable to lock bet.', 'crimson');
        activeBets = { dragon: 0, tiger: 0, tie: 0 };
        wager = 0;
      }
    }

    // 1. Cards swoosh onto the 3D stage
    soundEngine.playCardDeal();
    setDragonCard(dealData.dragonCard);
    setTigerCard(dealData.tigerCard);

    // 2. Flip DRAGON card first (dramatic suspense!)
    scheduleTimer(() => {
      soundEngine.playCardFlip();
      setPhase('revealing');
      setRevealStep(1);
    }, 520);

    // 3. Flip TIGER card second
    scheduleTimer(() => {
      soundEngine.playCardFlip();
      setRevealStep(2);
    }, 1150);

    // 4. Announce Winner + Dragon/Tiger Roar + Coin Shower Payout
    scheduleTimer(async () => {
      setWinner(dealData.winner);
      setPhase('result');

      const suitIcon = (s: PlayingCard['suit']) =>
        s === 'spades' ? '♠' : s === 'hearts' ? '♥' : s === 'diamonds' ? '♦' : '♣';
      const dTxt = `${dealData.dragonCard.label}${suitIcon(dealData.dragonCard.suit)}`;
      const tTxt = `${dealData.tigerCard.label}${suitIcon(dealData.tigerCard.suit)}`;
      const winnerLabel =
        dealData.winner === 'dragon'
          ? 'DRAGON WINS!'
          : dealData.winner === 'tiger'
            ? 'TIGER WINS!'
            : 'TIE 8:1!';

      // Play authentic winner roar / fanfare + voice announcement
      if (dealData.winner === 'dragon') soundEngine.playDragonWin(true);
      else if (dealData.winner === 'tiger') soundEngine.playTigerWin(true);
      else soundEngine.playTieJackpot(true);

      flashSplash(winnerLabel, dealData.winner, 2100);

      const committedHash = dealData.serverSeedHash || dealData.seedHash;
      setFairProof({
        game: 'dragon_tiger',
        roundId: dealData.roundId,
        serverSeedHash: committedHash,
        serverSeed: dealData.serverSeed,
        outcomeLabel: `${winnerLabel} (${dTxt} vs ${tTxt})`,
        status: 'revealed',
      });

      const tag: 'D' | 'T' | 'X' =
        dealData.winner === 'dragon' ? 'D' : dealData.winner === 'tiger' ? 'T' : 'X';
      setRoadmap((prev) => [tag, ...prev].slice(0, 20));
      setStats((prev) => ({ ...prev, [dealData.winner]: prev[dealData.winner] + 1 }));

      // Credit winning side-seat players visually
      const awardSeats = (seats: SeatPlayer[]) =>
        seats.map((s) => {
          if (s.lastBetZone === dealData.winner) {
            const gain = dealData.winner === 'tie' ? 1600 : 400;
            return { ...s, coins: s.coins + gain, lastWin: gain };
          }
          return { ...s, lastWin: 0 };
        });
      setLeftSeats(awardSeats);
      setRightSeats(awardSeats);

      let payout = 0;
      if (typeof dealData.payout === 'number' && Number.isFinite(dealData.payout) && wager > 0) {
        payout = Math.max(0, Math.round(dealData.payout));
      } else if (dealData.winner === 'dragon') {
        payout = activeBets.dragon * 2;
      } else if (dealData.winner === 'tiger') {
        payout = activeBets.tiger * 2;
      } else {
        payout = activeBets.tie * 9 + Math.floor((activeBets.dragon + activeBets.tiger) * 0.5);
      }

      if (wager > 0) {
        const net = payout - wager;
        const outcome: 'win' | 'loss' | 'tie' =
          net > 0 ? 'win' : dealData.winner === 'tie' && payout > 0 ? 'tie' : 'loss';

        setMyHistory((prev) => [
          {
            id: dealData.roundId,
            dragonText: dTxt,
            tigerText: tTxt,
            winner: dealData.winner,
            wager,
            payout,
            net,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          },
          ...prev.slice(0, 24),
        ]);

        setLastOutcomeMsg(
          net > 0
            ? `${winnerLabel} (${dTxt} vs ${tTxt}) · +${net.toLocaleString()} coins`
            : net === 0
              ? `${winnerLabel} (${dTxt} vs ${tTxt}) · Refunded`
              : `${winnerLabel} (${dTxt} vs ${tTxt}) · ${net.toLocaleString()} coins`,
        );

        if (net > 0) {
          setWinPopup(payout);
          scheduleTimer(() => soundEngine.playCoinShower(), 240);
          pushToast(
            dealData.payoutCapped && dealData.maxRoundPayoutCap
              ? `You won +${payout.toLocaleString()} virtual coins (Round payout cap ₹${dealData.maxRoundPayoutCap.toLocaleString()} applied).`
              : `You won +${payout.toLocaleString()} virtual coins!`,
            'emerald',
          );
        } else {
          scheduleTimer(() => soundEngine.playLoseTone(), 260);
        }

        try {
          await settleRound({
            game: 'dragon_tiger',
            betAmount: wager,
            payout,
            outcome,
            summary: `${winnerLabel}: Dragon ${dTxt} vs Tiger ${tTxt}`,
            roundId: dealData.roundId,
            seedHash: committedHash,
          });
        } catch (err) {
          console.error('Settlement sync error:', err);
        }
      } else {
        setLastOutcomeMsg(`${winnerLabel} (${dTxt} vs ${tTxt}) · Next round starting`);
      }

      // 5. Reset table & start next live round automatically!
      scheduleTimer(() => {
        dealingLockRef.current = false;
        setBets({ dragon: 0, tiger: 0, tie: 0 });
        setTablePool({ dragon: 0, tiger: 0, tie: 0 });
        zoneChipsRef.current = { dragon: [], tie: [], tiger: [] };
        setZoneChips(zoneChipsRef.current);
        setFlyingChips([]);
        setSweepingChips([]);
        setWinnerCelebration(null);
        setRevealStep(0);
        setWinPopup(0);
        setLastOutcomeMsg('');
        setCountdown(BETTING_SECONDS);
        setPhase('betting');
        soundEngine.playBettingStart(true);
        flashSplash('START BETTING!', 'gold', 1050);
        void prepareNextRound();
      }, 3100);
    }, 1820);
  }, [cfg.minBet, flashSplash, placeBet, prepareNextRound, pushToast, scheduleTimer, settleRound]);

  // Settlement Winner Chip Sweep: smoothly sweep losing chips through the winning zone & winner avatars before round reset
  useEffect(() => {
    if (phase !== 'result' || !winner) return;

    let clearSweepTimer = 0;
    const startSweepTimer = window.setTimeout(() => {
      if (!mountedRef.current || phaseRef.current !== 'result') return;
      const shellRect = shellRef.current?.getBoundingClientRect();
      const winZoneRect = zoneRefs.current[winner]?.getBoundingClientRect();
      if (!shellRect || !winZoneRect || winZoneRect.width <= 0) return;

      const winCenterX = winZoneRect.left - shellRect.left + winZoneRect.width / 2;
      const winCenterY = winZoneRect.top - shellRect.top + winZoneRect.height * 0.65;

      const avatarTargets: Array<{ x: number; y: number }> = [];
      const allSeats = [...leftSeatsRef.current, ...rightSeatsRef.current];
      allSeats.forEach((seat) => {
        if (seat.lastBetZone === winner) {
          const deskEl = seatRefs.current[`desk_${seat.seed}`];
          const mobEl = seatRefs.current[`mob_${seat.seed}`];
          const targetEl =
            deskEl && deskEl.getBoundingClientRect().width > 0
              ? deskEl
              : mobEl && mobEl.getBoundingClientRect().width > 0
                ? mobEl
                : null;
          if (targetEl) {
            const r = targetEl.getBoundingClientRect();
            avatarTargets.push({
              x: r.left + r.width / 2 - shellRect.left,
              y: r.top + r.height / 2 - shellRect.top,
            });
          }
        }
      });

      if (betsRef.current[winner] > 0 && playerAvatarRef.current) {
        const pr = playerAvatarRef.current.getBoundingClientRect();
        if (pr.width > 0) {
          avatarTargets.push({
            x: pr.left + pr.width / 2 - shellRect.left,
            y: pr.top + pr.height / 2 - shellRect.top,
          });
        }
      }

      const losingZones = (['dragon', 'tie', 'tiger'] as const).filter((z) => z !== winner);
      const nextSweeping: SweepingChip[] = [];
      const nextZoneChips: Record<BetZone, ChipVisual[]> = { ...zoneChipsRef.current };
      let idxCounter = 0;

      losingZones.forEach((lz) => {
        const lzRect = zoneRefs.current[lz]?.getBoundingClientRect();
        const chips = zoneChipsRef.current[lz];
        if (!lzRect || lzRect.width <= 0 || chips.length === 0) return;

        chips.forEach((chip) => {
          const fromX = lzRect.left - shellRect.left + (chip.offsetX / 100) * lzRect.width;
          const fromY = lzRect.top - shellRect.top + (chip.offsetY / 100) * lzRect.height;
          const jitterX = ((idxCounter % 5) - 2) * 8;
          const jitterY = (((idxCounter + 2) % 3) - 1) * 7;
          const midX = winCenterX + jitterX;
          const midY = winCenterY + jitterY;
          const avatarDest =
            avatarTargets.length > 0 ? avatarTargets[idxCounter % avatarTargets.length] : null;
          const toX = avatarDest ? avatarDest.x : midX;
          const toY = avatarDest ? avatarDest.y : midY;

          nextSweeping.push({
            id: `sweep_${chip.id}`,
            value: chip.value,
            fromX,
            fromY,
            midX,
            midY,
            toX,
            toY,
            rotate: chip.rotate,
            delayMs: Math.min(260, idxCounter * 16),
          });
          idxCounter += 1;
        });

        nextZoneChips[lz] = [];
      });

      if (nextSweeping.length > 0) {
        zoneChipsRef.current = nextZoneChips;
        setZoneChips(nextZoneChips);
        setSweepingChips(nextSweeping);
        clearSweepTimer = window.setTimeout(() => {
          if (mountedRef.current) setSweepingChips([]);
        }, 1250);
      }
    }, 640);

    return () => {
      window.clearTimeout(startSweepTimer);
      if (clearSweepTimer) window.clearTimeout(clearSweepTimer);
    };
  }, [phase, winner]);

  // 1.5s Winner Mascot Celebration anchored directly over its own betting box (DRAGON left or TIGER right)
  useEffect(() => {
    if (phase !== 'result' || (winner !== 'dragon' && winner !== 'tiger')) {
      setWinnerCelebration(null);
      return;
    }

    const shellRect = shellRef.current?.getBoundingClientRect();
    const boxRect = zoneRefs.current[winner]?.getBoundingClientRect();
    if (!shellRect || !boxRect || boxRect.width <= 0 || boxRect.height <= 0) return;

    setWinnerCelebration({
      key: Date.now(),
      winner,
      boxLeft: boxRect.left - shellRect.left,
      boxTop: boxRect.top - shellRect.top,
      boxWidth: boxRect.width,
      boxHeight: boxRect.height,
    });

    const hideTimer = window.setTimeout(() => {
      if (mountedRef.current) setWinnerCelebration(null);
    }, 1500);

    return () => {
      window.clearTimeout(hideTimer);
    };
  }, [phase, winner]);

  // Continuous live countdown timer (ticks urgently on 3-2-1, auto-deals at 0!)
  useEffect(() => {
    if (!autoLoop || phase !== 'betting') return;
    if (countdown <= 0) {
      void runDeal();
      return;
    }
    if (countdown <= 3) {
      soundEngine.playCountdownTick(true);
    }
    const timer = window.setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [autoLoop, countdown, phase, runDeal]);

  const totalHands = stats.dragon + stats.tiger + stats.tie;
  const dragonPct = totalHands > 0 ? Math.round((stats.dragon / totalHands) * 100) : 50;
  const tigerPct = totalHands > 0 ? Math.round((stats.tiger / totalHands) * 100) : 50;
  const tiePct = totalHands > 0 ? Math.max(0, 100 - dragonPct - tigerPct) : 0;
  const activeCommitHash = preparedRound?.serverSeedHash || fairProof?.serverSeedHash || '';

  const formatCardFace = (card: PlayingCard | null) => {
    if (!card) return null;
    const suitChar =
      card.suit === 'spades' ? '♠' : card.suit === 'hearts' ? '♥' : card.suit === 'diamonds' ? '♦' : '♣';
    const isRed = card.suit === 'hearts' || card.suit === 'diamonds';
    return { text: `${card.label}${suitChar}`, isRed };
  };
  const showDragonFace = (phase === 'result' || (phase === 'revealing' && revealStep >= 1)) && dragonCard;
  const showTigerFace = (phase === 'result' || (phase === 'revealing' && revealStep >= 2)) && tigerCard;
  const dragonFaceBadge = showDragonFace ? formatCardFace(dragonCard) : null;
  const tigerFaceBadge = showTigerFace ? formatCardFace(tigerCard) : null;

  return (
    <div ref={shellRef} className="game-shell-height relative w-full overflow-hidden flex flex-col bg-[#080a1d]">
      <style>{`
        @keyframes dtEmberFloat {
          0% {
            transform: translate3d(0, 0, 0) scale(0.75);
            opacity: 0;
          }
          18% {
            opacity: 0.78;
          }
          82% {
            opacity: 0.55;
          }
          100% {
            transform: translate3d(var(--dt-drift, 16px), -190px, 0) scale(1.25);
            opacity: 0;
          }
        }
        @keyframes dtLanternSway {
          0%, 100% {
            transform: rotate(-3deg);
          }
          50% {
            transform: rotate(3deg);
          }
        }
        @keyframes dtZoneShockwave {
          0% {
            opacity: 0.95;
            box-shadow: inset 0 0 28px rgba(253, 224, 71, 0.85), 0 0 22px rgba(251, 191, 36, 0.8);
            transform: scale(0.95);
          }
          60% {
            opacity: 0.55;
            box-shadow: inset 0 0 18px rgba(253, 224, 71, 0.45), 0 0 32px rgba(251, 191, 36, 0.55);
            transform: scale(1.015);
          }
          100% {
            opacity: 0;
            box-shadow: inset 0 0 0 rgba(253, 224, 71, 0), 0 0 0 rgba(251, 191, 36, 0);
            transform: scale(1.03);
          }
        }
        @keyframes dtCardFlipFlare {
          0% {
            opacity: 0;
            transform: perspective(600px) rotateY(88deg) scale(0.78);
          }
          45% {
            opacity: 0.92;
            transform: perspective(600px) rotateY(14deg) scale(1.08);
          }
          100% {
            opacity: 0;
            transform: perspective(600px) rotateY(0deg) scale(1.16);
          }
        }
        @keyframes dtCrownFloat {
          0%, 100% {
            transform: translate3d(0, 0, 0) scale(1);
          }
          50% {
            transform: translate3d(0, -4px, 0) scale(1.07);
          }
        }
        @keyframes dtFlameFlicker {
          0%, 100% {
            transform: scale(1) rotate(0deg);
            opacity: 0.78;
          }
          50% {
            transform: scale(1.09) rotate(4deg);
            opacity: 1;
          }
        }
        @keyframes dtDragonSerpentine {
          0% {
            opacity: 0;
            transform: translate3d(-18px, -14px, 0) scale(0.75) rotate(-12deg);
          }
          14% {
            opacity: 1;
            transform: translate3d(22px, 0px, 0) scale(1.08) rotate(10deg);
          }
          32% {
            opacity: 1;
            transform: translate3d(-24px, 16px, 0) scale(1.12) rotate(-14deg);
          }
          50% {
            opacity: 1;
            transform: translate3d(24px, 28px, 0) scale(1.1) rotate(12deg);
          }
          68% {
            opacity: 1;
            transform: translate3d(-20px, 12px, 0) scale(1.08) rotate(-10deg);
          }
          84% {
            opacity: 0.92;
            transform: translate3d(10px, -4px, 0) scale(1.02) rotate(6deg);
          }
          100% {
            opacity: 0;
            transform: translate3d(0px, -16px, 0) scale(0.8) rotate(0deg);
          }
        }
        @keyframes dtTigerLeapRoar {
          0% {
            opacity: 0;
            transform: translate3d(0, 26px, 0) scale(0.72) rotate(6deg);
          }
          18% {
            opacity: 1;
            transform: translate3d(0, -14px, 0) scale(1.18) rotate(-6deg);
          }
          34% {
            opacity: 1;
            transform: translate3d(-5px, -2px, 0) scale(1.14) rotate(5deg);
          }
          48% {
            opacity: 1;
            transform: translate3d(5px, -8px, 0) scale(1.2) rotate(-5deg);
          }
          62% {
            opacity: 1;
            transform: translate3d(-4px, 2px, 0) scale(1.12) rotate(4deg);
          }
          78% {
            opacity: 0.95;
            transform: translate3d(2px, 4px, 0) scale(1.06) rotate(-2deg);
          }
          100% {
            opacity: 0;
            transform: translate3d(0, -10px, 0) scale(0.82) rotate(0deg);
          }
        }
        @keyframes dtBoxFirePulse {
          0% {
            opacity: 0;
          }
          15% {
            opacity: 1;
          }
          80% {
            opacity: 0.9;
          }
          100% {
            opacity: 0;
          }
        }
        @keyframes dtTasselSway {
          0%, 100% {
            transform: rotate(-4deg);
          }
          50% {
            transform: rotate(4deg);
          }
        }
        @keyframes dtUrgentPlaque {
          0%, 100% {
            box-shadow: 0 0 14px rgba(239, 68, 68, 0.72), 0 0 8px rgba(251, 191, 36, 0.55), inset 0 1px 0 rgba(255, 240, 200, 0.35);
            transform: scale(1);
          }
          50% {
            box-shadow: 0 0 24px rgba(239, 68, 68, 0.96), 0 0 14px rgba(251, 191, 36, 0.85), inset 0 1px 0 rgba(255, 240, 200, 0.5);
            transform: scale(1.03);
          }
        }
        @keyframes dtSparkleBurst {
          0% {
            opacity: 0;
            transform: translate3d(0, 0, 0) scale(0.3) rotate(0deg);
          }
          28% {
            opacity: 1;
            transform: translate3d(calc(var(--sx, 20px) * 0.55), calc(var(--sy, -20px) * 0.55), 0) scale(1.1) rotate(90deg);
          }
          100% {
            opacity: 0;
            transform: translate3d(var(--sx, 20px), var(--sy, -20px), 0) scale(0.2) rotate(180deg);
          }
        }
        .dt-ember {
          animation: dtEmberFloat var(--dt-dur, 8s) ease-in-out var(--dt-delay, 0s) infinite;
        }
        .dt-lantern-sway {
          transform-origin: top center;
          animation: dtLanternSway 4.2s ease-in-out infinite;
        }
        .dt-tassel-sway {
          transform-origin: top center;
          animation: dtTasselSway 3.6s ease-in-out infinite;
        }
        .dt-urgent-plaque {
          animation: dtUrgentPlaque 0.72s ease-in-out infinite;
        }
        .dt-sparkle-burst {
          animation: dtSparkleBurst 1150ms cubic-bezier(0.16, 1, 0.3, 1) var(--s-delay, 0ms) forwards;
        }
        .dt-zone-shockwave {
          border: 2px solid rgba(255, 232, 138, 0.92);
          animation: dtZoneShockwave 520ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .dt-card-flip-flare {
          animation: dtCardFlipFlare 620ms cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }
        .dt-crown-float {
          animation: dtCrownFloat 1.5s ease-in-out infinite;
        }
        .dt-flame-flicker {
          animation: dtFlameFlicker 1.9s ease-in-out infinite;
        }
        .dt-dragon-serpentine {
          animation: dtDragonSerpentine 1500ms cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }
        .dt-tiger-leap-roar {
          animation: dtTigerLeapRoar 1500ms cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }
        .dt-box-fire-pulse {
          animation: dtBoxFirePulse 1500ms ease-out forwards;
        }
        @media (prefers-reduced-motion: reduce) {
          .dt-ember,
          .dt-lantern-sway,
          .dt-tassel-sway,
          .dt-urgent-plaque,
          .dt-sparkle-burst,
          .dt-zone-shockwave,
          .dt-card-flip-flare,
          .dt-crown-float,
          .dt-flame-flicker,
          .dt-dragon-serpentine,
          .dt-tiger-leap-roar,
          .dt-box-fire-pulse {
            animation: none !important;
          }
        }
      `}</style>
      {(flyingChips.length > 0 || sweepingChips.length > 0 || winnerCelebration) && (
        <div className="pointer-events-none absolute inset-0 z-40 overflow-hidden">
          {flyingChips.map((fc) => (
            <FlyingChipOverlayItem key={fc.id} chip={fc} onLanded={handleFlyingChipLanded} />
          ))}
          {sweepingChips.map((sc) => (
            <SweepingChipOverlayItem key={sc.id} chip={sc} />
          ))}
          {winnerCelebration && (
            <WinnerBoxCelebration key={winnerCelebration.key} celebration={winnerCelebration} />
          )}
        </div>
      )}
      {/* Atmospheric Royal Temple Night-Arena Backdrop */}
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        <img
          src={GENERATED_ASSETS.dtTempleBackdrop}
          alt=""
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover opacity-55 scale-105"
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 85% 60% at 50% 35%, rgba(64, 34, 108, 0.44) 0%, rgba(15, 12, 36, 0.80) 64%, rgba(7, 6, 18, 0.95) 100%)',
          }}
        />
        <div
          className="absolute -left-16 top-16 w-56 h-72 rounded-full opacity-40 blur-3xl"
          style={{ background: 'radial-gradient(circle, rgba(251,191,36,0.6) 0%, transparent 70%)' }}
        />
        <div
          className="absolute -right-16 top-16 w-56 h-72 rounded-full opacity-40 blur-3xl"
          style={{ background: 'radial-gradient(circle, rgba(251,191,36,0.6) 0%, transparent 70%)' }}
        />
        <div
          className="absolute left-1/2 -translate-x-1/2 bottom-8 w-80 h-32 rounded-full opacity-25 blur-3xl"
          style={{ background: 'radial-gradient(circle, rgba(212,175,55,0.45) 0%, transparent 70%)' }}
        />
        {/* Subtle Drifting Golden Ember Particles */}
        {AMBIENT_EMBERS.map((ember, idx) => (
          <span
            key={idx}
            aria-hidden="true"
            className="dt-ember absolute rounded-full bg-gradient-to-t from-amber-500 via-yellow-300 to-white shadow-[0_0_8px_rgba(251,191,36,0.9)]"
            style={
              {
                left: ember.left,
                bottom: ember.bottom,
                width: `${ember.size}px`,
                height: `${ember.size}px`,
                '--dt-dur': `${ember.duration}s`,
                '--dt-delay': `${ember.delay}s`,
                '--dt-drift': `${ember.drift}px`,
              } as React.CSSProperties
            }
          />
        ))}
      </div>

      {/* 1. Sleek Top-Bar Pill Row: Gold-Rimmed Back Pill + Live Players (1,284) & Sound Toggle Pill */}
      <div className="relative z-20 shrink-0 px-2.5 sm:px-4 pt-1.5 pb-0.5">
        <div className="max-w-[460px] sm:max-w-[540px] lg:max-w-[760px] mx-auto flex items-center justify-between gap-1.5">
          {/* Left Gold-Rimmed Back Pill */}
          <button
            type="button"
            onClick={() => {
              soundEngine.playClick();
              backGuard.requestExit();
            }}
            aria-label="Back to Games"
            className="inline-flex items-center gap-1.5 rounded-full border border-[#e8be56]/75 bg-gradient-to-b from-[#331a0d]/95 to-[#150b1f]/95 px-2.5 py-1 text-[11px] font-bold text-[#fde68a] shadow-[0_2px_10px_rgba(212,175,55,0.28),inset_0_1px_0_rgba(255,243,196,0.3)] hover:brightness-110 shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5 text-[#f6dc93]" />
            <span>Back</span>
          </button>

          {/* Subtle Center Utility Pills (History, Fair, Rules) */}
          <div className="flex items-center gap-1 min-w-0">
            <button
              type="button"
              onClick={() => {
                soundEngine.playClick();
                setHistoryOpen(true);
              }}
              aria-label="My Bet History"
              title="Round History"
              className="w-7 h-7 rounded-full border border-[#f0c85c]/30 bg-[#0d1332]/85 hover:bg-white/10 flex items-center justify-center text-sky-300 shrink-0"
            >
              <History className="w-3.5 h-3.5" />
            </button>
            {(fairProof || activeCommitHash) && (
              <button
                type="button"
                onClick={() => {
                  soundEngine.playClick();
                  setFairModalOpen(true);
                }}
                aria-label="Verify SHA-256 Provably Fair Deal"
                title="Verify Provably Fair"
                className="w-7 h-7 rounded-full border border-emerald-400/40 bg-emerald-950/75 hover:bg-emerald-900/70 flex items-center justify-center text-emerald-300 shrink-0"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                soundEngine.playClick();
                setRulesOpen(true);
              }}
              aria-label="How to Play Dragon Tiger"
              title="How to Play & Payouts"
              className="w-7 h-7 rounded-full border border-[#f0c85c]/40 bg-[#2a1909]/85 hover:bg-[#3a220c] flex items-center justify-center text-[#fde68a] shrink-0"
            >
              <HelpCircle className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Right Live Players (1,284 Green Pulse) + Sound Toggle Pill */}
          <div className="inline-flex items-center gap-2 rounded-full border border-[#e8be56]/65 bg-gradient-to-b from-[#131a3d]/95 to-[#090d22]/95 px-2.5 py-1 shadow-[0_2px_12px_rgba(8,12,34,0.8),inset_0_1px_0_rgba(255,243,196,0.22)] shrink-0">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-mono-num font-bold text-emerald-300">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400 shadow-[0_0_6px_#34d399]" />
              </span>
              <span>1,284</span>
            </span>
            <span aria-hidden="true" className="w-px h-3.5 bg-[#f0c85c]/30" />
            <button
              type="button"
              onClick={() => {
                const next = !soundEnabled;
                updateAudio({ soundEnabled: next });
                if (next) {
                  soundEngine.unlock();
                  soundEngine.playClick();
                }
              }}
              aria-label={soundEnabled ? 'Mute sound effects' : 'Enable sound effects'}
              title={soundEnabled ? 'Sound On' : 'Sound Muted'}
              className={`inline-flex items-center justify-center transition-colors ${
                soundEnabled ? 'text-[#f6dc93] hover:text-white' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      </div>

      {!cfg.enabled && (
        <div className="relative z-20 shrink-0 px-3 py-2 bg-rose-950/90 border-b border-rose-500/40 text-center text-xs text-rose-200 font-medium">
          {cfg.maintenanceMessage || 'Dragon Tiger is currently under maintenance. New bets are paused.'}
        </div>
      )}

      {/* 2. Grand Royal Temple Canopy + Main Casino Table Arena + Lower 3D Patrol Courtyard */}
      <div className="relative z-10 flex-1 min-h-0 w-full overflow-y-auto flex flex-col justify-between sm:justify-center gap-1 sm:gap-1.5 px-2 sm:px-4 pt-0.5 pb-1 sm:py-1.5">
        <div className="w-full max-w-[460px] sm:max-w-[520px] lg:max-w-[760px] flex-1 min-h-0 max-h-[580px] mx-auto flex flex-col justify-center">
          {/* Ornate Golden Asian Temple Pagoda Roof Arch */}
          <PagodaRoofCanopy />

          <div className="w-full flex-1 min-h-0 mx-auto flex items-stretch justify-center gap-3">
          {/* Left Side Table Players (Desktop) */}
          <aside
            aria-label="Left table players"
            className="hidden lg:flex flex-col justify-center gap-2.5 w-[104px] shrink-0"
          >
            {leftSeats.map((seat) => (
              <div
                key={seat.seed}
                ref={(el) => {
                  seatRefs.current[`desk_${seat.seed}`] = el;
                }}
                className={`relative rounded-xl border p-2 flex flex-col items-center text-center shadow-lg transition-all ${
                  seat.lastWin
                    ? 'border-emerald-300 bg-emerald-950/85 shadow-emerald-500/30'
                    : 'border-[#f0c85c]/25 bg-[#0d1438]/85'
                }`}
              >
                {seat.lastWin ? (
                  <span className="absolute -top-2 right-1 px-1.5 py-0.5 rounded bg-emerald-500 text-[#042316] text-[9px] font-mono-num font-black shadow">
                    +{seat.lastWin}
                  </span>
                ) : null}
                <div className="rounded-[14px] p-[2px] bg-gradient-to-br from-[#fff5bd] via-[#d4af37] to-[#7c5308] shadow-[0_0_10px_rgba(212,175,55,0.45)]">
                  <AvatarBadge name={seat.name} seed={seat.seed} size="sm" />
                </div>
                <span className="text-[11px] font-semibold text-zinc-100 mt-1 truncate w-full">
                  {seat.name}
                </span>
                <span className="text-[10px] font-mono-num text-[#f6dc93] inline-flex items-center gap-0.5">
                  <Coins className="w-2.5 h-2.5 text-amber-400" />
                  {(seat.coins / 1000).toFixed(1)}K
                </span>
              </div>
            ))}
          </aside>

          {/* Ornate 3D Brushed-Gold & Dark-Mahogany Casino Temple Frame */}
          <div className="relative w-full max-w-[460px] sm:max-w-[500px] mx-auto h-full rounded-[20px] p-[4px] sm:p-[5px] bg-gradient-to-b from-[#5c2a17] via-[#2c1108] to-[#170704] ring-1 ring-[#e8be56]/70 shadow-[0_20px_56px_rgba(4,5,18,0.95),inset_0_2px_1px_rgba(255,224,148,0.42),inset_0_-3px_6px_rgba(0,0,0,0.88)]">
            <div className="relative w-full h-full rounded-[16px] p-[2px] bg-gradient-to-br from-[#fff0b3] via-[#c79325] to-[#694408]">
              <div className="relative w-full h-full flex flex-col gap-2 sm:gap-2.5 rounded-[14px] bg-gradient-to-b from-[#141845]/96 via-[#16133a]/97 to-[#0a0c23]/98 p-2 sm:p-3 shadow-[inset_0_2px_16px_rgba(0,0,0,0.75)] overflow-hidden">
                {/* 4-Corner Brushed Gold Temple Filigree */}
                <CornerGoldFiligree position="tl" />
                <CornerGoldFiligree position="tr" />
                <CornerGoldFiligree position="bl" />
                <CornerGoldFiligree position="br" />

                {/* Warm Glowing Hanging Lanterns (Left & Right Temple Edges) */}
                <div className="dt-lantern-sway absolute -top-1 left-3 z-30 pointer-events-none flex flex-col items-center">
                  <div className="w-1.5 h-4 bg-gradient-to-b from-amber-300 to-amber-700" />
                  <div className="relative w-5 h-6 rounded-lg bg-gradient-to-b from-amber-300 via-orange-500 to-red-700 border border-yellow-200 shadow-[0_0_16px_rgba(251,191,36,0.95)] flex items-center justify-center text-[8px] font-black text-amber-950">
                    福
                    <span className="absolute -bottom-2 w-0.5 h-2 bg-amber-300/80" />
                  </div>
                </div>
                <div className="dt-lantern-sway absolute -top-1 right-3 z-30 pointer-events-none flex flex-col items-center">
                  <div className="w-1.5 h-4 bg-gradient-to-b from-amber-300 to-amber-700" />
                  <div className="relative w-5 h-6 rounded-lg bg-gradient-to-b from-amber-300 via-orange-500 to-red-700 border border-yellow-200 shadow-[0_0_16px_rgba(251,191,36,0.95)] flex items-center justify-center text-[8px] font-black text-amber-950">
                    福
                    <span className="absolute -bottom-2 w-0.5 h-2 bg-amber-300/80" />
                  </div>
                </div>
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute top-[54%] -left-1 z-20 flex flex-col items-center opacity-85"
                >
                  <div className="w-2.5 h-3.5 rounded-full bg-gradient-to-b from-amber-300 via-orange-500 to-red-700 border border-yellow-200/80 shadow-[0_0_12px_rgba(251,191,36,0.9)]" />
                </div>
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute top-[54%] -right-1 z-20 flex flex-col items-center opacity-85"
                >
                  <div className="w-2.5 h-3.5 rounded-full bg-gradient-to-b from-amber-300 via-orange-500 to-red-700 border border-yellow-200/80 shadow-[0_0_12px_rgba(251,191,36,0.9)]" />
                </div>
            {/* 3D Gold & Velvet Winner Ribbon + Golden Sparkle Burst */}
            {phase === 'result' && winner ? (
              <div
                className={`pointer-events-none absolute top-[31%] z-30 flex items-center justify-center ${
                  winner === 'dragon'
                    ? 'left-[22%] -translate-x-1/2'
                    : winner === 'tiger'
                      ? 'left-[78%] -translate-x-1/2'
                      : 'left-1/2 -translate-x-1/2'
                }`}
              >
                <div className="relative flex items-center justify-center">
                  {/* Subtle Burst of Golden Sparkle Particles Over Winning Side */}
                  {WINNER_SPARKLES.map((sp, sIdx) => {
                    const rad = (sp.angle * Math.PI) / 180;
                    const sx = `${Math.round(Math.cos(rad) * sp.dist)}px`;
                    const sy = `${Math.round(Math.sin(rad) * sp.dist)}px`;
                    return (
                      <span
                        key={`${winner}_sp_${sIdx}`}
                        aria-hidden="true"
                        className="dt-sparkle-burst pointer-events-none absolute rounded-full bg-gradient-to-br from-white via-[#fde047] to-[#f59e0b] shadow-[0_0_8px_rgba(253,224,71,0.95)]"
                        style={
                          {
                            width: `${sp.size}px`,
                            height: `${sp.size}px`,
                            '--sx': sx,
                            '--sy': sy,
                            '--s-delay': `${sp.delay}ms`,
                          } as React.CSSProperties
                        }
                      />
                    );
                  })}

                  {/* Left & Right 3D Brushed-Gold Ribbon Tails */}
                  <span
                    aria-hidden="true"
                    className={`-mr-2 w-3.5 h-5 border border-[#ffe484]/80 shadow-md ${
                      winner === 'dragon'
                        ? 'bg-gradient-to-b from-blue-800 to-blue-950'
                        : winner === 'tiger'
                          ? 'bg-gradient-to-b from-amber-700 to-red-950'
                          : 'bg-gradient-to-b from-emerald-700 to-emerald-950'
                    }`}
                    style={{ clipPath: 'polygon(0 0, 100% 0, 100% 100%, 0 100%, 40% 50%)' }}
                  />
                  {/* Main 3D Gold & Velvet Winner Ribbon */}
                  <div
                    className={`relative z-10 px-3.5 sm:px-5 py-1.5 rounded-lg border-2 border-[#fff2b8] font-display text-[11px] sm:text-sm font-black tracking-widest uppercase whitespace-nowrap shadow-[0_10px_26px_rgba(0,0,0,0.88),0_0_20px_rgba(251,191,36,0.6),inset_0_1px_0_rgba(255,255,255,0.4)] ${
                      winner === 'dragon'
                        ? 'bg-gradient-to-b from-[#1e40af] via-[#172554] to-[#091233] text-[#fef08a]'
                        : winner === 'tiger'
                          ? 'bg-gradient-to-b from-[#9a3412] via-[#5c1607] to-[#2e0903] text-[#fef08a]'
                          : 'bg-gradient-to-b from-[#065f46] via-[#064e3b] to-[#022c22] text-[#fef08a]'
                    }`}
                  >
                    <span className="gold-gradient-text drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
                      {winner === 'dragon' ? 'DRAGON WINS!' : winner === 'tiger' ? 'TIGER WINS!' : 'TIE!'}
                    </span>
                  </div>
                  <span
                    aria-hidden="true"
                    className={`-ml-2 w-3.5 h-5 border border-[#ffe484]/80 shadow-md ${
                      winner === 'dragon'
                        ? 'bg-gradient-to-b from-blue-800 to-blue-950'
                        : winner === 'tiger'
                          ? 'bg-gradient-to-b from-amber-700 to-red-950'
                          : 'bg-gradient-to-b from-emerald-700 to-emerald-950'
                    }`}
                    style={{ clipPath: 'polygon(0 0, 100% 0, 60% 50%, 100% 100%, 0 100%)' }}
                  />
                </div>
              </div>
            ) : (
              splashBanner && (
                <div className="pointer-events-none absolute inset-x-0 top-[34%] z-30 flex justify-center px-3">
                  <div
                    className={`px-4 sm:px-6 py-1.5 sm:py-2 rounded-xl border-2 font-display text-xs sm:text-base font-black tracking-widest uppercase shadow-[0_10px_28px_rgba(0,0,0,0.85)] animate-bounce ${
                      splashBanner.tone === 'dragon'
                        ? 'bg-gradient-to-r from-blue-800 via-sky-500 to-blue-800 border-sky-200 text-white'
                        : splashBanner.tone === 'tiger'
                          ? 'bg-gradient-to-r from-amber-800 via-amber-400 to-orange-700 border-amber-100 text-[#1c0c02]'
                          : splashBanner.tone === 'tie'
                            ? 'bg-gradient-to-r from-emerald-800 via-emerald-400 to-emerald-800 border-emerald-100 text-[#022014]'
                            : splashBanner.tone === 'crimson'
                              ? 'bg-gradient-to-r from-rose-900 via-red-600 to-rose-900 border-rose-200 text-white'
                              : 'bg-gradient-to-r from-[#7a4b06] via-[#f6dc93] to-[#7a4b06] border-[#fff7d6] text-[#1c0e02]'
                    }`}
                  >
                    {splashBanner.text}
                  </div>
                </div>
              )
            )}

            {/* Floating Coin Win Celebration Banner */}
            {winPopup > 0 && phase === 'result' && (
              <div className="pointer-events-none absolute bottom-10 left-1/2 -translate-x-1/2 z-30 px-3.5 py-1 rounded-xl bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-500 border-2 border-emerald-200 text-white font-mono-num text-xs sm:text-sm font-black shadow-[0_0_24px_rgba(16,185,129,0.85)] animate-bounce whitespace-nowrap">
                +{winPopup.toLocaleString()} COINS WON!
              </div>
            )}

            {/* 2A. DRAGON vs TIGER HEADER: Circular Animated Mascots + Large Crisp [Card] VS [Card] + Fire/Roar VFX */}
            <div
              className={`relative shrink-0 rounded-xl border border-[#f5d06e]/35 bg-gradient-to-r from-[#0b235d]/92 via-[#15153e]/88 to-[#612708]/92 p-1.5 sm:p-2 space-y-1.5 overflow-hidden ${
                phase === 'result' && (winner === 'dragon' || winner === 'tiger')
                  ? 'animate-arena-tremor'
                  : ''
              }`}
            >
              {/* 60fps Canvas VFX: keep center Tie celebration; Dragon/Tiger celebrate strictly over their own betting boxes */}
              <DragonTigerWinnerFX
                active={phase === 'result' && winner === 'tie'}
                winner={winner === 'tie' ? 'tie' : null}
              />

              {/* Embossed Dark-Jade & Brushed-Gold Imperial Timer Plaque */}
              <div className="relative z-30 flex items-center justify-center">
                <div
                  className={`inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full border-[1.5px] text-[10px] sm:text-[11px] font-display font-bold tracking-wider truncate max-w-full transition-all ${
                    phase === 'betting' && countdown <= 3 && autoLoop
                      ? 'dt-urgent-plaque bg-gradient-to-b from-[#8b1818] via-[#5c0d0d] to-[#310505] border-[#fbbf24] text-[#fff3c4]'
                      : phase === 'result' && winner === 'dragon'
                        ? 'bg-gradient-to-b from-[#173d8e] via-[#0f255c] to-[#081336] border-[#f0c85c] text-[#fef08a] shadow-[inset_0_1px_0_rgba(255,244,200,0.35),0_3px_10px_rgba(0,0,0,0.6)]'
                        : phase === 'result' && winner === 'tiger'
                          ? 'bg-gradient-to-b from-[#92400e] via-[#5c2306] to-[#331002] border-[#f0c85c] text-[#fef08a] shadow-[inset_0_1px_0_rgba(255,244,200,0.35),0_3px_10px_rgba(0,0,0,0.6)]'
                          : 'bg-gradient-to-b from-[#0f4738] via-[#092d23] to-[#041913] border-[#e8be56]/85 text-[#fde68a] shadow-[inset_0_1px_0_rgba(255,244,200,0.38),inset_0_-2px_4px_rgba(0,0,0,0.75),0_4px_12px_rgba(0,0,0,0.65)]'
                  }`}
                >
                  <span aria-hidden="true" className="w-1.5 h-1.5 rotate-45 bg-[#fde047] shrink-0" />
                  <span className="truncate">
                    {lastOutcomeMsg ||
                      (phase === 'betting'
                        ? autoLoop
                          ? `PLACE YOUR BETS · ${countdown}s`
                          : 'PAUSED · TAP A ZONE & DEAL'
                        : phase === 'dealing'
                          ? 'DEALING CARDS...'
                          : revealStep === 1
                            ? 'DRAGON REVEALED...'
                            : 'REVEALING TIGER...')}
                  </span>
                  <span aria-hidden="true" className="w-1.5 h-1.5 rotate-45 bg-[#fde047] shrink-0" />
                </div>
              </div>

              {/* Circular Moving Mascots + Crisp 3D VS Cards */}
              <div className="relative z-10 py-1.5 grid grid-cols-[84px_1fr_84px] sm:grid-cols-[100px_1fr_100px] items-center gap-1 sm:gap-2">
                {/* DRAGON Animated Circular Medallion + Blue Fire Aura */}
                <div className="relative flex flex-col items-center justify-center">
                  <div
                    aria-hidden="true"
                    className={`dt-flame-flicker pointer-events-none absolute -inset-3 rounded-full blur-md transition-opacity duration-300 ${
                      phase === 'result' && winner === 'dragon' ? 'opacity-100 scale-110' : 'opacity-80'
                    }`}
                    style={{
                      background:
                        'radial-gradient(circle, rgba(56,189,248,0.68) 0%, rgba(37,99,235,0.42) 48%, transparent 74%)',
                    }}
                  />
                  <div
                    className={`relative w-[78px] h-[78px] sm:w-[94px] sm:h-[94px] rounded-full p-[3px] flex items-center justify-center transition-transform duration-300 ${
                      phase === 'result' && winner === 'dragon'
                        ? 'scale-105 shadow-[0_0_32px_rgba(56,189,248,0.98),0_0_18px_rgba(249,115,22,0.85)]'
                        : 'shadow-[0_0_18px_rgba(56,189,248,0.6)]'
                    }`}
                  >
                    {/* Rotating Conic Energy Ring */}
                    <div
                      aria-hidden="true"
                      className={`pointer-events-none absolute inset-0 rounded-full ${
                        phase === 'result' && winner === 'dragon'
                          ? 'animate-emblem-ring-fast'
                          : 'animate-emblem-ring'
                      }`}
                      style={{
                        background:
                          phase === 'result' && winner === 'dragon'
                            ? 'conic-gradient(from 0deg, #fef08a, #38bdf8, #f97316, #2563eb, #fef08a)'
                            : 'conic-gradient(from 0deg, #7dd3fc, #2563eb, #f6dc93, #1d4ed8, #7dd3fc)',
                      }}
                    />

                    {/* Inner Circular Portrait with Live Motion */}
                    <div className="relative w-full h-full rounded-full overflow-hidden bg-[#081538] border border-white/30">
                      <img
                        src={GENERATED_ASSETS.dtDragonMascot}
                        alt="Royal Blue Dragon"
                        referrerPolicy="no-referrer"
                        className={`w-full h-full object-cover object-center will-change-transform ${
                          phase === 'result' && winner === 'dragon'
                            ? 'animate-dragon-fire-lunge'
                            : 'animate-dragon-circle-move'
                        }`}
                      />
                      <div
                        className={`pointer-events-none absolute inset-0 transition-opacity duration-300 ${
                          phase === 'result' && winner === 'dragon'
                            ? 'bg-gradient-to-r from-transparent via-sky-400/25 to-amber-300/45 opacity-100'
                            : 'bg-gradient-to-t from-[#061233]/80 via-transparent to-transparent opacity-90'
                        }`}
                      />
                    </div>

                    {/* Revealed Dragon Card Badge on Top-Right of Circle */}
                    {dragonFaceBadge && (
                      <span
                        className={`absolute -top-1 -right-1 z-20 px-1.5 py-0.5 rounded-md bg-white border border-[#d4af37] text-[10px] sm:text-xs font-extrabold leading-none shadow-md ${
                          dragonFaceBadge.isRed ? 'text-red-600' : 'text-slate-900'
                        }`}
                      >
                        {dragonFaceBadge.text}
                      </span>
                    )}

                    {/* DRAGON Nameplate on Bottom Rim */}
                    <span
                      className={`absolute -bottom-1.5 z-20 px-2 py-0.5 rounded-full border font-display text-[8px] sm:text-[9px] font-black tracking-wider leading-none shadow ${
                        phase === 'result' && winner === 'dragon'
                          ? 'bg-gradient-to-r from-sky-500 to-blue-700 border-amber-200 text-white'
                          : 'bg-[#07153a] border-sky-300/70 text-sky-200'
                      }`}
                    >
                      DRAGON
                    </span>
                  </div>
                </div>

                {/* Center 3D Card Battle Stage: [Card] VS [Card] */}
                <div
                  className="relative min-w-0 h-[100px] sm:h-[114px] flex items-center justify-center"
                  style={{ perspective: '900px' }}
                >
                  {/* Elemental Under-Card Spotlights */}
                  <div
                    aria-hidden="true"
                    className={`pointer-events-none absolute left-[8%] top-[14%] w-[36%] h-[74%] rounded-xl transition-all duration-300 ${
                      phase === 'result' && (winner === 'dragon' || winner === 'tie')
                        ? 'bg-sky-400/20 ring-2 ring-[#ffe38a]/85 shadow-[0_0_24px_rgba(251,191,36,0.85)]'
                        : 'bg-sky-500/5'
                    }`}
                  />
                  <div
                    aria-hidden="true"
                    className={`pointer-events-none absolute right-[8%] top-[14%] w-[36%] h-[74%] rounded-xl transition-all duration-300 ${
                      phase === 'result' && (winner === 'tiger' || winner === 'tie')
                        ? 'bg-amber-400/20 ring-2 ring-[#ffe38a]/85 shadow-[0_0_24px_rgba(251,191,36,0.85)]'
                        : 'bg-amber-500/5'
                    }`}
                  />

                  <DragonTigerCanvas
                    graphicsQuality={graphicsQuality}
                    phase={phase}
                    revealStep={revealStep}
                    dragonCard={dragonCard}
                    tigerCard={tigerCard}
                    winner={winner}
                  />

                  {/* Smooth 3D Card-Flip Specular Reveal Flares */}
                  {(phase === 'revealing' || phase === 'result') && revealStep >= 1 && (
                    <div
                      key={`d_flip_${dragonCard?.label}_${dragonCard?.suit}`}
                      aria-hidden="true"
                      className="dt-card-flip-flare pointer-events-none absolute left-[9%] top-[12%] w-[34%] h-[78%] rounded-xl border border-sky-200/90 bg-gradient-to-tr from-sky-400/25 via-white/35 to-amber-200/35 shadow-[0_0_24px_rgba(56,189,248,0.8)]"
                    />
                  )}
                  {(phase === 'revealing' || phase === 'result') && revealStep >= 2 && (
                    <div
                      key={`t_flip_${tigerCard?.label}_${tigerCard?.suit}`}
                      aria-hidden="true"
                      className="dt-card-flip-flare pointer-events-none absolute right-[9%] top-[12%] w-[34%] h-[78%] rounded-xl border border-amber-200/90 bg-gradient-to-tr from-amber-400/25 via-white/35 to-yellow-200/35 shadow-[0_0_24px_rgba(251,191,36,0.8)]"
                    />
                  )}

                  {/* Glowing Golden Crown Highlight Over Winning Card */}
                  {phase === 'result' && (winner === 'dragon' || winner === 'tie') && (
                    <div
                      aria-hidden="true"
                      className="dt-crown-float pointer-events-none absolute left-[26%] -translate-x-1/2 -top-1.5 z-30 flex items-center justify-center rounded-full bg-gradient-to-b from-[#fff3b5] via-[#eab308] to-[#854d0e] p-1 border border-[#fff8dc] shadow-[0_0_16px_rgba(251,191,36,0.95)]"
                    >
                      <Crown className="w-3.5 h-3.5 text-[#1e1002] fill-[#fef08a]" />
                    </div>
                  )}
                  {phase === 'result' && (winner === 'tiger' || winner === 'tie') && (
                    <div
                      aria-hidden="true"
                      className="dt-crown-float pointer-events-none absolute right-[26%] translate-x-1/2 -top-1.5 z-30 flex items-center justify-center rounded-full bg-gradient-to-b from-[#fff3b5] via-[#eab308] to-[#854d0e] p-1 border border-[#fff8dc] shadow-[0_0_16px_rgba(251,191,36,0.95)]"
                    >
                      <Crown className="w-3.5 h-3.5 text-[#1e1002] fill-[#fef08a]" />
                    </div>
                  )}

                  {/* Sculpted Metallic Gold VS / Live Countdown Medallion */}
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    {phase === 'betting' && autoLoop ? (
                      <div
                        className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full border-2 shadow-[0_0_16px_rgba(251,191,36,0.8)] flex flex-col items-center justify-center transition-transform ${
                          countdown <= 3
                            ? 'bg-gradient-to-b from-rose-500 via-red-600 to-rose-900 border-rose-200 text-white scale-110'
                            : 'bg-gradient-to-b from-[#fff2b8] via-[#d9a62e] to-[#7c5308] border-[#fff8dc] text-[#1c0f02]'
                        }`}
                      >
                        <span className="font-mono-num text-xs sm:text-sm font-black leading-none">
                          {countdown}
                        </span>
                        <span className="text-[7px] font-extrabold uppercase leading-none opacity-85">
                          SEC
                        </span>
                      </div>
                    ) : (
                      <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-gradient-to-b from-[#fff2b8] via-[#d9a62e] to-[#7c5308] border-2 border-[#fff8dc] shadow-[0_0_14px_rgba(251,191,36,0.75)] flex items-center justify-center">
                        <span className="font-display text-[10px] sm:text-xs font-black text-[#1c0f02] tracking-tighter">
                          VS
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* TIGER Animated Circular Medallion + Golden Flame Aura */}
                <div className="relative flex flex-col items-center justify-center">
                  <div
                    aria-hidden="true"
                    className={`dt-flame-flicker pointer-events-none absolute -inset-3 rounded-full blur-md transition-opacity duration-300 ${
                      phase === 'result' && winner === 'tiger' ? 'opacity-100 scale-110' : 'opacity-80'
                    }`}
                    style={{
                      background:
                        'radial-gradient(circle, rgba(251,191,36,0.72) 0%, rgba(234,88,12,0.44) 48%, transparent 74%)',
                    }}
                  />
                  <div
                    className={`relative w-[78px] h-[78px] sm:w-[94px] sm:h-[94px] rounded-full p-[3px] flex items-center justify-center transition-transform duration-300 ${
                      phase === 'result' && winner === 'tiger'
                        ? 'scale-105 shadow-[0_0_32px_rgba(251,191,36,0.98),0_0_18px_rgba(234,88,12,0.9)]'
                        : 'shadow-[0_0_18px_rgba(251,191,36,0.6)]'
                    }`}
                  >
                    {/* Rotating Conic Energy Ring (Counter-Rotating) */}
                    <div
                      aria-hidden="true"
                      className={`pointer-events-none absolute inset-0 rounded-full ${
                        phase === 'result' && winner === 'tiger'
                          ? 'animate-emblem-ring-rev-fast'
                          : 'animate-emblem-ring-rev'
                      }`}
                      style={{
                        background:
                          phase === 'result' && winner === 'tiger'
                            ? 'conic-gradient(from 0deg, #fff7cc, #f59e0b, #ea580c, #fde047, #fff7cc)'
                            : 'conic-gradient(from 0deg, #fde68a, #d97706, #fb923c, #9a3412, #fde68a)',
                      }}
                    />

                    {/* Inner Circular Portrait with Live Motion */}
                    <div className="relative w-full h-full rounded-full overflow-hidden bg-[#351506] border border-white/30">
                      <img
                        src={GENERATED_ASSETS.dtTigerMascot}
                        alt="Fiery Golden Tiger"
                        referrerPolicy="no-referrer"
                        className={`w-full h-full object-cover object-center will-change-transform ${
                          phase === 'result' && winner === 'tiger'
                            ? 'animate-tiger-roar-shake'
                            : 'animate-tiger-circle-move'
                        }`}
                      />
                      <div
                        className={`pointer-events-none absolute inset-0 transition-opacity duration-300 ${
                          phase === 'result' && winner === 'tiger'
                            ? 'bg-gradient-to-l from-transparent via-amber-400/20 to-yellow-200/40 opacity-100'
                            : 'bg-gradient-to-t from-[#2c1104]/80 via-transparent to-transparent opacity-90'
                        }`}
                      />
                    </div>

                    {/* Revealed Tiger Card Badge on Top-Left of Circle */}
                    {tigerFaceBadge && (
                      <span
                        className={`absolute -top-1 -left-1 z-20 px-1.5 py-0.5 rounded-md bg-white border border-[#d4af37] text-[10px] sm:text-xs font-extrabold leading-none shadow-md ${
                          tigerFaceBadge.isRed ? 'text-red-600' : 'text-slate-900'
                        }`}
                      >
                        {tigerFaceBadge.text}
                      </span>
                    )}

                    {/* TIGER Nameplate on Bottom Rim */}
                    <span
                      className={`absolute -bottom-1.5 z-20 px-2 py-0.5 rounded-full border font-display text-[8px] sm:text-[9px] font-black tracking-wider leading-none shadow ${
                        phase === 'result' && winner === 'tiger'
                          ? 'bg-gradient-to-r from-amber-400 to-orange-500 border-amber-100 text-[#1c0c02]'
                          : 'bg-[#351506] border-amber-300/70 text-amber-200'
                      }`}
                    >
                      TIGER
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* 2B. HISTORY BEADS (D / T / Tie circles) + LIVE TREND BAR */}
            <div className="shrink-0 rounded-xl border border-[#f5d06e]/35 bg-[#0a0f2c]/92 px-2.5 py-1.5 flex flex-col gap-1.5 relative overflow-hidden">
              <div className="flex items-center justify-between gap-2 min-w-0">
                <div className="flex items-center gap-1 overflow-x-auto min-w-0 py-0.5">
                  <span className="text-[9px] font-semibold text-zinc-400 uppercase tracking-wider shrink-0 mr-0.5">
                    Beads
                  </span>
                  {roadmap.map((r, i) => (
                    <div key={i} className="relative shrink-0">
                      {i === 0 && (
                        <span className="absolute -top-2.5 -right-1 z-10 px-1 py-0.2 rounded bg-rose-600 text-white text-[7px] font-black uppercase tracking-tighter shadow animate-pulse">
                          NEW
                        </span>
                      )}
                      <span
                        className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full text-[9px] sm:text-[10px] font-mono-num font-extrabold flex items-center justify-center border shadow ${
                          r === 'D'
                            ? 'bg-gradient-to-b from-sky-400 via-blue-600 to-blue-800 border-sky-200/80 text-white'
                            : r === 'T'
                              ? 'bg-gradient-to-b from-amber-300 via-orange-500 to-amber-700 border-amber-100/85 text-[#1c0e02]'
                              : 'bg-gradient-to-b from-emerald-300 via-emerald-500 to-emerald-800 border-emerald-100/80 text-white'
                        }`}
                        title={r === 'D' ? 'Dragon' : r === 'T' ? 'Tiger' : 'Tie'}
                      >
                        {r === 'X' ? 'Tie' : r}
                      </span>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setHistoryOpen(true)}
                  aria-label="Trend roadmap view"
                  className="w-7 h-7 rounded-lg bg-royal-purple/70 border border-amber-300/40 hover:bg-royal-purple flex items-center justify-center text-amber-200 shrink-0 shadow"
                  title="View detailed round history"
                >
                  <History className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="flex items-center gap-2">
                <span className="font-mono-num text-[10px] font-bold text-sky-300 whitespace-nowrap">
                  D {dragonPct}%
                </span>
                <div className="flex-1 h-2 rounded-full bg-black/60 border border-white/15 overflow-hidden flex">
                  <div
                    className="h-full bg-gradient-to-r from-sky-400 to-blue-600 transition-all duration-300"
                    style={{ width: `${dragonPct}%` }}
                  />
                  {tiePct > 0 && (
                    <div
                      className="h-full bg-emerald-400 transition-all duration-300"
                      style={{ width: `${tiePct}%` }}
                    />
                  )}
                  <div
                    className="h-full bg-gradient-to-r from-amber-400 to-orange-500 transition-all duration-300"
                    style={{ width: `${tigerPct}%` }}
                  />
                </div>
                <span className="font-mono-num text-[10px] font-bold text-amber-300 whitespace-nowrap">
                  {tigerPct}% T
                </span>
              </div>
            </div>

            {/* 2C. EXPANDED 3-ZONE VELVET BETTING TABLE (37% | 26% | 37%) */}
            <div className="flex-1 min-h-[155px] sm:min-h-[180px] flex items-stretch gap-1.5 sm:gap-2">
              {/* DRAGON 1:1 DEEP SAPPHIRE VELVET ZONE (w-[37%]) */}
              <button
                ref={(el) => {
                  zoneRefs.current.dragon = el;
                }}
                type="button"
                disabled={phase !== 'betting'}
                onClick={() => addChipToZone('dragon')}
                className={`group relative w-[37%] h-full rounded-xl border-2 p-1.5 sm:p-2 flex flex-col justify-between text-left overflow-hidden transition-transform active:scale-[0.98] disabled:cursor-default shadow-[inset_0_1px_18px_rgba(96,165,250,0.22),inset_0_-12px_24px_rgba(6,12,42,0.8)] ${
                  phase === 'result' && winner === 'dragon'
                    ? 'border-[#ffe484] shadow-[0_0_30px_rgba(56,189,248,0.95)] animate-winner-halo'
                    : 'border-sky-300/65 hover:border-[#f6dc93]'
                }`}
                style={{
                  background:
                    'radial-gradient(ellipse 90% 65% at 50% 20%, rgba(56, 130, 246, 0.56) 0%, transparent 70%), linear-gradient(180deg, #1e40af 0%, #152e82 55%, #0a1540 100%)',
                }}
              >
                {/* Inner Gold Hairline Border */}
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-[3.5px] rounded-[8.5px] border border-[#f6dc93]/35 shadow-[inset_0_1px_0_rgba(255,244,200,0.22)]"
                />
                {/* Golden Shockwave Glow on Chip Land */}
                {zoneShockwaves.dragon > 0 && (
                  <div
                    key={`sw_dragon_${zoneShockwaves.dragon}`}
                    aria-hidden="true"
                    className="dt-zone-shockwave pointer-events-none absolute inset-0 z-20 rounded-xl"
                  />
                )}
                <img
                  src={GENERATED_ASSETS.dtDragonMascot}
                  alt=""
                  aria-hidden="true"
                  referrerPolicy="no-referrer"
                  className="pointer-events-none absolute -bottom-3 -left-3 w-20 sm:w-24 h-20 sm:h-24 object-cover opacity-20 mix-blend-screen rounded-full"
                />

                <div className="relative z-10 w-full space-y-0.5">
                  <div className="flex items-center justify-between gap-1 bg-black/45 rounded-md px-1.5 py-0.5 border border-sky-200/30">
                    <span className="text-[8px] sm:text-[9px] font-semibold text-sky-200 uppercase">
                      You
                    </span>
                    <span className="font-mono-num text-[11px] sm:text-xs font-extrabold text-[#ffe484]">
                      {bets.dragon.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center justify-between px-0.5 text-[8px] sm:text-[9px] font-mono-num text-sky-100/85">
                    <span>Pool</span>
                    <span>{(tablePool.dragon + bets.dragon).toLocaleString()}</span>
                  </div>
                </div>

                <div className="relative z-20 flex-1 w-full flex flex-col items-center justify-start pt-0.5 sm:pt-1">
                  <div className="font-display text-sm sm:text-lg font-black tracking-wide text-white leading-tight drop-shadow-[0_2px_4px_rgba(0,0,0,0.65)]">
                    DRAGON
                  </div>
                  <div className="font-mono-num text-[9px] sm:text-[10px] font-bold text-sky-200 leading-none">
                    1 : 1
                  </div>
                </div>

                {zoneChips.dragon.length > 0 && (
                  <div className="absolute inset-0 z-10 pointer-events-none">
                    {zoneChips.dragon.map((chip, idx) => (
                      <div
                        key={chip.id}
                        className={`absolute -translate-x-1/2 -translate-y-1/2 ${
                          chip.landed === false ? 'opacity-0' : 'opacity-100'
                        }`}
                        style={{
                          left: `${chip.offsetX}%`,
                          top: `${chip.offsetY}%`,
                          zIndex: idx + 1,
                        }}
                      >
                        <div style={{ transform: `rotate(${chip.rotate}deg)` }}>
                          <CasinoChipToken value={chip.value} size="xs" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="relative z-20 text-center text-[9px] sm:text-[10px] font-semibold text-sky-100/90 leading-none">
                  {phase === 'betting'
                    ? `+${selectedChip} Tap`
                    : bets.dragon > 0
                      ? 'Locked'
                      : 'Closed'}
                </div>
              </button>

              {/* TIE 8:1 EMERALD VELVET ZONE (w-[26%]) */}
              <button
                ref={(el) => {
                  zoneRefs.current.tie = el;
                }}
                type="button"
                disabled={phase !== 'betting'}
                onClick={() => addChipToZone('tie')}
                className={`group relative w-[26%] h-full rounded-xl border-2 p-1.5 sm:p-2 flex flex-col justify-between text-left overflow-hidden transition-transform active:scale-[0.98] disabled:cursor-default shadow-[inset_0_1px_18px_rgba(52,211,153,0.22),inset_0_-12px_24px_rgba(2,34,24,0.82)] ${
                  phase === 'result' && winner === 'tie'
                    ? 'border-[#ffe484] shadow-[0_0_30px_rgba(52,211,153,0.95)] animate-winner-halo'
                    : 'border-emerald-300/65 hover:border-[#f6dc93]'
                }`}
                style={{
                  background:
                    'radial-gradient(ellipse 90% 65% at 50% 20%, rgba(16, 185, 129, 0.54) 0%, transparent 70%), linear-gradient(180deg, #059669 0%, #04684a 55%, #022f22 100%)',
                }}
              >
                {/* Inner Gold Hairline Border */}
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-[3.5px] rounded-[8.5px] border border-[#f6dc93]/35 shadow-[inset_0_1px_0_rgba(255,244,200,0.22)]"
                />
                {/* Golden Shockwave Glow on Chip Land */}
                {zoneShockwaves.tie > 0 && (
                  <div
                    key={`sw_tie_${zoneShockwaves.tie}`}
                    aria-hidden="true"
                    className="dt-zone-shockwave pointer-events-none absolute inset-0 z-20 rounded-xl"
                  />
                )}
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-15"
                >
                  <Sparkles className="w-16 h-16 text-emerald-100" />
                </div>

                <div className="relative z-10 w-full space-y-0.5">
                  <div className="flex items-center justify-between gap-0.5 bg-black/45 rounded-md px-1 py-0.5 border border-emerald-200/30">
                    <span className="text-[8px] font-semibold text-emerald-100 uppercase">
                      You
                    </span>
                    <span className="font-mono-num text-[10px] sm:text-xs font-extrabold text-[#ffe484] truncate">
                      {bets.tie.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center justify-between px-0.5 text-[8px] font-mono-num text-emerald-100/85">
                    <span>Pool</span>
                    <span className="truncate">{(tablePool.tie + bets.tie).toLocaleString()}</span>
                  </div>
                </div>

                <div className="relative z-20 flex-1 w-full flex flex-col items-center justify-start pt-0.5 sm:pt-1">
                  <div className="font-display text-sm sm:text-base font-black tracking-wide text-white leading-tight drop-shadow-[0_2px_4px_rgba(0,0,0,0.65)]">
                    TIE
                  </div>
                  <div className="font-mono-num text-[9px] sm:text-[10px] font-bold text-[#ffe484] leading-none">
                    8 : 1
                  </div>
                  <div className="mt-0.5 text-[8px] sm:text-[9px] font-mono-num text-emerald-200 bg-black/45 px-1.5 py-0.2 rounded-full border border-emerald-300/30">
                    Rate: {Math.max(1, Math.min(99, Math.round(dragonPct)))}%
                  </div>
                </div>

                {zoneChips.tie.length > 0 && (
                  <div className="absolute inset-0 z-10 pointer-events-none">
                    {zoneChips.tie.map((chip, idx) => (
                      <div
                        key={chip.id}
                        className={`absolute -translate-x-1/2 -translate-y-1/2 ${
                          chip.landed === false ? 'opacity-0' : 'opacity-100'
                        }`}
                        style={{
                          left: `${chip.offsetX}%`,
                          top: `${chip.offsetY}%`,
                          zIndex: idx + 1,
                        }}
                      >
                        <div style={{ transform: `rotate(${chip.rotate}deg)` }}>
                          <CasinoChipToken value={chip.value} size="xs" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="relative z-20 text-center text-[8px] sm:text-[10px] font-semibold text-emerald-100/90 leading-none truncate">
                  {phase === 'betting' ? `+${selectedChip}` : bets.tie > 0 ? 'Locked' : 'Closed'}
                </div>
              </button>

              {/* TIGER 1:1 IMPERIAL AMBER-GOLD VELVET ZONE (w-[37%]) */}
              <button
                ref={(el) => {
                  zoneRefs.current.tiger = el;
                }}
                type="button"
                disabled={phase !== 'betting'}
                onClick={() => addChipToZone('tiger')}
                className={`group relative w-[37%] h-full rounded-xl border-2 p-1.5 sm:p-2 flex flex-col justify-between text-left overflow-hidden transition-transform active:scale-[0.98] disabled:cursor-default shadow-[inset_0_1px_18px_rgba(251,191,36,0.24),inset_0_-12px_24px_rgba(56,18,4,0.84)] ${
                  phase === 'result' && winner === 'tiger'
                    ? 'border-[#ffe484] shadow-[0_0_30px_rgba(251,191,36,0.95)] animate-winner-halo'
                    : 'border-amber-300/65 hover:border-[#f6dc93]'
                }`}
                style={{
                  background:
                    'radial-gradient(ellipse 90% 65% at 50% 20%, rgba(251, 191, 36, 0.52) 0%, transparent 70%), linear-gradient(180deg, #d97706 0%, #9a4706 55%, #461704 100%)',
                }}
              >
                {/* Inner Gold Hairline Border */}
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-[3.5px] rounded-[8.5px] border border-[#f6dc93]/40 shadow-[inset_0_1px_0_rgba(255,244,200,0.24)]"
                />
                {/* Golden Shockwave Glow on Chip Land */}
                {zoneShockwaves.tiger > 0 && (
                  <div
                    key={`sw_tiger_${zoneShockwaves.tiger}`}
                    aria-hidden="true"
                    className="dt-zone-shockwave pointer-events-none absolute inset-0 z-20 rounded-xl"
                  />
                )}
                <img
                  src={GENERATED_ASSETS.dtTigerMascot}
                  alt=""
                  aria-hidden="true"
                  referrerPolicy="no-referrer"
                  className="pointer-events-none absolute -bottom-3 -right-3 w-20 sm:w-24 h-20 sm:h-24 object-cover opacity-20 mix-blend-screen rounded-full"
                />

                <div className="relative z-10 w-full space-y-0.5">
                  <div className="flex items-center justify-between gap-1 bg-black/45 rounded-md px-1.5 py-0.5 border border-amber-200/30">
                    <span className="text-[8px] sm:text-[9px] font-semibold text-amber-100 uppercase">
                      You
                    </span>
                    <span className="font-mono-num text-[11px] sm:text-xs font-extrabold text-[#ffe484]">
                      {bets.tiger.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center justify-between px-0.5 text-[8px] sm:text-[9px] font-mono-num text-amber-100/85">
                    <span>Pool</span>
                    <span>{(tablePool.tiger + bets.tiger).toLocaleString()}</span>
                  </div>
                </div>

                <div className="relative z-20 flex-1 w-full flex flex-col items-center justify-start pt-0.5 sm:pt-1">
                  <div className="font-display text-sm sm:text-lg font-black tracking-wide text-white leading-tight drop-shadow-[0_2px_4px_rgba(0,0,0,0.65)]">
                    TIGER
                  </div>
                  <div className="font-mono-num text-[9px] sm:text-[10px] font-bold text-amber-100 leading-none">
                    1 : 1
                  </div>
                </div>

                {zoneChips.tiger.length > 0 && (
                  <div className="absolute inset-0 z-10 pointer-events-none">
                    {zoneChips.tiger.map((chip, idx) => (
                      <div
                        key={chip.id}
                        className={`absolute -translate-x-1/2 -translate-y-1/2 ${
                          chip.landed === false ? 'opacity-0' : 'opacity-100'
                        }`}
                        style={{
                          left: `${chip.offsetX}%`,
                          top: `${chip.offsetY}%`,
                          zIndex: idx + 1,
                        }}
                      >
                        <div style={{ transform: `rotate(${chip.rotate}deg)` }}>
                          <CasinoChipToken value={chip.value} size="xs" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="relative z-20 text-center text-[9px] sm:text-[10px] font-semibold text-amber-100/90 leading-none">
                  {phase === 'betting'
                    ? `+${selectedChip} Tap`
                    : bets.tiger > 0
                      ? 'Locked'
                      : 'Closed'}
                </div>
              </button>
            </div>

            {/* 2D. Simulated/Live Side-Player Chips Strip (Mobile/Tablet) */}
            <div className="flex lg:hidden items-center justify-between gap-1.5 px-0.5 pt-0.5 shrink-0">
              <div className="flex items-center gap-1 min-w-0">
                {leftSeats.slice(0, 2).map((seat) => (
                  <div
                    key={seat.seed}
                    ref={(el) => {
                      seatRefs.current[`mob_${seat.seed}`] = el;
                    }}
                    className={`flex items-center gap-1 rounded-lg border px-1.5 py-0.5 ${
                      seat.lastWin
                        ? 'bg-emerald-950/80 border-emerald-400/50'
                        : 'bg-black/35 border-white/10'
                    }`}
                  >
                    <div className="rounded-[13px] p-[1.5px] bg-gradient-to-br from-[#fff5bd] via-[#d4af37] to-[#7c5308] shadow-[0_0_8px_rgba(212,175,55,0.45)] shrink-0">
                      <AvatarBadge name={seat.name} seed={seat.seed} size="sm" />
                    </div>
                    <div className="leading-tight">
                      <div className="text-[9px] font-semibold text-zinc-200 max-w-[44px] truncate">
                        {seat.name}
                      </div>
                      <div className="text-[9px] font-mono-num text-[#f6dc93]">
                        {(seat.coins / 1000).toFixed(1)}K
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="text-center shrink-0 px-1">
                <div className="text-[8px] uppercase tracking-wider text-zinc-400">Your Bet</div>
                <div className="font-mono-num text-xs font-extrabold text-[#ffe484]">
                  {totalBet.toLocaleString()}
                </div>
              </div>

              <div className="flex items-center gap-1 min-w-0">
                {rightSeats.slice(0, 2).map((seat) => (
                  <div
                    key={seat.seed}
                    ref={(el) => {
                      seatRefs.current[`mob_${seat.seed}`] = el;
                    }}
                    className={`flex items-center gap-1 rounded-lg border px-1.5 py-0.5 ${
                      seat.lastWin
                        ? 'bg-emerald-950/80 border-emerald-400/50'
                        : 'bg-black/35 border-white/10'
                    }`}
                  >
                    <div className="rounded-[13px] p-[1.5px] bg-gradient-to-br from-[#fff5bd] via-[#d4af37] to-[#7c5308] shadow-[0_0_8px_rgba(212,175,55,0.45)] shrink-0">
                      <AvatarBadge name={seat.name} seed={seat.seed} size="sm" />
                    </div>
                    <div className="leading-tight">
                      <div className="text-[9px] font-semibold text-zinc-200 max-w-[44px] truncate">
                        {seat.name}
                      </div>
                      <div className="text-[9px] font-mono-num text-[#f6dc93]">
                        {(seat.coins / 1000).toFixed(1)}K
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
              </div>
            </div>
          </div>

          {/* Right Side Table Players (Desktop) */}
          <aside
            aria-label="Right table players"
            className="hidden lg:flex flex-col justify-center gap-2.5 w-[104px] shrink-0"
          >
            {rightSeats.map((seat) => (
              <div
                key={seat.seed}
                ref={(el) => {
                  seatRefs.current[`desk_${seat.seed}`] = el;
                }}
                className={`relative rounded-xl border p-2 flex flex-col items-center text-center shadow-lg transition-all ${
                  seat.lastWin
                    ? 'border-emerald-300 bg-emerald-950/85 shadow-emerald-500/30'
                    : 'border-[#f0c85c]/25 bg-[#0d1438]/85'
                }`}
              >
                {seat.lastWin ? (
                  <span className="absolute -top-2 right-1 px-1.5 py-0.5 rounded bg-emerald-500 text-[#042316] text-[9px] font-mono-num font-black shadow">
                    +{seat.lastWin}
                  </span>
                ) : null}
                <div className="rounded-[14px] p-[2px] bg-gradient-to-br from-[#fff5bd] via-[#d4af37] to-[#7c5308] shadow-[0_0_10px_rgba(212,175,55,0.45)]">
                  <AvatarBadge name={seat.name} seed={seat.seed} size="sm" />
                </div>
                <span className="text-[11px] font-semibold text-zinc-100 mt-1 truncate w-full">
                  {seat.name}
                </span>
                <span className="text-[10px] font-mono-num text-[#f6dc93] inline-flex items-center gap-0.5">
                  <Coins className="w-2.5 h-2.5 text-amber-400" />
                  {(seat.coins / 1000).toFixed(1)}K
                </span>
              </div>
            ))}
          </aside>
          </div>
        </div>

        {/* 2E. Lower 3D Temple Courtyard Stage (3D-Shaded Patrol Dragon & Tiger) */}
        <TempleCourtyardPatrolArena phase={phase} winner={winner} />
      </div>

      {/* 3. Pinned Bottom Player & Centered Chip Selector (1 – 1K) */}
      <div className="relative z-20 shrink-0 w-full border-t border-[#f0c85c]/35 bg-[#0b102c]/96 px-2.5 sm:px-4 py-1.5 sm:py-2">
        <div className="max-w-[460px] sm:max-w-[540px] lg:max-w-[760px] mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 sm:gap-3">
          {/* Player Avatar & Live Wallet Balance */}
          <div ref={playerAvatarRef} className="flex items-center gap-2 min-w-0 shrink-0 sm:min-w-[130px]">
            <div className="rounded-[14px] p-[2px] bg-gradient-to-br from-[#fff5bd] via-[#d4af37] to-[#7c5308] shadow-[0_0_12px_rgba(212,175,55,0.55)] shrink-0">
              <AvatarBadge
                name={profile?.username || 'You'}
                seed={profile?.avatarSeed || 'player'}
                size="sm"
              />
            </div>
            <div className="leading-tight min-w-0">
              <div className="text-[11px] font-semibold text-zinc-100 truncate max-w-[110px] sm:max-w-[120px]">
                {profile?.username || 'Guest Player'}
              </div>
              <div className="inline-flex items-center gap-1 font-mono-num text-xs sm:text-sm font-bold text-[#ffe484]">
                <Coins className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>{liveAvailableBalance.toLocaleString()}</span>
              </div>
            </div>
          </div>

          {/* 6 Glossy Poker Chip Selectors (1 – 1K) */}
          <div className="flex items-center justify-center gap-1.5 sm:gap-2.5">
            {CHIPS.map((val) => {
              const isSelected = selectedChip === val;
              return (
                <button
                  key={val}
                  ref={(el) => {
                    chipButtonRefs.current[val] = el;
                  }}
                  type="button"
                  disabled={phase !== 'betting'}
                  onClick={() => {
                    soundEngine.unlock();
                    soundEngine.playClick();
                    setSelectedChip(val);
                  }}
                  aria-label={`Select ${val} chip`}
                  className={`min-w-[40px] min-h-[42px] sm:min-w-[44px] sm:min-h-[44px] flex items-center justify-center transition-transform duration-150 disabled:opacity-50 ${
                    isSelected ? '-translate-y-1 scale-105' : 'hover:-translate-y-0.5'
                  }`}
                >
                  <span className="relative inline-flex items-center justify-center rounded-full">
                    {isSelected && (
                      <span
                        aria-hidden="true"
                        className="animate-emblem-ring pointer-events-none absolute -inset-[4px] rounded-full opacity-95 shadow-[0_0_12px_rgba(251,191,36,0.75)]"
                        style={{
                          background:
                            'conic-gradient(from 0deg, #fff6c3, #d4af37, transparent 38%, #fde047 68%, transparent 88%, #fff6c3)',
                        }}
                      />
                    )}
                    <CasinoChipToken value={val} size="md" selected={isSelected} />
                  </span>
                </button>
              );
            })}
          </div>

          <div className="hidden sm:block sm:min-w-[130px] shrink-0" aria-hidden="true" />
        </div>
      </div>

      {/* My Session Bet History Modal */}
      {historyOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4"
          onClick={() => setHistoryOpen(false)}
        >
          <div
            className="surface-panel rounded-2xl max-w-lg w-full p-5 space-y-4 max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg gold-gradient-text flex items-center gap-2">
                <History className="w-5 h-5 text-sky-300" />
                <span>Your Dragon Tiger Rounds</span>
              </h2>
              <button
                type="button"
                onClick={() => setHistoryOpen(false)}
                aria-label="Close history"
                className="text-zinc-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {myHistory.length === 0 ? (
                <div className="rounded-xl bg-black/30 border border-white/10 p-6 text-center text-sm text-zinc-400">
                  Place a chip on Dragon, Tie, or Tiger to record your rounds here.
                </div>
              ) : (
                myHistory.map((h) => (
                  <div
                    key={h.id}
                    className="rounded-xl bg-black/35 border border-white/10 px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="space-y-0.5 min-w-0">
                      <div className="font-semibold text-zinc-100">
                        Dragon <span className="text-sky-300">{h.dragonText}</span> vs Tiger{' '}
                        <span className="text-amber-300">{h.tigerText}</span>
                      </div>
                      <div className="text-[11px] text-zinc-400">
                        {h.time} · Winner: <span className="capitalize text-zinc-200">{h.winner}</span> · Bet{' '}
                        {h.wager.toLocaleString()}
                      </div>
                    </div>
                    <div
                      className={`font-mono-num font-bold shrink-0 ${
                        h.net > 0
                          ? 'text-emerald-400'
                          : h.net === 0
                            ? 'text-amber-300'
                            : 'text-rose-400'
                      }`}
                    >
                      {h.net > 0 ? `+${h.net.toLocaleString()}` : h.net.toLocaleString()}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Unified How to Play & Payouts Modal */}
      <GameRulesModal open={rulesOpen} game="dragon_tiger" onClose={() => setRulesOpen(false)} />

      {/* Provably Fair Verification Modal */}
      <ProvablyFairModal
        open={fairModalOpen}
        proof={fairProof}
        onClose={() => setFairModalOpen(false)}
      />

      {/* Safe Exit Confirmation Modal */}
      <GameExitModal
        open={backGuard.showExitConfirm}
        title="Leave Dragon Tiger Table?"
        description="You have chips on the table or an active deal in progress. Leaving now will cancel any un-dealt table bets."
        onCancel={backGuard.cancelExit}
        onConfirm={backGuard.confirmExit}
      />
    </div>
  );
}
