export type GameId = 'dragon_tiger' | 'ludo' | 'aviator' | 'teen_patti';
export type GraphicsQuality = 'low' | 'medium' | 'ultra';
export type WalletBucket = 'deposit' | 'winning' | 'bonus' | 'mixed';
export type LudoGameMode = 'quick' | 'classic' | 'private';
export type VipTierId = 'bronze' | 'silver' | 'gold' | 'diamond';
export type MatchmakingDifficulty = 'casual' | 'balanced' | 'competitive';
export type LiquidityMode = 'easy' | 'balanced' | 'pro' | 'ultra-pro';

export interface PlatformLiquiditySettings {
  liquidityMode: LiquidityMode;
  maxRoundPayoutCap: number;
  smartMatchmakingEnabled: boolean;
  matchmakingWaitSeconds: number;
  welcomeBonusAmount: number;
  requireFirstDepositToWithdraw: boolean;
  updatedAt?: unknown;
}
export type TeenPattiBootAmount = 1 | 5 | 10 | 50 | 100 | 500;
export type TeenPattiHandCategory =
  | 'trail'
  | 'pure_sequence'
  | 'sequence'
  | 'color'
  | 'pair'
  | 'high_card';

export interface TeenPattiHandEvaluation {
  category: TeenPattiHandCategory;
  label: string;
  rankValue: number;
  tiebreakers: number[];
  score: number;
}

export interface TeenPattiSeatPlayer {
  uid: string;
  name: string;
  seatIndex: number;
  isBot: boolean;
  status: 'active' | 'packed' | 'waiting';
  isSeen: boolean;
  totalBet: number;
  lastAction: string;
  cards: PlayingCard[];
  handLabel?: string;
  missedTurns?: number;
}

export interface TeenPattiSideShowRequest {
  id: string;
  requesterUid: string;
  requesterName: string;
  targetUid: string;
  targetName: string;
  status: 'pending' | 'accepted' | 'declined' | 'resolved';
  loserUid?: string;
  createdAtMs: number;
}

export interface TeenPattiReaction {
  id: string;
  uid: string;
  senderName: string;
  seatIndex: number;
  emoji: string;
  text: string;
  createdAtMs: number;
}

export interface TeenPattiRoom {
  roomId: string;
  code: string;
  hostUid: string;
  hostName: string;
  maxPlayers: number;
  isPrivate: boolean;
  bootAmount: number;
  chaalLimit: number;
  potLimit: number;
  status: 'waiting' | 'playing' | 'showdown' | 'finished';
  roundId: string;
  handNumber: number;
  dealerIndex: number;
  currentTurnIndex: number;
  currentStake: number;
  pot: number;
  winnerUid: string;
  winnerName: string;
  winnerHandLabel: string;
  winnerPayout: number;
  serverSeedHash: string;
  serverSeed: string;
  playerUids: string[];
  players: TeenPattiSeatPlayer[];
  sideShowRequest?: TeenPattiSideShowRequest | null;
  lastReaction?: TeenPattiReaction | null;
  lastActionNote: string;
  turnStartedAtMs: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface VipTierInfo {
  id: VipTierId;
  label: string;
  minWagered: number;
  nextMinWagered: number | null;
  nextLabel: string | null;
  cashbackPct: number;
  priorityWithdraw: boolean;
  priorityLabel: string;
  accentHex: string;
  perks: string[];
}

export interface PublicProfile {
  uid: string;
  username: string;
  avatarSeed: string;
  balance: number;
  depositBalance?: number;
  winningBalance?: number;
  bonusBalance?: number;
  totalDeposited?: number;
  totalWagered?: number;
  gamesPlayed: number;
  wins: number;
  totalWon: number;
  winRate: number;
  weeklyScore: number;
  monthlyScore: number;
  streakDays: number;
  badges: string[];
  status: 'active' | 'suspended';
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface UserPrivate {
  uid: string;
  email: string;
  displayName: string;
  username: string;
  role?: 'admin' | 'player';
  welcomeBonusClaimed?: boolean;
  lastDailyClaimDate: string;
  lastSpinDate?: string;
  streakDays: number;
  claimedMissions: string[];
  referralCode?: string;
  referredBy?: string;
  referralRewardUnlocked?: boolean;
  lastWithdrawalAtMs?: number;
  dailyWithdrawnDate?: string;
  dailyWithdrawnTotal?: number;
  graphicsQuality: GraphicsQuality;
  soundEnabled: boolean;
  musicEnabled: boolean;
  volume: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface WalletTransaction {
  txId: string;
  userId: string;
  type:
    | 'signup_bonus'
    | 'daily_reward'
    | 'spin_reward'
    | 'referral_reward'
    | 'promo_bonus'
    | 'mission_reward'
    | 'free_refill'
    | 'upi_deposit'
    | 'withdrawal_request'
    | 'withdrawal_refund'
    | 'bet'
    | 'win'
    | 'refund'
    | 'admin_adjust';
  game: GameId | 'system';
  bucket?: WalletBucket;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  description: string;
  roundId: string;
  createdAt?: unknown;
}

export interface UpiRequestRecord {
  requestId: string;
  userId: string;
  username: string;
  type: 'deposit' | 'withdrawal';
  amount: number;
  upiId: string;
  utr: string;
  status: 'pending' | 'approved' | 'rejected';
  payoutRef: string;
  adminNote: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface PromoCodeDoc {
  code: string;
  bonusAmount: number;
  minDeposit: number;
  maxUses: number;
  usedCount: number;
  active: boolean;
  description: string;
  expiresAt: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface PromoRedemptionRecord {
  redemptionId: string;
  code: string;
  userId: string;
  bonusAmount: number;
  createdAt?: unknown;
}

export interface AdminAuditLog {
  logId: string;
  adminUid: string;
  adminEmail: string;
  targetUid: string;
  targetUsername: string;
  action:
    | 'balance_adjust'
    | 'status_change'
    | 'config_update'
    | 'promo_update'
    | 'upi_review'
    | 'ticket_reply';
  amount: number;
  reason: string;
  createdAt?: unknown;
}

export interface ReferralRecord {
  referralId: string;
  referrerUid: string;
  referredUid: string;
  referredUsername: string;
  code: string;
  rewardAmount: number;
  status: 'pending' | 'unlocked' | 'claimed';
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface GameHistoryRecord {
  historyId: string;
  userId: string;
  username: string;
  game: GameId;
  betAmount: number;
  payout: number;
  netProfit: number;
  outcome: 'win' | 'loss' | 'tie' | 'cashout' | 'crashed';
  summary: string;
  seedHash: string;
  isPublic: boolean;
  createdAt?: unknown;
}

export type LudoColor = 'red' | 'green' | 'yellow' | 'blue';

export interface LudoRoomPlayer {
  uid: string;
  name: string;
  color: LudoColor;
  ready: boolean;
  connected: boolean;
  finishedCount: number;
  isBot?: boolean;
  forfeited?: boolean;
  missedTurns?: number;
}

export interface LudoReaction {
  id: string;
  color: LudoColor;
  senderName: string;
  emoji: string;
  text: string;
  createdAtMs: number;
}

export interface LudoRoom {
  roomId: string;
  code: string;
  hostUid: string;
  hostName: string;
  maxPlayers: number;
  gameMode?: LudoGameMode;
  tokensToWin?: number;
  status: 'waiting' | 'playing' | 'finished';
  entryFee: number;
  currentTurnIndex: number;
  diceValue: number;
  diceRolled: boolean;
  consecutiveSixes: number;
  winnerUid: string;
  winnerName: string;
  playerUids: string[];
  players: LudoRoomPlayer[];
  tokens: Record<LudoColor, number[]>;
  lastMoveNote: string;
  turnStartedAtMs?: number;
  missedTurns?: Record<LudoColor, number>;
  lastReaction?: LudoReaction | null;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface GameConfigDoc {
  gameId: GameId | 'platform';
  enabled: boolean;
  minBet: number;
  maxBet: number;
  version: string;
  apkDownloadUrl: string;
  apkVersion: string;
  apkSize: string;
  apkUpdatedAt: string;
  apkAndroidCompat: string;
  maintenanceMessage: string;
  depositUpiId?: string;
  depositUpiName?: string;
  depositQrUrl?: string;
  whatsappSupportUrl?: string;
  telegramSupportUrl?: string;
  matchmakingDifficulty?: MatchmakingDifficulty;
  updatedAt?: unknown;
}

export interface ReportRecord {
  reportId: string;
  userId: string;
  username: string;
  category: 'payment' | 'game' | 'bug' | 'cheating' | 'account' | 'contact' | 'other';
  subject: string;
  message: string;
  targetUsername: string;
  utrRef?: string;
  status: 'open' | 'investigating' | 'resolved';
  adminNote: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface PlayingCard {
  rank: number; // 2..14 (14 = Ace high)
  label: string;
  suit: 'spades' | 'hearts' | 'diamonds' | 'clubs';
}

export interface DragonTigerResult {
  roundId: string;
  dragon: PlayingCard;
  tiger: PlayingCard;
  winner: 'dragon' | 'tiger' | 'tie';
  seedHash: string;
  serverSeedHash?: string;
  serverSeed?: string;
  clientSeed?: string;
}

export interface ProvablyFairProof {
  game: GameId;
  roundId: string;
  serverSeedHash: string;
  serverSeed?: string;
  clientSeed?: string;
  outcomeLabel?: string;
  status: 'committed' | 'revealed';
}

export interface ApkConfig {
  available: boolean;
  downloadUrl: string;
  version: string;
  size: string;
  updatedAt: string;
  androidCompat: string;
}

export interface DailyMissionDef {
  id: string;
  title: string;
  description: string;
  cadence: 'daily' | 'weekly';
  reward: number;
  badgeId?: string;
  checkCompleted: (stats: {
    gamesPlayed: number;
    wins: number;
    streakDays: number;
    ludoPlayed: number;
    dtPlayed: number;
    aviatorPlayed: number;
  }) => boolean;
}
