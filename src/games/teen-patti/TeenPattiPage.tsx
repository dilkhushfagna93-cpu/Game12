import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Check,
  Coins,
  Copy,
  Crown,
  Eye,
  Heart,
  HelpCircle,
  Lock,
  MessageCircle,
  Minus,
  Plus,
  RefreshCw,
  Share2,
  ShieldCheck,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import { AvatarBadge } from '../../components/AvatarBadge';
import { GameRulesModal } from '../../components/GameRulesModal';
import { doc, getDoc } from 'firebase/firestore';
import { GraphicsAudioBar } from '../../components/GraphicsAudioBar';
import { ProvablyFairModal } from '../../components/ProvablyFairModal';
import { useApp } from '../../context/AppContext';
import { useGameBackGuard } from '../../hooks/useGameBackGuard';
import { db } from '../../services/firebase';
import { soundEngine } from '../../services/soundEngine';
import {
  commitTeenPattiRoomUpdate,
  createTeenPattiRoom,
  dealNextTeenPattiHand,
  fillTeenPattiRoomAndDeal,
  findAndJoinTeenPattiRoomByCode,
  findOrCreatePublicTeenPattiRoom,
  getNaturalReactionDelayMs,
  requestServerTeenPattiDeal,
  sendTeenPattiReaction,
  subscribeToTeenPattiRoom,
} from '../../services/teenPattiService';
import { canAffordGameEntry } from '../../services/walletService';
import type {
  PlayingCard,
  ProvablyFairProof,
  TeenPattiBootAmount,
  TeenPattiRoom,
  TeenPattiSeatPlayer,
} from '../../types';
import {
  ChipFlyEvent,
  TeenPattiCanvas,
  WinSweepEvent,
} from './TeenPattiCanvas';
import {
  calculateTeenPattiNetPayout,
  computePlayerStakeOptions,
  deriveNextTableStakeUnit,
  evaluateTeenPattiHand,
  getShortCategoryBadge,
  getTeenPattiTableTier,
  isRedSuit,
  SUIT_SYMBOLS,
  TEEN_PATTI_BOOT_TABLES,
  TEEN_PATTI_RAKE_PERCENT,
} from './teenPattiLogic';

const TURN_DURATION_SEC = 15;
const DEFAULT_MATCHMAKING_WAIT_SEC = 8;

const QUICK_CHATS: Array<{ emoji: string; text: string }> = [
  { emoji: '🔥', text: 'Nice Hand!' },
  { emoji: '🪙', text: 'Chaal Chal' },
  { emoji: '🃏', text: 'Pack Kar' },
  { emoji: '😎', text: 'Blind King' },
  { emoji: '👏', text: 'Well Played' },
  { emoji: '💎', text: 'Trail!' },
];

const GUEST_BOT_NAMES = ['Aarav_99', 'PriyaRoy', 'VikramPro', 'KabirAce'];

function findNextActiveIndex(players: TeenPattiSeatPlayer[], fromIndex: number): number {
  const n = players.length;
  for (let offset = 1; offset <= n; offset++) {
    const idx = (fromIndex + offset) % n;
    if (players[idx]?.status === 'active') return idx;
  }
  return fromIndex;
}

function findPreviousActiveIndex(players: TeenPattiSeatPlayer[], fromIndex: number): number {
  const n = players.length;
  for (let offset = 1; offset <= n; offset++) {
    const idx = (fromIndex - offset + n) % n;
    if (players[idx]?.status === 'active') return idx;
  }
  return -1;
}

/**
 * Maps room seat indices into 5 visual slots around the emerald oval:
 * 0 = Bottom-Center (Local Player), 1 = Lower-Left, 2 = Upper-Left, 3 = Upper-Right, 4 = Lower-Right
 */
function getVisualSlotForRelativeOffset(relOffset: number, totalSeats: number): number {
  if (relOffset === 0) return 0;
  if (totalSeats === 2) return 2;
  if (totalSeats === 3) return relOffset === 1 ? 1 : 4;
  if (totalSeats === 4) {
    if (relOffset === 1) return 1;
    if (relOffset === 2) return 2;
    return 3;
  }
  return Math.min(4, relOffset);
}

function PlayingCardMini({
  card,
  faceUp,
  packed,
  large = false,
  tiltDeg = 0,
}: {
  card?: PlayingCard;
  faceUp: boolean;
  packed: boolean;
  large?: boolean;
  tiltDeg?: number;
}) {
  const sizeClass = large
    ? 'w-11 h-16 sm:w-14 sm:h-20 rounded-lg'
    : 'w-8 h-12 sm:w-10 sm:h-14 rounded-md';

  const red = card ? isRedSuit(card.suit) : false;
  const suitChar = card ? SUIT_SYMBOLS[card.suit] : '';

  return (
    <div
      style={{ transform: `rotate(${tiltDeg}deg)` }}
      className={`${sizeClass} relative shrink-0 select-none transition-all duration-300 shadow-[0_6px_14px_rgba(0,0,0,0.65)] ${
        packed ? 'opacity-40 grayscale brightness-75' : ''
      } ${
        faceUp && card
          ? 'bg-gradient-to-br from-[#fffdf7] via-[#f8f3e6] to-[#ebe2cc] border border-amber-300/80'
          : 'bg-gradient-to-br from-[#7f1d1d] via-[#450a0a] to-[#1f070b] border border-[#d4af37]/75'
      }`}
    >
      {faceUp && card ? (
        <div
          className={`w-full h-full flex flex-col justify-between p-1 leading-none ${
            red ? 'text-rose-600' : 'text-zinc-900'
          }`}
        >
          <div className="flex flex-col items-start">
            <span className={`${large ? 'text-xs sm:text-sm' : 'text-[10px] sm:text-xs'} font-black font-mono-num`}>
              {card.label}
            </span>
            <span className={`${large ? 'text-[10px] sm:text-xs' : 'text-[9px]'} leading-none`}>
              {suitChar}
            </span>
          </div>
          <div className={`self-center ${large ? 'text-lg sm:text-2xl' : 'text-xs sm:text-sm'} leading-none -mt-1`}>
            {suitChar}
          </div>
          <div className="self-end rotate-180 flex flex-col items-start opacity-85">
            <span className={`${large ? 'text-[10px]' : 'text-[8px]'} font-bold font-mono-num`}>
              {card.label}
            </span>
          </div>
        </div>
      ) : (
        <div className="w-full h-full p-1 flex items-center justify-center">
          <div className="w-full h-full rounded border border-[#f6dc93]/40 bg-[radial-gradient(circle_at_center,rgba(212,175,55,0.28)_0%,transparent_72%)] flex items-center justify-center">
            <span className="font-display text-[9px] sm:text-[11px] font-bold text-[#f6dc93]/85">A</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function TeenPattiPage() {
  const navigate = useNavigate();
  const {
    firebaseUser,
    profile,
    balance,
    depositBalance,
    winningBalance,
    bonusBalance,
    isGuestMode,
    gameConfigs,
    platformSettings,
    graphicsQuality,
    placeBet,
    settleRound,
    pushToast,
  } = useApp();

  const cfg = gameConfigs.teen_patti;
  const isMaintenance = cfg?.enabled === false;
  const configuredWaitSec = Math.max(
    5,
    Math.min(15, Math.round(platformSettings.matchmakingWaitSeconds || DEFAULT_MATCHMAKING_WAIT_SEC)),
  );
  const myUid = firebaseUser?.uid || 'guest_player';
  const myName = profile?.username || firebaseUser?.displayName || 'GuestPlayer';

  const playableBalance = useMemo(() => {
    if (!firebaseUser || isGuestMode) return balance;
    return depositBalance + winningBalance + bonusBalance;
  }, [firebaseUser, isGuestMode, balance, depositBalance, winningBalance, bonusBalance]);

  const checkCanAfford = useCallback(
    (amount: number): boolean => {
      if (!firebaseUser || isGuestMode) return balance >= amount;
      return canAffordGameEntry(
        { depositBalance, winningBalance, bonusBalance },
        'teen_patti',
        amount,
      ).ok;
    },
    [firebaseUser, isGuestMode, balance, depositBalance, winningBalance, bonusBalance],
  );

  // Lobby & Table UI State
  const [lobbyTab, setLobbyTab] = useState<'boot' | 'private'>('boot');
  const [selectedPrivateBoot, setSelectedPrivateBoot] = useState<TeenPattiBootAmount>(10);
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [busyAction, setBusyAction] = useState(false);
  const [tableJitter, setTableJitter] = useState<Record<number, number>>({});

  // Active Room State (either synced from Firestore or local guest table)
  const [room, setRoom] = useState<TeenPattiRoom | null>(null);
  const [isLocalGuestRoom, setIsLocalGuestRoom] = useState(false);
  const [matchmakingSec, setMatchmakingSec] = useState<number>(configuredWaitSec);

  // Per-turn controls & overlays
  const [raise2x, setRaise2x] = useState(false);
  const [turnRemainingSec, setTurnRemainingSec] = useState<number>(TURN_DURATION_SEC);
  const [chatOpen, setChatOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [fairOpen, setFairOpen] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [tipFeedback, setTipFeedback] = useState(false);

  // Canvas animation triggers
  const [dealPulse, setDealPulse] = useState(0);
  const [chipEvent, setChipEvent] = useState<ChipFlyEvent | null>(null);
  const [winSweepEvent, setWinSweepEvent] = useState<WinSweepEvent | null>(null);
  const [tipDealerPulse, setTipDealerPulse] = useState(0);

  // Settlement & turn guards
  const settledRoundsRef = useRef<Set<string>>(new Set());
  const bootPaidRoundsRef = useRef<Set<string>>(new Set());
  const botBusyKeyRef = useRef<string>('');
  const timeoutFiredKeyRef = useRef<string>('');
  const prevRoundIdRef = useRef<string>('');
  const prevPotRef = useRef<number>(0);
  const prevShowdownIdRef = useRef<string>('');
  const turnCountRef = useRef<number>(0);

  const isInLiveHand = Boolean(room && room.status === 'playing');
  const { showExitConfirm, confirmExit, cancelExit, requestExit } = useGameBackGuard(
    isInLiveHand,
    '/',
  );

  // Gentle online-player count drift on lobby cards
  useEffect(() => {
    const id = window.setInterval(() => {
      const next: Record<number, number> = {};
      TEEN_PATTI_BOOT_TABLES.forEach((t) => {
        next[t.boot] = Math.floor(Math.random() * 26) - 12;
      });
      setTableJitter(next);
    }, 6500);
    return () => window.clearInterval(id);
  }, []);

  // Sync active Teen Patti room to localStorage
  useEffect(() => {
    if (room && !isLocalGuestRoom) {
      localStorage.setItem('aurelia_tp_active_room', room.roomId);
    } else {
      localStorage.removeItem('aurelia_tp_active_room');
    }
  }, [room, isLocalGuestRoom]);

  // Auto-rejoin active Teen Patti room on mount
  useEffect(() => {
    if (room || !firebaseUser || isGuestMode) return;
    const savedRoomId = localStorage.getItem('aurelia_tp_active_room');
    if (!savedRoomId) return;

    void (async () => {
      try {
        const snap = await getDoc(doc(db, 'teenPattiRooms', savedRoomId));
        if (snap.exists()) {
          const fetchedRoom = snap.data() as TeenPattiRoom;
          if (fetchedRoom.playerUids.includes(myUid) && fetchedRoom.status !== 'showdown') {
            setRoom(fetchedRoom);
            pushToast('Rejoined your active table', 'emerald');
            return;
          }
        }
        localStorage.removeItem('aurelia_tp_active_room');
      } catch {
        localStorage.removeItem('aurelia_tp_active_room');
      }
    })();
  }, [room, firebaseUser, isGuestMode, myUid, pushToast]);

  // Subscribe to Firestore room when online
  useEffect(() => {
    if (!room || isLocalGuestRoom) return;
    const unsub = subscribeToTeenPattiRoom(
      room.roomId,
      (updated) => {
        if (updated) {
          setRoom(updated);
        }
      },
      () => {
        pushToast('Connection hiccup while syncing Teen Patti table.', 'crimson');
      },
    );
    return () => unsub();
  }, [room?.roomId, isLocalGuestRoom, pushToast]);

  // Derived seat references
  const mySeatIndex = useMemo(() => {
    if (!room) return -1;
    return room.players.findIndex((p) => p.uid === myUid);
  }, [room, myUid]);

  const myPlayer = useMemo(() => {
    if (!room || mySeatIndex < 0) return null;
    return room.players[mySeatIndex] || null;
  }, [room, mySeatIndex]);

  const activePlayers = useMemo(() => {
    if (!room) return [];
    return room.players.filter((p) => p.status === 'active');
  }, [room]);

  const isMyTurn = Boolean(
    room &&
      room.status === 'playing' &&
      mySeatIndex >= 0 &&
      room.currentTurnIndex === mySeatIndex &&
      myPlayer?.status === 'active' &&
      (!room.sideShowRequest || room.sideShowRequest.status !== 'pending'),
  );

  // Previous active player (for Side Show eligibility)
  const previousActivePlayer = useMemo(() => {
    if (!room || mySeatIndex < 0) return null;
    const prevIdx = findPreviousActiveIndex(room.players, mySeatIndex);
    if (prevIdx < 0 || prevIdx === mySeatIndex) return null;
    return room.players[prevIdx] || null;
  }, [room, mySeatIndex]);

  const stakeOptions = useMemo(() => {
    if (!room || !myPlayer) {
      return { minBet: 1, maxBet: 2, canDouble: false };
    }
    return computePlayerStakeOptions({
      isSeen: myPlayer.isSeen,
      currentStake: room.currentStake,
      bootAmount: room.bootAmount,
      chaalLimit: room.chaalLimit,
    });
  }, [room, myPlayer]);

  const selectedWagerAmount = raise2x && stakeOptions.canDouble ? stakeOptions.maxBet : stakeOptions.minBet;

  const canRequestSideShow = Boolean(
    isMyTurn &&
      myPlayer?.isSeen &&
      activePlayers.length > 2 &&
      previousActivePlayer &&
      previousActivePlayer.isSeen &&
      checkCanAfford(selectedWagerAmount),
  );

  const canRequestShow = Boolean(
    isMyTurn &&
      activePlayers.length === 2 &&
      checkCanAfford(stakeOptions.minBet),
  );

  const incomingSideShow = useMemo(() => {
    if (!room || !room.sideShowRequest) return null;
    if (room.sideShowRequest.status === 'pending' && room.sideShowRequest.targetUid === myUid) {
      return room.sideShowRequest;
    }
    return null;
  }, [room, myUid]);

  // Reset raise toggle whenever turn changes
  useEffect(() => {
    setRaise2x(false);
  }, [room?.currentTurnIndex, room?.roundId, myPlayer?.isSeen]);

  // Trigger canvas deal animation & boot payment when a new roundId starts
  useEffect(() => {
    if (!room || room.status !== 'playing' || !room.roundId) return;
    if (prevRoundIdRef.current !== room.roundId) {
      prevRoundIdRef.current = room.roundId;
      turnCountRef.current = 0;
      setDealPulse((p) => p + 1);
      soundEngine.playCardFlip();

      // Deduct boot atomically once per round if not already deducted on table entry
      if (!bootPaidRoundsRef.current.has(room.roundId)) {
        bootPaidRoundsRef.current.add(room.roundId);
        void placeBet(
          'teen_patti',
          room.bootAmount,
          `${room.roundId}_boot`,
          `Teen Patti Hand #${room.handNumber} Boot (₹${room.bootAmount})`,
        ).catch(() => {});
      }
    }
  }, [room, placeBet]);

  // Trigger flying chip FX whenever pot increases
  useEffect(() => {
    if (!room) {
      prevPotRef.current = 0;
      return;
    }
    if (room.pot > prevPotRef.current && room.status === 'playing') {
      const delta = room.pot - prevPotRef.current;
      // Map previous turn or current action seat to visual seat
      const total = room.players.length;
      const baseIdx = mySeatIndex >= 0 ? mySeatIndex : 0;
      const actorIdx = (room.currentTurnIndex - 1 + total) % total;
      const rel = (actorIdx - baseIdx + total) % total;
      const visualSeat = getVisualSlotForRelativeOffset(rel, total);
      setChipEvent({ id: Date.now(), fromVisualSeat: visualSeat, amount: delta });
      soundEngine.playChipPlace();
    }
    prevPotRef.current = room.pot;
  }, [room?.pot, room?.status, room?.currentTurnIndex, room?.players.length, mySeatIndex]);

  // Trigger showdown reveal FX & atomic wallet settlement once per round
  useEffect(() => {
    if (!room || room.status !== 'showdown' || !room.roundId) return;
    if (prevShowdownIdRef.current !== room.roundId) {
      prevShowdownIdRef.current = room.roundId;
      const total = room.players.length;
      const baseIdx = mySeatIndex >= 0 ? mySeatIndex : 0;
      const winIdx = room.players.findIndex((p) => p.uid === room.winnerUid);
      const rel = winIdx >= 0 ? (winIdx - baseIdx + total) % total : 0;
      const visualSeat = getVisualSlotForRelativeOffset(rel, total);
      setWinSweepEvent({ id: Date.now(), toVisualSeat: visualSeat });

      if (room.winnerUid === myUid) {
        soundEngine.playShowdownReveal();
        window.setTimeout(() => soundEngine.playWinFanfare(), 240);
      } else {
        soundEngine.playShowdownReveal();
      }
    }

    if (!settledRoundsRef.current.has(room.roundId) && myPlayer) {
      settledRoundsRef.current.add(room.roundId);
      const isWinner = room.winnerUid === myUid;
      const payout = isWinner ? room.winnerPayout : 0;
      const summary = isWinner
        ? `Won Teen Patti ₹${room.bootAmount} Table (${room.winnerHandLabel || 'Last Standing'}) · Pot ₹${room.pot}`
        : `Teen Patti ₹${room.bootAmount} Table · Won by ${room.winnerName} (${room.winnerHandLabel || 'Showdown'})`;

      void settleRound({
        game: 'teen_patti',
        roundId: room.roundId,
        betAmount: Math.max(room.bootAmount, myPlayer.totalBet),
        payout,
        outcome: isWinner ? 'win' : 'loss',
        summary,
        seedHash: room.serverSeedHash || room.roundId,
      }).catch(() => {});
    }
  }, [room, myUid, myPlayer, mySeatIndex, settleRound]);

  // Helper to commit room updates (either Firestore or local guest state)
  const applyRoomUpdate = useCallback(
    async (
      targetRoom: TeenPattiRoom,
      patch: Partial<TeenPattiRoom>,
    ) => {
      if (isLocalGuestRoom) {
        setRoom((prev) => (prev ? { ...prev, ...patch } : prev));
      } else {
        await commitTeenPattiRoomUpdate(targetRoom.roomId, patch);
      }
    },
    [isLocalGuestRoom],
  );

  // Trigger server-authoritative showdown
  const triggerServerShowdown = useCallback(
    async (
      currentRoom: TeenPattiRoom,
      playersList: TeenPattiSeatPlayer[],
      finalPot: number,
      initiatorUid: string,
      reasonPrefix: string,
    ) => {
      const contenders = playersList.filter((p) => p.status === 'active');
      if (contenders.length === 0) return;

      // If only 1 player remains (everyone else packed), still call showdown endpoint to reveal serverSeed & compute payout cleanly
      try {
        const res = await fetch('/api/games/teen-patti/showdown', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            roundId: currentRoom.roundId,
            players: contenders.map((c) => ({ uid: c.uid, cards: c.cards })),
            pot: finalPot,
            initiatorUid,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Showdown failed');

        const evalMap = new Map<string, string>();
        if (Array.isArray(data.evaluations)) {
          data.evaluations.forEach((ev: { uid: string; label: string }) => {
            evalMap.set(ev.uid, ev.label);
          });
        }

        const winnerPlayer = playersList.find((p) => p.uid === data.winnerUid) || contenders[0];
        const updatedPlayers = playersList.map((p) => ({
          ...p,
          isSeen: p.status === 'active' ? true : p.isSeen,
          handLabel: evalMap.get(p.uid) || (p.cards.length === 3 ? evaluateTeenPattiHand(p.cards).label : ''),
          lastAction:
            p.uid === winnerPlayer.uid
              ? `Won ₹${Number(data.winnerPayout || 0).toLocaleString()}`
              : p.status === 'packed'
                ? 'Packed'
                : 'Show',
        }));

        await applyRoomUpdate(currentRoom, {
          players: updatedPlayers,
          status: 'showdown',
          pot: finalPot,
          winnerUid: winnerPlayer.uid,
          winnerName: winnerPlayer.name,
          winnerHandLabel:
            contenders.length === 1
              ? 'All Others Packed'
              : String(data.winnerHandLabel || 'SHOWDOWN'),
          winnerPayout: Number(data.winnerPayout || calculateTeenPattiNetPayout(finalPot)),
          serverSeed: String(data.serverSeed || ''),
          serverSeedHash: String(data.serverSeedHash || currentRoom.serverSeedHash),
          sideShowRequest: null,
          lastActionNote: `${reasonPrefix} · ${winnerPlayer.name} wins ₹${Number(data.winnerPayout || 0).toLocaleString()}`,
          turnStartedAtMs: Date.now(),
        });
      } catch {
        // Resilient local fallback using identical evaluator if transient network error
        const sorted = [...contenders]
          .map((c) => ({ player: c, ev: evaluateTeenPattiHand(c.cards) }))
          .sort((a, b) => b.ev.score - a.ev.score);
        const winner = sorted[0];
        const netPayout = calculateTeenPattiNetPayout(finalPot);

        const updatedPlayers = playersList.map((p) => ({
          ...p,
          isSeen: p.status === 'active' ? true : p.isSeen,
          handLabel: p.cards.length === 3 ? evaluateTeenPattiHand(p.cards).label : '',
        }));

        await applyRoomUpdate(currentRoom, {
          players: updatedPlayers,
          status: 'showdown',
          pot: finalPot,
          winnerUid: winner.player.uid,
          winnerName: winner.player.name,
          winnerHandLabel: contenders.length === 1 ? 'All Others Packed' : winner.ev.label,
          winnerPayout: netPayout,
          sideShowRequest: null,
          lastActionNote: `${reasonPrefix} · ${winner.player.name} wins ₹${netPayout.toLocaleString()}`,
          turnStartedAtMs: Date.now(),
        });
      }
    },
    [applyRoomUpdate],
  );

  // Smart Matchmaking Auto-Fill for public waiting tables (controlled by Admin settings/platform)
  useEffect(() => {
    if (!room || room.status !== 'waiting' || room.isPrivate || !platformSettings.smartMatchmakingEnabled) {
      setMatchmakingSec(configuredWaitSec);
      return;
    }

    const startMs = room.turnStartedAtMs || Date.now();
    const tick = () => {
      const elapsed = Math.floor((Date.now() - startMs) / 1000);
      const rem = Math.max(0, configuredWaitSec - elapsed);
      setMatchmakingSec(rem);

      if (rem === 0 && room.hostUid === myUid && !busyAction) {
        void (async () => {
          setBusyAction(true);
          try {
            if (isLocalGuestRoom) {
              const dealt = await requestServerTeenPattiDeal(5, room.bootAmount);
              const seats: TeenPattiSeatPlayer[] = [
                {
                  uid: myUid,
                  name: myName,
                  seatIndex: 0,
                  isBot: false,
                  status: 'active',
                  isSeen: false,
                  totalBet: room.bootAmount,
                  lastAction: `Boot ₹${room.bootAmount}`,
                  cards: dealt.hands[0],
                },
                ...GUEST_BOT_NAMES.map((bName, idx) => ({
                  uid: `bot_tp_${idx + 1}`,
                  name: bName,
                  seatIndex: idx + 1,
                  isBot: true,
                  status: 'active' as const,
                  isSeen: false,
                  totalBet: room.bootAmount,
                  lastAction: `Boot ₹${room.bootAmount}`,
                  cards: dealt.hands[idx + 1],
                })),
              ];
              setRoom({
                ...room,
                status: 'playing',
                roundId: dealt.roundId,
                handNumber: 1,
                dealerIndex: 0,
                currentTurnIndex: 1,
                currentStake: room.bootAmount,
                pot: seats.length * room.bootAmount,
                serverSeedHash: dealt.serverSeedHash,
                serverSeed: '',
                playerUids: seats.map((s) => s.uid),
                players: seats,
                lastActionNote: `Hand #1 dealt · Boot ₹${room.bootAmount} collected`,
                turnStartedAtMs: Date.now(),
              });
            } else {
              await fillTeenPattiRoomAndDeal({ room, targetSeats: 5 });
            }
          } catch (err) {
            pushToast(err instanceof Error ? err.message : 'Unable to start table', 'crimson');
          } finally {
            setBusyAction(false);
          }
        })();
      }
    };

    tick();
    const id = window.setInterval(tick, 500);
    return () => window.clearInterval(id);
  }, [
    room,
    myUid,
    myName,
    isLocalGuestRoom,
    busyAction,
    pushToast,
    configuredWaitSec,
    platformSettings.smartMatchmakingEnabled,
  ]);

  const handleTurnTimeout = useCallback(
    async (seatIndex: number) => {
      if (!room || room.status !== 'playing' || busyAction) return;
      const targetPlayer = room.players[seatIndex];
      if (!targetPlayer || targetPlayer.status !== 'active') return;

      setBusyAction(true);
      try {
        const currentMissed = (targetPlayer.missedTurns || 0) + 1;
        const shouldPack = currentMissed >= 3;

        const nextPlayers = room.players.map((p, idx) => {
          if (idx === seatIndex) {
            return {
              ...p,
              missedTurns: currentMissed,
              status: shouldPack ? ('packed' as const) : p.status,
              lastAction: shouldPack ? 'Auto-Packed (3 Misses)' : 'Missed Turn',
            };
          }
          return p;
        });

        if (shouldPack) {
          soundEngine.playCardFold();
          pushToast(`${targetPlayer.name} auto-packed after 3 missed turns.`, 'crimson');
        } else {
          pushToast(`${targetPlayer.name} missed turn (15s timeout) — Strike ${currentMissed}/3`, 'gold');
        }

        const remaining = nextPlayers.filter((p) => p.status === 'active');
        if (remaining.length <= 1) {
          await triggerServerShowdown(
            room,
            nextPlayers,
            room.pot,
            targetPlayer.uid,
            shouldPack ? `${targetPlayer.name} auto-packed (3 misses)` : 'Turn timeout showdown',
          );
          return;
        }

        const nextTurn = findNextActiveIndex(nextPlayers, seatIndex);
        await applyRoomUpdate(room, {
          players: nextPlayers,
          currentTurnIndex: nextTurn,
          lastActionNote: shouldPack ? `${targetPlayer.name} auto-packed (3 missed turns)` : `${targetPlayer.name} missed turn`,
          turnStartedAtMs: Date.now(),
        });
      } finally {
        setBusyAction(false);
      }
    },
    [room, busyAction, applyRoomUpdate, triggerServerShowdown, pushToast],
  );

  // 15-Second Turn Timer & 3-Strike Auto-Pack Rule
  useEffect(() => {
    if (!room || room.status !== 'playing') {
      setTurnRemainingSec(TURN_DURATION_SEC);
      return;
    }

    const activeSeatIndex = room.currentTurnIndex;
    const activeSeat = room.players[activeSeatIndex];
    if (!activeSeat || activeSeat.status !== 'active') return;

    const tick = () => {
      const elapsed = Math.floor((Date.now() - (room.turnStartedAtMs || Date.now())) / 1000);
      const rem = Math.max(0, TURN_DURATION_SEC - elapsed);
      setTurnRemainingSec(rem);

      if (rem === 0 && (room.hostUid === myUid || isLocalGuestRoom || activeSeat.uid === myUid)) {
        const key = `${room.roundId}_${activeSeatIndex}_${room.turnStartedAtMs}`;
        if (timeoutFiredKeyRef.current !== key) {
          timeoutFiredKeyRef.current = key;
          void handleTurnTimeout(activeSeatIndex);
        }
      }
    };

    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [room, myUid, isLocalGuestRoom, handleTurnTimeout]);

  // Smart-Bot Turn Executor (host drives bot seats cleanly using server-side /bot-action)
  useEffect(() => {
    if (!room || room.status !== 'playing') return;
    if (room.hostUid !== myUid && !isLocalGuestRoom) return;

    const currentSeat = room.players[room.currentTurnIndex];
    if (!currentSeat || !currentSeat.isBot || currentSeat.status !== 'active') return;

    // Pause bot turns if a Side Show request is pending user response
    if (room.sideShowRequest && room.sideShowRequest.status === 'pending') {
      // If target is ALSO a bot, resolve automatically
      const targetPlayer = room.players.find((p) => p.uid === room.sideShowRequest?.targetUid);
      if (!targetPlayer?.isBot) return;
    }

    const key = `${room.roundId}_${room.currentTurnIndex}_${room.turnStartedAtMs}`;
    if (botBusyKeyRef.current === key) return;
    botBusyKeyRef.current = key;

    const delayMs = getNaturalReactionDelayMs();
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const activeList = room.players.filter((p) => p.status === 'active');
          const prevIdx = findPreviousActiveIndex(room.players, room.currentTurnIndex);
          const prevPlayer = prevIdx >= 0 ? room.players[prevIdx] : null;
          const canBotSideShow = Boolean(
            currentSeat.isSeen && activeList.length > 2 && prevPlayer && prevPlayer.isSeen,
          );

          const res = await fetch('/api/games/teen-patti/bot-action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              cards: currentSeat.cards,
              isSeen: currentSeat.isSeen,
              currentStake: room.currentStake,
              bootAmount: room.bootAmount,
              chaalLimit: room.chaalLimit,
              pot: room.pot,
              potLimit: room.potLimit,
              activeCount: activeList.length,
              canSideShow: canBotSideShow,
              turnCount: turnCountRef.current,
            }),
          });
          const decision = res.ok ? await res.json() : { action: 'chaal', raise: false };
          turnCountRef.current += 1;

          const action = String(decision.action || 'chaal');
          const wantRaise = Boolean(decision.raise);
          const nextPlayers = [...room.players];

          if (action === 'pack' || action === 'see_and_pack') {
            soundEngine.playCardFold();
            nextPlayers[room.currentTurnIndex] = {
              ...currentSeat,
              isSeen: action === 'see_and_pack' ? true : currentSeat.isSeen,
              status: 'packed',
              lastAction: 'Packed',
            };
            const remaining = nextPlayers.filter((p) => p.status === 'active');
            if (remaining.length <= 1) {
              await triggerServerShowdown(
                room,
                nextPlayers,
                room.pot,
                currentSeat.uid,
                `${currentSeat.name} packed`,
              );
              return;
            }
            const nextTurn = findNextActiveIndex(nextPlayers, room.currentTurnIndex);
            await applyRoomUpdate(room, {
              players: nextPlayers,
              currentTurnIndex: nextTurn,
              lastActionNote: `${currentSeat.name} Packed`,
              turnStartedAtMs: Date.now(),
            });
            return;
          }

          const becomesSeen =
            currentSeat.isSeen || action === 'see_and_chaal' || action === 'chaal' || action === 'sideshow';
          const opts = computePlayerStakeOptions({
            isSeen: becomesSeen,
            currentStake: room.currentStake,
            bootAmount: room.bootAmount,
            chaalLimit: room.chaalLimit,
          });
          const wager = wantRaise && opts.canDouble ? opts.maxBet : opts.minBet;
          const nextPot = room.pot + wager;
          const nextUnit = deriveNextTableStakeUnit({
            isSeen: becomesSeen,
            betAmount: wager,
            bootAmount: room.bootAmount,
            currentStake: room.currentStake,
            chaalLimit: room.chaalLimit,
          });

          if (action === 'show' && activeList.length === 2) {
            nextPlayers[room.currentTurnIndex] = {
              ...currentSeat,
              isSeen: true,
              totalBet: currentSeat.totalBet + opts.minBet,
              lastAction: `Show ₹${opts.minBet}`,
            };
            await triggerServerShowdown(
              room,
              nextPlayers,
              room.pot + opts.minBet,
              currentSeat.uid,
              `${currentSeat.name} called Show`,
            );
            return;
          }

          if (action === 'sideshow' && canBotSideShow && prevPlayer) {
            soundEngine.playSideShowChime();
            nextPlayers[room.currentTurnIndex] = {
              ...currentSeat,
              isSeen: true,
              totalBet: currentSeat.totalBet + opts.minBet,
              lastAction: `Side Show ₹${opts.minBet}`,
            };

            if (!prevPlayer.isBot) {
              // Ask human target to Accept or Decline
              await applyRoomUpdate(room, {
                players: nextPlayers,
                pot: room.pot + opts.minBet,
                currentStake: nextUnit,
                sideShowRequest: {
                  id: `ss_${Date.now()}`,
                  requesterUid: currentSeat.uid,
                  requesterName: currentSeat.name,
                  targetUid: prevPlayer.uid,
                  targetName: prevPlayer.name,
                  status: 'pending',
                  createdAtMs: Date.now(),
                },
                lastActionNote: `${currentSeat.name} requested Side Show with ${prevPlayer.name}`,
                turnStartedAtMs: Date.now(),
              });
              return;
            }

            // Bot vs Bot Side Show resolved immediately on server
            const ssRes = await fetch('/api/games/teen-patti/side-show', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                requesterUid: currentSeat.uid,
                targetUid: prevPlayer.uid,
                requesterCards: currentSeat.cards,
                targetCards: prevPlayer.cards,
              }),
            });
            const ssData = await ssRes.json();
            const loserUid = String(ssData.loserUid || currentSeat.uid);
            const resolvedPlayers = nextPlayers.map((p) =>
              p.uid === loserUid ? { ...p, status: 'packed' as const, lastAction: 'Lost Side Show' } : p,
            );
            const loserName = resolvedPlayers.find((p) => p.uid === loserUid)?.name || 'Player';
            const nextTurn = findNextActiveIndex(resolvedPlayers, room.currentTurnIndex);
            await applyRoomUpdate(room, {
              players: resolvedPlayers,
              pot: room.pot + opts.minBet,
              currentStake: nextUnit,
              currentTurnIndex: nextTurn,
              sideShowRequest: null,
              lastActionNote: `Side Show: ${loserName} packed`,
              turnStartedAtMs: Date.now(),
            });
            return;
          }

          // Standard Blind or Chaal
          const verb = !becomesSeen ? 'Blind' : wantRaise && opts.canDouble ? 'Chaal 2×' : 'Chaal';
          nextPlayers[room.currentTurnIndex] = {
            ...currentSeat,
            isSeen: becomesSeen,
            totalBet: currentSeat.totalBet + wager,
            lastAction: `${verb} ₹${wager}`,
          };

          // Automatic Showdown if Pot Limit reached
          if (nextPot >= room.potLimit) {
            await triggerServerShowdown(
              room,
              nextPlayers,
              nextPot,
              currentSeat.uid,
              'Pot Limit reached — Auto Showdown',
            );
            return;
          }

          const nextTurn = findNextActiveIndex(nextPlayers, room.currentTurnIndex);
          await applyRoomUpdate(room, {
            players: nextPlayers,
            pot: nextPot,
            currentStake: nextUnit,
            currentTurnIndex: nextTurn,
            lastActionNote: `${currentSeat.name} played ${verb} ₹${wager}`,
            turnStartedAtMs: Date.now(),
          });
        } catch {
          botBusyKeyRef.current = '';
        }
      })();
    }, delayMs);

    return () => window.clearTimeout(timer);
  }, [room, myUid, isLocalGuestRoom, applyRoomUpdate, triggerServerShowdown]);

  // --- Lobby Actions ---

  const validateBootOnServer = async (bootAmount: TeenPattiBootAmount) => {
    const res = await fetch('/api/games/teen-patti/validate-table', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bootAmount,
        playableBalance,
      }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      throw new Error(data.error || `Insufficient balance for ₹${bootAmount} Boot table.`);
    }
  };

  const handleJoinPublicBootTable = async (bootAmount: TeenPattiBootAmount) => {
    if (isMaintenance) {
      pushToast(cfg?.maintenanceMessage || 'Teen Patti is under maintenance.', 'crimson');
      return;
    }
    if (!checkCanAfford(bootAmount)) {
      pushToast(`Insufficient playable balance for the ₹${bootAmount} Boot table.`, 'crimson');
      return;
    }

    soundEngine.playClick();
    setBusyAction(true);
    try {
      await validateBootOnServer(bootAmount);
      const tier = getTeenPattiTableTier(bootAmount);

      if (!firebaseUser || isGuestMode) {
        // Guest Preview Room with 12-second matchmaking timer (or instant deal button)
        const localRoom: TeenPattiRoom = {
          roomId: `tp_guest_${Date.now()}`,
          code: 'GUEST1',
          hostUid: myUid,
          hostName: myName,
          maxPlayers: 5,
          isPrivate: false,
          bootAmount: tier.boot,
          chaalLimit: tier.chaalLimit,
          potLimit: tier.potLimit,
          status: 'waiting',
          roundId: '',
          handNumber: 0,
          dealerIndex: 0,
          currentTurnIndex: 0,
          currentStake: tier.boot,
          pot: 0,
          winnerUid: '',
          winnerName: '',
          winnerHandLabel: '',
          winnerPayout: 0,
          serverSeedHash: '',
          serverSeed: '',
          playerUids: [myUid],
          players: [
            {
              uid: myUid,
              name: myName,
              seatIndex: 0,
              isBot: false,
              status: 'waiting',
              isSeen: false,
              totalBet: 0,
              lastAction: 'Seated',
              cards: [],
            },
          ],
          sideShowRequest: null,
          lastReaction: null,
          lastActionNote: `Searching ₹${tier.boot} Boot table...`,
          turnStartedAtMs: Date.now(),
        };
        setIsLocalGuestRoom(true);
        setRoom(localRoom);
        setMatchmakingSec(configuredWaitSec);
      } else {
        const joined = await findOrCreatePublicTeenPattiRoom({
          uid: myUid,
          username: myName,
          bootAmount,
        });
        setIsLocalGuestRoom(false);
        setRoom(joined);
        setMatchmakingSec(configuredWaitSec);
      }
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Unable to join table', 'crimson');
    } finally {
      setBusyAction(false);
    }
  };

  const handleCreatePrivateTable = async () => {
    if (isMaintenance) {
      pushToast(cfg?.maintenanceMessage || 'Teen Patti is under maintenance.', 'crimson');
      return;
    }
    if (!firebaseUser || isGuestMode) {
      pushToast('Sign in to host a real-time Private Table with a 6-digit code.', 'gold');
      return;
    }
    if (!checkCanAfford(selectedPrivateBoot)) {
      pushToast(`Insufficient playable balance for ₹${selectedPrivateBoot} Boot table.`, 'crimson');
      return;
    }
    soundEngine.playClick();
    setBusyAction(true);
    try {
      await validateBootOnServer(selectedPrivateBoot);
      const created = await createTeenPattiRoom({
        hostUid: myUid,
        hostName: myName,
        bootAmount: selectedPrivateBoot,
        isPrivate: true,
        maxPlayers: 5,
      });
      setIsLocalGuestRoom(false);
      setRoom(created);
      pushToast(`Private Table ${created.code} ready! Share the code with friends.`, 'emerald');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Could not create private table', 'crimson');
    } finally {
      setBusyAction(false);
    }
  };

  const handleJoinPrivateCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser || isGuestMode) {
      pushToast('Sign in to join a Private Table with a 6-digit code.', 'gold');
      return;
    }
    soundEngine.playClick();
    setBusyAction(true);
    try {
      const joined = await findAndJoinTeenPattiRoomByCode({
        code: joinCodeInput,
        uid: myUid,
        username: myName,
        validateBootBalance: (bootAmt) => {
          if (!checkCanAfford(bootAmt)) {
            throw new Error(`Insufficient playable balance for this ₹${bootAmt} Boot table.`);
          }
        },
      });
      setIsLocalGuestRoom(false);
      setRoom(joined);
      setJoinCodeInput('');
      pushToast(`Joined Private Table ${joined.code}!`, 'emerald');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Unable to join table code', 'crimson');
    } finally {
      setBusyAction(false);
    }
  };

  const handleStartWaitingTableNow = async () => {
    if (!room || busyAction) return;
    soundEngine.playClick();
    setBusyAction(true);
    try {
      const targetSeats = room.isPrivate
        ? Math.max(2, room.players.length)
        : 5;
      if (isLocalGuestRoom) {
        const dealt = await requestServerTeenPattiDeal(5, room.bootAmount);
        const seats: TeenPattiSeatPlayer[] = [
          {
            uid: myUid,
            name: myName,
            seatIndex: 0,
            isBot: false,
            status: 'active',
            isSeen: false,
            totalBet: room.bootAmount,
            lastAction: `Boot ₹${room.bootAmount}`,
            cards: dealt.hands[0],
          },
          ...GUEST_BOT_NAMES.map((bName, idx) => ({
            uid: `bot_tp_${idx + 1}`,
            name: bName,
            seatIndex: idx + 1,
            isBot: true,
            status: 'active' as const,
            isSeen: false,
            totalBet: room.bootAmount,
            lastAction: `Boot ₹${room.bootAmount}`,
            cards: dealt.hands[idx + 1],
          })),
        ];
        setRoom({
          ...room,
          status: 'playing',
          roundId: dealt.roundId,
          handNumber: 1,
          dealerIndex: 0,
          currentTurnIndex: 1,
          currentStake: room.bootAmount,
          pot: seats.length * room.bootAmount,
          serverSeedHash: dealt.serverSeedHash,
          serverSeed: '',
          playerUids: seats.map((s) => s.uid),
          players: seats,
          lastActionNote: `Hand #1 dealt · Boot ₹${room.bootAmount} collected`,
          turnStartedAtMs: Date.now(),
        });
      } else {
        await fillTeenPattiRoomAndDeal({ room, targetSeats });
      }
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Unable to deal hand', 'crimson');
    } finally {
      setBusyAction(false);
    }
  };

  // --- Gameplay Actions ---

  const handleSeeCards = async () => {
    if (!room || !myPlayer || myPlayer.isSeen || myPlayer.status !== 'active' || busyAction) return;
    soundEngine.playCardFlip();
    const ev = evaluateTeenPattiHand(myPlayer.cards);
    const nextPlayers = room.players.map((p, idx) =>
      idx === mySeatIndex
        ? { ...p, isSeen: true, handLabel: ev.label, lastAction: 'Seen' }
        : p,
    );
    await applyRoomUpdate(room, {
      players: nextPlayers,
      lastActionNote: `${myPlayer.name} looked at their cards (Seen)`,
    });
  };

  const handleBlindOrChaal = async () => {
    if (!room || !myPlayer || !isMyTurn || busyAction) return;
    const wager = selectedWagerAmount;
    if (!checkCanAfford(wager)) {
      pushToast(`Insufficient playable balance for ₹${wager}.`, 'crimson');
      return;
    }

    setBusyAction(true);
    try {
      const verb = !myPlayer.isSeen ? 'Blind' : raise2x && stakeOptions.canDouble ? 'Chaal 2×' : 'Chaal';
      try {
        await placeBet(
          'teen_patti',
          wager,
          `${room.roundId}_t${Date.now()}`,
          `Teen Patti ${verb} (₹${wager})`,
        );
      } catch (err) {
        pushToast(err instanceof Error ? err.message : 'Unable to place wager', 'crimson');
        return;
      }

      soundEngine.playChipPlace();
      turnCountRef.current += 1;

      const nextPot = room.pot + wager;
      const nextUnit = deriveNextTableStakeUnit({
        isSeen: myPlayer.isSeen,
        betAmount: wager,
        bootAmount: room.bootAmount,
        currentStake: room.currentStake,
        chaalLimit: room.chaalLimit,
      });

      const nextPlayers = room.players.map((p, idx) =>
        idx === mySeatIndex
          ? {
              ...p,
              totalBet: p.totalBet + wager,
              lastAction: `${verb} ₹${wager}`,
            }
          : p,
      );

      if (nextPot >= room.potLimit) {
        await triggerServerShowdown(
          room,
          nextPlayers,
          nextPot,
          myUid,
          'Pot Limit reached — Auto Showdown',
        );
        return;
      }

      const nextTurn = findNextActiveIndex(nextPlayers, mySeatIndex);
      await applyRoomUpdate(room, {
        players: nextPlayers,
        pot: nextPot,
        currentStake: nextUnit,
        currentTurnIndex: nextTurn,
        lastActionNote: `${myPlayer.name} played ${verb} ₹${wager}`,
        turnStartedAtMs: Date.now(),
      });
    } finally {
      setBusyAction(false);
    }
  };

  const handlePack = async (isTimeout = false) => {
    if (!room || !myPlayer || myPlayer.status !== 'active' || (!isMyTurn && !isTimeout) || busyAction) return;
    setBusyAction(true);
    try {
      soundEngine.playCardFold();
      const nextPlayers = room.players.map((p, idx) =>
        idx === mySeatIndex
          ? { ...p, status: 'packed' as const, lastAction: isTimeout ? 'Auto-Packed' : 'Packed' }
          : p,
      );
      const remaining = nextPlayers.filter((p) => p.status === 'active');
      if (remaining.length <= 1) {
        await triggerServerShowdown(
          room,
          nextPlayers,
          room.pot,
          myUid,
          `${myPlayer.name} ${isTimeout ? 'timed out & packed' : 'packed'}`,
        );
        return;
      }
      const nextTurn = findNextActiveIndex(nextPlayers, mySeatIndex);
      await applyRoomUpdate(room, {
        players: nextPlayers,
        currentTurnIndex: nextTurn,
        lastActionNote: `${myPlayer.name} ${isTimeout ? 'timed out & packed' : 'Packed'}`,
        turnStartedAtMs: Date.now(),
      });
    } finally {
      setBusyAction(false);
    }
  };

  const handleRequestSideShow = async () => {
    if (!room || !myPlayer || !canRequestSideShow || !previousActivePlayer || busyAction) return;
    const cost = stakeOptions.minBet;
    if (!checkCanAfford(cost)) {
      pushToast(`Need ₹${cost} playable balance to request Side Show.`, 'crimson');
      return;
    }

    setBusyAction(true);
    try {
      try {
        await placeBet(
          'teen_patti',
          cost,
          `${room.roundId}_ss_${Date.now()}`,
          `Teen Patti Side Show (₹${cost})`,
        );
      } catch (err) {
        pushToast(err instanceof Error ? err.message : 'Unable to place Side Show stake', 'crimson');
        return;
      }

      soundEngine.playSideShowChime();
      const nextPot = room.pot + cost;
      const nextPlayers = room.players.map((p, idx) =>
        idx === mySeatIndex
          ? { ...p, totalBet: p.totalBet + cost, lastAction: `Side Show ₹${cost}` }
          : p,
      );

      // If target is a smart bot, evaluate accept/decline & compare on server immediately
      if (previousActivePlayer.isBot) {
        const botDecisionRes = await fetch('/api/games/teen-patti/bot-action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cards: previousActivePlayer.cards,
            isSeen: true,
            currentStake: room.currentStake,
            bootAmount: room.bootAmount,
            chaalLimit: room.chaalLimit,
            pot: nextPot,
            potLimit: room.potLimit,
            activeCount: activePlayers.length,
            evaluatingSideShow: true,
          }),
        });
        const botDec = botDecisionRes.ok ? await botDecisionRes.json() : { acceptSideShow: true };
        if (!botDec.acceptSideShow) {
          const nextTurn = findNextActiveIndex(nextPlayers, mySeatIndex);
          await applyRoomUpdate(room, {
            players: nextPlayers,
            pot: nextPot,
            currentTurnIndex: nextTurn,
            sideShowRequest: null,
            lastActionNote: `${previousActivePlayer.name} declined Side Show`,
            turnStartedAtMs: Date.now(),
          });
          pushToast(`${previousActivePlayer.name} declined your Side Show.`, 'gold');
          return;
        }

        const ssRes = await fetch('/api/games/teen-patti/side-show', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requesterUid: myUid,
            targetUid: previousActivePlayer.uid,
            requesterCards: myPlayer.cards,
            targetCards: previousActivePlayer.cards,
          }),
        });
        const ssData = await ssRes.json();
        const loserUid = String(ssData.loserUid || myUid);
        const resolvedPlayers = nextPlayers.map((p) =>
          p.uid === loserUid
            ? { ...p, status: 'packed' as const, lastAction: 'Lost Side Show' }
            : p,
        );
        const loserName = resolvedPlayers.find((p) => p.uid === loserUid)?.name || 'Player';
        if (loserUid === myUid) {
          soundEngine.playCardFold();
          pushToast(`Side Show lost against ${previousActivePlayer.name} — You packed.`, 'crimson');
        } else {
          soundEngine.playWinFanfare();
          pushToast(`Side Show won! ${previousActivePlayer.name} packed.`, 'emerald');
        }

        const remaining = resolvedPlayers.filter((p) => p.status === 'active');
        if (remaining.length <= 1) {
          await triggerServerShowdown(
            room,
            resolvedPlayers,
            nextPot,
            myUid,
            `Side Show resolved`,
          );
          return;
        }
        const nextTurn = findNextActiveIndex(resolvedPlayers, mySeatIndex);
        await applyRoomUpdate(room, {
          players: resolvedPlayers,
          pot: nextPot,
          currentTurnIndex: nextTurn,
          sideShowRequest: null,
          lastActionNote: `Side Show: ${loserName} packed`,
          turnStartedAtMs: Date.now(),
        });
        return;
      }

      // Human target: publish pending Side Show request in Firestore room
      await applyRoomUpdate(room, {
        players: nextPlayers,
        pot: nextPot,
        sideShowRequest: {
          id: `ss_${Date.now()}`,
          requesterUid: myUid,
          requesterName: myPlayer.name,
          targetUid: previousActivePlayer.uid,
          targetName: previousActivePlayer.name,
          status: 'pending',
          createdAtMs: Date.now(),
        },
        lastActionNote: `${myPlayer.name} requested Side Show with ${previousActivePlayer.name}`,
        turnStartedAtMs: Date.now(),
      });
    } finally {
      setBusyAction(false);
    }
  };

  const handleRespondIncomingSideShow = async (accept: boolean) => {
    if (!room || !incomingSideShow || !myPlayer || busyAction) return;
    const requester = room.players.find((p) => p.uid === incomingSideShow.requesterUid);
    if (!requester) return;

    setBusyAction(true);
    try {
      const reqIdx = room.players.findIndex((p) => p.uid === requester.uid);
      if (!accept) {
        soundEngine.playClick();
        const nextTurn = findNextActiveIndex(room.players, reqIdx >= 0 ? reqIdx : room.currentTurnIndex);
        await applyRoomUpdate(room, {
          currentTurnIndex: nextTurn,
          sideShowRequest: null,
          lastActionNote: `${myPlayer.name} declined Side Show`,
          turnStartedAtMs: Date.now(),
        });
        return;
      }

      const ssRes = await fetch('/api/games/teen-patti/side-show', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requesterUid: requester.uid,
          targetUid: myUid,
          requesterCards: requester.cards,
          targetCards: myPlayer.cards,
        }),
      });
      const ssData = await ssRes.json();
      const loserUid = String(ssData.loserUid || requester.uid);
      const resolvedPlayers = room.players.map((p) =>
        p.uid === loserUid ? { ...p, status: 'packed' as const, lastAction: 'Lost Side Show' } : p,
      );
      const loserName = resolvedPlayers.find((p) => p.uid === loserUid)?.name || 'Player';
      if (loserUid === myUid) {
        soundEngine.playCardFold();
        pushToast(`Side Show lost against ${requester.name} — You packed.`, 'crimson');
      } else {
        soundEngine.playWinFanfare();
        pushToast(`You won the Side Show! ${requester.name} packed.`, 'emerald');
      }

      const remaining = resolvedPlayers.filter((p) => p.status === 'active');
      if (remaining.length <= 1) {
        await triggerServerShowdown(room, resolvedPlayers, room.pot, requester.uid, 'Side Show resolved');
        return;
      }
      const nextTurn = findNextActiveIndex(resolvedPlayers, reqIdx >= 0 ? reqIdx : room.currentTurnIndex);
      await applyRoomUpdate(room, {
        players: resolvedPlayers,
        currentTurnIndex: nextTurn,
        sideShowRequest: null,
        lastActionNote: `Side Show: ${loserName} packed`,
        turnStartedAtMs: Date.now(),
      });
    } finally {
      setBusyAction(false);
    }
  };

  const handleCallShow = async () => {
    if (!room || !myPlayer || !canRequestShow || busyAction) return;
    const cost = stakeOptions.minBet;
    if (!checkCanAfford(cost)) {
      pushToast(`Need ₹${cost} playable balance to call Show.`, 'crimson');
      return;
    }

    setBusyAction(true);
    try {
      try {
        await placeBet(
          'teen_patti',
          cost,
          `${room.roundId}_show_${Date.now()}`,
          `Teen Patti Show (₹${cost})`,
        );
      } catch (err) {
        pushToast(err instanceof Error ? err.message : 'Unable to place Show wager', 'crimson');
        return;
      }

      soundEngine.playShowdownReveal();
      const nextPot = room.pot + cost;
      const nextPlayers = room.players.map((p, idx) =>
        idx === mySeatIndex
          ? { ...p, isSeen: true, totalBet: p.totalBet + cost, lastAction: `Show ₹${cost}` }
          : p,
      );
      await triggerServerShowdown(room, nextPlayers, nextPot, myUid, `${myPlayer.name} called Show`);
    } finally {
      setBusyAction(false);
    }
  };

  const handleDealNextHand = async () => {
    if (!room || busyAction) return;
    if (!checkCanAfford(room.bootAmount)) {
      pushToast(`Insufficient playable balance for ₹${room.bootAmount} Boot. Choose a lower table.`, 'crimson');
      return;
    }
    soundEngine.playClick();
    setBusyAction(true);
    try {
      if (isLocalGuestRoom) {
        const dealt = await requestServerTeenPattiDeal(room.players.length, room.bootAmount);
        const nextHandNum = (room.handNumber || 0) + 1;
        const nextDealer = (room.dealerIndex + 1) % room.players.length;
        const firstTurn = (nextDealer + 1) % room.players.length;
        const dealtPlayers: TeenPattiSeatPlayer[] = room.players.map((p, idx) => ({
          ...p,
          status: 'active',
          isSeen: false,
          totalBet: room.bootAmount,
          lastAction: `Boot ₹${room.bootAmount}`,
          cards: dealt.hands[idx] || [],
          handLabel: '',
        }));
        setRoom({
          ...room,
          players: dealtPlayers,
          status: 'playing',
          roundId: dealt.roundId,
          handNumber: nextHandNum,
          dealerIndex: nextDealer,
          currentTurnIndex: firstTurn,
          currentStake: room.bootAmount,
          pot: dealtPlayers.length * room.bootAmount,
          winnerUid: '',
          winnerName: '',
          winnerHandLabel: '',
          winnerPayout: 0,
          serverSeedHash: dealt.serverSeedHash,
          serverSeed: '',
          sideShowRequest: null,
          lastActionNote: `Hand #${nextHandNum} dealt · Boot ₹${room.bootAmount} collected`,
          turnStartedAtMs: Date.now(),
        });
      } else {
        await dealNextTeenPattiHand(room);
      }
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Unable to deal next hand', 'crimson');
    } finally {
      setBusyAction(false);
    }
  };

  const handleTipDealer = () => {
    soundEngine.playTipDealer();
    setTipDealerPulse((p) => p + 1);
    setTipFeedback(true);
    window.setTimeout(() => setTipFeedback(false), 1800);
    pushToast('Tipped the Dealer! Good luck on your next hand.', 'gold');
  };

  const handleSendQuickChat = (emoji: string, text: string) => {
    soundEngine.playClick();
    setChatOpen(false);
    if (!room) return;
    if (isLocalGuestRoom) {
      setRoom({
        ...room,
        lastReaction: {
          id: `rx_${Date.now()}`,
          uid: myUid,
          senderName: myName,
          seatIndex: Math.max(0, mySeatIndex),
          emoji,
          text,
          createdAtMs: Date.now(),
        },
      });
    } else {
      void sendTeenPattiReaction(room.roomId, {
        uid: myUid,
        senderName: myName,
        seatIndex: Math.max(0, mySeatIndex),
        emoji,
        text,
      });
    }
  };

  const handleCopyCode = () => {
    if (!room?.code) return;
    void navigator.clipboard?.writeText(room.code).catch(() => {});
    setCopiedCode(true);
    soundEngine.playClick();
    window.setTimeout(() => setCopiedCode(false), 1600);
  };

  const whatsappShareUrl = room?.code
    ? `https://wa.me/?text=${encodeURIComponent(
        `Join my Aurelia Arena Teen Patti 3D table (₹${room.bootAmount} Boot)! Private Table Code: ${room.code}`,
      )}`
    : '#';

  // Provably Fair proof object for modal
  const fairProof: ProvablyFairProof | null = useMemo(() => {
    if (!room || !room.serverSeedHash) return null;
    return {
      game: 'teen_patti',
      roundId: room.roundId || room.roomId,
      serverSeedHash: room.serverSeedHash,
      serverSeed: room.serverSeed || undefined,
      outcomeLabel: room.winnerHandLabel || undefined,
      status: room.serverSeed ? 'revealed' : 'committed',
    };
  }, [room]);

  // Map room seats to visual slots (local user always bottom-center slot 0)
  const visualSeats = useMemo(() => {
    if (!room) return [];
    const total = room.players.length;
    const baseIdx = mySeatIndex >= 0 ? mySeatIndex : 0;
    return room.players.map((player, roomSeatIdx) => {
      const relOffset = (roomSeatIdx - baseIdx + total) % total;
      const visualSlot = getVisualSlotForRelativeOffset(relOffset, total);
      return { player, roomSeatIdx, visualSlot };
    });
  }, [room, mySeatIndex]);

  const myHandEval = useMemo(() => {
    if (!myPlayer || !myPlayer.isSeen || myPlayer.cards.length !== 3) return null;
    return evaluateTeenPattiHand(myPlayer.cards);
  }, [myPlayer]);

  const activeReaction = useMemo(() => {
    if (!room?.lastReaction) return null;
    if (Date.now() - room.lastReaction.createdAtMs > 4500) return null;
    return room.lastReaction;
  }, [room?.lastReaction]);

  // Seat position CSS classes for slots 0..4 (Symmetrical alignment around oval table)
  const getSeatPositionClass = (slot: number) => {
    switch (slot) {
      case 0:
        return 'left-1/2 -translate-x-1/2 bottom-20 sm:bottom-24 lg:bottom-4';
      case 1:
        return 'left-3 sm:left-8 top-[58%] sm:top-[60%] -translate-y-1/2';
      case 2:
        return 'left-6 sm:left-14 top-[18%] sm:top-[20%]';
      case 3:
        return 'right-6 sm:right-14 top-[18%] sm:top-[20%]';
      case 4:
        return 'right-3 sm:right-8 top-[58%] sm:top-[60%] -translate-y-1/2';
      default:
        return 'left-1/2 -translate-x-1/2 top-4';
    }
  };

  return (
    <div className="relative h-[calc(100dvh-3rem)] sm:h-[calc(100dvh-3.5rem)] lg:h-[calc(100dvh-4rem)] w-full overflow-hidden flex flex-col bg-[#06050a] select-none pb-[52px] lg:pb-0">
      {/* TOP BAR */}
      <header className="relative z-30 h-11 sm:h-12 px-2.5 sm:px-4 border-b border-[#d4af37]/20 bg-[#090712]/95 flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={() => {
              soundEngine.playClick();
              if (room) {
                if (isInLiveHand) {
                  requestExit();
                } else {
                  setRoom(null);
                  setIsLocalGuestRoom(false);
                }
              } else {
                navigate('/');
              }
            }}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-medium text-zinc-200 whitespace-nowrap shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="hidden xs:inline">{room ? 'Tables' : 'Lobby'}</span>
          </button>

          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h1 className="font-display text-xs sm:text-sm font-bold text-[#f6dc93] tracking-wide truncate">
                TEEN PATTI 3D
              </h1>
              {room && (
                <span className="text-[10px] sm:text-xs font-mono-num text-emerald-300 font-semibold whitespace-nowrap">
                  ₹{room.bootAmount} Boot
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {room && room.status !== 'waiting' && (
            <>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    soundEngine.playClick();
                    setChatOpen((v) => !v);
                  }}
                  aria-label="Quick chat"
                  className="h-8 px-2.5 rounded-lg border border-white/12 bg-white/5 hover:bg-white/10 text-xs text-zinc-200 inline-flex items-center gap-1 whitespace-nowrap"
                >
                  <MessageCircle className="w-3.5 h-3.5 text-[#f6dc93]" />
                  <span className="hidden sm:inline">Chat</span>
                </button>
                {chatOpen && (
                  <div className="absolute right-0 top-10 z-50 w-56 rounded-xl border border-[#d4af37]/35 bg-[#0e0a1c]/98 p-2 shadow-2xl grid grid-cols-2 gap-1.5">
                    {QUICK_CHATS.map((item) => (
                      <button
                        key={item.text}
                        type="button"
                        onClick={() => handleSendQuickChat(item.emoji, item.text)}
                        className="px-2 py-2 rounded-lg bg-white/5 hover:bg-[#d4af37]/20 border border-white/10 text-[11px] font-medium text-zinc-100 text-left flex items-center gap-1.5 whitespace-nowrap"
                      >
                        <span>{item.emoji}</span>
                        <span className="truncate">{item.text}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={handleTipDealer}
                className={`h-8 px-2.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1 whitespace-nowrap transition-colors ${
                  tipFeedback
                    ? 'border-rose-400/60 bg-rose-500/20 text-rose-200'
                    : 'border-amber-400/30 bg-amber-500/10 hover:bg-amber-500/20 text-[#f6dc93]'
                }`}
                title="Tip the Dealer"
              >
                <Heart className={`w-3.5 h-3.5 ${tipFeedback ? 'fill-rose-400 text-rose-400' : 'text-rose-400'}`} />
                <span className="hidden sm:inline">{tipFeedback ? 'Thank You!' : 'Tip Dealer'}</span>
              </button>
            </>
          )}

          {fairProof && (
            <button
              type="button"
              onClick={() => {
                soundEngine.playClick();
                setFairOpen(true);
              }}
              className="h-8 px-2.5 rounded-lg border border-emerald-400/35 bg-emerald-950/40 hover:bg-emerald-900/50 text-[11px] font-semibold text-emerald-200 inline-flex items-center gap-1 whitespace-nowrap"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span className="hidden md:inline">Fair</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              soundEngine.playClick();
              setRulesOpen(true);
            }}
            aria-label="Teen Patti Rules & Hand Rankings"
            className="h-8 w-8 rounded-lg border border-white/12 bg-white/5 hover:bg-white/10 text-zinc-200 inline-flex items-center justify-center"
          >
            <HelpCircle className="w-4 h-4 text-[#f6dc93]" />
          </button>

          <GraphicsAudioBar compact />
        </div>
      </header>

      {/* MAIN CASINO STAGE */}
      <div className="relative flex-1 min-h-0 w-full overflow-hidden">
        {/* Live Emerald Velvet Casino Table Canvas */}
        <TeenPattiCanvas
          quality={graphicsQuality}
          pot={room?.pot || 0}
          bootAmount={room?.bootAmount || 10}
          activeSeatCount={room?.players.length || 5}
          dealPulse={dealPulse}
          chipEvent={chipEvent}
          winSweepEvent={winSweepEvent}
          tipDealerPulse={tipDealerPulse}
          isShowdown={room?.status === 'showdown'}
        />

        {/* STATE A: BOOT TABLES & PRIVATE ROOM LOBBY */}
        {!room && (
          <div className="relative z-20 h-full w-full overflow-y-auto px-3 sm:px-6 py-4 sm:py-6 flex items-start sm:items-center justify-center bg-black/55 backdrop-blur-[3px]">
            <div className="w-full max-w-3xl rounded-2xl border border-[#d4af37]/35 bg-[#0c0818]/94 shadow-[0_24px_64px_rgba(0,0,0,0.85)] p-4 sm:p-6 space-y-4">
              {/* Lobby Header */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-emerald-300">
                    <Sparkles className="w-3.5 h-3.5 text-[#f6dc93]" />
                    <span>Royal 5-Seat Multiplayer · SHA-256 Fair</span>
                  </div>
                  <h2 className="font-display text-xl sm:text-2xl font-bold gold-gradient-text">
                    Teen Patti (3 Patti) Tables
                  </h2>
                </div>

                <div className="flex items-center gap-2 rounded-xl border border-[#d4af37]/30 bg-black/45 px-3 py-2 text-xs">
                  <Coins className="w-4 h-4 text-[#f6dc93]" />
                  <div>
                    <div className="text-[10px] text-zinc-400 leading-none">Playable Balance</div>
                    <div className="font-mono-num text-sm font-bold text-[#fff1c2]">
                      ₹{playableBalance.toLocaleString()}
                    </div>
                  </div>
                </div>
              </div>

              {isMaintenance && (
                <div className="rounded-xl border border-rose-500/40 bg-rose-950/50 px-4 py-3 text-xs text-rose-200">
                  {cfg?.maintenanceMessage || 'Teen Patti tables are temporarily paused for scheduled maintenance.'}
                </div>
              )}

              {/* Lobby Mode Switcher */}
              <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-black/50 border border-white/10">
                <button
                  type="button"
                  onClick={() => {
                    soundEngine.playClick();
                    setLobbyTab('boot');
                  }}
                  className={`min-h-[40px] rounded-lg text-xs sm:text-sm font-bold transition-all whitespace-nowrap ${
                    lobbyTab === 'boot'
                      ? 'bg-gradient-to-r from-[#efd27a] to-[#cfa432] text-[#140d02]'
                      : 'text-zinc-300 hover:text-white'
                  }`}
                >
                  Boot Tables (₹1 – ₹500)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    soundEngine.playClick();
                    setLobbyTab('private');
                  }}
                  className={`min-h-[40px] rounded-lg text-xs sm:text-sm font-bold transition-all whitespace-nowrap inline-flex items-center justify-center gap-1.5 ${
                    lobbyTab === 'private'
                      ? 'bg-gradient-to-r from-[#efd27a] to-[#cfa432] text-[#140d02]'
                      : 'text-zinc-300 hover:text-white'
                  }`}
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>Private Table (6-Digit)</span>
                </button>
              </div>

              {lobbyTab === 'boot' ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-3">
                    {TEEN_PATTI_BOOT_TABLES.map((tier) => {
                      const affordable = checkCanAfford(tier.boot);
                      const liveCount = Math.max(
                        24,
                        tier.baseOnlinePlayers + (tableJitter[tier.boot] ?? 0),
                      );
                      return (
                        <button
                          key={tier.boot}
                          type="button"
                          disabled={busyAction || isMaintenance}
                          onClick={() => void handleJoinPublicBootTable(tier.boot)}
                          className={`group text-left rounded-xl border p-3 sm:p-3.5 transition-all flex flex-col justify-between gap-2.5 ${
                            affordable
                              ? 'border-[#d4af37]/35 bg-gradient-to-b from-[#112722]/90 via-[#111526]/92 to-[#0d0a1a]/95 hover:border-[#f6dc93] hover:-translate-y-0.5 shadow-lg'
                              : 'border-white/10 bg-black/45 opacity-75'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1 text-[10px]">
                            <span className="font-bold uppercase tracking-wider text-[#f6dc93]">
                              {tier.label}
                            </span>
                            <span className="inline-flex items-center gap-1 font-mono-num text-emerald-300 font-semibold">
                              <Users className="w-3 h-3" />
                              {liveCount}
                            </span>
                          </div>

                          <div>
                            <div className="text-[10px] uppercase tracking-wider text-zinc-400">
                              Boot Amount
                            </div>
                            <div className="font-display font-mono-num text-xl sm:text-2xl font-black text-white">
                              ₹{tier.boot}
                            </div>
                          </div>

                          <div className="space-y-0.5 text-[10px] sm:text-[11px] font-mono-num text-zinc-400 border-t border-white/10 pt-2">
                            <div className="flex items-center justify-between">
                              <span>Chaal Limit</span>
                              <span className="text-zinc-200 font-semibold">
                                ₹{tier.chaalLimit.toLocaleString()}
                              </span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span>Pot Limit</span>
                              <span className="text-amber-300 font-semibold">
                                ₹{tier.potLimit.toLocaleString()}
                              </span>
                            </div>
                          </div>

                          <div
                            className={`w-full py-2 rounded-lg text-center text-xs font-black tracking-wide whitespace-nowrap ${
                              affordable
                                ? 'gold-button'
                                : 'bg-zinc-800/80 text-rose-300 border border-rose-500/30'
                            }`}
                          >
                            {affordable ? `PLAY ₹${tier.boot}` : 'LOW BALANCE'}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-400 pt-1">
                    <span>Winner takes Pot minus {TEEN_PATTI_RAKE_PERCENT}% arena rake · 15s turn clock</span>
                    <button
                      type="button"
                      onClick={() => setRulesOpen(true)}
                      className="text-[#f6dc93] font-semibold hover:underline"
                    >
                      View Hand Rankings →
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Create Private Table */}
                  <div className="rounded-xl border border-[#d4af37]/30 bg-black/45 p-4 space-y-3">
                    <div>
                      <h3 className="font-display text-base font-bold text-[#faf6ee]">
                        Host Private Table
                      </h3>
                      <p className="text-xs text-zinc-400 mt-0.5">
                        Create a 6-digit table code and invite up to 4 friends via WhatsApp.
                      </p>
                    </div>

                    <div className="space-y-1.5">
                      <div className="text-[11px] font-semibold text-zinc-300">Select Boot Amount</div>
                      <div className="grid grid-cols-3 gap-1.5">
                        {TEEN_PATTI_BOOT_TABLES.map((t) => (
                          <button
                            key={t.boot}
                            type="button"
                            onClick={() => {
                              soundEngine.playClick();
                              setSelectedPrivateBoot(t.boot);
                            }}
                            className={`py-2 rounded-lg font-mono-num text-xs font-bold border transition-colors ${
                              selectedPrivateBoot === t.boot
                                ? 'border-[#f6dc93] bg-[#d4af37]/25 text-[#fff1c2]'
                                : 'border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10'
                            }`}
                          >
                            ₹{t.boot}
                          </button>
                        ))}
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={busyAction || isMaintenance}
                      onClick={() => void handleCreatePrivateTable()}
                      className="w-full gold-button min-h-[44px] rounded-xl text-xs sm:text-sm font-black"
                    >
                      {busyAction ? 'Creating Table...' : `CREATE ₹${selectedPrivateBoot} PRIVATE TABLE`}
                    </button>
                  </div>

                  {/* Join by 6-Digit Code */}
                  <form
                    onSubmit={(e) => void handleJoinPrivateCode(e)}
                    className="rounded-xl border border-white/15 bg-black/45 p-4 flex flex-col justify-between space-y-3"
                  >
                    <div className="space-y-3">
                      <div>
                        <h3 className="font-display text-base font-bold text-[#faf6ee]">
                          Join with 6-Digit Code
                        </h3>
                        <p className="text-xs text-zinc-400 mt-0.5">
                          Enter the 6-character code shared by your table host.
                        </p>
                      </div>

                      <input
                        type="text"
                        value={joinCodeInput}
                        onChange={(e) =>
                          setJoinCodeInput(
                            e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6),
                          )
                        }
                        placeholder="E.g. K7M4P9"
                        className="w-full rounded-xl bg-black/60 border border-[#d4af37]/35 px-4 py-3 font-mono text-center text-lg tracking-[0.35em] font-bold text-[#fff1c2] uppercase focus:outline-none focus:border-[#f6dc93]"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={busyAction || joinCodeInput.length < 6}
                      className="w-full min-h-[44px] rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-45 text-white text-xs sm:text-sm font-black transition-colors"
                    >
                      JOIN PRIVATE TABLE
                    </button>
                  </form>
                </div>
              )}
            </div>
          </div>
        )}

        {/* STATE B: WAITING ROOM (PUBLIC MATCHMAKING OR PRIVATE CODE LOBBY) */}
        {room && room.status === 'waiting' && (
          <div className="relative z-20 h-full w-full px-4 py-6 flex items-center justify-center bg-black/55 backdrop-blur-[2px]">
            <div className="w-full max-w-md rounded-2xl border border-[#d4af37]/40 bg-[#0d0a1a]/95 p-5 sm:p-6 space-y-4 shadow-2xl">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-300">
                    {room.isPrivate ? 'Private Teen Patti Table' : 'Live Table Matchmaking'}
                  </div>
                  <h2 className="font-display text-xl font-bold text-white">
                    ₹{room.bootAmount} Boot Table
                  </h2>
                </div>
                <span className="font-mono-num text-xs font-bold text-[#f6dc93] bg-[#d4af37]/15 border border-[#d4af37]/35 px-2.5 py-1 rounded-lg">
                  {room.players.length}/{room.maxPlayers} Seated
                </span>
              </div>

              {room.isPrivate ? (
                <div className="rounded-xl border border-[#d4af37]/35 bg-black/55 p-4 text-center space-y-3">
                  <div className="text-[11px] uppercase tracking-wider text-zinc-400">
                    Share 6-Digit Table Code
                  </div>
                  <div className="font-mono text-3xl font-black tracking-[0.3em] text-[#fff1c2]">
                    {room.code}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={handleCopyCode}
                      className="min-h-[40px] rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 text-xs font-bold text-zinc-100 inline-flex items-center justify-center gap-1.5"
                    >
                      {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedCode ? 'Copied' : 'Copy Code'}</span>
                    </button>
                    <a
                      href={whatsappShareUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => soundEngine.playClick()}
                      className="min-h-[40px] rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white inline-flex items-center justify-center gap-1.5"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                      <span>WhatsApp</span>
                    </a>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/30 p-3.5 flex items-center justify-between gap-3">
                  <div className="space-y-0.5">
                    <div className="text-xs font-bold text-emerald-200">
                      Seating online players...
                    </div>
                    <div className="text-[11px] text-zinc-300">
                      {platformSettings.smartMatchmakingEnabled ? (
                        <>
                          Dealing automatically in{' '}
                          <span className="font-mono-num font-bold text-[#f6dc93]">{matchmakingSec}s</span>
                        </>
                      ) : (
                        'Waiting for live players to join the table...'
                      )}
                    </div>
                  </div>
                  <RefreshCw className="w-5 h-5 text-emerald-400 animate-spin shrink-0" />
                </div>
              )}

              {/* Seated Players List */}
              <div className="space-y-1.5">
                {room.players.map((p, idx) => (
                  <div
                    key={p.uid}
                    className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-xs"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <AvatarBadge name={p.name} seed={p.uid} size="sm" />
                      <span className="font-semibold text-zinc-100 truncate">{p.name}</span>
                      {idx === 0 && (
                        <span className="text-[10px] font-bold text-[#f6dc93] uppercase">Host</span>
                      )}
                    </div>
                    <span className="text-emerald-300 font-semibold">Ready</span>
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    soundEngine.playClick();
                    setRoom(null);
                    setIsLocalGuestRoom(false);
                  }}
                  className="px-4 min-h-[44px] rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 text-xs font-semibold text-zinc-300"
                >
                  Leave
                </button>
                {room.hostUid === myUid && (
                  <button
                    type="button"
                    disabled={busyAction}
                    onClick={() => void handleStartWaitingTableNow()}
                    className="flex-1 gold-button min-h-[44px] rounded-xl text-xs sm:text-sm font-black"
                  >
                    {busyAction ? 'Dealing Cards...' : 'DEAL CARDS NOW'}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* STATE C: LIVE 5-SEAT TEEN PATTI TABLE */}
        {room && (room.status === 'playing' || room.status === 'showdown') && (
          <div className="relative z-20 h-full w-full">
            {/* Top Total Pot Header Card & Live Ticker Overlay */}
            <div className="pointer-events-none absolute left-1/2 top-1.5 sm:top-2 -translate-x-1/2 flex flex-col items-center gap-1 w-[220px] sm:w-[260px] z-15">
              <div className="rounded-xl border border-[#f6dc93]/45 bg-[#090712]/92 px-3 py-1.5 text-center shadow-[0_8px_24px_rgba(0,0,0,0.8)] backdrop-blur-sm">
                <div className="text-[10px] uppercase tracking-widest text-zinc-400 font-semibold">
                  Total Pot · Hand #{room.handNumber}
                </div>
                <div className="font-display font-mono-num text-lg sm:text-xl font-black text-[#fff1c2] leading-tight">
                  ₹{room.pot.toLocaleString()}
                </div>
              </div>
              <div className="max-w-full px-2.5 py-0.5 rounded-full bg-black/75 border border-white/10 text-[10px] text-zinc-300 font-medium truncate">
                {room.lastActionNote}
              </div>
            </div>

            {/* 5 Player Seats */}
            {visualSeats.map(({ player, roomSeatIdx, visualSlot }) => {
              const isMe = player.uid === myUid;
              const isDealer = room.dealerIndex === roomSeatIdx;
              const isActiveTurn =
                room.status === 'playing' &&
                room.currentTurnIndex === roomSeatIdx &&
                player.status === 'active';
              const isWinner = room.status === 'showdown' && room.winnerUid === player.uid;
              const isPacked = player.status === 'packed';
              const showCardsFaceUp =
                (isMe && player.isSeen) ||
                (room.status === 'showdown' && !isPacked);

              const pct = isActiveTurn ? (turnRemainingSec / TURN_DURATION_SEC) * 100 : 0;
              const ringColor =
                turnRemainingSec <= 3 ? '#f43f5e' : turnRemainingSec <= 6 ? '#f59e0b' : '#34d399';
              const seatReaction =
                activeReaction && activeReaction.uid === player.uid ? activeReaction : null;

              const handLabel =
                isMe && myHandEval
                  ? myHandEval.label
                  : room.status === 'showdown' && !isPacked
                    ? player.handLabel ||
                      (player.cards.length === 3 ? getShortCategoryBadge(evaluateTeenPattiHand(player.cards).category) : '')
                    : '';

              return (
                <div
                  key={player.uid}
                  className={`absolute ${getSeatPositionClass(visualSlot)} flex flex-col items-center gap-1 transition-all duration-300 ${
                    isMe ? 'z-35' : 'z-20'
                  }`}
                >
                  {/* Quick Chat Speech Bubble */}
                  {seatReaction && (
                    <div className="mb-0.5 px-2.5 py-1 rounded-xl bg-[#16102b]/95 border border-[#f6dc93]/50 text-[11px] font-semibold text-[#fff1c2] shadow-xl whitespace-nowrap animate-bounce">
                      {seatReaction.emoji} {seatReaction.text}
                    </div>
                  )}

                  {/* Cards Fan (above avatar for User at Seat 0, beside/below for Opponents) */}
                  <div className={`relative flex items-center justify-center ${isMe ? 'order-1 mb-0.5' : 'order-2 mt-0.5'}`}>
                    <div className="flex items-center -space-x-2.5 sm:-space-x-3">
                      {[0, 1, 2].map((cIdx) => (
                        <PlayingCardMini
                          key={cIdx}
                          card={player.cards[cIdx]}
                          faceUp={showCardsFaceUp}
                          packed={isPacked}
                          large={isMe}
                          tiltDeg={(cIdx - 1) * 7}
                        />
                      ))}
                    </div>

                    {/* Glowing SEE Button directly over User's face-down cards */}
                    {isMe &&
                      room.status === 'playing' &&
                      !isPacked &&
                      !player.isSeen && (
                        <button
                          type="button"
                          onClick={() => void handleSeeCards()}
                          className="absolute inset-0 m-auto h-8 w-20 rounded-full bg-gradient-to-r from-[#f6dc93] via-[#eab308] to-[#cfa432] text-[#140d02] text-xs font-black tracking-wider shadow-[0_0_24px_rgba(250,204,21,0.85)] border border-white/80 inline-flex items-center justify-center gap-1 hover:scale-105 active:scale-95 transition-transform"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>SEE</span>
                        </button>
                      )}

                    {/* Hand Rank Badge when Seen or on Showdown */}
                    {handLabel && !isPacked && (
                      <div className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded bg-[#0a0714]/95 border border-[#f6dc93]/60 text-[9px] sm:text-[10px] font-black tracking-wider text-[#fde68a] whitespace-nowrap shadow-md">
                        {handLabel}
                      </div>
                    )}
                  </div>

                  {/* Player Avatar + 15s SVG Countdown Ring + Nameplate */}
                  <div
                    className={`${isMe ? 'order-2' : 'order-1'} relative flex items-center gap-2 rounded-2xl px-2 sm:px-2.5 py-1.5 border backdrop-blur-md transition-all ${
                      isWinner
                        ? 'border-amber-300 bg-amber-950/85 shadow-[0_0_26px_rgba(250,204,21,0.65)]'
                        : isActiveTurn
                          ? 'border-emerald-400 bg-[#0d1f1b]/92 shadow-[0_0_20px_rgba(52,211,153,0.45)]'
                          : isPacked
                            ? 'border-white/10 bg-black/65 opacity-60'
                            : 'border-white/15 bg-[#0c0918]/88'
                    }`}
                  >
                    {/* Avatar with SVG Timer Ring */}
                    <div className="relative w-9 h-9 sm:w-10 sm:h-10 shrink-0 flex items-center justify-center">
                      {isActiveTurn && (
                        <svg
                          viewBox="0 0 44 44"
                          className="absolute inset-0 w-full h-full -rotate-90"
                          aria-hidden="true"
                        >
                          <circle
                            cx="22"
                            cy="22"
                            r="19"
                            fill="none"
                            stroke="rgba(255,255,255,0.14)"
                            strokeWidth="3"
                          />
                          <circle
                            cx="22"
                            cy="22"
                            r="19"
                            fill="none"
                            stroke={ringColor}
                            strokeWidth="3.2"
                            strokeLinecap="round"
                            strokeDasharray={`${2 * Math.PI * 19}`}
                            strokeDashoffset={`${(2 * Math.PI * 19) * (1 - pct / 100)}`}
                          />
                        </svg>
                      )}
                      <AvatarBadge name={player.name} seed={player.uid} size="sm" />
                      {isDealer && (
                        <span
                          title="Dealer"
                          className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-gradient-to-b from-[#fef08a] to-[#b45309] border border-white text-[#140d02] text-[9px] font-black flex items-center justify-center shadow"
                        >
                          D
                        </span>
                      )}
                      {isWinner && (
                        <Crown className="absolute -top-2.5 left-1/2 -translate-x-1/2 w-4 h-4 text-amber-300 fill-amber-300 drop-shadow" />
                      )}
                    </div>

                    {/* Player Name & Blind/Seen/Action Meta */}
                    <div className="min-w-0 max-w-[82px] sm:max-w-[110px]">
                      <div className="flex items-center gap-1">
                        <span className="text-[11px] sm:text-xs font-bold text-white truncate">
                          {isMe ? 'You' : player.name}
                        </span>
                        {isActiveTurn && (
                          <span className="font-mono-num text-[10px] font-black text-emerald-300 shrink-0">
                            {turnRemainingSec}s
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 text-[9px] sm:text-[10px] leading-tight">
                        <span
                          className={`font-bold uppercase ${
                            isWinner
                              ? 'text-amber-300'
                              : isPacked
                                ? 'text-rose-400'
                                : player.isSeen
                                  ? 'text-sky-300'
                                  : 'text-emerald-300'
                          }`}
                        >
                          {isWinner ? 'WINNER' : isPacked ? 'PACKED' : player.isSeen ? 'SEEN' : 'BLIND'}
                        </span>
                        <span className="text-zinc-400 font-mono-num truncate">
                          ₹{player.totalBet}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* INCOMING SIDE SHOW MODAL */}
            {incomingSideShow && (
              <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
                <div className="w-full max-w-sm rounded-2xl border border-[#f6dc93]/50 bg-[#0e0a1c] p-5 space-y-4 shadow-2xl text-center">
                  <div className="text-xs font-bold uppercase tracking-wider text-[#f6dc93]">
                    Side Show Challenge
                  </div>
                  <h3 className="font-display text-lg font-bold text-white">
                    {incomingSideShow.requesterName} requests a Side Show
                  </h3>
                  <p className="text-xs text-zinc-300 leading-relaxed">
                    Accept to privately compare your 3 cards against {incomingSideShow.requesterName}. The lower hand packs automatically (exact ties go to you as defender).
                  </p>
                  <div className="grid grid-cols-2 gap-2.5 pt-1">
                    <button
                      type="button"
                      disabled={busyAction}
                      onClick={() => void handleRespondIncomingSideShow(false)}
                      className="min-h-[44px] rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 text-xs font-bold text-zinc-200"
                    >
                      DECLINE
                    </button>
                    <button
                      type="button"
                      disabled={busyAction}
                      onClick={() => void handleRespondIncomingSideShow(true)}
                      className="min-h-[44px] rounded-xl gold-button text-xs font-black"
                    >
                      ACCEPT SHOW
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* BOTTOM ACTION DOCK (ACTIVE HAND OR SHOWDOWN) */}
      {room && room.status === 'playing' && (
        <div className="fixed bottom-[52px] lg:static inset-x-0 z-45 border-t border-[#d4af37]/25 bg-[#090712]/96 px-2.5 sm:px-4 py-2 sm:py-2.5 pb-[calc(2.5rem+env(safe-area-inset-bottom,0px))] lg:pb-2.5 shrink-0 shadow-[0_-10px_25px_rgba(0,0,0,0.85)]">
          <div className="max-w-4xl mx-auto flex flex-wrap sm:flex-nowrap items-center justify-between gap-2">
            {/* Left Group: PACK, SIDE SHOW, SHOW */}
            <div className="flex items-center gap-1.5 sm:gap-2 flex-1 sm:flex-initial">
              <button
                type="button"
                disabled={!isMyTurn || busyAction}
                onClick={() => void handlePack(false)}
                className="flex-1 sm:flex-initial min-h-[44px] px-3 sm:px-4 rounded-xl border border-rose-500/45 bg-rose-950/50 hover:bg-rose-900/60 disabled:opacity-35 text-xs font-black text-rose-200 whitespace-nowrap transition-colors"
              >
                PACK
              </button>

              <button
                type="button"
                disabled={!canRequestSideShow || busyAction}
                onClick={() => void handleRequestSideShow()}
                className="flex-1 sm:flex-initial min-h-[44px] px-3 sm:px-4 rounded-xl border border-purple-400/45 bg-purple-950/50 hover:bg-purple-900/60 disabled:opacity-35 text-xs font-bold text-purple-200 whitespace-nowrap transition-colors"
                title="Available when you and the previous active player are both Seen (>2 active players)"
              >
                SIDE SHOW
              </button>

              <button
                type="button"
                disabled={!canRequestShow || busyAction}
                onClick={() => void handleCallShow()}
                className="flex-1 sm:flex-initial min-h-[44px] px-3 sm:px-4 rounded-xl border border-amber-400/50 bg-amber-950/50 hover:bg-amber-900/60 disabled:opacity-35 text-xs font-black text-amber-200 whitespace-nowrap transition-colors"
                title="Available when only 2 active players remain"
              >
                SHOW
              </button>
            </div>

            {/* Right Group: - / + (1x / 2x Raise) + Primary BLIND / CHAAL CTA */}
            <div className="flex items-center gap-1.5 sm:gap-2 w-full sm:w-auto justify-end">
              <div className="inline-flex items-center rounded-xl border border-white/15 bg-black/55 p-0.5 shrink-0">
                <button
                  type="button"
                  disabled={!isMyTurn || !raise2x}
                  onClick={() => {
                    soundEngine.playClick();
                    setRaise2x(false);
                  }}
                  aria-label="Standard 1x stake"
                  className="w-9 h-9 rounded-lg flex items-center justify-center text-zinc-200 hover:bg-white/10 disabled:opacity-35"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <span className="px-2 font-mono-num text-xs font-bold text-[#f6dc93] whitespace-nowrap">
                  {raise2x && stakeOptions.canDouble ? '2×' : '1×'}
                </span>
                <button
                  type="button"
                  disabled={!isMyTurn || raise2x || !stakeOptions.canDouble || !checkCanAfford(stakeOptions.maxBet)}
                  onClick={() => {
                    soundEngine.playClick();
                    setRaise2x(true);
                  }}
                  aria-label="Raise 2x stake"
                  className="w-9 h-9 rounded-lg flex items-center justify-center text-zinc-200 hover:bg-white/10 disabled:opacity-35"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              <button
                type="button"
                disabled={!isMyTurn || busyAction || !checkCanAfford(selectedWagerAmount)}
                onClick={() => void handleBlindOrChaal()}
                className="flex-1 sm:flex-initial min-w-[148px] sm:min-w-[180px] min-h-[44px] px-4 sm:px-6 rounded-xl gold-button disabled:opacity-40 text-xs sm:text-sm font-black tracking-wide whitespace-nowrap"
              >
                {!myPlayer || myPlayer.status === 'packed'
                  ? 'PACKED'
                  : isMyTurn
                    ? `${myPlayer.isSeen ? 'CHAAL' : 'BLIND'} ₹${selectedWagerAmount.toLocaleString()}`
                    : 'WAIT TURN...'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SHOWDOWN SUMMARY BAR */}
      {room && room.status === 'showdown' && (
        <div className="fixed bottom-[52px] lg:static inset-x-0 z-45 border-t border-[#f6dc93]/40 bg-gradient-to-r from-[#1a1207] via-[#130d24] to-[#0b1f18] px-3 sm:px-5 py-3 pb-[calc(2.5rem+env(safe-area-inset-bottom,0px))] lg:pb-3 shrink-0 shadow-[0_-10px_25px_rgba(0,0,0,0.85)]">
          <div className="max-w-4xl mx-auto flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-400/50 flex items-center justify-center shrink-0">
                <Crown className="w-5 h-5 text-amber-300" />
              </div>
              <div className="min-w-0">
                <div className="text-xs sm:text-sm font-bold text-white truncate">
                  {room.winnerUid === myUid ? 'You Won the Pot!' : `${room.winnerName} Won the Pot`}
                  <span className="ml-2 font-mono-num text-emerald-300">
                    +₹{room.winnerPayout.toLocaleString()}
                  </span>
                </div>
                <div className="text-[11px] text-[#f6dc93] font-semibold truncate">
                  {room.winnerHandLabel} · Pot ₹{room.pot.toLocaleString()} (after {TEEN_PATTI_RAKE_PERCENT}% rake)
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                type="button"
                onClick={() => {
                  soundEngine.playClick();
                  setRoom(null);
                  setIsLocalGuestRoom(false);
                }}
                className="min-h-[44px] px-3.5 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 text-xs font-bold text-zinc-200 whitespace-nowrap"
              >
                Change Table
              </button>
              <button
                type="button"
                disabled={busyAction}
                onClick={() => void handleDealNextHand()}
                className="flex-1 sm:flex-initial min-h-[44px] px-5 rounded-xl gold-button text-xs sm:text-sm font-black whitespace-nowrap"
              >
                {busyAction ? 'Dealing...' : `DEAL NEXT HAND (₹${room.bootAmount})`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EXIT CONFIRMATION MODAL */}
      {showExitConfirm && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-2xl border border-[#d4af37]/40 bg-[#0d0a1a] p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-bold text-white">Leave Active Table?</h3>
              <button
                type="button"
                onClick={cancelExit}
                className="p-1 text-zinc-400 hover:text-white"
                aria-label="Cancel"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-zinc-300 leading-relaxed">
              A Teen Patti hand is currently in progress. Leaving now forfeits any coins already placed into the current pot.
            </p>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={cancelExit}
                className="min-h-[42px] rounded-xl border border-white/15 bg-white/5 text-xs font-bold text-zinc-200"
              >
                Stay at Table
              </button>
              <button
                type="button"
                onClick={confirmExit}
                className="min-h-[42px] rounded-xl bg-rose-600 hover:bg-rose-500 text-xs font-black text-white"
              >
                Leave Table
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RULES & HAND RANKINGS MODAL */}
      <GameRulesModal open={rulesOpen} game="teen_patti" onClose={() => setRulesOpen(false)} />

      {/* PROVABLY FAIR SHA-256 VERIFIER MODAL */}
      <ProvablyFairModal open={fairOpen} onClose={() => setFairOpen(false)} proof={fairProof} />
    </div>
  );
}
