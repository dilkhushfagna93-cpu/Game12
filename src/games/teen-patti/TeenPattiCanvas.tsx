import React, { useEffect, useRef } from 'react';
import type { GraphicsQuality } from '../../types';
import { soundEngine } from '../../services/soundEngine';

export interface ChipFlyEvent {
  id: number;
  fromVisualSeat: number; // 0..4
  amount: number;
}

export interface WinSweepEvent {
  id: number;
  toVisualSeat: number; // 0..4
}

interface TeenPattiCanvasProps {
  quality: GraphicsQuality;
  pot: number;
  bootAmount: number;
  activeSeatCount: number;
  dealPulse: number;
  chipEvent: ChipFlyEvent | null;
  winSweepEvent: WinSweepEvent | null;
  tipDealerPulse: number;
  isShowdown: boolean;
}

interface FlyingChip {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  ctrlX: number;
  ctrlY: number;
  progress: number;
  speed: number;
  amount: number;
  rotation: number;
  radius: number;
  delay: number;
}

interface RestingChip {
  x: number;
  y: number;
  radius: number;
  amount: number;
  rotation: number;
}

interface FlyingCard {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  progress: number;
  speed: number;
  delay: number;
  angle: number;
}

interface SparkParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
}

interface TipHeart {
  x: number;
  y: number;
  vy: number;
  life: number;
  maxLife: number;
  scale: number;
}

// Normalized visual seat anchor coordinates (matching TeenPattiPage overlay):
// 0 = Bottom-Center (User), 1 = Lower-Left, 2 = Upper-Left, 3 = Upper-Right, 4 = Lower-Right
export function getSeatNormalizedAnchor(visualSeat: number): { nx: number; ny: number } {
  switch (visualSeat) {
    case 0:
      return { nx: 0.5, ny: 0.80 };
    case 1:
      return { nx: 0.18, ny: 0.61 };
    case 2:
      return { nx: 0.24, ny: 0.22 };
    case 3:
      return { nx: 0.76, ny: 0.22 };
    case 4:
      return { nx: 0.82, ny: 0.61 };
    default:
      return { nx: 0.5, ny: 0.5 };
  }
}

export const TeenPattiCanvas: React.FC<TeenPattiCanvasProps> = ({
  quality,
  pot,
  bootAmount,
  activeSeatCount,
  dealPulse,
  chipEvent,
  winSweepEvent,
  tipDealerPulse,
  isShowdown,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const propsRef = useRef({
    quality,
    pot,
    bootAmount,
    activeSeatCount,
    isShowdown,
  });
  propsRef.current = { quality, pot, bootAmount, activeSeatCount, isShowdown };

  const chipsRef = useRef<FlyingChip[]>([]);
  const cardsRef = useRef<FlyingCard[]>([]);
  const sparksRef = useRef<SparkParticle[]>([]);
  const heartsRef = useRef<TipHeart[]>([]);
  const dimsRef = useRef({ w: 960, h: 600 });

  // Trigger animated sequential one-by-one card dealing from side deck stack
  useEffect(() => {
    if (dealPulse <= 0) return;
    soundEngine.unlock();
    const { w, h } = dimsRef.current;
    const cx = w * 0.5;
    const cy = h * 0.49;
    const rx = Math.min(w * 0.43, 460);
    const ry = Math.min(h * 0.34, 215);

    const deckX = cx + rx * 0.76;
    const deckY = cy - ry * 0.22;

    const seats = [0, 1, 2, 3, 4].slice(0, Math.max(2, Math.min(5, activeSeatCount)));

    const nextCards: FlyingCard[] = [];
    for (let cardIdx = 0; cardIdx < 3; cardIdx++) {
      seats.forEach((seat, sIdx) => {
        const anchor = getSeatNormalizedAnchor(seat);
        const delay = (cardIdx * seats.length + sIdx) * 0.18;
        nextCards.push({
          startX: deckX,
          startY: deckY,
          endX: w * anchor.nx + (cardIdx - 1) * 12,
          endY: h * anchor.ny,
          progress: 0,
          speed: 2.2,
          delay,
          angle: (cardIdx - 1) * 0.12,
        });
        window.setTimeout(() => {
          soundEngine.playCardDeal();
        }, delay * 1000);
      });
    }
    cardsRef.current = nextCards;
  }, [dealPulse, activeSeatCount]);

  const restingChipsRef = useRef<RestingChip[]>([]);

  // Clear resting chips if pot resets to 0
  useEffect(() => {
    if (pot === 0) {
      restingChipsRef.current = [];
    }
  }, [pot]);

  // Initialize resting chips if pot > 0 and resting chips is empty (e.g., on reload / re-join)
  useEffect(() => {
    if (pot > 0 && restingChipsRef.current.length === 0) {
      const { w, h } = dimsRef.current;
      const cx = w * 0.5;
      const cy = h * 0.49;
      const rx = Math.min(w * 0.43, 460);
      const ry = Math.min(h * 0.34, 215);
      const innerRx = rx * 0.58;
      const innerRy = ry * 0.52;

      const unit = Math.max(1, bootAmount || 1);
      const estimatedCount = Math.max(1, Math.min(30, Math.round(pot / unit)));
      const chipsToInit: RestingChip[] = [];

      for (let i = 0; i < estimatedCount; i++) {
        let x = cx + (Math.random() - 0.5) * innerRx * 1.4;
        let y = cy + (Math.random() - 0.5) * innerRy * 1.4;

        let attempts = 0;
        while (attempts < 35) {
          let minDist = Infinity;
          for (const existing of chipsToInit) {
            const dx = existing.x - x;
            const dy = existing.y - y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < minDist) minDist = dist;
          }
          if (minDist >= 34 || chipsToInit.length === 0) break;
          x = cx + (Math.random() - 0.5) * innerRx * 1.4;
          y = cy + (Math.random() - 0.5) * innerRy * 1.4;
          attempts++;
        }

        chipsToInit.push({
          x,
          y,
          radius: 13,
          amount: unit,
          rotation: Math.random() * Math.PI * 2,
        });
      }
      restingChipsRef.current = chipsToInit;
    }
  }, [pot, bootAmount]);

  // Trigger poker chips tossing from a seat into scattered felt area with >= 34px non-overlapping spacing
  useEffect(() => {
    if (!chipEvent) return;
    const { w, h } = dimsRef.current;
    const anchor = getSeatNormalizedAnchor(chipEvent.fromVisualSeat);
    const startX = w * anchor.nx;
    const startY = h * anchor.ny;

    const cx = w * 0.5;
    const cy = h * 0.49;
    const rx = Math.min(w * 0.43, 460);
    const ry = Math.min(h * 0.34, 215);
    const innerRx = rx * 0.58;
    const innerRy = ry * 0.52;

    const betAmt = Math.max(1, chipEvent.amount || bootAmount);

    let endX = cx + (Math.random() - 0.5) * innerRx * 1.4;
    let endY = cy + (Math.random() - 0.5) * innerRy * 1.4;

    let attempts = 0;
    while (attempts < 40) {
      let minDist = Infinity;
      for (const rc of restingChipsRef.current) {
        const dx = rc.x - endX;
        const dy = rc.y - endY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < minDist) minDist = dist;
      }
      for (const fc of chipsRef.current) {
        const dx = fc.endX - endX;
        const dy = fc.endY - endY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < minDist) minDist = dist;
      }
      if (minDist >= 34 || (restingChipsRef.current.length === 0 && chipsRef.current.length === 0)) {
        break;
      }
      endX = cx + (Math.random() - 0.5) * innerRx * 1.4;
      endY = cy + (Math.random() - 0.5) * innerRy * 1.4;
      attempts++;
    }

    chipsRef.current.push({
      startX: startX + (Math.random() - 0.5) * 12,
      startY: startY + (Math.random() - 0.5) * 12,
      endX,
      endY,
      ctrlX: (startX + endX) * 0.5 + (Math.random() - 0.5) * 30,
      ctrlY: Math.min(startY, endY) - 40 - Math.random() * 20,
      progress: 0,
      speed: 2.2 + Math.random() * 0.5,
      amount: betAmt,
      rotation: Math.random() * Math.PI * 2,
      radius: 13 + Math.min(4, Math.floor(Math.log10(betAmt + 1) * 1.5)),
      delay: 0,
    });
  }, [chipEvent, bootAmount]);

  // Trigger winning pot-sweep & golden sparkle burst
  useEffect(() => {
    if (!winSweepEvent) return;
    const { w, h } = dimsRef.current;
    const anchor = getSeatNormalizedAnchor(winSweepEvent.toVisualSeat);
    const startX = w * 0.5;
    const startY = h * 0.48;
    const endX = w * anchor.nx;
    const endY = h * anchor.ny;

    const chipCount = propsRef.current.quality === 'low' ? 6 : 12;
    for (let i = 0; i < chipCount; i++) {
      chipsRef.current.push({
        startX: startX + (Math.random() - 0.5) * 44,
        startY: startY + (Math.random() - 0.5) * 24,
        endX: endX + (Math.random() - 0.5) * 20,
        endY: endY + (Math.random() - 0.5) * 16,
        ctrlX: (startX + endX) * 0.5 + (Math.random() - 0.5) * 70,
        ctrlY: (startY + endY) * 0.5 - 50,
        progress: 0,
        speed: 1.85 + Math.random() * 0.45,
        amount: 50,
        rotation: Math.random() * Math.PI * 2,
        radius: 12,
        delay: i * 0.04,
      });
    }

    const sparkCount = propsRef.current.quality === 'low' ? 18 : 42;
    const sparkColors = ['#fde047', '#f59e0b', '#34d399', '#fff7ed'];
    for (let i = 0; i < sparkCount; i++) {
      const a = (Math.PI * 2 * i) / sparkCount + Math.random() * 0.3;
      const spd = 45 + Math.random() * 145;
      sparksRef.current.push({
        x: endX,
        y: endY,
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd - 30,
        life: 0,
        maxLife: 0.9 + Math.random() * 0.7,
        size: 2.2 + Math.random() * 3.2,
        color: sparkColors[i % sparkColors.length],
      });
    }
  }, [winSweepEvent]);

  // Trigger Tip Dealer coin arc & thank-you hearts
  useEffect(() => {
    if (tipDealerPulse <= 0) return;
    const { w, h } = dimsRef.current;
    const startX = w * 0.5;
    const startY = h * 0.82;
    const endX = w * 0.5;
    const endY = h * 0.13;

    for (let i = 0; i < 3; i++) {
      chipsRef.current.push({
        startX: startX + (i - 1) * 14,
        startY,
        endX: endX + (i - 1) * 10,
        endY,
        ctrlX: startX + (i - 1) * 45,
        ctrlY: h * 0.38,
        progress: 0,
        speed: 1.9,
        amount: 10,
        rotation: 0,
        radius: 11,
        delay: i * 0.08,
      });
    }

    for (let i = 0; i < 6; i++) {
      heartsRef.current.push({
        x: endX + (Math.random() - 0.5) * 56,
        y: endY + 8,
        vy: -26 - Math.random() * 24,
        life: 0,
        maxLife: 1.25 + Math.random() * 0.45,
        scale: 0.75 + Math.random() * 0.5,
      });
    }
  }, [tipDealerPulse]);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;
    let lastTime = performance.now();

    const resize = () => {
      const rect = container.getBoundingClientRect();
      const w = Math.max(320, Math.floor(rect.width));
      const h = Math.max(320, Math.floor(rect.height));
      const maxDpr = propsRef.current.quality === 'low' ? 1 : propsRef.current.quality === 'medium' ? 1.5 : 2;
      const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      dimsRef.current = { w, h };
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);

    const drawChip = (x: number, y: number, r: number, fill: string, rim: string) => {
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y + 2, r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fill();

      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = rim;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(x, y, r * 0.58, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 1;
      ctx.setLineDash([2.5, 2.5]);
      ctx.stroke();
      ctx.restore();
    };

    const getChipDenominationStyle = (amount: number) => {
      if (amount <= 1) return { fill: '#eab308', rim: '#fef08a', text: '#140d02' };
      if (amount <= 2) return { fill: '#3b82f6', rim: '#bfdbfe', text: '#ffffff' };
      if (amount <= 5) return { fill: '#ef4444', rim: '#fecaca', text: '#ffffff' };
      if (amount <= 10) return { fill: '#10b981', rim: '#a7f3d0', text: '#064e3b' };
      if (amount <= 25) return { fill: '#8b5cf6', rim: '#ddd6fe', text: '#ffffff' };
      return { fill: '#d4af37', rim: '#fffbeb', text: '#140d02' };
    };

    const drawChipWithTag = (
      x: number,
      y: number,
      r: number,
      amount: number,
      rotation: number,
    ) => {
      const style = getChipDenominationStyle(amount);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rotation);

      ctx.beginPath();
      ctx.arc(0, 2, r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fill();

      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fillStyle = style.fill;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = style.rim;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(0, 0, r * 0.72, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.65)';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = style.text;
      ctx.font = `900 ${Math.max(9, Math.round(r * 0.7))}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`₹${amount}`, 0, 0.5);

      ctx.restore();
    };

    const drawHeart = (x: number, y: number, s: number, alpha: number) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(s, s);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#fb7185';
      ctx.beginPath();
      ctx.moveTo(0, 4);
      ctx.bezierCurveTo(-10, -4, -10, -13, 0, -6);
      ctx.bezierCurveTo(10, -13, 10, -4, 0, 4);
      ctx.fill();
      ctx.restore();
    };

    const render = (now: number) => {
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;
      const { w, h } = dimsRef.current;
      const { pot: curPot, bootAmount: curBoot, isShowdown: showdown } = propsRef.current;

      // 1. Luxury Obsidian Casino Room Backdrop
      const bgGrad = ctx.createRadialGradient(w * 0.5, h * 0.42, 30, w * 0.5, h * 0.5, Math.max(w, h) * 0.72);
      bgGrad.addColorStop(0, '#141026');
      bgGrad.addColorStop(0.55, '#0b0816');
      bgGrad.addColorStop(1, '#050409');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, w, h);

      // Subtle overhead chandelier glow
      const glowGrad = ctx.createRadialGradient(w * 0.5, h * 0.08, 10, w * 0.5, h * 0.35, w * 0.55);
      glowGrad.addColorStop(0, 'rgba(246, 220, 147, 0.14)');
      glowGrad.addColorStop(1, 'rgba(246, 220, 147, 0)');
      ctx.fillStyle = glowGrad;
      ctx.fillRect(0, 0, w, h);

      // Table geometry: responsive royal oval
      const cx = w * 0.5;
      const cy = h * 0.5;
      const rx = Math.min(w * 0.44, 460);
      const ry = Math.min(h * 0.35, 220);

      // 2. Table Drop Shadow
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(cx, cy + 16, rx + 26, ry + 24, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
      ctx.filter = 'blur(14px)';
      ctx.fill();
      ctx.restore();

      // 3. Mahogany / Walnut Outer Cushion Rail
      ctx.save();
      const railGrad = ctx.createLinearGradient(cx, cy - ry - 26, cx, cy + ry + 26);
      railGrad.addColorStop(0, '#4a2414');
      railGrad.addColorStop(0.35, '#2b1209');
      railGrad.addColorStop(0.7, '#3f1c0e');
      railGrad.addColorStop(1, '#1a0a05');
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx + 24, ry + 22, 0, 0, Math.PI * 2);
      ctx.fillStyle = railGrad;
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = 'rgba(212, 175, 55, 0.55)';
      ctx.stroke();

      // Inner brushed gold bezel lip
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx + 6, ry + 6, 0, 0, Math.PI * 2);
      ctx.lineWidth = 3.5;
      const goldRim = ctx.createLinearGradient(cx - rx, cy - ry, cx + rx, cy + ry);
      goldRim.addColorStop(0, '#9a7118');
      goldRim.addColorStop(0.3, '#f6dc93');
      goldRim.addColorStop(0.65, '#cfa432');
      goldRim.addColorStop(1, '#7c5308');
      ctx.strokeStyle = goldRim;
      ctx.stroke();
      ctx.restore();

      // 4. Emerald Velvet Oval Felt
      ctx.save();
      const feltGrad = ctx.createRadialGradient(cx, cy - ry * 0.16, 16, cx, cy, Math.max(rx, ry) * 1.05);
      feltGrad.addColorStop(0, '#0f6b4b');
      feltGrad.addColorStop(0.55, '#094a34');
      feltGrad.addColorStop(1, '#04271c');
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.fillStyle = feltGrad;
      ctx.fill();

      // Inner ornate gold betting oval line
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx * 0.8, ry * 0.74, 0, 0, Math.PI * 2);
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = showdown
        ? 'rgba(250, 204, 21, 0.58)'
        : 'rgba(246, 220, 147, 0.28)';
      ctx.stroke();

      // Secondary dotted inner accent ring
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx * 0.76, ry * 0.69, 0, 0, Math.PI * 2);
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 6]);
      ctx.strokeStyle = 'rgba(246, 220, 147, 0.16)';
      ctx.stroke();
      ctx.setLineDash([]);

      // Subtle felt crest text
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(246, 220, 147, 0.13)';
      ctx.font = `700 ${Math.max(10, Math.min(14, Math.floor(rx * 0.042)))}px Georgia, serif`;
      ctx.fillText('AURELIA ARENA · ROYAL 3 PATTI', cx, cy - ry * 0.44);
      ctx.restore();

      // 5. Top-Center Brushed Brass Dealer Shoe & Tray
      ctx.save();
      const trayW = Math.min(106, rx * 0.34);
      const trayH = 24;
      const trayX = cx - trayW / 2;
      const trayY = cy - ry - 18;
      ctx.fillStyle = '#190c06';
      ctx.strokeStyle = 'rgba(246, 220, 147, 0.65)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(trayX, trayY, trayW, trayH, 10);
      ctx.fill();
      ctx.stroke();

      // Mini chip stacks inside dealer tray
      const trayChipColors = ['#d4af37', '#b91c1c', '#10b981', '#d4af37'];
      for (let i = 0; i < 4; i++) {
        const tx = trayX + 16 + i * ((trayW - 32) / 3);
        ctx.fillStyle = trayChipColors[i];
        ctx.beginPath();
        ctx.roundRect(tx - 6, trayY + 5, 12, 14, 3);
        ctx.fill();
      }
      ctx.restore();

      // Render Persistent Card Deck Stack on the top-right side of table felt
      ctx.save();
      const deckX = cx + rx * 0.76;
      const deckY = cy - ry * 0.22;
      ctx.translate(deckX, deckY);
      for (let s = 4; s >= 0; s--) {
        ctx.save();
        ctx.translate(s * 1.2, -s * 1.5);
        ctx.fillStyle = '#111827';
        ctx.beginPath();
        ctx.roundRect(-15, -22, 30, 44, 4);
        ctx.fill();
        ctx.fillStyle = '#7f1d1d';
        ctx.strokeStyle = '#f6dc93';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(-13, -20, 26, 40, 3);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
      ctx.restore();

      // 6. Scattered Pot Coins Across the Center Felt
      for (const rc of restingChipsRef.current) {
        drawChipWithTag(rc.x, rc.y, rc.radius, rc.amount, rc.rotation);
      }

      // 7. Update & Render Dealing Cards
      if (cardsRef.current.length > 0) {
        const remaining: FlyingCard[] = [];
        for (const card of cardsRef.current) {
          if (card.delay > 0) {
            card.delay -= dt;
            remaining.push(card);
            continue;
          }
          card.progress += dt * card.speed;
          if (card.progress < 1) {
            const t = 1 - Math.pow(1 - card.progress, 3);
            const x = card.startX + (card.endX - card.startX) * t;
            const y = card.startY + (card.endY - card.startY) * t;
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(card.angle + (1 - t) * 1.4);
            ctx.fillStyle = '#7f1d1d';
            ctx.strokeStyle = '#f6dc93';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.roundRect(-13, -19, 26, 38, 4);
            ctx.fill();
            ctx.stroke();
            ctx.restore();
            remaining.push(card);
          }
        }
        cardsRef.current = remaining;
      }

      // 8. Update & Render Flying Chips (tossing into scattered pot area)
      if (chipsRef.current.length > 0) {
        const remaining: FlyingChip[] = [];
        for (const ch of chipsRef.current) {
          if (ch.delay > 0) {
            ch.delay -= dt;
            remaining.push(ch);
            continue;
          }
          ch.progress += dt * ch.speed;
          if (ch.progress < 1) {
            const t = 1 - Math.pow(1 - ch.progress, 2.5);
            const omt = 1 - t;
            const x = omt * omt * ch.startX + 2 * omt * t * ch.ctrlX + t * t * ch.endX;
            const y = omt * omt * ch.startY + 2 * omt * t * ch.ctrlY + t * t * ch.endY;
            drawChipWithTag(x, y, ch.radius, ch.amount, ch.rotation + ch.progress * 2);
            remaining.push(ch);
          } else {
            restingChipsRef.current.push({
              x: ch.endX,
              y: ch.endY,
              radius: ch.radius,
              amount: ch.amount,
              rotation: ch.rotation,
            });
          }
        }
        chipsRef.current = remaining;
      }

      // 9. Update & Render Showdown Sparkles
      if (sparksRef.current.length > 0) {
        const remaining: SparkParticle[] = [];
        for (const sp of sparksRef.current) {
          sp.life += dt;
          if (sp.life < sp.maxLife) {
            sp.x += sp.vx * dt;
            sp.y += sp.vy * dt;
            sp.vy += 180 * dt;
            const alpha = Math.max(0, 1 - sp.life / sp.maxLife);
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.fillStyle = sp.color;
            ctx.beginPath();
            ctx.arc(sp.x, sp.y, sp.size, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
            remaining.push(sp);
          }
        }
        sparksRef.current = remaining;
      }

      // 10. Update & Render Tip Dealer Hearts
      if (heartsRef.current.length > 0) {
        const remaining: TipHeart[] = [];
        for (const ht of heartsRef.current) {
          ht.life += dt;
          if (ht.life < ht.maxLife) {
            ht.y += ht.vy * dt;
            const alpha = Math.max(0, 1 - ht.life / ht.maxLife);
            drawHeart(ht.x, ht.y, ht.scale, alpha);
            remaining.push(ht);
          }
        }
        heartsRef.current = remaining;
      }

      rafId = window.requestAnimationFrame(render);
    };

    rafId = window.requestAnimationFrame(render);
    return () => {
      ro.disconnect();
      window.cancelAnimationFrame(rafId);
    };
  }, []);

  return (
    <div ref={containerRef} className="absolute inset-0 w-full h-full overflow-hidden">
      <canvas ref={canvasRef} className="block w-full h-full" />
    </div>
  );
};
