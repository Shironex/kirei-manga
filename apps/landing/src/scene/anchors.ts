/**
 * Named nodes in the desk scene (Desk.tsx places them on the props, whether
 * a prop is its file or its blockout), so the camera, the ribbon, the lamp
 * and the mascot find their places the same way. The stop and ribbon nodes
 * are optional overrides; without them the defaults in tour/stops.ts hold.
 */
import { Vector3, type Object3D } from 'three';
import { DESK_TOP, RIBBON_POINTS, STOPS, type StopFrame, type StopId } from '../tour/stops';

export const ANCHORS = {
  /** Where /3d/mascot.glb stands: its origin goes here (top of the volume stack). */
  mascot: 'mascot_anchor',
  /** The lamp's bulb: a warm spot light shines from here... */
  lamp: 'lamp_light',
  /** ...towards here. */
  lampTarget: 'lamp_target',
  /** Per stop: `stop_<id>_cam` is the camera position, `stop_<id>_look` its target. */
  stopCam: (id: StopId) => `stop_${id}_cam`,
  stopLook: (id: StopId) => `stop_${id}_look`,
  /** The ribbon's course: `ribbon_00`, `ribbon_01`... in order. */
  ribbon: (i: number) => `ribbon_${String(i).padStart(2, '0')}`,
} as const;

export interface Anchors {
  frames: StopFrame[];
  ribbon: Vector3[];
  mascot: Vector3 | null;
  lamp: Vector3;
  lampTarget: Vector3;
}

const world = (root: Object3D, name: string): Vector3 | null => {
  const node = root.getObjectByName(name);
  return node ? node.getWorldPosition(new Vector3()) : null;
};

const vec = (v: Vector3): readonly [number, number, number] => [v.x, v.y, v.z];

function readRibbon(root: Object3D): Vector3[] {
  const points: Vector3[] = [];
  for (let i = 0; i < 64; i++) {
    const p = world(root, ANCHORS.ribbon(i));
    if (!p) break;
    points.push(p);
  }
  if (points.length >= 4) return points;
  return RIBBON_POINTS.map(([x, y, z]) => new Vector3(x, DESK_TOP + y, z));
}

export function readAnchors(root: Object3D): Anchors {
  root.updateMatrixWorld(true);
  const frames = STOPS.map(stop => {
    const cam = world(root, ANCHORS.stopCam(stop.id));
    const look = world(root, ANCHORS.stopLook(stop.id));
    return {
      ...stop.frame,
      position: cam ? vec(cam) : stop.frame.position,
      target: look ? vec(look) : stop.frame.target,
    };
  });
  return {
    frames,
    ribbon: readRibbon(root),
    mascot: world(root, ANCHORS.mascot),
    lamp: world(root, ANCHORS.lamp) ?? new Vector3(-0.3, DESK_TOP + 0.3, -0.1),
    lampTarget: world(root, ANCHORS.lampTarget) ?? new Vector3(-0.24, DESK_TOP, 0.1),
  };
}
