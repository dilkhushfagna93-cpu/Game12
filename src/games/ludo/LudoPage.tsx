import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Camera,
  ChevronLeft,
  ChevronRight,
  Copy,
  Crown,
  HelpCircle,
  KeyRound,
  Loader2,
  MessageSquare,
  RotateCcw,
  Share2,
  ShieldCheck,
  Trophy,
  Users,
  X,
  Zap,
} from 'lucide-react';
import { AvatarBadge } from '../../components/AvatarBadge';
import { GameRulesModal } from '../../components/GameRulesModal';
import { GraphicsAudioBar } from '../../components/GraphicsAudioBar';
import { useApp } from '../../context/AppContext';
import { GameExitModal, useGameBackGuard } from '../../hooks/useGameBackGuard';
import {
  calculateLudoPrize,
  commitLudoRoomTurnUpdate,
  createMultiplayerLudoRoom,
  fillLudoRoomWithSmartBots,
  findAndJoinLudoRoomByCode,
  findOrCreatePublicLudoRoom,
  getNaturalReactionDelayMs,
  listOpenLudoRooms,
  LUDO_ENTRY_TABLES,
  sendLudoRoomReaction,
  startMultiplayerLudoMatch,
  subscribeToLudoRoom,
  toggleLudoPlayerReady,
  type LudoEntryTableFee,
} from '../../services/ludoRoomService';
import { doc, getDoc } from 'firebase/firestore';
import { soundEngine } from '../../services/soundEngine';
import { db } from '../../services/firebase';
import { canAffordGameEntry } from '../../services/walletService';
import type { LudoColor, LudoGameMode, LudoReaction, LudoRoom } from '../../types';
import { LudoCanvas } from './LudoCanvas';
import {
  applyLocalLudoMove,
  getActiveColorsForPlayerCount,
  getLegalTokenIndices,
  LUDO_COLORS_HEX,
} from './ludoLogic';

const TURN_TIMEOUT_SEC = 15;
const DEFAULT_MATCHMAKING_WAIT_SEC = 8;
const MAX_MISSED_TURNS = 3;

const TABLE_BASE_ONLINE_COUNTS: Record<LudoEntryTableFee, number> = {
  1: 318,
  5: 264,
  10: 542,
  50: 386,
  100: 194,
  500: 78,
};

const MATCHED_OPPONENT_NAMES = ['Aarav_99', 'PriyaRoy', 'VikramPro', 'KabirAce', 'Rohan77', 'AnanyaK'];

const QUICK_REACTIONS = [
  { emoji: '👏', text: 'Well played!' },
  { emoji: '🎲', text: 'Lucky 6!' },
  { emoji: '😂', text: 'Hahaha!' },
  { emoji: '😱', text: 'Oh no!' },
  { emoji: '🔥', text: 'Unstoppable!' },
  { emoji: '👑', text: 'Ludo 3D!' },
];

const INITIAL_TOKENS = (): Record<LudoColor, number[]> => ({
  red: [-1, -1, -1, -1],
  green: [-1, -1, -1, -1],
  yellow: [-1, -1, -1, -1],
  blue: [-1, -1, -1, -1],
});

const INITIAL_MISSED = (): Record<LudoColor, number> => ({
  red: 0,
  green: 0,
  yellow: 0,
  blue: 0,
});

interface AutoMoveServerResponse {
  dice: number;
  threeSixes: boolean;
  noLegalMoves: boolean;
  chosenTokenIndex: number | null;
  nextTokens: Record<LudoColor, number[]>;
  captured: { color: LudoColor; tokenIndex: number } | null;
  finishedNow: boolean;
  allFinished: boolean;
  bonusTurn: boolean;
  serverSeedHash?: string;
}

interface LudoDiceAudit {
  dice: number;
  rollId: string;
  serverSeed: string;
  serverSeedHash: string;
}

const CORNER_THEME: Record<
  LudoColor,
  {
    name: string;
    hex: string;
    border: string;
    activeGlow: string;
    nameBarBg: string;
    cardBg: string;
    diceTrayBg: string;
    pipColor: string;
  }
> = {
  red: {
    name: 'Red',
    hex: '#ff172b',
    border: 'border-[#ff9aa2]',
    activeGlow: 'shadow-[0_0_24px_rgba(255,214,0,0.95)] ring-2 ring-[#ffe033]',
    nameBarBg: 'bg-[#b80016]',
    cardBg: 'from-[#ff2e40] via-[#e60023] to-[#b3001b]',
    diceTrayBg: 'from-[#ff3b4d] to-[#b80016]',
    pipColor: '#e60023',
  },
  green: {
    name: 'Green',
    hex: '#00c853',
    border: 'border-[#86efac]',
    activeGlow: 'shadow-[0_0_24px_rgba(255,214,0,0.95)] ring-2 ring-[#ffe033]',
    nameBarBg: 'bg-[#007a2f]',
    cardBg: 'from-[#00db5b] via-[#00b84c] to-[#008234]',
    diceTrayBg: 'from-[#00d959] to-[#008234]',
    pipColor: '#00a844',
  },
  yellow: {
    name: 'Yellow',
    hex: '#ffd600',
    border: 'border-[#fef08a]',
    activeGlow: 'shadow-[0_0_24px_rgba(255,230,51,0.98)] ring-2 ring-[#ffffff]',
    nameBarBg: 'bg-[#b87300]',
    cardBg: 'from-[#ffd814] via-[#f5a800] to-[#c97e00]',
    diceTrayBg: 'from-[#ffde29] to-[#c97e00]',
    pipColor: '#c97e00',
  },
  blue: {
    name: 'Blue',
    hex: '#0095ff',
    border: 'border-[#7dd3fc]',
    activeGlow: 'shadow-[0_0_24px_rgba(255,214,0,0.95)] ring-2 ring-[#ffe033]',
    nameBarBg: 'bg-[#005bb5]',
    cardBg: 'from-[#1aa3ff] via-[#0084f0] to-[#0059b3]',
    diceTrayBg: 'from-[#1aa3ff] to-[#0059b3]',
    pipColor: '#007ce6',
  },
};

const DIE_PIP_POSITIONS: Record<number, Array<[number, number]>> = {
  1: [[50, 50]],
  2: [
    [27, 27],
    [73, 73],
  ],
  3: [
    [27, 27],
    [50, 50],
    [73, 73],
  ],
  4: [
    [27, 27],
    [73, 27],
    [27, 73],
    [73, 73],
  ],
  5: [
    [27, 27],
    [73, 27],
    [50, 50],
    [27, 73],
    [73, 73],
  ],
  6: [
    [27, 23],
    [73, 23],
    [27, 50],
    [73, 50],
    [27, 77],
    [73, 77],
  ],
};


function LudoKingDiceBox({
  value,
  rolling,
  canRoll,
  isTurn,
  color,
  align,
  onRoll,
}: {
  value: number;
  rolling: boolean;
  canRoll: boolean;
  isTurn: boolean;
  color: LudoColor;
  align: 'left' | 'right';
  onRoll: () => void;
}) {
  const theme = CORNER_THEME[color];
  const pips = DIE_PIP_POSITIONS[value] || DIE_PIP_POSITIONS[1];

  return (
    <div
      className={`relative flex items-center gap-0.5 shrink-0 ${
        align === 'right' ? 'flex-row-reverse' : ''
      }`}
    >
      {/* Classic Ludo King Blinking Directional Arrow pointing at active dice */}
      {canRoll && !rolling && (
        <span className="text-[#ffe033] animate-bounce drop-shadow-[0_0_8px_rgba(255,224,51,0.9)]">
          {align === 'left' ? (
            <ChevronRight className="w-4 h-4 stroke-[3.5]" />
          ) : (
            <ChevronLeft className="w-4 h-4 stroke-[3.5]" />
          )}
        </span>
      )}

      <button
        type="button"
        disabled={!canRoll}
        onClick={onRoll}
        aria-label={canRoll ? `Roll dice for ${theme.name}` : `${theme.name} dice showing ${value}`}
        className={`relative w-12 h-12 sm:w-14 sm:h-14 rounded-xl border-2 flex items-center justify-center transition-all shrink-0 bg-gradient-to-b ${theme.diceTrayBg} ${
          isTurn
            ? `border-[#ffe033] shadow-[0_0_22px_rgba(255,224,51,0.85)] ${
                canRoll ? 'cursor-pointer hover:scale-105 active:scale-95' : 'cursor-default'
              }`
            : `${theme.border} opacity-85 cursor-default`
        }`}
      >
        {/* Crisp Glossy 3D Ivory Ludo King Die */}
        <div
          className={`relative w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-gradient-to-br from-[#ffffff] via-[#ffffff] to-[#e2e8f0] border border-slate-500/80 shadow-[inset_0_2px_3px_rgba(255,255,255,1),0_4px_8px_rgba(0,0,0,0.4)] ${
            rolling && isTurn ? 'animate-dice-tumble' : ''
          }`}
        >
          <svg viewBox="0 0 100 100" className="w-full h-full">
            {pips.map(([cx, cy], idx) => (
              <circle
                key={idx}
                cx={cx}
                cy={cy}
                r={value === 1 ? 15 : 10.2}
                fill={value === 1 ? '#ff172b' : value === 6 ? theme.pipColor : '#0f172a'}
              />
            ))}
          </svg>
        </div>

        {canRoll && !rolling && (
          <span className="pointer-events-none absolute -bottom-2 left-1/2 -translate-x-1/2 px-1.5 py-0.2 rounded-sm bg-gradient-to-b from-[#ffe033] to-[#f59e0b] text-[#1c1002] text-[8px] font-black tracking-wider uppercase shadow border border-white">
            ROLL
          </span>
        )}
      </button>
    </div>
  );
}

function LudoKingCornerPod({
  color,
  align,
  playerName,
  isSeatActive,
  isTurn,
  isBot,
  isForfeit,
  finishedCount,
  tokensToWin = 4,
  missedCount,
  secondsLeft,
  diceValue,
  diceRolling,
  canRoll,
  onRoll,
}: {
  color: LudoColor;
  align: 'left' | 'right';
  playerName: string;
  isSeatActive: boolean;
  isTurn: boolean;
  isBot: boolean;
  isForfeit: boolean;
  finishedCount: number;
  tokensToWin?: number;
  missedCount: number;
  secondsLeft: number;
  diceValue: number;
  diceRolling: boolean;
  canRoll: boolean;
  onRoll: () => void;
}) {
  const theme = CORNER_THEME[color];
  const radius = 19;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.max(0, Math.min(1, secondsLeft / TURN_TIMEOUT_SEC));
  const strokeDashoffset = circumference * (1 - progress);
  const timerColor = secondsLeft <= 5 ? '#f43f5e' : secondsLeft <= 9 ? '#fde047' : '#22c55e';
  const remainingLives = Math.max(0, MAX_MISSED_TURNS - missedCount);

  if (!isSeatActive) {
    return (
      <div
        className={`flex items-center gap-1.5 opacity-25 ${
          align === 'right' ? 'flex-row-reverse text-right' : ''
        }`}
      >
        <div className="px-2.5 py-2 rounded-xl border border-sky-300/20 bg-[#081d52]/70 text-[10px] font-semibold text-sky-200">
          Empty Seat
        </div>
      </div>
    );
  }

  const profilePod = (
    <div
      className={`flex items-center gap-1.5 sm:gap-2 px-1.5 sm:px-2 py-1 rounded-xl border-2 bg-gradient-to-b ${theme.cardBg} shadow-lg transition-all min-w-0 max-w-[146px] sm:max-w-[186px] ${
        isForfeit
          ? 'border-rose-500/40 opacity-50 grayscale'
          : isTurn
            ? `${theme.activeGlow} border-[#ffe033]`
            : `${theme.border}`
      } ${align === 'right' ? 'flex-row-reverse text-right' : ''}`}
    >
      {/* Square-Rounded Golden Avatar Box + Circular Turn Timer */}
      <div className="relative w-10 h-10 flex items-center justify-center shrink-0">
        {isTurn && !isBot && (
          <svg
            viewBox="0 0 44 44"
            className="absolute inset-0 w-full h-full -rotate-90 pointer-events-none"
          >
            <circle
              cx="22"
              cy="22"
              r={radius}
              fill="none"
              stroke="rgba(255,255,255,0.22)"
              strokeWidth="3.5"
            />
            <circle
              cx="22"
              cy="22"
              r={radius}
              fill="none"
              stroke={timerColor}
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              style={{ transition: 'stroke-dashoffset 0.35s linear, stroke 0.25s ease' }}
            />
          </svg>
        )}
        <div className="scale-[0.86]">
          <AvatarBadge name={playerName} seed={`lk_${color}_${playerName}`} size="sm" />
        </div>
        {isTurn && (
          <span
            className={`absolute -bottom-1 px-1 rounded text-[8px] font-mono-num font-black leading-tight text-white shadow ${
              isBot ? 'bg-[#1d4ed8]' : secondsLeft <= 5 ? 'bg-rose-600' : 'bg-[#071945]'
            }`}
          >
            {isBot ? '•••' : `${secondsLeft}s`}
          </span>
        )}
      </div>

      {/* Name Ribbon + 4 Home Pips + 3 Skip Lives */}
      <div className="min-w-0 flex-1 space-y-1">
        <div
          className={`px-1.5 py-0.5 rounded text-[10px] sm:text-[11px] font-extrabold text-white truncate leading-tight ${theme.nameBarBg} shadow-inner`}
        >
          {playerName}
        </div>
        <div
          className={`flex items-center justify-between gap-1 ${
            align === 'right' ? 'flex-row-reverse' : ''
          }`}
        >
          {/* Tokens Finished Indicators (1 pip in Quick Mode, 4 pips in Classic) */}
          <div className="flex items-center gap-0.5">
            {Array.from({ length: tokensToWin }).map((_, idx) => (
              <span
                key={idx}
                className={`w-2 h-2 rounded-full border ${
                  idx < finishedCount
                    ? 'bg-[#ffe033] border-white shadow-[0_0_5px_rgba(255,224,51,0.95)]'
                    : 'bg-black/45 border-white/40'
                }`}
              />
            ))}
          </div>
          {/* 3 Skip Lives (classic Ludo King green/red pips) */}
          <div className="flex items-center gap-0.5" title={`${remainingLives}/3 turn lives left`}>
            {[0, 1, 2].map((lifeIdx) => (
              <span
                key={lifeIdx}
                className={`w-1.5 h-1.5 rounded-full ${
                  lifeIdx < remainingLives ? 'bg-emerald-400' : 'bg-rose-600/60'
                }`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  const dicePod = (
    <LudoKingDiceBox
      value={isTurn ? diceValue : 1}
      rolling={diceRolling}
      canRoll={canRoll}
      isTurn={isTurn}
      color={color}
      align={align}
      onRoll={onRoll}
    />
  );

  return (
    <div
      className={`flex items-center gap-1.5 sm:gap-2 min-w-0 ${
        align === 'right' ? 'justify-end' : 'justify-start'
      }`}
    >
      {align === 'left' ? (
        <>
          {profilePod}
          {dicePod}
        </>
      ) : (
        <>
          {dicePod}
          {profilePod}
        </>
      )}
    </div>
  );
}

export default function LudoPage() {
  const {
    firebaseUser,
    profile,
    isGuestMode,
    balance,
    depositBalance,
    winningBalance,
    bonusBalance,
    graphicsQuality,
    gameConfigs,
    platformSettings,
    placeBet,
    settleRound,
    pushToast,
  } = useApp();

  const ludoConfig = gameConfigs.ludo;
  const configuredWaitSec = Math.max(5, Math.min(15, Math.round(platformSettings.matchmakingWaitSeconds || DEFAULT_MATCHMAKING_WAIT_SEC)));

  const [lobbyTab, setLobbyTab] = useState<LudoGameMode>('quick');
  const [privateTokensToWin, setPrivateTokensToWin] = useState<1 | 4>(1);
  const [playerCount, setPlayerCount] = useState<2 | 4>(2);
  const [entryStake, setEntryStake] = useState<LudoEntryTableFee>(10);
  const [matchStarted, setMatchStarted] = useState(false);
  const [guestMatchmaking, setGuestMatchmaking] = useState(false);
  const [joiningTable, setJoiningTable] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);

  // Guest / Fallback Online Match State
  const [tokens, setTokens] = useState<Record<LudoColor, number[]>>(INITIAL_TOKENS);
  const [turnIndex, setTurnIndex] = useState(0);
  const [diceValue, setDiceValue] = useState(1);
  const [diceRolled, setDiceRolled] = useState(false);
  const [diceRolling, setDiceRolling] = useState(false);
  const [tokenAnimating, setTokenAnimating] = useState(false);
  const [consecutiveSixes, setConsecutiveSixes] = useState(0);
  const [missedTurns, setMissedTurns] = useState<Record<LudoColor, number>>(INITIAL_MISSED);
  const [forfeitedColors, setForfeitedColors] = useState<LudoColor[]>([]);
  const [turnSecondsLeft, setTurnSecondsLeft] = useState(TURN_TIMEOUT_SEC);
  const [winnerColor, setWinnerColor] = useState<LudoColor | null>(null);
  const [statusLog, setStatusLog] = useState('Choose an Entry Fee Table to play online!');
  const [cameraPreset, setCameraPreset] = useState<'topdown' | 'angled'>('topdown');
  const [chatOpen, setChatOpen] = useState(false);
  const [fairOpen, setFairOpen] = useState(false);
  const [lastDiceAudit, setLastDiceAudit] = useState<LudoDiceAudit | null>(null);
  const [activeReaction, setActiveReaction] = useState<LudoReaction | null>(null);
  const matchRoundIdRef = useRef<string>('');
  const autoMoveLockRef = useRef<boolean>(false);
  const deductedRoomIdRef = useRef<string>('');
  const settledRoomIdRef = useRef<string>('');
  const guestMatchTimerRef = useRef<number | null>(null);
  const moveAnimTimersRef = useRef<number[]>([]);

  const clearMoveAnimTimers = useCallback(() => {
    moveAnimTimersRef.current.forEach((id) => window.clearTimeout(id));
    moveAnimTimersRef.current = [];
  }, []);

  const scheduleMoveAnimTimer = useCallback((fn: () => void, delayMs: number) => {
    const id = window.setTimeout(() => {
      moveAnimTimersRef.current = moveAnimTimersRef.current.filter((t) => t !== id);
      fn();
    }, delayMs);
    moveAnimTimersRef.current.push(id);
    return id;
  }, []);

  const estimateMoveAnimMs = useCallback(
    (prevTokens: Record<LudoColor, number[]>, nextTokens: Record<LudoColor, number[]>, color: LudoColor): number => {
      const prevArr = prevTokens[color] || [];
      const nextArr = nextTokens[color] || [];
      let maxMs = 0;
      for (let i = 0; i < 4; i++) {
        const p0 = prevArr[i] ?? -1;
        const p1 = nextArr[i] ?? -1;
        if (p1 > p0) {
          if (p0 === -1 && p1 === 0) {
            maxMs = Math.max(maxMs, 320);
          } else if (p0 === -1) {
            maxMs = Math.max(maxMs, 320 + p1 * 270);
          } else {
            maxMs = Math.max(maxMs, (p1 - p0) * 270);
          }
        }
      }
      return maxMs > 0 ? maxMs + 180 : 0;
    },
    [],
  );

  // Online Multiplayer State
  const [onlineRoom, setOnlineRoom] = useState<LudoRoom | null>(null);
  const [openRooms, setOpenRooms] = useState<LudoRoom[]>([]);
  const [joinCode, setJoinCode] = useState('');
  const [botMatchCountdown, setBotMatchCountdown] = useState<number>(configuredWaitSec);
  const [liveCountTick, setLiveCountTick] = useState(0);

  // Sync active Ludo room to localStorage
  useEffect(() => {
    if (onlineRoom) {
      localStorage.setItem('aurelia_ludo_active_room', onlineRoom.roomId);
    } else {
      localStorage.removeItem('aurelia_ludo_active_room');
    }
  }, [onlineRoom]);

  // Auto-rejoin active Ludo room on mount
  useEffect(() => {
    if (onlineRoom || !firebaseUser) return;
    const savedLudoId = localStorage.getItem('aurelia_ludo_active_room');
    if (!savedLudoId) return;

    void (async () => {
      try {
        const snap = await getDoc(doc(db, 'ludoRooms', savedLudoId));
        if (snap.exists()) {
          const fetchedRoom = snap.data() as LudoRoom;
          if (fetchedRoom.playerUids.includes(firebaseUser.uid) && fetchedRoom.status !== 'finished') {
            setOnlineRoom(fetchedRoom);
            pushToast('Rejoined your active table', 'emerald');
            return;
          }
        }
        localStorage.removeItem('aurelia_ludo_active_room');
      } catch {
        localStorage.removeItem('aurelia_ludo_active_room');
      }
    })();
  }, [onlineRoom, firebaseUser, pushToast]);

  const humanColor: LudoColor = 'red';

  const activeTokensToWin: 1 | 4 =
    onlineRoom?.tokensToWin
      ? onlineRoom.tokensToWin === 1
        ? 1
        : 4
      : lobbyTab === 'quick'
        ? 1
        : lobbyTab === 'private'
          ? privateTokensToWin
          : 4;

  const selectedWinPrize = useMemo(
    () => calculateLudoPrize(entryStake, playerCount),
    [entryStake, playerCount],
  );

  // Gentle live online player counter tick for entry fee tables
  useEffect(() => {
    const id = window.setInterval(() => setLiveCountTick((t) => (t + 1) % 60), 4500);
    return () => window.clearInterval(id);
  }, []);

  const tableLiveCounts = useMemo(() => {
    const result = {} as Record<LudoEntryTableFee, number>;
    LUDO_ENTRY_TABLES.forEach((fee, idx) => {
      const realWaiting = openRooms.filter((r) => r.entryFee === fee).reduce((s, r) => s + r.players.length, 0);
      const jitter = Math.round(Math.sin(liveCountTick * 0.65 + idx * 1.9) * (fee >= 100 ? 6 : 14));
      const modeFactor = playerCount === 4 ? 0.72 : 1;
      result[fee] = Math.max(18, Math.round(TABLE_BASE_ONLINE_COUNTS[fee] * modeFactor) + jitter + realWaiting);
    });
    return result;
  }, [liveCountTick, openRooms, playerCount]);

  // Exact square sizing so the classic Ludo King board fills ~96% width on mobile & desktop
  const boardSlotRef = useRef<HTMLDivElement | null>(null);
  const [boardPx, setBoardPx] = useState<number>(340);

  useEffect(() => {
    const slot = boardSlotRef.current;
    if (!slot) return;
    const measure = () => {
      const rect = slot.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const fillW = rect.width < 500 ? rect.width * 0.97 : rect.width * 0.96;
      const fillH = rect.height * 0.985;
      const next = Math.max(220, Math.floor(Math.min(fillW, fillH)));
      setBoardPx(next);
    };
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(slot);
    window.addEventListener('resize', measure, { passive: true });
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  const isMatchActive =
    (matchStarted && !winnerColor) || onlineRoom?.status === 'playing';

  const backGuard = useGameBackGuard(isMatchActive, '/games');

  const activeColors = useMemo(() => {
    if (onlineRoom) {
      return onlineRoom.players.map((p) => p.color);
    }
    if (playerCount === 2) {
      return ['red', 'yellow'] as LudoColor[];
    }
    return getActiveColorsForPlayerCount(4);
  }, [onlineRoom, playerCount]);

  const displayedTokens = onlineRoom ? onlineRoom.tokens : tokens;
  const currentTurnColor: LudoColor = onlineRoom
    ? onlineRoom.players[onlineRoom.currentTurnIndex]?.color || 'red'
    : activeColors[turnIndex % activeColors.length] || 'red';

  const currentOnlinePlayer = onlineRoom
    ? onlineRoom.players[onlineRoom.currentTurnIndex] || null
    : null;

  const currentDiceValue = onlineRoom ? onlineRoom.diceValue || 1 : diceValue;
  const currentDiceRolled = onlineRoom ? onlineRoom.diceRolled : diceRolled;

  const isMyTurnOnline =
    Boolean(onlineRoom) &&
    onlineRoom?.status === 'playing' &&
    !currentOnlinePlayer?.isBot &&
    !currentOnlinePlayer?.forfeited &&
    currentOnlinePlayer?.uid === firebaseUser?.uid;

  const isOnlineBotTurn =
    Boolean(onlineRoom) &&
    onlineRoom?.status === 'playing' &&
    Boolean(currentOnlinePlayer?.isBot) &&
    onlineRoom.hostUid === firebaseUser?.uid;

  const isAiTurn = !onlineRoom && matchStarted && !winnerColor && currentTurnColor !== humanColor;

  const legalIndices = useMemo(() => {
    if (onlineRoom) {
      if (onlineRoom.status !== 'playing' || !isMyTurnOnline || !onlineRoom.diceRolled) {
        return [];
      }
      return getLegalTokenIndices(onlineRoom.tokens, currentTurnColor, onlineRoom.diceValue);
    }
    if (!matchStarted || winnerColor || !diceRolled || isAiTurn) return [];
    return getLegalTokenIndices(tokens, currentTurnColor, diceValue);
  }, [
    currentTurnColor,
    diceRolled,
    diceValue,
    isAiTurn,
    isMyTurnOnline,
    matchStarted,
    onlineRoom,
    tokens,
    winnerColor,
  ]);

  const showTransientReaction = useCallback((reaction: LudoReaction) => {
    setActiveReaction(reaction);
    window.setTimeout(() => {
      setActiveReaction((prev) => (prev?.id === reaction.id ? null : prev));
    }, 3200);
  }, []);

  // Subscribe to active online Firestore room
  useEffect(() => {
    if (!onlineRoom?.roomId) return;
    const unsub = subscribeToLudoRoom(onlineRoom.roomId, (room) => {
      if (!room) {
        setOnlineRoom(null);
        return;
      }
      setOnlineRoom(room);
      if (room.lastMoveNote) setStatusLog(room.lastMoveNote);
      if (room.lastReaction && Date.now() - room.lastReaction.createdAtMs < 6000) {
        showTransientReaction(room.lastReaction);
      }
      if (room.status === 'finished' && room.winnerUid) {
        soundEngine.playWinFanfare();
      }
    });
    return () => unsub();
  }, [onlineRoom?.roomId, showTransientReaction]);

  // Auto-start Public Online Table immediately once all human seats fill
  useEffect(() => {
    if (
      !onlineRoom ||
      onlineRoom.status !== 'waiting' ||
      onlineRoom.gameMode === 'private' ||
      onlineRoom.hostUid !== firebaseUser?.uid ||
      onlineRoom.players.length < onlineRoom.maxPlayers
    ) {
      return;
    }
    void startMultiplayerLudoMatch(onlineRoom).catch(() => {});
  }, [firebaseUser?.uid, onlineRoom]);

  // Smart Matchmaking Auto-Fill behind the scenes for Public Tables (governed by Admin settings/platform)
  useEffect(() => {
    if (
      !onlineRoom ||
      onlineRoom.status !== 'waiting' ||
      onlineRoom.gameMode === 'private' ||
      onlineRoom.hostUid !== firebaseUser?.uid ||
      onlineRoom.players.length >= onlineRoom.maxPlayers ||
      !platformSettings.smartMatchmakingEnabled
    ) {
      setBotMatchCountdown(configuredWaitSec);
      return;
    }

    if (botMatchCountdown <= 0) {
      void fillLudoRoomWithSmartBots(onlineRoom).catch(() => {});
      return;
    }

    const timer = window.setTimeout(() => setBotMatchCountdown((c) => c - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [
    botMatchCountdown,
    configuredWaitSec,
    firebaseUser?.uid,
    onlineRoom,
    platformSettings.smartMatchmakingEnabled,
  ]);

  // Atomically deduct exact table entry fee ONCE when an online room starts playing
  useEffect(() => {
    if (!onlineRoom || onlineRoom.status !== 'playing' || !firebaseUser) return;
    const isSeated = onlineRoom.players.some((p) => p.uid === firebaseUser.uid && !p.isBot);
    if (!isSeated || deductedRoomIdRef.current === onlineRoom.roomId) return;

    deductedRoomIdRef.current = onlineRoom.roomId;
    const fee = Math.max(1, Math.round(onlineRoom.entryFee || 1));
    const prize = calculateLudoPrize(fee, onlineRoom.players.length);
    const modeLabel =
      onlineRoom.gameMode === 'private'
        ? 'Private'
        : onlineRoom.tokensToWin === 1
          ? 'Quick'
          : 'Classic';

    void placeBet(
      'ludo',
      fee,
      onlineRoom.roomId,
      `Ludo 3D ${modeLabel} Online (${onlineRoom.players.length}P · Win ₹${prize})`,
    )
      .then(() => {
        pushToast(`Match live! ₹${fee} entry locked · Win ₹${prize.toLocaleString()}.`, 'emerald');
      })
      .catch((err) => {
        deductedRoomIdRef.current = '';
        pushToast(err instanceof Error ? err.message : 'Unable to lock table entry fee.', 'crimson');
        setOnlineRoom(null);
      });
  }, [firebaseUser, onlineRoom, placeBet, pushToast]);

  // Atomically credit exact winning prize (or record loss) ONCE when an online room finishes
  useEffect(() => {
    if (!onlineRoom || onlineRoom.status !== 'finished' || !firebaseUser) return;
    const isSeated = onlineRoom.players.some((p) => p.uid === firebaseUser.uid && !p.isBot);
    if (!isSeated || settledRoomIdRef.current === onlineRoom.roomId) return;

    settledRoomIdRef.current = onlineRoom.roomId;
    const fee = Math.max(1, Math.round(onlineRoom.entryFee || 1));
    const prize = calculateLudoPrize(fee, onlineRoom.players.length);
    const iWon = onlineRoom.winnerUid === firebaseUser.uid;

    void settleRound({
      game: 'ludo',
      betAmount: fee,
      payout: iWon ? prize : 0,
      outcome: iWon ? 'win' : 'loss',
      summary: iWon
        ? `Won Ludo 3D ₹${fee} table (+₹${prize.toLocaleString()})`
        : `${onlineRoom.winnerName || 'Opponent'} won Ludo 3D ₹${fee} table`,
      roundId: onlineRoom.roomId,
      seedHash: lastDiceAudit?.serverSeedHash || `ludo_room_${onlineRoom.code}`,
    })
      .then(() => {
        if (iWon) {
          pushToast(`Victory! +₹${prize.toLocaleString()} credited to your wallet.`, 'emerald');
        }
      })
      .catch(() => {});
  }, [firebaseUser, lastDiceAudit?.serverSeedHash, onlineRoom, pushToast, settleRound]);

  const refreshOpenRooms = useCallback(async () => {
    if (!firebaseUser) return;
    try {
      const list = await listOpenLudoRooms();
      setOpenRooms(list);
    } catch {
      // ignore
    }
  }, [firebaseUser]);

  useEffect(() => {
    if (firebaseUser && !onlineRoom) {
      void refreshOpenRooms();
    }
  }, [firebaseUser, onlineRoom, refreshOpenRooms]);

  useEffect(() => {
    return () => {
      if (guestMatchTimerRef.current !== null) {
        window.clearTimeout(guestMatchTimerRef.current);
      }
      clearMoveAnimTimers();
    };
  }, [clearMoveAnimTimers]);

  const getNextActiveLocalTurnIndex = useCallback(
    (fromIdx: number, forfeited: LudoColor[]): number => {
      for (let step = 1; step <= activeColors.length; step++) {
        const candidate = (fromIdx + step) % activeColors.length;
        if (!forfeited.includes(activeColors[candidate])) return candidate;
      }
      return fromIdx;
    },
    [activeColors],
  );

  const getNextActiveOnlineTurnIndex = useCallback((room: LudoRoom, fromIdx: number): number => {
    for (let step = 1; step <= room.players.length; step++) {
      const candidate = (fromIdx + step) % room.players.length;
      if (!room.players[candidate]?.forfeited) return candidate;
    }
    return fromIdx;
  }, []);

  const validateSelectedTable = useCallback(
    async (
      fee: number,
      targetPlayers: 2 | 4,
      targetMode: LudoGameMode,
      winTokens: 1 | 4,
    ): Promise<{ ok: boolean; winPrize: number }> => {
      if (!ludoConfig.enabled) {
        pushToast(ludoConfig.maintenanceMessage || 'Ludo is temporarily in maintenance mode.', 'crimson');
        return { ok: false, winPrize: 0 };
      }

      const minEntry = Math.max(1, ludoConfig.minBet || 1);
      if (fee < minEntry || fee > ludoConfig.maxBet) {
        pushToast(`Entry fee must be between ₹${minEntry} and ₹${ludoConfig.maxBet.toLocaleString()}.`, 'gold');
        return { ok: false, winPrize: 0 };
      }

      const afford = canAffordGameEntry(
        { depositBalance, winningBalance, bonusBalance },
        'ludo',
        fee,
      );
      if (!afford.ok) {
        pushToast(afford.reason || `Insufficient wallet balance for ₹${fee} table.`, 'crimson');
        return { ok: false, winPrize: 0 };
      }

      try {
        const resp = await fetch('/api/games/ludo/validate-table', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            entryFee: fee,
            maxPlayers: targetPlayers,
            gameMode: targetMode,
            tokensToWin: winTokens,
            playableBalance: afford.playableForEntry,
          }),
        });
        const data = (await resp.json()) as { ok?: boolean; error?: string; winPrize?: number };
        if (!resp.ok || !data.ok) {
          pushToast(data.error || 'Table validation failed.', 'crimson');
          return { ok: false, winPrize: 0 };
        }
        return { ok: true, winPrize: data.winPrize || calculateLudoPrize(fee, targetPlayers) };
      } catch {
        return { ok: true, winPrize: calculateLudoPrize(fee, targetPlayers) };
      }
    },
    [bonusBalance, depositBalance, ludoConfig.enabled, ludoConfig.maintenanceMessage, ludoConfig.maxBet, ludoConfig.minBet, pushToast, winningBalance],
  );

  const cancelGuestMatchmaking = useCallback(() => {
    if (guestMatchTimerRef.current !== null) {
      window.clearTimeout(guestMatchTimerRef.current);
      guestMatchTimerRef.current = null;
    }
    setGuestMatchmaking(false);
    setJoiningTable(false);
  }, []);

  const handlePlayOnlineTable = async () => {
    if (joiningTable || guestMatchmaking) return;
    soundEngine.playClick();

    const targetMode: 'quick' | 'classic' = lobbyTab === 'quick' ? 'quick' : 'classic';
    const winCount: 1 | 4 = targetMode === 'quick' ? 1 : 4;
    setJoiningTable(true);

    try {
      const check = await validateSelectedTable(entryStake, playerCount, targetMode, winCount);
      if (!check.ok) return;

      // Signed-in user: Real Firestore Online Matchmaking with quiet 12-second fallback
      if (!isGuestMode && firebaseUser && profile) {
        const { room, joinedExisting } = await findOrCreatePublicLudoRoom({
          uid: firebaseUser.uid,
          username: profile.username,
          maxPlayers: playerCount,
          entryFee: entryStake,
          gameMode: targetMode,
          tokensToWin: winCount,
        });
        deductedRoomIdRef.current = '';
        settledRoomIdRef.current = '';
        setOnlineRoom(room);
        setBotMatchCountdown(configuredWaitSec);
        if (joinedExisting) {
          pushToast(`Matched onto ₹${entryStake} table! Launching game…`, 'emerald');
        }
        return;
      }

      // Guest preview user: brief online matchmaking queue -> atomic guest wallet match
      setGuestMatchmaking(true);
      guestMatchTimerRef.current = window.setTimeout(async () => {
        guestMatchTimerRef.current = null;
        const roundId = `ludo_tbl_${Date.now()}`;
        matchRoundIdRef.current = roundId;
        try {
          await placeBet(
            'ludo',
            entryStake,
            roundId,
            `Ludo 3D ${targetMode === 'quick' ? 'Quick' : 'Classic'} (${playerCount}P · Win ₹${check.winPrize})`,
          );
        } catch (err) {
          setGuestMatchmaking(false);
          pushToast(err instanceof Error ? err.message : 'Unable to lock table entry fee.', 'crimson');
          return;
        }
        setGuestMatchmaking(false);
        setTokens(INITIAL_TOKENS());
        setTurnIndex(0);
        setDiceValue(1);
        setDiceRolled(false);
        setDiceRolling(false);
        setConsecutiveSixes(0);
        setMissedTurns(INITIAL_MISSED());
        setForfeitedColors([]);
        setTurnSecondsLeft(TURN_TIMEOUT_SEC);
        setWinnerColor(null);
        setMatchStarted(true);
        setStatusLog(`Your turn (Red) — Tap the dice! Win ₹${check.winPrize.toLocaleString()}`);
      }, 2400);
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Unable to enter online table.', 'crimson');
    } finally {
      setJoiningTable(false);
    }
  };

  // Strictly Server-Authoritative Dice Roll
  const fetchServerFairDice = useCallback(async (): Promise<LudoDiceAudit | null> => {
    try {
      const r = await fetch('/api/games/ludo/roll', { method: 'POST' });
      if (!r.ok) throw new Error('Server dice unavailable');
      const data = await r.json();
      const dice = Number(data.dice);
      if (dice >= 1 && dice <= 6) {
        const audit: LudoDiceAudit = {
          dice,
          rollId: String(data.rollId || `lr_${Date.now()}`),
          serverSeed: String(data.serverSeed || ''),
          serverSeedHash: String(data.serverSeedHash || data.seedHash || ''),
        };
        setLastDiceAudit(audit);
        return audit;
      }
    } catch {
      pushToast('Cannot reach server dice engine. Check your connection and retry.', 'crimson');
    }
    return null;
  }, [pushToast]);

  const executeTokenMove = useCallback(
    async (color: LudoColor, tokenIndex: number, rolledValue: number) => {
      soundEngine.unlock();
      if (onlineRoom) {
        if (!isMyTurnOnline || !onlineRoom.diceRolled || tokenAnimating) return;
        const resp = await fetch('/api/games/ludo/validate-move', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            color,
            tokenIndex,
            dice: rolledValue,
            tokens: onlineRoom.tokens,
            tokensToWin: onlineRoom.tokensToWin || activeTokensToWin,
            entryFee: Math.max(1, onlineRoom.entryFee || 1),
          }),
        });
        if (!resp.ok) {
          pushToast('Move rejected by server validator.', 'crimson');
          return;
        }
        const validated = await resp.json();
        const animMs = estimateMoveAnimMs(onlineRoom.tokens, validated.nextTokens, color);
        if (animMs > 0) {
          setTokenAnimating(true);
          scheduleMoveAnimTimer(() => setTokenAnimating(false), animMs);
        }

        const nextMissed: Record<LudoColor, number> = {
          ...(onlineRoom.missedTurns || INITIAL_MISSED()),
          [color]: 0,
        };
        const nextPlayers = onlineRoom.players.map((p) =>
          p.color === color
            ? {
                ...p,
                missedTurns: 0,
                finishedCount: (validated.nextTokens[color] as number[]).filter((x) => x === 57).length,
              }
            : p,
        );

        const nextTurnIdx = validated.bonusTurn
          ? onlineRoom.currentTurnIndex
          : getNextActiveOnlineTurnIndex(onlineRoom, onlineRoom.currentTurnIndex);

        const actorName = onlineRoom.players[onlineRoom.currentTurnIndex]?.name || color;
        const winTarget = onlineRoom.tokensToWin || activeTokensToWin;
        const note = validated.allFinished
          ? `${actorName} finished ${winTarget === 1 ? '1 token (Quick Win)' : 'all 4 tokens'} and won!`
          : validated.captured
            ? `${actorName} cut ${validated.captured.color}! Bonus roll!`
            : validated.bonusTurn
              ? `${actorName} earned a bonus roll!`
              : `${actorName} moved token #${tokenIndex + 1}.`;

        await commitLudoRoomTurnUpdate(onlineRoom.roomId, {
          tokens: validated.nextTokens,
          players: nextPlayers,
          currentTurnIndex: nextTurnIdx,
          diceRolled: false,
          consecutiveSixes: validated.bonusTurn && rolledValue === 6 ? onlineRoom.consecutiveSixes : 0,
          status: validated.allFinished ? 'finished' : 'playing',
          winnerUid: validated.allFinished ? firebaseUser?.uid || '' : '',
          winnerName: validated.allFinished ? actorName : '',
          turnStartedAtMs: Date.now(),
          missedTurns: nextMissed,
          lastMoveNote: note,
        });

        if (validated.allFinished) {
          scheduleMoveAnimTimer(() => soundEngine.playWinFanfare(), Math.max(0, animMs - 40));
        }
        return;
      }

      // Guest Online Table Move
      if (tokenAnimating) return;
      const res = applyLocalLudoMove(tokens, color, tokenIndex, rolledValue, activeTokensToWin);
      const animMs = estimateMoveAnimMs(tokens, res.nextTokens, color);
      setTokens(res.nextTokens);
      setDiceRolled(false);
      setMissedTurns((prev) => ({ ...prev, [color]: 0 }));
      setTurnSecondsLeft(TURN_TIMEOUT_SEC);
      setTokenAnimating(true);

      const finishLocalMove = () => {
        setTokenAnimating(false);

        if (res.allFinished) {
          setWinnerColor(color);
          soundEngine.playWinFanfare();
          const playerWon = color === humanColor;
          const prize = playerWon ? calculateLudoPrize(entryStake, playerCount) : 0;
          setStatusLog(
            `${CORNER_THEME[color].name} finished ${activeTokensToWin === 1 ? '1 token (Quick Mode)' : 'all 4 tokens'} and won ₹${calculateLudoPrize(entryStake, playerCount).toLocaleString()}!`,
          );

          void settleRound({
            game: 'ludo',
            betAmount: entryStake,
            payout: prize,
            outcome: playerWon ? 'win' : 'loss',
            summary: playerWon
              ? `Won ${playerCount}P Ludo 3D ₹${entryStake} table (+₹${prize.toLocaleString()})`
              : `Opponent won ${playerCount}P Ludo 3D ₹${entryStake} table`,
            roundId: matchRoundIdRef.current || `ludo_${Date.now()}`,
            seedHash: lastDiceAudit?.serverSeedHash || `ludo_tbl_${playerCount}p`,
          }).catch(() => {});
          return;
        }

        if (res.bonusTurn) {
          setStatusLog(
            res.captured
              ? `${CORNER_THEME[color].name} cut ${CORNER_THEME[res.captured.color].name}! Bonus roll!`
              : res.finishedNow
                ? `${CORNER_THEME[color].name} reached Home! Bonus roll!`
                : `${CORNER_THEME[color].name} rolled 6 — Bonus roll!`,
          );
        } else {
          setConsecutiveSixes(0);
          const nextIdx = getNextActiveLocalTurnIndex(turnIndex, forfeitedColors);
          setTurnIndex(nextIdx);
          setStatusLog(`${CORNER_THEME[activeColors[nextIdx]].name}'s turn to roll.`);
        }
      };

      if (animMs > 0) {
        scheduleMoveAnimTimer(finishLocalMove, animMs);
      } else {
        finishLocalMove();
      }
    },
    [
      activeColors,
      activeTokensToWin,
      entryStake,
      estimateMoveAnimMs,
      firebaseUser?.uid,
      forfeitedColors,
      getNextActiveLocalTurnIndex,
      getNextActiveOnlineTurnIndex,
      humanColor,
      isMyTurnOnline,
      lastDiceAudit?.serverSeedHash,
      onlineRoom,
      playerCount,
      pushToast,
      scheduleMoveAnimTimer,
      settleRound,
      tokenAnimating,
      tokens,
      turnIndex,
    ],
  );

  // Ludo King Signature Auto-Move: if human rolled and only 1 distinct legal choice exists, auto-move smoothly!
  useEffect(() => {
    if (!currentDiceRolled || diceRolling || tokenAnimating || legalIndices.length === 0) return;
    const activeTokenPositions = legalIndices.map((idx) => displayedTokens[currentTurnColor][idx]);
    const allSamePos = activeTokenPositions.every((p) => p === activeTokenPositions[0]);
    if (legalIndices.length === 1 || allSamePos) {
      const targetIdx = legalIndices[0];
      const timer = window.setTimeout(() => {
        void executeTokenMove(currentTurnColor, targetIdx, currentDiceValue);
      }, 310);
      return () => window.clearTimeout(timer);
    }
  }, [
    currentDiceRolled,
    currentDiceValue,
    currentTurnColor,
    diceRolling,
    displayedTokens,
    executeTokenMove,
    legalIndices,
    tokenAnimating,
  ]);

  // Server-Side Auto-Move Handler (15s timeout & smart bots)
  const executeServerAutoMove = useCallback(
    async (reason: 'timeout' | 'bot') => {
      if (autoMoveLockRef.current) return;
      autoMoveLockRef.current = true;

      try {
        if (onlineRoom && onlineRoom.status === 'playing') {
          const actor = onlineRoom.players[onlineRoom.currentTurnIndex];
          if (!actor) return;

          const currentMissedMap = onlineRoom.missedTurns || INITIAL_MISSED();
          const nextMissCount =
            reason === 'timeout' ? (currentMissedMap[actor.color] || 0) + 1 : 0;

          if (reason === 'timeout' && nextMissCount >= MAX_MISSED_TURNS) {
            const updatedPlayers = onlineRoom.players.map((p) =>
              p.color === actor.color ? { ...p, forfeited: true, missedTurns: nextMissCount } : p,
            );
            const remaining = updatedPlayers.filter((p) => !p.forfeited);
            const matchEnded = remaining.length <= 1;
            const winner = remaining[0];
            const nextIdx = getNextActiveOnlineTurnIndex(
              { ...onlineRoom, players: updatedPlayers },
              onlineRoom.currentTurnIndex,
            );

            await commitLudoRoomTurnUpdate(onlineRoom.roomId, {
              players: updatedPlayers,
              missedTurns: { ...currentMissedMap, [actor.color]: nextMissCount },
              diceRolled: false,
              consecutiveSixes: 0,
              currentTurnIndex: nextIdx,
              turnStartedAtMs: Date.now(),
              status: matchEnded ? 'finished' : 'playing',
              winnerUid: matchEnded && winner ? winner.uid : '',
              winnerName: matchEnded && winner ? winner.name : '',
              lastMoveNote:
                matchEnded && winner
                  ? `${actor.name} skipped 3 turns. ${winner.name} wins!`
                  : `${actor.name} auto-forfeited (3 skips).`,
            });
            pushToast(`${actor.name} forfeited after 3 missed turns.`, 'crimson');
            return;
          }

          setDiceRolling(true);
          const botRollStartedAt = Date.now();
          soundEngine.playDiceRoll();
          const resp = await fetch('/api/games/ludo/auto-move', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              color: actor.color,
              dice: onlineRoom.diceValue,
              diceRolled: onlineRoom.diceRolled,
              consecutiveSixes: onlineRoom.consecutiveSixes,
              tokens: onlineRoom.tokens,
              tokensToWin: onlineRoom.tokensToWin || activeTokensToWin,
            }),
          });
          setDiceRolling(false);
          if (!resp.ok) return;
          const autoData = (await resp.json()) as AutoMoveServerResponse;
          if (autoData.dice === 6 && !autoData.threeSixes) {
            const accentDelaySec = Math.max(0, (415 - (Date.now() - botRollStartedAt)) / 1000);
            soundEngine.playDiceSixAccent(accentDelaySec);
          }
          if (autoData.serverSeedHash) {
            setLastDiceAudit({
              dice: autoData.dice,
              rollId: `auto_${Date.now()}`,
              serverSeed: '(auto-move server roll)',
              serverSeedHash: autoData.serverSeedHash,
            });
          }

          const animMs =
            autoData.noLegalMoves || autoData.threeSixes
              ? 0
              : estimateMoveAnimMs(onlineRoom.tokens, autoData.nextTokens, actor.color);
          if (animMs > 0) {
            setTokenAnimating(true);
            scheduleMoveAnimTimer(() => setTokenAnimating(false), animMs);
          }

          const nextMissed = { ...currentMissedMap, [actor.color]: nextMissCount };
          const nextPlayers = onlineRoom.players.map((p) =>
            p.color === actor.color
              ? {
                  ...p,
                  missedTurns: nextMissCount,
                  finishedCount: (autoData.nextTokens[actor.color] || []).filter((x) => x === 57).length,
                }
              : p,
          );
          const nextTurnIdx = autoData.bonusTurn
            ? onlineRoom.currentTurnIndex
            : getNextActiveOnlineTurnIndex(onlineRoom, onlineRoom.currentTurnIndex);

          const prefix = reason === 'timeout' ? `[Skip ${nextMissCount}/3] ` : '';
          const note = autoData.allFinished
            ? `${actor.name} won the match!`
            : autoData.threeSixes
              ? `${prefix}${actor.name} rolled three 6s — turn passes.`
              : autoData.noLegalMoves
                ? `${prefix}${actor.name} rolled ${autoData.dice} (no move).`
                : `${prefix}${actor.name} rolled ${autoData.dice} & moved.`;

          await commitLudoRoomTurnUpdate(onlineRoom.roomId, {
            diceValue: autoData.dice,
            diceRolled: false,
            consecutiveSixes: autoData.bonusTurn && autoData.dice === 6 ? onlineRoom.consecutiveSixes + 1 : 0,
            tokens: autoData.nextTokens,
            players: nextPlayers,
            currentTurnIndex: nextTurnIdx,
            turnStartedAtMs: Date.now(),
            missedTurns: nextMissed,
            status: autoData.allFinished ? 'finished' : 'playing',
            winnerUid: autoData.allFinished ? actor.uid : '',
            winnerName: autoData.allFinished ? actor.name : '',
            lastMoveNote: note,
          });
          return;
        }

        // Guest Online Table Server Auto-Move
        if (!matchStarted || winnerColor) return;
        const color = currentTurnColor;
        const nextMissCount = reason === 'timeout' ? (missedTurns[color] || 0) + 1 : 0;

        if (reason === 'timeout' && nextMissCount >= MAX_MISSED_TURNS) {
          const nextForfeited = [...forfeitedColors, color];
          setForfeitedColors(nextForfeited);
          setMissedTurns((prev) => ({ ...prev, [color]: nextMissCount }));
          const remaining = activeColors.filter((c) => !nextForfeited.includes(c));
          if (remaining.length <= 1) {
            const champ = remaining[0] || activeColors[0];
            setWinnerColor(champ);
            setStatusLog(`${CORNER_THEME[color].name} forfeited (3 skips). ${CORNER_THEME[champ].name} wins!`);
            const playerWon = champ === humanColor;
            const prize = playerWon ? calculateLudoPrize(entryStake, playerCount) : 0;
            void settleRound({
              game: 'ludo',
              betAmount: entryStake,
              payout: prize,
              outcome: playerWon ? 'win' : 'loss',
              summary: playerWon ? 'Won Ludo 3D by forfeit' : 'Forfeited Ludo match (3 skips)',
              roundId: matchRoundIdRef.current || `ludo_${Date.now()}`,
              seedHash: `ludo_forfeit_${playerCount}p`,
            }).catch(() => {});
            return;
          }
          const nextIdx = getNextActiveLocalTurnIndex(turnIndex, nextForfeited);
          setTurnIndex(nextIdx);
          setDiceRolled(false);
          setTurnSecondsLeft(TURN_TIMEOUT_SEC);
          setStatusLog(`${CORNER_THEME[color].name} auto-forfeited (3 skips).`);
          return;
        }

        setDiceRolling(true);
        const guestBotRollStartedAt = Date.now();
        soundEngine.playDiceRoll();
        const resp = await fetch('/api/games/ludo/auto-move', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            color,
            dice: diceValue,
            diceRolled,
            consecutiveSixes,
            tokens,
            tokensToWin: activeTokensToWin,
          }),
        });
        setDiceRolling(false);
        if (!resp.ok) return;
        const autoData = (await resp.json()) as AutoMoveServerResponse;
        if (autoData.dice === 6 && !autoData.threeSixes) {
          const accentDelaySec = Math.max(0, (415 - (Date.now() - guestBotRollStartedAt)) / 1000);
          soundEngine.playDiceSixAccent(accentDelaySec);
        }
        if (autoData.serverSeedHash) {
          setLastDiceAudit({
            dice: autoData.dice,
            rollId: `auto_${Date.now()}`,
            serverSeed: '(auto-move server roll)',
            serverSeedHash: autoData.serverSeedHash,
          });
        }

        setDiceValue(autoData.dice);
        setDiceRolled(false);
        setTurnSecondsLeft(TURN_TIMEOUT_SEC);
        if (reason === 'timeout') {
          setMissedTurns((prev) => ({ ...prev, [color]: nextMissCount }));
          pushToast(
            `Time up — Auto-moved for ${CORNER_THEME[color].name} (${nextMissCount}/${MAX_MISSED_TURNS} skips).`,
            'gold',
          );
        }

        const animMs =
          autoData.noLegalMoves || autoData.threeSixes
            ? 0
            : estimateMoveAnimMs(tokens, autoData.nextTokens, color);
        setTokens(autoData.nextTokens);

        if (animMs > 0) {
          setTokenAnimating(true);
          await new Promise<void>((resolve) => {
            scheduleMoveAnimTimer(() => {
              setTokenAnimating(false);
              resolve();
            }, animMs);
          });
        }

        if (autoData.allFinished) {
          setWinnerColor(color);
          soundEngine.playWinFanfare();
          const playerWon = color === humanColor;
          const prize = playerWon ? calculateLudoPrize(entryStake, playerCount) : 0;
          setStatusLog(
            `${CORNER_THEME[color].name} finished ${activeTokensToWin === 1 ? '1 token (Quick Mode)' : 'all 4 tokens'} and wins!`,
          );
          void settleRound({
            game: 'ludo',
            betAmount: entryStake,
            payout: prize,
            outcome: playerWon ? 'win' : 'loss',
            summary: playerWon
              ? `Won ${playerCount}P Ludo 3D ₹${entryStake} table (+₹${prize.toLocaleString()})`
              : `Opponent won ${playerCount}P Ludo 3D ₹${entryStake} table`,
            roundId: matchRoundIdRef.current || `ludo_${Date.now()}`,
            seedHash: autoData.serverSeedHash || `ludo_tbl_${playerCount}p`,
          }).catch(() => {});
          return;
        }

        const label = CORNER_THEME[color].name;
        if (autoData.bonusTurn) {
          setConsecutiveSixes(autoData.dice === 6 ? consecutiveSixes + 1 : 0);
          setStatusLog(`${reason === 'timeout' ? '[Auto] ' : ''}${label} rolled ${autoData.dice} — Bonus roll!`);
        } else {
          setConsecutiveSixes(0);
          const nextIdx = getNextActiveLocalTurnIndex(turnIndex, forfeitedColors);
          setTurnIndex(nextIdx);
          setStatusLog(
            `${reason === 'timeout' ? '[Auto] ' : ''}${label} rolled ${autoData.dice}. ${CORNER_THEME[activeColors[nextIdx]].name}'s turn.`,
          );
        }
      } finally {
        autoMoveLockRef.current = false;
      }
    },
    [
      activeColors,
      activeTokensToWin,
      consecutiveSixes,
      currentTurnColor,
      diceRolled,
      diceValue,
      entryStake,
      estimateMoveAnimMs,
      forfeitedColors,
      getNextActiveLocalTurnIndex,
      getNextActiveOnlineTurnIndex,
      humanColor,
      matchStarted,
      missedTurns,
      onlineRoom,
      playerCount,
      pushToast,
      scheduleMoveAnimTimer,
      settleRound,
      tokens,
      turnIndex,
      winnerColor,
    ],
  );

  // 15-Second Turn Countdown Timer
  useEffect(() => {
    if (!isMatchActive || diceRolling || tokenAnimating) return;

    if (onlineRoom) {
      const turnStart = onlineRoom.turnStartedAtMs || Date.now();
      const updateRemaining = () => {
        const elapsedSec = Math.floor((Date.now() - turnStart) / 1000);
        const rem = Math.max(0, TURN_TIMEOUT_SEC - elapsedSec);
        setTurnSecondsLeft(rem);
        if (
          rem === 0 &&
          !currentOnlinePlayer?.isBot &&
          (isMyTurnOnline || onlineRoom.hostUid === firebaseUser?.uid)
        ) {
          void executeServerAutoMove('timeout');
        }
      };
      updateRemaining();
      const id = window.setInterval(updateRemaining, 500);
      return () => window.clearInterval(id);
    }

    if (isAiTurn) {
      setTurnSecondsLeft(TURN_TIMEOUT_SEC);
      return;
    }

    if (turnSecondsLeft <= 0) {
      void executeServerAutoMove('timeout');
      return;
    }

    const t = window.setTimeout(() => setTurnSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearTimeout(t);
  }, [
    currentOnlinePlayer?.isBot,
    diceRolling,
    executeServerAutoMove,
    firebaseUser?.uid,
    isAiTurn,
    isMatchActive,
    isMyTurnOnline,
    onlineRoom,
    tokenAnimating,
    turnSecondsLeft,
  ]);

  // Trigger Online Matched Opponent Turn (natural 1.5s–4.5s human reaction delay)
  useEffect(() => {
    if (!isOnlineBotTurn || diceRolling || tokenAnimating) return;
    const delay = getNaturalReactionDelayMs();
    const t = window.setTimeout(() => {
      void executeServerAutoMove('bot');
    }, delay);
    return () => window.clearTimeout(t);
  }, [
    diceRolling,
    executeServerAutoMove,
    isOnlineBotTurn,
    onlineRoom?.currentTurnIndex,
    onlineRoom?.turnStartedAtMs,
    tokenAnimating,
  ]);

  // Trigger Guest Matched Opponent Turn (natural 1.5s–4.5s human reaction delay)
  useEffect(() => {
    if (!isAiTurn || diceRolling || tokenAnimating || winnerColor) return;
    const delay = getNaturalReactionDelayMs();
    const t = window.setTimeout(() => {
      void executeServerAutoMove('bot');
    }, delay);
    return () => window.clearTimeout(t);
  }, [diceRolling, executeServerAutoMove, isAiTurn, tokenAnimating, turnIndex, tokens, winnerColor]);

  const handleRollDice = useCallback(async () => {
    if (diceRolling || tokenAnimating) return;
    soundEngine.unlock();
    if (onlineRoom) {
      if (!isMyTurnOnline || onlineRoom.diceRolled) return;
      soundEngine.playDiceRoll();
      setDiceRolling(true);
      const rollRes = await fetchServerFairDice();
      if (!rollRes) {
        setDiceRolling(false);
        return;
      }
      const rolled = rollRes.dice;

      window.setTimeout(async () => {
        setDiceRolling(false);
        if (rolled === 6) {
          soundEngine.playDiceSixAccent();
        }
        const nextMissed = { ...(onlineRoom.missedTurns || INITIAL_MISSED()), [currentTurnColor]: 0 };
        const nextSixes = rolled === 6 ? onlineRoom.consecutiveSixes + 1 : 0;
        if (nextSixes >= 3) {
          const nextIdx = getNextActiveOnlineTurnIndex(onlineRoom, onlineRoom.currentTurnIndex);
          await commitLudoRoomTurnUpdate(onlineRoom.roomId, {
            diceValue: rolled,
            diceRolled: false,
            consecutiveSixes: 0,
            currentTurnIndex: nextIdx,
            turnStartedAtMs: Date.now(),
            missedTurns: nextMissed,
            lastMoveNote: 'Three 6s in a row! Turn passes.',
          });
          return;
        }
        const legal = getLegalTokenIndices(onlineRoom.tokens, currentTurnColor, rolled);
        if (legal.length === 0) {
          const nextIdx = getNextActiveOnlineTurnIndex(onlineRoom, onlineRoom.currentTurnIndex);
          await commitLudoRoomTurnUpdate(onlineRoom.roomId, {
            diceValue: rolled,
            diceRolled: false,
            consecutiveSixes: 0,
            currentTurnIndex: nextIdx,
            turnStartedAtMs: Date.now(),
            missedTurns: nextMissed,
            lastMoveNote: `Rolled ${rolled} — no legal moves.`,
          });
        } else {
          await commitLudoRoomTurnUpdate(onlineRoom.roomId, {
            diceValue: rolled,
            diceRolled: true,
            consecutiveSixes: nextSixes,
            turnStartedAtMs: Date.now(),
            missedTurns: nextMissed,
            lastMoveNote: `Rolled ${rolled}! Tap a glowing token to move.`,
          });
        }
      }, 480);
      return;
    }

    if (!matchStarted || winnerColor || diceRolled) return;
    soundEngine.playDiceRoll();
    setDiceRolling(true);
    const rollRes = await fetchServerFairDice();
    if (!rollRes) {
      setDiceRolling(false);
      return;
    }
    const rolled = rollRes.dice;

    window.setTimeout(() => {
      setDiceRolling(false);
      setDiceValue(rolled);
      if (rolled === 6) {
        soundEngine.playDiceSixAccent();
      }
      setMissedTurns((prev) => ({ ...prev, [currentTurnColor]: 0 }));
      setTurnSecondsLeft(TURN_TIMEOUT_SEC);

      const nextSixes = rolled === 6 ? consecutiveSixes + 1 : 0;
      if (nextSixes >= 3) {
        setConsecutiveSixes(0);
        const nextIdx = getNextActiveLocalTurnIndex(turnIndex, forfeitedColors);
        setTurnIndex(nextIdx);
        setStatusLog(`${CORNER_THEME[currentTurnColor].name} rolled three 6s! Turn passes.`);
        return;
      }
      setConsecutiveSixes(nextSixes);

      const legal = getLegalTokenIndices(tokens, currentTurnColor, rolled);
      if (legal.length === 0) {
        setConsecutiveSixes(0);
        const nextIdx = getNextActiveLocalTurnIndex(turnIndex, forfeitedColors);
        setTurnIndex(nextIdx);
        setStatusLog(
          `${CORNER_THEME[currentTurnColor].name} rolled ${rolled} (no move). ${CORNER_THEME[activeColors[nextIdx]].name}'s turn.`,
        );
      } else {
        setDiceRolled(true);
        setStatusLog(`${CORNER_THEME[currentTurnColor].name} rolled ${rolled} — Choose a token!`);
      }
    }, 480);
  }, [
    activeColors,
    consecutiveSixes,
    currentTurnColor,
    diceRolled,
    diceRolling,
    fetchServerFairDice,
    forfeitedColors,
    getNextActiveLocalTurnIndex,
    getNextActiveOnlineTurnIndex,
    isMyTurnOnline,
    matchStarted,
    onlineRoom,
    tokenAnimating,
    tokens,
    turnIndex,
    winnerColor,
  ]);

  const handleBoardTokenClick = (color: LudoColor, tokenIndex: number) => {
    soundEngine.unlock();
    if (tokenAnimating) return;
    if (color !== currentTurnColor) return;
    if (!legalIndices.includes(tokenIndex)) return;
    void executeTokenMove(color, tokenIndex, currentDiceValue);
  };

  const handleSendReaction = async (preset: { emoji: string; text: string }) => {
    soundEngine.playClick();
    setChatOpen(false);
    const myOnlinePlayer = onlineRoom?.players.find((p) => p.uid === firebaseUser?.uid);
    const senderColor: LudoColor = myOnlinePlayer?.color || humanColor;
    const senderName = myOnlinePlayer?.name || profile?.username || CORNER_THEME[senderColor].name;

    const reaction: LudoReaction = {
      id: `rx_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      color: senderColor,
      senderName: senderName.slice(0, 24),
      emoji: preset.emoji,
      text: preset.text,
      createdAtMs: Date.now(),
    };

    showTransientReaction(reaction);
    if (onlineRoom && onlineRoom.status === 'playing') {
      void sendLudoRoomReaction(onlineRoom.roomId, reaction).catch(() => {});
    }
  };

  // Private Room Actions (Real-Money Validated)
  const handleCreatePrivateRoom = async () => {
    if (joiningTable) return;
    if (isGuestMode || !firebaseUser || !profile) {
      pushToast('Sign in with Google to host or join Private Rooms.', 'gold');
      return;
    }
    setJoiningTable(true);
    try {
      const check = await validateSelectedTable(entryStake, playerCount, 'private', privateTokensToWin);
      if (!check.ok) return;

      const room = await createMultiplayerLudoRoom({
        uid: firebaseUser.uid,
        username: profile.username,
        maxPlayers: playerCount,
        entryFee: entryStake,
        gameMode: 'private',
        tokensToWin: privateTokensToWin,
      });
      deductedRoomIdRef.current = '';
      settledRoomIdRef.current = '';
      setOnlineRoom(room);
      pushToast(`Private Room ${room.code} ready! Share the code with friends.`, 'emerald');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Unable to create private room', 'crimson');
    } finally {
      setJoiningTable(false);
    }
  };

  const handleJoinRoom = async (codeToJoin: string) => {
    if (isGuestMode || !firebaseUser || !profile) {
      pushToast('Sign in with Google to join Private Rooms.', 'gold');
      return;
    }
    try {
      const room = await findAndJoinLudoRoomByCode({
        code: codeToJoin,
        uid: firebaseUser.uid,
        username: profile.username,
        validateEntryFee: (targetRoom) => {
          const afford = canAffordGameEntry(
            { depositBalance, winningBalance, bonusBalance },
            'ludo',
            targetRoom.entryFee,
          );
          if (!afford.ok) {
            throw new Error(
              afford.reason || `You need ₹${targetRoom.entryFee} playable balance for this table.`,
            );
          }
        },
      });
      deductedRoomIdRef.current = '';
      settledRoomIdRef.current = '';
      setOnlineRoom(room);
      pushToast(`Joined room ${room.code} (₹${room.entryFee} table)!`, 'emerald');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Unable to join room', 'crimson');
    }
  };

  const getCornerSeatMeta = (color: LudoColor) => {
    const isSeatActive = activeColors.includes(color);
    const finishedCount = displayedTokens[color].filter((p) => p === 57).length;
    const isTurn = isMatchActive && currentTurnColor === color;

    if (onlineRoom) {
      const p = onlineRoom.players.find((pl) => pl.color === color);
      const isForfeit = Boolean(p?.forfeited);
      const isBot = Boolean(p?.isBot);
      const missedCount = onlineRoom.missedTurns?.[color] || p?.missedTurns || 0;
      const canRoll = isTurn && isMyTurnOnline && !onlineRoom.diceRolled && !diceRolling && !tokenAnimating;
      return {
        isSeatActive: Boolean(p),
        playerName: p?.name || CORNER_THEME[color].name,
        isTurn,
        isBot,
        isForfeit,
        finishedCount,
        missedCount,
        canRoll,
      };
    }

    const isBot = color !== humanColor;
    const seatIdx = Math.max(0, activeColors.indexOf(color));
    const playerName =
      color === humanColor
        ? profile?.username || 'You'
        : MATCHED_OPPONENT_NAMES[seatIdx % MATCHED_OPPONENT_NAMES.length];
    const isForfeit = forfeitedColors.includes(color);
    const missedCount = missedTurns[color] || 0;
    const canRoll = isTurn && !isBot && !diceRolled && !diceRolling && !tokenAnimating;

    return {
      isSeatActive,
      playerName,
      isTurn,
      isBot,
      isForfeit,
      finishedCount,
      missedCount,
      canRoll,
    };
  };

  const redSeat = getCornerSeatMeta('red');
  const greenSeat = getCornerSeatMeta('green');
  const blueSeat = getCornerSeatMeta('blue');
  const yellowSeat = getCornerSeatMeta('yellow');

  const cornerRowWidth = Math.max(boardPx, 320);

  return (
    <div
      className="game-shell-height relative w-full overflow-hidden flex flex-col"
      style={{
        background:
          'radial-gradient(circle at 12% 14%, rgba(255, 23, 43, 0.36) 0%, transparent 38%), radial-gradient(circle at 88% 14%, rgba(0, 200, 83, 0.34) 0%, transparent 38%), radial-gradient(circle at 12% 88%, rgba(0, 149, 255, 0.42) 0%, transparent 40%), radial-gradient(circle at 88% 88%, rgba(255, 214, 0, 0.36) 0%, transparent 38%), radial-gradient(circle at 50% 50%, #2563eb 0%, #1d4ed8 46%, #1e1b4b 100%)',
      }}
    >
      {/* 1. Slim Vibrant Royal Ludo King Top Header */}
      <div className="relative z-30 shrink-0 px-2 sm:px-4 py-1.5 flex items-center justify-between gap-2 border-b-2 border-[#ffe033]/75 bg-gradient-to-r from-[#1e3a8a] via-[#312e81] to-[#1e3a8a] shadow-lg">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={() => {
              soundEngine.playClick();
              backGuard.requestExit();
            }}
            aria-label="Exit Ludo"
            className="w-8 h-8 rounded-lg border border-sky-300/30 bg-[#123c96] hover:bg-[#194cb8] flex items-center justify-center text-white shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <Crown className="w-4 h-4 text-[#ffe033] shrink-0" />
              <h1 className="font-display text-xs sm:text-sm font-black tracking-wide text-[#ffe033] truncate leading-tight">
                LUDO 3D
              </h1>
            </div>
            <p className="text-[10px] text-sky-100/90 truncate max-w-[165px] sm:max-w-[320px]">
              {statusLog}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
          {isMatchActive && (
            <button
              type="button"
              onClick={() => {
                soundEngine.playClick();
                setChatOpen((v) => !v);
              }}
              aria-label="Quick chat emojis"
              className={`w-8 h-8 sm:w-auto sm:px-2.5 rounded-lg border inline-flex items-center justify-center gap-1 text-[11px] font-bold transition-colors ${
                chatOpen
                  ? 'border-[#ffe033] bg-[#ffe033] text-[#1c1002]'
                  : 'border-sky-300/30 bg-[#123c96] text-white hover:bg-[#194cb8]'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Chat</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              soundEngine.playClick();
              setFairOpen(true);
            }}
            aria-label="Provably Fair Dice Info"
            className="w-8 h-8 sm:w-auto sm:px-2.5 rounded-lg border border-emerald-400/45 bg-emerald-900/60 inline-flex items-center justify-center gap-1 text-[11px] font-semibold text-emerald-100 hover:bg-emerald-800/70"
            title="Server-Authoritative Fair Dice Proof"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-300" />
            <span className="hidden sm:inline">Fair</span>
          </button>

          <button
            type="button"
            onClick={() => {
              soundEngine.playClick();
              setCameraPreset((p) => (p === 'topdown' ? 'angled' : 'topdown'));
            }}
            aria-label="Toggle Classic Top / 3D View"
            className="w-8 h-8 sm:w-auto sm:px-2.5 rounded-lg border border-sky-300/30 bg-[#123c96] inline-flex items-center justify-center gap-1 text-[11px] font-semibold text-white hover:bg-[#194cb8]"
            title={cameraPreset === 'topdown' ? 'Switch to 3D View' : 'Switch to Classic Top View'}
          >
            <Camera className="w-3.5 h-3.5 text-[#ffe033]" />
            <span className="hidden sm:inline">{cameraPreset === 'topdown' ? 'Classic' : '3D'}</span>
          </button>

          {isMatchActive && !onlineRoom && (
            <button
              type="button"
              onClick={() => {
                soundEngine.playClick();
                setMatchStarted(false);
                setWinnerColor(null);
              }}
              aria-label="Match Lobby"
              title="Back to Ludo Tables"
              className="w-8 h-8 rounded-lg border border-sky-300/30 bg-[#123c96] inline-flex items-center justify-center text-white hover:bg-[#194cb8]"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              soundEngine.playClick();
              setRulesOpen(true);
            }}
            aria-label="How to Play Ludo"
            title="How to Play & Mode Rules"
            className="w-8 h-8 sm:w-auto sm:px-2.5 rounded-lg border border-[#ffe033]/55 bg-[#ffe033]/15 inline-flex items-center justify-center gap-1 text-[11px] font-bold text-[#ffe033] hover:bg-[#ffe033]/25"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Rules</span>
          </button>

          <GraphicsAudioBar compact />
        </div>
      </div>

      {/* Quick-Chat Emoji Popover */}
      {chatOpen && isMatchActive && (
        <div className="absolute top-12 right-2 sm:right-4 z-40 w-64 sm:w-72 rounded-2xl border-2 border-[#ffe033] bg-[#0a2361] p-2 shadow-2xl">
          <div className="grid grid-cols-2 gap-1.5">
            {QUICK_REACTIONS.map((rx) => (
              <button
                key={rx.text}
                type="button"
                onClick={() => void handleSendReaction(rx)}
                className="flex items-center gap-1.5 px-2.5 py-2 rounded-xl bg-[#153f9c] hover:bg-[#1e53c7] border border-sky-300/20 text-xs font-bold text-white transition-colors text-left"
              >
                <span className="text-base leading-none">{rx.emoji}</span>
                <span className="truncate">{rx.text}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 2. Classic Ludo King Arena: Top 2 Pods + Hero Square Board + Bottom 2 Pods */}
      <div className="relative flex-1 min-h-0 w-full flex flex-col items-center justify-between px-1.5 sm:px-3 py-1 sm:py-2 overflow-hidden">
        {/* Top Row: Red (Top-Left) & Green (Top-Right) */}
        <div
          className="relative z-20 shrink-0 w-full flex items-center justify-between gap-1.5 pb-1"
          style={{ maxWidth: `${cornerRowWidth}px` }}
        >
          <LudoKingCornerPod
            color="red"
            align="left"
            playerName={redSeat.playerName}
            isSeatActive={redSeat.isSeatActive}
            isTurn={redSeat.isTurn}
            isBot={redSeat.isBot}
            isForfeit={redSeat.isForfeit}
            finishedCount={redSeat.finishedCount}
            tokensToWin={activeTokensToWin}
            missedCount={redSeat.missedCount}
            secondsLeft={turnSecondsLeft}
            diceValue={currentDiceValue}
            diceRolling={diceRolling}
            canRoll={redSeat.canRoll}
            onRoll={() => void handleRollDice()}
          />
          <LudoKingCornerPod
            color="green"
            align="right"
            playerName={greenSeat.playerName}
            isSeatActive={greenSeat.isSeatActive}
            isTurn={greenSeat.isTurn}
            isBot={greenSeat.isBot}
            isForfeit={greenSeat.isForfeit}
            finishedCount={greenSeat.finishedCount}
            tokensToWin={activeTokensToWin}
            missedCount={greenSeat.missedCount}
            secondsLeft={turnSecondsLeft}
            diceValue={currentDiceValue}
            diceRolling={diceRolling}
            canRoll={greenSeat.canRoll}
            onRoll={() => void handleRollDice()}
          />
        </div>

        {/* Center Hero Square Ludo King Board */}
        <div
          ref={boardSlotRef}
          className="relative flex-1 min-h-0 w-full flex items-center justify-center"
        >
          <div
            className="relative aspect-square shrink-0 max-w-full max-h-full rounded-xl overflow-hidden shadow-[0_14px_44px_rgba(12,18,58,0.65)] ring-[3px] ring-[#ffd600]"
            style={{ width: `${boardPx}px`, height: `${boardPx}px` }}
          >
            <LudoCanvas
              graphicsQuality={graphicsQuality}
              tokens={displayedTokens}
              activeColors={activeColors}
              currentTurnColor={currentTurnColor}
              legalTokenIndices={legalIndices}
              diceValue={currentDiceValue}
              diceRolling={diceRolling}
              cameraPreset={cameraPreset}
              activeReaction={activeReaction}
              onTokenClick={handleBoardTokenClick}
            />
          </div>
        </div>

        {/* Bottom Row: Blue (Bottom-Left) & Yellow (Bottom-Right) */}
        <div
          className="relative z-20 shrink-0 w-full flex items-center justify-between gap-1.5 pt-1"
          style={{ maxWidth: `${cornerRowWidth}px` }}
        >
          <LudoKingCornerPod
            color="blue"
            align="left"
            playerName={blueSeat.playerName}
            isSeatActive={blueSeat.isSeatActive}
            isTurn={blueSeat.isTurn}
            isBot={blueSeat.isBot}
            isForfeit={blueSeat.isForfeit}
            finishedCount={blueSeat.finishedCount}
            tokensToWin={activeTokensToWin}
            missedCount={blueSeat.missedCount}
            secondsLeft={turnSecondsLeft}
            diceValue={currentDiceValue}
            diceRolling={diceRolling}
            canRoll={blueSeat.canRoll}
            onRoll={() => void handleRollDice()}
          />
          <LudoKingCornerPod
            color="yellow"
            align="right"
            playerName={yellowSeat.playerName}
            isSeatActive={yellowSeat.isSeatActive}
            isTurn={yellowSeat.isTurn}
            isBot={yellowSeat.isBot}
            isForfeit={yellowSeat.isForfeit}
            finishedCount={yellowSeat.finishedCount}
            tokensToWin={activeTokensToWin}
            missedCount={yellowSeat.missedCount}
            secondsLeft={turnSecondsLeft}
            diceValue={currentDiceValue}
            diceRolling={diceRolling}
            canRoll={yellowSeat.canRoll}
            onRoll={() => void handleRollDice()}
          />
        </div>

        {/* Real-Money Online Ludo Lobby (Entry Fee Tables ₹1–₹500 + Quick / Classic / Private Room) */}
        {!isMatchActive && !winnerColor && onlineRoom?.status !== 'finished' && (
          <div className="absolute inset-0 z-30 bg-[#0b1f5e]/78 flex items-center justify-center p-2.5 sm:p-4 overflow-y-auto">
            <div className="rounded-2xl border-2 border-[#ffe033] bg-gradient-to-b from-[#1e40af] via-[#1d4ed8] to-[#1e1b4b] max-w-md w-full max-h-[calc(100%-0.5rem)] overflow-y-auto p-3.5 sm:p-5 space-y-3.5 shadow-[0_22px_60px_rgba(0,0,0,0.68)] my-auto">
              {/* Compact Header */}
              <div className="flex items-center justify-between gap-2 pb-1 border-b border-white/15">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-b from-[#ffe866] to-[#d97706] border border-white/80 shadow shrink-0">
                    <Crown className="w-5 h-5 text-[#7c1d1d]" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="font-display text-lg sm:text-xl font-black tracking-wide text-[#ffe033] leading-tight">
                      LUDO 3D
                    </h2>
                    <div className="text-[11px] font-medium text-sky-100/80 truncate">
                      {activeTokensToWin === 1 ? 'Quick · 1-Token Win' : 'Classic · 4-Token Arena'}
                    </div>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[10px] text-sky-200/75 font-medium">Wallet Balance</div>
                  <div className="font-mono-num tabular-nums text-sm font-black text-[#ffe033]">
                    ₹{balance.toLocaleString()}
                  </div>
                </div>
              </div>

              {!ludoConfig.enabled && (
                <div className="rounded-xl border border-rose-400/50 bg-rose-950/80 px-3 py-2 text-center text-xs text-rose-100 font-semibold">
                  {ludoConfig.maintenanceMessage || 'Ludo is temporarily under maintenance. Check back soon!'}
                </div>
              )}

              {/* Primary 3-Mode Selector: Quick Mode / Classic / Private Room */}
              {!onlineRoom && !guestMatchmaking && (
                <div className="grid grid-cols-3 gap-1.5">
                  {(
                    [
                      {
                        id: 'quick' as LudoGameMode,
                        label: 'Quick Mode',
                        sub: '1-Token Win',
                        Icon: Zap,
                        activeClass: 'from-[#f59e0b] to-[#b45309] border-[#fef08a] text-white',
                      },
                      {
                        id: 'classic' as LudoGameMode,
                        label: 'Classic',
                        sub: '4-Token Win',
                        Icon: Crown,
                        activeClass: 'from-[#ef4444] to-[#b91c1c] border-[#fecaca] text-white',
                      },
                      {
                        id: 'private' as LudoGameMode,
                        label: 'Private Room',
                        sub: 'With Friends',
                        Icon: KeyRound,
                        activeClass: 'from-[#10b981] to-[#047857] border-[#a7f3d0] text-white',
                      },
                    ]
                  ).map(({ id, label, sub, Icon, activeClass }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => {
                        soundEngine.playClick();
                        setLobbyTab(id);
                      }}
                      className={`py-2 px-1.5 rounded-xl border-2 text-xs font-extrabold flex flex-col items-center justify-center gap-0.5 transition-all ${
                        lobbyTab === id
                          ? `bg-gradient-to-b ${activeClass} shadow-lg`
                          : 'bg-[#092057] border-sky-300/20 text-sky-100/80 hover:border-sky-300/50'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5 mb-0.5" />
                      <span className="whitespace-nowrap leading-tight">{label}</span>
                      <span className="text-[9px] font-semibold opacity-85 whitespace-nowrap">
                        {sub}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {/* Active Waiting / Matchmaking Screen */}
              {guestMatchmaking ? (
                <div className="space-y-3.5 py-2">
                  <div className="rounded-xl bg-[#092057] border border-[#ffe033]/50 p-4 text-center space-y-2.5">
                    <Loader2 className="w-8 h-8 text-[#ffe033] animate-spin mx-auto" />
                    <div className="space-y-0.5">
                      <h3 className="font-display text-base font-bold text-white">
                        Finding Online Opponent…
                      </h3>
                      <p className="text-xs text-sky-200/80">
                        {lobbyTab === 'quick' ? 'Quick 1-Token' : 'Classic'} · {playerCount === 2 ? '1v1' : '4P'} · Entry{' '}
                        <span className="font-mono-num text-[#ffe033] font-bold">₹{entryStake}</span> · Win{' '}
                        <span className="font-mono-num text-emerald-300 font-bold">
                          ₹{selectedWinPrize.toLocaleString()}
                        </span>
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={cancelGuestMatchmaking}
                      className="mt-1 px-4 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-semibold text-sky-100"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : onlineRoom ? (
                onlineRoom.gameMode !== 'private' ? (
                  /* Public Real-Money Matchmaking View (quiet 12s background matchmaking) */
                  <div className="space-y-3">
                    <div className="rounded-xl bg-[#092057] border border-[#ffe033]/50 p-4 text-center space-y-2.5">
                      <Loader2 className="w-8 h-8 text-[#ffe033] animate-spin mx-auto" />
                      <div className="space-y-0.5">
                        <h3 className="font-display text-base font-bold text-white">
                          Matching Online Players…
                        </h3>
                        <div className="text-xs text-sky-100/85">
                          {onlineRoom.tokensToWin === 1 ? 'Quick (1-Token)' : 'Classic'} ·{' '}
                          {onlineRoom.maxPlayers === 2 ? '1v1' : '4P'} · Entry{' '}
                          <span className="font-mono-num text-[#ffe033] font-bold">₹{onlineRoom.entryFee}</span> · Win{' '}
                          <span className="font-mono-num text-emerald-300 font-bold">
                            ₹{calculateLudoPrize(onlineRoom.entryFee, onlineRoom.maxPlayers).toLocaleString()}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      {onlineRoom.players.map((p) => (
                        <div
                          key={p.uid}
                          className="flex items-center justify-between px-3 py-2 rounded-xl bg-[#092057] border border-white/15 text-xs"
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className="w-3 h-3 rounded-full border border-white"
                              style={{ backgroundColor: LUDO_COLORS_HEX[p.color].css }}
                            />
                            <span className="font-bold text-white">{p.name}</span>
                          </div>
                          <span className="text-[11px] font-bold text-emerald-300">Seated</span>
                        </div>
                      ))}
                      {Array.from({ length: Math.max(0, onlineRoom.maxPlayers - onlineRoom.players.length) }).map(
                        (_, i) => (
                          <div
                            key={i}
                            className="flex items-center justify-between px-3 py-2 rounded-xl bg-[#092057]/55 border border-dashed border-sky-300/25 text-xs text-sky-200/70"
                          >
                            <span>Searching for opponent…</span>
                            <span className="font-mono-num text-[11px]">
                              {onlineRoom.players.length}/{onlineRoom.maxPlayers}
                            </span>
                          </div>
                        ),
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => setOnlineRoom(null)}
                      className="w-full py-2 rounded-xl border border-white/20 bg-white/5 hover:bg-white/10 text-xs font-bold text-sky-100"
                    >
                      Leave Table (No Fee Deducted)
                    </button>
                  </div>
                ) : (
                  /* Private Room Waiting Lobby (Code + Copy + WhatsApp Share) */
                  <div className="space-y-3">
                    <div className="rounded-xl bg-[#092057] border border-[#ffe033]/50 p-3 space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <div className="text-[11px] font-semibold text-sky-200/80">
                            Private Room · {onlineRoom.tokensToWin === 1 ? 'Quick (1-Token)' : 'Classic'} · ₹{onlineRoom.entryFee} Entry · Win ₹
                            {calculateLudoPrize(onlineRoom.entryFee, onlineRoom.maxPlayers).toLocaleString()}
                          </div>
                          <h3 className="font-mono-num text-2xl text-[#ffe033] font-black tracking-[0.2em]">
                            {onlineRoom.code}
                          </h3>
                        </div>
                        <button
                          type="button"
                          onClick={() => setOnlineRoom(null)}
                          className="text-xs text-sky-200 hover:text-white px-2.5 py-1 rounded-lg bg-white/5"
                        >
                          Leave
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            void navigator.clipboard?.writeText(onlineRoom.code);
                            pushToast(`Room code ${onlineRoom.code} copied!`, 'gold');
                          }}
                          className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-[#ffe033]/60 bg-[#11317a] hover:bg-[#1942a0] text-xs font-bold text-[#ffe033]"
                        >
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy Code</span>
                        </button>
                        <a
                          href={`https://wa.me/?text=${encodeURIComponent(
                            `Join my Aurelia Arena Ludo 3D ₹${onlineRoom.entryFee} Private Room (Win ₹${calculateLudoPrize(onlineRoom.entryFee, onlineRoom.maxPlayers)})! Room Code: ${onlineRoom.code} — Play here: ${typeof window !== 'undefined' ? window.location.origin : ''}/games/ludo`,
                          )}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 border border-emerald-300/60 text-xs font-extrabold text-white"
                        >
                          <Share2 className="w-3.5 h-3.5" />
                          <span>WhatsApp</span>
                        </a>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      {onlineRoom.players.map((p) => (
                        <div
                          key={p.uid}
                          className="flex items-center justify-between px-3 py-2 rounded-xl bg-[#092057] border border-white/15 text-xs"
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className="w-3 h-3 rounded-full border border-white"
                              style={{ backgroundColor: LUDO_COLORS_HEX[p.color].css }}
                            />
                            <span className="font-bold text-white">{p.name}</span>
                            <span className="text-[11px] text-sky-200/75 capitalize">({p.color})</span>
                          </div>
                          <span
                            className={`text-xs font-extrabold ${
                              p.ready ? 'text-emerald-300' : 'text-sky-200/60'
                            }`}
                          >
                            {p.ready ? 'READY' : 'WAITING'}
                          </span>
                        </div>
                      ))}
                    </div>

                    <div className="flex items-center gap-2">
                      {firebaseUser && (
                        <button
                          type="button"
                          onClick={() => void toggleLudoPlayerReady(onlineRoom, firebaseUser.uid)}
                          className="flex-1 py-2.5 rounded-xl border-2 border-sky-300/35 bg-[#092057] hover:bg-[#10307a] text-xs sm:text-sm font-bold text-white"
                        >
                          Toggle Ready
                        </button>
                      )}
                      {firebaseUser?.uid === onlineRoom.hostUid && (
                        <button
                          type="button"
                          disabled={onlineRoom.players.length < 2}
                          onClick={() => void startMultiplayerLudoMatch(onlineRoom)}
                          className="flex-1 py-2.5 rounded-xl bg-gradient-to-b from-[#22c55e] to-[#15803d] border-2 border-[#bbf7d0] text-white text-xs sm:text-sm font-black disabled:opacity-40"
                        >
                          START ({onlineRoom.players.length}/{onlineRoom.maxPlayers})
                        </button>
                      )}
                    </div>
                  </div>
                )
              ) : (
                /* Main Online Entry Fee Tables Setup (Quick / Classic / Private Room) */
                <div className="space-y-3">
                  {/* Private Room Join Code + Win Rule (only when Private Room tab is selected) */}
                  {lobbyTab === 'private' && (
                    <div className="space-y-2.5">
                      {isGuestMode ? (
                        <div className="p-3 rounded-xl bg-[#092057] border border-sky-300/30 text-xs text-sky-100 text-center">
                          Sign in with Google from the top bar to host or join Private Rooms.
                        </div>
                      ) : (
                        <>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={joinCode}
                              onChange={(e) => setJoinCode(e.target.value.toUpperCase().slice(0, 6))}
                              placeholder="ENTER 6-CHAR CODE"
                              className="flex-1 bg-[#081b4b] border-2 border-sky-300/30 rounded-xl px-3 py-2 font-mono-num text-xs sm:text-sm uppercase tracking-widest text-white focus:outline-none focus:border-[#ffe033]"
                            />
                            <button
                              type="button"
                              onClick={() => void handleJoinRoom(joinCode)}
                              className="px-4 py-2 rounded-xl bg-[#ffe033] text-[#1c1002] text-xs sm:text-sm font-black whitespace-nowrap"
                            >
                              JOIN
                            </button>
                          </div>

                          <div className="grid grid-cols-2 gap-1.5">
                            {(
                              [
                                { val: 1 as const, lbl: 'Quick (1-Token)' },
                                { val: 4 as const, lbl: 'Classic (4-Token)' },
                              ]
                            ).map((opt) => (
                              <button
                                key={opt.val}
                                type="button"
                                onClick={() => {
                                  soundEngine.playClick();
                                  setPrivateTokensToWin(opt.val);
                                }}
                                className={`py-1.5 rounded-lg text-[11px] font-extrabold border-2 transition-colors ${
                                  privateTokensToWin === opt.val
                                    ? 'bg-[#ffe033] text-[#1c1002] border-white'
                                    : 'bg-[#092057] text-sky-100 border-sky-300/20'
                                }`}
                              >
                                {opt.lbl}
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {/* Players Selector: 1v1 (1.8x) vs 4P (3.6x) */}
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-sky-100">Players</span>
                    <div className="grid grid-cols-2 gap-1.5 w-52">
                      {(
                        [
                          { n: 2 as const, label: '1v1', mult: '1.8x' },
                          { n: 4 as const, label: '4P', mult: '3.6x' },
                        ]
                      ).map(({ n, label, mult }) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => {
                            soundEngine.playClick();
                            setPlayerCount(n);
                          }}
                          className={`py-1.5 px-2.5 rounded-lg text-xs font-black border-2 inline-flex items-center justify-center gap-1.5 transition-all whitespace-nowrap ${
                            playerCount === n
                              ? 'bg-[#ffe033] text-[#1c1002] border-white shadow'
                              : 'bg-[#092057] text-sky-100 border-sky-300/25 hover:border-sky-300/50'
                          }`}
                        >
                          <span>{label}</span>
                          <span className="font-mono-num text-[10px] opacity-80">{mult}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Real-Money Entry Fee Tables Grid (₹1, ₹5, ₹10, ₹50, ₹100, ₹500) */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-sky-100">Select Entry Fee Table</span>
                      <span className="text-[11px] text-sky-200/75 font-mono-num">
                        {playerCount === 2 ? '1v1 · 1.8x Prize' : '4P · 3.6x Prize'}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {LUDO_ENTRY_TABLES.map((fee) => {
                        const prize = calculateLudoPrize(fee, playerCount);
                        const selected = entryStake === fee;
                        const afford = canAffordGameEntry(
                          { depositBalance, winningBalance, bonusBalance },
                          'ludo',
                          fee,
                        );
                        const livePlayers = tableLiveCounts[fee];

                        return (
                          <button
                            key={fee}
                            type="button"
                            onClick={() => {
                              soundEngine.playClick();
                              setEntryStake(fee);
                              if (!afford.ok && afford.reason) {
                                pushToast(afford.reason, 'gold');
                              }
                            }}
                            className={`relative rounded-xl border-2 p-2.5 text-left transition-all flex flex-col justify-between gap-1.5 ${
                              selected
                                ? 'bg-gradient-to-b from-[#1d4ed8] to-[#0f2b75] border-[#ffe033] shadow-[0_0_16px_rgba(255,224,51,0.4)]'
                                : afford.ok
                                  ? 'bg-[#092057] border-sky-300/20 hover:border-sky-300/50'
                                  : 'bg-[#092057]/65 border-white/10 opacity-75 hover:opacity-95'
                            }`}
                          >
                            <div className="flex items-baseline justify-between gap-1">
                              <span className="font-mono-num tabular-nums text-base sm:text-lg font-black text-white leading-none">
                                ₹{fee}
                              </span>
                              {!afford.ok ? (
                                <span className="text-[10px] font-bold text-amber-300 whitespace-nowrap">
                                  Low Bal
                                </span>
                              ) : (
                                <span className="text-[10px] font-semibold text-sky-200/70 whitespace-nowrap">
                                  Entry
                                </span>
                              )}
                            </div>

                            <div className="font-mono-num tabular-nums text-xs font-extrabold text-emerald-300 leading-tight">
                              Win ₹{prize.toLocaleString()}
                            </div>

                            <div className="flex items-center gap-1 text-[10px] text-sky-200/75 font-medium pt-0.5 border-t border-white/10">
                              <Users className="w-3 h-3 text-sky-300/80 shrink-0" aria-hidden="true" />
                              <span className="font-mono-num tabular-nums">{livePlayers}</span>
                              <span>online</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Primary Green CTA Button showing Exact Table Entry & Win Prize */}
                  <button
                    type="button"
                    disabled={!ludoConfig.enabled || joiningTable || (lobbyTab === 'private' && isGuestMode)}
                    onClick={() =>
                      void (lobbyTab === 'private' ? handleCreatePrivateRoom() : handlePlayOnlineTable())
                    }
                    className="w-full py-3 px-4 rounded-xl bg-gradient-to-b from-[#22c55e] to-[#15803d] hover:from-[#4ade80] hover:to-[#16a34a] border-2 border-[#bbf7d0] text-white text-sm sm:text-base font-black tracking-wide uppercase shadow-[0_5px_0_#14532d,0_10px_22px_rgba(0,0,0,0.45)] active:translate-y-0.5 transition-all disabled:opacity-45 whitespace-nowrap"
                  >
                    {joiningTable
                      ? 'MATCHING…'
                      : lobbyTab === 'private'
                        ? `CREATE ₹${entryStake} ROOM • WIN ₹${selectedWinPrize.toLocaleString()}`
                        : `PLAY ₹${entryStake} • WIN ₹${selectedWinPrize.toLocaleString()}`}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Classic Ludo Victory Crown Celebration Modal */}
        {(winnerColor || onlineRoom?.status === 'finished') && (
          <div className="absolute inset-0 z-40 bg-[#051238]/85 flex items-center justify-center p-4">
            <div className="rounded-2xl border-2 border-[#ffe033] bg-gradient-to-b from-[#1748b0] to-[#091f57] max-w-sm w-full p-6 text-center space-y-4 shadow-2xl">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-b from-[#ffe866] to-[#d97706] border-2 border-white shadow-xl mx-auto">
                <Trophy className="w-9 h-9 text-[#7c1d1d]" />
              </div>
              <h2 className="font-display text-2xl text-[#ffe033] font-black tracking-wide">
                LUDO 3D WINNER!
              </h2>
              <p className="text-sm text-sky-100 font-medium">
                {onlineRoom?.status === 'finished'
                  ? `${onlineRoom.winnerName} won the ₹${onlineRoom.entryFee} table (Prize: ₹${calculateLudoPrize(onlineRoom.entryFee, onlineRoom.players.length).toLocaleString()})!`
                  : `${CORNER_THEME[winnerColor!].name} won the ₹${entryStake} table (Prize: ₹${calculateLudoPrize(entryStake, playerCount).toLocaleString()})!`}
              </p>
              <button
                type="button"
                onClick={() => {
                  deductedRoomIdRef.current = '';
                  settledRoomIdRef.current = '';
                  setWinnerColor(null);
                  setMatchStarted(false);
                  setOnlineRoom(null);
                }}
                className="w-full py-3 rounded-xl bg-gradient-to-b from-[#22c55e] to-[#15803d] border-2 border-[#bbf7d0] text-white text-sm font-black uppercase tracking-wider"
              >
                PLAY AGAIN
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Provably Fair Dice Proof Modal */}
      {fairOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4"
          onClick={() => setFairOpen(false)}
        >
          <div
            className="rounded-2xl border-2 border-[#ffe033]/50 bg-[#0a215c] max-w-md w-full p-5 space-y-3.5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg text-[#ffe033] font-bold flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
                <span>Server-Authoritative Fair Dice</span>
              </h3>
              <button
                type="button"
                onClick={() => setFairOpen(false)}
                aria-label="Close fair dice dialog"
                className="text-sky-200 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-sky-100/85 leading-relaxed">
              Every Ludo dice roll and timeout auto-move is computed strictly on the server using
              cryptographic SHA-256 randomness. Clients cannot manipulate or predict rolls.
            </p>
            {lastDiceAudit ? (
              <div className="rounded-xl bg-[#06143b] border border-sky-300/20 p-3 space-y-1.5 text-[11px] font-mono">
                <div className="flex justify-between">
                  <span className="text-sky-200/75">Last Rolled Face:</span>
                  <span className="text-[#ffe033] font-bold">{lastDiceAudit.dice}</span>
                </div>
                <div className="text-sky-200/75">
                  SHA-256 Hash:{' '}
                  <span className="text-emerald-300 break-all">{lastDiceAudit.serverSeedHash}</span>
                </div>
                {lastDiceAudit.serverSeed && (
                  <div className="text-sky-200/75">
                    Server Seed:{' '}
                    <span className="text-white break-all">{lastDiceAudit.serverSeed}</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-xl bg-[#06143b] border border-sky-300/20 p-3 text-xs text-sky-200/75">
                Roll the dice in a match to inspect the live cryptographic seed & SHA-256 hash.
              </div>
            )}
            <div className="text-right">
              <button
                type="button"
                onClick={() => setFairOpen(false)}
                className="px-4 py-2 rounded-lg bg-[#ffe033] text-[#1c1002] text-xs font-black"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <GameRulesModal open={rulesOpen} game="ludo" onClose={() => setRulesOpen(false)} />

      <GameExitModal
        open={backGuard.showExitConfirm}
        title="Leave Active Ludo Match?"
        description="A Ludo 3D match is currently underway. Leaving now will forfeit your active seat."
        onCancel={backGuard.cancelExit}
        onConfirm={backGuard.confirmExit}
      />
    </div>
  );
}
