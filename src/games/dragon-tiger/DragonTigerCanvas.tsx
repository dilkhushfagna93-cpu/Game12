import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { GraphicsQuality } from '../../types';
import {
  computeStageCardDistance,
  observeContainerResize,
  syncRendererToContainer,
} from '../../utils/cameraFraming';
import { detectSoftwareWebGL, getGraphicsPreset, scheduleNextFrame } from '../../utils/graphics';

export interface PlayingCard {
  rank: number;
  label: string;
  suit: 'spades' | 'hearts' | 'diamonds' | 'clubs';
}

export interface DragonTigerSceneProps {
  graphicsQuality: GraphicsQuality;
  phase: 'betting' | 'dealing' | 'revealing' | 'result';
  revealStep?: 0 | 1 | 2;
  dragonCard: PlayingCard | null;
  tigerCard: PlayingCard | null;
  winner: 'dragon' | 'tiger' | 'tie' | null;
  bets?: { dragon: number; tiger: number; tie: number };
  onZoneClick?: (zone: 'dragon' | 'tiger' | 'tie') => void;
}

const SUIT_SYMBOL: Record<PlayingCard['suit'], string> = {
  spades: '♠',
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
};

function createOrnateCardBackTexture(side: 'dragon' | 'tiger'): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 720;
  const ctx = canvas.getContext('2d')!;

  const isDragon = side === 'dragon';
  const bg = ctx.createLinearGradient(0, 0, 512, 720);
  if (isDragon) {
    bg.addColorStop(0, '#0f2d75');
    bg.addColorStop(0.5, '#173b94');
    bg.addColorStop(1, '#091845');
  } else {
    bg.addColorStop(0, '#9a3412');
    bg.addColorStop(0.5, '#c2590c');
    bg.addColorStop(1, '#451a03');
  }
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 512, 720);

  // Outer ivory & metallic gold frames
  ctx.strokeStyle = '#f8e6b3';
  ctx.lineWidth = 18;
  ctx.strokeRect(14, 14, 484, 692);
  ctx.strokeStyle = '#d4af37';
  ctx.lineWidth = 8;
  ctx.strokeRect(32, 32, 448, 656);

  // Diamond lattice pattern
  ctx.strokeStyle = isDragon ? 'rgba(147, 197, 253, 0.28)' : 'rgba(253, 224, 71, 0.28)';
  ctx.lineWidth = 2.5;
  for (let y = 76; y <= 644; y += 44) {
    for (let x = 76; x <= 436; x += 44) {
      ctx.beginPath();
      ctx.moveTo(x, y - 16);
      ctx.lineTo(x + 16, y);
      ctx.lineTo(x, y + 16);
      ctx.lineTo(x - 16, y);
      ctx.closePath();
      ctx.stroke();
    }
  }

  // Center Royal Medallion
  const rad = ctx.createRadialGradient(256, 360, 12, 256, 360, 118);
  rad.addColorStop(0, isDragon ? '#1e40af' : '#b45309');
  rad.addColorStop(1, isDragon ? '#091438' : '#3a1404');
  ctx.fillStyle = rad;
  ctx.beginPath();
  ctx.arc(256, 360, 112, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#f6dc93';
  ctx.lineWidth = 8;
  ctx.stroke();

  ctx.strokeStyle = 'rgba(246, 220, 147, 0.5)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(256, 360, 94, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = '#fff3c4';
  ctx.font = 'bold 92px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(isDragon ? 'D' : 'T', 256, 352);

  ctx.fillStyle = '#f6dc93';
  ctx.font = 'bold 26px Georgia, serif';
  ctx.fillText(isDragon ? 'DRAGON' : 'TIGER', 256, 424);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createCrispCardFaceTexture(card: PlayingCard): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 720;
  const ctx = canvas.getContext('2d')!;

  const isRed = card.suit === 'hearts' || card.suit === 'diamonds';
  const suitChar = SUIT_SYMBOL[card.suit];
  const ink = isRed ? '#dc2626' : '#090d16';

  // Crisp pure bright white face for instant mobile legibility
  const paper = ctx.createLinearGradient(0, 0, 512, 720);
  paper.addColorStop(0, '#ffffff');
  paper.addColorStop(1, '#f8f4ea');
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, 512, 720);

  // Clean gold hairline inner border
  ctx.strokeStyle = '#d4af37';
  ctx.lineWidth = 14;
  ctx.strokeRect(12, 12, 488, 696);
  ctx.strokeStyle = 'rgba(212, 175, 55, 0.4)';
  ctx.lineWidth = 4;
  ctx.strokeRect(30, 30, 452, 660);

  // High-contrast oversized top-left rank + suit
  ctx.fillStyle = ink;
  ctx.font = '900 124px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(card.label, 96, 144);
  ctx.font = '94px Georgia, serif';
  ctx.fillText(suitChar, 96, 232);

  // Inverted bottom-right rank + suit
  ctx.save();
  ctx.translate(416, 576);
  ctx.rotate(Math.PI);
  ctx.font = '900 124px Georgia, serif';
  ctx.fillText(card.label, 0, 0);
  ctx.font = '94px Georgia, serif';
  ctx.fillText(suitChar, 0, 88);
  ctx.restore();

  // Center luxury crest box
  ctx.fillStyle = isRed ? 'rgba(220, 38, 38, 0.07)' : 'rgba(9, 13, 22, 0.05)';
  ctx.fillRect(118, 174, 276, 372);
  ctx.strokeStyle = 'rgba(212, 175, 55, 0.55)';
  ctx.lineWidth = 4;
  ctx.strokeRect(118, 174, 276, 372);

  ctx.fillStyle = ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '900 198px Georgia, serif';
  ctx.fillText(card.label, 256, 298);
  ctx.font = '152px Georgia, serif';
  ctx.fillText(suitChar, 256, 464);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export const DragonTigerCanvas: React.FC<DragonTigerSceneProps> = ({
  graphicsQuality,
  phase,
  revealStep = 0,
  dragonCard,
  tigerCard,
  winner,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [webglFailed, setWebglFailed] = useState(false);

  const stateRef = useRef({ phase, revealStep, dragonCard, tigerCard, winner });
  stateRef.current = { phase, revealStep, dragonCard, tigerCard, winner };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const isSoft = detectSoftwareWebGL();
    const preset = getGraphicsPreset(graphicsQuality);
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
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = false;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const initialSize = syncRendererToContainer(renderer, container, crispMaxDpr);

    const scene = new THREE.Scene();

    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    pmrem.dispose();

    const camera = new THREE.PerspectiveCamera(34, initialSize.aspect, 0.1, 60);

    const updateCamera = (aspect: number) => {
      camera.fov = aspect < 1.45 ? 36 : 32;
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
      // Tightly frame the dual cards (span ~4.84w x 2.86h) so both cards read big & crisp
      const dist = computeStageCardDistance(4.84, 2.86, aspect, camera.fov, 0.94);
      camera.position.set(0, 0.08, dist);
      camera.lookAt(0, 0, 0);
    };
    updateCamera(initialSize.aspect);

    const maxAniso = renderer.capabilities.getMaxAnisotropy();

    // Vibrant 3-point arcade-casino lighting (sapphire dragon fill + warm golden key + tiger rim)
    const hemi = new THREE.HemisphereLight(0xfef3c7, 0x1e1b4b, 1.15);
    scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xfff7e0, 2.1);
    keyLight.position.set(0, 4.5, 6.5);
    scene.add(keyLight);

    const dragonRim = new THREE.PointLight(0x3b82f6, 3.2, 10, 1.5);
    dragonRim.position.set(-3.2, 0.4, 2.2);
    scene.add(dragonRim);

    const tigerRim = new THREE.PointLight(0xf59e0b, 3.2, 10, 1.5);
    tigerRim.position.set(3.2, 0.4, 2.2);
    scene.add(tigerRim);

    const winSpotlight = new THREE.PointLight(0xffd75e, 0, 8, 1.4);
    winSpotlight.position.set(0, 0.4, 2.8);
    scene.add(winSpotlight);

    // Dual 3D Playing Cards (Upright Showcase facing the player!)
    const dragonBackTex = createOrnateCardBackTexture('dragon');
    dragonBackTex.anisotropy = maxAniso;
    const tigerBackTex = createOrnateCardBackTexture('tiger');
    tigerBackTex.anisotropy = maxAniso;

    const cardEdgeMat = new THREE.MeshStandardMaterial({
      color: 0xe6c873,
      roughness: 0.28,
      metalness: 0.72,
    });

    const buildCardActor = (backTex: THREE.CanvasTexture, sideX: number, ringColor: number) => {
      const group = new THREE.Group();
      group.position.set(sideX, 0, 0);

      // BoxGeometry faces: [+X, -X, +Y, -Y, +Z (front face), -Z (back face)]
      const frontMat = new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        roughness: 0.24,
        metalness: 0.04,
        clearcoat: 0.55,
        clearcoatRoughness: 0.16,
      });
      const backMat = new THREE.MeshPhysicalMaterial({
        map: backTex,
        roughness: 0.26,
        metalness: 0.22,
        clearcoat: 0.65,
        clearcoatRoughness: 0.14,
      });

      const cardMesh = new THREE.Mesh(new THREE.BoxGeometry(1.94, 2.68, 0.068), [
        cardEdgeMat,
        cardEdgeMat,
        cardEdgeMat,
        cardEdgeMat,
        frontMat,
        backMat,
      ]);
      // Start face-down (showing -Z back toward camera at +Z)
      cardMesh.rotation.y = Math.PI;
      group.add(cardMesh);

      // Winner / active glowing frame outline behind card
      const glowFrame = new THREE.Mesh(
        new THREE.PlaneGeometry(2.18, 2.94),
        new THREE.MeshBasicMaterial({
          color: ringColor,
          transparent: true,
          opacity: 0.24,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      glowFrame.position.z = -0.06;
      group.add(glowFrame);

      scene.add(group);
      return { group, cardMesh, frontMat, glowFrame };
    };

    const CARD_X = 1.38;
    const dragonActor = buildCardActor(dragonBackTex, -CARD_X, 0x38bdf8);
    const tigerActor = buildCardActor(tigerBackTex, CARD_X, 0xfbbf24);

    // Subtle floating golden dust motes behind cards
    const moteCount = isSoft ? 16 : 36;
    const moteGeo = new THREE.OctahedronGeometry(0.038, 0);
    const moteMat = new THREE.MeshBasicMaterial({
      color: 0xfde68a,
      transparent: true,
      opacity: 0.65,
    });
    const motes = new THREE.InstancedMesh(moteGeo, moteMat, moteCount);
    motes.frustumCulled = false;
    const moteSeeds = Array.from({ length: moteCount }, (_, i) => ({
      x: ((i / moteCount) - 0.5) * 6.2,
      y: (((i * 37) % 100) / 100 - 0.5) * 3.0,
      z: -0.7 - ((i * 19) % 10) * 0.14,
      speed: 0.45 + ((i * 13) % 7) * 0.12,
      phase: i * 0.85,
    }));
    scene.add(motes);

    const texturesToDispose: THREE.Texture[] = [dragonBackTex, tigerBackTex];
    let lastDragonSig = '';
    let lastTigerSig = '';

    const syncCardFaces = () => {
      const { dragonCard: dc, tigerCard: tc } = stateRef.current;
      const dSig = dc ? `${dc.label}_${dc.suit}` : '';
      if (dc && dSig !== lastDragonSig) {
        lastDragonSig = dSig;
        const tex = createCrispCardFaceTexture(dc);
        tex.anisotropy = maxAniso;
        texturesToDispose.push(tex);
        dragonActor.frontMat.map = tex;
        dragonActor.frontMat.needsUpdate = true;
      }
      const tSig = tc ? `${tc.label}_${tc.suit}` : '';
      if (tc && tSig !== lastTigerSig) {
        lastTigerSig = tSig;
        const tex = createCrispCardFaceTexture(tc);
        tex.anisotropy = maxAniso;
        texturesToDispose.push(tex);
        tigerActor.frontMat.map = tex;
        tigerActor.frontMat.needsUpdate = true;
      }
    };

    const onResize = () => {
      if (!container) return;
      const sz = syncRendererToContainer(renderer, container, crispMaxDpr);
      updateCamera(sz.aspect);
    };
    const stopResizeObserver = observeContainerResize(container, onResize);

    const onContextLost = (e: Event) => {
      e.preventDefault();
      setWebglFailed(true);
    };
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);

    if (!isSoft) {
      renderer.compile(scene, camera);
    }

    const clock = new THREE.Clock();
    const dummy = new THREE.Object3D();
    let alive = true;
    let frameHandle = 0;
    let frameIsTimeout = false;

    const anim = {
      dRotY: Math.PI,
      tRotY: Math.PI,
      dY: 0,
      tY: 0,
      dScale: 1,
      tScale: 1,
      dealTimer: 0,
      prevPhase: stateRef.current.phase,
    };

    const tick = () => {
      if (!alive) return;
      const delta = Math.min(0.05, clock.getDelta());
      const t = clock.getElapsedTime();
      const { phase: ph, revealStep: rStep, winner: win } = stateRef.current;

      syncCardFaces();

      if (ph !== anim.prevPhase) {
        if (ph === 'dealing') {
          anim.dY = 2.6;
          anim.tY = 3.1;
          anim.dRotY = Math.PI;
          anim.tRotY = Math.PI;
          anim.dealTimer = 0;
        }
        anim.prevPhase = ph;
      }

      if (ph === 'betting') {
        anim.dRotY = THREE.MathUtils.damp(anim.dRotY, Math.PI, 8, delta);
        anim.tRotY = THREE.MathUtils.damp(anim.tRotY, Math.PI, 8, delta);
        anim.dY = THREE.MathUtils.damp(anim.dY, Math.sin(t * 2.2) * 0.055, 6, delta);
        anim.tY = THREE.MathUtils.damp(anim.tY, Math.sin(t * 2.2 + 1.1) * 0.055, 6, delta);
        anim.dScale = THREE.MathUtils.damp(anim.dScale, 1, 7, delta);
        anim.tScale = THREE.MathUtils.damp(anim.tScale, 1, 7, delta);
        winSpotlight.intensity = THREE.MathUtils.damp(winSpotlight.intensity, 0, 6, delta);
        (dragonActor.glowFrame.material as THREE.MeshBasicMaterial).opacity = 0.24 + Math.sin(t * 2.6) * 0.08;
        (tigerActor.glowFrame.material as THREE.MeshBasicMaterial).opacity = 0.24 + Math.cos(t * 2.6) * 0.08;
      } else if (ph === 'dealing') {
        anim.dY = THREE.MathUtils.damp(anim.dY, 0, 9, delta);
        anim.tY = THREE.MathUtils.damp(anim.tY, 0, 7.2, delta);
        anim.dRotY = THREE.MathUtils.damp(anim.dRotY, Math.PI, 9, delta);
        anim.tRotY = THREE.MathUtils.damp(anim.tRotY, Math.PI, 9, delta);
      } else {
        // Sequential casino reveal: Dragon flips first (revealStep >= 1), then Tiger (revealStep >= 2)
        const flipDragon = ph === 'result' || rStep >= 1;
        const flipTiger = ph === 'result' || rStep >= 2;
        anim.dY = THREE.MathUtils.damp(anim.dY, 0, 10, delta);
        anim.tY = THREE.MathUtils.damp(anim.tY, 0, 10, delta);
        anim.dRotY = THREE.MathUtils.damp(anim.dRotY, flipDragon ? 0 : Math.PI, 8.5, delta);
        anim.tRotY = THREE.MathUtils.damp(anim.tRotY, flipTiger ? 0 : Math.PI, 8.5, delta);

        const dWon = ph === 'result' && (win === 'dragon' || win === 'tie');
        const tWon = ph === 'result' && (win === 'tiger' || win === 'tie');
        anim.dScale = THREE.MathUtils.damp(anim.dScale, dWon ? 1.07 : ph === 'result' ? 0.94 : 1, 7, delta);
        anim.tScale = THREE.MathUtils.damp(anim.tScale, tWon ? 1.07 : ph === 'result' ? 0.94 : 1, 7, delta);

        const dGlow = dragonActor.glowFrame.material as THREE.MeshBasicMaterial;
        const tGlow = tigerActor.glowFrame.material as THREE.MeshBasicMaterial;
        dGlow.color.setHex(win === 'tie' ? 0x34d399 : dWon ? 0xfacc15 : 0x38bdf8);
        tGlow.color.setHex(win === 'tie' ? 0x34d399 : tWon ? 0xfacc15 : 0xfbbf24);
        dGlow.opacity = dWon ? 0.65 + Math.sin(t * 8) * 0.18 : 0.14;
        tGlow.opacity = tWon ? 0.65 + Math.sin(t * 8) * 0.18 : 0.14;

        if (ph === 'result' && win) {
          const targetX = win === 'dragon' ? -CARD_X : win === 'tiger' ? CARD_X : 0;
          winSpotlight.position.x = THREE.MathUtils.damp(winSpotlight.position.x, targetX, 7, delta);
          winSpotlight.intensity = THREE.MathUtils.damp(winSpotlight.intensity, 6.2 + Math.sin(t * 7) * 1.4, 6, delta);
        }
      }

      // Forward pop during mid-flip
      const dPopZ = Math.sin(anim.dRotY) * 0.65;
      const tPopZ = Math.sin(anim.tRotY) * 0.65;

      dragonActor.group.position.set(-CARD_X, anim.dY, dPopZ);
      dragonActor.group.scale.setScalar(anim.dScale);
      dragonActor.cardMesh.rotation.y = anim.dRotY;
      dragonActor.cardMesh.rotation.x = Math.sin(t * 1.4) * 0.04;

      tigerActor.group.position.set(CARD_X, anim.tY, tPopZ);
      tigerActor.group.scale.setScalar(anim.tScale);
      tigerActor.cardMesh.rotation.y = anim.tRotY;
      tigerActor.cardMesh.rotation.x = Math.cos(t * 1.4) * 0.04;

      // Animate subtle ambient gold lantern motes
      for (let i = 0; i < moteCount; i++) {
        const m = moteSeeds[i];
        const yy = ((m.y + t * m.speed * 0.35 + 1.8) % 3.6) - 1.8;
        dummy.position.set(m.x + Math.sin(t * 0.8 + m.phase) * 0.16, yy, m.z);
        dummy.rotation.set(t + m.phase, t * 0.7, 0);
        const s = 0.7 + Math.sin(t * 2.5 + m.phase) * 0.35;
        dummy.scale.setScalar(s);
        dummy.updateMatrix();
        motes.setMatrixAt(i, dummy.matrix);
      }
      motes.instanceMatrix.needsUpdate = true;

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
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);

      envTex.dispose();
      texturesToDispose.forEach((tx) => tx.dispose());
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

  // Crisp CSS fallback if WebGL is unavailable
  if (webglFailed) {
    const renderCssCard = (card: PlayingCard | null, side: 'dragon' | 'tiger') => {
      const showFace =
        phase === 'result' ||
        (phase === 'revealing' && (side === 'dragon' ? revealStep >= 1 : revealStep >= 2));
      const isRed = card && (card.suit === 'hearts' || card.suit === 'diamonds');
      const isWon = phase === 'result' && (winner === side || winner === 'tie');
      return (
        <div
          className={`w-[72px] h-[102px] sm:w-[94px] sm:h-[132px] rounded-xl border-2 flex flex-col items-center justify-center shadow-xl transition-transform ${
            isWon ? 'border-amber-300 scale-105' : 'border-[#d4af37]/70'
          } ${
            showFace && card
              ? 'bg-white text-slate-900'
              : side === 'dragon'
                ? 'bg-gradient-to-br from-blue-700 to-indigo-950 text-[#f6dc93]'
                : 'bg-gradient-to-br from-amber-600 to-orange-950 text-[#f6dc93]'
          }`}
        >
          {showFace && card ? (
            <>
              <span className={`font-display text-2xl sm:text-3xl font-bold ${isRed ? 'text-red-600' : 'text-slate-900'}`}>
                {card.label}
              </span>
              <span className={`text-2xl sm:text-3xl leading-none ${isRed ? 'text-red-600' : 'text-slate-900'}`}>
                {SUIT_SYMBOL[card.suit]}
              </span>
            </>
          ) : (
            <span className="font-display text-xl font-bold">{side === 'dragon' ? 'D' : 'T'}</span>
          )}
        </div>
      );
    };

    return (
      <div className="w-full h-full flex items-center justify-center gap-6 sm:gap-10 px-2">
        {renderCssCard(dragonCard, 'dragon')}
        {renderCssCard(tigerCard, 'tiger')}
      </div>
    );
  }

  return <div ref={containerRef} className="w-full h-full overflow-hidden select-none" />;
};
