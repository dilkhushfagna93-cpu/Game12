import * as THREE from 'three';
import type { GraphicsQuality } from '../types';

export interface GraphicsPreset {
  quality: GraphicsQuality;
  pixelRatio: number;
  shadows: boolean;
  shadowMapSize: number;
  antialias: boolean;
  particleCount: number;
  cloudCount: number;
}

let cachedSoftwareGl: boolean | null = null;

export function detectSoftwareWebGL(): boolean {
  if (cachedSoftwareGl !== null) return cachedSoftwareGl;
  if (typeof document === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) {
      cachedSoftwareGl = true;
      return true;
    }
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    cachedSoftwareGl = /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    return cachedSoftwareGl;
  } catch {
    cachedSoftwareGl = true;
    return true;
  }
}

export function detectDefaultGraphicsQuality(): GraphicsQuality {
  return 'ultra';
}

export function getGraphicsPreset(_quality: GraphicsQuality = 'ultra'): GraphicsPreset {
  const isSoft = detectSoftwareWebGL();
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;

  if (isSoft) {
    // Software WebGL fallback preserves full Ultra scene content while keeping software rendering responsive
    return {
      quality: 'ultra',
      pixelRatio: 1,
      shadows: false,
      shadowMapSize: 1024,
      antialias: false,
      particleCount: 140,
      cloudCount: 22,
    };
  }

  return {
    quality: 'ultra',
    pixelRatio: Math.min(dpr, 2.0),
    shadows: true,
    shadowMapSize: 2048,
    antialias: true,
    particleCount: 140,
    cloudCount: 22,
  };
}

export function scheduleNextFrame(
  renderer: THREE.WebGLRenderer,
  isSoftwareGl: boolean,
  tick: () => void,
  setHandle: (id: number, isTimeout: boolean) => void,
) {
  if (!isSoftwareGl) {
    const id = window.requestAnimationFrame(tick);
    setHandle(id, false);
    return;
  }
  const gl = renderer.getContext() as WebGL2RenderingContext;
  if (!gl || typeof gl.fenceSync !== 'function') {
    const id = window.setTimeout(tick, 90);
    setHandle(id, true);
    return;
  }
  const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
  gl.flush();
  const poll = () => {
    const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
    if (state === gl.UNSIGNALED) {
      const id = window.setTimeout(poll, 5);
      setHandle(id, true);
    } else {
      if (sync) gl.deleteSync(sync);
      const id = window.setTimeout(tick, 80);
      setHandle(id, true);
    }
  };
  const id = window.setTimeout(poll, 5);
  setHandle(id, true);
}
