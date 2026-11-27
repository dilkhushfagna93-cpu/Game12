import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GENERATED_ASSETS } from '../../config/assets';
import type { GraphicsQuality } from '../../types';
import {
  computeResponsiveFov,
  getViewportTier,
  observeContainerResize,
  syncRendererToContainer,
} from '../../utils/cameraFraming';
import { detectSoftwareWebGL, getGraphicsPreset, scheduleNextFrame } from '../../utils/graphics';

export interface AviatorSceneProps {
  graphicsQuality: GraphicsQuality;
  phase: 'countdown' | 'flying' | 'crashed';
  multiplier: number;
}

function createSkyGradientTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0.0, '#070516');
  grad.addColorStop(0.28, '#150d30');
  grad.addColorStop(0.55, '#2c1552');
  grad.addColorStop(0.75, '#6e2845');
  grad.addColorStop(0.88, '#d47c4a');
  grad.addColorStop(1.0, '#120a21');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 512);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createCurtainGradientTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 16, 256);

  // Canvas y=0 maps to UV v=1 (top curve edge), y=256 maps to UV v=0 (bottom baseline)
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0.0, 'rgba(255, 42, 72, 0.56)');
  grad.addColorStop(0.28, 'rgba(235, 28, 60, 0.34)');
  grad.addColorStop(0.65, 'rgba(195, 18, 48, 0.12)');
  grad.addColorStop(1.0, 'rgba(140, 10, 36, 0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 16, 256);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

function createSmokePuffTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 128, 128);

  // Soft layered billow puffs for realistic wispy exhaust smoke
  const puffs = [
    { x: 64, y: 64, r: 52, a: 0.72 },
    { x: 48, y: 58, r: 36, a: 0.45 },
    { x: 78, y: 66, r: 34, a: 0.45 },
    { x: 62, y: 48, r: 32, a: 0.4 },
    { x: 64, y: 76, r: 30, a: 0.35 },
  ];
  for (const p of puffs) {
    const g = ctx.createRadialGradient(p.x, p.y, 2, p.x, p.y, p.r);
    g.addColorStop(0, `rgba(248, 246, 252, ${p.a})`);
    g.addColorStop(0.45, `rgba(218, 214, 228, ${p.a * 0.65})`);
    g.addColorStop(0.78, `rgba(170, 165, 185, ${p.a * 0.22})`);
    g.addColorStop(1, 'rgba(150, 145, 165, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createRotorBlurTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 256, 256);

  const cx = 128;
  const cy = 128;
  const radial = ctx.createRadialGradient(cx, cy, 8, cx, cy, 122);
  radial.addColorStop(0, 'rgba(255, 225, 140, 0.38)');
  radial.addColorStop(0.45, 'rgba(255, 240, 210, 0.16)');
  radial.addColorStop(0.84, 'rgba(246, 200, 96, 0.24)');
  radial.addColorStop(0.95, 'rgba(246, 200, 96, 0.42)');
  radial.addColorStop(1, 'rgba(246, 200, 96, 0)');
  ctx.fillStyle = radial;
  ctx.beginPath();
  ctx.arc(cx, cy, 122, 0, Math.PI * 2);
  ctx.fill();

  // Subtle swept rotor motion arcs
  for (let i = 0; i < 4; i++) {
    const startAngle = (i * Math.PI) / 2;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, 120, startAngle, startAngle + 0.42);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255, 248, 225, 0.16)';
    ctx.fill();
    ctx.restore();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

interface SmokeParticle {
  sprite: THREE.Sprite;
  mat: THREE.SpriteMaterial;
  age: number;
  life: number;
  vx: number;
  vy: number;
  vz: number;
  startScale: number;
  endScale: number;
  maxOpacity: number;
  rotSpeed: number;
  isDark: boolean;
}

const _camDir = new THREE.Vector3();
const _lookAtPos = new THREE.Vector3();
const _exhaustWorldL = new THREE.Vector3();
const _exhaustWorldR = new THREE.Vector3();
const _tailHitchWorld = new THREE.Vector3();

export const AviatorCanvas: React.FC<AviatorSceneProps> = ({
  graphicsQuality,
  phase,
  multiplier,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [webglFailed, setWebglFailed] = useState(false);

  const stateRef = useRef({ phase, multiplier });
  stateRef.current = { phase, multiplier };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const isSoft = detectSoftwareWebGL();
    const preset = getGraphicsPreset(graphicsQuality);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: preset.antialias,
        powerPreference: 'high-performance',
      });
    } catch {
      setWebglFailed(true);
      return;
    }

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    renderer.shadowMap.enabled = preset.shadows;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const initialSize = syncRendererToContainer(renderer, container, preset.pixelRatio);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x130b24);
    scene.fog = new THREE.FogExp2(0x21123b, 0.011);

    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    pmrem.dispose();

    const camera = new THREE.PerspectiveCamera(
      computeResponsiveFov(initialSize.aspect, 40, 48),
      initialSize.aspect,
      0.1,
      280,
    );

    const viewMetrics = {
      width: initialSize.width,
      height: initialSize.height,
      aspect: initialSize.aspect,
      heliScale: 0.72,
      cloudScale: 1,
      baseFov: 42,
      safeDist: 11.4,
      halfW: 6.5,
      halfH: 4.2,
      anchorX: -5.4,
      anchorY: -2.9,
      cruiseX: 3.4,
      cruiseY: 1.75,
    };

    const recomputeMetrics = (w: number, h: number, aspect: number) => {
      const tier = getViewportTier(w);
      const baseFov = computeResponsiveFov(aspect, 40, 46);
      // Slightly wider camera framing distance so full helicopter tail & rotor clear edges cleanly
      const safeDist = aspect < 1.15 ? 13.4 : 11.8;

      // Exact visible frustum half-extents at z=0 with straight-on camera at (0, 0, safeDist)
      const halfH = Math.tan(THREE.MathUtils.degToRad(baseFov * 0.5)) * safeDist;
      const halfW = halfH * Math.max(0.5, aspect);

      // Proportional helicopter scale so entire tail + rotor + sweeping diagonal curve stay cleanly inside frame
      const heliScale = THREE.MathUtils.clamp(
        Math.min(halfW * (tier === 'mobile' ? 0.125 : 0.145), halfH * 0.24),
        0.42,
        0.86,
      );
      const cloudScale = tier === 'mobile' ? 0.62 : tier === 'tablet' ? 0.8 : 1.0;

      // Map exact viewport percentages to z=0 world coords:
      // Takeoff origin shifted inward to x = 16% from left, y = 82% from top (prevents left-edge tail clipping)
      // Cruising zone: x = 75% from left, y = 28% from top
      const anchorX = (0.16 * 2 - 1) * halfW;
      const anchorY = (1 - 0.82 * 2) * halfH;
      const cruiseX = (0.75 * 2 - 1) * halfW;
      const cruiseY = (1 - 0.28 * 2) * halfH;

      viewMetrics.width = w;
      viewMetrics.height = h;
      viewMetrics.aspect = aspect;
      viewMetrics.heliScale = heliScale;
      viewMetrics.cloudScale = cloudScale;
      viewMetrics.baseFov = baseFov;
      viewMetrics.safeDist = safeDist;
      viewMetrics.halfW = halfW;
      viewMetrics.halfH = halfH;
      viewMetrics.anchorX = anchorX;
      viewMetrics.anchorY = anchorY;
      viewMetrics.cruiseX = cruiseX;
      viewMetrics.cruiseY = cruiseY;
    };

    recomputeMetrics(initialSize.width, initialSize.height, initialSize.aspect);

    // 1. Twilight Sunset Sky Dome
    const skyTex = createSkyGradientTexture();
    const skyDome = new THREE.Mesh(
      new THREE.SphereGeometry(170, 32, 24),
      new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false }),
    );
    scene.add(skyDome);

    // Subtle atmospheric flight radar grid lines in background plane (z = -4.5)
    const gridLinesGroup = new THREE.Group();
    const gridMat = new THREE.LineBasicMaterial({
      color: 0xf6dc93,
      transparent: true,
      opacity: 0.08,
    });
    const gridVerts: number[] = [];
    for (let x = -18; x <= 18; x += 2.2) {
      gridVerts.push(x, -10, -4.5, x, 12, -4.5);
    }
    for (let y = -8; y <= 10; y += 1.8) {
      gridVerts.push(-20, y, -4.5, 20, y, -4.5);
    }
    const gridGeo = new THREE.BufferGeometry();
    gridGeo.setAttribute('position', new THREE.Float32BufferAttribute(gridVerts, 3));
    const gridLines = new THREE.LineSegments(gridGeo, gridMat);
    gridLinesGroup.add(gridLines);
    scene.add(gridLinesGroup);

    // Lighting
    const hemi = new THREE.HemisphereLight(0xb8a3ff, 0x2c1622, 1.05);
    scene.add(hemi);

    const sunLight = new THREE.DirectionalLight(0xffd28a, 2.9);
    sunLight.position.set(14, 13, 10);
    sunLight.castShadow = preset.shadows;
    sunLight.shadow.mapSize.set(preset.shadowMapSize, preset.shadowMapSize);
    sunLight.shadow.camera.left = -10;
    sunLight.shadow.camera.right = 10;
    sunLight.shadow.camera.top = 10;
    sunLight.shadow.camera.bottom = -10;
    sunLight.shadow.bias = -0.0005;
    sunLight.shadow.normalBias = 0.02;
    scene.add(sunLight);

    const rimLight = new THREE.DirectionalLight(0x818cf8, 1.5);
    rimLight.position.set(-10, 6, -8);
    scene.add(rimLight);

    const underGlow = new THREE.PointLight(0xff4769, 1.6, 12);
    underGlow.position.set(0, -1.5, 2.5);
    scene.add(underGlow);

    // Distant Golden Sun Disc
    const sunDisc = new THREE.Mesh(
      new THREE.CircleGeometry(13, 32),
      new THREE.MeshBasicMaterial({ color: 0xffd78c, fog: false }),
    );
    sunDisc.position.set(54, 15, -120);
    sunDisc.lookAt(0, 0, 0);
    scene.add(sunDisc);

    // =========================================================================
    // 2. Detailed 12-Part Composite 3D Crimson & Metallic-Gold Helicopter
    // =========================================================================
    const helicopter = new THREE.Group();
    helicopter.scale.setScalar(viewMetrics.heliScale);
    scene.add(helicopter);

    const crimsonMat = new THREE.MeshPhysicalMaterial({
      color: 0xdc1e35,
      metalness: 0.45,
      roughness: 0.2,
      clearcoat: 1.0,
      clearcoatRoughness: 0.1,
    });
    const darkCarbonMat = new THREE.MeshPhysicalMaterial({
      color: 0x161422,
      metalness: 0.72,
      roughness: 0.3,
      clearcoat: 0.5,
    });
    const goldMat = new THREE.MeshPhysicalMaterial({
      color: 0xf0c850,
      metalness: 0.92,
      roughness: 0.18,
      clearcoat: 0.65,
    });
    const chromeMat = new THREE.MeshStandardMaterial({
      color: 0xdde3f0,
      metalness: 0.94,
      roughness: 0.14,
    });
    const cockpitGlassMat = new THREE.MeshPhysicalMaterial({
      color: 0x102544,
      metalness: 0.15,
      roughness: 0.06,
      clearcoat: 1.0,
      clearcoatRoughness: 0.04,
      transparent: true,
      opacity: 0.88,
    });
    const exhaustCoreMat = new THREE.MeshBasicMaterial({ color: 0xff7b29 });

    // (1) Sculpted Aerodynamic Fuselage Cabin (nose along +X)
    const cabinProfile = [
      new THREE.Vector2(0.0, -0.95),
      new THREE.Vector2(0.24, -0.82),
      new THREE.Vector2(0.46, -0.45),
      new THREE.Vector2(0.56, 0.05),
      new THREE.Vector2(0.54, 0.58),
      new THREE.Vector2(0.42, 1.02),
      new THREE.Vector2(0.22, 1.32),
      new THREE.Vector2(0.0, 1.44),
    ];
    const cabinGeo = new THREE.LatheGeometry(cabinProfile, 26);
    cabinGeo.rotateZ(-Math.PI / 2);
    cabinGeo.scale(1.0, 0.95, 0.86);
    const cabin = new THREE.Mesh(cabinGeo, crimsonMat);
    cabin.castShadow = true;
    cabin.receiveShadow = true;
    helicopter.add(cabin);

    // (2) Metallic Gold Accent Stripe & Belly Fairing
    const stripeGeo = new THREE.CylinderGeometry(0.56, 0.55, 0.72, 24, 1, true);
    stripeGeo.rotateZ(-Math.PI / 2);
    stripeGeo.scale(1.0, 0.97, 0.88);
    const goldBand = new THREE.Mesh(stripeGeo, goldMat);
    goldBand.position.set(0.18, 0.0, 0);
    helicopter.add(goldBand);

    const bellyKeel = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.16, 0.58), darkCarbonMat);
    bellyKeel.position.set(0.12, -0.46, 0);
    helicopter.add(bellyKeel);

    // (3) Panoramic Tinted Front Cockpit Canopy Glass
    const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.49, 24, 16), cockpitGlassMat);
    canopy.scale.set(1.52, 0.88, 0.92);
    canopy.position.set(0.58, 0.16, 0);
    helicopter.add(canopy);

    // Side cabin tinted windows
    [-0.45, 0.45].forEach((zSide) => {
      const sideWin = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.28, 0.06), cockpitGlassMat);
      sideWin.position.set(0.08, 0.16, zSide);
      helicopter.add(sideWin);
    });

    // (4) Top Turbine Engine Cowling & Air Intake
    const turbineHousing = new THREE.Mesh(
      new THREE.CylinderGeometry(0.24, 0.34, 1.12, 18),
      darkCarbonMat,
    );
    turbineHousing.rotation.z = -Math.PI / 2;
    turbineHousing.position.set(-0.14, 0.54, 0);
    turbineHousing.castShadow = true;
    helicopter.add(turbineHousing);

    const turbineGoldCap = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.12, 0.44), goldMat);
    turbineGoldCap.position.set(-0.1, 0.67, 0);
    helicopter.add(turbineGoldCap);

    // (5) Dual Rear Turbine Exhaust Pipes (smoke emits directly from these!)
    const exhaustTipL = new THREE.Object3D();
    const exhaustTipR = new THREE.Object3D();
    [-0.19, 0.19].forEach((zOff, idx) => {
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.105, 0.46, 14), chromeMat);
      pipe.rotation.z = Math.PI / 2 + 0.1;
      pipe.position.set(-0.74, 0.54, zOff);
      helicopter.add(pipe);

      const core = new THREE.Mesh(new THREE.CircleGeometry(0.065, 12), exhaustCoreMat);
      core.rotation.y = -Math.PI / 2;
      core.position.set(-0.98, 0.51, zOff);
      helicopter.add(core);

      const tip = idx === 0 ? exhaustTipL : exhaustTipR;
      tip.position.set(-1.04, 0.5, zOff);
      helicopter.add(tip);
    });

    // (6) Overhead Main Rotor Mast + Swashplate + 4-Blade Main Rotor + Blur Disc
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.09, 0.42, 14), chromeMat);
    mast.position.set(0.05, 0.86, 0);
    helicopter.add(mast);

    const mainRotorGroup = new THREE.Group();
    mainRotorGroup.position.set(0.05, 1.07, 0);
    const hubCap = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 0.12, 16), goldMat);
    mainRotorGroup.add(hubCap);

    for (let i = 0; i < 4; i++) {
      const bladeHolder = new THREE.Group();
      bladeHolder.rotation.y = (i * Math.PI) / 2;

      const blade = new THREE.Mesh(new THREE.BoxGeometry(1.78, 0.028, 0.13), darkCarbonMat);
      blade.position.set(0.95, 0, 0);
      blade.rotation.x = 0.1;
      bladeHolder.add(blade);

      const bladeTip = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.032, 0.134), goldMat);
      bladeTip.position.set(1.76, 0, 0);
      bladeTip.rotation.x = 0.1;
      bladeHolder.add(bladeTip);

      mainRotorGroup.add(bladeHolder);
    }

    const rotorBlurTex = createRotorBlurTexture();
    const mainRotorBlur = new THREE.Mesh(
      new THREE.CircleGeometry(1.9, 36),
      new THREE.MeshBasicMaterial({
        map: rotorBlurTex,
        transparent: true,
        opacity: 0.72,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    mainRotorBlur.rotation.x = -Math.PI / 2;
    mainRotorBlur.position.y = 0.015;
    mainRotorGroup.add(mainRotorBlur);
    helicopter.add(mainRotorGroup);

    // (7) Tapered Tail Boom
    const tailBoom = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.25, 1.65, 16),
      crimsonMat,
    );
    tailBoom.rotation.z = Math.PI / 2;
    tailBoom.position.set(-1.42, 0.12, 0);
    tailBoom.castShadow = true;
    helicopter.add(tailBoom);

    const boomGoldRing = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.16, 0.2, 16),
      goldMat,
    );
    boomGoldRing.rotation.z = Math.PI / 2;
    boomGoldRing.position.set(-1.62, 0.12, 0);
    helicopter.add(boomGoldRing);

    // (8) Swept Vertical Tail Fin + Horizontal Stabilizers
    const tailFin = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.76, 0.06), crimsonMat);
    tailFin.position.set(-2.16, 0.34, 0);
    tailFin.rotation.z = 0.32;
    tailFin.castShadow = true;
    helicopter.add(tailFin);

    const tailFinTip = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.13, 0.072), goldMat);
    tailFinTip.position.set(-2.26, 0.68, 0);
    tailFinTip.rotation.z = 0.32;
    helicopter.add(tailFinTip);

    const tailStab = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.045, 0.92), goldMat);
    tailStab.position.set(-1.82, 0.12, 0);
    helicopter.add(tailStab);

    // (9) Spinning 4-Blade Tail Rotor
    const tailRotorGroup = new THREE.Group();
    tailRotorGroup.position.set(-2.22, 0.42, 0.11);
    const tailHub = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.08, 10), goldMat);
    tailHub.rotation.x = Math.PI / 2;
    tailRotorGroup.add(tailHub);
    for (let i = 0; i < 4; i++) {
      const tb = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.045, 0.018), chromeMat);
      tb.rotation.z = (i * Math.PI) / 2;
      tb.position.set(Math.cos(tb.rotation.z) * 0.17, Math.sin(tb.rotation.z) * 0.17, 0);
      tailRotorGroup.add(tb);
    }
    const tailBlur = new THREE.Mesh(
      new THREE.CircleGeometry(0.35, 20),
      new THREE.MeshBasicMaterial({
        color: 0xf6dc93,
        transparent: true,
        opacity: 0.25,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    tailRotorGroup.add(tailBlur);
    helicopter.add(tailRotorGroup);

    // (10) Twin Curved Landing Skids + Angled Struts
    [-0.44, 0.44].forEach((zOff) => {
      const skidTube = new THREE.Mesh(
        new THREE.CylinderGeometry(0.036, 0.036, 1.85, 10),
        chromeMat,
      );
      skidTube.rotation.z = Math.PI / 2;
      skidTube.position.set(0.18, -0.78, zOff);
      helicopter.add(skidTube);

      const frontTip = new THREE.Mesh(
        new THREE.CylinderGeometry(0.035, 0.035, 0.34, 10),
        goldMat,
      );
      frontTip.rotation.z = -Math.PI / 3;
      frontTip.position.set(1.22, -0.69, zOff);
      helicopter.add(frontTip);

      // Front & rear support struts
      [0.62, -0.28].forEach((xOff) => {
        const strut = new THREE.Mesh(
          new THREE.CylinderGeometry(0.026, 0.026, 0.44, 8),
          darkCarbonMat,
        );
        strut.position.set(xOff, -0.58, zOff * 0.8);
        strut.rotation.x = zOff > 0 ? -0.36 : 0.36;
        helicopter.add(strut);
      });
    });

    // (11) Navigation Beacons & Blinking Tail Strobe
    const beaconMat = new THREE.MeshBasicMaterial({ color: 0xff3b5c });
    const tailBeacon = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 10), beaconMat);
    tailBeacon.position.set(-2.29, 0.78, 0);
    helicopter.add(tailBeacon);

    const navGreen = new THREE.Mesh(
      new THREE.SphereGeometry(0.045, 10, 10),
      new THREE.MeshBasicMaterial({ color: 0x34d399 }),
    );
    navGreen.position.set(0.35, -0.05, 0.5);
    const navRed = new THREE.Mesh(
      new THREE.SphereGeometry(0.045, 10, 10),
      new THREE.MeshBasicMaterial({ color: 0xff3b5c }),
    );
    navRed.position.set(0.35, -0.05, -0.5);
    helicopter.add(navGreen, navRed);

    // (12) Kite-String Tail Hitch Point (where patang ki dori attaches)
    const hitchRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.07, 0.022, 8, 16),
      new THREE.MeshBasicMaterial({ color: 0xfde047 }),
    );
    hitchRing.position.set(-2.26, 0.06, 0);
    helicopter.add(hitchRing);

    const tailHitchLocal = new THREE.Object3D();
    tailHitchLocal.position.set(-2.28, 0.06, 0);
    helicopter.add(tailHitchLocal);

    // =========================================================================
    // 3. Diagonal Exponential Flight Trail ("Patang ki Dori") & Red Gradient Fill
    // =========================================================================
    const stringSegs = 64;
    const stringPointCount = stringSegs + 1;

    const coreIndices: number[] = [];
    for (let i = 0; i < stringSegs; i++) {
      const a = i * 2;
      const b = a + 1;
      const c = a + 2;
      const d = a + 3;
      coreIndices.push(a, b, c, b, d, c);
    }

    // (a) Inner Luminous Amber-Gold Core Filament
    const coreVerts = new Float32Array(stringPointCount * 2 * 3);
    const coreGeo = new THREE.BufferGeometry();
    coreGeo.setAttribute('position', new THREE.BufferAttribute(coreVerts, 3));
    coreGeo.setIndex(coreIndices);
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0xffdf80,
      transparent: true,
      opacity: 0.98,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const kiteStringCore = new THREE.Mesh(coreGeo, coreMat);
    kiteStringCore.frustumCulled = false;
    scene.add(kiteStringCore);

    // (b) Vibrant Glowing Crimson-Red Main Stroke Ribbon
    const midVerts = new Float32Array(stringPointCount * 2 * 3);
    const midGeo = new THREE.BufferGeometry();
    midGeo.setAttribute('position', new THREE.BufferAttribute(midVerts, 3));
    midGeo.setIndex(coreIndices);
    const midMat = new THREE.MeshBasicMaterial({
      color: 0xff294a,
      transparent: true,
      opacity: 0.92,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const kiteStringMid = new THREE.Mesh(midGeo, midMat);
    kiteStringMid.frustumCulled = false;
    scene.add(kiteStringMid);

    // (c) Soft Outer Neon Crimson-Amber Glow Aura
    const haloVerts = new Float32Array(stringPointCount * 2 * 3);
    const haloGeo = new THREE.BufferGeometry();
    haloGeo.setAttribute('position', new THREE.BufferAttribute(haloVerts, 3));
    haloGeo.setIndex(coreIndices);
    const haloMat = new THREE.MeshBasicMaterial({
      color: 0xff3b30,
      transparent: true,
      opacity: 0.36,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const kiteStringHalo = new THREE.Mesh(haloGeo, haloMat);
    kiteStringHalo.frustumCulled = false;
    scene.add(kiteStringHalo);

    // (d) True Translucent Red-to-Transparent Vertical Gradient Fill Under the Curve
    const curtainGradTex = createCurtainGradientTexture();
    const curtainVerts = new Float32Array(stringPointCount * 2 * 3);
    const curtainUvs = new Float32Array(stringPointCount * 2 * 2);
    for (let i = 0; i < stringPointCount; i++) {
      const u = i / stringSegs;
      // Top vertex sits on the curve (v = 1 -> vibrant translucent red)
      curtainUvs[i * 4 + 0] = u;
      curtainUvs[i * 4 + 1] = 1;
      // Bottom vertex sits on the horizontal baseline (v = 0 -> transparent)
      curtainUvs[i * 4 + 2] = u;
      curtainUvs[i * 4 + 3] = 0;
    }
    const curtainGeo = new THREE.BufferGeometry();
    curtainGeo.setAttribute('position', new THREE.BufferAttribute(curtainVerts, 3));
    curtainGeo.setAttribute('uv', new THREE.BufferAttribute(curtainUvs, 2));
    curtainGeo.setIndex(coreIndices);
    const curtainMat = new THREE.MeshBasicMaterial({
      map: curtainGradTex,
      transparent: true,
      opacity: 1.0,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const kiteCurtain = new THREE.Mesh(curtainGeo, curtainMat);
    kiteCurtain.frustumCulled = false;
    scene.add(kiteCurtain);

    // (e) Subtle Crisp Aviator Graph Baseline & Left Altitude Axis anchored at (originX, originY)
    const axisVerts = new Float32Array(12);
    const axisGeo = new THREE.BufferGeometry();
    axisGeo.setAttribute('position', new THREE.BufferAttribute(axisVerts, 3));
    const axisMat = new THREE.LineBasicMaterial({
      color: 0xf6dc93,
      transparent: true,
      opacity: 0.24,
    });
    const axisLines = new THREE.LineSegments(axisGeo, axisMat);
    axisLines.frustumCulled = false;
    scene.add(axisLines);

    // (f) Glowing Bottom-Left Origin Dot (strictly at x: 8%, y: 85%)
    const anchorGroup = new THREE.Group();
    const anchorCore = new THREE.Mesh(
      new THREE.SphereGeometry(0.11, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xffe484 }),
    );
    const anchorRing = new THREE.Mesh(
      new THREE.RingGeometry(0.15, 0.26, 28),
      new THREE.MeshBasicMaterial({
        color: 0xff294a,
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    const anchorOuterGlow = new THREE.Mesh(
      new THREE.RingGeometry(0.26, 0.42, 28),
      new THREE.MeshBasicMaterial({
        color: 0xff3b30,
        transparent: true,
        opacity: 0.32,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    anchorGroup.add(anchorCore, anchorRing, anchorOuterGlow);
    scene.add(anchorGroup);

    // =========================================================================
    // 4. Continuous Billowing Rear Exhaust Smoke ("Duha") Sprite Pool
    // =========================================================================
    const smokeTex = createSmokePuffTexture();
    const smokePoolSize = isSoft ? 24 : 52;
    const smokeParticles: SmokeParticle[] = [];
    for (let i = 0; i < smokePoolSize; i++) {
      const mat = new THREE.SpriteMaterial({
        map: smokeTex,
        color: 0xeae8f4,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const sprite = new THREE.Sprite(mat);
      sprite.visible = false;
      scene.add(sprite);
      smokeParticles.push({
        sprite,
        mat,
        age: 99,
        life: 1.4,
        vx: -2.4,
        vy: 0.3,
        vz: 0,
        startScale: 0.26,
        endScale: 1.5,
        maxOpacity: 0.55,
        rotSpeed: 0.5,
        isDark: false,
      });
    }
    let nextSmokeIdx = 0;
    let smokeEmitAccum = 0;

    const spawnSmokePuff = (
      ox: number,
      oy: number,
      oz: number,
      ps: number,
      isFlying: boolean,
      isCrashBurst = false,
    ) => {
      const p = smokeParticles[nextSmokeIdx];
      nextSmokeIdx = (nextSmokeIdx + 1) % smokePoolSize;

      p.age = 0;
      p.isDark = isCrashBurst;
      if (isCrashBurst) {
        p.life = 1.4 + Math.random() * 0.9;
        p.vx = (Math.random() - 0.5) * 4.5 * ps;
        p.vy = (Math.random() - 0.2) * 3.8 * ps;
        p.vz = (Math.random() - 0.5) * 2.5 * ps;
        p.startScale = 0.55 * ps;
        p.endScale = (2.6 + Math.random() * 1.4) * ps;
        p.maxOpacity = 0.85;
        p.mat.color.setHex(Math.random() > 0.35 ? 0x3b3545 : 0xff7733);
      } else if (isFlying) {
        p.life = 1.05 + Math.random() * 0.55;
        p.vx = (-3.6 - Math.random() * 1.8) * ps;
        p.vy = (0.18 + (Math.random() - 0.35) * 0.65) * ps;
        p.vz = (Math.random() - 0.5) * 0.45 * ps;
        p.startScale = (0.28 + Math.random() * 0.1) * ps;
        p.endScale = (1.55 + Math.random() * 0.65) * ps;
        p.maxOpacity = 0.64;
        // Soft luminous exhaust white-gray with slight warm tint right behind engine
        p.mat.color.setHex(Math.random() > 0.4 ? 0xf2f0fa : 0xd5d2e4);
      } else {
        // Gentle idle exhaust wisps during countdown
        p.life = 1.2 + Math.random() * 0.45;
        p.vx = (-1.5 - Math.random() * 0.7) * ps;
        p.vy = (0.35 + Math.random() * 0.35) * ps;
        p.vz = (Math.random() - 0.5) * 0.25 * ps;
        p.startScale = 0.22 * ps;
        p.endScale = 1.05 * ps;
        p.maxOpacity = 0.38;
        p.mat.color.setHex(0xdedbe8);
      }
      p.rotSpeed = (Math.random() - 0.5) * 1.6;
      p.sprite.position.set(ox, oy, oz);
      p.sprite.scale.setScalar(p.startScale);
      p.mat.rotation = Math.random() * Math.PI * 2;
      p.mat.opacity = 0;
      p.sprite.visible = true;
    };

    // Crash Fire Sparks (InstancedMesh)
    const sparkCount = 26;
    const emberMesh = new THREE.InstancedMesh(
      new THREE.OctahedronGeometry(0.11, 0),
      new THREE.MeshBasicMaterial({ color: 0xff8c2b }),
      sparkCount,
    );
    emberMesh.visible = false;
    emberMesh.frustumCulled = false;
    scene.add(emberMesh);

    const sparkSeeds = Array.from({ length: sparkCount }, () => ({
      vx: (Math.random() - 0.5) * 5.8,
      vy: (Math.random() - 0.25) * 4.8,
      vz: (Math.random() - 0.5) * 3.8,
      spin: Math.random() * 7,
    }));

    // 5. Volumetric Sunlit Clouds (kept far back behind z = -10)
    const cloudMat = new THREE.MeshStandardMaterial({
      color: 0xe6d6eb,
      roughness: 0.94,
      metalness: 0.0,
      transparent: true,
      opacity: 0.65,
    });
    const cloudPuffGeo = new THREE.DodecahedronGeometry(1.15, 1);
    const clouds: Array<{ group: THREE.Group; speed: number; baseY: number }> = [];
    for (let i = 0; i < preset.cloudCount; i++) {
      const cg = new THREE.Group();
      const puffs = 3 + (i % 3);
      for (let p = 0; p < puffs; p++) {
        const mesh = new THREE.Mesh(cloudPuffGeo, cloudMat);
        mesh.position.set(
          (p - 1) * 1.15,
          (Math.random() - 0.5) * 0.45,
          (Math.random() - 0.5) * 0.85,
        );
        const s = 0.65 + Math.random() * 0.72;
        mesh.scale.set(s * 1.4, s * 0.65, s);
        cg.add(mesh);
      }
      const baseY = -3.8 + Math.random() * 9.5;
      cg.position.set(-22 + Math.random() * 72, baseY, -30 + Math.random() * 18);
      cg.scale.setScalar(viewMetrics.cloudScale);
      scene.add(cg);
      clouds.push({ group: cg, speed: 5.5 + Math.random() * 7.2, baseY });
    }

    // Distant Mountain Floor Horizon
    const groundMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(240, 120, 24, 12),
      new THREE.MeshStandardMaterial({ color: 0x110922, roughness: 0.95, metalness: 0.05 }),
    );
    groundMesh.rotation.x = -Math.PI / 2;
    groundMesh.position.y = -11.5;
    const gPos = groundMesh.geometry.attributes.position;
    for (let i = 0; i < gPos.count; i++) {
      const x = gPos.getX(i);
      const y = gPos.getY(i);
      gPos.setZ(i, Math.sin(x * 0.09) * Math.cos(y * 0.08) * 2.1);
    }
    groundMesh.geometry.computeVertexNormals();
    scene.add(groundMesh);

    const onResize = () => {
      if (!container) return;
      const sz = syncRendererToContainer(renderer, container, preset.pixelRatio);
      recomputeMetrics(sz.width, sz.height, sz.aspect);
      camera.aspect = sz.aspect;
      camera.fov = viewMetrics.baseFov;
      camera.updateProjectionMatrix();
      helicopter.scale.setScalar(viewMetrics.heliScale);
      for (const c of clouds) {
        c.group.scale.setScalar(viewMetrics.cloudScale);
      }
    };

    const stopResizeObserver = observeContainerResize(container, onResize);

    // Initial Camera Placement (aligned squarely with z=0 flight graph plane: 16%/82% origin -> 75%/28% cruise)
    const startHeliXInit = viewMetrics.anchorX + 2.42 * viewMetrics.heliScale;
    const heliPos = new THREE.Vector3(startHeliXInit, viewMetrics.anchorY + 0.52 * viewMetrics.heliScale, 0);
    _camDir.set(0, 0, 1);
    _lookAtPos.set(0, 0, 0);
    camera.position.set(0, 0, viewMetrics.safeDist);
    camera.lookAt(_lookAtPos);

    if (!isSoft) {
      renderer.compile(scene, camera);
    }

    const onContextLost = (e: Event) => {
      e.preventDefault();
      setWebglFailed(true);
    };
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);

    const clock = new THREE.Clock();
    const dummy = new THREE.Object3D();
    let alive = true;
    let frameHandle = 0;
    let frameIsTimeout = false;
    let crashTimer = 0;
    let crashOrigin = new THREE.Vector3();
    let prevPhase: AviatorSceneProps['phase'] = 'countdown';
    let stringOpacity = 1;

    const tick = () => {
      if (!alive) return;
      const delta = Math.min(0.05, clock.getDelta());
      const t = clock.getElapsedTime();
      const { phase: ph, multiplier: mult } = stateRef.current;
      const ps = viewMetrics.heliScale;
      const isNarrow = viewMetrics.width < 640;

      // Detect phase transitions
      if (ph === 'crashed' && prevPhase !== 'crashed') {
        crashTimer = 0.001;
        crashOrigin.copy(heliPos);
        // Trigger immediate dramatic crash smoke burst!
        for (let b = 0; b < (isSoft ? 8 : 16); b++) {
          spawnSmokePuff(
            crashOrigin.x - 0.4 * ps,
            crashOrigin.y + 0.2 * ps,
            crashOrigin.z,
            ps,
            false,
            true,
          );
        }
      } else if (ph !== 'crashed') {
        crashTimer = 0;
      }
      prevPhase = ph;

      // Spin overhead main rotor & tail rotor smoothly
      const mainSpinSpeed = ph === 'flying' ? 36 : ph === 'countdown' ? 18 : 42;
      mainRotorGroup.rotation.y += delta * mainSpinSpeed;
      tailRotorGroup.rotation.z += delta * mainSpinSpeed * 1.45;
      (mainRotorBlur.material as THREE.MeshBasicMaterial).opacity =
        ph === 'flying' ? 0.78 : ph === 'countdown' ? 0.42 : 0.85;

      // Blink tail anti-collision beacon
      const blink = Math.sin(t * 9) > 0.35;
      beaconMat.color.setHex(blink ? 0xff3b5c : 0x551220);

      let climbNorm = 0;
      const ax = viewMetrics.anchorX;
      const ay = viewMetrics.anchorY;
      // Place helicopter so its full tail rotor & fin sit safely inside the left margin (x >= ~13% from left)
      // and its landing skids clear the bottom baseline cleanly at y = 82%
      const tailOffsetX = 2.42 * ps;
      const startX = ax + tailOffsetX;
      const startY = ay + 0.52 * ps;
      // Cruising upper-right target (~75% from left, ~28% from top), safely clamped so nose & rotor never clip right edge
      const maxSafeCruiseX = viewMetrics.halfW - 2.15 * ps;
      const cruiseX = Math.min(maxSafeCruiseX, Math.max(viewMetrics.cruiseX, startX + viewMetrics.halfW * 0.52));
      const cruiseY = Math.min(viewMetrics.halfH - 1.35 * ps, viewMetrics.cruiseY);

      if (ph === 'countdown') {
        helicopter.visible = true;
        emberMesh.visible = false;
        stringOpacity = THREE.MathUtils.damp(stringOpacity, 0.65, 6, delta);

        // Hover gently right at the bottom-left launch corner awaiting takeoff
        const idleX = startX;
        const idleY = startY + Math.sin(t * 2.8) * 0.07 * ps;
        heliPos.x = THREE.MathUtils.damp(heliPos.x, idleX, 5.5, delta);
        heliPos.y = THREE.MathUtils.damp(heliPos.y, idleY, 5.5, delta);
        heliPos.z = THREE.MathUtils.damp(heliPos.z, 0, 5, delta);
        helicopter.position.copy(heliPos);
        helicopter.rotation.z = THREE.MathUtils.damp(helicopter.rotation.z, 0.09, 5, delta);
        helicopter.rotation.x = THREE.MathUtils.damp(
          helicopter.rotation.x,
          Math.sin(t * 1.8) * 0.035,
          5,
          delta,
        );
        helicopter.rotation.y = THREE.MathUtils.damp(helicopter.rotation.y, 0.09, 4, delta);
      } else if (ph === 'flying') {
        helicopter.visible = true;
        emberMesh.visible = false;
        stringOpacity = THREE.MathUtils.damp(stringOpacity, 1.0, 8, delta);

        // Smooth asymptotic progress from 0 (1.00x) -> 1 (cruising zone)
        const logMult = Math.log(Math.max(1, mult));
        climbNorm = 1 - Math.exp(-logMult * 1.75);

        // Sweeping diagonal exponential parabolic trajectory:
        // X progresses swiftly rightward first (bottom-left -> upper-right), while Y curves upward parabolically
        const xFrac = Math.pow(climbNorm, 0.78);
        const yFrac = Math.pow(climbNorm, 1.62);

        // Subtle organic cruise bobbing once reaching the upper-right cruising zone
        const cruiseFactor = THREE.MathUtils.smoothstep(climbNorm, 0.55, 0.98);
        const hoverX = Math.cos(t * 1.55) * (0.022 * viewMetrics.halfW) * cruiseFactor;
        const hoverY = Math.sin(t * 2.45) * (0.042 * viewMetrics.halfH) * (0.35 + 0.65 * cruiseFactor);

        const targetX = THREE.MathUtils.lerp(startX, cruiseX, xFrac) + hoverX;
        const targetY = THREE.MathUtils.lerp(startY, cruiseY, yFrac) + hoverY;

        heliPos.x = THREE.MathUtils.damp(heliPos.x, targetX, 4.4, delta);
        heliPos.y = THREE.MathUtils.damp(heliPos.y, targetY, 4.4, delta);
        heliPos.z = THREE.MathUtils.damp(heliPos.z, 0, 4, delta);
        helicopter.position.copy(heliPos);

        // Nose tilted naturally upward (12°–18° => 0.21–0.314 rad) along the parabolic climb tangent
        const tangentSlope = Math.min(1, Math.pow(climbNorm, 0.85));
        const targetPitch =
          THREE.MathUtils.lerp(0.21, 0.31, tangentSlope) + Math.sin(t * 2.45) * 0.024;
        helicopter.rotation.z = THREE.MathUtils.damp(helicopter.rotation.z, targetPitch, 5, delta);
        helicopter.rotation.x = THREE.MathUtils.damp(
          helicopter.rotation.x,
          Math.sin(t * 2.1) * 0.06,
          4,
          delta,
        );
        helicopter.rotation.y = THREE.MathUtils.damp(helicopter.rotation.y, 0.1, 4, delta);
      } else {
        // Crashed: Trail snaps & fades, helicopter zooms off upper-right with fiery sparks + heavy smoke
        crashTimer += delta;
        stringOpacity = Math.max(0, 1 - crashTimer * 3.4);

        const zoomSpeed = (8.5 + crashTimer * 15) * ps;
        heliPos.x += delta * zoomSpeed;
        heliPos.y += delta * (4.6 + crashTimer * 6.8) * ps;
        helicopter.position.copy(heliPos);
        helicopter.rotation.z = THREE.MathUtils.damp(helicopter.rotation.z, 0.42, 6, delta);
        helicopter.rotation.x += delta * 0.5;
        helicopter.visible = crashTimer < 0.85;

        emberMesh.visible = crashTimer < 1.6;
        if (emberMesh.visible) {
          for (let i = 0; i < sparkCount; i++) {
            const b = sparkSeeds[i];
            const age = Math.min(1.6, crashTimer);
            dummy.position.set(
              crashOrigin.x + b.vx * age * 0.85 * ps,
              crashOrigin.y + (b.vy * age * 0.8 - age * age * 0.85) * ps,
              crashOrigin.z + b.vz * age * 0.85 * ps,
            );
            dummy.rotation.set(age * b.spin, age * 2.4, 0);
            dummy.scale.setScalar(Math.max(0.03, (0.95 - age * 0.58) * ps));
            dummy.updateMatrix();
            emberMesh.setMatrixAt(i, dummy.matrix);
          }
          emberMesh.instanceMatrix.needsUpdate = true;
        }
      }

      // Sync world matrices so rear exhaust pipes & tail hitch have exact world coords
      helicopter.updateMatrixWorld(true);
      exhaustTipL.getWorldPosition(_exhaustWorldL);
      exhaustTipR.getWorldPosition(_exhaustWorldR);
      tailHitchLocal.getWorldPosition(_tailHitchWorld);

      // Update Continuous Exhaust Smoke ("duha") behind the helicopter
      const emitRate = ph === 'flying' ? (isSoft ? 14 : 30) : ph === 'countdown' ? (isSoft ? 5 : 10) : (isSoft ? 6 : 14);
      if (helicopter.visible) {
        smokeEmitAccum += delta * emitRate;
        while (smokeEmitAccum >= 1) {
          smokeEmitAccum -= 1;
          const useLeft = nextSmokeIdx % 2 === 0;
          const src = useLeft ? _exhaustWorldL : _exhaustWorldR;
          spawnSmokePuff(
            src.x + (Math.random() - 0.5) * 0.08 * ps,
            src.y + (Math.random() - 0.5) * 0.08 * ps,
            src.z + (Math.random() - 0.5) * 0.08 * ps,
            ps,
            ph === 'flying',
            ph === 'crashed',
          );
        }
      }

      for (let i = 0; i < smokePoolSize; i++) {
        const p = smokeParticles[i];
        if (p.age >= p.life) {
          p.sprite.visible = false;
          continue;
        }
        p.age += delta;
        const u = Math.min(1, p.age / p.life);

        // Billow backward + gentle swirl + upward heat rise
        p.sprite.position.x += p.vx * delta * (1 - u * 0.25);
        p.sprite.position.y += (p.vy + Math.sin(t * 4.5 + i) * 0.22 * ps) * delta;
        p.sprite.position.z += p.vz * delta;

        const scale = THREE.MathUtils.lerp(p.startScale, p.endScale, Math.pow(u, 0.72));
        p.sprite.scale.setScalar(scale);
        p.mat.rotation += p.rotSpeed * delta;

        // Smooth fade-in then long billowing fade-out
        const fadeIn = Math.min(1, u / 0.14);
        const fadeOut = Math.pow(1 - u, 1.35);
        p.mat.opacity = p.maxOpacity * fadeIn * fadeOut;
      }

      // =========================================================================
      // Update Subtle Flight Graph Axes, Glowing Bottom-Left Dot & Parabolic Trail
      // =========================================================================
      const axisPosAttr = axisGeo.attributes.position as THREE.BufferAttribute;
      const rightEdge = viewMetrics.halfW * 0.94;
      const topEdge = viewMetrics.halfH * 0.86;
      // Horizontal baseline along y = anchorY
      axisPosAttr.setXYZ(0, ax, ay, -0.06);
      axisPosAttr.setXYZ(1, rightEdge, ay, -0.06);
      // Left altitude vertical axis along x = anchorX
      axisPosAttr.setXYZ(2, ax, ay, -0.06);
      axisPosAttr.setXYZ(3, ax, topEdge, -0.06);
      axisPosAttr.needsUpdate = true;

      anchorGroup.position.set(ax, ay, 0.04);
      anchorGroup.scale.setScalar(Math.max(0.62, ps) * (0.94 + Math.sin(t * 4.5) * 0.08));
      anchorGroup.visible = true;

      const tailX = Math.max(ax + 0.04, _tailHitchWorld.x);
      const tailY = Math.max(ay + 0.02, _tailHitchWorld.y);
      const tailZ = _tailHitchWorld.z;

      const hasSweep = tailX - ax > 0.08;
      const showString = stringOpacity > 0.02 && (ph !== 'countdown' || hasSweep);
      kiteStringCore.visible = showString;
      kiteStringMid.visible = showString;
      kiteStringHalo.visible = showString;
      kiteCurtain.visible = showString && ph !== 'countdown' && tailX - ax > 0.12;

      if (showString) {
        // Sweeping exponential parabolic Bezier control point:
        // Hugs the bottom baseline horizontally from the origin then curves smoothly upward to the tail!
        const bendFlex = ph === 'flying' ? Math.sin(t * 2.1) * 0.035 : 0;
        const cx = THREE.MathUtils.lerp(ax, tailX, 0.64 + bendFlex * 0.4);
        const cy = THREE.MathUtils.lerp(ay, tailY, 0.08 + Math.max(0, bendFlex));

        const corePos = coreGeo.attributes.position as THREE.BufferAttribute;
        const midPos = midGeo.attributes.position as THREE.BufferAttribute;
        const haloPos = haloGeo.attributes.position as THREE.BufferAttribute;
        const curtainPos = curtainGeo.attributes.position as THREE.BufferAttribute;

        const strokeScale = Math.max(0.68, ps);
        const coreHalfW = (isNarrow ? 0.028 : 0.034) * strokeScale;
        const midHalfW = (isNarrow ? 0.068 : 0.082) * strokeScale;
        const haloHalfW = (isNarrow ? 0.155 : 0.185) * strokeScale;
        const waveAmp = (ph === 'flying' ? 0.032 : 0.015) * strokeScale;

        for (let i = 0; i <= stringSegs; i++) {
          const u = i / stringSegs;
          const inv = 1 - u;

          // Quadratic Bezier curve from bottom-left origin (ax, ay) to helicopter tail (tailX, tailY)
          const bx = inv * inv * ax + 2 * inv * u * cx + u * u * tailX;
          const by = inv * inv * ay + 2 * inv * u * cy + u * u * tailY;
          const bz = u * tailZ;

          // Subtle aerodynamic breeze shimmer pinned strictly to 0 at origin & tail hitch
          const env = Math.sin(u * Math.PI);
          const flutter = Math.sin(u * Math.PI * 3.0 - t * 6.5) * waveAmp * env;

          const px = bx;
          const py = Math.max(ay, by + flutter);

          // Analytical Bezier tangent for crisp uniform anti-aliased stroke thickness
          const dtx = 2 * inv * (cx - ax) + 2 * u * (tailX - cx);
          const dty = 2 * inv * (cy - ay) + 2 * u * (tailY - cy);
          const len = Math.hypot(dtx, dty) || 1;
          const nx = -dty / len;
          const ny = dtx / len;

          corePos.setXYZ(i * 2, px + nx * coreHalfW, py + ny * coreHalfW, bz + 0.03);
          corePos.setXYZ(i * 2 + 1, px - nx * coreHalfW, py - ny * coreHalfW, bz + 0.03);

          midPos.setXYZ(i * 2, px + nx * midHalfW, py + ny * midHalfW, bz + 0.018);
          midPos.setXYZ(i * 2 + 1, px - nx * midHalfW, py - ny * midHalfW, bz + 0.018);

          haloPos.setXYZ(i * 2, px + nx * haloHalfW, py + ny * haloHalfW, bz + 0.005);
          haloPos.setXYZ(i * 2 + 1, px - nx * haloHalfW, py - ny * haloHalfW, bz + 0.005);

          // Curtain stretches cleanly from curve (px, py) straight down to bottom baseline (px, ay)
          curtainPos.setXYZ(i * 2, px, py, bz - 0.02);
          curtainPos.setXYZ(i * 2 + 1, px, ay, bz - 0.02);
        }

        corePos.needsUpdate = true;
        midPos.needsUpdate = true;
        haloPos.needsUpdate = true;
        curtainPos.needsUpdate = true;

        coreMat.opacity = 0.98 * stringOpacity;
        midMat.opacity = 0.92 * stringOpacity;
        haloMat.opacity = 0.38 * stringOpacity;
        curtainMat.opacity = (0.85 + climbNorm * 0.15) * stringOpacity;
      }

      // Stable Camera Framing aligned to z=0 flight graph (keeps 8%/85% anchor & 76%/29% cruise locked in frame)
      if (Math.abs(camera.fov - viewMetrics.baseFov) > 0.05) {
        camera.fov = THREE.MathUtils.damp(camera.fov, viewMetrics.baseFov, 4, delta);
        camera.updateProjectionMatrix();
      }
      const tremor = ph === 'flying' ? climbNorm * 0.018 * ps : 0;
      _lookAtPos.set(0, 0, 0);
      camera.position.x = THREE.MathUtils.damp(camera.position.x, 0, 5, delta);
      camera.position.y =
        THREE.MathUtils.damp(camera.position.y, 0, 5, delta) + Math.sin(t * 24) * tremor;
      camera.position.z = THREE.MathUtils.damp(camera.position.z, viewMetrics.safeDist, 5, delta);
      camera.lookAt(_lookAtPos);

      // Subtle underglow tracks helicopter
      underGlow.position.set(heliPos.x, heliPos.y - 1.2, 2.2);

      // Scroll radar altitude grid & clouds backward to convey thrilling forward climbing speed
      const speedMult =
        ph === 'flying' ? 1.8 + Math.min(4.0, Math.log(Math.max(1, mult)) * 1.45) : 0.45;
      gridLines.position.x = ((gridLines.position.x - delta * 2.1 * speedMult) % 2.2);
      if (ph === 'flying') {
        gridLines.position.y = ((gridLines.position.y - delta * 0.65 * speedMult) % 1.8);
      }

      for (const c of clouds) {
        c.group.position.x -= delta * c.speed * speedMult;
        if (c.group.position.x < -36) {
          c.group.position.x = 46 + Math.random() * 14;
          c.group.position.y = c.baseY + (Math.random() - 0.5) * 1.8;
        }
      }

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
      skyTex.dispose();
      smokeTex.dispose();
      rotorBlurTex.dispose();
      curtainGradTex.dispose();
      scene.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh || (obj as THREE.LineSegments).isLineSegments) {
          const m = obj as THREE.Mesh;
          m.geometry?.dispose();
          if (Array.isArray(m.material)) m.material.forEach((mt) => mt.dispose());
          else m.material?.dispose();
        } else if ((obj as THREE.Sprite).isSprite) {
          (obj as THREE.Sprite).material?.dispose();
        }
      });
      renderer.dispose();
    };
  }, [graphicsQuality]);

  if (webglFailed) {
    const prog = phase === 'flying' ? 1 - Math.exp(-Math.log(Math.max(1, multiplier)) * 1.75) : 0;
    const endX = 16 + Math.pow(prog, 0.78) * 59;
    const endY = 82 - Math.pow(prog, 1.62) * 54;
    const ctrlX = 16 + (endX - 16) * 0.64;
    const ctrlY = 82 - (82 - endY) * 0.08;
    return (
      <div className="relative w-full h-full flex items-center justify-center bg-[#090710] overflow-hidden">
        <img
          src={GENERATED_ASSETS.aviatorPreview}
          alt="Aviator 3D Helicopter Flight"
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover opacity-35"
        />
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full">
          <defs>
            <linearGradient id="aviatorFillFallback" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ff294a" stopOpacity="0.5" />
              <stop offset="100%" stopColor="#ff294a" stopOpacity="0" />
            </linearGradient>
          </defs>
          <line x1="16" y1="82" x2="96" y2="82" stroke="rgba(246,220,147,0.24)" strokeWidth="0.35" />
          <line x1="16" y1="10" x2="16" y2="82" stroke="rgba(246,220,147,0.24)" strokeWidth="0.35" />
          {phase === 'flying' && (
            <>
              <path
                d={`M 16 82 Q ${ctrlX} ${ctrlY} ${endX} ${endY} L ${endX} 82 Z`}
                fill="url(#aviatorFillFallback)"
              />
              <path
                d={`M 16 82 Q ${ctrlX} ${ctrlY} ${endX} ${endY}`}
                fill="none"
                stroke="#ff294a"
                strokeWidth="1.2"
                strokeLinecap="round"
              />
              <circle cx={endX} cy={endY} r="1.8" fill="#ffe484" />
            </>
          )}
          <circle cx="16" cy="82" r="1.4" fill="#ffe484" />
        </svg>
      </div>
    );
  }

  return <div ref={containerRef} className="w-full h-full overflow-hidden select-none" />;
};
