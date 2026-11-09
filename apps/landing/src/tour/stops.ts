/**
 * The camera stops of the tour, shared by the page and the 3D island: the
 * hero frame, then one stop per feature, each on a prop along the glowing
 * ribbon of pages that winds across the desk. Pure data, no DOM, no three.
 *
 * Units are metres, Y is up, the desk top is at DESK_TOP. The desk is the
 * real 1.10 m one, and the props sit at their anchors in scene/props.ts.
 */

export type StopId = 'hero' | 'reader' | 'theme' | 'archives' | 'library';

export type Vec3 = readonly [number, number, number];

export interface StopFrame {
  position: Vec3;
  target: Vec3;
  /** Vertical field of view in degrees, framed for a 16:10 window. */
  fov: number;
  /**
   * Slides the look target sideways (metres along the camera's right), so
   * the subject sits clear of the copy: negative puts it right of centre.
   */
  lean?: number;
}

export interface Stop {
  id: StopId;
  /** The prop this stop looks at, by node name. */
  prop: string;
  /** The cover whose colours the page takes while this stop is current. */
  cover: string;
  /** Which side of the window the copy sits on. */
  side: 'left' | 'right';
  frame: StopFrame;
}

export const DESK_TOP = 0.75;

export const STOPS: readonly Stop[] = [
  {
    id: 'hero',
    prop: 'prop_volume_open',
    cover: 'moonlit',
    side: 'left',
    frame: { position: [0.2, 1.72, 1.8], target: [0.05, 0.82, -0.02], fov: 30, lean: -0.3 },
  },
  {
    id: 'reader',
    prop: 'prop_volume_open',
    cover: 'stardust',
    side: 'left',
    frame: { position: [0.01, 1.23, 0.83], target: [-0.24, 0.78, 0.08], fov: 32, lean: -0.12 },
  },
  {
    id: 'theme',
    prop: 'prop_lamp',
    cover: 'akane',
    side: 'right',
    frame: { position: [-0.04, 1.2, 0.85], target: [-0.36, 0.95, -0.1], fov: 32, lean: 0.12 },
  },
  {
    id: 'archives',
    prop: 'prop_shelf',
    cover: 'sumire',
    side: 'left',
    frame: { position: [0.16, 1.08, 0.67], target: [-0.06, 0.9, -0.18], fov: 32, lean: -0.1 },
  },
  {
    id: 'library',
    prop: 'prop_volume_stack',
    cover: 'ember',
    side: 'right',
    frame: { position: [0.13, 1.01, 0.77], target: [0.43, 0.86, 0.05], fov: 32, lean: 0.08 },
  },
];

export const LAST_STOP = STOPS.length - 1;

/** The phone poster's framing: the whole desk, centred, for a portrait window. */
export const PHONE_FRAME: StopFrame = {
  position: [0.04, 1.6, 1.28],
  target: [0.02, 0.8, -0.02],
  fov: 28,
};

/**
 * The ribbon's course across the desk, from the open volume past every prop
 * to the top of the volume stack, where Kirei stands. Heights are above the
 * desk top; x and z match the prop anchors in scene/props.ts.
 */
export const RIBBON_POINTS: readonly Vec3[] = [
  [-0.235, 0.072, 0.1],
  [-0.29, 0.1, 0.03],
  [-0.36, 0.02, -0.03],
  [-0.45, 0.004, -0.05],
  [-0.43, 0.004, -0.09],
  [-0.33, 0.004, -0.08],
  [-0.2, 0.004, -0.06],
  [-0.08, 0.004, -0.04],
  [0.04, 0.004, -0.04],
  [0.15, 0.004, -0.06],
  [0.23, 0.004, -0.01],
  [0.3, 0.004, 0.02],
  [0.35, 0.012, 0.07],
  [0.385, 0.045, 0.06],
  [0.42, 0.054, 0.05],
];
