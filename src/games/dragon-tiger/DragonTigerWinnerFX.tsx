import React, { useEffect, useRef } from 'react';

interface DragonTigerWinnerFXProps {
  active: boolean;
  winner: 'dragon' | 'tiger' | 'tie' | null;
}

interface FireParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  maxSize: number;
  life: number;
  maxLife: number;
  kind: 'core' | 'flame' | 'ember';
  wobbleSeed: number;
}

interface ShockRing {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  alpha: number;
  lineWidth: number;
  color: string;
}

interface ClawSlash {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  progress: number;
  alpha: number;
  delay: number;
}

/**
 * 60fps HTML5 2D Canvas overlay rendered across the Dragon vs Tiger battle header:
 * - Dragon win: shoots a roaring, incandescent fire-breath stream directly from the Dragon's mouth
 *   (left circular portrait) across the center cards with flying sparks & embers.
 * - Tiger win: unleashes expanding golden-amber acoustic roar shockwaves + blazing claw slashes
 *   bursting from the Tiger's mouth (right circular portrait).
 * - Tie win: emerald-gold starburst in the center.
 */
export const DragonTigerWinnerFX: React.FC<DragonTigerWinnerFXProps> = ({ active, winner }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!active || !winner || prefersReduced) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    const syncSize = () => {
      const parent = canvas.parentElement;
      if (!parent) return { w: 420, h: 120 };
      const rect = parent.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.floor(rect.width));
      const h = Math.max(1, Math.floor(rect.height));
      if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
        canvas.width = Math.floor(w * dpr);
        canvas.height = Math.floor(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return { w, h };
    };

    let dims = syncSize();
    const ro = new ResizeObserver(() => {
      dims = syncSize();
    });
    if (canvas.parentElement) ro.observe(canvas.parentElement);

    const particles: FireParticle[] = [];
    const shockRings: ShockRing[] = [];
    const clawSlashes: ClawSlash[] = [];

    const startTime = performance.now();
    let lastTime = startTime;
    let ringSpawnTimer = 0;
    let rafId = 0;
    let alive = true;

    // Pre-seed Tiger claw slash arcs
    if (winner === 'tiger') {
      const cx = dims.w * 0.56;
      const cy = dims.h * 0.54;
      for (let i = 0; i < 3; i++) {
        const offset = (i - 1) * 16;
        clawSlashes.push({
          x1: cx + 62 + offset * 0.5,
          y1: cy - 36 + offset,
          x2: cx - 78 + offset * 0.5,
          y2: cy + 38 + offset,
          progress: 0,
          alpha: 1,
          delay: 0.12 + i * 0.09,
        });
      }
    }

    // Pre-seed Tie sparkle burst
    if (winner === 'tie') {
      const cx = dims.w * 0.5;
      const cy = dims.h * 0.56;
      for (let i = 0; i < 42; i++) {
        const angle = (Math.PI * 2 * i) / 42 + (Math.random() - 0.5) * 0.2;
        const speed = 70 + Math.random() * 145;
        particles.push({
          x: cx,
          y: cy,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed * 0.65,
          size: 3 + Math.random() * 4,
          maxSize: 6,
          life: 0,
          maxLife: 0.9 + Math.random() * 0.8,
          kind: 'ember',
          wobbleSeed: Math.random() * 10,
        });
      }
    }

    const spawnDragonFire = (w: number, h: number, elapsed: number, dt: number) => {
      // Dragon's circular emblem is on the left: mouth opens around x ~ 64..74px (or ~16% width), y ~ 58%
      const mouthX = Math.min(82, Math.max(54, w * 0.165));
      const mouthY = h * 0.59;
      // Fire actively streams from 0.05s to 2.35s, tapering gracefully after
      if (elapsed > 2.35) return;

      const intensity = elapsed < 0.2 ? elapsed / 0.2 : elapsed > 1.9 ? Math.max(0, (2.35 - elapsed) / 0.45) : 1;
      const count = Math.max(2, Math.round(dt * 230 * intensity));

      for (let i = 0; i < count; i++) {
        const roll = Math.random();
        const isCore = roll < 0.28;
        const isEmber = roll > 0.78;
        const spreadAngle = (Math.random() - 0.5) * (isCore ? 0.24 : isEmber ? 0.65 : 0.42);
        const baseSpeed = isCore
          ? 240 + Math.random() * 150
          : isEmber
            ? 190 + Math.random() * 210
            : 185 + Math.random() * 165;
        // Scale speed proportionally to banner width so flame reaches nicely past center!
        const speedScale = Math.max(0.75, Math.min(1.35, w / 420));

        particles.push({
          x: mouthX + (Math.random() - 0.5) * 6,
          y: mouthY + (Math.random() - 0.5) * 8,
          vx: Math.cos(spreadAngle) * baseSpeed * speedScale,
          vy: Math.sin(spreadAngle) * baseSpeed * 0.55 - (isEmber ? 18 : 6),
          size: isCore ? 6 + Math.random() * 5 : isEmber ? 2 + Math.random() * 2.5 : 10 + Math.random() * 9,
          maxSize: isCore ? 14 : isEmber ? 3 : 28 + Math.random() * 12,
          life: 0,
          maxLife: isCore ? 0.34 + Math.random() * 0.16 : isEmber ? 0.65 + Math.random() * 0.5 : 0.55 + Math.random() * 0.32,
          kind: isCore ? 'core' : isEmber ? 'ember' : 'flame',
          wobbleSeed: Math.random() * Math.PI * 2,
        });
      }
    };

    const spawnTigerRoar = (w: number, h: number, elapsed: number, dt: number) => {
      // Tiger's circular emblem is on the right: mouth opens around x ~ w - 68px (~83.5% width), y ~ 59%
      const mouthX = w - Math.min(82, Math.max(54, w * 0.165));
      const mouthY = h * 0.59;

      if (elapsed < 2.05) {
        ringSpawnTimer -= dt;
        if (ringSpawnTimer <= 0) {
          ringSpawnTimer = 0.24;
          shockRings.push({
            x: mouthX,
            y: mouthY,
            radius: 14,
            maxRadius: Math.min(w * 0.85, 340),
            alpha: 0.92,
            lineWidth: 4.5,
            color: shockRings.length % 2 === 0 ? '#fbbf24' : '#f97316',
          });
        }

        // Fierce amber roar sparks bursting leftward from Tiger's jaws
        const sparkCount = Math.max(1, Math.round(dt * 85));
        for (let i = 0; i < sparkCount; i++) {
          const angle = Math.PI + (Math.random() - 0.5) * 0.95;
          const speed = 130 + Math.random() * 210;
          particles.push({
            x: mouthX + (Math.random() - 0.5) * 8,
            y: mouthY + (Math.random() - 0.5) * 12,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed * 0.6,
            size: 2.2 + Math.random() * 3,
            maxSize: 4,
            life: 0,
            maxLife: 0.48 + Math.random() * 0.35,
            kind: 'ember',
            wobbleSeed: Math.random() * Math.PI * 2,
          });
        }
      }
    };

    const renderFrame = (now: number) => {
      if (!alive) return;
      const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
      lastTime = now;
      const elapsed = (now - startTime) / 1000;
      const { w, h } = dims;

      ctx.clearRect(0, 0, w, h);

      if (winner === 'dragon') {
        spawnDragonFire(w, h, elapsed, dt);

        // Glowing hot furnace aura right at Dragon's mouth while breathing fire
        if (elapsed < 2.45) {
          const mouthX = Math.min(82, Math.max(54, w * 0.165));
          const mouthY = h * 0.59;
          const pulse = 0.85 + Math.sin(elapsed * 34) * 0.15;
          const fade = elapsed > 2.0 ? Math.max(0, (2.45 - elapsed) / 0.45) : Math.min(1, elapsed / 0.15);
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          const mouthGlow = ctx.createRadialGradient(mouthX, mouthY, 2, mouthX + 26, mouthY, 74 * pulse);
          mouthGlow.addColorStop(0, `rgba(255, 252, 224, ${0.95 * fade})`);
          mouthGlow.addColorStop(0.28, `rgba(251, 146, 60, ${0.72 * fade})`);
          mouthGlow.addColorStop(0.65, `rgba(220, 38, 38, ${0.32 * fade})`);
          mouthGlow.addColorStop(1, 'rgba(220, 38, 38, 0)');
          ctx.fillStyle = mouthGlow;
          ctx.beginPath();
          ctx.arc(mouthX + 18, mouthY, 76 * pulse, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      } else if (winner === 'tiger') {
        spawnTigerRoar(w, h, elapsed, dt);

        // Golden roar blast glow at Tiger's jaws
        if (elapsed < 2.2) {
          const mouthX = w - Math.min(82, Math.max(54, w * 0.165));
          const mouthY = h * 0.59;
          const pulse = 0.88 + Math.sin(elapsed * 28) * 0.14;
          const fade = elapsed > 1.75 ? Math.max(0, (2.2 - elapsed) / 0.45) : Math.min(1, elapsed / 0.12);
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          const roarGlow = ctx.createRadialGradient(mouthX, mouthY, 4, mouthX - 10, mouthY, 62 * pulse);
          roarGlow.addColorStop(0, `rgba(255, 247, 204, ${0.9 * fade})`);
          roarGlow.addColorStop(0.4, `rgba(245, 158, 11, ${0.55 * fade})`);
          roarGlow.addColorStop(1, 'rgba(234, 88, 12, 0)');
          ctx.fillStyle = roarGlow;
          ctx.beginPath();
          ctx.arc(mouthX, mouthY, 64 * pulse, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }

      // Draw expanding Tiger Roar sonic shockwave arcs
      if (shockRings.length > 0) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (let i = shockRings.length - 1; i >= 0; i--) {
          const r = shockRings[i];
          r.radius += dt * 310;
          const ratio = r.radius / r.maxRadius;
          r.alpha = Math.max(0, (1 - ratio) * 0.9);
          if (ratio >= 1) {
            shockRings.splice(i, 1);
            continue;
          }
          ctx.strokeStyle = r.color;
          ctx.globalAlpha = r.alpha;
          ctx.lineWidth = Math.max(1.2, r.lineWidth * (1 - ratio * 0.65));
          // Directional sonic roar cone opening toward center/left from Tiger's mouth
          ctx.beginPath();
          ctx.arc(r.x, r.y, r.radius, Math.PI * 0.58, Math.PI * 1.42);
          ctx.stroke();

          // Subtle full golden halo ring ripple
          ctx.globalAlpha = r.alpha * 0.38;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(r.x, r.y, r.radius * 0.72, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.restore();
      }

      // Draw blazing Tiger Claw Slashes
      if (clawSlashes.length > 0) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.lineCap = 'round';
        for (const slash of clawSlashes) {
          if (elapsed < slash.delay) continue;
          const localT = elapsed - slash.delay;
          slash.progress = Math.min(1, localT / 0.22);
          slash.alpha = localT < 0.35 ? 1 : Math.max(0, 1 - (localT - 0.35) / 0.55);
          if (slash.alpha <= 0.01) continue;

          const curX = slash.x1 + (slash.x2 - slash.x1) * slash.progress;
          const curY = slash.y1 + (slash.y2 - slash.y1) * slash.progress;

          const grad = ctx.createLinearGradient(slash.x1, slash.y1, curX, curY);
          grad.addColorStop(0, 'rgba(249, 115, 22, 0)');
          grad.addColorStop(0.55, `rgba(251, 191, 36, ${0.85 * slash.alpha})`);
          grad.addColorStop(1, `rgba(255, 255, 235, ${0.98 * slash.alpha})`);

          ctx.strokeStyle = grad;
          ctx.lineWidth = 5.5;
          ctx.beginPath();
          ctx.moveTo(slash.x1, slash.y1);
          ctx.quadraticCurveTo(
            (slash.x1 + curX) * 0.5 - 8,
            (slash.y1 + curY) * 0.5 - 10,
            curX,
            curY,
          );
          ctx.stroke();
        }
        ctx.restore();
      }

      // Update & render fire / ember / sparkle particles
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life += dt;
        if (p.life >= p.maxLife) {
          particles.splice(i, 1);
          continue;
        }
        const t = p.life / p.maxLife;
        const turbulence = Math.sin(elapsed * 18 + p.wobbleSeed + p.x * 0.04) * 34;

        p.x += p.vx * dt;
        p.y += (p.vy + (p.kind === 'flame' ? turbulence - 24 * t : turbulence * 0.4)) * dt;
        p.vx *= 1 - dt * (p.kind === 'core' ? 0.5 : 0.85);

        const curSize = p.size + (p.maxSize - p.size) * Math.pow(t, 0.7);
        const alpha = t < 0.14 ? t / 0.14 : Math.max(0, 1 - Math.pow((t - 0.14) / 0.86, 1.35));

        if (winner === 'tie') {
          const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, curSize * 1.4);
          g.addColorStop(0, `rgba(236, 253, 245, ${alpha})`);
          g.addColorStop(0.5, `rgba(52, 211, 153, ${alpha * 0.85})`);
          g.addColorStop(1, 'rgba(16, 185, 129, 0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(p.x, p.y, curSize * 1.4, 0, Math.PI * 2);
          ctx.fill();
          continue;
        }

        if (p.kind === 'ember') {
          ctx.fillStyle =
            winner === 'dragon'
              ? `rgba(255, ${Math.floor(225 - t * 140)}, ${Math.floor(120 - t * 100)}, ${alpha})`
              : `rgba(255, ${Math.floor(235 - t * 110)}, 90, ${alpha})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, Math.max(1.2, curSize * (1 - t * 0.4)), 0, Math.PI * 2);
          ctx.fill();
        } else if (p.kind === 'core') {
          const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, curSize);
          g.addColorStop(0, `rgba(255, 255, 240, ${alpha})`);
          g.addColorStop(0.42, `rgba(254, 240, 138, ${alpha * 0.92})`);
          g.addColorStop(0.8, `rgba(251, 146, 60, ${alpha * 0.55})`);
          g.addColorStop(1, 'rgba(234, 88, 12, 0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(p.x, p.y, curSize, 0, Math.PI * 2);
          ctx.fill();
        } else {
          // Volumetric roaring orange-red dragon flame plume
          const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, curSize);
          g.addColorStop(0, `rgba(254, 215, 170, ${alpha * 0.72})`);
          g.addColorStop(0.32, `rgba(249, 115, 22, ${alpha * 0.85})`);
          g.addColorStop(0.7, `rgba(220, 38, 38, ${alpha * 0.52})`);
          g.addColorStop(1, 'rgba(153, 27, 27, 0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(p.x, p.y, curSize, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();

      if (elapsed < 3.1 || particles.length > 0 || shockRings.length > 0) {
        rafId = window.requestAnimationFrame(renderFrame);
      } else {
        ctx.clearRect(0, 0, w, h);
      }
    };

    rafId = window.requestAnimationFrame(renderFrame);

    return () => {
      alive = false;
      window.cancelAnimationFrame(rafId);
      ro.disconnect();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, [active, winner]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-20 w-full h-full"
    />
  );
};
