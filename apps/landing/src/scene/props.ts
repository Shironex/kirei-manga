/**
 * The desk set: one web-ready file per prop under /3d/props, in metres, with
 * the origin at the bottom centre and the front towards +Z. Each prop sits at
 * its anchor here; while its file is missing or fails, the procedural
 * blockout in Desk.tsx stands in for that prop alone.
 *
 * The desk is 1.10 m by 0.56 m. Its model is lifted so its top sits at
 * DESK_TOP, so x and z below are positions on the desk top.
 */
export type PropName =
  'volume_open' | 'tea' | 'lamp' | 'shelf' | 'tablet' | 'bookend' | 'volume_stack';

export interface PropSpec {
  name: PropName;
  x: number;
  z: number;
  /** Turn about Y, in radians. */
  yaw: number;
  /** Scales the blockout to roughly the real prop's size. */
  blockout: number;
}

export const PROPS: readonly PropSpec[] = [
  { name: 'volume_open', x: -0.24, z: 0.1, yaw: 0.12, blockout: 1.05 },
  { name: 'tea', x: 0.04, z: 0.12, yaw: 0.4, blockout: 1 },
  { name: 'lamp', x: -0.4, z: -0.13, yaw: -0.3, blockout: 0.9 },
  { name: 'shelf', x: -0.06, z: -0.18, yaw: 0.04, blockout: 0.78 },
  { name: 'tablet', x: 0.18, z: -0.17, yaw: -0.14, blockout: 0.95 },
  { name: 'bookend', x: 0.31, z: -0.11, yaw: -0.22, blockout: 1.2 },
  { name: 'volume_stack', x: 0.43, z: 0.05, yaw: -0.25, blockout: 0.87 },
];

/** The file for a prop, or the desk itself. */
export const propFile = (name: PropName | 'desk') => `/3d/props/${name}.glb`;

/**
 * Which files are in public/3d/props at build time (set in astro.config.mjs),
 * so a missing one never costs a failed request.
 */
export const PROP_FILES = new Set(import.meta.env.PROP_FILES.split(',').filter(Boolean));

/** The bulb under the real lamp's shade, in the lamp's own space (the shade reaches to +X). */
export const LAMP_BULB: readonly [number, number, number] = [0.105, 0.3, 0];
