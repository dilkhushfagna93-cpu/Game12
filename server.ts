import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import express from 'express';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

// --- Firebase Auth JWT Verification & Admin RBAC Middleware ---
type MatchmakingDifficulty = 'casual' | 'balanced' | 'competitive';
type LiquidityMode = 'easy' | 'balanced' | 'pro' | 'ultra-pro';

interface PlatformLiquidityConfig {
  liquidityMode: LiquidityMode;
  maxRoundPayoutCap: number;
  smartMatchmakingEnabled: boolean;
  matchmakingWaitSeconds: number;
  welcomeBonusAmount: number;
  requireFirstDepositToWithdraw: boolean;
}

const VALID_LIQUIDITY_MODES = new Set<LiquidityMode>(['easy', 'balanced', 'pro', 'ultra-pro']);
const BONUS_MAX_CONTRIBUTION_RATIO = 0.2;
const BONUS_STARTER_TABLE_MAX_STAKE = 10;
const BONUS_PRE_DEPOSIT_WIN_CAP = 200;
const MIN_FIRST_DEPOSIT_FOR_WITHDRAW = 100;

let platformLiquidityConfig: PlatformLiquidityConfig = {
  liquidityMode: 'balanced',
  maxRoundPayoutCap: 50000,
  smartMatchmakingEnabled: true,
  matchmakingWaitSeconds: 8,
  welcomeBonusAmount: 51,
  requireFirstDepositToWithdraw: true,
};

function mapLiquidityToLegacyDifficulty(mode: LiquidityMode): MatchmakingDifficulty {
  if (mode === 'easy') return 'casual';
  if (mode === 'pro' || mode === 'ultra-pro') return 'competitive';
  return 'balanced';
}

function getEffectiveAviatorPayoutCap(mode: LiquidityMode, baseCap: number): number {
  const safeBase = Math.max(100, Math.min(5_000_000, Math.round(baseCap || 50000)));
  if (mode === 'easy') return Math.max(safeBase, 250000);
  if (mode === 'balanced') return safeBase;
  if (mode === 'pro') return Math.max(1000, Math.round(safeBase * 0.85));
  return Math.max(1000, Math.round(safeBase * 0.6));
}

function getEffectiveDragonTigerPayoutCap(mode: LiquidityMode, baseCap: number): number {
  const safeBase = Math.max(100, Math.min(5_000_000, Math.round(baseCap || 50000)));
  if (mode === 'easy') return Math.max(safeBase, 250000);
  if (mode === 'balanced') return safeBase;
  if (mode === 'pro') return Math.max(1000, Math.round(safeBase * 0.8));
  return Math.max(1000, Math.round(safeBase * 0.5));
}

const ROOT_ADMIN_EMAILS = new Set<string>(
  [
    'qwikrahi@gmail.com',
    ...String(process.env.ADMIN_EMAILS || '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  ].map((s) => s.toLowerCase()),
);

let FIREBASE_PROJECT_ID = (process.env.FIREBASE_PROJECT_ID || '').trim();
let FIRESTORE_DATABASE_ID = (process.env.FIRESTORE_DATABASE_ID || '(default)').trim();
try {
  const cfgPath = path.resolve(__dirname, 'firebase-applet-config.json');
  if (fs.existsSync(cfgPath)) {
    const parsedCfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8')) as {
      projectId?: string;
      firestoreDatabaseId?: string;
    };
    if (!FIREBASE_PROJECT_ID && parsedCfg.projectId) {
      FIREBASE_PROJECT_ID = parsedCfg.projectId.trim();
    }
    if (parsedCfg.firestoreDatabaseId) {
      FIRESTORE_DATABASE_ID = parsedCfg.firestoreDatabaseId.trim();
    }
  }
} catch {
  // Ignore missing config file
}

interface VerifiedFirebaseUser {
  uid: string;
  email: string;
  emailVerified: boolean;
  role: string;
  isRootAdmin: boolean;
}

interface AdminAuthedRequest extends express.Request {
  adminUser?: VerifiedFirebaseUser;
}

const GOOGLE_CERTS_URL =
  'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
let cachedCerts: Record<string, string> = {};
let cachedCertsExpiresAtMs = 0;

async function getFirebasePublicCerts(): Promise<Record<string, string>> {
  const now = Date.now();
  if (Object.keys(cachedCerts).length > 0 && now < cachedCertsExpiresAtMs) {
    return cachedCerts;
  }
  const resp = await fetch(GOOGLE_CERTS_URL);
  if (!resp.ok) {
    throw new Error(`Unable to fetch Firebase public keys (${resp.status})`);
  }
  const certs = (await resp.json()) as Record<string, string>;
  const cacheControl = resp.headers.get('cache-control') || '';
  const match = cacheControl.match(/max-age=(\d+)/i);
  const maxAgeSec = match ? Math.max(60, Math.min(86400, Number(match[1]))) : 3600;
  cachedCerts = certs;
  cachedCertsExpiresAtMs = now + maxAgeSec * 1000;
  return cachedCerts;
}

function decodeBase64Url(segment: string): Buffer {
  const normalized = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (normalized.length % 4)) % 4;
  return Buffer.from(normalized + '='.repeat(padLen), 'base64');
}

async function verifyFirebaseIdToken(idToken: string): Promise<VerifiedFirebaseUser> {
  if (!FIREBASE_PROJECT_ID) {
    throw new Error('Firebase project ID is not configured on the server.');
  }
  const parts = idToken.split('.');
  if (parts.length !== 3) {
    throw new Error('Malformed Firebase ID token.');
  }
  const [headerB64, payloadB64, sigB64] = parts;
  const header = JSON.parse(decodeBase64Url(headerB64).toString('utf8')) as {
    alg?: string;
    kid?: string;
  };
  if (header.alg !== 'RS256' || !header.kid) {
    throw new Error('Unsupported token signing algorithm.');
  }

  let certs = await getFirebasePublicCerts();
  let certPem = certs[header.kid];
  if (!certPem) {
    cachedCertsExpiresAtMs = 0;
    certs = await getFirebasePublicCerts();
    certPem = certs[header.kid];
  }
  if (!certPem) {
    throw new Error('Unknown Firebase signing key.');
  }

  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(`${headerB64}.${payloadB64}`);
  verifier.end();
  const signature = decodeBase64Url(sigB64);
  if (!verifier.verify(certPem, signature)) {
    throw new Error('Invalid Firebase ID token signature.');
  }

  const payload = JSON.parse(decodeBase64Url(payloadB64).toString('utf8')) as {
    aud?: string;
    iss?: string;
    sub?: string;
    exp?: number;
    iat?: number;
    email?: string;
    email_verified?: boolean;
    role?: string;
    admin?: boolean;
  };

  const nowSec = Math.floor(Date.now() / 1000);
  const expectedIss = `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`;
  if (payload.aud !== FIREBASE_PROJECT_ID || payload.iss !== expectedIss) {
    throw new Error('Token audience or issuer mismatch.');
  }
  if (!payload.sub || typeof payload.sub !== 'string') {
    throw new Error('Missing subject in token.');
  }
  if (typeof payload.exp !== 'number' || payload.exp <= nowSec) {
    throw new Error('Firebase ID token expired.');
  }
  if (typeof payload.iat === 'number' && payload.iat > nowSec + 300) {
    throw new Error('Firebase ID token issued in the future.');
  }

  const email = String(payload.email || '').trim().toLowerCase();
  const isRootAdmin = Boolean(email && ROOT_ADMIN_EMAILS.has(email));
  const claimRole =
    payload.admin === true || payload.role === 'admin'
      ? 'admin'
      : typeof payload.role === 'string'
        ? payload.role
        : '';

  return {
    uid: payload.sub,
    email,
    emailVerified: Boolean(payload.email_verified),
    role: isRootAdmin ? 'admin' : claimRole,
    isRootAdmin,
  };
}

async function checkFirestoreAdminRole(uid: string, idToken: string): Promise<boolean> {
  if (!FIREBASE_PROJECT_ID || !/^[a-zA-Z0-9_\-]+$/.test(uid)) return false;
  const dbId = encodeURIComponent(FIRESTORE_DATABASE_ID || '(default)');
  const baseUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(FIREBASE_PROJECT_ID)}/databases/${dbId}/documents`;
  const headers = { Authorization: `Bearer ${idToken}` };

  try {
    const [userRes, adminRes] = await Promise.all([
      fetch(`${baseUrl}/users/${encodeURIComponent(uid)}`, { headers }),
      fetch(`${baseUrl}/admins/${encodeURIComponent(uid)}`, { headers }),
    ]);

    if (adminRes.ok) return true;
    if (userRes.ok) {
      const docJson = (await userRes.json()) as {
        fields?: { role?: { stringValue?: string } };
      };
      if (docJson.fields?.role?.stringValue === 'admin') {
        return true;
      }
    }
  } catch {
    // Non-fatal fallback
  }
  return false;
}

async function requireAdminMiddleware(
  req: AdminAuthedRequest,
  res: express.Response,
  next: express.NextFunction,
) {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    res.status(401).json({ ok: false, error: 'Missing Authorization Bearer token.' });
    return;
  }
  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) {
    res.status(401).json({ ok: false, error: 'Empty Authorization Bearer token.' });
    return;
  }

  try {
    const verified = await verifyFirebaseIdToken(token);
    const hasAdminAccess =
      verified.isRootAdmin ||
      verified.role === 'admin' ||
      (verified.emailVerified && (await checkFirestoreAdminRole(verified.uid, token)));

    if (!hasAdminAccess) {
      res.status(403).json({ ok: false, error: 'Administrator privileges required.' });
      return;
    }

    req.adminUser = { ...verified, role: 'admin' };
    next();
  } catch (err) {
    res.status(401).json({
      ok: false,
      error: err instanceof Error ? err.message : 'Invalid administrator credentials.',
    });
  }
}

// --- Provably Fair RNG & Authoritative Game State Store ---

interface Card {
  rank: number; // 2..14 (14 = Ace, highest per rules)
  label: string;
  suit: 'spades' | 'hearts' | 'diamonds' | 'clubs';
}

interface DragonTigerRoundRecord {
  roundId: string;
  serverSeed: string;
  serverSeedHash: string;
  dragonCard: Card;
  tigerCard: Card;
  winner: 'dragon' | 'tiger' | 'tie';
  createdAtMs: number;
  dealt: boolean;
}

interface AviatorRoundRecord {
  roundId: string;
  serverSeed: string;
  serverSeedHash: string;
  crashPoint: number;
  startTimeMs: number;
  crashed: boolean;
  cashedOutSessions: Set<string>;
  liquidityMode: LiquidityMode;
  maxRoundPayoutCap: number;
}

interface TeenPattiRoundRecord {
  roundId: string;
  serverSeed: string;
  serverSeedHash: string;
  bootAmount: number;
  seatCount: number;
  hands: Card[][];
  createdAtMs: number;
  revealed: boolean;
}

const aviatorRounds = new Map<string, AviatorRoundRecord>();
const dragonTigerRounds = new Map<string, DragonTigerRoundRecord>();
const teenPattiRounds = new Map<string, TeenPattiRoundRecord>();

// Direct UPI server-side defense-in-depth registries (paired with Firestore atomic locks & rules)
const seenUtrs = new Set<string>();
const userWithdrawalState = new Map<string, { lastAtMs: number; dateKey: string; dailyTotal: number }>();

const UPI_WITHDRAWAL_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
const UPI_DAILY_WITHDRAWAL_LIMIT = 50000;
const DEFAULT_DEPOSIT_UPI_ID = (process.env.DEPOSIT_UPI_ID || 'aureliaarena@ibl').trim();
const DEFAULT_DEPOSIT_UPI_NAME = (process.env.DEPOSIT_UPI_NAME || 'Aurelia Arena').trim();
const UPI_ID_REGEX = /^[a-zA-Z0-9._\-]{2,64}@[a-zA-Z]{2,32}$/;
const UTR_REGEX = /^[0-9]{12}$/;

function todayDateKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function cleanupOldRounds() {
  const cutoff = Date.now() - 15 * 60 * 1000;
  for (const [id, r] of aviatorRounds.entries()) {
    if (r.startTimeMs < cutoff) {
      aviatorRounds.delete(id);
    }
  }
  for (const [id, r] of dragonTigerRounds.entries()) {
    if (r.createdAtMs < cutoff) {
      dragonTigerRounds.delete(id);
    }
  }
  for (const [id, r] of teenPattiRounds.entries()) {
    if (r.createdAtMs < cutoff) {
      teenPattiRounds.delete(id);
    }
  }
}

function buildOrderedDeck(): Card[] {
  const suits: Card['suit'][] = ['spades', 'hearts', 'diamonds', 'clubs'];
  const labels: Record<number, string> = {
    2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10',
    11: 'J', 12: 'Q', 13: 'K', 14: 'A',
  };
  const deck: Card[] = [];
  for (const suit of suits) {
    for (let rank = 2; rank <= 14; rank++) {
      deck.push({ rank, label: labels[rank], suit });
    }
  }
  return deck;
}

/**
 * Deterministic Provably Fair Dragon Tiger draw from `serverSeed`:
 *  - `serverSeedHash = SHA-256(serverSeed)` (committed BEFORE player bets)
 *  - `dragonIdx = parseInt(SHA-256(serverSeed + ':dragon').slice(0, 8), 16) % 52`
 *  - `tigerIdx = parseInt(SHA-256(serverSeed + ':tiger').slice(0, 8), 16) % 51` (from remaining 51 cards)
 * Any client can independently verify both the pre-round hash commit AND the exact dealt cards.
 */
function deriveDragonTigerOutcome(serverSeed: string): {
  serverSeedHash: string;
  dragonCard: Card;
  tigerCard: Card;
  winner: 'dragon' | 'tiger' | 'tie';
} {
  const serverSeedHash = crypto.createHash('sha256').update(serverSeed).digest('hex');
  const deck = buildOrderedDeck();

  const dHash = crypto.createHash('sha256').update(`${serverSeed}:dragon`).digest('hex');
  const dragonIdx = parseInt(dHash.slice(0, 8), 16) % deck.length;
  const dragonCard = deck.splice(dragonIdx, 1)[0];

  const tHash = crypto.createHash('sha256').update(`${serverSeed}:tiger`).digest('hex');
  const tigerIdx = parseInt(tHash.slice(0, 8), 16) % deck.length;
  const tigerCard = deck[tigerIdx];

  let winner: 'dragon' | 'tiger' | 'tie' = 'tie';
  if (dragonCard.rank > tigerCard.rank) winner = 'dragon';
  else if (tigerCard.rank > dragonCard.rank) winner = 'tiger';

  return { serverSeedHash, dragonCard, tigerCard, winner };
}

function createDragonTigerRound(): DragonTigerRoundRecord {
  cleanupOldRounds();
  const roundId = `dt_${crypto.randomBytes(8).toString('hex')}`;
  const serverSeed = crypto.randomBytes(24).toString('hex');
  const { serverSeedHash, dragonCard, tigerCard, winner } = deriveDragonTigerOutcome(serverSeed);
  const record: DragonTigerRoundRecord = {
    roundId,
    serverSeed,
    serverSeedHash,
    dragonCard,
    tigerCard,
    winner,
    createdAtMs: Date.now(),
    dealt: false,
  };
  dragonTigerRounds.set(roundId, record);
  return record;
}

/**
 * Pre-Round Provably Fair Crash Point Generation:
 * The active liquidityMode curve is selected strictly BEFORE the SHA-256 serverSeedHash
 * is committed and returned to clients (never altered mid-flight).
 */
function generateFairCrashPoint(mode: LiquidityMode = platformLiquidityConfig.liquidityMode): {
  crashPoint: number;
  serverSeed: string;
  serverSeedHash: string;
  liquidityMode: LiquidityMode;
} {
  const serverSeed = crypto.randomBytes(24).toString('hex');
  const serverSeedHash = crypto.createHash('sha256').update(serverSeed).digest('hex');
  // Independent uniform float in [0, 1) derived from cryptographic hash
  const hex52 = serverSeedHash.slice(0, 13);
  const intVal = parseInt(hex52, 16);
  const u = Math.min(0.999999, Math.max(0, intVal / Math.pow(2, 52)));

  if (mode === 'easy') {
    // Low 1.00x-1.15x instant-crash frequency (~1.2%), generous 2x-10x+ climb distribution
    if (u < 0.012) {
      return { crashPoint: 1.0, serverSeed, serverSeedHash, liquidityMode: mode };
    }
    const uAdj = (u - 0.012) / (1 - 0.012);
    const raw = 1.06 / Math.pow(1 - uAdj, 1.08);
    const crashPoint = Math.min(50.0, Math.max(1.18, Math.floor(raw * 100) / 100));
    return { crashPoint, serverSeed, serverSeedHash, liquidityMode: mode };
  }

  if (mode === 'pro') {
    // Tighter curve with higher early-crash density (1.00x-1.40x), capped at 35x
    if (u < 0.075) {
      return { crashPoint: 1.0, serverSeed, serverSeedHash, liquidityMode: mode };
    }
    const uAdj = (u - 0.075) / (1 - 0.075);
    const raw = 0.91 / Math.pow(1 - uAdj, 0.86);
    const crashPoint = Math.min(35.0, Math.max(1.02, Math.floor(raw * 100) / 100));
    return { crashPoint, serverSeed, serverSeedHash, liquidityMode: mode };
  }

  if (mode === 'ultra-pro') {
    // High-defense liquidity mode with elevated early-crash frequency, capped at 25x
    if (u < 0.13) {
      return { crashPoint: 1.0, serverSeed, serverSeedHash, liquidityMode: mode };
    }
    const uAdj = (u - 0.13) / (1 - 0.13);
    const raw = 0.85 / Math.pow(1 - uAdj, 0.76);
    const crashPoint = Math.min(25.0, Math.max(1.01, Math.floor(raw * 100) / 100));
    return { crashPoint, serverSeed, serverSeedHash, liquidityMode: mode };
  }

  // 'balanced': Standard casino mix (3% instant crash, 1.2x-2.5x median with periodic 5x-25x flights)
  if (u < 0.03) {
    return { crashPoint: 1.0, serverSeed, serverSeedHash, liquidityMode: 'balanced' };
  }
  const raw = 0.97 / (1 - u);
  const crashPoint = Math.min(50.0, Math.max(1.02, Math.floor(raw * 100) / 100));
  return { crashPoint, serverSeed, serverSeedHash, liquidityMode: 'balanced' };
}

function multiplierAtElapsed(elapsedSec: number): number {
  if (elapsedSec <= 0) return 1.0;
  // Smooth exponential aviation climb: ~1.0x at 0s, ~2.0x at 6.9s, ~5.0x at 16s, ~15.0x at 27s
  const m = Math.exp(0.1 * elapsedSec);
  return Math.floor(m * 100) / 100;
}

// --- Teen Patti Provably Fair Deck & 6-Tier Hand Evaluator ---
const TEEN_PATTI_ALLOWED_BOOTS = new Set([1, 5, 10, 50, 100, 500]);
const TEEN_PATTI_RAKE_PERCENT = 10;

const TP_RANK_NAMES: Record<number, string> = {
  2: '2s', 3: '3s', 4: '4s', 5: '5s', 6: '6s', 7: '7s', 8: '8s', 9: '9s', 10: '10s',
  11: 'Jacks', 12: 'Queens', 13: 'Kings', 14: 'Aces',
};
const TP_RANK_SHORT: Record<number, string> = {
  2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10',
  11: 'J', 12: 'Q', 13: 'K', 14: 'A',
};

function deriveTeenPattiDeck(serverSeed: string): { serverSeedHash: string; deck: Card[] } {
  const serverSeedHash = crypto.createHash('sha256').update(serverSeed).digest('hex');
  const deck = buildOrderedDeck();
  for (let i = deck.length - 1; i >= 1; i--) {
    const h = crypto.createHash('sha256').update(`${serverSeed}:tp:${i}`).digest('hex');
    const j = parseInt(h.slice(0, 8), 16) % (i + 1);
    const tmp = deck[i];
    deck[i] = deck[j];
    deck[j] = tmp;
  }
  return { serverSeedHash, deck };
}

function isValidCardPayload(card: unknown): card is Card {
  if (!card || typeof card !== 'object') return false;
  const c = card as Record<string, unknown>;
  return (
    Number.isInteger(c.rank) &&
    Number(c.rank) >= 2 &&
    Number(c.rank) <= 14 &&
    typeof c.label === 'string' &&
    c.label.length >= 1 &&
    c.label.length <= 2 &&
    (c.suit === 'spades' || c.suit === 'hearts' || c.suit === 'diamonds' || c.suit === 'clubs')
  );
}

function evaluateTeenPattiHandServer(cards: Card[]): {
  category: 'trail' | 'pure_sequence' | 'sequence' | 'color' | 'pair' | 'high_card';
  label: string;
  rankValue: number;
  score: number;
} {
  const sorted = [...cards].sort((a, b) => b.rank - a.rank);
  const [r1, r2, r3] = [sorted[0].rank, sorted[1].rank, sorted[2].rank];
  const sameSuit = sorted[0].suit === sorted[1].suit && sorted[1].suit === sorted[2].suit;

  if (r1 === r2 && r2 === r3) {
    return {
      category: 'trail',
      label: `TRAIL OF ${(TP_RANK_NAMES[r1] || String(r1)).toUpperCase()}`,
      rankValue: 6,
      score: 6 * 1_000_000 + r1 * 1000,
    };
  }

  const isAKQ = r1 === 14 && r2 === 13 && r3 === 12;
  const isA23 = r1 === 14 && r2 === 3 && r3 === 2;
  const isNormalSeq = r1 - 1 === r2 && r2 - 1 === r3;
  const isSequence = isAKQ || isA23 || isNormalSeq;
  const seqRank = isAKQ ? 140 : isA23 ? 135 : isNormalSeq ? r1 * 10 : 0;

  if (sameSuit && isSequence) {
    return {
      category: 'pure_sequence',
      label: 'PURE SEQUENCE',
      rankValue: 5,
      score: 5 * 1_000_000 + seqRank * 1000,
    };
  }
  if (isSequence) {
    return {
      category: 'sequence',
      label: 'SEQUENCE',
      rankValue: 4,
      score: 4 * 1_000_000 + seqRank * 1000,
    };
  }
  if (sameSuit) {
    return {
      category: 'color',
      label: 'COLOR',
      rankValue: 3,
      score: 3 * 1_000_000 + r1 * 256 + r2 * 16 + r3,
    };
  }
  if (r1 === r2 || r2 === r3) {
    const pairRank = r1 === r2 ? r1 : r2;
    const kicker = r1 === r2 ? r3 : r1;
    return {
      category: 'pair',
      label: `PAIR OF ${(TP_RANK_NAMES[pairRank] || String(pairRank)).toUpperCase()}`,
      rankValue: 2,
      score: 2 * 1_000_000 + pairRank * 256 + kicker,
    };
  }
  return {
    category: 'high_card',
    label: `HIGH CARD ${TP_RANK_SHORT[r1] || String(r1)}`,
    rankValue: 1,
    score: 1 * 1_000_000 + r1 * 256 + r2 * 16 + r3,
  };
}

// Ludo board geometry constants (shared truth for server-side move validation & auto-move)
const LUDO_SAFE_TRACK_INDICES = new Set([0, 8, 13, 21, 26, 34, 39, 47]);
const LUDO_START_OFFSETS: Record<string, number> = {
  red: 0,
  green: 13,
  yellow: 26,
  blue: 39,
};

function validateLudoMove(params: {
  color: string;
  tokenIndex: number;
  dice: number;
  tokens: Record<string, number[]>;
  tokensToWin?: number;
}) {
  const { color, tokenIndex, dice, tokens } = params;
  const targetWinCount = params.tokensToWin === 1 ? 1 : 4;
  if (!['red', 'green', 'yellow', 'blue'].includes(color)) {
    return { valid: false, error: 'Invalid player color' };
  }
  if (!Number.isInteger(tokenIndex) || tokenIndex < 0 || tokenIndex > 3) {
    return { valid: false, error: 'Invalid token index' };
  }
  if (!Number.isInteger(dice) || dice < 1 || dice > 6) {
    return { valid: false, error: 'Invalid dice value' };
  }
  const colorTokens = tokens[color];
  if (!Array.isArray(colorTokens) || colorTokens.length !== 4) {
    return { valid: false, error: 'Invalid token state' };
  }

  const currentProgress = colorTokens[tokenIndex];
  if (!Number.isInteger(currentProgress) || currentProgress < -1 || currentProgress > 57) {
    return { valid: false, error: 'Corrupt token progress' };
  }

  let nextProgress: number;
  if (currentProgress === -1) {
    if (dice !== 6) {
      return { valid: false, error: 'A roll of 6 is required to exit home' };
    }
    nextProgress = 0;
  } else {
    nextProgress = currentProgress + dice;
    if (nextProgress > 57) {
      return { valid: false, error: 'Exact dice roll required to reach home finish' };
    }
  }

  const nextTokens: Record<string, number[]> = {
    red: [...(tokens.red || [-1, -1, -1, -1])],
    green: [...(tokens.green || [-1, -1, -1, -1])],
    yellow: [...(tokens.yellow || [-1, -1, -1, -1])],
    blue: [...(tokens.blue || [-1, -1, -1, -1])],
  };
  nextTokens[color][tokenIndex] = nextProgress;

  let captured: { color: string; tokenIndex: number } | null = null;
  if (nextProgress >= 0 && nextProgress <= 51) {
    const absPos = (LUDO_START_OFFSETS[color] + nextProgress) % 52;
    if (!LUDO_SAFE_TRACK_INDICES.has(absPos)) {
      for (const oppColor of ['red', 'green', 'yellow', 'blue']) {
        if (oppColor === color) continue;
        const oppArr = nextTokens[oppColor];
        for (let i = 0; i < 4; i++) {
          const p = oppArr[i];
          if (p >= 0 && p <= 51) {
            const oppAbs = (LUDO_START_OFFSETS[oppColor] + p) % 52;
            if (oppAbs === absPos) {
              oppArr[i] = -1;
              captured = { color: oppColor, tokenIndex: i };
            }
          }
        }
      }
    }
  }

  const finishedNow = nextProgress === 57;
  const allFinished = nextTokens[color].filter((p) => p === 57).length >= targetWinCount;
  const bonusTurn = !allFinished && (dice === 6 || captured !== null || finishedNow);

  return {
    valid: true,
    nextProgress,
    nextTokens,
    captured,
    finishedNow,
    allFinished,
    bonusTurn,
  };
}

function computeLudoThreatExposure(
  color: string,
  progress: number,
  tokens: Record<string, number[]>,
): number {
  if (progress < 0 || progress > 51) return 0;
  const absPos = (LUDO_START_OFFSETS[color] + progress) % 52;
  if (LUDO_SAFE_TRACK_INDICES.has(absPos)) return 0;

  let threats = 0;
  for (const oppColor of ['red', 'green', 'yellow', 'blue']) {
    if (oppColor === color) continue;
    const oppArr = tokens[oppColor] || [];
    for (let i = 0; i < 4; i++) {
      const oppProg = oppArr[i];
      if (oppProg < 0 || oppProg > 51) continue;
      const oppAbs = (LUDO_START_OFFSETS[oppColor] + oppProg) % 52;
      const dist = (absPos - oppAbs + 52) % 52;
      if (dist >= 1 && dist <= 6 && oppProg + dist <= 51) {
        threats += 1;
      } else if (dist >= 7 && dist <= 12 && oppProg + dist <= 51) {
        threats += 0.25;
      }
    }
  }
  return threats;
}

function countForwardCaptureTargets(
  color: string,
  progress: number,
  tokens: Record<string, number[]>,
): number {
  if (progress < 0 || progress > 51) return 0;
  const absPos = (LUDO_START_OFFSETS[color] + progress) % 52;
  let targets = 0;
  for (const oppColor of ['red', 'green', 'yellow', 'blue']) {
    if (oppColor === color) continue;
    const oppArr = tokens[oppColor] || [];
    for (let i = 0; i < 4; i++) {
      const oppProg = oppArr[i];
      if (oppProg < 0 || oppProg > 51) continue;
      const oppAbs = (LUDO_START_OFFSETS[oppColor] + oppProg) % 52;
      if (LUDO_SAFE_TRACK_INDICES.has(oppAbs)) continue;
      const dist = (oppAbs - absPos + 52) % 52;
      if (dist >= 1 && dist <= 6 && progress + dist <= 51) {
        targets += 1 + oppProg / 52;
      }
    }
  }
  return targets;
}

function chooseBestLudoToken(
  color: string,
  dice: number,
  tokens: Record<string, number[]>,
  tokensToWin = 4
): { tokenIndex: number; move: ReturnType<typeof validateLudoMove> } | null {
  const mode = platformLiquidityConfig.liquidityMode;
  const candidates: Array<{ tokenIndex: number; score: number; move: ReturnType<typeof validateLudoMove> }> = [];

  for (let i = 0; i < 4; i++) {
    const move = validateLudoMove({ color, tokenIndex: i, dice, tokens, tokensToWin });
    if (!move.valid || move.nextProgress === undefined || !move.nextTokens) continue;

    const currentProgress = tokens[color][i];
    const nextProgress = move.nextProgress;
    const beforeThreat = computeLudoThreatExposure(color, currentProgress, tokens);
    const afterThreat = computeLudoThreatExposure(color, nextProgress, move.nextTokens);

    let score = 0;
    if (move.allFinished) score += 4000;
    if (move.finishedNow) score += mode === 'ultra-pro' ? 1400 : 950;

    // Capture priority scales cleanly with liquidity mode
    if (move.captured) {
      const capturedOppProg = tokens[move.captured.color]?.[move.captured.tokenIndex] ?? 0;
      const baseCapture =
        mode === 'easy'
          ? 420
          : mode === 'balanced'
            ? 760
            : mode === 'pro'
              ? 1050
              : 1300;
      score += baseCapture + Math.max(0, capturedOppProg) * (mode === 'ultra-pro' ? 14 : 6);
    }

    // Unlock token from yard on 6
    if (currentProgress === -1 && dice === 6) {
      const activeOnBoard = (tokens[color] || []).filter((p) => p >= 0 && p < 57).length;
      score += activeOnBoard === 0 ? 700 : mode === 'ultra-pro' && tokensToWin === 1 ? 260 : 480;
    }

    // Enter safe home stretch (progress 52..56)
    if (nextProgress >= 52 && currentProgress < 52) {
      score += mode === 'ultra-pro' ? 780 : mode === 'pro' ? 560 : 420;
    }

    // Land on safe star tile
    if (nextProgress >= 0 && nextProgress <= 51) {
      const absPos = (LUDO_START_OFFSETS[color] + nextProgress) % 52;
      if (LUDO_SAFE_TRACK_INDICES.has(absPos)) {
        score += mode === 'ultra-pro' ? 420 : mode === 'pro' ? 340 : 260;
      }
    }

    // Pro & Ultra-Pro: escape danger, avoid walking into opponent capture range, stalk opponent lead tokens
    if (mode === 'pro' || mode === 'ultra-pro') {
      const threatWeight = mode === 'ultra-pro' ? 320 : 190;
      const progressRiskFactor = 1 + Math.max(0, currentProgress) / 40;
      score += (beforeThreat - afterThreat) * threatWeight * progressRiskFactor;

      // Stalking bonus: position 1-6 tiles behind an exposed opponent
      const forwardTargets = countForwardCaptureTargets(color, nextProgress, move.nextTokens);
      score += forwardTargets * (mode === 'ultra-pro' ? 155 : 90);
    }

    // Ultra-Pro: full multi-step board lookahead across our entire fleet + opponent finish race
    if (mode === 'ultra-pro') {
      // Penalize leaving a safe star if landing on an exposed square
      if (currentProgress >= 0 && currentProgress <= 51) {
        const curAbs = (LUDO_START_OFFSETS[color] + currentProgress) % 52;
        if (LUDO_SAFE_TRACK_INDICES.has(curAbs) && afterThreat > 0) {
          score -= 340 * afterThreat;
        }
      }
      // Bonus for Quick Mode (1-token) lead rush into home column
      if (tokensToWin === 1) {
        score += Math.max(0, nextProgress) * 14;
      }
      // Sum fleet-wide threat delta on the resulting board
      let fleetThreat = 0;
      for (let k = 0; k < 4; k++) {
        fleetThreat += computeLudoThreatExposure(color, move.nextTokens[color][k], move.nextTokens);
      }
      score -= fleetThreat * 75;
    }

    // Advance tokens further along track
    score += Math.max(0, currentProgress) * (mode === 'ultra-pro' ? 6 : 3);
    candidates.push({ tokenIndex: i, score, move });
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.score - a.score);

  // Easy mode: occasional casual / sub-optimal token picks for smoother user retention
  if (mode === 'easy' && candidates.length > 1 && crypto.randomInt(0, 100) < 42) {
    const pickIdx = candidates.length > 2 && crypto.randomInt(0, 100) < 35 ? 2 : 1;
    return { tokenIndex: candidates[pickIdx].tokenIndex, move: candidates[pickIdx].move };
  }

  return { tokenIndex: candidates[0].tokenIndex, move: candidates[0].move };
}

// Daily Spin Wheel segments (server-authoritative weighted RNG)
const SPIN_SEGMENTS = [
  { reward: 250, label: '250', weight: 28 },
  { reward: 500, label: '500', weight: 24 },
  { reward: 750, label: '750', weight: 18 },
  { reward: 1000, label: '1,000', weight: 12 },
  { reward: 1500, label: '1.5K', weight: 8 },
  { reward: 2500, label: '2.5K', weight: 5 },
  { reward: 4000, label: '4K', weight: 3 },
  { reward: 5000, label: '5K JACKPOT', weight: 2 },
];

function isSafeHttpsUrl(raw: string): boolean {
  if (!raw || typeof raw !== 'string') return false;
  try {
    const parsed = new URL(raw.trim());
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '128kb' }));

  // Health & APK config endpoint
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, timestamp: Date.now() });
  });

  app.get('/api/config/apk', (_req, res) => {
    const rawUrl = (process.env.APK_DOWNLOAD_URL || '').trim();
    const validUrl = isSafeHttpsUrl(rawUrl) ? rawUrl : '';
    res.json({
      available: true,
      downloadUrl: validUrl || '/api/download-apk',
      version: process.env.APK_VERSION || '1.2.0',
      size: process.env.APK_SIZE || '48.6 MB',
      updatedAt: process.env.APK_UPDATED_AT || '2026-11-27',
      androidCompat: process.env.APK_ANDROID_COMPAT || 'Android 9.0 (Pie) or higher · ARM64 / ARMv7',
    });
  });

  app.get('/api/download-apk', (_req, res) => {
    const apkData = Buffer.from(
      'PK\x03\x04\x14\x00\x00\x00\x08\x00\x00\x00!\x00' +
        'aurelia_arena_companion_v1.2.0\x00\x01\x00\x00\x00' +
        'Aurelia Arena 3D Android Companion Build — Install & Play with Cloud Wallet Sync.',
      'utf8',
    );
    res.setHeader('Content-Type', 'application/vnd.android.package-archive');
    res.setHeader('Content-Disposition', 'attachment; filename="aurelia-arena-v1.2.0.apk"');
    res.setHeader('Content-Length', apkData.length);
    res.send(apkData);
  });

  // Public unified liquidity & matchmaking config endpoint
  app.get('/api/config/liquidity', (_req, res) => {
    res.json({
      ...platformLiquidityConfig,
      effectiveAviatorPayoutCap: getEffectiveAviatorPayoutCap(
        platformLiquidityConfig.liquidityMode,
        platformLiquidityConfig.maxRoundPayoutCap,
      ),
      effectiveDragonTigerPayoutCap: getEffectiveDragonTigerPayoutCap(
        platformLiquidityConfig.liquidityMode,
        platformLiquidityConfig.maxRoundPayoutCap,
      ),
    });
  });

  // Backwards-compatible public matchmaking telemetry
  app.get('/api/config/matchmaking', (_req, res) => {
    res.json({
      difficulty: mapLiquidityToLegacyDifficulty(platformLiquidityConfig.liquidityMode),
      liquidityMode: platformLiquidityConfig.liquidityMode,
      smartMatchmakingEnabled: platformLiquidityConfig.smartMatchmakingEnabled,
      matchmakingWaitSeconds: platformLiquidityConfig.matchmakingWaitSeconds,
    });
  });

  // Admin: Verify Firebase ID token & administrator status
  app.get('/api/admin/verify', requireAdminMiddleware, (req: AdminAuthedRequest, res) => {
    res.json({
      ok: true,
      isAdmin: true,
      uid: req.adminUser?.uid || '',
      email: req.adminUser?.email || '',
      role: 'admin',
      isRootAdmin: Boolean(req.adminUser?.isRootAdmin),
      matchmakingDifficulty: mapLiquidityToLegacyDifficulty(platformLiquidityConfig.liquidityMode),
      platformLiquidity: platformLiquidityConfig,
    });
  });

  // Admin: Update unified 4-Tier Liquidity & Risk Control configuration (syncs immediately across all 4 games)
  app.post('/api/admin/liquidity', requireAdminMiddleware, (req: AdminAuthedRequest, res) => {
    const rawMode = String(req.body?.liquidityMode || '').trim().toLowerCase() as LiquidityMode;
    if (!VALID_LIQUIDITY_MODES.has(rawMode)) {
      res.status(400).json({
        ok: false,
        error: 'liquidityMode must be easy, balanced, pro, or ultra-pro.',
      });
      return;
    }

    const rawCap = Math.round(Number(req.body?.maxRoundPayoutCap));
    if (!Number.isFinite(rawCap) || rawCap < 100 || rawCap > 5_000_000) {
      res.status(400).json({
        ok: false,
        error: 'maxRoundPayoutCap must be between ₹100 and ₹5,000,000.',
      });
      return;
    }

    const smartEnabled =
      typeof req.body?.smartMatchmakingEnabled === 'boolean'
        ? req.body.smartMatchmakingEnabled
        : platformLiquidityConfig.smartMatchmakingEnabled;

    const rawWait = Math.round(Number(req.body?.matchmakingWaitSeconds ?? platformLiquidityConfig.matchmakingWaitSeconds));
    if (!Number.isFinite(rawWait) || rawWait < 5 || rawWait > 15) {
      res.status(400).json({
        ok: false,
        error: 'matchmakingWaitSeconds must be between 5 and 15 seconds.',
      });
      return;
    }

    const rawWelcomeBonus = Math.round(
      Number(req.body?.welcomeBonusAmount ?? platformLiquidityConfig.welcomeBonusAmount),
    );
    if (!Number.isFinite(rawWelcomeBonus) || rawWelcomeBonus < 0 || rawWelcomeBonus > 500) {
      res.status(400).json({
        ok: false,
        error: 'welcomeBonusAmount must be between ₹0 and ₹500.',
      });
      return;
    }

    const requireFirstDeposit =
      typeof req.body?.requireFirstDepositToWithdraw === 'boolean'
        ? req.body.requireFirstDepositToWithdraw
        : platformLiquidityConfig.requireFirstDepositToWithdraw;

    platformLiquidityConfig = {
      liquidityMode: rawMode,
      maxRoundPayoutCap: rawCap,
      smartMatchmakingEnabled: smartEnabled,
      matchmakingWaitSeconds: rawWait,
      welcomeBonusAmount: rawWelcomeBonus,
      requireFirstDepositToWithdraw: requireFirstDeposit,
    };

    res.json({
      ok: true,
      ...platformLiquidityConfig,
      effectiveAviatorPayoutCap: getEffectiveAviatorPayoutCap(rawMode, rawCap),
      effectiveDragonTigerPayoutCap: getEffectiveDragonTigerPayoutCap(rawMode, rawCap),
      updatedBy: req.adminUser?.email || req.adminUser?.uid || 'admin',
    });
  });

  // Backwards-compatible Admin matchmaking difficulty update
  app.post('/api/admin/matchmaking', requireAdminMiddleware, (req: AdminAuthedRequest, res) => {
    const raw = String(req.body?.difficulty || '').trim().toLowerCase();
    if (raw !== 'casual' && raw !== 'balanced' && raw !== 'competitive') {
      res.status(400).json({
        ok: false,
        error: 'Difficulty must be casual, balanced, or competitive.',
      });
      return;
    }
    platformLiquidityConfig = {
      ...platformLiquidityConfig,
      liquidityMode: raw === 'casual' ? 'easy' : raw === 'competitive' ? 'pro' : 'balanced',
    };
    res.json({
      ok: true,
      difficulty: raw,
      liquidityMode: platformLiquidityConfig.liquidityMode,
      updatedBy: req.adminUser?.email || req.adminUser?.uid || 'admin',
    });
  });

  // Dragon Tiger: Step 1 — Pre-round Provably Fair SHA-256 commit BEFORE player bets
  app.post('/api/games/dragon-tiger/prepare', (_req, res) => {
    const round = createDragonTigerRound();
    const effectivePayoutCap = getEffectiveDragonTigerPayoutCap(
      platformLiquidityConfig.liquidityMode,
      platformLiquidityConfig.maxRoundPayoutCap,
    );
    res.json({
      roundId: round.roundId,
      serverSeedHash: round.serverSeedHash,
      seedHash: round.serverSeedHash,
      liquidityMode: platformLiquidityConfig.liquidityMode,
      maxRoundPayoutCap: effectivePayoutCap,
      timestamp: round.createdAtMs,
    });
  });

  // Dragon Tiger: Step 2 — Reveal committed 52-card fair outcome + enforce per-round house exposure cap
  app.post('/api/games/dragon-tiger/deal', (req, res) => {
    const rawBet = req.body?.betAmount;
    if (rawBet !== undefined && rawBet !== null && Number(rawBet) !== 0) {
      const wager = Number(rawBet);
      if (!Number.isFinite(wager) || wager < 1 || wager > 1000000) {
        res.status(400).json({ error: 'Minimum bet amount is 1 coin' });
        return;
      }
    }

    const requestedRoundId = typeof req.body?.roundId === 'string' ? req.body.roundId.trim() : '';
    let round: DragonTigerRoundRecord | undefined;

    if (requestedRoundId && /^[a-zA-Z0-9_\-]+$/.test(requestedRoundId)) {
      const existing = dragonTigerRounds.get(requestedRoundId);
      if (existing && !existing.dealt) {
        round = existing;
      }
    }

    if (!round) {
      round = createDragonTigerRound();
    }

    round.dealt = true;

    const effectivePayoutCap = getEffectiveDragonTigerPayoutCap(
      platformLiquidityConfig.liquidityMode,
      platformLiquidityConfig.maxRoundPayoutCap,
    );

    let rawPayout: number | undefined;
    let payout: number | undefined;
    let payoutCapped = false;

    const rawBets = req.body?.bets;
    if (rawBets && typeof rawBets === 'object') {
      const dBet = Math.max(0, Math.min(1_000_000, Math.floor(Number(rawBets.dragon) || 0)));
      const tBet = Math.max(0, Math.min(1_000_000, Math.floor(Number(rawBets.tiger) || 0)));
      const tieBet = Math.max(0, Math.min(1_000_000, Math.floor(Number(rawBets.tie) || 0)));

      if (round.winner === 'dragon') {
        rawPayout = dBet * 2;
      } else if (round.winner === 'tiger') {
        rawPayout = tBet * 2;
      } else {
        rawPayout = tieBet * 9 + Math.floor((dBet + tBet) * 0.5);
      }

      if (rawPayout > effectivePayoutCap) {
        payout = effectivePayoutCap;
        payoutCapped = true;
      } else {
        payout = rawPayout;
      }
    }

    res.json({
      roundId: round.roundId,
      dragonCard: round.dragonCard,
      tigerCard: round.tigerCard,
      winner: round.winner,
      serverSeed: round.serverSeed,
      serverSeedHash: round.serverSeedHash,
      seedHash: round.serverSeedHash,
      liquidityMode: platformLiquidityConfig.liquidityMode,
      maxRoundPayoutCap: effectivePayoutCap,
      rawPayout,
      payout,
      payoutCapped,
      timestamp: Date.now(),
    });
  });

  // Aviator: Server-authoritative flight start (pre-round curve committed BEFORE takeoff!)
  app.post('/api/games/aviator/start', (_req, res) => {
    cleanupOldRounds();
    const roundId = `av_${crypto.randomBytes(8).toString('hex')}`;
    const activeMode = platformLiquidityConfig.liquidityMode;
    const effectiveCap = getEffectiveAviatorPayoutCap(
      activeMode,
      platformLiquidityConfig.maxRoundPayoutCap,
    );
    const { crashPoint, serverSeed, serverSeedHash } = generateFairCrashPoint(activeMode);
    const startTimeMs = Date.now();

    aviatorRounds.set(roundId, {
      roundId,
      serverSeed,
      serverSeedHash,
      crashPoint,
      startTimeMs,
      crashed: false,
      cashedOutSessions: new Set(),
      liquidityMode: activeMode,
      maxRoundPayoutCap: effectiveCap,
    });

    res.json({
      roundId,
      serverSeedHash,
      seedHash: serverSeedHash,
      liquidityMode: activeMode,
      maxRoundPayoutCap: effectiveCap,
      startTimeMs,
      serverNowMs: startTimeMs,
    });
  });

  // Aviator: Poll authoritative flight telemetry (reveals crashPoint & serverSeed ONLY after crash)
  app.get('/api/games/aviator/status/:roundId', (req, res) => {
    const roundId = String(req.params.roundId || '');
    if (!/^[a-zA-Z0-9_\-]+$/.test(roundId)) {
      res.status(400).json({ error: 'Invalid round ID' });
      return;
    }
    const round = aviatorRounds.get(roundId);
    if (!round) {
      res.status(404).json({ error: 'Round not found' });
      return;
    }
    const nowMs = Date.now();
    const elapsedSec = Math.max(0, (nowMs - round.startTimeMs) / 1000);
    const liveMult = multiplierAtElapsed(elapsedSec);
    if (liveMult >= round.crashPoint) {
      round.crashed = true;
      res.json({
        roundId,
        status: 'crashed',
        currentMultiplier: round.crashPoint,
        crashPoint: round.crashPoint,
        serverSeed: round.serverSeed,
        serverSeedHash: round.serverSeedHash,
        seedHash: round.serverSeedHash,
        serverNowMs: nowMs,
      });
      return;
    }
    res.json({
      roundId,
      status: 'flying',
      currentMultiplier: liveMult,
      serverSeedHash: round.serverSeedHash,
      seedHash: round.serverSeedHash,
      serverNowMs: nowMs,
    });
  });

  // Aviator: Server-validated cash-out
  app.post('/api/games/aviator/cashout', (req, res) => {
    const { roundId, sessionKey, betAmount, autoCashoutAt } = req.body || {};
    if (typeof roundId !== 'string' || !/^[a-zA-Z0-9_\-]+$/.test(roundId)) {
      res.status(400).json({ error: 'Invalid roundId' });
      return;
    }
    const wager = Number(betAmount);
    if (!Number.isFinite(wager) || wager < 1 || wager > 1000000) {
      res.status(400).json({ error: 'Minimum bet amount is 1 coin' });
      return;
    }
    const round = aviatorRounds.get(roundId);
    if (!round) {
      res.status(404).json({ error: 'Round expired or not found' });
      return;
    }
    const key = typeof sessionKey === 'string' && sessionKey.length <= 64 ? sessionKey : 'player';
    if (round.cashedOutSessions.has(key)) {
      res.status(409).json({ error: 'Already cashed out for this round' });
      return;
    }

    const elapsedSec = Math.max(0, (Date.now() - round.startTimeMs) / 1000);
    const liveMult = multiplierAtElapsed(elapsedSec);
    // Support accurate auto cash-out if target was strictly below crash point and reached
    let settledMultiplier = liveMult;
    const autoTarget = Number(autoCashoutAt);
    if (Number.isFinite(autoTarget) && autoTarget >= 1.05 && autoTarget < round.crashPoint && liveMult >= autoTarget) {
      settledMultiplier = Math.floor(autoTarget * 100) / 100;
    } else if (round.crashed || liveMult >= round.crashPoint) {
      round.crashed = true;
      res.json({
        cashedOut: false,
        status: 'crashed',
        crashPoint: round.crashPoint,
        serverSeed: round.serverSeed,
        serverSeedHash: round.serverSeedHash,
        seedHash: round.serverSeedHash,
      });
      return;
    }

    round.cashedOutSessions.add(key);
    const rawPayout = Math.round(wager * settledMultiplier);
    const payoutCap = round.maxRoundPayoutCap || getEffectiveAviatorPayoutCap(
      platformLiquidityConfig.liquidityMode,
      platformLiquidityConfig.maxRoundPayoutCap,
    );
    const payoutCapped = rawPayout > payoutCap;
    const payout = payoutCapped ? payoutCap : rawPayout;

    res.json({
      cashedOut: true,
      multiplier: settledMultiplier,
      rawPayout,
      payout,
      payoutCapped,
      maxRoundPayoutCap: payoutCap,
      liquidityMode: round.liquidityMode,
      serverSeedHash: round.serverSeedHash,
      seedHash: round.serverSeedHash,
    });
  });

  const LUDO_ALLOWED_ENTRY_FEES = new Set([1, 5, 10, 50, 100, 500]);
  const calculateLudoTablePrize = (entryFee: number, maxPlayers: number): number =>
    Math.max(1, Math.round(entryFee * maxPlayers * 0.9));

  // Ludo: Server-authoritative real-money entry fee table validation (10% platform rake)
  app.post('/api/games/ludo/validate-table', (req, res) => {
    const { entryFee, maxPlayers, gameMode, tokensToWin, playableBalance } = req.body || {};
    const fee = Math.round(Number(entryFee));
    const players = Number(maxPlayers) === 4 ? 4 : Number(maxPlayers) === 2 ? 2 : 0;
    const mode =
      gameMode === 'quick' || gameMode === 'classic' || gameMode === 'private' ? gameMode : null;

    if (!LUDO_ALLOWED_ENTRY_FEES.has(fee)) {
      res.status(400).json({
        ok: false,
        error: 'Select a valid Ludo entry table (₹1, ₹5, ₹10, ₹50, ₹100, or ₹500).',
      });
      return;
    }
    if (!players) {
      res.status(400).json({ ok: false, error: 'Player count must be 1v1 (2P) or 4P.' });
      return;
    }
    if (!mode) {
      res.status(400).json({ ok: false, error: 'Invalid Ludo game mode.' });
      return;
    }
    if (playableBalance !== undefined && playableBalance !== null) {
      const bal = Number(playableBalance);
      if (!Number.isFinite(bal) || bal < fee) {
        res.status(400).json({
          ok: false,
          error: `Insufficient playable wallet balance for the ₹${fee} table.`,
        });
        return;
      }
    }

    const resolvedTokensToWin = mode === 'quick' ? 1 : mode === 'private' && Number(tokensToWin) === 1 ? 1 : 4;
    const prizeMultiplier = players === 2 ? 1.8 : 3.6;
    const winPrize = calculateLudoTablePrize(fee, players);

    res.json({
      ok: true,
      entryFee: fee,
      maxPlayers: players,
      gameMode: mode,
      tokensToWin: resolvedTokensToWin,
      rakePercent: 10,
      prizeMultiplier,
      winPrize,
    });
  });

  // Ludo: Server-authoritative cryptographic dice roll
  app.post('/api/games/ludo/roll', (_req, res) => {
    const serverSeed = crypto.randomBytes(16).toString('hex');
    const serverSeedHash = crypto.createHash('sha256').update(serverSeed).digest('hex');
    const dice = (parseInt(serverSeedHash.slice(0, 8), 16) % 6) + 1;
    const rollId = `lr_${crypto.randomBytes(6).toString('hex')}`;
    res.json({
      dice,
      rollId,
      serverSeed,
      serverSeedHash,
      seedHash: serverSeedHash,
    });
  });

  // Ludo: Server-side move validation (supports Classic 4-token & Quick 1-token win)
  app.post('/api/games/ludo/validate-move', (req, res) => {
    const { color, tokenIndex, dice, tokens, tokensToWin, entryFee } = req.body || {};
    if (entryFee !== undefined && entryFee !== null) {
      const fee = Number(entryFee);
      if (!Number.isFinite(fee) || fee < 1 || fee > 1000000) {
        res.status(400).json({ valid: false, error: 'Minimum entry fee is ₹1' });
        return;
      }
    }
    const targetWin = Number(tokensToWin) === 1 ? 1 : 4;
    const result = validateLudoMove({ color, tokenIndex, dice, tokens, tokensToWin: targetWin });
    if (!result.valid) {
      res.status(400).json(result);
      return;
    }
    res.json(result);
  });

  // Ludo: Server-authoritative auto-move (used for 15s timeout & smart bots)
  app.post('/api/games/ludo/auto-move', (req, res) => {
    const {
      color,
      dice: incomingDice,
      diceRolled,
      consecutiveSixes = 0,
      tokens,
      tokensToWin,
    } = req.body || {};
    const targetWin = Number(tokensToWin) === 1 ? 1 : 4;
    if (!['red', 'green', 'yellow', 'blue'].includes(String(color))) {
      res.status(400).json({ error: 'Invalid player color' });
      return;
    }
    if (!tokens || typeof tokens !== 'object') {
      res.status(400).json({ error: 'Missing token board state' });
      return;
    }

    const serverSeed = crypto.randomBytes(16).toString('hex');
    const serverSeedHash = crypto.createHash('sha256').update(serverSeed).digest('hex');
    const dice =
      diceRolled && Number.isInteger(incomingDice) && incomingDice >= 1 && incomingDice <= 6
        ? incomingDice
        : (parseInt(serverSeedHash.slice(0, 8), 16) % 6) + 1;

    const nextSixCount = dice === 6 ? Number(consecutiveSixes || 0) + 1 : 0;
    if (nextSixCount >= 3) {
      res.json({
        dice,
        threeSixes: true,
        noLegalMoves: true,
        chosenTokenIndex: null,
        nextTokens: tokens,
        captured: null,
        finishedNow: false,
        allFinished: false,
        bonusTurn: false,
        serverSeedHash,
      });
      return;
    }

    const best = chooseBestLudoToken(String(color), dice, tokens, targetWin);
    if (!best || !best.move.valid) {
      res.json({
        dice,
        threeSixes: false,
        noLegalMoves: true,
        chosenTokenIndex: null,
        nextTokens: tokens,
        captured: null,
        finishedNow: false,
        allFinished: false,
        bonusTurn: false,
        serverSeedHash,
      });
      return;
    }

    res.json({
      dice,
      threeSixes: false,
      noLegalMoves: false,
      chosenTokenIndex: best.tokenIndex,
      nextTokens: best.move.nextTokens,
      captured: best.move.captured,
      finishedNow: best.move.finishedNow,
      allFinished: best.move.allFinished,
      bonusTurn: best.move.bonusTurn,
      serverSeedHash,
    });
  });

  // Teen Patti: Validate Boot Table & Wallet Balance
  app.post('/api/games/teen-patti/validate-table', (req, res) => {
    const { bootAmount, playableBalance } = req.body || {};
    const boot = Math.round(Number(bootAmount));
    if (!TEEN_PATTI_ALLOWED_BOOTS.has(boot)) {
      res.status(400).json({
        ok: false,
        error: 'Select a valid Teen Patti boot table (₹1, ₹5, ₹10, ₹50, ₹100, or ₹500).',
      });
      return;
    }
    if (playableBalance !== undefined && playableBalance !== null) {
      const bal = Number(playableBalance);
      if (!Number.isFinite(bal) || bal < boot) {
        res.status(400).json({
          ok: false,
          error: `Insufficient playable wallet balance for the ₹${boot} boot table.`,
        });
        return;
      }
    }
    res.json({
      ok: true,
      bootAmount: boot,
      chaalLimit: boot * 128,
      potLimit: boot * 1024,
      rakePercent: TEEN_PATTI_RAKE_PERCENT,
    });
  });

  // Teen Patti: Server-authoritative SHA-256 deal (serverSeed stays sealed until showdown!)
  app.post('/api/games/teen-patti/deal', (req, res) => {
    cleanupOldRounds();
    const rawSeatCount = Math.round(Number(req.body?.seatCount));
    const seatCount = Number.isInteger(rawSeatCount) && rawSeatCount >= 2 && rawSeatCount <= 5 ? rawSeatCount : 0;
    const bootAmount = Math.round(Number(req.body?.bootAmount));

    if (!seatCount) {
      res.status(400).json({ error: 'Teen Patti requires between 2 and 5 seated players.' });
      return;
    }
    if (!TEEN_PATTI_ALLOWED_BOOTS.has(bootAmount)) {
      res.status(400).json({ error: 'Invalid Teen Patti boot table.' });
      return;
    }

    const roundId = `tp_${crypto.randomBytes(8).toString('hex')}`;
    const serverSeed = crypto.randomBytes(24).toString('hex');
    const { serverSeedHash, deck } = deriveTeenPattiDeck(serverSeed);
    const hands: Card[][] = [];
    for (let s = 0; s < seatCount; s++) {
      hands.push(deck.slice(s * 3, s * 3 + 3));
    }

    teenPattiRounds.set(roundId, {
      roundId,
      serverSeed,
      serverSeedHash,
      bootAmount,
      seatCount,
      hands,
      createdAtMs: Date.now(),
      revealed: false,
    });

    res.json({
      roundId,
      serverSeedHash,
      seedHash: serverSeedHash,
      hands,
      timestamp: Date.now(),
    });
  });

  // Teen Patti: Server-side Side Show private comparison (on exact tie, target/defender wins)
  app.post('/api/games/teen-patti/side-show', (req, res) => {
    const { requesterUid, targetUid, requesterCards, targetCards } = req.body || {};
    if (typeof requesterUid !== 'string' || typeof targetUid !== 'string' || !requesterUid || !targetUid) {
      res.status(400).json({ error: 'Invalid side-show participant IDs.' });
      return;
    }
    if (
      !Array.isArray(requesterCards) ||
      requesterCards.length !== 3 ||
      !requesterCards.every(isValidCardPayload) ||
      !Array.isArray(targetCards) ||
      targetCards.length !== 3 ||
      !targetCards.every(isValidCardPayload)
    ) {
      res.status(400).json({ error: 'Both hands must contain 3 valid playing cards.' });
      return;
    }

    const reqEval = evaluateTeenPattiHandServer(requesterCards);
    const tgtEval = evaluateTeenPattiHandServer(targetCards);
    // Standard Teen Patti rule: on exact tie during a Side Show, the requester packs (defender wins)
    const winnerUid = reqEval.score > tgtEval.score ? requesterUid : targetUid;
    const loserUid = winnerUid === requesterUid ? targetUid : requesterUid;

    res.json({
      winnerUid,
      loserUid,
      requesterEval: reqEval,
      targetEval: tgtEval,
    });
  });

  // Teen Patti: Server-authoritative Showdown & Seed Reveal (awards Pot minus 10% platform rake)
  app.post('/api/games/teen-patti/showdown', (req, res) => {
    const { roundId, players, pot, initiatorUid } = req.body || {};
    if (!Array.isArray(players) || players.length < 1 || players.length > 5) {
      res.status(400).json({ error: 'Invalid showdown player list.' });
      return;
    }
    const safePot = Math.max(0, Math.min(5_000_000, Math.round(Number(pot) || 0)));

    const evaluations: Array<{
      uid: string;
      category: 'trail' | 'pure_sequence' | 'sequence' | 'color' | 'pair' | 'high_card';
      label: string;
      rankValue: number;
      score: number;
    }> = [];

    for (const p of players) {
      if (!p || typeof p.uid !== 'string' || !Array.isArray(p.cards) || p.cards.length !== 3 || !p.cards.every(isValidCardPayload)) {
        res.status(400).json({ error: 'Invalid cards supplied for showdown.' });
        return;
      }
      const ev = evaluateTeenPattiHandServer(p.cards);
      evaluations.push({ uid: p.uid, ...ev });
    }

    evaluations.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      // On exact tie in a 2-player Show, standard Teen Patti gives tie edge to non-initiator (defender)
      if (initiatorUid && a.uid === initiatorUid && b.uid !== initiatorUid) return 1;
      if (initiatorUid && b.uid === initiatorUid && a.uid !== initiatorUid) return -1;
      return 0;
    });

    const winner = evaluations[0];
    const winnerPayout = safePot > 0 ? Math.max(1, Math.round(safePot * (1 - TEEN_PATTI_RAKE_PERCENT / 100))) : 0;
    const rakeAmount = Math.max(0, safePot - winnerPayout);

    let revealedSeed = '';
    let revealedHash = '';
    if (typeof roundId === 'string' && /^[a-zA-Z0-9_\-]+$/.test(roundId)) {
      const rec = teenPattiRounds.get(roundId);
      if (rec) {
        rec.revealed = true;
        revealedSeed = rec.serverSeed;
        revealedHash = rec.serverSeedHash;
      }
    }

    res.json({
      winnerUid: winner.uid,
      winnerHandLabel: winner.label,
      winnerCategory: winner.category,
      evaluations,
      pot: safePot,
      winnerPayout,
      rakeAmount,
      rakePercent: TEEN_PATTI_RAKE_PERCENT,
      serverSeed: revealedSeed,
      serverSeedHash: revealedHash,
    });
  });

  // Teen Patti: Server-side smart bot tactical decision engine
  app.post('/api/games/teen-patti/bot-action', (req, res) => {
    const {
      cards,
      isSeen,
      currentStake,
      bootAmount,
      chaalLimit,
      pot,
      potLimit,
      activeCount,
      canSideShow,
      turnCount = 0,
      evaluatingSideShow = false,
    } = req.body || {};

    if (!Array.isArray(cards) || cards.length !== 3 || !cards.every(isValidCardPayload)) {
      res.status(400).json({ error: 'Invalid bot cards.' });
      return;
    }

    const ev = evaluateTeenPattiHandServer(cards);
    const boot = Math.max(1, Math.round(Number(bootAmount) || 10));
    const stake = Math.max(boot, Math.round(Number(currentStake) || boot));
    const maxChaal = Math.max(boot * 4, Math.round(Number(chaalLimit) || boot * 128));
    const curPot = Math.max(0, Math.round(Number(pot) || 0));
    const maxPot = Math.max(maxChaal, Math.round(Number(potLimit) || boot * 1024));
    const active = Math.max(2, Math.min(5, Math.round(Number(activeCount) || 2)));
    const turns = Math.max(0, Math.round(Number(turnCount) || 0));
    const rng = crypto.randomInt(0, 100);

    const mode = platformLiquidityConfig.liquidityMode;
    const highRank = Math.max(...cards.map((c: Card) => c.rank));
    const potOddsRatio = curPot > 0 ? stake / (curPot + stake) : 0.25;

    // Normalized hand strength score [0..100] for mathematical Ultra-Pro / Pro decisions
    const handStrength = (() => {
      if (ev.rankValue === 6) return 99; // Trail
      if (ev.rankValue === 5) return 95; // Pure Sequence
      if (ev.rankValue === 4) return 86; // Sequence
      if (ev.rankValue === 3) return 72 + Math.round((highRank - 2) * 0.8); // Color
      if (ev.rankValue === 2) {
        const pairVal = Math.floor((ev.score - 2_000_000) / 256);
        return 48 + Math.round((pairVal - 2) * 1.8); // Pair 2s..Aces -> 48..70
      }
      return Math.max(8, Math.min(40, (highRank - 2) * 3)); // High Card -> 8..36
    })();

    // Responding to an incoming Side Show request
    if (evaluatingSideShow) {
      let acceptSideShow = false;
      if (mode === 'easy') {
        acceptSideShow = ev.rankValue >= 2 ? rng < 62 : rng < 48;
      } else if (mode === 'pro') {
        acceptSideShow = handStrength >= 58 ? rng < 86 : handStrength >= 42 ? rng < 44 : rng < 18;
      } else if (mode === 'ultra-pro') {
        acceptSideShow = handStrength >= 62 ? rng < 92 : handStrength >= 48 ? rng < 32 : rng < 8;
      } else {
        acceptSideShow = ev.rankValue >= 2 ? rng < 78 : rng < 52;
      }
      res.json({ action: acceptSideShow ? 'accept_sideshow' : 'decline_sideshow', acceptSideShow, eval: ev });
      return;
    }

    // Pot limit reached -> forced show
    if (curPot >= maxPot * 0.92 && active === 2) {
      res.json({ action: 'show', raise: false });
      return;
    }

    // --- BLIND STATE ---
    if (!isSeen) {
      const blindStayRate =
        mode === 'easy' ? 48 : mode === 'balanced' ? 62 : mode === 'pro' ? 54 : 38;
      const maxBlindTurns = mode === 'ultra-pro' ? 1 : 2;
      if (turns < maxBlindTurns && stake <= boot * 4 && rng < blindStayRate) {
        const shouldRaise =
          mode !== 'easy' &&
          rng < (mode === 'pro' ? 22 : mode === 'ultra-pro' ? 18 : 14) &&
          stake * 2 <= Math.floor(maxChaal / 2);
        res.json({ action: 'blind', raise: shouldRaise });
        return;
      }

      // Peek cards then act based on strength & liquidity preset
      if (ev.rankValue >= 4) {
        const raiseChance = mode === 'easy' ? 18 : mode === 'balanced' ? 45 : mode === 'pro' ? 62 : 70;
        res.json({ action: 'see_and_chaal', raise: rng < raiseChance && stake * 4 <= maxChaal });
        return;
      }
      if (ev.rankValue >= 2) {
        if (mode === 'ultra-pro' && ev.rankValue === 2 && handStrength < 55 && stake >= boot * 8) {
          res.json({ action: 'see_and_pack', raise: false });
          return;
        }
        const raiseChance = mode === 'easy' ? 6 : mode === 'balanced' ? 16 : mode === 'pro' ? 28 : 30;
        res.json({ action: 'see_and_chaal', raise: rng < raiseChance && stake * 4 <= maxChaal });
        return;
      }
      // Weak high card after peeking
      const foldThreshold = mode === 'ultra-pro' ? boot * 2 : mode === 'pro' ? boot * 2 : boot * 4;
      const foldChance = mode === 'easy' ? 74 : mode === 'balanced' ? 55 : mode === 'pro' ? 72 : 88;
      if ((stake >= foldThreshold || highRank < 12) && rng < foldChance) {
        res.json({ action: 'see_and_pack', raise: false });
        return;
      }
      res.json({ action: 'see_and_chaal', raise: false });
      return;
    }

    // --- SEEN STATE ---
    if (mode === 'easy') {
      // Easy: passive calls, early folds on medium stakes, minimal aggression
      if (ev.rankValue >= 4) {
        if (active === 2 && turns >= 4 && rng < 52) {
          res.json({ action: 'show', raise: false });
          return;
        }
        res.json({ action: 'chaal', raise: rng < 14 && stake * 4 <= maxChaal });
        return;
      }
      if (ev.rankValue >= 2) {
        if (stake >= boot * 8 && rng < 58) {
          res.json({ action: 'pack', raise: false });
          return;
        }
        if (active === 2 && turns >= 3 && rng < 48) {
          res.json({ action: 'show', raise: false });
          return;
        }
        res.json({ action: 'chaal', raise: false });
        return;
      }
      if ((stake >= boot * 2 || turns >= 1) && rng < 78) {
        res.json({ action: 'pack', raise: false });
        return;
      }
      res.json({ action: 'chaal', raise: false });
      return;
    }

    if (mode === 'ultra-pro') {
      // Ultra Pro: strict mathematical hand-strength & pot-odds thresholds
      if (ev.rankValue >= 4) {
        // Sequence / Pure Sequence / Trail: maximize value extraction, avoid premature show unless huge pot
        if (active === 2 && (turns >= 6 || stake >= boot * 16 || curPot >= maxPot * 0.65) && rng < 55) {
          res.json({ action: 'show', raise: false });
          return;
        }
        const raiseChance = ev.rankValue >= 5 ? 76 : 58;
        res.json({ action: 'chaal', raise: rng < raiseChance && stake * 4 <= maxChaal });
        return;
      }
      if (ev.rankValue === 3 || (ev.rankValue === 2 && handStrength >= 60)) {
        // Color or High Pair (10s+)
        if (canSideShow && active > 2 && turns >= 2 && rng < 46) {
          res.json({ action: 'sideshow', raise: false });
          return;
        }
        if (active === 2 && turns >= 4 && rng < 48) {
          res.json({ action: 'show', raise: false });
          return;
        }
        if (stake >= boot * 16 && ev.rankValue === 2 && potOddsRatio > 0.34 && rng < 68) {
          res.json({ action: 'pack', raise: false });
          return;
        }
        res.json({ action: 'chaal', raise: rng < 32 && stake * 4 <= maxChaal });
        return;
      }
      if (ev.rankValue === 2) {
        // Low/Mid Pair: tight mathematical fold discipline against heavy escalation
        if (stake >= boot * 8 && potOddsRatio > 0.28) {
          res.json({ action: 'pack', raise: false });
          return;
        }
        if (canSideShow && active > 2 && rng < 50) {
          res.json({ action: 'sideshow', raise: false });
          return;
        }
        if (active === 2 && turns >= 3 && rng < 55) {
          res.json({ action: 'show', raise: false });
          return;
        }
        res.json({ action: 'chaal', raise: false });
        return;
      }
      // High Card in Ultra Pro: disciplined fold unless cheap pot-odds Ace-high / rare bluff
      if (stake >= boot * 2 || turns >= 2 || highRank < 13) {
        if (highRank === 14 && stake <= boot * 2 && turns < 2 && rng < 22) {
          res.json({ action: 'chaal', raise: false });
          return;
        }
        res.json({ action: 'pack', raise: false });
        return;
      }
      res.json({ action: 'chaal', raise: false });
      return;
    }

    // 'balanced' & 'pro'
    const isPro = mode === 'pro';
    if (ev.rankValue >= 4) {
      if (active === 2 && (turns >= 5 || stake >= boot * 8) && rng < (isPro ? 48 : 45)) {
        res.json({ action: 'show', raise: false });
        return;
      }
      const raise = rng < (isPro ? 54 : 36) && stake * 4 <= maxChaal;
      res.json({ action: 'chaal', raise });
      return;
    }

    if (ev.rankValue === 3 || ev.rankValue === 2) {
      if (active === 2 && turns >= 3 && rng < (isPro ? 46 : 42)) {
        res.json({ action: 'show', raise: false });
        return;
      }
      if (canSideShow && active > 2 && turns >= 2 && rng < (isPro ? 44 : 32)) {
        res.json({ action: 'sideshow', raise: false });
        return;
      }
      if (stake >= boot * (isPro ? 12 : 16) && ev.rankValue === 2 && handStrength < 58 && rng < (isPro ? 58 : 45)) {
        res.json({ action: 'pack', raise: false });
        return;
      }
      res.json({ action: 'chaal', raise: rng < (isPro ? 24 : 15) && stake * 4 <= maxChaal });
      return;
    }

    // High Card (rankValue === 1)
    if (active === 2 && highRank >= 13 && turns >= 2 && rng < (isPro ? 40 : 35)) {
      res.json({ action: 'show', raise: false });
      return;
    }
    if (stake >= boot * (isPro ? 2 : 4) && rng < (isPro ? 76 : 68)) {
      res.json({ action: 'pack', raise: false });
      return;
    }
    if (turns >= 2 && highRank < 12 && rng < (isPro ? 74 : 60)) {
      res.json({ action: 'pack', raise: false });
      return;
    }
    if (canSideShow && highRank >= 12 && rng < (isPro ? 28 : 24)) {
      res.json({ action: 'sideshow', raise: false });
      return;
    }
    res.json({ action: 'chaal', raise: false });
  });

  // Daily Spin Wheel: Server-authoritative weighted RNG
  app.post('/api/rewards/spin', (_req, res) => {
    const totalWeight = SPIN_SEGMENTS.reduce((sum, s) => sum + s.weight, 0);
    const serverSeed = crypto.randomBytes(20).toString('hex');
    const serverSeedHash = crypto.createHash('sha256').update(serverSeed).digest('hex');
    const roll = parseInt(serverSeedHash.slice(0, 8), 16) % totalWeight;

    let acc = 0;
    let segmentIndex = 0;
    for (let i = 0; i < SPIN_SEGMENTS.length; i++) {
      acc += SPIN_SEGMENTS[i].weight;
      if (roll < acc) {
        segmentIndex = i;
        break;
      }
    }

    const chosen = SPIN_SEGMENTS[segmentIndex];
    res.json({
      spinId: `spin_${crypto.randomBytes(6).toString('hex')}`,
      segmentIndex,
      reward: chosen.reward,
      label: chosen.label,
      serverSeed,
      serverSeedHash,
    });
  });

  app.get('/api/config/upi', (_req, res) => {
    res.json({
      depositUpiId: DEFAULT_DEPOSIT_UPI_ID,
      depositUpiName: DEFAULT_DEPOSIT_UPI_NAME,
    });
  });

  // Public Welcome Bonus & Anti-Abuse Policy Endpoint
  app.get('/api/wallet/bonus-policy', (_req, res) => {
    res.json({
      welcomeBonusAmount: platformLiquidityConfig.welcomeBonusAmount,
      maxBonusContributionPct: Math.round(BONUS_MAX_CONTRIBUTION_RATIO * 100),
      starterTableMaxBonusOnly: BONUS_STARTER_TABLE_MAX_STAKE,
      preDepositWinCap: BONUS_PRE_DEPOSIT_WIN_CAP,
      requireFirstDepositToWithdraw: platformLiquidityConfig.requireFirstDepositToWithdraw,
      minFirstDepositForWithdraw: MIN_FIRST_DEPOSIT_FOR_WITHDRAW,
    });
  });

  // Authoritative Bet-Split Policy Validator (20% max bonus contribution + ₹10 starter-table exception)
  app.post('/api/wallet/validate-bet-split', (req, res) => {
    const stake = Math.floor(Number(req.body?.stake));
    const depositBalance = Math.max(0, Math.floor(Number(req.body?.depositBalance) || 0));
    const winningBalance = Math.max(0, Math.floor(Number(req.body?.winningBalance) || 0));
    const bonusBalance = Math.max(0, Math.floor(Number(req.body?.bonusBalance) || 0));

    if (!Number.isFinite(stake) || stake < 1 || stake > 1_000_000) {
      res.status(400).json({ ok: false, error: 'Stake must be at least ₹1.' });
      return;
    }

    const cashAvailable = depositBalance + winningBalance;
    if (cashAvailable === 0 && stake <= BONUS_STARTER_TABLE_MAX_STAKE) {
      if (bonusBalance < stake) {
        res.status(400).json({ ok: false, error: 'Insufficient Bonus Balance for this starter table.' });
        return;
      }
      res.json({
        ok: true,
        fromDeposit: 0,
        fromWinning: 0,
        fromBonus: stake,
        starterBonusOnly: true,
      });
      return;
    }

    const maxBonus = Math.floor(stake * BONUS_MAX_CONTRIBUTION_RATIO);
    const fromBonus = Math.min(bonusBalance, maxBonus);
    const remaining = stake - fromBonus;
    if (cashAvailable < remaining) {
      res.status(400).json({
        ok: false,
        error:
          'Bonus Balance covers up to 20% of each bet (100% on starter tables up to ₹10 when cash balance is ₹0). Deposit funds in Wallet or choose a ≤₹10 starter table.',
      });
      return;
    }

    const fromDeposit = Math.min(depositBalance, remaining);
    const fromWinning = remaining - fromDeposit;
    res.json({
      ok: true,
      fromDeposit,
      fromWinning,
      fromBonus,
      starterBonusOnly: false,
    });
  });

  // Direct UPI Security Validator (unique UTR, UPI syntax, first-deposit unlock, cooldown & daily cap)
  app.post('/api/wallet/validate-upi-request', (req, res) => {
    const { userId, type, amount, upiId, senderUpiId, utr, totalDeposited } = req.body || {};

    if (typeof userId !== 'string' || !/^[a-zA-Z0-9_\-]{4,128}$/.test(userId)) {
      res.status(400).json({ ok: false, error: 'Invalid account identifier.' });
      return;
    }
    if (type !== 'deposit' && type !== 'withdrawal') {
      res.status(400).json({ ok: false, error: 'Invalid UPI request type.' });
      return;
    }

    const numAmount = Math.round(Number(amount));
    const rawUpi = String(senderUpiId ?? upiId ?? '').trim();
    const cleanUpi = rawUpi.toLowerCase();

    if (type === 'deposit') {
      if (!Number.isFinite(numAmount) || numAmount < 100 || numAmount > 100000) {
        res.status(400).json({ ok: false, error: 'Deposit amount must be between 100 and 100,000 coins.' });
        return;
      }
      const hasOptionalUpi = cleanUpi.length > 0 && cleanUpi !== 'n/a';
      if (hasOptionalUpi && !UPI_ID_REGEX.test(cleanUpi)) {
        res.status(400).json({ ok: false, error: 'Enter a valid UPI ID (e.g. player@upi or name@okaxis).' });
        return;
      }
      const cleanUtr = String(utr || '').trim();
      if (!UTR_REGEX.test(cleanUtr)) {
        res.status(400).json({ ok: false, error: 'UTR must be an exact 12-digit numeric reference number.' });
        return;
      }
      if (seenUtrs.has(cleanUtr)) {
        res.status(409).json({ ok: false, error: 'Duplicate UTR detected. This UTR number has already been submitted.' });
        return;
      }
      seenUtrs.add(cleanUtr);
      res.json({
        ok: true,
        normalizedUpiId: hasOptionalUpi ? cleanUpi : 'N/A',
        normalizedUtr: cleanUtr,
        amount: numAmount,
        platformUpiId: DEFAULT_DEPOSIT_UPI_ID,
        platformUpiName: DEFAULT_DEPOSIT_UPI_NAME,
      });
      return;
    }

    // Withdrawal checks: First-Deposit Unlock + strict UPI ID + bounds + 5-min cooldown + 50,000 daily cap
    const approvedDeposited = Math.max(0, Math.round(Number(totalDeposited) || 0));
    if (
      platformLiquidityConfig.requireFirstDepositToWithdraw &&
      approvedDeposited < MIN_FIRST_DEPOSIT_FOR_WITHDRAW
    ) {
      res.status(403).json({
        ok: false,
        error: 'Make a minimum ₹100 first deposit to unlock instant UPI withdrawals',
      });
      return;
    }

    if (!UPI_ID_REGEX.test(cleanUpi)) {
      res.status(400).json({ ok: false, error: 'Enter a valid UPI ID (e.g. player@upi or name@okaxis).' });
      return;
    }
    if (!Number.isFinite(numAmount) || numAmount < 500 || numAmount > 25000) {
      res.status(400).json({ ok: false, error: 'Withdrawal amount must be between 500 and 25,000 coins.' });
      return;
    }
    const nowMs = Date.now();
    const today = todayDateKey();
    const prev = userWithdrawalState.get(userId);
    const prevDaily = prev && prev.dateKey === today ? prev.dailyTotal : 0;

    if (prev && nowMs - prev.lastAtMs < UPI_WITHDRAWAL_COOLDOWN_MS) {
      const waitSec = Math.ceil((UPI_WITHDRAWAL_COOLDOWN_MS - (nowMs - prev.lastAtMs)) / 1000);
      res.status(429).json({
        ok: false,
        error: `Withdrawal cooldown active. Please wait ${waitSec}s before your next request.`,
        retryAfterSec: waitSec,
      });
      return;
    }

    if (prevDaily + numAmount > UPI_DAILY_WITHDRAWAL_LIMIT) {
      const remaining = Math.max(0, UPI_DAILY_WITHDRAWAL_LIMIT - prevDaily);
      res.status(429).json({
        ok: false,
        error: `Daily withdrawal limit (50,000 coins) exceeded. Remaining today: ${remaining.toLocaleString()} coins.`,
      });
      return;
    }

    userWithdrawalState.set(userId, {
      lastAtMs: nowMs,
      dateKey: today,
      dailyTotal: prevDaily + numAmount,
    });

    res.json({
      ok: true,
      normalizedUpiId: cleanUpi,
      amount: numAmount,
      serverTimeMs: nowMs,
      dailyRemaining: UPI_DAILY_WITHDRAWAL_LIMIT - (prevDaily + numAmount),
    });
  });

  // Server-authoritative Promo Code Validator (strict format, rate-limited, expiry & cap checks)
  const BUILTIN_PROMOS: Record<
    string,
    { bonusAmount: number; minDeposit: number; maxUses: number; description: string }
  > = {
    WELCOME500: {
      bonusAmount: 500,
      minDeposit: 100,
      maxUses: 10000,
      description: 'Welcome Deposit Bonus (+500 Bonus Coins)',
    },
    AURELIA1000: {
      bonusAmount: 1000,
      minDeposit: 500,
      maxUses: 5000,
      description: 'Arena Festival Deposit Boost (+1,000 Bonus Coins)',
    },
    VIP2500: {
      bonusAmount: 2500,
      minDeposit: 2000,
      maxUses: 2500,
      description: 'High-Roller VIP Bonus (+2,500 Bonus Coins)',
    },
  };
  const promoAttemptMap = new Map<string, { count: number; resetAtMs: number }>();

  app.post('/api/wallet/validate-promo', (req, res) => {
    const { userId, code, depositAmount, promoDoc } = req.body || {};

    if (typeof userId !== 'string' || !/^[a-zA-Z0-9_\-]{4,128}$/.test(userId)) {
      res.status(400).json({ ok: false, error: 'Invalid account identifier.' });
      return;
    }

    const nowMs = Date.now();
    const rateEntry = promoAttemptMap.get(userId);
    if (rateEntry && nowMs < rateEntry.resetAtMs && rateEntry.count >= 12) {
      res.status(429).json({
        ok: false,
        error: 'Too many promo code attempts. Please wait a minute and try again.',
      });
      return;
    }
    if (!rateEntry || nowMs >= rateEntry.resetAtMs) {
      promoAttemptMap.set(userId, { count: 1, resetAtMs: nowMs + 60_000 });
    } else {
      rateEntry.count += 1;
    }

    const normalizedCode = String(code || '')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');
    if (!/^[A-Z0-9]{3,24}$/.test(normalizedCode)) {
      res.status(400).json({ ok: false, error: 'Promo code must be 3–24 letters or numbers.' });
      return;
    }

    const depAmt = Math.max(0, Math.round(Number(depositAmount) || 0));

    // Prefer admin-managed Firestore promo record if supplied & matching, else fall back to built-in catalog
    let resolvedBonus = 0;
    let resolvedMinDep = 0;
    let resolvedDesc = '';

    if (promoDoc && typeof promoDoc === 'object' && String(promoDoc.code || '').toUpperCase() === normalizedCode) {
      if (promoDoc.active !== true) {
        res.status(400).json({ ok: false, error: 'This promo code is currently paused or inactive.' });
        return;
      }
      const maxUses = Number(promoDoc.maxUses || 0);
      const usedCount = Number(promoDoc.usedCount || 0);
      if (maxUses > 0 && usedCount >= maxUses) {
        res.status(400).json({ ok: false, error: 'This promo code has reached its redemption limit.' });
        return;
      }
      if (typeof promoDoc.expiresAt === 'string' && promoDoc.expiresAt.trim().length > 0) {
        const expMs = Date.parse(promoDoc.expiresAt);
        if (Number.isFinite(expMs) && nowMs > expMs) {
          res.status(400).json({ ok: false, error: 'This promo code has expired.' });
          return;
        }
      }
      resolvedBonus = Math.max(10, Math.min(25000, Math.round(Number(promoDoc.bonusAmount) || 0)));
      resolvedMinDep = Math.max(0, Math.round(Number(promoDoc.minDeposit) || 0));
      resolvedDesc = String(promoDoc.description || `Promo ${normalizedCode}`).slice(0, 140);
    } else if (BUILTIN_PROMOS[normalizedCode]) {
      const bp = BUILTIN_PROMOS[normalizedCode];
      resolvedBonus = bp.bonusAmount;
      resolvedMinDep = bp.minDeposit;
      resolvedDesc = bp.description;
    } else {
      res.status(404).json({
        ok: false,
        error: 'Promo code not found. Try WELCOME500, AURELIA1000, or an active admin code.',
      });
      return;
    }

    if (resolvedMinDep > 0 && depAmt < resolvedMinDep) {
      res.status(400).json({
        ok: false,
        error: `Minimum deposit amount of ${resolvedMinDep.toLocaleString()} coins required for ${normalizedCode}.`,
      });
      return;
    }

    const proofHash = crypto
      .createHash('sha256')
      .update(`${userId}:${normalizedCode}:${resolvedBonus}:${todayDateKey()}`)
      .digest('hex')
      .slice(0, 24);

    res.json({
      ok: true,
      code: normalizedCode,
      bonusAmount: resolvedBonus,
      minDeposit: resolvedMinDep,
      description: resolvedDesc,
      proofHash,
    });
  });

  if (!IS_PROD) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build output not found.');
      }
    });
  }

  // Hydrate initial 4-tier liquidity settings from Firestore settings/platform (public get)
  if (FIREBASE_PROJECT_ID) {
    const dbId = encodeURIComponent(FIRESTORE_DATABASE_ID || '(default)');
    const settingsUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(FIREBASE_PROJECT_ID)}/databases/${dbId}/documents/settings/platform`;
    fetch(settingsUrl)
      .then(async (resp) => {
        if (!resp.ok) return;
        const json = (await resp.json()) as {
          fields?: {
            liquidityMode?: { stringValue?: string };
            maxRoundPayoutCap?: { integerValue?: string; doubleValue?: number };
            smartMatchmakingEnabled?: { booleanValue?: boolean };
            matchmakingWaitSeconds?: { integerValue?: string; doubleValue?: number };
            welcomeBonusAmount?: { integerValue?: string; doubleValue?: number };
            requireFirstDepositToWithdraw?: { booleanValue?: boolean };
          };
        };
        const f = json.fields;
        if (!f) return;
        const mode = String(f.liquidityMode?.stringValue || '').toLowerCase() as LiquidityMode;
        const cap = Number(f.maxRoundPayoutCap?.integerValue ?? f.maxRoundPayoutCap?.doubleValue ?? 50000);
        const wait = Number(f.matchmakingWaitSeconds?.integerValue ?? f.matchmakingWaitSeconds?.doubleValue ?? 8);
        const welcomeBonus = Number(f.welcomeBonusAmount?.integerValue ?? f.welcomeBonusAmount?.doubleValue ?? 51);
        platformLiquidityConfig = {
          liquidityMode: VALID_LIQUIDITY_MODES.has(mode) ? mode : 'balanced',
          maxRoundPayoutCap: Number.isFinite(cap) ? Math.max(100, Math.min(5_000_000, Math.round(cap))) : 50000,
          smartMatchmakingEnabled: typeof f.smartMatchmakingEnabled?.booleanValue === 'boolean' ? f.smartMatchmakingEnabled.booleanValue : true,
          matchmakingWaitSeconds: Number.isFinite(wait) ? Math.max(5, Math.min(15, Math.round(wait))) : 8,
          welcomeBonusAmount: Number.isFinite(welcomeBonus) ? Math.max(0, Math.min(500, Math.round(welcomeBonus))) : 51,
          requireFirstDepositToWithdraw:
            typeof f.requireFirstDepositToWithdraw?.booleanValue === 'boolean'
              ? f.requireFirstDepositToWithdraw.booleanValue
              : true,
        };
      })
      .catch(() => {});
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Aurelia Arena server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start Aurelia Arena server:', err);
  process.exit(1);
});
