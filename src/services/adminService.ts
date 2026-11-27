import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { ADMIN_BOOTSTRAP_EMAIL } from '../config/assets';
import type {
  AdminAuditLog,
  GameConfigDoc,
  GameHistoryRecord,
  LiquidityMode,
  MatchmakingDifficulty,
  PlatformLiquiditySettings,
  PromoCodeDoc,
  PublicProfile,
  ReportRecord,
  UpiRequestRecord,
  UserPrivate,
  WalletTransaction,
} from '../types';
import { auth, db, handleFirestoreError, OperationType } from './firebase';
import {
  DEFAULT_DEPOSIT_UPI_ID,
  DEFAULT_DEPOSIT_UPI_NAME,
  extractWalletBuckets,
  getTimeMs,
  resolveActiveDepositUpi,
} from './walletService';

export const DEFAULT_TELEGRAM_URL = 'https://t.me/aureliaarena93';

const LEGACY_PLACEHOLDER_TELEGRAM_URLS = new Set([
  'https://t.me/aureliaarenasupport',
  'https://t.me/aureliaarena_support',
]);

export function resolveActiveTelegramUrl(configured?: string): string {
  const trimmed = (configured || '').trim();
  if (!trimmed || LEGACY_PLACEHOLDER_TELEGRAM_URLS.has(trimmed.toLowerCase())) {
    return DEFAULT_TELEGRAM_URL;
  }
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:' ? trimmed : DEFAULT_TELEGRAM_URL;
  } catch {
    return DEFAULT_TELEGRAM_URL;
  }
}

function makeAuditId(): string {
  return `aud_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function isRootAdminEmail(email?: string | null): boolean {
  return (email || '').trim().toLowerCase() === ADMIN_BOOTSTRAP_EMAIL.toLowerCase();
}

export async function checkIsAdmin(
  uid: string,
  email: string | null,
  emailVerified: boolean,
  knownRole?: string | null,
): Promise<boolean> {
  if (isRootAdminEmail(email)) {
    return true;
  }
  if (knownRole === 'admin') {
    return true;
  }
  if (!emailVerified) return false;
  try {
    const [adminSnap, userSnap] = await Promise.allSettled([
      getDoc(doc(db, 'admins', uid)),
      getDoc(doc(db, 'users', uid)),
    ]);
    if (adminSnap.status === 'fulfilled' && adminSnap.value.exists()) {
      return true;
    }
    if (userSnap.status === 'fulfilled' && userSnap.value.exists()) {
      const data = userSnap.value.data() as Partial<UserPrivate>;
      if (data.role === 'admin') {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

export async function syncAdminRoleToUserDoc(uid: string, email?: string | null): Promise<void> {
  if (!uid || !isRootAdminEmail(email)) return;
  try {
    const privRef = doc(db, 'users', uid);
    const snap = await getDoc(privRef);
    if (snap.exists()) {
      const data = snap.data() as Partial<UserPrivate>;
      if (data.role !== 'admin') {
        // Only updates role & updatedAt on users/{uid}; never touches publicProfiles wallet balances
        await updateDoc(privRef, {
          role: 'admin',
          updatedAt: serverTimestamp(),
        });
      }
    }
  } catch {
    // Non-fatal if offline or not yet provisioned
  }
}

export async function verifyAdminSessionWithServer(): Promise<{
  ok: boolean;
  matchmakingDifficulty?: MatchmakingDifficulty;
}> {
  const currentUser = auth.currentUser;
  if (!currentUser) return { ok: false };
  try {
    const idToken = await currentUser.getIdToken();
    const resp = await fetch('/api/admin/verify', {
      headers: { Authorization: `Bearer ${idToken}` },
    });
    if (!resp.ok) return { ok: false };
    const data = (await resp.json()) as {
      ok?: boolean;
      matchmakingDifficulty?: MatchmakingDifficulty;
    };
    return { ok: Boolean(data.ok), matchmakingDifficulty: data.matchmakingDifficulty };
  } catch {
    return { ok: false };
  }
}

export const DEFAULT_PLATFORM_LIQUIDITY_SETTINGS: PlatformLiquiditySettings = {
  liquidityMode: 'balanced',
  maxRoundPayoutCap: 50000,
  smartMatchmakingEnabled: true,
  matchmakingWaitSeconds: 8,
  welcomeBonusAmount: 51,
  requireFirstDepositToWithdraw: true,
};

export interface LiquidityPresetMeta {
  id: LiquidityMode;
  label: string;
  tagline: string;
  ludoTeenPatti: string;
  aviatorCurve: string;
  dragonTigerCap: string;
  badgeClass: string;
  activeClass: string;
}

export const LIQUIDITY_PRESET_DETAILS: Record<LiquidityMode, LiquidityPresetMeta> = {
  easy: {
    id: 'easy',
    label: 'Easy',
    tagline: 'Growth & Early-User Retention',
    ludoTeenPatti: 'Casual opponent decisions (occasional sub-optimal Ludo moves; passive Teen Patti calls & early folds).',
    aviatorCurve: 'Generous pre-round flight curve (low 1.00x–1.15x instant-crash frequency, frequent 2x–10x+ climbs, open cap).',
    dragonTigerCap: 'Standard 52-card fair deck with open house payout cap (min ₹2,50,000 cap).',
    badgeClass: 'text-emerald-300 bg-emerald-500/15 border-emerald-500/35',
    activeClass: 'border-emerald-400 bg-emerald-500/20 text-emerald-100 shadow-[0_0_20px_rgba(16,185,129,0.22)]',
  },
  balanced: {
    id: 'balanced',
    label: 'Balanced',
    tagline: 'Standard Casino Liquidity Mix',
    ludoTeenPatti: 'Solid tactical opponents (safe stars & captures in Ludo; pot-odds Blind/Chaal/Pack in Teen Patti).',
    aviatorCurve: 'Standard casino crash curve (1.2x–2.5x median flights with periodic 5x–25x runs) & configured round cap.',
    dragonTigerCap: 'Standard 52-card fair deck with configured single-round payout cap (default ₹50,000).',
    badgeClass: 'text-[#f6dc93] bg-[#d4af37]/15 border-[#d4af37]/35',
    activeClass: 'border-[#f6dc93] bg-[#d4af37]/20 text-[#fff3cc] shadow-[0_0_20px_rgba(212,175,55,0.24)]',
  },
  pro: {
    id: 'pro',
    label: 'Pro',
    tagline: 'Tournament Skill & Tighter Edge',
    ludoTeenPatti: 'Tournament-grade play (aggressive captures/blocking in Ludo; disciplined Side Show & value raises in Teen Patti).',
    aviatorCurve: 'Tighter pre-round curve with elevated 1.00x–1.40x early-crash density & strict payout cap (85% of cap).',
    dragonTigerCap: 'Standard 52-card fair deck with strict 80% house exposure payout cap per round.',
    badgeClass: 'text-amber-300 bg-amber-500/15 border-amber-500/35',
    activeClass: 'border-amber-400 bg-amber-500/20 text-amber-100 shadow-[0_0_20px_rgba(245,158,11,0.24)]',
  },
  'ultra-pro': {
    id: 'ultra-pro',
    label: 'Ultra Pro',
    tagline: 'Maximum Liquidity Protection',
    ludoTeenPatti: 'Full multi-step board lookahead in Ludo & strict mathematical hand-strength/pot-odds thresholds in Teen Patti.',
    aviatorCurve: 'High-defense pre-round curve with elevated early-crash frequency & tight 60% round payout cap.',
    dragonTigerCap: 'Standard 52-card fair deck with strict 50% high-defense house exposure cap per round.',
    badgeClass: 'text-rose-300 bg-rose-500/15 border-rose-500/35',
    activeClass: 'border-rose-400 bg-rose-500/20 text-rose-100 shadow-[0_0_20px_rgba(244,63,94,0.25)]',
  },
};

export function normalizePlatformLiquiditySettings(
  raw?: Partial<PlatformLiquiditySettings> | null,
): PlatformLiquiditySettings {
  const mode = raw?.liquidityMode;
  const liquidityMode: LiquidityMode =
    mode === 'easy' || mode === 'balanced' || mode === 'pro' || mode === 'ultra-pro'
      ? mode
      : DEFAULT_PLATFORM_LIQUIDITY_SETTINGS.liquidityMode;

  const capNum = Math.round(Number(raw?.maxRoundPayoutCap ?? DEFAULT_PLATFORM_LIQUIDITY_SETTINGS.maxRoundPayoutCap));
  const maxRoundPayoutCap = Number.isFinite(capNum)
    ? Math.max(100, Math.min(5_000_000, capNum))
    : DEFAULT_PLATFORM_LIQUIDITY_SETTINGS.maxRoundPayoutCap;

  const waitNum = Math.round(
    Number(raw?.matchmakingWaitSeconds ?? DEFAULT_PLATFORM_LIQUIDITY_SETTINGS.matchmakingWaitSeconds),
  );
  const matchmakingWaitSeconds = Number.isFinite(waitNum)
    ? Math.max(5, Math.min(15, waitNum))
    : DEFAULT_PLATFORM_LIQUIDITY_SETTINGS.matchmakingWaitSeconds;

  const smartMatchmakingEnabled =
    typeof raw?.smartMatchmakingEnabled === 'boolean'
      ? raw.smartMatchmakingEnabled
      : DEFAULT_PLATFORM_LIQUIDITY_SETTINGS.smartMatchmakingEnabled;

  const bonusNum = Math.round(
    Number(raw?.welcomeBonusAmount ?? DEFAULT_PLATFORM_LIQUIDITY_SETTINGS.welcomeBonusAmount),
  );
  const welcomeBonusAmount = Number.isFinite(bonusNum)
    ? Math.max(0, Math.min(500, bonusNum))
    : DEFAULT_PLATFORM_LIQUIDITY_SETTINGS.welcomeBonusAmount;

  const requireFirstDepositToWithdraw =
    typeof raw?.requireFirstDepositToWithdraw === 'boolean'
      ? raw.requireFirstDepositToWithdraw
      : DEFAULT_PLATFORM_LIQUIDITY_SETTINGS.requireFirstDepositToWithdraw;

  return {
    liquidityMode,
    maxRoundPayoutCap,
    smartMatchmakingEnabled,
    matchmakingWaitSeconds,
    welcomeBonusAmount,
    requireFirstDepositToWithdraw,
    updatedAt: raw?.updatedAt,
  };
}

export function computeEffectiveDragonTigerCap(settings: PlatformLiquiditySettings): number {
  const base = Math.max(100, Math.round(settings.maxRoundPayoutCap || 50000));
  if (settings.liquidityMode === 'easy') return Math.max(base, 250000);
  if (settings.liquidityMode === 'balanced') return base;
  if (settings.liquidityMode === 'pro') return Math.max(1000, Math.round(base * 0.8));
  return Math.max(1000, Math.round(base * 0.5));
}

export function computeEffectiveAviatorCap(settings: PlatformLiquiditySettings): number {
  const base = Math.max(100, Math.round(settings.maxRoundPayoutCap || 50000));
  if (settings.liquidityMode === 'easy') return Math.max(base, 250000);
  if (settings.liquidityMode === 'balanced') return base;
  if (settings.liquidityMode === 'pro') return Math.max(1000, Math.round(base * 0.85));
  return Math.max(1000, Math.round(base * 0.6));
}

export async function fetchPlatformLiquiditySettings(): Promise<PlatformLiquiditySettings> {
  try {
    const snap = await getDoc(doc(db, 'settings', 'platform'));
    if (snap.exists()) {
      return normalizePlatformLiquiditySettings(snap.data() as Partial<PlatformLiquiditySettings>);
    }
  } catch {
    // Fallback to server config or defaults
  }
  try {
    const resp = await fetch('/api/config/liquidity');
    if (resp.ok) {
      const data = (await resp.json()) as Partial<PlatformLiquiditySettings>;
      return normalizePlatformLiquiditySettings(data);
    }
  } catch {
    // Offline fallback
  }
  return { ...DEFAULT_PLATFORM_LIQUIDITY_SETTINGS };
}

export function subscribePlatformLiquiditySettings(
  onUpdate: (settings: PlatformLiquiditySettings) => void,
): () => void {
  return onSnapshot(
    doc(db, 'settings', 'platform'),
    (snap) => {
      if (snap.exists()) {
        onUpdate(normalizePlatformLiquiditySettings(snap.data() as Partial<PlatformLiquiditySettings>));
      } else {
        onUpdate({ ...DEFAULT_PLATFORM_LIQUIDITY_SETTINGS });
      }
    },
    () => {
      // Non-fatal offline fallback
    },
  );
}

export async function syncPlatformLiquidityToServer(
  settings: PlatformLiquiditySettings,
): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser) return;
  const normalized = normalizePlatformLiquiditySettings(settings);
  const idToken = await currentUser.getIdToken();
  const resp = await fetch('/api/admin/liquidity', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      liquidityMode: normalized.liquidityMode,
      maxRoundPayoutCap: normalized.maxRoundPayoutCap,
      smartMatchmakingEnabled: normalized.smartMatchmakingEnabled,
      matchmakingWaitSeconds: normalized.matchmakingWaitSeconds,
      welcomeBonusAmount: normalized.welcomeBonusAmount,
      requireFirstDepositToWithdraw: normalized.requireFirstDepositToWithdraw,
    }),
  });
  if (!resp.ok) {
    const body = (await resp.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || 'Failed to sync liquidity settings with game server.');
  }
}

export async function savePlatformLiquiditySettings(
  settings: PlatformLiquiditySettings,
): Promise<PlatformLiquiditySettings> {
  const normalized = normalizePlatformLiquiditySettings(settings);
  const payload = {
    liquidityMode: normalized.liquidityMode,
    maxRoundPayoutCap: normalized.maxRoundPayoutCap,
    smartMatchmakingEnabled: normalized.smartMatchmakingEnabled,
    matchmakingWaitSeconds: normalized.matchmakingWaitSeconds,
    welcomeBonusAmount: normalized.welcomeBonusAmount,
    requireFirstDepositToWithdraw: normalized.requireFirstDepositToWithdraw,
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(doc(db, 'settings', 'platform'), payload);
    await syncPlatformLiquidityToServer(normalized);
    await recordAdminAuditLog({
      targetUid: 'platform',
      targetUsername: 'Platform:Liquidity',
      action: 'config_update',
      amount: normalized.maxRoundPayoutCap,
      reason: `Updated platform preset to ${normalized.liquidityMode.toUpperCase()} (cap=₹${normalized.maxRoundPayoutCap.toLocaleString()}, welcome=₹${normalized.welcomeBonusAmount}, firstDepWithdraw=${String(normalized.requireFirstDepositToWithdraw)}, wait=${normalized.matchmakingWaitSeconds}s)`,
    });
    return normalized;
  } catch (error) {
    if (error instanceof Error && error.message.includes('sync liquidity')) {
      throw error;
    }
    handleFirestoreError(error, OperationType.WRITE, 'settings/platform');
  }
}

export async function syncServerMatchmakingDifficulty(
  difficulty: MatchmakingDifficulty,
): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser) return;
  const idToken = await currentUser.getIdToken();
  const resp = await fetch('/api/admin/matchmaking', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ difficulty }),
  });
  if (!resp.ok) {
    const body = (await resp.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || 'Failed to update server matchmaking difficulty');
  }
}

export const DEFAULT_GAME_CONFIGS: Record<GameConfigDoc['gameId'], GameConfigDoc> = {
  dragon_tiger: {
    gameId: 'dragon_tiger',
    enabled: true,
    minBet: 1,
    maxBet: 25000,
    version: '2.6.0',
    apkDownloadUrl: '',
    apkVersion: '1.2.0',
    apkSize: '48.6 MB',
    apkUpdatedAt: '2026-11-27',
    apkAndroidCompat: 'Android 9.0+',
    maintenanceMessage: '',
  },
  ludo: {
    gameId: 'ludo',
    enabled: true,
    minBet: 1,
    maxBet: 10000,
    version: '2.6.0',
    apkDownloadUrl: '',
    apkVersion: '1.2.0',
    apkSize: '48.6 MB',
    apkUpdatedAt: '2026-11-27',
    apkAndroidCompat: 'Android 9.0+',
    maintenanceMessage: '',
  },
  aviator: {
    gameId: 'aviator',
    enabled: true,
    minBet: 1,
    maxBet: 25000,
    version: '2.6.0',
    apkDownloadUrl: '',
    apkVersion: '1.2.0',
    apkSize: '48.6 MB',
    apkUpdatedAt: '2026-11-27',
    apkAndroidCompat: 'Android 9.0+',
    maintenanceMessage: '',
  },
  teen_patti: {
    gameId: 'teen_patti',
    enabled: true,
    minBet: 1,
    maxBet: 50000,
    version: '2.6.0',
    apkDownloadUrl: '',
    apkVersion: '1.2.0',
    apkSize: '48.6 MB',
    apkUpdatedAt: '2026-11-27',
    apkAndroidCompat: 'Android 9.0+',
    maintenanceMessage: '',
  },
  platform: {
    gameId: 'platform',
    enabled: true,
    minBet: 1,
    maxBet: 25000,
    version: '2.6.0',
    apkDownloadUrl: '',
    apkVersion: '1.2.0',
    apkSize: '48.6 MB',
    apkUpdatedAt: '2026-11-27',
    apkAndroidCompat: 'Android 9.0 (Pie) or higher · ARM64 / ARMv7',
    maintenanceMessage: '',
    depositUpiId: DEFAULT_DEPOSIT_UPI_ID,
    depositUpiName: DEFAULT_DEPOSIT_UPI_NAME,
    depositQrUrl: '',
    whatsappSupportUrl: 'https://wa.me/919999999999',
    telegramSupportUrl: DEFAULT_TELEGRAM_URL,
    matchmakingDifficulty: 'balanced',
  },
};

async function recordAdminAuditLog(params: {
  targetUid: string;
  targetUsername: string;
  action: AdminAuditLog['action'];
  amount?: number;
  reason: string;
}): Promise<void> {
  const adminUid = auth.currentUser?.uid;
  if (!adminUid) return;
  const logId = makeAuditId();
  try {
    await setDoc(doc(db, 'adminAuditLogs', logId), {
      logId,
      adminUid,
      adminEmail: (auth.currentUser?.email || 'admin').slice(0, 160),
      targetUid: params.targetUid.slice(0, 128),
      targetUsername: params.targetUsername.slice(0, 64),
      action: params.action,
      amount: Math.max(-1000000, Math.min(1000000, Math.round(params.amount || 0))),
      reason: params.reason.trim().slice(0, 290) || 'Admin action',
      createdAt: serverTimestamp(),
    });
  } catch {
    // Keep non-blocking if audit write encounters transient error
  }
}

export async function fetchAllGameConfigs(): Promise<Record<GameConfigDoc['gameId'], GameConfigDoc>> {
  const result = { ...DEFAULT_GAME_CONFIGS };
  try {
    const snap = await getDocs(collection(db, 'gameConfigs'));
    snap.docs.forEach((d) => {
      const cfg = d.data() as GameConfigDoc;
      if (cfg.gameId in result) {
        const merged = { ...result[cfg.gameId], ...cfg };
        merged.minBet = Math.max(1, Math.round(Number(merged.minBet) || 1));
        if (cfg.gameId === 'platform') {
          merged.depositUpiId = resolveActiveDepositUpi(merged.depositUpiId);
          merged.depositUpiName = (merged.depositUpiName || DEFAULT_DEPOSIT_UPI_NAME).trim() || DEFAULT_DEPOSIT_UPI_NAME;
          merged.telegramSupportUrl = resolveActiveTelegramUrl(merged.telegramSupportUrl);
        }
        result[cfg.gameId] = merged;
      }
    });
    return result;
  } catch {
    return result;
  }
}

export async function saveGameConfig(config: GameConfigDoc): Promise<void> {
  const safeMinBet = Math.max(1, Math.min(100000, Math.round(Number(config.minBet) || 1)));
  const clean: Record<string, unknown> = {
    gameId: config.gameId,
    enabled: Boolean(config.enabled),
    minBet: safeMinBet,
    maxBet: Math.max(
      safeMinBet,
      Math.min(1000000, Math.round(Number(config.maxBet) || safeMinBet)),
    ),
    version: (config.version || '2.6.0').trim().slice(0, 32),
    apkDownloadUrl: (config.apkDownloadUrl || '').trim().slice(0, 512),
    apkVersion: (config.apkVersion || '1.2.0').trim().slice(0, 32),
    apkSize: (config.apkSize || '48.6 MB').trim().slice(0, 32),
    apkUpdatedAt: (config.apkUpdatedAt || '').trim().slice(0, 32),
    apkAndroidCompat: (config.apkAndroidCompat || 'Android 9.0+').trim().slice(0, 64),
    maintenanceMessage: (config.maintenanceMessage || '').trim().slice(0, 240),
    updatedAt: serverTimestamp(),
  };

  if (config.gameId === 'platform') {
    const diff =
      config.matchmakingDifficulty === 'casual' || config.matchmakingDifficulty === 'competitive'
        ? config.matchmakingDifficulty
        : 'balanced';
    clean.depositUpiId = resolveActiveDepositUpi(config.depositUpiId).slice(0, 100);
    clean.depositUpiName = (config.depositUpiName || DEFAULT_DEPOSIT_UPI_NAME).trim().slice(0, 64) || DEFAULT_DEPOSIT_UPI_NAME;
    clean.depositQrUrl = (config.depositQrUrl || '').trim().slice(0, 512);
    clean.whatsappSupportUrl = (config.whatsappSupportUrl || '').trim().slice(0, 256);
    clean.telegramSupportUrl = resolveActiveTelegramUrl(config.telegramSupportUrl).slice(0, 256);
    clean.matchmakingDifficulty = diff;
  }

  try {
    await setDoc(doc(db, 'gameConfigs', config.gameId), clean);
    if (config.gameId === 'platform' && typeof clean.matchmakingDifficulty === 'string') {
      await syncServerMatchmakingDifficulty(clean.matchmakingDifficulty as MatchmakingDifficulty).catch(() => {});
    }
    await recordAdminAuditLog({
      targetUid: config.gameId,
      targetUsername: `Config:${config.gameId}`,
      action: 'config_update',
      reason: `Updated ${config.gameId} (enabled=${String(clean.enabled)}, min=${String(clean.minBet)}, max=${String(clean.maxBet)}${config.gameId === 'platform' ? `, difficulty=${String(clean.matchmakingDifficulty)}` : ''})`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `gameConfigs/${config.gameId}`);
  }
}

export async function fetchAdminDashboardData(): Promise<{
  users: PublicProfile[];
  userEmails: Record<string, string>;
  transactions: WalletTransaction[];
  history: GameHistoryRecord[];
  reports: ReportRecord[];
  upiRequests: UpiRequestRecord[];
  promoCodes: PromoCodeDoc[];
  auditLogs: AdminAuditLog[];
  configs: Record<GameConfigDoc['gameId'], GameConfigDoc>;
  platformSettings: PlatformLiquiditySettings;
}> {
  try {
    const [
      usersSnap,
      privSnap,
      txSnap,
      histSnap,
      repSnap,
      upiSnap,
      promoSnap,
      auditSnap,
      configs,
      platformSettings,
    ] = await Promise.all([
      getDocs(collection(db, 'publicProfiles')),
      getDocs(collection(db, 'users')).catch(() => null),
      getDocs(collection(db, 'walletTransactions')),
      getDocs(collection(db, 'gameHistory')),
      getDocs(collection(db, 'reports')),
      getDocs(collection(db, 'upiRequests')),
      getDocs(collection(db, 'promoCodes')).catch(() => null),
      getDocs(collection(db, 'adminAuditLogs')).catch(() => null),
      fetchAllGameConfigs(),
      fetchPlatformLiquiditySettings(),
    ]);

    const userEmails: Record<string, string> = {};
    if (privSnap) {
      privSnap.docs.forEach((d) => {
        const priv = d.data() as UserPrivate;
        if (priv.uid && priv.email) {
          userEmails[priv.uid] = priv.email;
        }
      });
    }

    const users = usersSnap.docs
      .map((d) => d.data() as PublicProfile)
      .sort((a, b) => getTimeMs(b.updatedAt) - getTimeMs(a.updatedAt));
    const transactions = txSnap.docs
      .map((d) => d.data() as WalletTransaction)
      .sort((a, b) => getTimeMs(b.createdAt) - getTimeMs(a.createdAt))
      .slice(0, 150);
    const history = histSnap.docs
      .map((d) => d.data() as GameHistoryRecord)
      .sort((a, b) => getTimeMs(b.createdAt) - getTimeMs(a.createdAt))
      .slice(0, 120);
    const reports = repSnap.docs
      .map((d) => d.data() as ReportRecord)
      .sort((a, b) => getTimeMs(b.createdAt) - getTimeMs(a.createdAt));
    const upiRequests = upiSnap.docs
      .map((d) => d.data() as UpiRequestRecord)
      .sort((a, b) => getTimeMs(b.createdAt) - getTimeMs(a.createdAt));
    const promoCodes = promoSnap
      ? promoSnap.docs
          .map((d) => d.data() as PromoCodeDoc)
          .sort((a, b) => getTimeMs(b.updatedAt) - getTimeMs(a.updatedAt))
      : [];
    const auditLogs = auditSnap
      ? auditSnap.docs
          .map((d) => d.data() as AdminAuditLog)
          .sort((a, b) => getTimeMs(b.createdAt) - getTimeMs(a.createdAt))
          .slice(0, 100)
      : [];

    return {
      users,
      userEmails,
      transactions,
      history,
      reports,
      upiRequests,
      promoCodes,
      auditLogs,
      configs,
      platformSettings,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'adminDashboard');
  }
}

export async function adminSetUserStatus(
  uid: string,
  status: 'active' | 'suspended',
  username = '',
  reason = '',
): Promise<void> {
  try {
    await updateDoc(doc(db, 'publicProfiles', uid), {
      status,
      updatedAt: serverTimestamp(),
    });
    await recordAdminAuditLog({
      targetUid: uid,
      targetUsername: username || uid.slice(0, 12),
      action: 'status_change',
      reason: reason || `Account marked ${status}`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `publicProfiles/${uid}`);
  }
}

export async function adminAdjustVirtualBalance(
  uid: string,
  delta: number,
  reason: string,
  bucket: 'deposit' | 'winning' | 'bonus' = 'deposit',
): Promise<{
  totalBalance: number;
  depositBalance: number;
  winningBalance: number;
  bonusBalance: number;
}> {
  const pubRef = doc(db, 'publicProfiles', uid);
  const txId = `tx_adm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const auditId = makeAuditId();
  const adminUid = auth.currentUser?.uid || 'admin';
  const adminEmail = (auth.currentUser?.email || 'admin').slice(0, 160);

  try {
    return await runTransaction(db, async (tx) => {
      const snap = await tx.get(pubRef);
      if (!snap.exists()) throw new Error('User not found');
      const pub = snap.data() as PublicProfile;
      const buckets = extractWalletBuckets(pub);
      const roundedDelta = Math.round(delta);

      let nextDeposit = buckets.depositBalance;
      let nextWinning = buckets.winningBalance;
      let nextBonus = buckets.bonusBalance;

      if (roundedDelta >= 0) {
        const add = Math.min(roundedDelta, Math.max(0, 100000000 - buckets.totalBalance));
        if (bucket === 'winning') nextWinning += add;
        else if (bucket === 'bonus') nextBonus += add;
        else nextDeposit += add;
      } else {
        let remove = Math.min(Math.abs(roundedDelta), buckets.totalBalance);
        if (bucket === 'winning') {
          const fromWin = Math.min(nextWinning, remove);
          nextWinning -= fromWin;
          remove -= fromWin;
        } else if (bucket === 'bonus') {
          const fromBon = Math.min(nextBonus, remove);
          nextBonus -= fromBon;
          remove -= fromBon;
        }
        const fromDep = Math.min(nextDeposit, remove);
        nextDeposit -= fromDep;
        remove -= fromDep;
        const fromBon2 = Math.min(nextBonus, remove);
        nextBonus -= fromBon2;
        remove -= fromBon2;
        nextWinning = Math.max(0, nextWinning - remove);
      }

      const nextBal = nextDeposit + nextWinning + nextBonus;
      const actualDelta = nextBal - buckets.totalBalance;

      tx.update(pubRef, {
        balance: nextBal,
        depositBalance: nextDeposit,
        winningBalance: nextWinning,
        bonusBalance: nextBonus,
        updatedAt: serverTimestamp(),
      });
      tx.set(doc(db, 'walletTransactions', txId), {
        txId,
        userId: uid,
        type: 'admin_adjust',
        game: 'system',
        bucket,
        amount: actualDelta,
        balanceBefore: buckets.totalBalance,
        balanceAfter: nextBal,
        description: `Admin adjustment (${bucket}): ${reason.slice(0, 150)}`,
        roundId: `admin_${adminUid}`,
        createdAt: serverTimestamp(),
      });
      tx.set(doc(db, 'adminAuditLogs', auditId), {
        logId: auditId,
        adminUid,
        adminEmail,
        targetUid: uid,
        targetUsername: pub.username.slice(0, 64),
        action: 'balance_adjust',
        amount: actualDelta,
        reason: `[${bucket.toUpperCase()}] ${reason.trim().slice(0, 260)}`,
        createdAt: serverTimestamp(),
      });
      return {
        totalBalance: nextBal,
        depositBalance: nextDeposit,
        winningBalance: nextWinning,
        bonusBalance: nextBonus,
      };
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `publicProfiles/${uid}`);
  }
}

export async function adminReviewUpiRequest(params: {
  requestId: string;
  action: 'approved' | 'rejected';
  payoutRef: string;
  adminNote: string;
}): Promise<void> {
  const reqRef = doc(db, 'upiRequests', params.requestId);
  const auditId = makeAuditId();
  const adminUid = auth.currentUser?.uid || 'admin';
  const adminEmail = (auth.currentUser?.email || 'admin').slice(0, 160);

  try {
    await runTransaction(db, async (tx) => {
      const reqSnap = await tx.get(reqRef);
      if (!reqSnap.exists()) throw new Error('UPI request not found');
      const req = reqSnap.data() as UpiRequestRecord;
      if (req.status !== 'pending') {
        throw new Error(`Request is already ${req.status}`);
      }

      const pubRef = doc(db, 'publicProfiles', req.userId);
      const pubSnap = await tx.get(pubRef);
      if (!pubSnap.exists()) throw new Error('Target user profile not found');
      const pub = pubSnap.data() as PublicProfile;
      const buckets = extractWalletBuckets(pub);

      const cleanPayoutRef = params.payoutRef.trim().slice(0, 64);
      const cleanNote = params.adminNote.trim().slice(0, 300);

      tx.update(reqRef, {
        status: params.action,
        payoutRef: cleanPayoutRef,
        adminNote: cleanNote,
        updatedAt: serverTimestamp(),
      });

      if (req.type === 'deposit' && params.action === 'approved') {
        const credited = Math.min(req.amount, Math.max(0, 100000000 - buckets.totalBalance));
        const nextDeposit = buckets.depositBalance + credited;
        const nextBalance = nextDeposit + buckets.winningBalance + buckets.bonusBalance;
        const nextTotalDeposited = Math.min(1000000000, Math.max(0, Math.round(pub.totalDeposited || 0)) + credited);
        const txId = `tx_dep_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

        tx.update(pubRef, {
          balance: nextBalance,
          depositBalance: nextDeposit,
          winningBalance: buckets.winningBalance,
          bonusBalance: buckets.bonusBalance,
          totalDeposited: nextTotalDeposited,
          updatedAt: serverTimestamp(),
        });
        tx.set(doc(db, 'walletTransactions', txId), {
          txId,
          userId: req.userId,
          type: 'upi_deposit',
          game: 'system',
          bucket: 'deposit',
          amount: credited,
          balanceBefore: buckets.totalBalance,
          balanceAfter: nextBalance,
          description: `UPI Deposit approved (UTR ${req.utr})`,
          roundId: req.requestId,
          createdAt: serverTimestamp(),
        });
      } else if (req.type === 'withdrawal' && params.action === 'rejected') {
        const refunded = Math.min(req.amount, Math.max(0, 100000000 - buckets.totalBalance));
        const nextWinning = buckets.winningBalance + refunded;
        const nextBalance = buckets.depositBalance + nextWinning + buckets.bonusBalance;
        const txId = `tx_wdr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

        tx.update(pubRef, {
          balance: nextBalance,
          depositBalance: buckets.depositBalance,
          winningBalance: nextWinning,
          bonusBalance: buckets.bonusBalance,
          updatedAt: serverTimestamp(),
        });
        tx.set(doc(db, 'walletTransactions', txId), {
          txId,
          userId: req.userId,
          type: 'withdrawal_refund',
          game: 'system',
          bucket: 'winning',
          amount: refunded,
          balanceBefore: buckets.totalBalance,
          balanceAfter: nextBalance,
          description: `UPI Withdrawal rejected — refunded to Winning Balance`,
          roundId: req.requestId,
          createdAt: serverTimestamp(),
        });
      }

      tx.set(doc(db, 'adminAuditLogs', auditId), {
        logId: auditId,
        adminUid,
        adminEmail,
        targetUid: req.userId,
        targetUsername: req.username.slice(0, 64),
        action: 'upi_review',
        amount: req.amount,
        reason: `UPI ${req.type} ${params.action}${req.utr ? ` (UTR ${req.utr})` : ''}${cleanNote ? ` — ${cleanNote}` : ''}`.slice(0, 290),
        createdAt: serverTimestamp(),
      });
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('already')) throw error;
    handleFirestoreError(error, OperationType.WRITE, `upiRequests/${params.requestId}`);
  }
}

export async function adminCreatePromoCode(params: {
  code: string;
  bonusAmount: number;
  minDeposit: number;
  maxUses: number;
  description: string;
  expiresAt?: string;
}): Promise<PromoCodeDoc> {
  const cleanCode = params.code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (cleanCode.length < 3 || cleanCode.length > 24) {
    throw new Error('Promo code must be 3–24 uppercase letters or numbers.');
  }
  const bonusAmount = Math.max(10, Math.min(25000, Math.round(params.bonusAmount)));
  const minDeposit = Math.max(0, Math.min(100000, Math.round(params.minDeposit)));
  const maxUses = Math.max(1, Math.min(1000000, Math.round(params.maxUses)));

  const promoDoc: PromoCodeDoc = {
    code: cleanCode,
    bonusAmount,
    minDeposit,
    maxUses,
    usedCount: 0,
    active: true,
    description: (params.description || `Promo ${cleanCode} (+${bonusAmount} Bonus)`).trim().slice(0, 160),
    expiresAt: (params.expiresAt || '').trim().slice(0, 40),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(doc(db, 'promoCodes', cleanCode), promoDoc);
    await recordAdminAuditLog({
      targetUid: cleanCode,
      targetUsername: `Promo:${cleanCode}`,
      action: 'promo_update',
      amount: bonusAmount,
      reason: `Created promo ${cleanCode} (+${bonusAmount} bonus, min deposit ${minDeposit}, cap ${maxUses})`,
    });
    return promoDoc;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `promoCodes/${cleanCode}`);
  }
}

export async function adminTogglePromoCode(code: string, active: boolean): Promise<void> {
  try {
    await updateDoc(doc(db, 'promoCodes', code), {
      active,
      updatedAt: serverTimestamp(),
    });
    await recordAdminAuditLog({
      targetUid: code,
      targetUsername: `Promo:${code}`,
      action: 'promo_update',
      reason: `Set promo ${code} active=${String(active)}`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `promoCodes/${code}`);
  }
}

export async function adminDeletePromoCode(code: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'promoCodes', code));
    await recordAdminAuditLog({
      targetUid: code,
      targetUsername: `Promo:${code}`,
      action: 'promo_update',
      reason: `Deleted promo code ${code}`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `promoCodes/${code}`);
  }
}

export async function submitUserReport(params: {
  uid: string;
  username: string;
  category: ReportRecord['category'];
  subject: string;
  message: string;
  targetUsername?: string;
  utrRef?: string;
}): Promise<ReportRecord> {
  const reportId = `rep_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const record: ReportRecord = {
    reportId,
    userId: params.uid,
    username: params.username.slice(0, 32),
    category: params.category,
    subject: params.subject.trim().slice(0, 120),
    message: params.message.trim().slice(0, 1200),
    targetUsername: (params.targetUsername || '').trim().slice(0, 32),
    utrRef: (params.utrRef || '').replace(/[^0-9A-Za-z\-]/g, '').slice(0, 24),
    status: 'open',
    adminNote: '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  try {
    await setDoc(doc(db, 'reports', reportId), record);
    return record;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `reports/${reportId}`);
  }
}

export async function adminUpdateReport(
  reportId: string,
  status: ReportRecord['status'],
  adminNote: string,
  targetUid = '',
  targetUsername = '',
): Promise<void> {
  try {
    await updateDoc(doc(db, 'reports', reportId), {
      status,
      adminNote: adminNote.trim().slice(0, 400),
      updatedAt: serverTimestamp(),
    });
    await recordAdminAuditLog({
      targetUid: targetUid || reportId,
      targetUsername: targetUsername || reportId,
      action: 'ticket_reply',
      reason: `Ticket ${reportId} -> ${status}: ${adminNote.trim().slice(0, 200)}`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `reports/${reportId}`);
  }
}
