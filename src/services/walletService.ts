import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { ADMIN_BOOTSTRAP_EMAIL } from '../config/assets';
import type {
  DailyMissionDef,
  GameHistoryRecord,
  GameId,
  GraphicsQuality,
  PromoCodeDoc,
  PublicProfile,
  ReferralRecord,
  ReportRecord,
  UpiRequestRecord,
  UserPrivate,
  VipTierInfo,
  WalletBucket,
  WalletTransaction,
} from '../types';
import {
  db,
  ensureFirestoreOnline,
  handleFirestoreError,
  isFirestoreOfflineError,
  OperationType,
} from './firebase';

export const UPI_WITHDRAWAL_COOLDOWN_MS = 5 * 60 * 1000;
export const UPI_DAILY_WITHDRAWAL_LIMIT = 50000;
export const REFERRAL_REWARD_COINS = 2000;
export const DEFAULT_WELCOME_BONUS = 51;
export const MAX_BONUS_CONTRIBUTION_RATIO = 0.2;
export const STARTER_BONUS_ONLY_MAX_STAKE = 10;
export const PRE_DEPOSIT_WIN_CONVERSION_CAP = 200;
export const MIN_FIRST_DEPOSIT_UNLOCK = 100;
export const DEFAULT_DEPOSIT_UPI_ID = 'aureliaarena@ibl';
export const DEFAULT_DEPOSIT_UPI_NAME = 'Aurelia Arena';
const LEGACY_PLACEHOLDER_UPI_ID = 'aurelia.arena@upi';
const SAFE_UPI_HANDLE_REGEX = /^[a-zA-Z0-9._\-]{2,64}@[a-zA-Z]{2,32}$/;

export function resolveActiveDepositUpi(rawUpiId?: string | null): string {
  const cleaned = String(rawUpiId || '').trim();
  if (!cleaned || cleaned.toLowerCase() === LEGACY_PLACEHOLDER_UPI_ID) {
    return DEFAULT_DEPOSIT_UPI_ID;
  }
  return SAFE_UPI_HANDLE_REGEX.test(cleaned) ? cleaned : DEFAULT_DEPOSIT_UPI_ID;
}

export function buildUpiPaymentIntentUrl(
  upiId?: string | null,
  merchantName?: string | null,
  amount?: number | string,
): string {
  const safeHandle = resolveActiveDepositUpi(upiId);
  const safeName =
    String(merchantName || DEFAULT_DEPOSIT_UPI_NAME)
      .trim()
      .slice(0, 48) || DEFAULT_DEPOSIT_UPI_NAME;
  const parsedAmt = Math.round(Number(amount));
  const safeAmt = Number.isFinite(parsedAmt) && parsedAmt >= 1 && parsedAmt <= 100000 ? parsedAmt : 1000;
  return `upi://pay?pa=${safeHandle}&pn=${encodeURIComponent(safeName)}&am=${safeAmt}&cu=INR`;
}

function makeSafeId(prefix: string): string {
  const rand =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 14)
      : Math.random().toString(36).slice(2, 14);
  return `${prefix}_${Date.now()}_${rand}`;
}

export function getTodayUtcDateKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export function getYesterdayUtcDateKey(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export function generateReferralCodeFromUid(uid: string): string {
  const clean = uid.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  const suffix = (clean.slice(0, 6) + 'AUR9X7').slice(0, 6);
  return `AUR${suffix}`;
}

export function extractWalletBuckets(pub: Pick<PublicProfile, 'balance' | 'depositBalance' | 'winningBalance' | 'bonusBalance'>): {
  depositBalance: number;
  winningBalance: number;
  bonusBalance: number;
  totalBalance: number;
} {
  const total = Math.max(0, Math.round(pub.balance || 0));
  if (
    typeof pub.depositBalance === 'number' &&
    typeof pub.winningBalance === 'number' &&
    typeof pub.bonusBalance === 'number' &&
    Math.round(pub.depositBalance + pub.winningBalance + pub.bonusBalance) === total
  ) {
    return {
      depositBalance: Math.max(0, Math.round(pub.depositBalance)),
      winningBalance: Math.max(0, Math.round(pub.winningBalance)),
      bonusBalance: Math.max(0, Math.round(pub.bonusBalance)),
      totalBalance: total,
    };
  }
  return {
    depositBalance: total,
    winningBalance: 0,
    bonusBalance: 0,
    totalBalance: total,
  };
}

export function getBonusCapRatioForGame(_game?: GameId): number {
  return MAX_BONUS_CONTRIBUTION_RATIO;
}

export function calculateBetSplit(
  buckets: { depositBalance: number; winningBalance: number; bonusBalance: number },
  amount: number,
): {
  ok: boolean;
  fromDeposit: number;
  fromWinning: number;
  fromBonus: number;
  playableForEntry: number;
  starterBonusOnly: boolean;
  reason?: string;
} {
  const stake = Math.floor(amount);
  if (!Number.isFinite(stake) || stake < 1) {
    return {
      ok: false,
      fromDeposit: 0,
      fromWinning: 0,
      fromBonus: 0,
      playableForEntry: 0,
      starterBonusOnly: false,
      reason: 'Entry fee must be at least ₹1.',
    };
  }

  const deposit = Math.max(0, Math.floor(Number(buckets.depositBalance) || 0));
  const winning = Math.max(0, Math.floor(Number(buckets.winningBalance) || 0));
  const bonus = Math.max(0, Math.floor(Number(buckets.bonusBalance) || 0));
  const cashAvailable = deposit + winning;
  const total = cashAvailable + bonus;

  // Starter-table exception: when cash balance is ₹0, allow bets/tables up to ₹10 using Bonus Balance only
  if (cashAvailable === 0 && stake <= STARTER_BONUS_ONLY_MAX_STAKE) {
    if (bonus < stake) {
      return {
        ok: false,
        fromDeposit: 0,
        fromWinning: 0,
        fromBonus: 0,
        playableForEntry: bonus,
        starterBonusOnly: true,
        reason: `Insufficient wallet balance for ₹${stake} table. Add funds in Wallet or choose a lower table.`,
      };
    }
    return {
      ok: true,
      fromDeposit: 0,
      fromWinning: 0,
      fromBonus: stake,
      playableForEntry: bonus,
      starterBonusOnly: true,
    };
  }

  // Standard 20% max bonus contribution rule across all 4 games
  const maxBonus = Math.floor(stake * MAX_BONUS_CONTRIBUTION_RATIO);
  const fromBonus = Math.min(bonus, maxBonus);
  const playableForEntry = cashAvailable + fromBonus;

  if (total < stake) {
    return {
      ok: false,
      fromDeposit: 0,
      fromWinning: 0,
      fromBonus: 0,
      playableForEntry,
      starterBonusOnly: false,
      reason: `Insufficient wallet balance for ₹${stake} entry. Add funds in Wallet or choose a lower table.`,
    };
  }

  const remaining = stake - fromBonus;
  if (cashAvailable < remaining) {
    return {
      ok: false,
      fromDeposit: 0,
      fromWinning: 0,
      fromBonus: 0,
      playableForEntry,
      starterBonusOnly: false,
      reason: `Bonus Balance covers up to 20% of each bet (100% on starter tables up to ₹${STARTER_BONUS_ONLY_MAX_STAKE} when cash is ₹0). Deposit funds in Wallet or pick a ≤₹${STARTER_BONUS_ONLY_MAX_STAKE} table.`,
    };
  }

  const fromDeposit = Math.min(deposit, remaining);
  const fromWinning = remaining - fromDeposit;
  return {
    ok: true,
    fromDeposit,
    fromWinning,
    fromBonus,
    playableForEntry,
    starterBonusOnly: false,
  };
}

export function anonymizePlayerName(name: string): string {
  const trimmed = (name || 'Player').trim();
  if (trimmed.length <= 2) return `${trimmed[0] || 'P'}***`;
  if (trimmed.length <= 4) return `${trimmed.slice(0, 2)}***`;
  return `${trimmed.slice(0, 2)}***${trimmed.slice(-2)}`;
}

export const VIP_TIERS: VipTierInfo[] = [
  {
    id: 'bronze',
    label: 'Bronze',
    minWagered: 0,
    nextMinWagered: 25000,
    nextLabel: 'Silver',
    cashbackPct: 2,
    priorityWithdraw: false,
    priorityLabel: 'Standard UPI Queue',
    accentHex: '#cd7f32',
    perks: ['2% Daily Cashback & Rakeback', 'Daily Spin Wheel Access', 'Standard UPI Payout Processing'],
  },
  {
    id: 'silver',
    label: 'Silver',
    minWagered: 25000,
    nextMinWagered: 100000,
    nextLabel: 'Gold',
    cashbackPct: 4,
    priorityWithdraw: false,
    priorityLabel: 'Fast-Track UPI Review',
    accentHex: '#cbd5e1',
    perks: ['4% Daily Cashback & Rakeback', 'Fast-Track UPI Review', 'Exclusive Promo Code Drops'],
  },
  {
    id: 'gold',
    label: 'Gold',
    minWagered: 100000,
    nextMinWagered: 350000,
    nextLabel: 'Diamond',
    cashbackPct: 7,
    priorityWithdraw: true,
    priorityLabel: 'Priority UPI Withdrawals',
    accentHex: '#f59e0b',
    perks: ['7% Daily Cashback & Rakeback', 'Priority Withdrawal Badge', 'Higher Bonus Promo Caps'],
  },
  {
    id: 'diamond',
    label: 'Diamond',
    minWagered: 350000,
    nextMinWagered: null,
    nextLabel: null,
    cashbackPct: 12,
    priorityWithdraw: true,
    priorityLabel: 'Instant VIP Priority Payouts',
    accentHex: '#38bdf8',
    perks: ['12% Daily Cashback & Rakeback', 'Instant VIP Priority Withdrawals', 'Dedicated WhatsApp VIP Concierge'],
  },
];

export function computeEffectiveWagered(
  pub?: Pick<PublicProfile, 'totalWagered' | 'totalWon' | 'gamesPlayed'> | null,
): number {
  if (!pub) return 0;
  if (typeof pub.totalWagered === 'number' && Number.isFinite(pub.totalWagered) && pub.totalWagered >= 0) {
    return Math.round(pub.totalWagered);
  }
  return Math.max(0, Math.round((pub.totalWon || 0) * 0.6 + (pub.gamesPlayed || 0) * 200));
}

export function computeVipProgress(
  pub?: Pick<PublicProfile, 'totalWagered' | 'totalWon' | 'gamesPlayed'> | null,
): {
  tier: VipTierInfo;
  wagered: number;
  progressPct: number;
  remainingToNext: number;
} {
  const wagered = computeEffectiveWagered(pub);
  let tier = VIP_TIERS[0];
  for (const t of VIP_TIERS) {
    if (wagered >= t.minWagered) tier = t;
  }
  if (!tier.nextMinWagered) {
    return { tier, wagered, progressPct: 100, remainingToNext: 0 };
  }
  const span = Math.max(1, tier.nextMinWagered - tier.minWagered);
  const progressPct = Math.min(100, Math.max(0, Math.round(((wagered - tier.minWagered) / span) * 100)));
  const remainingToNext = Math.max(0, tier.nextMinWagered - wagered);
  return { tier, wagered, progressPct, remainingToNext };
}

export const DAILY_STREAK_REWARDS = [500, 750, 1000, 1500, 2000, 3000, 5000];

export const DAILY_MISSIONS: DailyMissionDef[] = [
  {
    id: 'mission_first_ludo',
    title: 'Play One Ludo Match',
    description: 'Complete at least 1 match on the 3D Ludo tabletop.',
    cadence: 'daily',
    reward: 1000,
    badgeId: 'ludo_pioneer',
    checkCompleted: (s) => s.ludoPlayed >= 1,
  },
  {
    id: 'mission_three_games',
    title: 'Complete Three Games',
    description: 'Finish 3 rounds across Dragon Tiger, Ludo, or Aviator.',
    cadence: 'daily',
    reward: 1500,
    badgeId: 'arena_regular',
    checkCompleted: (s) => s.gamesPlayed >= 3,
  },
  {
    id: 'mission_first_win',
    title: 'Claim a Victory',
    description: 'Win at least 1 round or cash out profitably in Aviator.',
    cadence: 'daily',
    reward: 1200,
    badgeId: 'first_victory',
    checkCompleted: (s) => s.wins >= 1,
  },
  {
    id: 'mission_streak_3',
    title: '3-Day Consecutive Login',
    description: 'Claim your daily check-in reward for 3 consecutive days.',
    cadence: 'weekly',
    reward: 3500,
    badgeId: 'loyal_strategist',
    checkCompleted: (s) => s.streakDays >= 3,
  },
  {
    id: 'mission_high_roller',
    title: 'Ten Rounds Veteran',
    description: 'Complete 10 total rounds across Aurelia Arena.',
    cadence: 'weekly',
    reward: 4000,
    badgeId: 'grand_veteran',
    checkCompleted: (s) => s.gamesPlayed >= 10,
  },
];

export const BADGE_CATALOG: Record<string, { label: string; detail: string }> = {
  founder_welcome: { label: 'Arena Initiate', detail: 'Claimed first-time Welcome Signup Bonus' },
  ludo_pioneer: { label: 'Tabletop Strategist', detail: 'Completed a 3D Ludo match' },
  arena_regular: { label: 'Triple Threat', detail: 'Completed 3 games across the platform' },
  first_victory: { label: 'First Triumph', detail: 'Won a verified game round' },
  loyal_strategist: { label: 'Three-Day Vanguard', detail: 'Reached a 3-day daily reward streak' },
  grand_veteran: { label: 'Grandmaster', detail: 'Completed 10+ total games' },
};

function sanitizeUsername(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9 _.-]/g, '').trim().slice(0, 28);
  return cleaned.length >= 2 ? cleaned : `Player_${Math.floor(1000 + Math.random() * 9000)}`;
}

async function ensureReferralCodeMapping(uid: string, username: string, code: string): Promise<void> {
  try {
    const codeRef = doc(db, 'referralCodes', code);
    const snap = await getDoc(codeRef);
    if (!snap.exists()) {
      await setDoc(codeRef, {
        code,
        uid,
        username: username.slice(0, 32),
        createdAt: serverTimestamp(),
      });
    }
  } catch {
    // non-fatal if already exists for another user or offline
  }
}

export async function ensureUserProvisioned(params: {
  uid: string;
  email: string;
  displayName: string;
  defaultGraphics: GraphicsQuality;
}): Promise<{ profile: PublicProfile; privateUser: UserPrivate; welcomeBonusGranted: number }> {
  const pubRef = doc(db, 'publicProfiles', params.uid);
  const privRef = doc(db, 'users', params.uid);
  const platformSettingsRef = doc(db, 'settings', 'platform');
  const defaultCode = generateReferralCodeFromUid(params.uid);

  const isRootAdmin = (params.email || '').trim().toLowerCase() === ADMIN_BOOTSTRAP_EMAIL.toLowerCase();

  const attemptProvision = async (): Promise<{
    profile: PublicProfile;
    privateUser: UserPrivate;
    welcomeBonusGranted: number;
  }> => {
    const [pubSnap, privSnap] = await Promise.all([getDoc(pubRef), getDoc(privRef)]);
    if (pubSnap.exists() && privSnap.exists()) {
      const existingPub = pubSnap.data() as PublicProfile;
      const existingPriv = privSnap.data() as UserPrivate;

      // Sync root admin role to users/{uid} without ever modifying publicProfiles wallet balances
      if (isRootAdmin && existingPriv.role !== 'admin') {
        try {
          await updateDoc(privRef, {
            role: 'admin',
            updatedAt: serverTimestamp(),
          });
          existingPriv.role = 'admin';
        } catch {
          // ignore non-critical role sync error
        }
      }

      // Backfill referralCode for existing accounts seamlessly
      if (!existingPriv.referralCode) {
        try {
          await updateDoc(privRef, {
            referralCode: defaultCode,
            updatedAt: serverTimestamp(),
          });
          await ensureReferralCodeMapping(params.uid, existingPub.username, defaultCode);
          existingPriv.referralCode = defaultCode;
        } catch {
          // ignore non-critical backfill error
        }
      } else {
        void ensureReferralCodeMapping(params.uid, existingPub.username, existingPriv.referralCode);
      }

      return {
        profile: existingPub,
        privateUser: existingPriv,
        welcomeBonusGranted: 0,
      };
    }

    // Read admin-configured welcomeBonusAmount from Firestore settings/platform (default ₹51)
    let welcomeBonus = DEFAULT_WELCOME_BONUS;
    try {
      const settingsSnap = await getDoc(platformSettingsRef);
      if (settingsSnap.exists()) {
        const rawBonus = Number(settingsSnap.data()?.welcomeBonusAmount);
        if (Number.isFinite(rawBonus) && rawBonus >= 0 && rawBonus <= 500) {
          welcomeBonus = Math.round(rawBonus);
        }
      }
    } catch {
      welcomeBonus = DEFAULT_WELCOME_BONUS;
    }

    const username = sanitizeUsername(params.displayName || params.email.split('@')[0] || 'Player');
    const avatarSeed = username.slice(0, 16);

    const newProfile: PublicProfile = {
      uid: params.uid,
      username,
      avatarSeed,
      balance: welcomeBonus,
      depositBalance: 0,
      winningBalance: 0,
      bonusBalance: welcomeBonus,
      totalDeposited: 0,
      totalWagered: 0,
      gamesPlayed: 0,
      wins: 0,
      totalWon: 0,
      winRate: 0,
      weeklyScore: welcomeBonus,
      monthlyScore: welcomeBonus,
      streakDays: 0,
      badges: ['founder_welcome'],
      status: 'active',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    const newPrivate: UserPrivate = {
      uid: params.uid,
      email: params.email.slice(0, 160),
      displayName: (params.displayName || username).slice(0, 64),
      username,
      role: isRootAdmin ? 'admin' : 'player',
      welcomeBonusClaimed: true,
      lastDailyClaimDate: '',
      lastSpinDate: '',
      streakDays: 0,
      claimedMissions: [],
      referralCode: defaultCode,
      referredBy: '',
      referralRewardUnlocked: false,
      lastWithdrawalAtMs: 0,
      dailyWithdrawnDate: '',
      dailyWithdrawnTotal: 0,
      graphicsQuality: params.defaultGraphics,
      soundEnabled: true,
      musicEnabled: false,
      volume: 0.65,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    let welcomeBonusGranted = 0;

    if (!pubSnap.exists()) {
      await setDoc(pubRef, newProfile);
      welcomeBonusGranted = welcomeBonus;
      if (welcomeBonus > 0) {
        const txId = makeSafeId('tx_welcome');
        await setDoc(doc(db, 'walletTransactions', txId), {
          txId,
          userId: params.uid,
          type: 'signup_bonus',
          game: 'system',
          bucket: 'bonus',
          amount: welcomeBonus,
          balanceBefore: 0,
          balanceAfter: welcomeBonus,
          description: `Welcome Signup Bonus: ₹${welcomeBonus} credited to Bonus Wallet`,
          roundId: 'welcome_bonus',
          createdAt: serverTimestamp(),
        });
      }
    }

    if (!privSnap.exists()) {
      await setDoc(privRef, newPrivate);
    } else if (isRootAdmin && (privSnap.data() as UserPrivate).role !== 'admin') {
      try {
        await updateDoc(privRef, {
          role: 'admin',
          updatedAt: serverTimestamp(),
        });
      } catch {
        // ignore non-critical sync error
      }
    }

    await ensureReferralCodeMapping(params.uid, username, defaultCode);

    const [freshPub, freshPriv] = await Promise.all([getDoc(pubRef), getDoc(privRef)]);
    return {
      profile: (freshPub.exists() ? freshPub.data() : newProfile) as PublicProfile,
      privateUser: (freshPriv.exists() ? freshPriv.data() : newPrivate) as UserPrivate,
      welcomeBonusGranted,
    };
  };

  const retryDelaysMs = [900, 1800, 3200];
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= retryDelaysMs.length; attempt++) {
    try {
      return await attemptProvision();
    } catch (error) {
      lastError = error;
      if (!isFirestoreOfflineError(error) || attempt === retryDelaysMs.length) {
        break;
      }
      await ensureFirestoreOnline();
      await new Promise((resolve) => window.setTimeout(resolve, retryDelaysMs[attempt]));
    }
  }

  handleFirestoreError(lastError, OperationType.WRITE, `publicProfiles/${params.uid}`);
}

export function canAffordGameEntry(
  buckets: { depositBalance: number; winningBalance: number; bonusBalance: number },
  _game: GameId,
  entryFee: number,
): { ok: boolean; playableForEntry: number; reason?: string } {
  const split = calculateBetSplit(buckets, entryFee);
  return {
    ok: split.ok,
    playableForEntry: split.playableForEntry,
    reason: split.reason,
  };
}

export async function placeAtomicBet(params: {
  uid: string;
  game: GameId;
  amount: number;
  roundId: string;
  description: string;
}): Promise<number> {
  const bet = Math.floor(params.amount);
  if (bet <= 0) throw new Error('Wager must be positive');

  const pubRef = doc(db, 'publicProfiles', params.uid);
  const txId = makeSafeId('tx_bet');
  const txRef = doc(db, 'walletTransactions', txId);

  try {
    return await runTransaction(db, async (tx) => {
      const snap = await tx.get(pubRef);
      if (!snap.exists()) throw new Error('Player profile not found');
      const data = snap.data() as PublicProfile;
      if (data.status !== 'active') throw new Error('Account is suspended');

      const buckets = extractWalletBuckets(data);
      const split = calculateBetSplit(buckets, bet);
      if (!split.ok) {
        throw new Error(split.reason || 'Insufficient wallet balance');
      }

      const { fromDeposit, fromWinning, fromBonus } = split;
      const nextDeposit = buckets.depositBalance - fromDeposit;
      const nextWinning = buckets.winningBalance - fromWinning;
      const nextBonus = buckets.bonusBalance - fromBonus;
      const nextBalance = nextDeposit + nextWinning + nextBonus;

      const usedCount = (fromBonus > 0 ? 1 : 0) + (fromDeposit > 0 ? 1 : 0) + (fromWinning > 0 ? 1 : 0);
      const bucket: WalletBucket =
        usedCount > 1 ? 'mixed' : fromDeposit > 0 ? 'deposit' : fromWinning > 0 ? 'winning' : 'bonus';

      const nextTotalWagered = Math.min(1000000000, (data.totalWagered || 0) + bet);

      tx.update(pubRef, {
        balance: nextBalance,
        depositBalance: nextDeposit,
        winningBalance: nextWinning,
        bonusBalance: nextBonus,
        totalWagered: nextTotalWagered,
        updatedAt: serverTimestamp(),
      });
      tx.set(txRef, {
        txId,
        userId: params.uid,
        type: 'bet',
        game: params.game,
        bucket,
        amount: -bet,
        balanceBefore: buckets.totalBalance,
        balanceAfter: nextBalance,
        description: params.description.slice(0, 190),
        roundId: params.roundId.slice(0, 120),
        createdAt: serverTimestamp(),
      });
      return nextBalance;
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes('Insufficient') ||
        error.message.includes('suspended') ||
        error.message.includes('Bonus Balance'))
    ) {
      throw error;
    }
    handleFirestoreError(error, OperationType.WRITE, `publicProfiles/${params.uid}`);
  }
}

export async function settleAtomicGameRound(params: {
  uid: string;
  username: string;
  game: GameId;
  betAmount: number;
  payout: number;
  outcome: GameHistoryRecord['outcome'];
  summary: string;
  roundId: string;
  seedHash: string;
}): Promise<number> {
  const payout = Math.max(0, Math.round(params.payout));
  const betAmount = Math.max(0, Math.round(params.betAmount));
  const netProfit = payout - betAmount;
  const isWin =
    params.outcome === 'win' ||
    params.outcome === 'cashout' ||
    (params.outcome === 'tie' && payout > betAmount);

  const pubRef = doc(db, 'publicProfiles', params.uid);
  const privRef = doc(db, 'users', params.uid);
  const referralRef = doc(db, 'referrals', `ref_${params.uid}`);
  const historyId = makeSafeId('hist');
  const historyRef = doc(db, 'gameHistory', historyId);

  try {
    return await runTransaction(db, async (tx) => {
      // Perform all reads before any writes inside transaction
      const [pubSnap, privSnap] = await Promise.all([tx.get(pubRef), tx.get(privRef)]);
      if (!pubSnap.exists()) throw new Error('Player profile not found');

      const priv = privSnap.exists() ? (privSnap.data() as UserPrivate) : null;
      const shouldCheckReferral = Boolean(priv && priv.referredBy && !priv.referralRewardUnlocked);
      const refSnap = shouldCheckReferral ? await tx.get(referralRef) : null;

      const data = pubSnap.data() as PublicProfile;
      const buckets = extractWalletBuckets(data);

      const isTieRefund = params.outcome === 'tie' && payout === betAmount;
      const maxAdd = Math.max(0, 100000000 - buckets.totalBalance);
      const credited = Math.min(payout, maxAdd);

      // Protection 3: Pre-deposit Bonus Win Conversion Cap (₹200 max withdrawable winnings until first ₹100+ deposit)
      const hasCompletedFirstDeposit = (data.totalDeposited || 0) >= MIN_FIRST_DEPOSIT_UNLOCK;
      const isAdmin = priv?.role === 'admin';
      const applyPreDepositCap = !isAdmin && !hasCompletedFirstDeposit;

      const nextDeposit = buckets.depositBalance + (isTieRefund ? credited : 0);
      let nextWinning = buckets.winningBalance + (isTieRefund ? 0 : credited);
      let preDepositWinCapHit = false;

      if (!isTieRefund && applyPreDepositCap && credited > 0) {
        const cappedWinning = Math.max(
          buckets.winningBalance,
          Math.min(PRE_DEPOSIT_WIN_CONVERSION_CAP, nextWinning),
        );
        if (cappedWinning < nextWinning) {
          preDepositWinCapHit = true;
          nextWinning = cappedWinning;
        }
      }

      const actualCredited = isTieRefund
        ? credited
        : Math.max(0, nextWinning - buckets.winningBalance);
      const nextBonus = buckets.bonusBalance;
      const balanceAfter = nextDeposit + nextWinning + nextBonus;

      const nextGames = data.gamesPlayed + 1;
      const nextWins = data.wins + (isWin ? 1 : 0);
      const nextWinRate = Math.round((nextWins / nextGames) * 1000) / 10;
      const nextTotalWon = data.totalWon + actualCredited;
      const scoreGain = Math.max(0, actualCredited);
      const safeUsername = sanitizeUsername(params.username || data.username || 'Player');
      const baseSummary = (params.summary || 'Completed game round').slice(0, 185);
      const safeSummary = preDepositWinCapHit
        ? `${baseSummary} (₹${PRE_DEPOSIT_WIN_CONVERSION_CAP} pre-deposit win cap)`.slice(0, 230)
        : baseSummary;

      tx.update(pubRef, {
        balance: balanceAfter,
        depositBalance: nextDeposit,
        winningBalance: nextWinning,
        bonusBalance: nextBonus,
        gamesPlayed: nextGames,
        wins: nextWins,
        totalWon: nextTotalWon,
        winRate: nextWinRate,
        weeklyScore: data.weeklyScore + scoreGain,
        monthlyScore: data.monthlyScore + scoreGain,
        updatedAt: serverTimestamp(),
      });

      if (actualCredited > 0) {
        const txId = makeSafeId('tx_win');
        tx.set(doc(db, 'walletTransactions', txId), {
          txId,
          userId: params.uid,
          type: isTieRefund ? 'refund' : 'win',
          game: params.game,
          bucket: isTieRefund ? 'deposit' : 'winning',
          amount: actualCredited,
          balanceBefore: buckets.totalBalance,
          balanceAfter,
          description: safeSummary.slice(0, 190),
          roundId: (params.roundId || 'round').slice(0, 120),
          createdAt: serverTimestamp(),
        });
      }

      tx.set(historyRef, {
        historyId,
        userId: params.uid,
        username: safeUsername,
        game: params.game,
        betAmount,
        payout,
        netProfit,
        outcome: params.outcome,
        summary: safeSummary,
        seedHash: (params.seedHash || '').slice(0, 120),
        isPublic: true,
        createdAt: serverTimestamp(),
      });

      // Unlock pending referral reward strictly upon completing first real game
      if (priv && refSnap && refSnap.exists()) {
        const refData = refSnap.data() as ReferralRecord;
        if (priv.referredBy && !priv.referralRewardUnlocked && refData.status === 'pending') {
          tx.update(privRef, {
            referralRewardUnlocked: true,
            updatedAt: serverTimestamp(),
          });
          tx.update(referralRef, {
            status: 'unlocked',
            updatedAt: serverTimestamp(),
          });
        }
      }

      return balanceAfter;
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `publicProfiles/${params.uid}`);
  }
}

export async function claimDailyLoginReward(uid: string): Promise<{ reward: number; streakDays: number; nextBalance: number }> {
  const pubRef = doc(db, 'publicProfiles', uid);
  const privRef = doc(db, 'users', uid);
  const today = getTodayUtcDateKey();
  const yesterday = getYesterdayUtcDateKey();

  try {
    return await runTransaction(db, async (tx) => {
      const [pubSnap, privSnap] = await Promise.all([tx.get(pubRef), tx.get(privRef)]);
      if (!pubSnap.exists() || !privSnap.exists()) throw new Error('Account not initialized');
      const pub = pubSnap.data() as PublicProfile;
      const priv = privSnap.data() as UserPrivate;

      if (priv.lastDailyClaimDate === today) {
        throw new Error('Daily reward already claimed today');
      }

      const buckets = extractWalletBuckets(pub);
      const nextStreak = priv.lastDailyClaimDate === yesterday ? priv.streakDays + 1 : 1;
      const reward = DAILY_STREAK_REWARDS[(nextStreak - 1) % DAILY_STREAK_REWARDS.length];
      const granted = Math.min(reward, Math.max(0, 100000000 - buckets.totalBalance));
      const nextBonus = buckets.bonusBalance + granted;
      const nextBalance = buckets.depositBalance + buckets.winningBalance + nextBonus;
      const txId = makeSafeId('tx_daily');

      tx.update(privRef, {
        lastDailyClaimDate: today,
        streakDays: nextStreak,
        updatedAt: serverTimestamp(),
      });
      tx.update(pubRef, {
        balance: nextBalance,
        depositBalance: buckets.depositBalance,
        winningBalance: buckets.winningBalance,
        bonusBalance: nextBonus,
        streakDays: nextStreak,
        weeklyScore: pub.weeklyScore + granted,
        monthlyScore: pub.monthlyScore + granted,
        updatedAt: serverTimestamp(),
      });
      tx.set(doc(db, 'walletTransactions', txId), {
        txId,
        userId: uid,
        type: 'daily_reward',
        game: 'system',
        bucket: 'bonus',
        amount: granted,
        balanceBefore: buckets.totalBalance,
        balanceAfter: nextBalance,
        description: `Day ${nextStreak} login streak reward (Bonus Balance)`,
        roundId: `daily_${today}`,
        createdAt: serverTimestamp(),
      });

      return { reward: granted, streakDays: nextStreak, nextBalance };
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('already claimed')) throw error;
    handleFirestoreError(error, OperationType.WRITE, `users/${uid}`);
  }
}

export async function claimDailySpinReward(
  uid: string,
  spinResult: { spinId: string; reward: number; label: string },
): Promise<{ reward: number; nextBalance: number }> {
  const pubRef = doc(db, 'publicProfiles', uid);
  const privRef = doc(db, 'users', uid);
  const today = getTodayUtcDateKey();

  try {
    return await runTransaction(db, async (tx) => {
      const [pubSnap, privSnap] = await Promise.all([tx.get(pubRef), tx.get(privRef)]);
      if (!pubSnap.exists() || !privSnap.exists()) throw new Error('Account not initialized');
      const pub = pubSnap.data() as PublicProfile;
      const priv = privSnap.data() as UserPrivate;

      if (priv.lastSpinDate === today) {
        throw new Error('Daily Spin Wheel already used today. Come back tomorrow!');
      }

      const buckets = extractWalletBuckets(pub);
      const reward = Math.max(0, Math.min(5000, Math.round(spinResult.reward)));
      const granted = Math.min(reward, Math.max(0, 100000000 - buckets.totalBalance));
      const nextBonus = buckets.bonusBalance + granted;
      const nextBalance = buckets.depositBalance + buckets.winningBalance + nextBonus;
      const txId = makeSafeId('tx_spin');

      tx.update(privRef, {
        lastSpinDate: today,
        updatedAt: serverTimestamp(),
      });
      tx.update(pubRef, {
        balance: nextBalance,
        depositBalance: buckets.depositBalance,
        winningBalance: buckets.winningBalance,
        bonusBalance: nextBonus,
        weeklyScore: pub.weeklyScore + granted,
        monthlyScore: pub.monthlyScore + granted,
        updatedAt: serverTimestamp(),
      });
      tx.set(doc(db, 'walletTransactions', txId), {
        txId,
        userId: uid,
        type: 'spin_reward',
        game: 'system',
        bucket: 'bonus',
        amount: granted,
        balanceBefore: buckets.totalBalance,
        balanceAfter: nextBalance,
        description: `Daily Spin Wheel prize: +${granted.toLocaleString()} Bonus Coins`,
        roundId: spinResult.spinId.slice(0, 120),
        createdAt: serverTimestamp(),
      });

      return { reward: granted, nextBalance };
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('already used')) throw error;
    handleFirestoreError(error, OperationType.WRITE, `users/${uid}`);
  }
}

export async function claimMissionReward(
  uid: string,
  mission: DailyMissionDef,
): Promise<{ reward: number; nextBalance: number }> {
  const pubRef = doc(db, 'publicProfiles', uid);
  const privRef = doc(db, 'users', uid);

  try {
    return await runTransaction(db, async (tx) => {
      const [pubSnap, privSnap] = await Promise.all([tx.get(pubRef), tx.get(privRef)]);
      if (!pubSnap.exists() || !privSnap.exists()) throw new Error('Account not initialized');
      const pub = pubSnap.data() as PublicProfile;
      const priv = privSnap.data() as UserPrivate;

      if (priv.claimedMissions.includes(mission.id)) {
        throw new Error('Mission reward already claimed');
      }

      const buckets = extractWalletBuckets(pub);
      const nextClaimed = [...priv.claimedMissions, mission.id].slice(0, 40);
      const nextBadges =
        mission.badgeId && !pub.badges.includes(mission.badgeId)
          ? [...pub.badges, mission.badgeId].slice(0, 20)
          : pub.badges;
      const granted = Math.min(mission.reward, Math.max(0, 100000000 - buckets.totalBalance));
      const nextBonus = buckets.bonusBalance + granted;
      const nextBalance = buckets.depositBalance + buckets.winningBalance + nextBonus;
      const txId = makeSafeId('tx_mission');

      tx.update(privRef, {
        claimedMissions: nextClaimed,
        updatedAt: serverTimestamp(),
      });
      tx.update(pubRef, {
        balance: nextBalance,
        depositBalance: buckets.depositBalance,
        winningBalance: buckets.winningBalance,
        bonusBalance: nextBonus,
        badges: nextBadges,
        weeklyScore: pub.weeklyScore + granted,
        monthlyScore: pub.monthlyScore + granted,
        updatedAt: serverTimestamp(),
      });
      tx.set(doc(db, 'walletTransactions', txId), {
        txId,
        userId: uid,
        type: 'mission_reward',
        game: 'system',
        bucket: 'bonus',
        amount: granted,
        balanceBefore: buckets.totalBalance,
        balanceAfter: nextBalance,
        description: `Mission completed: ${mission.title} (Bonus Balance)`,
        roundId: mission.id,
        createdAt: serverTimestamp(),
      });

      return { reward: granted, nextBalance };
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('already claimed')) throw error;
    handleFirestoreError(error, OperationType.WRITE, `users/${uid}`);
  }
}

export async function claimLowBalanceRefill(uid: string): Promise<number> {
  const pubRef = doc(db, 'publicProfiles', uid);
  try {
    return await runTransaction(db, async (tx) => {
      const snap = await tx.get(pubRef);
      if (!snap.exists()) throw new Error('Profile not found');
      const pub = snap.data() as PublicProfile;
      const buckets = extractWalletBuckets(pub);
      if (buckets.totalBalance >= 1000) {
        throw new Error('Free refill is available when total balance is below 1,000 coins');
      }
      const grant = 2500;
      const nextDeposit = buckets.depositBalance + grant;
      const nextBalance = nextDeposit + buckets.winningBalance + buckets.bonusBalance;
      const txId = makeSafeId('tx_refill');
      tx.update(pubRef, {
        balance: nextBalance,
        depositBalance: nextDeposit,
        winningBalance: buckets.winningBalance,
        bonusBalance: buckets.bonusBalance,
        updatedAt: serverTimestamp(),
      });
      tx.set(doc(db, 'walletTransactions', txId), {
        txId,
        userId: uid,
        type: 'free_refill',
        game: 'system',
        bucket: 'deposit',
        amount: grant,
        balanceBefore: buckets.totalBalance,
        balanceAfter: nextBalance,
        description: 'Free playable coin refill (+2,500)',
        roundId: `refill_${Date.now()}`,
        createdAt: serverTimestamp(),
      });
      return nextBalance;
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('below 1,000')) throw error;
    handleFirestoreError(error, OperationType.WRITE, `publicProfiles/${uid}`);
  }
}

export async function applyReferralCode(
  uid: string,
  username: string,
  rawCode: string,
): Promise<{ referrerUsername: string; code: string }> {
  const cleanCode = rawCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (cleanCode.length < 4 || cleanCode.length > 24) {
    throw new Error('Enter a valid referral code (4–24 letters/numbers).');
  }

  const codeRef = doc(db, 'referralCodes', cleanCode);
  const codeSnap = await getDoc(codeRef);
  if (!codeSnap.exists()) {
    throw new Error('Referral code not found. Check the code and try again.');
  }

  const codeData = codeSnap.data() as { code: string; uid: string; username: string };
  if (codeData.uid === uid) {
    throw new Error('You cannot apply your own referral code.');
  }

  const privRef = doc(db, 'users', uid);
  const referralId = `ref_${uid}`;
  const referralRef = doc(db, 'referrals', referralId);

  try {
    await runTransaction(db, async (tx) => {
      const [privSnap, existingRefSnap] = await Promise.all([tx.get(privRef), tx.get(referralRef)]);
      if (!privSnap.exists()) throw new Error('Account not initialized.');
      const priv = privSnap.data() as UserPrivate;
      if (priv.referredBy || existingRefSnap.exists()) {
        throw new Error('A referral code is already linked to your account.');
      }

      tx.update(privRef, {
        referredBy: codeData.uid,
        referralRewardUnlocked: false,
        updatedAt: serverTimestamp(),
      });
      tx.set(referralRef, {
        referralId,
        referrerUid: codeData.uid,
        referredUid: uid,
        referredUsername: username.slice(0, 32),
        code: cleanCode,
        rewardAmount: REFERRAL_REWARD_COINS,
        status: 'pending',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });

    return { referrerUsername: codeData.username, code: cleanCode };
  } catch (error) {
    if (error instanceof Error && (error.message.includes('already linked') || error.message.includes('not found'))) {
      throw error;
    }
    handleFirestoreError(error, OperationType.WRITE, `referrals/${referralId}`);
  }
}

export async function fetchUserReferrals(uid: string): Promise<ReferralRecord[]> {
  try {
    const q = query(collection(db, 'referrals'), where('referrerUid', '==', uid), limit(50));
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => d.data() as ReferralRecord)
      .sort((a, b) => getTimeMs(b.createdAt) - getTimeMs(a.createdAt));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'referrals');
  }
}

export async function claimUnlockedReferralReward(
  uid: string,
  referralId: string,
): Promise<{ reward: number; nextBalance: number }> {
  const pubRef = doc(db, 'publicProfiles', uid);
  const referralRef = doc(db, 'referrals', referralId);

  try {
    return await runTransaction(db, async (tx) => {
      const [pubSnap, refSnap] = await Promise.all([tx.get(pubRef), tx.get(referralRef)]);
      if (!pubSnap.exists() || !refSnap.exists()) throw new Error('Referral record not found');
      const pub = pubSnap.data() as PublicProfile;
      const refData = refSnap.data() as ReferralRecord;

      if (refData.referrerUid !== uid) throw new Error('Not authorized to claim this referral');
      if (refData.status === 'pending') {
        throw new Error('Referral reward unlocks automatically after your friend finishes their first game.');
      }
      if (refData.status === 'claimed') {
        throw new Error('Referral reward already claimed.');
      }

      const buckets = extractWalletBuckets(pub);
      const granted = Math.min(refData.rewardAmount, Math.max(0, 100000000 - buckets.totalBalance));
      const nextBonus = buckets.bonusBalance + granted;
      const nextBalance = buckets.depositBalance + buckets.winningBalance + nextBonus;
      const txId = makeSafeId('tx_ref');

      tx.update(referralRef, {
        status: 'claimed',
        updatedAt: serverTimestamp(),
      });
      tx.update(pubRef, {
        balance: nextBalance,
        depositBalance: buckets.depositBalance,
        winningBalance: buckets.winningBalance,
        bonusBalance: nextBonus,
        weeklyScore: pub.weeklyScore + granted,
        monthlyScore: pub.monthlyScore + granted,
        updatedAt: serverTimestamp(),
      });
      tx.set(doc(db, 'walletTransactions', txId), {
        txId,
        userId: uid,
        type: 'referral_reward',
        game: 'system',
        bucket: 'bonus',
        amount: granted,
        balanceBefore: buckets.totalBalance,
        balanceAfter: nextBalance,
        description: `Referral bonus unlocked by ${refData.referredUsername}`,
        roundId: referralId,
        createdAt: serverTimestamp(),
      });

      return { reward: granted, nextBalance };
    });
  } catch (error) {
    if (error instanceof Error && (error.message.includes('already claimed') || error.message.includes('unlocks'))) {
      throw error;
    }
    handleFirestoreError(error, OperationType.WRITE, `referrals/${referralId}`);
  }
}

export async function submitUpiDepositRequest(params: {
  uid: string;
  username: string;
  amount: number;
  upiId?: string;
  senderUpiId?: string;
  utr: string;
}): Promise<UpiRequestRecord> {
  const optionalSenderUpi = (params.senderUpiId ?? params.upiId ?? '').trim();
  const resp = await fetch('/api/wallet/validate-upi-request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: params.uid,
      type: 'deposit',
      amount: params.amount,
      upiId: optionalSenderUpi,
      senderUpiId: optionalSenderUpi,
      utr: params.utr,
    }),
  });
  const check = (await resp.json()) as {
    ok?: boolean;
    error?: string;
    normalizedUpiId?: string;
    normalizedUtr?: string;
    amount?: number;
  };
  if (!resp.ok || !check.ok || !check.normalizedUtr || !check.amount) {
    throw new Error(check.error || 'UPI deposit validation failed.');
  }

  const resolvedUpiId = check.normalizedUpiId || 'N/A';
  const requestId = makeSafeId('upi_dep');
  const utrRef = doc(db, 'upiUtrs', check.normalizedUtr);
  const reqRef = doc(db, 'upiRequests', requestId);

  const record: UpiRequestRecord = {
    requestId,
    userId: params.uid,
    username: params.username.slice(0, 32),
    type: 'deposit',
    amount: check.amount,
    upiId: resolvedUpiId,
    utr: check.normalizedUtr,
    status: 'pending',
    payoutRef: '',
    adminNote: '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    await runTransaction(db, async (tx) => {
      const utrSnap = await tx.get(utrRef);
      if (utrSnap.exists()) {
        throw new Error('Duplicate UTR detected. This 12-digit UTR has already been submitted.');
      }
      tx.set(utrRef, {
        utr: check.normalizedUtr,
        userId: params.uid,
        requestId,
        createdAt: serverTimestamp(),
      });
      tx.set(reqRef, record);
    });
    return record;
  } catch (error) {
    if (error instanceof Error && error.message.includes('Duplicate UTR')) throw error;
    handleFirestoreError(error, OperationType.WRITE, `upiRequests/${requestId}`);
  }
}

export async function submitUpiWithdrawalRequest(params: {
  uid: string;
  username: string;
  amount: number;
  upiId: string;
  totalDeposited?: number;
}): Promise<{ request: UpiRequestRecord; nextBalance: number }> {
  const pubRef = doc(db, 'publicProfiles', params.uid);
  const privRef = doc(db, 'users', params.uid);
  const platformSettingsRef = doc(db, 'settings', 'platform');

  // Resolve latest approved totalDeposited before server validation
  let knownTotalDeposited = Math.max(0, Math.round(params.totalDeposited || 0));
  try {
    const preSnap = await getDoc(pubRef);
    if (preSnap.exists()) {
      knownTotalDeposited = Math.max(0, Math.round((preSnap.data() as PublicProfile).totalDeposited || 0));
    }
  } catch {
    // Fall back to caller-supplied value; transaction below will re-verify atomically
  }

  const resp = await fetch('/api/wallet/validate-upi-request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: params.uid,
      type: 'withdrawal',
      amount: params.amount,
      upiId: params.upiId,
      utr: '',
      totalDeposited: knownTotalDeposited,
    }),
  });
  const check = (await resp.json()) as {
    ok?: boolean;
    error?: string;
    normalizedUpiId?: string;
    amount?: number;
    serverTimeMs?: number;
  };
  if (!resp.ok || !check.ok || !check.normalizedUpiId || !check.amount) {
    throw new Error(check.error || 'UPI withdrawal validation failed.');
  }

  const requestId = makeSafeId('upi_wd');
  const txId = makeSafeId('tx_wd');
  const reqRef = doc(db, 'upiRequests', requestId);
  const today = getTodayUtcDateKey();
  const nowMs = check.serverTimeMs || Date.now();

  const record: UpiRequestRecord = {
    requestId,
    userId: params.uid,
    username: params.username.slice(0, 32),
    type: 'withdrawal',
    amount: check.amount,
    upiId: check.normalizedUpiId,
    utr: '',
    status: 'pending',
    payoutRef: '',
    adminNote: '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    const nextBalance = await runTransaction(db, async (tx) => {
      const [pubSnap, privSnap, settingsSnap] = await Promise.all([
        tx.get(pubRef),
        tx.get(privRef),
        tx.get(platformSettingsRef),
      ]);
      if (!pubSnap.exists() || !privSnap.exists()) throw new Error('Account not initialized');
      const pub = pubSnap.data() as PublicProfile;
      const priv = privSnap.data() as UserPrivate;
      if (pub.status !== 'active') throw new Error('Account is suspended');

      // Protection 2: First-Deposit Unlock for Withdrawals (₹100+ approved real deposit)
      const requireFirstDeposit =
        !settingsSnap.exists() ||
        typeof settingsSnap.data()?.requireFirstDepositToWithdraw !== 'boolean' ||
        settingsSnap.data()?.requireFirstDepositToWithdraw === true;
      const approvedDeposited = Math.max(0, Math.round(pub.totalDeposited || 0));
      if (requireFirstDeposit && approvedDeposited < MIN_FIRST_DEPOSIT_UNLOCK) {
        throw new Error('Make a minimum ₹100 first deposit to unlock instant UPI withdrawals');
      }

      const buckets = extractWalletBuckets(pub);
      if (buckets.winningBalance < check.amount!) {
        throw new Error(
          `Insufficient Winning Balance. Only Winning Balance (${buckets.winningBalance.toLocaleString()} coins) is eligible for withdrawal.`,
        );
      }

      const lastWdAt = priv.lastWithdrawalAtMs || 0;
      if (lastWdAt > 0 && nowMs < lastWdAt + UPI_WITHDRAWAL_COOLDOWN_MS) {
        const waitSec = Math.ceil((lastWdAt + UPI_WITHDRAWAL_COOLDOWN_MS - nowMs) / 1000);
        throw new Error(`Withdrawal cooldown active. Please wait ${waitSec}s before requesting again.`);
      }

      const prevDaily = priv.dailyWithdrawnDate === today ? priv.dailyWithdrawnTotal || 0 : 0;
      const nextDaily = prevDaily + check.amount!;
      if (nextDaily > UPI_DAILY_WITHDRAWAL_LIMIT) {
        const rem = Math.max(0, UPI_DAILY_WITHDRAWAL_LIMIT - prevDaily);
        throw new Error(`Daily withdrawal limit (50,000) exceeded. Remaining today: ${rem.toLocaleString()} coins.`);
      }

      const nextWinning = buckets.winningBalance - check.amount!;
      const balanceAfter = buckets.depositBalance + nextWinning + buckets.bonusBalance;

      tx.update(pubRef, {
        balance: balanceAfter,
        depositBalance: buckets.depositBalance,
        winningBalance: nextWinning,
        bonusBalance: buckets.bonusBalance,
        updatedAt: serverTimestamp(),
      });
      tx.update(privRef, {
        lastWithdrawalAtMs: nowMs,
        dailyWithdrawnDate: today,
        dailyWithdrawnTotal: nextDaily,
        updatedAt: serverTimestamp(),
      });
      tx.set(reqRef, record);
      tx.set(doc(db, 'walletTransactions', txId), {
        txId,
        userId: params.uid,
        type: 'withdrawal_request',
        game: 'system',
        bucket: 'winning',
        amount: -check.amount!,
        balanceBefore: buckets.totalBalance,
        balanceAfter,
        description: `UPI withdrawal request to ${check.normalizedUpiId}`,
        roundId: requestId,
        createdAt: serverTimestamp(),
      });

      return balanceAfter;
    });

    return { request: record, nextBalance };
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes('Winning Balance') ||
        error.message.includes('cooldown') ||
        error.message.includes('Daily withdrawal') ||
        error.message.includes('first deposit') ||
        error.message.includes('suspended'))
    ) {
      throw error;
    }
    handleFirestoreError(error, OperationType.WRITE, `upiRequests/${requestId}`);
  }
}

export async function fetchUserUpiRequests(uid: string): Promise<UpiRequestRecord[]> {
  try {
    const q = query(collection(db, 'upiRequests'), where('userId', '==', uid), limit(50));
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => d.data() as UpiRequestRecord)
      .sort((a, b) => getTimeMs(b.createdAt) - getTimeMs(a.createdAt));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'upiRequests');
  }
}

export async function redeemPromoCode(params: {
  uid: string;
  code: string;
  depositAmount?: number;
}): Promise<{ code: string; bonusAmount: number; nextBalance: number; description: string }> {
  const cleanCode = params.code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (cleanCode.length < 3 || cleanCode.length > 24) {
    throw new Error('Enter a valid promo code (3–24 letters/numbers).');
  }

  // Fetch admin-managed promo code doc if present in Firestore
  const promoRef = doc(db, 'promoCodes', cleanCode);
  let promoDocData: PromoCodeDoc | null = null;
  try {
    const promoSnap = await getDoc(promoRef);
    if (promoSnap.exists()) {
      promoDocData = promoSnap.data() as PromoCodeDoc;
    }
  } catch {
    // non-fatal; server validator will check built-in codes
  }

  // Server-authoritative promo validation (rate limit, format, minDeposit, expiry, cap)
  const resp = await fetch('/api/wallet/validate-promo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: params.uid,
      code: cleanCode,
      depositAmount: params.depositAmount || 0,
      promoDoc: promoDocData
        ? {
            code: promoDocData.code,
            bonusAmount: promoDocData.bonusAmount,
            minDeposit: promoDocData.minDeposit,
            maxUses: promoDocData.maxUses,
            usedCount: promoDocData.usedCount,
            active: promoDocData.active,
            description: promoDocData.description,
            expiresAt: promoDocData.expiresAt,
          }
        : null,
    }),
  });
  const check = (await resp.json()) as {
    ok?: boolean;
    error?: string;
    code?: string;
    bonusAmount?: number;
    description?: string;
    proofHash?: string;
  };
  if (!resp.ok || !check.ok || !check.code || !check.bonusAmount) {
    throw new Error(check.error || 'Promo code validation failed.');
  }

  const verifiedCode = check.code;
  const redemptionId = `${verifiedCode}_${params.uid}`;
  const redemptionRef = doc(db, 'promoRedemptions', redemptionId);
  const pubRef = doc(db, 'publicProfiles', params.uid);
  const txId = makeSafeId('tx_promo');

  try {
    return await runTransaction(db, async (tx) => {
      const [pubSnap, redSnap, livePromoSnap] = await Promise.all([
        tx.get(pubRef),
        tx.get(redemptionRef),
        tx.get(promoRef),
      ]);

      if (!pubSnap.exists()) throw new Error('Account not initialized');
      const pub = pubSnap.data() as PublicProfile;
      if (pub.status !== 'active') throw new Error('Account is suspended');
      if (redSnap.exists()) {
        throw new Error(`Promo code ${verifiedCode} has already been redeemed on your account.`);
      }

      let finalBonus = check.bonusAmount!;
      if (livePromoSnap.exists()) {
        const livePromo = livePromoSnap.data() as PromoCodeDoc;
        if (!livePromo.active) throw new Error('This promo code is currently paused.');
        if (livePromo.usedCount >= livePromo.maxUses) {
          throw new Error('This promo code has reached its maximum redemptions.');
        }
        finalBonus = Math.min(finalBonus, livePromo.bonusAmount);
        tx.update(promoRef, {
          usedCount: livePromo.usedCount + 1,
          updatedAt: serverTimestamp(),
        });
      }

      const buckets = extractWalletBuckets(pub);
      const granted = Math.min(finalBonus, Math.max(0, 100000000 - buckets.totalBalance));
      const nextBonus = buckets.bonusBalance + granted;
      const nextBalance = buckets.depositBalance + buckets.winningBalance + nextBonus;

      tx.set(redemptionRef, {
        redemptionId,
        code: verifiedCode,
        userId: params.uid,
        bonusAmount: granted,
        createdAt: serverTimestamp(),
      });
      tx.update(pubRef, {
        balance: nextBalance,
        depositBalance: buckets.depositBalance,
        winningBalance: buckets.winningBalance,
        bonusBalance: nextBonus,
        updatedAt: serverTimestamp(),
      });
      tx.set(doc(db, 'walletTransactions', txId), {
        txId,
        userId: params.uid,
        type: 'promo_bonus',
        game: 'system',
        bucket: 'bonus',
        amount: granted,
        balanceBefore: buckets.totalBalance,
        balanceAfter: nextBalance,
        description: `Promo ${verifiedCode}: ${check.description || `+${granted} Bonus Coins`}`.slice(0, 190),
        roundId: check.proofHash || redemptionId,
        createdAt: serverTimestamp(),
      });

      return {
        code: verifiedCode,
        bonusAmount: granted,
        nextBalance,
        description: check.description || `+${granted.toLocaleString()} Bonus Coins`,
      };
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes('already been redeemed') ||
        error.message.includes('paused') ||
        error.message.includes('maximum') ||
        error.message.includes('suspended'))
    ) {
      throw error;
    }
    handleFirestoreError(error, OperationType.WRITE, `promoRedemptions/${redemptionId}`);
  }
}

export async function fetchUserSupportTickets(uid: string): Promise<ReportRecord[]> {
  try {
    const q = query(collection(db, 'reports'), where('userId', '==', uid), limit(40));
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => d.data() as ReportRecord)
      .sort((a, b) => getTimeMs(b.createdAt) - getTimeMs(a.createdAt));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'reports');
  }
}

export function subscribeToRecentBigWins(
  onData: (wins: Array<GameHistoryRecord & { maskedUsername: string }>) => void,
): Unsubscribe {
  const q = query(collection(db, 'gameHistory'), where('isPublic', '==', true), limit(40));
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs
        .map((d) => d.data() as GameHistoryRecord)
        .filter((r) => r.payout > 0 && (r.outcome === 'win' || r.outcome === 'cashout'))
        .sort((a, b) => getTimeMs(b.createdAt) - getTimeMs(a.createdAt))
        .slice(0, 15)
        .map((r) => ({
          ...r,
          maskedUsername: anonymizePlayerName(r.username),
        }));
      onData(items);
    },
    () => {
      // Keep ticker non-blocking on network errors
      onData([]);
    },
  );
}

export async function updateUserProfileAndSettings(
  uid: string,
  updates: {
    username?: string;
    avatarSeed?: string;
    graphicsQuality?: GraphicsQuality;
    soundEnabled?: boolean;
    musicEnabled?: boolean;
    volume?: number;
  },
): Promise<void> {
  try {
    if (updates.username || updates.avatarSeed) {
      const pubUpdates: Record<string, unknown> = { updatedAt: serverTimestamp() };
      if (updates.username) pubUpdates.username = sanitizeUsername(updates.username);
      if (updates.avatarSeed) pubUpdates.avatarSeed = updates.avatarSeed.slice(0, 64);
      await updateDoc(doc(db, 'publicProfiles', uid), pubUpdates);
    }
    const privUpdates: Record<string, unknown> = { updatedAt: serverTimestamp() };
    if (updates.username) privUpdates.username = sanitizeUsername(updates.username);
    if (updates.graphicsQuality) privUpdates.graphicsQuality = updates.graphicsQuality;
    if (typeof updates.soundEnabled === 'boolean') privUpdates.soundEnabled = updates.soundEnabled;
    if (typeof updates.musicEnabled === 'boolean') privUpdates.musicEnabled = updates.musicEnabled;
    if (typeof updates.volume === 'number') privUpdates.volume = Math.max(0, Math.min(1, updates.volume));
    await updateDoc(doc(db, 'users', uid), privUpdates);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${uid}`);
  }
}

export async function fetchLeaderboard(
  timeframe: 'weekly' | 'monthly' | 'allTime',
  maxRows = 50,
): Promise<PublicProfile[]> {
  try {
    const q = query(collection(db, 'publicProfiles'), where('status', '==', 'active'), limit(maxRows));
    const snap = await getDocs(q);
    const items = snap.docs.map((d) => d.data() as PublicProfile);
    const sortKey =
      timeframe === 'weekly' ? 'weeklyScore' : timeframe === 'monthly' ? 'monthlyScore' : 'balance';
    items.sort((a, b) => (b[sortKey] || 0) - (a[sortKey] || 0));
    return items;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'publicProfiles');
  }
}

export async function fetchUserTransactions(uid: string, maxRows = 60): Promise<WalletTransaction[]> {
  try {
    const q = query(
      collection(db, 'walletTransactions'),
      where('userId', '==', uid),
      orderBy('createdAt', 'desc'),
      limit(maxRows),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as WalletTransaction);
  } catch (err) {
    try {
      const q2 = query(collection(db, 'walletTransactions'), where('userId', '==', uid), limit(maxRows));
      const snap2 = await getDocs(q2);
      const list = snap2.docs.map((d) => d.data() as WalletTransaction);
      return list.sort((a, b) => getTimeMs(b.createdAt) - getTimeMs(a.createdAt));
    } catch (error2) {
      handleFirestoreError(error2 || err, OperationType.LIST, 'walletTransactions');
    }
  }
}

export async function fetchGameHistory(uid?: string, maxRows = 50): Promise<GameHistoryRecord[]> {
  try {
    const q = uid
      ? query(collection(db, 'gameHistory'), where('userId', '==', uid), limit(maxRows))
      : query(collection(db, 'gameHistory'), where('isPublic', '==', true), limit(maxRows));
    const snap = await getDocs(q);
    const rows = snap.docs.map((d) => d.data() as GameHistoryRecord);
    return rows.sort((a, b) => getTimeMs(b.createdAt) - getTimeMs(a.createdAt));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'gameHistory');
  }
}

export function getTimeMs(ts: unknown): number {
  if (!ts) return 0;
  if (typeof ts === 'number') return ts;
  if (typeof ts === 'object' && ts !== null && 'toMillis' in ts && typeof (ts as { toMillis: () => number }).toMillis === 'function') {
    return (ts as { toMillis: () => number }).toMillis();
  }
  if (typeof ts === 'object' && ts !== null && 'seconds' in ts) {
    return Number((ts as { seconds: number }).seconds) * 1000;
  }
  return 0;
}
