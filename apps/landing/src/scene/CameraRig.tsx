/**
 * Moves the camera along the ribbon as the page scrolls. Each stop sits on a
 * prop along the ribbon; between stops the camera's target glides along the
 * ribbon itself, so the flight follows the pages from prop to prop and
 * lingers at each stop. At rest the camera breathes a few millimetres and
 * leans after a mouse pointer. Stops are framed for 16:10; a narrower window
 * widens the field of view so the subject stays in frame.
 */
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { MathUtils, Vector3, type CatmullRomCurve3, type PerspectiveCamera } from 'three';
import { clampProgress, nearestStop, smoothstep } from '../tour/progress';
import type { StopFrame } from '../tour/stops';
import { nearestU } from './ribbonPath';

const DESIGN_ASPECT = 16 / 10;
const BREATH = { amount: 0.0035, look: 0.0025, speed: 0.33 };
const LEAN = { yaw: 0.035, pitch: 0.02 };
const POINTER_EASE = 2.4;
/** How far the target leaves the stops' framing for the ribbon mid flight, 0 to 1. */
const FOLLOW_RIBBON = 0.75;
/** How much the camera rises mid flight, in metres, to look down on the ribbon. */
const FLIGHT_LIFT = 0.06;

function fitFov(fov: number, aspect: number): number {
  if (aspect >= DESIGN_ASPECT) return fov;
  const half = MathUtils.degToRad(fov / 2);
  return MathUtils.radToDeg(2 * Math.atan((Math.tan(half) * DESIGN_ASPECT) / aspect));
}

function usePointer(enabled: boolean) {
  const pointer = useMemo(() => ({ x: 0, y: 0, sx: 0, sy: 0 }), []);
  useEffect(() => {
    if (!enabled) return;
    const move = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      pointer.x = (e.clientX / innerWidth) * 2 - 1;
      pointer.y = (e.clientY / innerHeight) * 2 - 1;
    };
    const leave = () => {
      pointer.x = 0;
      pointer.y = 0;
    };
    addEventListener('pointermove', move, { passive: true });
    document.documentElement.addEventListener('pointerleave', leave);
    return () => {
      removeEventListener('pointermove', move);
      document.documentElement.removeEventListener('pointerleave', leave);
    };
  }, [enabled, pointer]);
  return pointer;
}

export interface CameraRigProps {
  frames: readonly StopFrame[];
  ribbon: CatmullRomCurve3;
  progress: React.RefObject<number>;
  /** Written every frame: the ribbon parameter the camera has reached. */
  head: React.RefObject<number>;
  /** Poster capture: the nearest stop's exact framing, no breath, no pointer. */
  still: boolean;
  /** Holds this framing instead of following the scroll. */
  fixed?: StopFrame;
}

export function CameraRig({ frames, ribbon, progress, head, still, fixed }: CameraRigProps) {
  const camera = useThree(s => s.camera) as PerspectiveCamera;
  // Where each stop sits on the ribbon; the hero starts at the ribbon's source.
  const stopU = useMemo(
    () => frames.map((f, i) => (i === 0 ? 0 : nearestU(ribbon, new Vector3(...f.target)))),
    [frames, ribbon]
  );
  const v = useMemo(
    () => ({
      pos: new Vector3(),
      look: new Vector3(),
      a: new Vector3(),
      b: new Vector3(),
      offset: new Vector3(),
      onRibbon: new Vector3(),
      side: new Vector3(),
      lift: new Vector3(),
    }),
    []
  );
  const pointer = usePointer(!still);

  useFrame((state, delta) => {
    const { pos, look, a, b, offset, onRibbon, side, lift } = v;
    const last = frames.length - 1;
    let fov: number;
    let lean: number;
    if (fixed || still || last < 1) {
      const i = nearestStop(progress.current, last);
      const frame = fixed ?? frames[i] ?? frames[0];
      pos.set(...frame.position);
      look.set(...frame.target);
      fov = frame.fov;
      lean = frame.lean ?? 0;
      head.current = fixed ? 1 : (stopU[i] ?? 0);
    } else {
      const at = clampProgress(progress.current, last);
      const i = Math.min(last - 1, Math.floor(at));
      const f = at - i;
      const e = smoothstep(f, 0, 1);
      const from = frames[i];
      const to = frames[i + 1];
      // The stops' own framings, blended.
      a.set(...from.target);
      b.set(...to.target);
      look.lerpVectors(a, b, e);
      a.set(...from.position).sub(offset.set(...from.target));
      b.set(...to.position).sub(offset.set(...to.target));
      offset.lerpVectors(a, b, e);
      // Mid flight the target slides onto the ribbon and follows it.
      const u = MathUtils.lerp(stopU[i] ?? 0, stopU[i + 1] ?? 1, e);
      ribbon.getPointAt(Math.min(1, Math.max(0, u)), onRibbon);
      const away = Math.sin(Math.PI * f);
      look.lerp(onRibbon, away * FOLLOW_RIBBON);
      pos.copy(look).add(offset);
      pos.y += away * FLIGHT_LIFT;
      fov = MathUtils.lerp(from.fov, to.fov, e);
      lean = MathUtils.lerp(from.lean ?? 0, to.lean ?? 0, e);
      head.current = u;
    }

    if (!still) {
      const t = state.clock.elapsedTime * BREATH.speed;
      pos.x += (Math.sin(t) + 0.5 * Math.sin(t * 2.3 + 1)) * BREATH.amount;
      pos.y += (Math.sin(t * 1.3 + 2) + 0.4 * Math.sin(t * 3.1)) * BREATH.amount * 0.6;
      pos.z += Math.sin(t * 0.7 + 4) * BREATH.amount;
      look.x += Math.sin(t * 0.9 + 3) * BREATH.look;
      look.y += Math.sin(t * 1.1 + 5) * BREATH.look * 0.6;

      const ease = 1 - Math.exp(-POINTER_EASE * Math.min(delta, 0.05));
      pointer.sx += (pointer.x - pointer.sx) * ease;
      pointer.sy += (pointer.y - pointer.sy) * ease;
    }

    // Lean and pointer both move along the camera's right and up.
    const distance = pos.distanceTo(look);
    side.subVectors(look, pos).cross(camera.up).normalize();
    lift.subVectors(look, pos).cross(side).normalize().negate();
    look.addScaledVector(side, lean);
    pos.addScaledVector(side, lean);
    if (!still) {
      pos.addScaledVector(side, pointer.sx * LEAN.yaw * distance);
      pos.addScaledVector(lift, -pointer.sy * LEAN.pitch * distance);
    }

    camera.position.copy(pos);
    camera.fov = fitFov(fov, state.size.width / Math.max(1, state.size.height));
    camera.lookAt(look);
    camera.updateProjectionMatrix();
  });
  return null;
}
