/**
 * Decides whether this device gets the live 3D or the posters. Free of three
 * and React, so the check costs a few hundred bytes and the scene chunk is
 * only fetched when the answer is yes.
 */

/** Desktop class: a wide window and a fine pointer. Phones keep the posters. */
export const DESKTOP_QUERY = '(min-width: 1024px) and (pointer: fine)';

/**
 * Context attributes the probe and the scene's renderer share. A software
 * renderer still makes a WebGL2 context but draws a few frames a second;
 * with the caveat flag it refuses, and the page keeps its posters.
 */
export const GPU_CONTEXT: WebGLContextAttributes = { failIfMajorPerformanceCaveat: true };

export function hasRealGpu(): boolean {
  try {
    const gl = document.createElement('canvas').getContext('webgl2', GPU_CONTEXT);
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return Boolean(gl);
  } catch {
    return false;
  }
}

interface NavigatorHints {
  deviceMemory?: number;
  connection?: { saveData?: boolean };
}

export interface GateResult {
  live: boolean;
  /** Why the posters were kept, written to data-scene-reason for debugging. */
  reason: string;
}

/** Everything but the GPU probe, which waits for idle time. */
export function gateScene(params: URLSearchParams): GateResult {
  if (params.has('capture')) return { live: true, reason: 'capture' };
  if (params.has('poster')) return { live: false, reason: 'forced' };
  const nav = navigator as Navigator & NavigatorHints;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return { live: false, reason: 'reduced-motion' };
  }
  if (!matchMedia(DESKTOP_QUERY).matches) return { live: false, reason: 'small-screen' };
  if (nav.connection?.saveData) return { live: false, reason: 'save-data' };
  if ((nav.deviceMemory ?? 8) < 4) return { live: false, reason: 'low-memory' };
  if ((navigator.hardwareConcurrency ?? 8) < 4) return { live: false, reason: 'low-cpu' };
  return { live: true, reason: 'ok' };
}
