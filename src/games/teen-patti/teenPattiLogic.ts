import type {
  PlayingCard,
  TeenPattiBootAmount,
  TeenPattiHandCategory,
  TeenPattiHandEvaluation,
} from '../../types';

export interface TeenPattiTableTier {
  boot: TeenPattiBootAmount;
  chaalLimit: number;
  potLimit: number;
  baseOnlinePlayers: number;
  label: string;
}

export const TEEN_PATTI_BOOT_TABLES: TeenPattiTableTier[] = [
  { boot: 1, chaalLimit: 128, potLimit: 1024, baseOnlinePlayers: 412, label: 'Starter' },
  { boot: 5, chaalLimit: 640, potLimit: 5120, baseOnlinePlayers: 328, label: 'Classic' },
  { boot: 10, chaalLimit: 1280, potLimit: 10240, baseOnlinePlayers: 615, label: 'Popular' },
  { boot: 50, chaalLimit: 6400, potLimit: 51200, baseOnlinePlayers: 384, label: 'Royal' },
  { boot: 100, chaalLimit: 12800, potLimit: 102400, baseOnlinePlayers: 219, label: 'VIP' },
  { boot: 500, chaalLimit: 64000, potLimit: 512000, baseOnlinePlayers: 96, label: 'High Roller' },
];

export const TEEN_PATTI_RAKE_PERCENT = 10;

export const SUIT_SYMBOLS: Record<PlayingCard['suit'], string> = {
  spades: '♠',
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
};

export function getTeenPattiTableTier(boot: number): TeenPattiTableTier {
  return (
    TEEN_PATTI_BOOT_TABLES.find((t) => t.boot === boot) || TEEN_PATTI_BOOT_TABLES[2]
  );
}

export function calculateTeenPattiNetPayout(pot: number): number {
  const safePot = Math.max(0, Math.round(Number(pot) || 0));
  if (safePot <= 0) return 0;
  return Math.max(1, Math.round(safePot * (1 - TEEN_PATTI_RAKE_PERCENT / 100)));
}

export function formatCardShort(card: PlayingCard): string {
  return `${card.label}${SUIT_SYMBOLS[card.suit] || ''}`;
}

export function isRedSuit(suit: PlayingCard['suit']): boolean {
  return suit === 'hearts' || suit === 'diamonds';
}

const RANK_NAME_SINGULAR: Record<number, string> = {
  2: '2s',
  3: '3s',
  4: '4s',
  5: '5s',
  6: '6s',
  7: '7s',
  8: '8s',
  9: '9s',
  10: '10s',
  11: 'Jacks',
  12: 'Queens',
  13: 'Kings',
  14: 'Aces',
};

const RANK_SHORT: Record<number, string> = {
  2: '2',
  3: '3',
  4: '4',
  5: '5',
  6: '6',
  7: '7',
  8: '8',
  9: '9',
  10: '10',
  11: 'J',
  12: 'Q',
  13: 'K',
  14: 'A',
};

/**
 * Standard Indian Teen Patti 3-card hand evaluator.
 * Ranking order (highest -> lowest):
 * 6. Trail / Trio (Three of a kind)
 * 5. Pure Sequence (Straight Flush; A-K-Q highest, A-2-3 second highest, then K-Q-J .. 4-3-2)
 * 4. Sequence (Straight; A-K-Q highest, A-2-3 second highest, then K-Q-J .. 4-3-2)
 * 3. Color (Flush)
 * 2. Pair
 * 1. High Card
 */
export function evaluateTeenPattiHand(cards: PlayingCard[]): TeenPattiHandEvaluation {
  if (!Array.isArray(cards) || cards.length !== 3) {
    return {
      category: 'high_card',
      label: 'HIGH CARD',
      rankValue: 1,
      tiebreakers: [0, 0, 0],
      score: 0,
    };
  }

  const sorted = [...cards].sort((a, b) => b.rank - a.rank);
  const [r1, r2, r3] = [sorted[0].rank, sorted[1].rank, sorted[2].rank];
  const sameSuit = sorted[0].suit === sorted[1].suit && sorted[1].suit === sorted[2].suit;

  // 1. Trail / Trio
  if (r1 === r2 && r2 === r3) {
    const score = 6 * 1_000_000 + r1 * 1000;
    return {
      category: 'trail',
      label: `TRAIL OF ${RANK_NAME_SINGULAR[r1] || r1}`.toUpperCase(),
      rankValue: 6,
      tiebreakers: [r1, r2, r3],
      score,
    };
  }

  // Check Sequence (A-K-Q highest = 140, A-2-3 second highest = 135, K-Q-J = 130 ... 4-3-2 = 40)
  const isAKQ = r1 === 14 && r2 === 13 && r3 === 12;
  const isA23 = r1 === 14 && r2 === 3 && r3 === 2;
  const isNormalSeq = r1 - 1 === r2 && r2 - 1 === r3;
  const isSequence = isAKQ || isA23 || isNormalSeq;

  const seqRank = isAKQ ? 140 : isA23 ? 135 : isNormalSeq ? r1 * 10 : 0;

  // 2. Pure Sequence (Straight Flush)
  if (sameSuit && isSequence) {
    const score = 5 * 1_000_000 + seqRank * 1000;
    return {
      category: 'pure_sequence',
      label: 'PURE SEQUENCE',
      rankValue: 5,
      tiebreakers: [seqRank],
      score,
    };
  }

  // 3. Sequence (Straight)
  if (isSequence) {
    const score = 4 * 1_000_000 + seqRank * 1000;
    return {
      category: 'sequence',
      label: 'SEQUENCE',
      rankValue: 4,
      tiebreakers: [seqRank],
      score,
    };
  }

  // 4. Color (Flush)
  if (sameSuit) {
    const score = 3 * 1_000_000 + r1 * 256 + r2 * 16 + r3;
    return {
      category: 'color',
      label: 'COLOR',
      rankValue: 3,
      tiebreakers: [r1, r2, r3],
      score,
    };
  }

  // 5. Pair
  if (r1 === r2 || r2 === r3) {
    const pairRank = r1 === r2 ? r1 : r2;
    const kicker = r1 === r2 ? r3 : r1;
    const score = 2 * 1_000_000 + pairRank * 256 + kicker;
    return {
      category: 'pair',
      label: `PAIR OF ${RANK_NAME_SINGULAR[pairRank] || pairRank}`.toUpperCase(),
      rankValue: 2,
      tiebreakers: [pairRank, kicker],
      score,
    };
  }

  // 6. High Card
  const score = 1 * 1_000_000 + r1 * 256 + r2 * 16 + r3;
  return {
    category: 'high_card',
    label: `HIGH CARD ${RANK_SHORT[r1] || r1}`,
    rankValue: 1,
    tiebreakers: [r1, r2, r3],
    score,
  };
}

export function compareTeenPattiHands(a: PlayingCard[], b: PlayingCard[]): number {
  const evalA = evaluateTeenPattiHand(a);
  const evalB = evaluateTeenPattiHand(b);
  return evalA.score - evalB.score;
}

export function getShortCategoryBadge(category: TeenPattiHandCategory): string {
  switch (category) {
    case 'trail':
      return 'TRAIL';
    case 'pure_sequence':
      return 'PURE SEQ';
    case 'sequence':
      return 'SEQUENCE';
    case 'color':
      return 'COLOR';
    case 'pair':
      return 'PAIR';
    default:
      return 'HIGH CARD';
  }
}

/**
 * Compute valid next wager amount for a player given the table's current base stake (`currentStake`,
 * which tracks the last Blind-equivalent stake unit):
 * - Blind player pays `currentStake` (1x) or `currentStake * 2` (2x raise), capped by `chaalLimit / 2`.
 * - Seen player pays `currentStake * 2` (1x Chaal) or `currentStake * 4` (2x Chaal raise), capped by `chaalLimit`.
 */
export function computePlayerStakeOptions(params: {
  isSeen: boolean;
  currentStake: number;
  bootAmount: number;
  chaalLimit: number;
}): { minBet: number; maxBet: number; canDouble: boolean } {
  const baseUnit = Math.max(params.bootAmount, Math.round(params.currentStake));
  const maxBlindUnit = Math.max(params.bootAmount, Math.floor(params.chaalLimit / 2));

  if (!params.isSeen) {
    const minBet = Math.min(maxBlindUnit, baseUnit);
    const maxBet = Math.min(maxBlindUnit, baseUnit * 2);
    return { minBet, maxBet, canDouble: maxBet > minBet };
  }

  const minBet = Math.min(params.chaalLimit, baseUnit * 2);
  const maxBet = Math.min(params.chaalLimit, baseUnit * 4);
  return { minBet, maxBet, canDouble: maxBet > minBet };
}

/**
 * When a player places `betAmount`, update the table's Blind-equivalent `currentStake` unit.
 */
export function deriveNextTableStakeUnit(params: {
  isSeen: boolean;
  betAmount: number;
  bootAmount: number;
  currentStake: number;
  chaalLimit: number;
}): number {
  const maxBlindUnit = Math.max(params.bootAmount, Math.floor(params.chaalLimit / 2));
  const impliedUnit = params.isSeen
    ? Math.max(params.bootAmount, Math.round(params.betAmount / 2))
    : Math.max(params.bootAmount, Math.round(params.betAmount));
  return Math.min(maxBlindUnit, Math.max(params.currentStake, impliedUnit));
}
