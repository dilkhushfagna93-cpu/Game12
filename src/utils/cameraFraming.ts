import * as THREE from 'three';

export type ViewportTier = 'mobile' | 'tablet' | 'desktop';

export function getViewportTier(width: number): ViewportTier {
  if (width < 640) return 'mobile';
  if (width < 1024) return 'tablet';
  return 'desktop';
}

/**
 * Computes a gentle responsive vertical FOV that widens slightly on narrow
 * portrait viewports so wide 3D subjects do not require extreme pullback
 * while avoiding fisheye distortion.
 */
export function computeResponsiveFov(
  aspect: number,
  desktopFov = 44,
  maxPortraitFov = 54,
): number {
  const safeAspect = Math.max(0.35, aspect);
  if (safeAspect >= 1.1) return desktopFov;
  const t = THREE.MathUtils.clamp((1.1 - safeAspect) / 0.6, 0, 1);
  return THREE.MathUtils.lerp(desktopFov, maxPortraitFov, t);
}

/**
 * Computes the minimum camera distance needed so an axis-aligned 3D bounding
 * box of (width x height x depth) fits completely inside both the horizontal
 * and vertical frustum of a PerspectiveCamera with a comfortable safety margin.
 */
export function computeSafeDistance(
  boundsWidth: number,
  boundsHeight: number,
  boundsDepth: number,
  aspect: number,
  vFovDeg: number,
  margin = 1.18,
): number {
  const safeAspect = Math.max(0.35, aspect);
  const halfVFov = THREE.MathUtils.degToRad(vFovDeg * 0.5);
  const tanV = Math.tan(halfVFov);
  const tanH = tanV * safeAspect;

  const distV = (boundsHeight * 0.5 * margin) / tanV;
  const distH = (boundsWidth * 0.5 * margin) / tanH;
  return Math.max(distV, distH) + boundsDepth * 0.5;
}

/**
 * Computes the exact camera height for a near-top-down square board so the
 * board fills `fillRatio` (e.g. 0.95 = 95%) of the limiting viewport axis
 * without wasted dark margins on mobile or desktop.
 */
export function computeTopDownBoardDistance(
  boardExtent: number,
  aspect: number,
  vFovDeg: number,
  fillRatio = 0.95,
  tiltZFactor = 0.14,
): number {
  const safeAspect = Math.max(0.45, aspect);
  const clampedFill = THREE.MathUtils.clamp(fillRatio, 0.72, 0.985);
  const halfVFov = THREE.MathUtils.degToRad(vFovDeg * 0.5);
  const tanV = Math.tan(halfVFov);
  const tanH = tanV * safeAspect;

  // Perspective foreshortening compensation when slightly tilted
  const tiltComp = 1 + tiltZFactor * 0.18;
  const distV = (boardExtent * 0.5 * tiltComp) / (tanV * clampedFill);
  const distH = (boardExtent * 0.5 * tiltComp) / (tanH * clampedFill);
  return Math.max(distV, distH);
}

/**
 * Computes tight camera distance for side-by-side 3D showcase subjects
 * (such as the Dragon Tiger dual playing card battle stage).
 */
export function computeStageCardDistance(
  spanWidth: number,
  spanHeight: number,
  aspect: number,
  vFovDeg: number,
  fillRatio = 0.9,
): number {
  const safeAspect = Math.max(0.5, aspect);
  const halfVFov = THREE.MathUtils.degToRad(vFovDeg * 0.5);
  const tanV = Math.tan(halfVFov);
  const tanH = tanV * safeAspect;
  const distV = (spanHeight * 0.5) / (tanV * fillRatio);
  const distH = (spanWidth * 0.5) / (tanH * fillRatio);
  return Math.max(distV, distH);
}

/**
 * Applies full-container responsive sizing to a WebGLRenderer canvas without
 * allowing the canvas to overflow its container or distort aspect ratio.
 */
export function syncRendererToContainer(
  renderer: THREE.WebGLRenderer,
  container: HTMLElement,
  maxPixelRatio: number,
): { width: number; height: number; aspect: number } {
  const rect = container.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width || container.clientWidth || 360));
  const height = Math.max(1, Math.round(rect.height || container.clientHeight || 260));
  const dpr = Math.min(window.devicePixelRatio || 1, maxPixelRatio);

  if (renderer.getPixelRatio() !== dpr) {
    renderer.setPixelRatio(dpr);
  }
  renderer.setSize(width, height, false);
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  renderer.domElement.style.display = 'block';

  return { width, height, aspect: width / height };
}

/**
 * Attaches ResizeObserver + window resize + orientationchange listeners to keep
 * any Three.js container synchronized across mobile browser chrome changes.
 */
export function observeContainerResize(
  container: HTMLElement,
  onResize: () => void,
): () => void {
  let rafPending = false;
  const schedule = () => {
    if (rafPending) return;
    rafPending = true;
    window.requestAnimationFrame(() => {
      rafPending = false;
      onResize();
    });
  };

  let observer: ResizeObserver | null = null;
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(schedule);
    observer.observe(container);
  }
  window.addEventListener('resize', schedule, { passive: true });
  window.addEventListener('orientationchange', schedule, { passive: true });

  return () => {
    observer?.disconnect();
    window.removeEventListener('resize', schedule);
    window.removeEventListener('orientationchange', schedule);
  };
}
