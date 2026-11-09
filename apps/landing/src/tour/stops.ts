/**
 * The camera stops of the tour, shared by the page and the 3D island: the
 * hero frame, then one stop per feature, each on a prop along the glowing
 * ribbon of pages that winds across the desk. Pure data, no DOM, no three.
 *
 * Units are metres, Y is up, the desk top is at DESK_TOP. A stop's framing
 * here is the default; /3d/scene.glb can move it with empties named
 * `stop_<id>_cam` (camera position) and `stop_<id>_look` (look target).
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
    frame: { position: [0.1, 1.64, 1.56], target: [0.04, 0.8, -0.06], fov: 34, lean: -0.4 },
  },
  {
    id: 'reader',
    prop: 'prop_volume_open',
    cover: 'stardust',
    side: 'left',
    frame: { position: [0.2, 1.2, 0.86], target: [-0.06, 0.78, 0.2], fov: 32, lean: -0.16 },
  },
  {
    id: 'theme',
    prop: 'prop_lamp',
    cover: 'akane',
    side: 'right',
    frame: { position: [-0.12, 1.2, 0.66], target: [-0.56, 0.98, -0.2], fov: 32, lean: 0.16 },
  },
  {
    id: 'archives',
    prop: 'prop_shelf',
    cover: 'sumire',
    side: 'left',
    frame: { position: [0.08, 1.02, 0.36], target: [-0.2, 0.88, -0.3], fov: 32, lean: -0.12 },
  },
  {
    id: 'library',
    prop: 'prop_volume_stack',
    cover: 'ember',
    side: 'right',
    frame: { position: [0.2, 1.12, 0.62], target: [0.62, 0.92, -0.12], fov: 32, lean: 0.14 },
  },
];

export const LAST_STOP = STOPS.length - 1;

/** The phone poster's framing: the whole desk, centred, for a portrait window. */
export const PHONE_FRAME: StopFrame = {
  position: [0.05, 1.9, 1.62],
  target: [0.03, 0.9, -0.04],
  fov: 27,
};

/**
 * The ribbon's default course across the desk, from the open volume past
 * every prop to the top of the volume stack. Heights are above the desk top.
 * /3d/scene.glb can replace it with empties named `ribbon_00`, `ribbon_01`...
 */
export const RIBBON_POINTS: readonly Vec3[] = [
  [-0.03, 0.03, 0.24],
  [-0.15, 0.004, 0.13],
  [-0.33, 0.004, 0.19],
  [-0.48, 0.004, 0.08],
  [-0.42, 0.004, -0.04],
  [-0.5, 0.004, -0.15],
  [-0.38, 0.004, -0.21],
  [-0.2, 0.004, -0.15],
  [-0.1, 0.004, -0.03],
  [0.02, 0.004, 0.05],
  [0.16, 0.004, 0.02],
  [0.28, 0.004, -0.02],
  [0.42, 0.004, -0.04],
  [0.53, 0.02, -0.11],
  [0.6, 0.082, -0.12],
];
