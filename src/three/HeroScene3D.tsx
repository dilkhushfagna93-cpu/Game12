import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GENERATED_ASSETS } from '../config/assets';
import { useApp } from '../context/AppContext';
import {
  computeResponsiveFov,
  computeSafeDistance,
  observeContainerResize,
  syncRendererToContainer,
} from '../utils/cameraFraming';
import { detectSoftwareWebGL, getGraphicsPreset, scheduleNextFrame } from '../utils/graphics';

function createLuxuryCardTexture(isFront: boolean): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 720;
  const ctx = canvas.getContext('2d')!;

  if (isFront) {
    ctx.fillStyle = '#faf6ee';
    ctx.fillRect(0, 0, 512, 720);
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 10;
    ctx.strokeRect(20, 20, 472, 680);

    ctx.fillStyle = '#120e1c';
    ctx.font = 'bold 76px Georgia, serif';
    ctx.fillText('A', 46, 108);
    ctx.font = '64px Georgia, serif';
    ctx.fillText('♠', 48, 174);

    ctx.save();
    ctx.translate(256, 360);
    ctx.fillStyle = '#151024';
    ctx.font = '210px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('♠', 0, 0);
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 4;
    ctx.strokeText('♠', 0, 0);
    ctx.restore();
  } else {
    ctx.fillStyle = '#120b24';
    ctx.fillRect(0, 0, 512, 720);
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 12;
    ctx.strokeRect(24, 24, 464, 672);
    ctx.lineWidth = 3;
    ctx.strokeRect(42, 42, 428, 636);

    ctx.strokeStyle = 'rgba(212,175,55,0.45)';
    for (let y = 80; y <= 640; y += 56) {
      for (let x = 80; x <= 432; x += 56) {
        ctx.beginPath();
        ctx.moveTo(x, y - 20);
        ctx.lineTo(x + 20, y);
        ctx.lineTo(x, y + 20);
        ctx.lineTo(x - 20, y);
        ctx.closePath();
        ctx.stroke();
      }
    }
    ctx.fillStyle = '#d4af37';
    ctx.beginPath();
    ctx.moveTo(256, 260);
    ctx.lineTo(324, 360);
    ctx.lineTo(256, 460);
    ctx.lineTo(188, 360);
    ctx.closePath();
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createDieFaceTexture(pips: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#f5efe2';
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = '#d8cbb0';
  ctx.lineWidth = 10;
  ctx.strokeRect(8, 8, 240, 240);

  const coords: Record<number, [number, number][]> = {
    1: [[128, 128]],
    2: [[72, 72], [184, 184]],
    3: [[72, 72], [128, 128], [184, 184]],
    4: [[72, 72], [184, 72], [72, 184], [184, 184]],
    5: [[72, 72], [184, 72], [128, 128], [72, 184], [184, 184]],
    6: [[72, 66], [184, 66], [72, 128], [184, 128], [72, 190], [184, 190]],
  };

  ctx.fillStyle = pips === 1 ? '#991b1b' : '#181422';
  for (const [x, y] of coords[pips] || []) {
    ctx.beginPath();
    ctx.arc(x, y, pips === 1 ? 28 : 20, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export const HeroScene3D: React.FC = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const { graphicsQuality } = useApp();
  const [webglFailed, setWebglFailed] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const isSoft = detectSoftwareWebGL();
    const preset = getGraphicsPreset(graphicsQuality);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: preset.antialias,
        alpha: true,
        powerPreference: 'high-performance',
      });
    } catch {
      setWebglFailed(true);
      return;
    }

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.shadowMap.enabled = preset.shadows;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const initialSize = syncRendererToContainer(renderer, container, preset.pixelRatio);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x07060b, 0.036);

    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    pmrem.dispose();

    const camera = new THREE.PerspectiveCamera(
      computeResponsiveFov(initialSize.aspect, 40, 48),
      initialSize.aspect,
      0.1,
      90,
    );
    const stageGroup = new THREE.Group();
    scene.add(stageGroup);

    const rig = {
      camY: 2.3,
      camZ: 9.2,
      parallaxAmp: 0.75,
      orbitScale: 1.0,
    };

    const updateHeroFraming = (w: number, aspect: number) => {
      const fov = computeResponsiveFov(aspect, 40, 48);
      camera.fov = fov;
      camera.aspect = aspect;
      camera.updateProjectionMatrix();

      const scale = w < 420 ? 0.78 : w < 640 ? 0.84 : w < 1024 ? 0.92 : 1.0;
      stageGroup.scale.setScalar(scale);
      rig.orbitScale = w < 480 ? 0.84 : 1.0;
      rig.parallaxAmp = w < 640 ? 0.25 : 0.75;

      // Bounding box encloses full orbiting plane, card, die, plinth, and coin/chip stack
      const boundsW = 7.4 * scale * rig.orbitScale;
      const boundsH = 5.2 * scale;
      const boundsD = 5.6 * scale * rig.orbitScale;
      const safeDist = computeSafeDistance(boundsW, boundsH, boundsD, aspect, fov, 1.22);
      rig.camY = safeDist * 0.22;
      rig.camZ = safeDist * 0.975;
      camera.position.set(0, rig.camY, rig.camZ);
      camera.lookAt(0, 0.0, 0);
    };
    updateHeroFraming(initialSize.width, initialSize.aspect);

    // 3-Point Luxury Studio Lighting
    const hemi = new THREE.HemisphereLight(0x8b6fd6, 0x160f24, 0.75);
    scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xffe7b3, 2.4);
    keyLight.position.set(5.5, 8.5, 6.5);
    keyLight.castShadow = preset.shadows;
    keyLight.shadow.mapSize.set(preset.shadowMapSize, preset.shadowMapSize);
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x9d6bff, 1.8);
    rimLight.position.set(-6, 4.5, -5);
    scene.add(rimLight);

    // Materials
    const goldMat = new THREE.MeshPhysicalMaterial({
      color: 0xd9b343,
      metalness: 0.94,
      roughness: 0.18,
      clearcoat: 0.6,
      clearcoatRoughness: 0.15,
    });

    const obsidianMat = new THREE.MeshPhysicalMaterial({
      color: 0x110c1e,
      metalness: 0.35,
      roughness: 0.22,
      clearcoat: 0.85,
      clearcoatRoughness: 0.12,
    });

    const purpleMat = new THREE.MeshPhysicalMaterial({
      color: 0x5b21b6,
      metalness: 0.55,
      roughness: 0.28,
      clearcoat: 0.7,
    });

    // Centerpiece: Composite Architectural Plinth + Levitating Crown Crest
    const centerGroup = new THREE.Group();
    stageGroup.add(centerGroup);

    const plinthBase = new THREE.Mesh(new THREE.CylinderGeometry(2.35, 2.65, 0.42, 8), obsidianMat);
    plinthBase.position.y = -1.65;
    plinthBase.receiveShadow = true;
    centerGroup.add(plinthBase);

    const plinthRim = new THREE.Mesh(new THREE.TorusGeometry(2.38, 0.045, 16, 64), goldMat);
    plinthRim.rotation.x = Math.PI / 2;
    plinthRim.position.y = -1.44;
    centerGroup.add(plinthRim);

    const innerRing = new THREE.Mesh(new THREE.TorusGeometry(1.55, 0.03, 16, 48), goldMat);
    innerRing.rotation.x = Math.PI / 2;
    innerRing.position.y = -1.42;
    centerGroup.add(innerRing);

    // Floating Faceted Emblem Core (composite 4-part)
    const crestGroup = new THREE.Group();
    crestGroup.position.y = 0.35;
    centerGroup.add(crestGroup);

    const outerOct = new THREE.Mesh(new THREE.OctahedronGeometry(0.92, 0), obsidianMat);
    outerOct.castShadow = true;
    crestGroup.add(outerOct);

    const cageRing1 = new THREE.Mesh(new THREE.TorusGeometry(1.32, 0.045, 16, 64), goldMat);
    crestGroup.add(cageRing1);

    const cageRing2 = new THREE.Mesh(new THREE.TorusGeometry(1.52, 0.025, 14, 64), purpleMat);
    cageRing2.rotation.x = Math.PI / 3;
    crestGroup.add(cageRing2);

    const goldCore = new THREE.Mesh(new THREE.OctahedronGeometry(0.42, 0), goldMat);
    crestGroup.add(goldCore);

    // Orbiting Artifact 1: 3D Playing Card
    const cardFrontTex = createLuxuryCardTexture(true);
    const cardBackTex = createLuxuryCardTexture(false);
    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    cardFrontTex.anisotropy = maxAniso;
    cardBackTex.anisotropy = maxAniso;
    const cardEdgeMat = new THREE.MeshStandardMaterial({ color: 0xe6dcc5, roughness: 0.45 });
    const cardMesh = new THREE.Mesh(
      new THREE.BoxGeometry(1.05, 1.48, 0.035),
      [
        cardEdgeMat,
        cardEdgeMat,
        cardEdgeMat,
        cardEdgeMat,
        new THREE.MeshStandardMaterial({ map: cardFrontTex, roughness: 0.32, metalness: 0.08 }),
        new THREE.MeshStandardMaterial({ map: cardBackTex, roughness: 0.3, metalness: 0.35 }),
      ],
    );
    cardMesh.castShadow = true;
    stageGroup.add(cardMesh);

    // Orbiting Artifact 2: 3D Ivory Die
    const dieFaces = [1, 6, 2, 5, 3, 4].map((p) => {
      const t = createDieFaceTexture(p);
      t.anisotropy = maxAniso;
      return new THREE.MeshPhysicalMaterial({
        map: t,
        roughness: 0.2,
        metalness: 0.02,
        clearcoat: 0.65,
      });
    });
    const dieMesh = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.68, 0.68), dieFaces);
    dieMesh.castShadow = true;
    stageGroup.add(dieMesh);

    // Orbiting Artifact 3: 3D Composite Metallic Virtual Coin / Chip Stack (clean realistic proportions)
    const chipStack = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const body = new THREE.Mesh(
        new THREE.CylinderGeometry(0.34, 0.34, 0.075, 32),
        i % 2 === 0 ? goldMat : purpleMat,
      );
      body.position.y = i * 0.085;
      body.castShadow = true;
      const trim = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.013, 8, 32), goldMat);
      trim.rotation.x = Math.PI / 2;
      trim.position.y = i * 0.085 + 0.039;
      chipStack.add(body, trim);
    }
    stageGroup.add(chipStack);

    // Orbiting Artifact 4: 3D Miniature Gold & Obsidian Stunt Plane
    const planeGroup = new THREE.Group();
    const fuselage = new THREE.Mesh(new THREE.ConeGeometry(0.14, 1.12, 16), obsidianMat);
    fuselage.rotation.x = Math.PI / 2;
    const mainWing = new THREE.Mesh(new THREE.BoxGeometry(1.26, 0.038, 0.24), goldMat);
    mainWing.position.z = 0.06;
    const tailWing = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.028, 0.14), goldMat);
    tailWing.position.set(0, 0.04, -0.44);
    const tailFin = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.24, 0.18), obsidianMat);
    tailFin.position.set(0, 0.12, -0.42);
    const propBlade = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.036, 0.02), goldMat);
    propBlade.position.z = 0.58;
    planeGroup.add(fuselage, mainWing, tailWing, tailFin, propBlade);
    stageGroup.add(planeGroup);

    // Floating Metallic Gold Particles via InstancedMesh (bounded strictly inside hero frustum)
    const pCount = preset.particleCount;
    const pGeo = new THREE.OctahedronGeometry(0.038, 0);
    const pMat = new THREE.MeshStandardMaterial({
      color: 0xf4d375,
      metalness: 0.9,
      roughness: 0.2,
      emissive: 0x5c4208,
      emissiveIntensity: 0.4,
    });
    const particles = new THREE.InstancedMesh(pGeo, pMat, pCount);
    particles.frustumCulled = false;
    const pSeeds = Array.from({ length: pCount }, () => ({
      angle: Math.random() * Math.PI * 2,
      radius: 1.7 + Math.random() * 2.2,
      y: (Math.random() - 0.5) * 3.4,
      speed: 0.14 + Math.random() * 0.24,
      scale: 0.45 + Math.random() * 0.95,
      phase: Math.random() * Math.PI * 2,
    }));
    stageGroup.add(particles);

    if (!isSoft) {
      renderer.compile(scene, camera);
    }

    // Mouse parallax & animation state (zero allocations in loop)
    const pointerTarget = { x: 0, y: 0 };
    const pointerSmooth = { x: 0, y: 0 };
    const dummy = new THREE.Object3D();
    const clock = new THREE.Clock();

    const onPointerMove = (e: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      pointerTarget.x = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
      pointerTarget.y = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
    };
    window.addEventListener('pointermove', onPointerMove, { passive: true });

    const onResize = () => {
      if (!container) return;
      const sz = syncRendererToContainer(renderer, container, preset.pixelRatio);
      updateHeroFraming(sz.width, sz.aspect);
    };
    const stopResizeObserver = observeContainerResize(container, onResize);

    const onContextLost = (e: Event) => {
      e.preventDefault();
      setWebglFailed(true);
    };
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);

    let alive = true;
    let frameHandle = 0;
    let frameIsTimeout = false;

    const tick = () => {
      if (!alive) return;
      const delta = Math.min(0.05, clock.getDelta());
      const t = clock.getElapsedTime();
      const os = rig.orbitScale;

      pointerSmooth.x = THREE.MathUtils.damp(pointerSmooth.x, pointerTarget.x, 4, delta);
      pointerSmooth.y = THREE.MathUtils.damp(pointerSmooth.y, pointerTarget.y, 4, delta);

      camera.position.x = pointerSmooth.x * rig.parallaxAmp;
      camera.position.y = rig.camY - pointerSmooth.y * (rig.parallaxAmp * 0.6);
      camera.position.z = rig.camZ;
      camera.lookAt(0, 0.0, 0);

      // Center crest
      crestGroup.position.y = 0.35 + Math.sin(t * 1.4) * 0.14;
      outerOct.rotation.y = t * 0.45;
      outerOct.rotation.x = Math.sin(t * 0.5) * 0.25;
      cageRing1.rotation.x = t * 0.65;
      cageRing1.rotation.y = t * 0.4;
      cageRing2.rotation.y = -t * 0.55;
      cageRing2.rotation.z = t * 0.35;
      goldCore.rotation.y = -t * 1.1;

      // Orbiting 3D artifacts (bounded cleanly inside hero frustum)
      const a1 = t * 0.45;
      cardMesh.position.set(Math.cos(a1) * 2.45 * os, 0.55 + Math.sin(t * 1.6) * 0.18, Math.sin(a1) * 1.8 * os);
      cardMesh.rotation.y = a1 + Math.PI * 0.5 + Math.sin(t * 0.9) * 0.4;
      cardMesh.rotation.z = Math.sin(t * 1.1) * 0.14;

      const a2 = t * 0.45 + Math.PI * 0.66;
      dieMesh.position.set(Math.cos(a2) * 2.3 * os, -0.15 + Math.cos(t * 1.4) * 0.18, Math.sin(a2) * 1.75 * os);
      dieMesh.rotation.x = t * 0.7;
      dieMesh.rotation.y = t * 0.9;

      const a3 = t * 0.45 + Math.PI * 1.33;
      chipStack.position.set(Math.cos(a3) * 2.25 * os, -0.5 + Math.sin(t * 1.3 + 1) * 0.12, Math.sin(a3) * 1.75 * os);
      chipStack.rotation.y = -t * 0.5;

      const ap = t * 0.72;
      planeGroup.position.set(Math.cos(ap) * 2.75 * os, 1.35 + Math.sin(t * 1.8) * 0.2, Math.sin(ap) * 2.0 * os);
      planeGroup.rotation.y = -ap;
      planeGroup.rotation.z = 0.28;
      planeGroup.rotation.x = -0.1;
      propBlade.rotation.z = t * 28;

      for (let i = 0; i < pCount; i++) {
        const s = pSeeds[i];
        const ang = s.angle + t * s.speed;
        dummy.position.set(
          Math.cos(ang) * s.radius * os,
          s.y + Math.sin(t * 0.8 + s.phase) * 0.3,
          Math.sin(ang) * s.radius * 0.72 * os,
        );
        dummy.rotation.set(t + s.phase, t * 0.7, 0);
        dummy.scale.setScalar(s.scale);
        dummy.updateMatrix();
        particles.setMatrixAt(i, dummy.matrix);
      }
      particles.instanceMatrix.needsUpdate = true;

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
      window.removeEventListener('pointermove', onPointerMove);
      stopResizeObserver();
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);

      envTex.dispose();
      cardFrontTex.dispose();
      cardBackTex.dispose();
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
      <div className="relative w-full h-full rounded-2xl overflow-hidden border border-[#d4af37]/20">
        <img
          src={GENERATED_ASSETS.aviatorPreview}
          alt="Aurelia Arena 3D Showcase"
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover"
        />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="w-full h-full min-h-[260px] overflow-hidden"
      aria-label="Interactive 3D gaming emblem showcase"
    />
  );
};
