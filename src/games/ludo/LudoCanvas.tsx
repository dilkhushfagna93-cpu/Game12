import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GENERATED_ASSETS } from '../../config/assets';
import { soundEngine } from '../../services/soundEngine';
import type { GraphicsQuality, LudoColor, LudoReaction } from '../../types';
import {
  computeTopDownBoardDistance,
  observeContainerResize,
  syncRendererToContainer,
} from '../../utils/cameraFraming';
import { detectSoftwareWebGL, getGraphicsPreset, scheduleNextFrame } from '../../utils/graphics';
import {
  getTokenGridCoords,
  HOME_STRETCH_COORDS,
  MAIN_TRACK_COORDS,
  SAFE_TRACK_INDICES,
  START_OFFSET,
} from './ludoLogic';

export interface LudoCanvasProps {
  graphicsQuality: GraphicsQuality;
  tokens: Record<LudoColor, number[]>;
  activeColors: LudoColor[];
  currentTurnColor: LudoColor;
  legalTokenIndices: number[];
  diceValue?: number;
  diceRolling?: boolean;
  cameraPreset: 'topdown' | 'angled';
  activeReaction?: LudoReaction | null;
  onTokenClick: (color: LudoColor, tokenIndex: number) => void;
}

const BOARD_SIZE = 9.0;
const BOARD_FRAME_EXTENT = BOARD_SIZE + 0.5;
const CELL_SIZE = BOARD_SIZE / 15;

// Ultra-vibrant, crystal-clear HD Ludo King palette
const LUDO_KING_HEX: Record<
  LudoColor,
  {
    body: number;
    emissive: number;
    css: string;
    mid: string;
    dark: string;
    light: string;
    tint: string;
    yardCenter: [number, number];
  }
> = {
  red: {
    body: 0xff172b,
    emissive: 0xd90429,
    css: '#ff172b',
    mid: '#e60023',
    dark: '#b00018',
    light: '#ff7582',
    tint: '#ffe5e8',
    yardCenter: [3, 3],
  },
  green: {
    body: 0x00c853,
    emissive: 0x009639,
    css: '#00c853',
    mid: '#00a844',
    dark: '#007a2f',
    light: '#69f09c',
    tint: '#e2fce9',
    yardCenter: [12, 3],
  },
  yellow: {
    body: 0xffd600,
    emissive: 0xf59e0b,
    css: '#ffd600',
    mid: '#f5b800',
    dark: '#c98800',
    light: '#fff176',
    tint: '#fff9d6',
    yardCenter: [12, 12],
  },
  blue: {
    body: 0x0095ff,
    emissive: 0x0066cc,
    css: '#0095ff',
    mid: '#007ce6',
    dark: '#0056b3',
    light: '#70cbff',
    tint: '#e0f4ff',
    yardCenter: [3, 12],
  },
};

function gridToWorld(col: number, row: number): [number, number] {
  const x = (col - 7) * CELL_SIZE;
  const z = (row - 7) * CELL_SIZE;
  return [x, z];
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawClassicStar(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  outerR: number,
  innerR: number,
  fill: string | CanvasGradient,
  stroke: string,
  lineWidth = 5,
) {
  ctx.save();
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const angle = (Math.PI / 5) * i - Math.PI / 2;
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lineWidth;
  ctx.lineJoin = 'round';
  ctx.stroke();

  // Crisp center sparkle dot for jewel-like finish
  ctx.beginPath();
  ctx.arc(cx, cy, innerR * 0.34, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.fill();
  ctx.restore();
}

function drawCenterCrown(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.save();
  // Outer bright white ring for instant crisp contrast against the 4 colored triangles
  ctx.beginPath();
  ctx.arc(cx, cy, r * 1.08, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 6;
  ctx.stroke();

  // Gleaming golden medallion disc
  const grad = ctx.createRadialGradient(cx - r * 0.22, cy - r * 0.25, r * 0.08, cx, cy, r);
  grad.addColorStop(0, '#fffce0');
  grad.addColorStop(0.45, '#ffd600');
  grad.addColorStop(0.85, '#f59e0b');
  grad.addColorStop(1, '#b45309');
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.96, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = '#78350f';
  ctx.lineWidth = 5;
  ctx.stroke();

  // Vibrant Royal Crown silhouette
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.5, cy + r * 0.28);
  ctx.lineTo(cx - r * 0.6, cy - r * 0.24);
  ctx.lineTo(cx - r * 0.24, cy + r * 0.01);
  ctx.lineTo(cx, cy - r * 0.42);
  ctx.lineTo(cx + r * 0.24, cy + r * 0.01);
  ctx.lineTo(cx + r * 0.6, cy - r * 0.24);
  ctx.lineTo(cx + r * 0.5, cy + r * 0.28);
  ctx.closePath();
  ctx.fillStyle = '#dc2626';
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 4.5;
  ctx.lineJoin = 'round';
  ctx.stroke();

  // 4-color crown gems (Red, Green, Blue, Gold)
  const gems: Array<[number, number, string]> = [
    [cx - r * 0.34, cy + r * 0.14, '#00c853'],
    [cx, cy + r * 0.12, '#0095ff'],
    [cx + r * 0.34, cy + r * 0.14, '#ffd600'],
    [cx, cy - r * 0.42, '#fff59d'],
    [cx - r * 0.6, cy - r * 0.24, '#60c8ff'],
    [cx + r * 0.6, cy - r * 0.24, '#69f09c'],
  ];
  gems.forEach(([gx, gy, col]) => {
    ctx.beginPath();
    ctx.arc(gx, gy, r * 0.095, 0, Math.PI * 2);
    ctx.fillStyle = col;
    ctx.fill();
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 2.5;
    ctx.stroke();
  });

  // Crown base gold band
  ctx.fillStyle = '#fff066';
  ctx.fillRect(cx - r * 0.48, cy + r * 0.27, r * 0.96, r * 0.13);
  ctx.strokeStyle = '#78350f';
  ctx.lineWidth = 3;
  ctx.strokeRect(cx - r * 0.48, cy + r * 0.27, r * 0.96, r * 0.13);
  ctx.restore();
}

function createLudoKingBoardTexture(): THREE.CanvasTexture {
  const size = 2048;
  const cell = size / 15;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // Pure bright HD white board base
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);

  // 1. Draw all 52 classic perimeter track cells with crisp borders & colorful safe stars
  MAIN_TRACK_COORDS.forEach(([c, r], idx) => {
    const x = c * cell;
    const y = r * cell;
    let startColor: LudoColor | null = null;
    if (idx === 0) startColor = 'red';
    else if (idx === 13) startColor = 'green';
    else if (idx === 26) startColor = 'yellow';
    else if (idx === 39) startColor = 'blue';

    const isSafe = SAFE_TRACK_INDICES.has(idx);

    if (startColor) {
      const pal = LUDO_KING_HEX[startColor];
      const tileGrad = ctx.createLinearGradient(x, y, x + cell, y + cell);
      tileGrad.addColorStop(0, pal.light);
      tileGrad.addColorStop(0.28, pal.css);
      tileGrad.addColorStop(1, pal.mid);
      ctx.fillStyle = tileGrad;
      ctx.fillRect(x, y, cell, cell);
    } else if (isSafe) {
      // Warm vibrant golden-cream tint on neutral safe star squares (no dull gray!)
      const safeGrad = ctx.createRadialGradient(
        x + cell / 2,
        y + cell / 2,
        cell * 0.08,
        x + cell / 2,
        y + cell / 2,
        cell * 0.72,
      );
      safeGrad.addColorStop(0, '#fffbeb');
      safeGrad.addColorStop(1, '#fde68a');
      ctx.fillStyle = safeGrad;
      ctx.fillRect(x, y, cell, cell);
    } else {
      // Crisp bright white tile with ultra-subtle soft ice sheen
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x, y, cell, cell);
    }

    // Sharp high-contrast Ludo King tile border
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 5.5;
    ctx.strokeRect(x + 1, y + 1, cell - 2, cell - 2);

    // Subtle crisp white inner bevel on colored start tiles
    if (startColor) {
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.lineWidth = 3;
      ctx.strokeRect(x + 7, y + 7, cell - 14, cell - 14);
    }

    // Vibrant 5-Point Safe Stars (Pure White Star on Colored Start, Rich Gold-Orange Star on Neutral Safe)
    if (isSafe) {
      if (startColor) {
        drawClassicStar(
          ctx,
          x + cell / 2,
          y + cell / 2,
          cell * 0.37,
          cell * 0.17,
          '#ffffff',
          '#1e293b',
          5,
        );
      } else {
        const starGrad = ctx.createLinearGradient(x, y, x, y + cell);
        starGrad.addColorStop(0, '#ffe033');
        starGrad.addColorStop(0.55, '#ff9800');
        starGrad.addColorStop(1, '#ea580c');
        drawClassicStar(
          ctx,
          x + cell / 2,
          y + cell / 2,
          cell * 0.37,
          cell * 0.17,
          starGrad,
          '#7c2d12',
          5.5,
        );
      }
    }
  });

  // 2. Vivid Colored 5-Tile Home Stretches with subtle glossy chevrons
  const stretchDir: Record<LudoColor, number> = {
    red: 0,
    green: Math.PI / 2,
    yellow: Math.PI,
    blue: -Math.PI / 2,
  };

  (['red', 'green', 'yellow', 'blue'] as LudoColor[]).forEach((color) => {
    const pal = LUDO_KING_HEX[color];
    HOME_STRETCH_COORDS[color].slice(0, 5).forEach(([c, r]) => {
      const x = c * cell;
      const y = r * cell;
      const tileGrad = ctx.createLinearGradient(x, y, x + cell, y + cell);
      tileGrad.addColorStop(0, pal.light);
      tileGrad.addColorStop(0.24, pal.css);
      tileGrad.addColorStop(1, pal.mid);
      ctx.fillStyle = tileGrad;
      ctx.fillRect(x, y, cell, cell);

      // Crisp inner highlight frame
      ctx.strokeStyle = 'rgba(255,255,255,0.4)';
      ctx.lineWidth = 3;
      ctx.strokeRect(x + 7, y + 7, cell - 14, cell - 14);

      // Clean white subtle chevron guiding toward center
      ctx.save();
      ctx.translate(x + cell / 2, y + cell / 2);
      ctx.rotate(stretchDir[color]);
      ctx.beginPath();
      ctx.moveTo(-cell * 0.11, -cell * 0.18);
      ctx.lineTo(cell * 0.13, 0);
      ctx.lineTo(-cell * 0.11, cell * 0.18);
      ctx.strokeStyle = 'rgba(255,255,255,0.68)';
      ctx.lineWidth = 7;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
      ctx.restore();

      // Sharp dark tile outline
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 5.5;
      ctx.strokeRect(x + 1, y + 1, cell - 2, cell - 2);
    });
  });

  // 3. Bold Classic Home-Entry Arrows on the 4 Arm Entrance Cells
  const drawEntryArrow = (col: number, row: number, angleRad: number, color: LudoColor) => {
    const pal = LUDO_KING_HEX[color];
    const cx = (col + 0.5) * cell;
    const cy = (row + 0.5) * cell;

    // Soft pastel tint on entrance square for extra color richness
    ctx.fillStyle = pal.tint;
    ctx.fillRect(col * cell + 3, row * cell + 3, cell - 6, cell - 6);

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angleRad);
    ctx.beginPath();
    ctx.moveTo(cell * 0.34, 0);
    ctx.lineTo(-cell * 0.04, -cell * 0.28);
    ctx.lineTo(-cell * 0.04, -cell * 0.12);
    ctx.lineTo(-cell * 0.32, -cell * 0.12);
    ctx.lineTo(-cell * 0.32, cell * 0.12);
    ctx.lineTo(-cell * 0.04, cell * 0.12);
    ctx.lineTo(-cell * 0.04, cell * 0.28);
    ctx.closePath();
    ctx.fillStyle = pal.css;
    ctx.fill();
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 4.5;
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.restore();
  };
  drawEntryArrow(0, 7, 0, 'red');
  drawEntryArrow(7, 0, Math.PI / 2, 'green');
  drawEntryArrow(14, 7, Math.PI, 'yellow');
  drawEntryArrow(7, 14, -Math.PI / 2, 'blue');

  // 4. Four Iconic Ultra-Vibrant Ludo King Home Yards
  const drawLudoKingYard = (col0: number, row0: number, color: LudoColor) => {
    const pal = LUDO_KING_HEX[color];
    const x = col0 * cell;
    const y = row0 * cell;
    const w = 6 * cell;

    // Rich saturated glossy gradient yard frame
    const yardGrad = ctx.createLinearGradient(x, y, x + w, y + w);
    yardGrad.addColorStop(0, pal.light);
    yardGrad.addColorStop(0.18, pal.css);
    yardGrad.addColorStop(0.82, pal.mid);
    yardGrad.addColorStop(1, pal.dark);
    ctx.fillStyle = yardGrad;
    ctx.fillRect(x, y, w, w);

    // Subtle royal sunburst accent rays inside the colored frame for extra vibrancy
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, w);
    ctx.clip();
    const ycx = x + w / 2;
    const ycy = y + w / 2;
    for (let i = 0; i < 12; i++) {
      const a0 = (i / 12) * Math.PI * 2;
      const a1 = a0 + Math.PI / 24;
      ctx.beginPath();
      ctx.moveTo(ycx, ycy);
      ctx.lineTo(ycx + Math.cos(a0) * w, ycy + Math.sin(a0) * w);
      ctx.lineTo(ycx + Math.cos(a1) * w, ycy + Math.sin(a1) * w);
      ctx.closePath();
      ctx.fillStyle = 'rgba(255,255,255,0.09)';
      ctx.fill();
    }
    ctx.restore();

    // Sharp dark outer yard border + inner gold pinstripe
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 8;
    ctx.strokeRect(x + 2, y + 2, w - 4, w - 4);
    ctx.strokeStyle = 'rgba(255,244,179,0.55)';
    ctx.lineWidth = 4;
    ctx.strokeRect(x + 12, y + 12, w - 24, w - 24);

    // Pure gleaming white rounded inner token box with crisp gold/dark outline
    const pad = cell * 0.74;
    const innerSize = w - pad * 2;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.28)';
    ctx.shadowBlur = 20;
    ctx.shadowOffsetY = 6;
    drawRoundedRect(ctx, x + pad, y + pad, innerSize, innerSize, cell * 0.38);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.restore();

    drawRoundedRect(ctx, x + pad, y + pad, innerSize, innerSize, cell * 0.38);
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 6;
    ctx.stroke();

    // Subtle colored decorative corner dots inside white yard box
    const innerInset = cell * 0.32;
    [
      [x + pad + innerInset, y + pad + innerInset],
      [x + pad + innerSize - innerInset, y + pad + innerInset],
      [x + pad + innerInset, y + pad + innerSize - innerInset],
      [x + pad + innerSize - innerInset, y + pad + innerSize - innerInset],
    ].forEach(([dx, dy]) => {
      ctx.beginPath();
      ctx.arc(dx, dy, cell * 0.08, 0, Math.PI * 2);
      ctx.fillStyle = pal.css;
      ctx.fill();
    });

    // 4 Ultra-Vibrant Glossy Colored Token Base Circles (exact match to HOME_YARD_SLOTS)
    const slots =
      color === 'red'
        ? [
            [1.8, 1.8],
            [3.8, 1.8],
            [1.8, 3.8],
            [3.8, 3.8],
          ]
        : color === 'green'
          ? [
              [10.2, 1.8],
              [12.2, 1.8],
              [10.2, 3.8],
              [12.2, 3.8],
            ]
          : color === 'yellow'
            ? [
                [10.2, 10.2],
                [12.2, 10.2],
                [10.2, 12.2],
                [12.2, 12.2],
              ]
            : [
                [1.8, 10.2],
                [3.8, 10.2],
                [1.8, 12.2],
                [3.8, 12.2],
              ];

    slots.forEach(([gx, gy]) => {
      const cx = (gx + 0.5) * cell;
      const cy = (gy + 0.5) * cell;

      // Soft pastel halo ring around each slot
      ctx.beginPath();
      ctx.arc(cx, cy, cell * 0.63, 0, Math.PI * 2);
      ctx.fillStyle = pal.tint;
      ctx.fill();

      // Glossy 3D colored circular token pad
      const circleGrad = ctx.createRadialGradient(
        cx - cell * 0.16,
        cy - cell * 0.16,
        cell * 0.05,
        cx,
        cy,
        cell * 0.56,
      );
      circleGrad.addColorStop(0, pal.light);
      circleGrad.addColorStop(0.32, pal.css);
      circleGrad.addColorStop(0.85, pal.mid);
      circleGrad.addColorStop(1, pal.dark);

      ctx.beginPath();
      ctx.arc(cx, cy, cell * 0.54, 0, Math.PI * 2);
      ctx.fillStyle = circleGrad;
      ctx.fill();
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 5;
      ctx.stroke();

      // Crisp inner white specular ring
      ctx.beginPath();
      ctx.arc(cx, cy, cell * 0.41, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 4;
      ctx.stroke();
    });
  };

  drawLudoKingYard(0, 0, 'red');
  drawLudoKingYard(9, 0, 'green');
  drawLudoKingYard(9, 9, 'yellow');
  drawLudoKingYard(0, 9, 'blue');

  // 5. Center 3x3 Vibrant Victory Triangles + Jeweled Golden Crown Medallion
  const cx = 7.5 * cell;
  const cy = 7.5 * cell;
  const x0 = 6 * cell;
  const y0 = 6 * cell;
  const x1 = 9 * cell;
  const y1 = 9 * cell;

  const drawTri = (p1: [number, number], p2: [number, number], color: LudoColor) => {
    const pal = LUDO_KING_HEX[color];
    const midX = (p1[0] + p2[0]) / 2;
    const midY = (p1[1] + p2[1]) / 2;
    const triGrad = ctx.createLinearGradient(midX, midY, cx, cy);
    triGrad.addColorStop(0, pal.css);
    triGrad.addColorStop(0.65, pal.mid);
    triGrad.addColorStop(1, pal.light);

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(p1[0], p1[1]);
    ctx.lineTo(p2[0], p2[1]);
    ctx.closePath();
    ctx.fillStyle = triGrad;
    ctx.fill();
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 7;
    ctx.lineJoin = 'round';
    ctx.stroke();
  };

  drawTri([x0, y0], [x0, y1], 'red');
  drawTri([x0, y0], [x1, y0], 'green');
  drawTri([x1, y0], [x1, y1], 'yellow');
  drawTri([x0, y1], [x1, y1], 'blue');

  drawCenterCrown(ctx, cx, cy, cell * 0.64);

  // Outer crisp board ink outline
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 12;
  ctx.strokeRect(5, 5, size - 10, size - 10);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

function createDashedSelectRingTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, 256, 256);

  // Crisp bright white + golden rotating halo around movable tokens
  const segs = 12;
  for (let i = 0; i < segs; i++) {
    const a0 = (i / segs) * Math.PI * 2;
    const a1 = a0 + ((Math.PI * 2) / segs) * 0.58;
    ctx.beginPath();
    ctx.arc(128, 128, 102, a0, a1);
    ctx.strokeStyle = i % 2 === 0 ? '#ffffff' : '#ffd600';
    ctx.lineWidth = 22;
    ctx.lineCap = 'round';
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.arc(128, 128, 76, 0, Math.PI * 2);
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 6;
  ctx.stroke();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createContactShadowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  const grad = ctx.createRadialGradient(64, 64, 14, 64, 64, 56);
  grad.addColorStop(0, 'rgba(10, 18, 42, 0.58)');
  grad.addColorStop(0.55, 'rgba(10, 18, 42, 0.24)');
  grad.addColorStop(1, 'rgba(10, 18, 42, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export const LudoCanvas: React.FC<LudoCanvasProps> = ({
  graphicsQuality,
  tokens,
  activeColors,
  currentTurnColor,
  legalTokenIndices,
  cameraPreset,
  activeReaction,
  onTokenClick,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [webglFailed, setWebglFailed] = useState(false);

  const propsRef = useRef({
    tokens,
    activeColors,
    currentTurnColor,
    legalTokenIndices,
    cameraPreset,
  });
  propsRef.current = {
    tokens,
    activeColors,
    currentTurnColor,
    legalTokenIndices,
    cameraPreset,
  };

  const onTokenClickRef = useRef(onTokenClick);
  onTokenClickRef.current = onTokenClick;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const isSoft = detectSoftwareWebGL();
    const preset = getGraphicsPreset(graphicsQuality);
    // Keep this lightweight tabletop razor-sharp on high-DPI mobile & desktop screens (no blurry 1x scaling on GPUs)
    const crispMaxDpr = isSoft ? 1 : Math.min(Math.max(preset.pixelRatio, 2), 2.5);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoft,
        alpha: true,
        powerPreference: 'high-performance',
      });
    } catch {
      setWebglFailed(true);
      return;
    }

    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    // NeutralToneMapping preserves 100% vivid, saturated primary colors without milky ACES washout
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 1.02;
    renderer.shadowMap.enabled = preset.shadows;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const initialSize = syncRendererToContainer(renderer, container, crispMaxDpr);

    const scene = new THREE.Scene();

    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    pmrem.dispose();

    const camera = new THREE.PerspectiveCamera(34, initialSize.aspect, 1.0, 80);
    const viewMetrics = {
      aspect: initialSize.aspect,
      fov: 34,
    };

    const maxAniso = renderer.capabilities.getMaxAnisotropy();

    // Calibrated True-Color Studio Lighting (crisp highlights on 3D pawns, ZERO blown-out haze on the board!)
    const hemi = new THREE.HemisphereLight(0xffffff, 0xdbeafe, 0.96);
    scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xffffff, 0.92);
    keyLight.position.set(3.4, 15, 4.6);
    keyLight.castShadow = preset.shadows;
    keyLight.shadow.mapSize.set(preset.shadowMapSize, preset.shadowMapSize);
    keyLight.shadow.camera.left = -6.2;
    keyLight.shadow.camera.right = 6.2;
    keyLight.shadow.camera.top = 6.2;
    keyLight.shadow.camera.bottom = -6.2;
    keyLight.shadow.bias = -0.0004;
    keyLight.shadow.normalBias = 0.018;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0xfffbeb, 0.34);
    rimLight.position.set(-5.5, 9, -5);
    scene.add(rimLight);

    // Classic HD Ludo King Board + Polished Gold & Multi-Color Corner Frame
    const boardTex = createLudoKingBoardTexture();
    boardTex.anisotropy = maxAniso;
    const shadowTex = createContactShadowTexture();
    const selectRingTex = createDashedSelectRingTexture();

    const boardGroup = new THREE.Group();
    scene.add(boardGroup);

    const goldRimMat = new THREE.MeshPhysicalMaterial({
      color: 0xffc824,
      metalness: 0.82,
      roughness: 0.18,
      clearcoat: 0.85,
      envMapIntensity: 1.15,
    });

    // Board chassis sits cleanly below y = 0 so NO metallic gold face can ever Z-fight with the 15x15 board surface
    const boardBase = new THREE.Mesh(
      new THREE.BoxGeometry(BOARD_FRAME_EXTENT, 0.32, BOARD_FRAME_EXTENT),
      goldRimMat,
    );
    boardBase.position.y = -0.22;
    boardGroup.add(boardBase);

    // 4 Vibrant Colorful Corner Bumper Accents wrapping the outer frame corners (Red, Green, Yellow, Blue)
    const bumperSpan = BOARD_FRAME_EXTENT * 0.42;
    const bumperOffset = BOARD_FRAME_EXTENT * 0.5 - bumperSpan * 0.5 + 0.02;
    const bumperConfigs: Array<{ color: LudoColor; x: number; z: number }> = [
      { color: 'red', x: -bumperOffset, z: -bumperOffset },
      { color: 'green', x: bumperOffset, z: -bumperOffset },
      { color: 'yellow', x: bumperOffset, z: bumperOffset },
      { color: 'blue', x: -bumperOffset, z: bumperOffset },
    ];
    bumperConfigs.forEach(({ color, x, z }) => {
      const bumperMat = new THREE.MeshPhysicalMaterial({
        color: LUDO_KING_HEX[color].body,
        emissive: LUDO_KING_HEX[color].emissive,
        emissiveIntensity: 0.15,
        roughness: 0.14,
        metalness: 0.12,
        clearcoat: 1.0,
      });
      const bumper = new THREE.Mesh(
        new THREE.BoxGeometry(bumperSpan, 0.3, bumperSpan),
        bumperMat,
      );
      bumper.position.set(x, -0.2, z);
      boardGroup.add(bumper);
    });

    // Hollow 4-rail inner gold trim strictly OUTSIDE the playable 15x15 board (never passes underneath or coplanar with boardSurface)
    const trimWidth = 0.11;
    const trimHeight = 0.04;
    const trimY = -0.02;
    const trimSpan = BOARD_SIZE + trimWidth * 2;
    const trimEdge = BOARD_SIZE * 0.5 + trimWidth * 0.5;
    const horizontalRailGeo = new THREE.BoxGeometry(trimSpan, trimHeight, trimWidth);
    const verticalRailGeo = new THREE.BoxGeometry(trimWidth, trimHeight, BOARD_SIZE);

    const topTrim = new THREE.Mesh(horizontalRailGeo, goldRimMat);
    topTrim.position.set(0, trimY, -trimEdge);
    const bottomTrim = new THREE.Mesh(horizontalRailGeo, goldRimMat);
    bottomTrim.position.set(0, trimY, trimEdge);
    const leftTrim = new THREE.Mesh(verticalRailGeo, goldRimMat);
    leftTrim.position.set(-trimEdge, trimY, 0);
    const rightTrim = new THREE.Mesh(verticalRailGeo, goldRimMat);
    rightTrim.position.set(trimEdge, trimY, 0);
    boardGroup.add(topTrim, bottomTrim, leftTrim, rightTrim);

    // Matte low-envMap board material cleanly elevated above the chassis so ZERO Z-fighting or glare ever covers the 15x15 grid
    const boardSurface = new THREE.Mesh(
      new THREE.PlaneGeometry(BOARD_SIZE, BOARD_SIZE),
      new THREE.MeshStandardMaterial({
        map: boardTex,
        roughness: 0.94,
        metalness: 0.0,
        envMapIntensity: 0.04,
      }),
    );
    boardSurface.rotation.x = -Math.PI / 2;
    boardSurface.position.y = 0.022;
    boardSurface.receiveShadow = true;
    boardGroup.add(boardSurface);

    // Crisp glowing golden active-turn border frame built from 4 non-overlapping edge bars around the current player's home yard
    const yardGlowSize = 6 * CELL_SIZE - 0.04;
    const yardGlowBarThickness = 0.14;
    const yardGlowHalf = yardGlowSize / 2;
    const yardGlowMat = new THREE.MeshBasicMaterial({
      color: 0xffe633,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    const yardGlowFrame = new THREE.Group();
    const glowHorizGeo = new THREE.PlaneGeometry(yardGlowSize, yardGlowBarThickness);
    const glowVertGeo = new THREE.PlaneGeometry(
      yardGlowBarThickness,
      yardGlowSize - yardGlowBarThickness * 2,
    );
    const glowBars: Array<{ geo: THREE.PlaneGeometry; x: number; z: number }> = [
      { geo: glowHorizGeo, x: 0, z: -(yardGlowHalf - yardGlowBarThickness / 2) },
      { geo: glowHorizGeo, x: 0, z: yardGlowHalf - yardGlowBarThickness / 2 },
      { geo: glowVertGeo, x: -(yardGlowHalf - yardGlowBarThickness / 2), z: 0 },
      { geo: glowVertGeo, x: yardGlowHalf - yardGlowBarThickness / 2, z: 0 },
    ];
    glowBars.forEach(({ geo, x, z }) => {
      const bar = new THREE.Mesh(geo, yardGlowMat);
      bar.rotation.x = -Math.PI / 2;
      bar.position.set(x, 0, z);
      bar.renderOrder = 2;
      yardGlowFrame.add(bar);
    });
    yardGlowFrame.position.y = 0.044;
    boardGroup.add(yardGlowFrame);

    // =========================================================================
    // 16 Iconic Glossy HD Ludo King Teardrop / Map-Pin Tokens
    // =========================================================================
    const pinProfile = [
      new THREE.Vector2(0.0, 0.0),
      new THREE.Vector2(0.19, 0.0),
      new THREE.Vector2(0.2, 0.055),
      new THREE.Vector2(0.105, 0.13),
      new THREE.Vector2(0.165, 0.28),
      new THREE.Vector2(0.255, 0.46),
      new THREE.Vector2(0.27, 0.58),
      new THREE.Vector2(0.23, 0.7),
      new THREE.Vector2(0.125, 0.78),
      new THREE.Vector2(0.0, 0.8),
    ];
    const pinGeo = new THREE.LatheGeometry(pinProfile, 32);

    const whiteGlossMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      emissive: 0xffffff,
      emissiveIntensity: 0.12,
      roughness: 0.08,
      metalness: 0.02,
      clearcoat: 1.0,
    });
    const darkOutlineMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.35,
      metalness: 0.2,
    });
    const goldCollarMat = new THREE.MeshPhysicalMaterial({
      color: 0xffd600,
      metalness: 0.85,
      roughness: 0.16,
      clearcoat: 0.8,
    });

    const baseRingGeo = new THREE.TorusGeometry(0.195, 0.028, 12, 28);
    const goldCollarGeo = new THREE.TorusGeometry(0.15, 0.02, 10, 24);
    const whiteBullseyeGeo = new THREE.CylinderGeometry(0.155, 0.165, 0.042, 28);
    const innerDotGeo = new THREE.CylinderGeometry(0.086, 0.09, 0.05, 24);
    const contactShadowGeo = new THREE.PlaneGeometry(0.7, 0.7);
    const contactShadowMat = new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const selectRingGeo = new THREE.PlaneGeometry(0.9, 0.9);

    type HopStepKind = 'hop' | 'unlock' | 'captured';

    interface QueuedHopStep {
      step: number;
      kind: HopStepKind;
      duration: number;
      triggersCapture?: boolean;
    }

    interface TokenActor {
      color: LudoColor;
      index: number;
      group: THREE.Group;
      bodyGroup: THREE.Group;
      selectRing: THREE.Mesh;
      hitProxy: THREE.Mesh;
      lastProgress: number;
      stepQueue: QueuedHopStep[];
      currentStep: QueuedHopStep | null;
      captureDelaySec: number;
      pendingCaptureReturn: boolean;
      fromPos: THREE.Vector3;
      toPos: THREE.Vector3;
      hopT: number;
      bounceT: number;
      currentPos: THREE.Vector3;
      isMoving: boolean;
    }

    const actors: TokenActor[] = [];
    const hitMeshes: THREE.Mesh[] = [];
    const proxyGeo = new THREE.CylinderGeometry(0.4, 0.4, 1.05, 12);
    const proxyMat = new THREE.MeshBasicMaterial({ visible: false });

    (['red', 'green', 'yellow', 'blue'] as LudoColor[]).forEach((color) => {
      const pawnMat = new THREE.MeshPhysicalMaterial({
        color: LUDO_KING_HEX[color].body,
        emissive: LUDO_KING_HEX[color].emissive,
        emissiveIntensity: 0.16,
        roughness: 0.08,
        metalness: 0.06,
        clearcoat: 1.0,
        clearcoatRoughness: 0.03,
        envMapIntensity: 1.15,
      });

      const selectRingMat = new THREE.MeshBasicMaterial({
        map: selectRingTex,
        transparent: true,
        opacity: 0.98,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      });

      for (let i = 0; i < 4; i++) {
        const root = new THREE.Group();

        const shadowDisc = new THREE.Mesh(contactShadowGeo, contactShadowMat);
        shadowDisc.rotation.x = -Math.PI / 2;
        shadowDisc.position.y = 0.008;
        shadowDisc.renderOrder = 1;
        root.add(shadowDisc);

        const selectRing = new THREE.Mesh(selectRingGeo, selectRingMat);
        selectRing.rotation.x = -Math.PI / 2;
        selectRing.position.y = 0.014;
        selectRing.renderOrder = 3;
        selectRing.visible = false;
        root.add(selectRing);

        // Iconic 5-part glossy Ludo King Pin Pawn (body + dark outline rim + golden neck collar + white bullseye + color jewel)
        const bodyGroup = new THREE.Group();
        const body = new THREE.Mesh(pinGeo, pawnMat);
        body.castShadow = true;
        body.receiveShadow = true;

        const baseRim = new THREE.Mesh(baseRingGeo, darkOutlineMat);
        baseRim.rotation.x = Math.PI / 2;
        baseRim.position.y = 0.04;

        const neckCollar = new THREE.Mesh(goldCollarGeo, goldCollarMat);
        neckCollar.rotation.x = Math.PI / 2;
        neckCollar.position.y = 0.18;

        const whiteCap = new THREE.Mesh(whiteBullseyeGeo, whiteGlossMat);
        whiteCap.position.y = 0.785;

        const innerColorPip = new THREE.Mesh(innerDotGeo, pawnMat);
        innerColorPip.position.y = 0.793;

        bodyGroup.add(body, baseRim, neckCollar, whiteCap, innerColorPip);
        root.add(bodyGroup);

        const hitProxy = new THREE.Mesh(proxyGeo, proxyMat);
        hitProxy.position.y = 0.45;
        hitProxy.userData = { color, tokenIndex: i };
        hitMeshes.push(hitProxy);
        root.add(hitProxy);

        scene.add(root);

        const initProg = propsRef.current.tokens[color][i];
        const [gx, gz] = getTokenGridCoords(color, i, initProg);
        const [wx, wz] = gridToWorld(gx, gz);
        const initVec = new THREE.Vector3(wx, 0.024, wz);
        root.position.copy(initVec);

        actors.push({
          color,
          index: i,
          group: root,
          bodyGroup,
          selectRing,
          hitProxy,
          lastProgress: initProg,
          stepQueue: [],
          currentStep: null,
          captureDelaySec: 0,
          pendingCaptureReturn: false,
          fromPos: initVec.clone(),
          toPos: initVec.clone(),
          hopT: 1,
          bounceT: 0,
          currentPos: initVec.clone(),
          isMoving: false,
        });
      }
    });

    // Raycasting for clickable 3D pawns
    const raycaster = new THREE.Raycaster();
    const pointerNdc = new THREE.Vector2();
    const onPointerDown = (e: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointerNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointerNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointerNdc, camera);
      const hits = raycaster.intersectObjects(hitMeshes, false);
      if (hits.length > 0) {
        const { color, tokenIndex } = hits[0].object.userData as {
          color: LudoColor;
          tokenIndex: number;
        };
        onTokenClickRef.current(color, tokenIndex);
      }
    };
    renderer.domElement.addEventListener('pointerdown', onPointerDown);

    const onResize = () => {
      if (!container) return;
      const sz = syncRendererToContainer(renderer, container, crispMaxDpr);
      viewMetrics.aspect = sz.aspect;
      viewMetrics.fov = 34;
      camera.fov = viewMetrics.fov;
      camera.aspect = sz.aspect;
      camera.updateProjectionMatrix();
    };
    onResize();
    const stopResizeObserver = observeContainerResize(container, onResize);

    const onContextLost = (e: Event) => {
      e.preventDefault();
      setWebglFailed(true);
    };
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);

    if (!isSoft) {
      renderer.compile(scene, camera);
    }

    const initialDist = computeTopDownBoardDistance(
      BOARD_FRAME_EXTENT,
      viewMetrics.aspect,
      viewMetrics.fov,
      0.955,
      0.1,
    );
    camera.position.set(0, initialDist, initialDist * 0.1);
    camera.lookAt(0, 0, 0);

    const clock = new THREE.Clock();
    const targetCamPos = new THREE.Vector3(0, initialDist, initialDist * 0.1);
    let alive = true;
    let frameHandle = 0;
    let frameIsTimeout = false;

    const tick = () => {
      if (!alive) return;
      const delta = Math.min(0.05, clock.getDelta());
      const t = clock.getElapsedTime();
      const {
        tokens: tokState,
        activeColors: active,
        currentTurnColor: turnColor,
        legalTokenIndices: legal,
        cameraPreset: camMode,
      } = propsRef.current;

      // Animate glowing golden turn border over the active player's corner yard
      const [ycCol, ycRow] = LUDO_KING_HEX[turnColor].yardCenter;
      const [yx, yz] = gridToWorld(ycCol - 0.5, ycRow - 0.5);
      yardGlowFrame.position.set(yx, 0.044, yz);
      yardGlowMat.opacity = 0.55 + Math.abs(Math.sin(t * 4.5)) * 0.45;

      // Compute final resting stack offsets for tokens sharing a tile
      const cellCounts = new Map<string, number>();
      const actorOffset = new Map<TokenActor, [number, number, number]>();
      for (const actor of actors) {
        if (!active.includes(actor.color)) continue;
        const prog = tokState[actor.color][actor.index];
        const [gx, gz] = getTokenGridCoords(actor.color, actor.index, prog);
        const key = `${gx.toFixed(1)}_${gz.toFixed(1)}`;
        const count = cellCounts.get(key) || 0;
        cellCounts.set(key, count + 1);
        const ox = count === 0 ? 0 : count % 2 === 1 ? 0.15 : -0.15;
        const oz = count === 0 ? 0 : count > 1 ? 0.14 : -0.12;
        actorOffset.set(actor, [ox, oz, count]);
      }

      const STEP_DURATION_SEC = 0.27;
      const UNLOCK_DURATION_SEC = 0.32;
      const CAPTURE_RETURN_DURATION_SEC = 0.3;

      // Pass 1: Detect forward movers first so real captures can synchronize victim return & sound with attacker touchdown
      const forwardMovers: Array<{
        actor: TokenActor;
        prevProg: number;
        targetProg: number;
        destAbsIdx: number | null;
        totalDurationSec: number;
      }> = [];

      for (const actor of actors) {
        const isActiveColor = active.includes(actor.color);
        actor.group.visible = isActiveColor;
        if (!isActiveColor) continue;

        const targetProg = tokState[actor.color][actor.index];
        if (targetProg === actor.lastProgress) continue;

        if (targetProg > actor.lastProgress) {
          const prevProg = actor.lastProgress;
          const stepStart = prevProg === -1 ? 0 : prevProg + 1;
          const stepsCount = Math.max(1, targetProg - stepStart + 1);
          const totalDurationSec =
            prevProg === -1 && targetProg === 0
              ? UNLOCK_DURATION_SEC
              : (prevProg === -1 ? UNLOCK_DURATION_SEC : 0) +
                (prevProg === -1 ? Math.max(0, stepsCount - 1) : stepsCount) * STEP_DURATION_SEC;

          const destAbsIdx =
            targetProg >= 0 && targetProg <= 51
              ? (START_OFFSET[actor.color] + targetProg) % 52
              : null;

          forwardMovers.push({
            actor,
            prevProg,
            targetProg,
            destAbsIdx,
            totalDurationSec,
          });
        }
      }

      // Pass 2: Enqueue step-by-step hops for ALL active colors (Red, Green, Yellow, Blue) and sync captured pieces
      for (const mover of forwardMovers) {
        const { actor, prevProg, targetProg } = mover;
        if (prevProg === -1 && targetProg === 0) {
          actor.stepQueue.push({
            step: 0,
            kind: 'unlock',
            duration: UNLOCK_DURATION_SEC,
          });
        } else if (prevProg === -1 && targetProg > 0) {
          actor.stepQueue.push({
            step: 0,
            kind: 'unlock',
            duration: UNLOCK_DURATION_SEC,
          });
          for (let s = 1; s <= targetProg; s++) {
            actor.stepQueue.push({
              step: s,
              kind: 'hop',
              duration: STEP_DURATION_SEC,
            });
          }
        } else if (targetProg - prevProg <= 18) {
          for (let s = prevProg + 1; s <= targetProg; s++) {
            actor.stepQueue.push({
              step: s,
              kind: 'hop',
              duration: STEP_DURATION_SEC,
            });
          }
        } else {
          actor.stepQueue.push({
            step: targetProg,
            kind: 'hop',
            duration: STEP_DURATION_SEC,
          });
        }
        actor.lastProgress = targetProg;
      }

      for (const actor of actors) {
        const isActiveColor = active.includes(actor.color);
        if (!isActiveColor) continue;

        const targetProg = tokState[actor.color][actor.index];
        if (targetProg !== actor.lastProgress && targetProg < actor.lastProgress) {
          const prevProg = actor.lastProgress;
          actor.lastProgress = targetProg;

          if (targetProg === -1 && prevProg >= 0 && prevProg <= 51) {
            const victimAbsIdx = (START_OFFSET[actor.color] + prevProg) % 52;
            const attacker = forwardMovers.find(
              (m) => m.actor.color !== actor.color && m.destAbsIdx === victimAbsIdx,
            );
            if (attacker && attacker.actor.stepQueue.length > 0) {
              // Synchronize capture impact sound and victim return with the attacker's landing step
              attacker.actor.stepQueue[attacker.actor.stepQueue.length - 1].triggersCapture = true;
              actor.stepQueue.length = 0;
              actor.currentStep = null;
              actor.isMoving = false;
              actor.captureDelaySec = Math.max(0.05, attacker.totalDurationSec - 0.02);
              actor.pendingCaptureReturn = true;
              continue;
            }
          }

          // New match reset or non-capture state sync: snap cleanly with no stale queue or sound
          actor.stepQueue.length = 0;
          actor.currentStep = null;
          actor.isMoving = false;
          actor.pendingCaptureReturn = false;
          actor.captureDelaySec = 0;
          actor.bounceT = 0;
          const [gx, gz] = getTokenGridCoords(actor.color, actor.index, targetProg);
          const [wx, wz] = gridToWorld(gx, gz);
          actor.currentPos.set(wx, 0.024, wz);
          actor.fromPos.copy(actor.currentPos);
          actor.toPos.copy(actor.currentPos);
        }
      }

      // Pass 3: Advance 160ms tile-by-tile arc hops, mid-hop scale(1.18), landing bounce, and Web Audio triggers
      for (const actor of actors) {
        const isActiveColor = active.includes(actor.color);
        if (!isActiveColor) continue;

        const targetProg = tokState[actor.color][actor.index];
        const [ox, oz, stackCount] = actorOffset.get(actor) || [0, 0, 0];

        // Wait until capturing attacker lands before launching captured victim back to home yard
        if (actor.pendingCaptureReturn) {
          actor.captureDelaySec -= delta;
          if (actor.captureDelaySec <= 0) {
            actor.pendingCaptureReturn = false;
            actor.captureDelaySec = 0;
            actor.stepQueue.push({
              step: -1,
              kind: 'captured',
              duration: CAPTURE_RETURN_DURATION_SEC,
            });
          }
        }

        // Launch the next sequential single-tile hop from the queue
        if (!actor.isMoving && actor.stepQueue.length > 0) {
          const nextStep = actor.stepQueue.shift()!;
          const isFinalStep = actor.stepQueue.length === 0;
          const [gx, gz] = getTokenGridCoords(actor.color, actor.index, nextStep.step);
          const [wx, wz] = gridToWorld(gx, gz);
          actor.fromPos.copy(actor.currentPos);
          actor.toPos.set(wx + (isFinalStep ? ox : 0), 0.024, wz + (isFinalStep ? oz : 0));
          actor.currentStep = nextStep;
          actor.hopT = 0;
          actor.bounceT = 0;
          actor.isMoving = true;

          // Trigger crisp per-step sound effect on every single tile step or home-yard unlock
          if (nextStep.kind === 'unlock') {
            soundEngine.playLudoUnlock();
          } else if (nextStep.kind === 'hop') {
            soundEngine.playLudoStepHop();
          }
        }

        let hopY = 0;
        let hopScaleX = 1.0;
        let hopScaleY = 1.0;
        let hopScaleZ = 1.0;

        if (actor.isMoving && actor.currentStep) {
          const stepDur = Math.max(0.06, actor.currentStep.duration);
          actor.hopT = Math.min(1, actor.hopT + delta / stepDur);
          const ease = actor.hopT * actor.hopT * (3 - 2 * actor.hopT);
          actor.currentPos.lerpVectors(actor.fromPos, actor.toPos, ease);

          const arc = Math.sin(actor.hopT * Math.PI);
          const arcHeight =
            actor.currentStep.kind === 'unlock'
              ? 0.85
              : actor.currentStep.kind === 'captured'
                ? 0.98
                : 0.68;
          hopY = arc * arcHeight;

          // Smooth scale(1.18) pop at mid-hop returning cleanly to scale(1) on landing
          const s = 1.0 + arc * 0.18;
          hopScaleX = s;
          hopScaleY = s;
          hopScaleZ = s;

          if (actor.hopT >= 1) {
            const finishedStep = actor.currentStep;
            actor.currentPos.copy(actor.toPos);
            actor.isMoving = false;
            actor.currentStep = null;
            actor.bounceT = 1.0;

            const isFinalLanding = actor.stepQueue.length === 0;
            if (isFinalLanding) {
              if (finishedStep.triggersCapture) {
                soundEngine.playLudoCapture();
              } else if (finishedStep.kind === 'hop') {
                const landedHome = finishedStep.step === 57;
                const landedSafeStar =
                  finishedStep.step >= 0 &&
                  finishedStep.step <= 51 &&
                  SAFE_TRACK_INDICES.has((START_OFFSET[actor.color] + finishedStep.step) % 52);
                if (landedHome || landedSafeStar) {
                  soundEngine.playLudoSafeOrHome();
                }
              }
            }
          }
        } else if (!actor.pendingCaptureReturn) {
          const [gx, gz] = getTokenGridCoords(actor.color, actor.index, targetProg);
          const [wx, wz] = gridToWorld(gx, gz);
          actor.currentPos.x = THREE.MathUtils.damp(actor.currentPos.x, wx + ox, 14, delta);
          actor.currentPos.z = THREE.MathUtils.damp(actor.currentPos.z, wz + oz, 14, delta);
        }

        const isSelectable =
          actor.color === turnColor &&
          legal.includes(actor.index) &&
          !actor.isMoving &&
          actor.stepQueue.length === 0;
        actor.selectRing.visible = isSelectable;
        actor.group.position.set(actor.currentPos.x, 0.024, actor.currentPos.z);

        if (actor.isMoving) {
          actor.bodyGroup.position.y = hopY;
          actor.bodyGroup.scale.set(hopScaleX, hopScaleY, hopScaleZ);
        } else if (actor.bounceT > 0) {
          // Subtle tactile landing bounce settling cleanly back to scale(1)
          actor.bounceT = Math.max(0, actor.bounceT - delta / 0.13);
          const baseScale = isSelectable ? 1.13 : stackCount > 0 ? 0.88 : 1.0;
          const squash = Math.sin(actor.bounceT * Math.PI) * 0.11 * actor.bounceT;
          const reboundY = Math.sin((1 - actor.bounceT) * Math.PI) * 0.06 * actor.bounceT;
          actor.bodyGroup.position.y = reboundY;
          actor.bodyGroup.scale.set(
            baseScale * (1 + squash * 0.75),
            baseScale * (1 - squash),
            baseScale * (1 + squash * 0.75),
          );
        } else if (isSelectable) {
          actor.selectRing.rotation.z = -t * 2.6;
          const ringPulse = 1 + Math.sin(t * 6.5) * 0.08;
          actor.selectRing.scale.set(ringPulse, ringPulse, 1);
          actor.bodyGroup.position.y = Math.abs(Math.sin(t * 5.8)) * 0.24;
          actor.bodyGroup.scale.setScalar(1.13);
        } else {
          actor.bodyGroup.position.y = 0;
          actor.bodyGroup.scale.setScalar(stackCount > 0 ? 0.88 : 1.0);
        }
      }

      // Crisp near-top-down Ludo King framing filling ~97.5% of the square frame
      if (camMode === 'angled') {
        const dist = computeTopDownBoardDistance(
          BOARD_FRAME_EXTENT,
          viewMetrics.aspect,
          viewMetrics.fov,
          0.92,
          0.48,
        );
        targetCamPos.set(0, dist * 0.86, dist * 0.48);
      } else {
        const dist = computeTopDownBoardDistance(
          BOARD_FRAME_EXTENT,
          viewMetrics.aspect,
          viewMetrics.fov,
          0.955,
          0.1,
        );
        targetCamPos.set(0, dist, dist * 0.1);
      }

      camera.position.x = THREE.MathUtils.damp(camera.position.x, targetCamPos.x, 6.5, delta);
      camera.position.y = THREE.MathUtils.damp(camera.position.y, targetCamPos.y, 6.5, delta);
      camera.position.z = THREE.MathUtils.damp(camera.position.z, targetCamPos.z, 6.5, delta);
      camera.lookAt(0, 0, 0);

      renderer.render(scene, camera);
      scheduleNextFrame(renderer, isSoft, tick, (id, isTo) => {
        frameHandle = id;
        frameIsTimeout = isTo;
      });
    };

    tick();

    return () => {
      alive = false;
      if (frameIsTimeout) window.clearTimeout(frameHandle);
      else window.cancelAnimationFrame(frameHandle);
      stopResizeObserver();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);

      envTex.dispose();
      boardTex.dispose();
      shadowTex.dispose();
      selectRingTex.dispose();
      scene.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          const m = obj as THREE.Mesh;
          m.geometry?.dispose();
          if (Array.isArray(m.material)) m.material.forEach((mt) => mt.dispose());
          else m.material?.dispose();
        }
      });
      renderer.dispose();
    };
  }, [graphicsQuality]);

  if (webglFailed) {
    return (
      <div className="relative w-full h-full flex items-center justify-center bg-[#1d4ed8] rounded-xl overflow-hidden">
        <img
          src={GENERATED_ASSETS.ludoPreview}
          alt="Ludo 3D Board"
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover opacity-85"
        />
      </div>
    );
  }

  const reactionPosClass: Record<LudoColor, string> = {
    red: 'top-2 left-2 border-[#fff0f2] bg-[#e60023] text-white',
    green: 'top-2 right-2 border-[#e2fce9] bg-[#00a844] text-white',
    yellow: 'bottom-2 right-2 border-[#fff9d6] bg-[#d98a00] text-white',
    blue: 'bottom-2 left-2 border-[#e0f4ff] bg-[#007ce6] text-white',
  };

  return (
    <div className="relative w-full h-full aspect-square overflow-hidden">
      <div
        ref={containerRef}
        className="w-full h-full aspect-square overflow-hidden cursor-pointer select-none"
      />
      {activeReaction && (
        <div
          key={activeReaction.id}
          className={`pointer-events-none absolute z-20 px-2.5 py-1.5 rounded-xl border-2 shadow-2xl flex items-center gap-1.5 max-w-[190px] animate-bounce ${reactionPosClass[activeReaction.color]}`}
        >
          <span className="text-base leading-none shrink-0">{activeReaction.emoji}</span>
          <div className="min-w-0">
            <div className="text-[9px] uppercase tracking-wider opacity-90 truncate">
              {activeReaction.senderName}
            </div>
            <div className="text-[11px] font-bold truncate">{activeReaction.text}</div>
          </div>
        </div>
      )}
    </div>
  );
};
