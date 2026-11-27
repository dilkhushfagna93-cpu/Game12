import type { LudoColor } from '../../types';

// Exact 52-square clockwise perimeter track on a 15x15 Ludo grid (col 0..14, row 0..14)
export const MAIN_TRACK_COORDS: ReadonlyArray<[number, number]> = [
  // Red arm -> up left edge (0..12)
  [1, 6], [2, 6], [3, 6], [4, 6], [5, 6],
  [6, 5], [6, 4], [6, 3], [6, 2], [6, 1], [6, 0],
  [7, 0], [8, 0],
  // Green arm -> down top-right (13..25)
  [8, 1], [8, 2], [8, 3], [8, 4], [8, 5],
  [9, 6], [10, 6], [11, 6], [12, 6], [13, 6], [14, 6],
  [14, 7], [14, 8],
  // Yellow arm -> left along bottom-right (26..38)
  [13, 8], [12, 8], [11, 8], [10, 8], [9, 8],
  [8, 9], [8, 10], [8, 11], [8, 12], [8, 13], [8, 14],
  [7, 14], [6, 14],
  // Blue arm -> up bottom-left (39..51)
  [6, 13], [6, 12], [6, 11], [6, 10], [6, 9],
  [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8],
  [0, 7], [0, 6],
];

export const START_OFFSET: Record<LudoColor, number> = {
  red: 0,
  green: 13,
  yellow: 26,
  blue: 39,
};

export const SAFE_TRACK_INDICES = new Set<number>([0, 8, 13, 21, 26, 34, 39, 47]);

export const HOME_STRETCH_COORDS: Record<LudoColor, ReadonlyArray<[number, number]>> = {
  red: [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7], [6, 7]],
  green: [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5], [7, 6]],
  yellow: [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7], [8, 7]],
  blue: [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9], [7, 8]],
};

export const HOME_YARD_SLOTS: Record<LudoColor, ReadonlyArray<[number, number]>> = {
  red: [[1.8, 1.8], [3.8, 1.8], [1.8, 3.8], [3.8, 3.8]],
  green: [[10.2, 1.8], [12.2, 1.8], [10.2, 3.8], [12.2, 3.8]],
  yellow: [[10.2, 10.2], [12.2, 10.2], [10.2, 12.2], [12.2, 12.2]],
  blue: [[1.8, 10.2], [3.8, 10.2], [1.8, 12.2], [3.8, 12.2]],
};

export const FINISH_SLOTS: Record<LudoColor, ReadonlyArray<[number, number]>> = {
  red: [[6.45, 6.7], [6.45, 7.3], [6.75, 6.85], [6.75, 7.15]],
  green: [[6.7, 6.45], [7.3, 6.45], [6.85, 6.75], [7.15, 6.75]],
  yellow: [[7.55, 6.7], [7.55, 7.3], [7.25, 6.85], [7.25, 7.15]],
  blue: [[6.7, 7.55], [7.3, 7.55], [6.85, 7.25], [7.15, 7.25]],
};

export const LUDO_COLORS_HEX: Record<LudoColor, { hex: number; css: string; label: string }> = {
  red: { hex: 0xb91c1c, css: '#dc2626', label: 'Ruby' },
  green: { hex: 0x0f766e, css: '#10b981', label: 'Emerald' },
  yellow: { hex: 0xd99b26, css: '#eab308', label: 'Gold' },
  blue: { hex: 0x1d4ed8, css: '#3b82f6', label: 'Sapphire' },
};

export function getTokenGridCoords(
  color: LudoColor,
  tokenIndex: number,
  progress: number,
): [number, number] {
  if (progress < 0) {
    return HOME_YARD_SLOTS[color][tokenIndex];
  }
  if (progress <= 51) {
    const absIdx = (START_OFFSET[color] + progress) % 52;
    return MAIN_TRACK_COORDS[absIdx];
  }
  if (progress <= 56) {
    return HOME_STRETCH_COORDS[color][progress - 52];
  }
  return FINISH_SLOTS[color][tokenIndex];
}

export function getLegalTokenIndices(
  tokens: Record<LudoColor, number[]>,
  color: LudoColor,
  dice: number,
): number[] {
  const arr = tokens[color];
  const legal: number[] = [];
  for (let i = 0; i < 4; i++) {
    const p = arr[i];
    if (p === -1) {
      if (dice === 6) legal.push(i);
    } else if (p < 57 && p + dice <= 57) {
      legal.push(i);
    }
  }
  return legal;
}

export function applyLocalLudoMove(
  tokens: Record<LudoColor, number[]>,
  color: LudoColor,
  tokenIndex: number,
  dice: number,
  tokensToWin = 4,
): {
  nextTokens: Record<LudoColor, number[]>;
  captured: { color: LudoColor; tokenIndex: number } | null;
  finishedNow: boolean;
  allFinished: boolean;
  bonusTurn: boolean;
} {
  const nextTokens: Record<LudoColor, number[]> = {
    red: [...tokens.red],
    green: [...tokens.green],
    yellow: [...tokens.yellow],
    blue: [...tokens.blue],
  };

  const cur = nextTokens[color][tokenIndex];
  const nextPos = cur === -1 ? 0 : cur + dice;
  nextTokens[color][tokenIndex] = nextPos;

  let captured: { color: LudoColor; tokenIndex: number } | null = null;
  if (nextPos >= 0 && nextPos <= 51) {
    const absPos = (START_OFFSET[color] + nextPos) % 52;
    if (!SAFE_TRACK_INDICES.has(absPos)) {
      (['red', 'green', 'yellow', 'blue'] as LudoColor[]).forEach((opp) => {
        if (opp === color) return;
        for (let i = 0; i < 4; i++) {
          const op = nextTokens[opp][i];
          if (op >= 0 && op <= 51) {
            const oppAbs = (START_OFFSET[opp] + op) % 52;
            if (oppAbs === absPos) {
              nextTokens[opp][i] = -1;
              captured = { color: opp, tokenIndex: i };
            }
          }
        }
      });
    }
  }

  const targetWinCount = tokensToWin === 1 ? 1 : 4;
  const finishedNow = nextPos === 57;
  const allFinished = nextTokens[color].filter((p) => p === 57).length >= targetWinCount;
  const bonusTurn = !allFinished && (dice === 6 || captured !== null || finishedNow);
  return { nextTokens, captured, finishedNow, allFinished, bonusTurn };
}

export function pickBestAiToken(
  tokens: Record<LudoColor, number[]>,
  color: LudoColor,
  dice: number,
): number | null {
  const legal = getLegalTokenIndices(tokens, color, dice);
  if (legal.length === 0) return null;
  if (legal.length === 1) return legal[0];

  let bestIdx = legal[0];
  let bestScore = -Infinity;

  for (const idx of legal) {
    const cur = tokens[color][idx];
    const nextPos = cur === -1 ? 0 : cur + dice;
    let score = nextPos * 2;

    if (nextPos === 57) score += 1000;
    if (cur === -1 && dice === 6) score += 420;
    if (nextPos >= 52 && nextPos < 57) score += 260;

    if (nextPos >= 0 && nextPos <= 51) {
      const absPos = (START_OFFSET[color] + nextPos) % 52;
      if (SAFE_TRACK_INDICES.has(absPos)) {
        score += 210;
      } else {
        // Check capture opportunity
        for (const opp of ['red', 'green', 'yellow', 'blue'] as LudoColor[]) {
          if (opp === color) continue;
          for (const op of tokens[opp]) {
            if (op >= 0 && op <= 51) {
              const oppAbs = (START_OFFSET[opp] + op) % 52;
              if (oppAbs === absPos) score += 650;
            }
          }
        }
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestIdx = idx;
    }
  }

  return bestIdx;
}

export function getActiveColorsForPlayerCount(count: number): LudoColor[] {
  if (count === 2) return ['red', 'yellow'];
  if (count === 3) return ['red', 'green', 'yellow'];
  return ['red', 'green', 'yellow', 'blue'];
}
