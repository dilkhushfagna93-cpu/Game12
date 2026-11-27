import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Coins,
  HelpCircle,
  History,
  Pause,
  Play,
  Repeat,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Undo2,
  X,
} from 'lucide-react';
import { AvatarBadge } from '../../components/AvatarBadge';
import { GameRulesModal } from '../../components/GameRulesModal';
import { GraphicsAudioBar } from '../../components/GraphicsAudioBar';
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
}

interface PlacedBetAction {
  zone: BetZone;
  value: ChipValue;
  chipId: string;
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
      ? 'w-7 h-7 text-[9px] border-2'
      : size === 'sm'
        ? 'w-9 h-9 text-[10px] border-2'
        : 'w-10 h-10 sm:w-12 sm:h-12 text-[11px] sm:text-xs border-[3px]';
  return (
    <span
      className={`relative inline-flex items-center justify-center rounded-full bg-gradient-to-b ${s.bg} ${s.ring} ${s.text} ${dims} font-mono-num font-extrabold shadow-[0_4px_12px_rgba(0,0,0,0.55)] select-none shrink-0 ${
        selected ? 'ring-2 ring-[#ffe38a] ring-offset-2 ring-offset-[#0c1028]' : ''
      }`}
    >
      <span
        aria-hidden="true"
        className="absolute inset-[3px] rounded-full border border-dashed border-white/60 pointer-events-none"
      />
      <span className="relative z-10 drop-shadow-[0_1px_1px_rgba(0,0,0,0.65)]">{s.label}</span>
    </span>
  );
}

export default function DragonTigerPage() {
  const { balance, profile, graphicsQuality, gameConfigs, placeBet, settleRound, pushToast } = useApp();
  const cfg = gameConfigs.dragon_tiger;

  const [selectedChip, setSelectedChip] = useState<ChipValue>(10);
  const [bets, setBets] = useState<{ dragon: number; tiger: number; tie: number }>({
    dragon: 0,
    tiger: 0,
    tie: 0,
  });
  const [lastRoundBets, setLastRoundBets] = useState<{
    dragon: number;
    tiger: number;
    tie: number;
  }>({ dragon: 0, tiger: 0, tie: 0 });
  const [betStack, setBetStack] = useState<PlacedBetAction[]>([]);
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
  const [autoLoop, setAutoLoop] = useState(true);
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

  const betsRef = useRef(bets);
  betsRef.current = bets;
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const balanceRef = useRef(balance);
  balanceRef.current = balance;
  const preparedRoundRef = useRef<PrepareResponse | null>(null);
  preparedRoundRef.current = preparedRound;
  const timersRef = useRef<number[]>([]);
  const mountedRef = useRef(true);
  const dealingLockRef = useRef(false);

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

  const appendChipVisual = useCallback(
    (zone: BetZone, value: ChipValue, owner: 'player' | 'left_seat' | 'right_seat' | 'table', forcedId?: string) => {
      const chipId = forcedId || `${owner}_${zone}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      setZoneChips((prev) => {
        const list = prev[zone];
        const maxLimit = 16;
        const currentList = list.slice(-maxLimit);

        const isNarrow = zone === 'tie';
        const rangeX = isNarrow ? 32 : 55;
        const rangeY = isNarrow ? 24 : 36;

        let offsetX = (Math.random() - 0.5) * rangeX * 1.2;
        let offsetY = (Math.random() - 0.5) * rangeY * 1.2;

        let attempts = 0;
        while (attempts < 25) {
          let minDist = Infinity;
          for (const existing of currentList) {
            const dx = existing.offsetX - offsetX;
            const dy = existing.offsetY - offsetY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < minDist) minDist = dist;
          }
          if (minDist >= 26 || currentList.length === 0) break;
          offsetX = (Math.random() - 0.5) * rangeX * 1.4;
          offsetY = (Math.random() - 0.5) * rangeY * 1.4;
          attempts++;
        }

        const chipItem: ChipVisual = {
          id: chipId,
          value,
          offsetX,
          offsetY,
          rotate: ((currentList.length * 17) % 36) - 18,
          owner,
        };
        return {
          ...prev,
          [zone]: [...currentList, chipItem],
        };
      });
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
      const chipId = appendChipVisual(zone, chipVal, 'player');
      setBetStack((prev) => [...prev, { zone, value: chipVal, chipId }]);
    },
    [appendChipVisual, cfg.enabled, cfg.maxBet, pushToast, selectedChip],
  );

  // Undo last placed chip
  const undoLastBet = () => {
    if (phase !== 'betting' || betStack.length === 0) return;
    soundEngine.playClick();
    const last = betStack[betStack.length - 1];
    setBetStack((prev) => prev.slice(0, -1));
    setBets((prev) => ({
      ...prev,
      [last.zone]: Math.max(0, prev[last.zone] - last.value),
    }));
    setZoneChips((prev) => ({
      ...prev,
      [last.zone]: prev[last.zone].filter((c) => c.id !== last.chipId),
    }));
  };

  // Clear all player bets for current round (keeps ambient table chips untouched)
  const clearBets = () => {
    if (phase !== 'betting' || totalBet === 0) return;
    soundEngine.playClick();
    setBets({ dragon: 0, tiger: 0, tie: 0 });
    setBetStack([]);
    setZoneChips((prev) => ({
      dragon: prev.dragon.filter((c) => c.owner !== 'player'),
      tie: prev.tie.filter((c) => c.owner !== 'player'),
      tiger: prev.tiger.filter((c) => c.owner !== 'player'),
    }));
  };

  // Double (2x) current player bets
  const doubleBets = () => {
    if (phase !== 'betting' || totalBet === 0) return;
    if (totalBet * 2 > balance) {
      pushToast('Not enough virtual coins to double your bets.', 'crimson');
      return;
    }
    if (totalBet * 2 > cfg.maxBet) {
      pushToast(`Doubling exceeds max table wager (${cfg.maxBet.toLocaleString()}).`, 'gold');
      return;
    }
    soundEngine.playChipPlace();
    const nextActions: PlacedBetAction[] = [];
    (['dragon', 'tie', 'tiger'] as BetZone[]).forEach((z) => {
      const amt = bets[z];
      if (amt > 0) {
        const chipVal: ChipValue =
          amt >= 1000 ? 1000 : amt >= 500 ? 500 : amt >= 100 ? 100 : amt >= 50 ? 50 : amt >= 10 ? 10 : 1;
        const chipId = appendChipVisual(z, chipVal, 'player');
        nextActions.push({ zone: z, value: chipVal, chipId });
      }
    });
    setBets((prev) => ({
      dragon: prev.dragon * 2,
      tie: prev.tie * 2,
      tiger: prev.tiger * 2,
    }));
    setBetStack((prev) => [...prev, ...nextActions]);
  };

  // Rebet exact bets from previous round
  const rebetPrevious = () => {
    if (phase !== 'betting') return;
    const prevTotal = lastRoundBets.dragon + lastRoundBets.tie + lastRoundBets.tiger;
    if (prevTotal <= 0) {
      pushToast('No previous round bet to repeat yet.', 'gold');
      return;
    }
    if (totalBet + prevTotal > balance) {
      pushToast('Insufficient virtual coins to repeat previous bet.', 'crimson');
      return;
    }
    if (totalBet + prevTotal > cfg.maxBet) {
      pushToast(`Rebet exceeds table max wager (${cfg.maxBet.toLocaleString()}).`, 'gold');
      return;
    }
    soundEngine.playChipPlace();
    const addedActions: PlacedBetAction[] = [];
    (['dragon', 'tie', 'tiger'] as BetZone[]).forEach((z) => {
      const amt = lastRoundBets[z];
      if (amt > 0) {
        const chipVal: ChipValue =
          amt >= 1000 ? 1000 : amt >= 500 ? 500 : amt >= 100 ? 100 : amt >= 50 ? 50 : amt >= 10 ? 10 : 1;
        const chipId = appendChipVisual(z, chipVal, 'player');
        addedActions.push({ zone: z, value: chipVal, chipId });
      }
    });
    setBets((prev) => ({
      dragon: prev.dragon + lastRoundBets.dragon,
      tie: prev.tie + lastRoundBets.tie,
      tiger: prev.tiger + lastRoundBets.tiger,
    }));
    setBetStack((prev) => [...prev, ...addedActions]);
  };

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
      setTablePool((prev) => ({ ...prev, [zone]: prev[zone] + chip }));
      appendChipVisual(zone, chip, isLeft ? 'left_seat' : 'right_seat');
      soundEngine.playSoftTableChip();
      const idx = Math.floor(Math.random() * 3);
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
      setBetStack([]);
    }

    if (wager > 0) {
      setLastRoundBets(activeBets);
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
        setBetStack([]);
        setTablePool({ dragon: 0, tiger: 0, tie: 0 });
        setZoneChips({ dragon: [], tie: [], tiger: [] });
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
  const hasPreviousBet = lastRoundBets.dragon + lastRoundBets.tie + lastRoundBets.tiger > 0;

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
    <div className="game-shell-height relative w-full overflow-hidden flex flex-col bg-[#090d24]">
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
              'radial-gradient(ellipse 85% 60% at 50% 35%, rgba(45, 36, 118, 0.45) 0%, rgba(11, 14, 42, 0.80) 68%, rgba(7, 8, 24, 0.94) 100%)',
          }}
        />
        <div
          className="absolute -left-16 top-16 w-52 h-64 rounded-full opacity-35 blur-3xl"
          style={{ background: 'radial-gradient(circle, rgba(251,191,36,0.55) 0%, transparent 70%)' }}
        />
        <div
          className="absolute -right-16 top-16 w-52 h-64 rounded-full opacity-35 blur-3xl"
          style={{ background: 'radial-gradient(circle, rgba(251,191,36,0.55) 0%, transparent 70%)' }}
        />
      </div>

      {/* 1. Slim Top Bar (Back, Provably Fair hash button, History, Rules, Graphics/Audio toggles) */}
      <div className="relative z-20 shrink-0 px-2.5 sm:px-4 py-1.5 border-b border-[#f0c85c]/30 bg-[#0b102d]/92">
        <div className="max-w-[460px] sm:max-w-[540px] lg:max-w-[760px] mx-auto flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={() => {
                soundEngine.playClick();
                backGuard.requestExit();
              }}
              aria-label="Back to Games"
              className="w-8 h-8 rounded-lg border border-white/15 bg-white/5 hover:bg-white/15 flex items-center justify-center text-zinc-200 shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="min-w-0">
              <h1 className="font-display text-xs sm:text-sm font-bold gold-gradient-text truncate leading-tight">
                Dragon Tiger Live
              </h1>
              {activeCommitHash && (
                <button
                  type="button"
                  onClick={() => setFairModalOpen(true)}
                  className="inline-flex items-center gap-1 text-[9px] sm:text-[10px] font-mono text-emerald-300/90 hover:text-emerald-200 truncate"
                >
                  <ShieldCheck className="w-2.5 h-2.5 shrink-0" />
                  <span>{activeCommitHash.slice(0, 10)}…</span>
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => {
                soundEngine.playClick();
                setHistoryOpen(true);
              }}
              aria-label="My Bet History"
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-white/15 bg-white/5 text-[11px] text-zinc-200 hover:bg-white/10 whitespace-nowrap"
            >
              <History className="w-3.5 h-3.5 text-sky-300" />
              <span className="hidden sm:inline">History</span>
            </button>
            {fairProof && (
              <button
                type="button"
                onClick={() => {
                  soundEngine.playClick();
                  setFairModalOpen(true);
                }}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-emerald-400/40 bg-emerald-950/60 text-[11px] font-medium text-emerald-200 hover:bg-emerald-900/60 whitespace-nowrap"
                title="Verify SHA-256 Provably Fair Deal"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>Fair</span>
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
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-[#f0c85c]/45 bg-[#f0c85c]/12 text-[11px] font-semibold text-[#fde68a] hover:bg-[#f0c85c]/22 whitespace-nowrap"
            >
              <HelpCircle className="w-3.5 h-3.5 text-[#f6dc93]" />
              <span className="hidden sm:inline">Rules</span>
            </button>
            <GraphicsAudioBar compact />
          </div>
        </div>
      </div>

      {!cfg.enabled && (
        <div className="relative z-20 shrink-0 px-3 py-2 bg-rose-950/90 border-b border-rose-500/40 text-center text-xs text-rose-200 font-medium">
          {cfg.maintenanceMessage || 'Dragon Tiger is currently under maintenance. New bets are paused.'}
        </div>
      )}

      {/* 2. Centered Proportionate Casino Table Arena (Zero Stretched Tall Pillars) */}
      <div className="relative z-10 flex-1 min-h-0 w-full overflow-y-auto flex flex-col justify-center px-2 sm:px-4 py-2">
        <div className="w-full max-w-[460px] sm:max-w-[520px] lg:max-w-[760px] mx-auto flex items-center justify-center gap-3">
          {/* Left Side Table Players (Desktop) */}
          <aside
            aria-label="Left table players"
            className="hidden lg:flex flex-col justify-center gap-2.5 w-[104px] shrink-0"
          >
            {leftSeats.map((seat) => (
              <div
                key={seat.seed}
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
                <AvatarBadge name={seat.name} seed={seat.seed} size="sm" />
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

          {/* Compact Casino Table Frame with Asian Temple Pillars & Hanging Lanterns */}
          <div className="relative w-full max-w-[460px] sm:max-w-[500px] mx-auto flex flex-col gap-2 rounded-2xl border-2 border-[#e8be56]/65 bg-gradient-to-b from-[#131a4a]/96 via-[#181748]/96 to-[#0d1130]/98 p-2 sm:p-3 shadow-[0_16px_50px_rgba(8,12,38,0.9),inset_0_1px_0_rgba(255,236,179,0.35)] overflow-hidden">
            {/* Hanging Temple Lanterns on Top-Left & Top-Right */}
            <div className="absolute -top-1 left-3 z-30 pointer-events-none flex flex-col items-center">
              <div className="w-1.5 h-4 bg-amber-600/80" />
              <div className="w-5 h-6 rounded-lg bg-gradient-to-b from-amber-400 via-orange-500 to-red-600 border border-yellow-200 shadow-[0_0_12px_rgba(251,191,36,0.85)] flex items-center justify-center text-[8px] font-black text-amber-950">
                福
              </div>
            </div>
            <div className="absolute -top-1 right-3 z-30 pointer-events-none flex flex-col items-center">
              <div className="w-1.5 h-4 bg-amber-600/80" />
              <div className="w-5 h-6 rounded-lg bg-gradient-to-b from-amber-400 via-orange-500 to-red-600 border border-yellow-200 shadow-[0_0_12px_rgba(251,191,36,0.85)] flex items-center justify-center text-[8px] font-black text-amber-950">
                福
              </div>
            </div>
            {/* Dramatic Phase / Winner Splash Overlay */}
            {splashBanner && (
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
              {/* 60fps Canvas VFX: Dragon Fire-Breath from mouth / Tiger Roar Shockwaves & Claw Slashes */}
              <DragonTigerWinnerFX active={phase === 'result' && Boolean(winner)} winner={winner} />

              {/* Compact Phase / Result Status Ribbon */}
              <div className="relative z-30 flex items-center justify-center">
                <div
                  className={`px-2.5 py-0.5 rounded-md border text-[10px] sm:text-[11px] font-bold tracking-wide truncate max-w-full shadow ${
                    phase === 'result' && winner === 'dragon'
                      ? 'bg-gradient-to-r from-blue-700 via-orange-600 to-red-600 border-amber-200 text-white'
                      : phase === 'result' && winner === 'tiger'
                        ? 'bg-amber-500/95 border-amber-100 text-[#1c0e02]'
                        : phase === 'result' && winner === 'tie'
                          ? 'bg-emerald-600/95 border-emerald-200 text-white'
                          : phase === 'betting' && countdown <= 3 && autoLoop
                            ? 'bg-rose-700/95 border-rose-300 text-white'
                            : 'bg-[#0b102c]/92 border-[#f5d06e]/45 text-[#fde68a]'
                  }`}
                >
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
                </div>
              </div>

              {/* Circular Moving Mascots + Crisp 3D VS Cards */}
              <div className="relative z-10 py-1.5 grid grid-cols-[84px_1fr_84px] sm:grid-cols-[100px_1fr_100px] items-center gap-1 sm:gap-2">
                {/* DRAGON Animated Circular Medallion */}
                <div className="relative flex flex-col items-center justify-center">
                  <div
                    className={`relative w-[78px] h-[78px] sm:w-[94px] sm:h-[94px] rounded-full p-[3px] flex items-center justify-center transition-transform duration-300 ${
                      phase === 'result' && winner === 'dragon'
                        ? 'scale-105 shadow-[0_0_28px_rgba(249,115,22,0.95),0_0_16px_rgba(56,189,248,0.85)]'
                        : 'shadow-[0_0_14px_rgba(56,189,248,0.45)]'
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
                            ? 'conic-gradient(from 0deg, #fef08a, #f97316, #dc2626, #38bdf8, #fef08a)'
                            : 'conic-gradient(from 0deg, #7dd3fc, #2563eb, #f6dc93, #1d4ed8, #7dd3fc)',
                      }}
                    />

                    {/* Inner Circular Portrait with Live Motion */}
                    <div className="relative w-full h-full rounded-full overflow-hidden bg-[#081538] border border-white/25">
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
                            ? 'bg-gradient-to-r from-transparent via-orange-500/20 to-amber-300/45 opacity-100'
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
                          ? 'bg-gradient-to-r from-orange-600 to-red-600 border-amber-200 text-white'
                          : 'bg-[#07153a] border-sky-300/70 text-sky-200'
                      }`}
                    >
                      DRAGON
                    </span>
                  </div>
                </div>

                {/* Center 3D Card Battle Stage: [Card] VS [Card] */}
                <div className="relative min-w-0 h-[100px] sm:h-[114px] flex items-center justify-center">
                  <DragonTigerCanvas
                    graphicsQuality={graphicsQuality}
                    phase={phase}
                    revealStep={revealStep}
                    dragonCard={dragonCard}
                    tigerCard={tigerCard}
                    winner={winner}
                  />

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

                {/* TIGER Animated Circular Medallion */}
                <div className="relative flex flex-col items-center justify-center">
                  <div
                    className={`relative w-[78px] h-[78px] sm:w-[94px] sm:h-[94px] rounded-full p-[3px] flex items-center justify-center transition-transform duration-300 ${
                      phase === 'result' && winner === 'tiger'
                        ? 'scale-105 shadow-[0_0_28px_rgba(251,191,36,0.95),0_0_16px_rgba(234,88,12,0.85)]'
                        : 'shadow-[0_0_14px_rgba(251,191,36,0.45)]'
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
                    <div className="relative w-full h-full rounded-full overflow-hidden bg-[#351506] border border-white/25">
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

            {/* 2C. COMPACT 3-ZONE BETTING TABLE (Fixed h-[145px] sm:h-[160px], 37% | 26% | 37%) */}
            <div className="shrink-0 h-[145px] sm:h-[160px] flex items-stretch gap-1.5 sm:gap-2">
              {/* DRAGON 1:1 ZONE (w-[37%]) */}
              <button
                type="button"
                disabled={phase !== 'betting'}
                onClick={() => addChipToZone('dragon')}
                className={`group relative w-[37%] h-full rounded-xl border-2 p-1.5 sm:p-2 flex flex-col justify-between text-left overflow-hidden transition-transform active:scale-[0.98] disabled:cursor-default ${
                  phase === 'result' && winner === 'dragon'
                    ? 'border-[#ffe484] shadow-[0_0_28px_rgba(56,189,248,0.9)] animate-winner-halo'
                    : 'border-sky-300/75 hover:border-sky-100'
                } bg-gradient-to-b from-[#2563eb]/95 via-[#1d4ed8]/95 to-[#172554]/95`}
              >
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

                <div className="relative z-10 flex-1 w-full flex flex-col items-center justify-center">
                  <div className="font-display text-sm sm:text-lg font-black tracking-wide text-white leading-tight drop-shadow-[0_2px_4px_rgba(0,0,0,0.65)]">
                    DRAGON
                  </div>
                  <div className="font-mono-num text-[9px] sm:text-[10px] font-bold text-sky-200 leading-none">
                    1 : 1
                  </div>

                  {zoneChips.dragon.length > 0 && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      {zoneChips.dragon.map((chip) => (
                        <div
                          key={chip.id}
                          className={`absolute ${
                            chip.owner === 'left_seat'
                              ? 'animate-chip-toss-left'
                              : chip.owner === 'right_seat'
                                ? 'animate-chip-toss-right'
                                : 'animate-chip-toss-bottom'
                          }`}
                          style={{
                            marginLeft: `${chip.offsetX}px`,
                            marginTop: `${chip.offsetY}px`,
                          }}
                        >
                          <CasinoChipToken value={chip.value} size="xs" />
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="relative z-10 text-center text-[9px] sm:text-[10px] font-semibold text-sky-100/90 leading-none">
                  {phase === 'betting'
                    ? `+${selectedChip} Tap`
                    : bets.dragon > 0
                      ? 'Locked'
                      : 'Closed'}
                </div>
              </button>

              {/* TIE 8:1 ZONE (w-[26%]) */}
              <button
                type="button"
                disabled={phase !== 'betting'}
                onClick={() => addChipToZone('tie')}
                className={`group relative w-[26%] h-full rounded-xl border-2 p-1.5 sm:p-2 flex flex-col justify-between text-left overflow-hidden transition-transform active:scale-[0.98] disabled:cursor-default ${
                  phase === 'result' && winner === 'tie'
                    ? 'border-[#ffe484] shadow-[0_0_28px_rgba(52,211,153,0.95)] animate-winner-halo'
                    : 'border-emerald-300/75 hover:border-emerald-100'
                } bg-gradient-to-b from-[#10b981]/95 via-[#059669]/95 to-[#064e3b]/95`}
              >
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

                <div className="relative z-10 flex-1 w-full flex flex-col items-center justify-center">
                  <div className="font-display text-sm sm:text-base font-black tracking-wide text-white leading-tight drop-shadow-[0_2px_4px_rgba(0,0,0,0.65)]">
                    TIE
                  </div>
                  <div className="font-mono-num text-[9px] sm:text-[10px] font-bold text-[#ffe484] leading-none">
                    8 : 1
                  </div>
                  <div className="mt-0.5 text-[8px] sm:text-[9px] font-mono-num text-emerald-200 bg-black/45 px-1.5 py-0.2 rounded-full border border-emerald-300/30">
                    Rate: {Math.max(1, Math.min(99, Math.round(dragonPct)))}%
                  </div>

                  {zoneChips.tie.length > 0 && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      {zoneChips.tie.map((chip) => (
                        <div
                          key={chip.id}
                          className={`absolute ${
                            chip.owner === 'left_seat'
                              ? 'animate-chip-toss-left'
                              : chip.owner === 'right_seat'
                                ? 'animate-chip-toss-right'
                                : 'animate-chip-toss-bottom'
                          }`}
                          style={{
                            marginLeft: `${chip.offsetX}px`,
                            marginTop: `${chip.offsetY}px`,
                          }}
                        >
                          <CasinoChipToken value={chip.value} size="xs" />
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="relative z-10 text-center text-[8px] sm:text-[10px] font-semibold text-emerald-100/90 leading-none truncate">
                  {phase === 'betting' ? `+${selectedChip}` : bets.tie > 0 ? 'Locked' : 'Closed'}
                </div>
              </button>

              {/* TIGER 1:1 ZONE (w-[37%]) */}
              <button
                type="button"
                disabled={phase !== 'betting'}
                onClick={() => addChipToZone('tiger')}
                className={`group relative w-[37%] h-full rounded-xl border-2 p-1.5 sm:p-2 flex flex-col justify-between text-left overflow-hidden transition-transform active:scale-[0.98] disabled:cursor-default ${
                  phase === 'result' && winner === 'tiger'
                    ? 'border-[#ffe484] shadow-[0_0_28px_rgba(251,191,36,0.95)] animate-winner-halo'
                    : 'border-amber-300/75 hover:border-amber-100'
                } bg-gradient-to-b from-[#f59e0b]/95 via-[#d97706]/95 to-[#7c2d12]/95`}
              >
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

                <div className="relative z-10 flex-1 w-full flex flex-col items-center justify-center">
                  <div className="font-display text-sm sm:text-lg font-black tracking-wide text-white leading-tight drop-shadow-[0_2px_4px_rgba(0,0,0,0.65)]">
                    TIGER
                  </div>
                  <div className="font-mono-num text-[9px] sm:text-[10px] font-bold text-amber-100 leading-none">
                    1 : 1
                  </div>

                  {zoneChips.tiger.length > 0 && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      {zoneChips.tiger.map((chip) => (
                        <div
                          key={chip.id}
                          className={`absolute ${
                            chip.owner === 'left_seat'
                              ? 'animate-chip-toss-left'
                              : chip.owner === 'right_seat'
                                ? 'animate-chip-toss-right'
                                : 'animate-chip-toss-bottom'
                          }`}
                          style={{
                            marginLeft: `${chip.offsetX}px`,
                            marginTop: `${chip.offsetY}px`,
                          }}
                        >
                          <CasinoChipToken value={chip.value} size="xs" />
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="relative z-10 text-center text-[9px] sm:text-[10px] font-semibold text-amber-100/90 leading-none">
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
                    className={`flex items-center gap-1 rounded-lg border px-1.5 py-0.5 ${
                      seat.lastWin
                        ? 'bg-emerald-950/80 border-emerald-400/50'
                        : 'bg-black/35 border-white/10'
                    }`}
                  >
                    <AvatarBadge name={seat.name} seed={seat.seed} size="sm" />
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
                    className={`flex items-center gap-1 rounded-lg border px-1.5 py-0.5 ${
                      seat.lastWin
                        ? 'bg-emerald-950/80 border-emerald-400/50'
                        : 'bg-black/35 border-white/10'
                    }`}
                  >
                    <AvatarBadge name={seat.name} seed={seat.seed} size="sm" />
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

          {/* Right Side Table Players (Desktop) */}
          <aside
            aria-label="Right table players"
            className="hidden lg:flex flex-col justify-center gap-2.5 w-[104px] shrink-0"
          >
            {rightSeats.map((seat) => (
              <div
                key={seat.seed}
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
                <AvatarBadge name={seat.name} seed={seat.seed} size="sm" />
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

      {/* 3. Pinned Bottom Player, Chip Selector (10–1K) & Action Dock */}
      <div className="relative z-20 shrink-0 w-full border-t border-[#f0c85c]/35 bg-[#0b102c]/96 px-2.5 sm:px-4 py-2">
        <div className="max-w-[460px] sm:max-w-[540px] lg:max-w-[760px] mx-auto flex flex-col gap-2">
          {/* Row 1: User Avatar & Live Balance + Bet Actions + Deal Button */}
          <div className="flex items-center justify-between gap-1.5">
            <div className="flex items-center gap-2 min-w-0 shrink-0">
              <AvatarBadge
                name={profile?.username || 'You'}
                seed={profile?.avatarSeed || 'player'}
                size="sm"
              />
              <div className="leading-tight min-w-0">
                <div className="text-[11px] font-semibold text-zinc-100 truncate max-w-[80px] sm:max-w-[120px]">
                  {profile?.username || 'Guest Player'}
                </div>
                <div className="inline-flex items-center gap-1 font-mono-num text-xs sm:text-sm font-bold text-[#ffe484]">
                  <Coins className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span>{liveAvailableBalance.toLocaleString()}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                disabled={phase !== 'betting' || betStack.length === 0}
                onClick={undoLastBet}
                aria-label="Undo last chip"
                title="Undo last chip"
                className="w-8 h-9 rounded-lg border border-white/15 bg-white/5 hover:bg-white/15 flex items-center justify-center text-zinc-200 disabled:opacity-35"
              >
                <Undo2 className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                disabled={phase !== 'betting' || totalBet === 0}
                onClick={clearBets}
                aria-label="Clear bets"
                title="Clear all bets"
                className="w-8 h-9 rounded-lg border border-white/15 bg-white/5 hover:bg-white/15 flex items-center justify-center text-zinc-200 disabled:opacity-35"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                disabled={phase !== 'betting' || totalBet === 0}
                onClick={doubleBets}
                aria-label="Double current bets"
                title="Double (2x) current bets"
                className="h-9 px-2 rounded-lg border border-sky-400/35 bg-sky-950/60 hover:bg-sky-900/70 text-[11px] font-mono-num font-black text-sky-200 disabled:opacity-35 whitespace-nowrap"
              >
                2x
              </button>

              <button
                type="button"
                disabled={phase !== 'betting' || !hasPreviousBet}
                onClick={rebetPrevious}
                aria-label="Repeat previous round bet"
                title="Rebet previous round"
                className="h-9 px-2 rounded-lg border border-amber-400/35 bg-amber-950/60 hover:bg-amber-900/70 text-[11px] font-semibold text-amber-200 inline-flex items-center gap-1 disabled:opacity-35 whitespace-nowrap"
              >
                <Repeat className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Rebet</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  soundEngine.unlock();
                  soundEngine.playClick();
                  setAutoLoop((v) => !v);
                }}
                className={`h-9 px-2 rounded-lg border text-[11px] font-bold inline-flex items-center gap-1 whitespace-nowrap ${
                  autoLoop
                    ? 'border-emerald-400/60 bg-emerald-900/50 text-emerald-200'
                    : 'border-white/20 bg-white/10 text-zinc-200'
                }`}
                title={autoLoop ? 'Pause live auto-rounds' : 'Resume live auto-rounds'}
              >
                {autoLoop ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                <span>{autoLoop ? `${countdown}s` : 'Auto'}</span>
              </button>

              <button
                type="button"
                disabled={phase !== 'betting'}
                onClick={() => void runDeal()}
                className="gold-button h-9 px-3 rounded-lg text-xs font-extrabold disabled:opacity-45 whitespace-nowrap"
              >
                {phase === 'betting' ? 'Deal' : 'Wait…'}
              </button>
            </div>
          </div>

          {/* Row 2: 6 Glossy Poker Chip Selectors (1 – 1K) */}
          <div className="flex items-center justify-center gap-1.5 sm:gap-3 pt-0.5">
            {CHIPS.map((val) => {
              const isSelected = selectedChip === val;
              return (
                <button
                  key={val}
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
                  <CasinoChipToken value={val} size="md" selected={isSelected} />
                </button>
              );
            })}
          </div>
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
