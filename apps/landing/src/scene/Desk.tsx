/**
 * The desk and its props. Every prop is a node named `prop_<name>` placed at
 * its anchor from props.ts. It starts as a crude procedural blockout (primitives
 * and painted canvases) and is swapped for its file from /3d/props when that
 * loads; a prop whose file is missing or fails keeps its blockout. The tablet
 * shows a painted manga page, the volume stack wears the painted covers, and
 * Kirei stands on the stack (a flat cut-out until /3d/mascot.glb exists).
 */
import { use, useEffect, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import {
  Box3,
  BoxGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  LatheGeometry,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  QuadraticBezierCurve3,
  Quaternion,
  SphereGeometry,
  SRGBColorSpace,
  TextureLoader,
  TorusGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
  type Material,
  type Texture,
} from 'three';
import { oklchToHex as ok } from '../lib/color';
import { COVERS } from '../lib/covers';
import { DESK_TOP } from '../tour/stops';
import { ANCHORS } from './anchors';
import { disposeObject } from './gltf';
import { shadows, type Loaders } from './Models';
import { loadCoverFonts, paintCover, paintMangaPage, paintPages, paintSpine } from './paint';
import { LAMP_BULB, PROP_FILES, PROPS, propFile, type PropName } from './props';

/** A tankobon volume, in metres. */
const W = 0.128;
const H = 0.182;
const D = 0.022;
const UP = new Vector3(0, 1, 0);

/** Lying flat with the spine towards +x: x to -z, y to -x... see makeBasis below. */
const LYING = new Quaternion().setFromRotationMatrix(
  new Matrix4().makeBasis(new Vector3(0, 0, -1), new Vector3(-1, 0, 0), new Vector3(0, 1, 0))
);

const SHELF_SPINES = [
  ...COVERS.map(c => ({ jp: c.jp, hue: c.hue, chroma: c.chroma })),
  { jp: '氷の庭', hue: 232, chroma: 0.09 },
  { jp: '祭囃子', hue: 22, chroma: 0.14 },
  { jp: '紙飛行機', hue: 300, chroma: 0.1 },
];

/** The covers the real volume stack wears, bottom to top (`cover_1` to `cover_3`). */
const STACK_COVERS = ['stardust', 'akane', 'moonlit'];

interface Kit {
  textures: Texture[];
  spines: Texture[];
  pages: Texture;
  manga: Texture[];
  /** Covers for the real stack, and a page for the real tablet (glTF UVs: no flip). */
  covers: Texture[];
  screen: Texture;
  /** The flat Kirei cut-out, only while /3d/mascot.glb is missing. */
  kirei: Texture | null;
}

async function buildKit(anisotropy: number, standIn: boolean): Promise<Kit> {
  const kirei = standIn ? new TextureLoader().loadAsync('/3d/kirei-standin.webp') : null;
  await loadCoverFonts();
  const textures: Texture[] = [];
  const tex = (source: HTMLCanvasElement, options: { spine?: boolean; gltf?: boolean } = {}) => {
    const t = new CanvasTexture(source);
    t.colorSpace = SRGBColorSpace;
    t.anisotropy = Math.min(8, anisotropy);
    if (options.spine) {
      t.center.set(0.5, 0.5);
      t.rotation = Math.PI / 2;
    }
    if (options.gltf) t.flipY = false;
    textures.push(t);
    return t;
  };
  const kireiTexture = kirei ? await kirei : null;
  if (kireiTexture) {
    kireiTexture.colorSpace = SRGBColorSpace;
    textures.push(kireiTexture);
  }
  return {
    textures,
    spines: SHELF_SPINES.map((s, i) =>
      tex(paintSpine(s.jp, (i % 7) + 1, s.hue, s.chroma), { spine: true })
    ),
    pages: tex(paintPages()),
    manga: [tex(paintMangaPage(3)), tex(paintMangaPage(8)), tex(paintMangaPage(5))],
    covers: STACK_COVERS.map(id => tex(paintCover(id), { gltf: true })),
    screen: tex(paintMangaPage(5), { gltf: true }),
    kirei: kireiTexture,
  };
}

const std = (color: string, roughness = 0.6, extra: Partial<MeshStandardMaterial> = {}) =>
  new MeshStandardMaterial({ color: new Color(color), roughness, ...extra });

function cast<T extends Mesh>(mesh: T, castShadow = true): T {
  mesh.castShadow = castShadow;
  mesh.receiveShadow = true;
  return mesh;
}

interface Slot {
  /** The prop's node, at its anchor on the desk top. */
  node: Group;
  /** The blockout inside it, swapped out when the file loads. */
  block: Group;
}

function slot(root: Group, name: PropName | 'desk'): Slot {
  const spec = PROPS.find(p => p.name === name);
  const node = new Group();
  node.name = name === 'desk' ? 'desk' : `prop_${name}`;
  if (spec) {
    node.position.set(spec.x, DESK_TOP, spec.z);
    node.rotation.y = spec.yaw;
  }
  const block = new Group();
  block.name = `${node.name}_blockout`;
  if (spec) block.scale.setScalar(spec.blockout);
  node.add(block);
  root.add(node);
  return { node, block };
}

interface Built {
  root: Group;
  slots: Record<PropName | 'desk', Slot>;
  kirei: Mesh | null;
  /** Where Kirei stands on the blockout stack, in the stack's own space. */
  blockStandY: number;
  /** The blockout lamp's bulb, in the lamp's own space. */
  blockBulb: Vector3;
}

function buildDesk(kit: Kit): Built {
  const root = new Group();
  root.name = 'desk_scene';
  const book = new BoxGeometry(W, H, D);
  const pagesMat = new MeshStandardMaterial({ map: kit.pages, roughness: 0.9 });
  const brass = std(ok(0.72, 0.1, 80), 0.32, { metalness: 0.85 });
  const darkMetal = std(ok(0.22, 0.01, 290), 0.35, { metalness: 0.7 });

  /** Box faces: +x fore edge, -x spine, +y top, -y bottom, +z front, -z back. */
  const volume = (spine: Texture | null, hue: number, chroma: number) => {
    const board = std(ok(0.42, chroma, hue), 0.45);
    const mats: Material[] = [
      pagesMat,
      spine ? new MeshStandardMaterial({ map: spine, roughness: 0.5 }) : board,
      pagesMat,
      pagesMat,
      board,
      board,
    ];
    return cast(new Mesh(book, mats));
  };

  // The desk: a black slab with a soft gloss, the real desk's size.
  const desk = slot(root, 'desk');
  const top = cast(
    new Mesh(
      new BoxGeometry(1.1, 0.04, 0.56),
      new MeshPhysicalMaterial({
        color: new Color('#050408'),
        roughness: 0.5,
        clearcoat: 0.5,
        clearcoatRoughness: 0.2,
      })
    ),
    false
  );
  top.position.set(0, DESK_TOP - 0.02, 0);
  desk.block.add(top);

  // Open volume, the ribbon's source.
  const open = slot(root, 'volume_open');
  [-1, 1].forEach((side, i) => {
    const half = new Group();
    const block = cast(
      new Mesh(new BoxGeometry(W, 0.012, H), [
        pagesMat,
        pagesMat,
        new MeshStandardMaterial({ map: kit.manga[i], roughness: 0.85 }),
        std(ok(0.38, 0.14, 300), 0.45),
        pagesMat,
        pagesMat,
      ])
    );
    block.position.set((side * W) / 2, 0.006, 0);
    half.add(block);
    half.rotation.z = side * -0.09;
    open.block.add(half);
  });

  // Tea cup and saucer.
  const tea = slot(root, 'tea').block;
  const china = std(ok(0.94, 0.01, 80), 0.25);
  const saucer = cast(new Mesh(new CylinderGeometry(0.075, 0.06, 0.012, 40), china));
  saucer.position.y = 0.006;
  tea.add(saucer);
  const cupShape = [
    new Vector2(0.0, 0),
    new Vector2(0.03, 0),
    new Vector2(0.045, 0.02),
    new Vector2(0.05, 0.055),
    new Vector2(0.047, 0.055),
    new Vector2(0.042, 0.022),
    new Vector2(0.0, 0.006),
  ];
  const cup = cast(new Mesh(new LatheGeometry(cupShape, 40), china));
  cup.position.y = 0.012;
  tea.add(cup);
  const handle = cast(new Mesh(new TorusGeometry(0.016, 0.004, 8, 20, Math.PI * 1.3), china));
  handle.position.set(0.052, 0.045, 0);
  handle.rotation.z = -Math.PI * 0.65;
  tea.add(handle);
  const liquid = new Mesh(new CylinderGeometry(0.044, 0.044, 0.002, 32), std('#7a3b12', 0.15));
  liquid.position.y = 0.058;
  tea.add(liquid);
  const rim = new Mesh(new TorusGeometry(0.049, 0.0015, 6, 40), brass);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.067;
  tea.add(rim);

  // Desk lamp: brass base, a curved arm and a dark dome shade.
  const lamp = slot(root, 'lamp').block;
  const base = cast(new Mesh(new CylinderGeometry(0.075, 0.085, 0.022, 40), brass));
  base.position.y = 0.011;
  lamp.add(base);
  const arm = new QuadraticBezierCurve3(
    new Vector3(0, 0.02, 0),
    new Vector3(-0.02, 0.46, 0),
    new Vector3(0.16, 0.4, 0)
  );
  lamp.add(cast(new Mesh(new TubeGeometry(arm, 40, 0.0065, 10), brass)));
  const shade = cast(
    new Mesh(
      new SphereGeometry(0.07, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2),
      std(ok(0.25, 0.01, 290), 0.4, { metalness: 0.5, side: DoubleSide })
    )
  );
  shade.position.set(0.18, 0.39, 0);
  shade.rotation.z = -0.5;
  lamp.add(shade);
  const bulb = new Mesh(
    new SphereGeometry(0.02, 16, 12),
    new MeshBasicMaterial({ color: '#fff0c8' })
  );
  bulb.position.set(0.19, 0.365, 0);
  lamp.add(bulb);
  const blockBulb = bulb.position.clone().multiplyScalar(lamp.scale.x);

  // Small shelf of volumes, spines out.
  const shelf = slot(root, 'shelf').block;
  const wood = std(ok(0.24, 0.03, 40), 0.55);
  const frame = (w: number, h: number, d: number, x: number, y: number, z = 0) => {
    const m = cast(new Mesh(new BoxGeometry(w, h, d), wood));
    m.position.set(x, y, z);
    shelf.add(m);
  };
  frame(0.02, 0.42, 0.15, -0.17, 0.21);
  frame(0.02, 0.42, 0.15, 0.17, 0.21);
  frame(0.36, 0.015, 0.15, 0, 0.0075);
  frame(0.36, 0.015, 0.15, 0, 0.21);
  frame(0.36, 0.015, 0.15, 0, 0.415);
  frame(0.36, 0.42, 0.01, 0, 0.21, -0.07);
  [0.015, 0.218].forEach((y, row) => {
    let x = -0.155;
    for (let i = 0; i < 13; i++) {
      const s = SHELF_SPINES[(i + row * 3) % SHELF_SPINES.length];
      const v = volume(kit.spines[(i + row * 3) % SHELF_SPINES.length], s.hue, s.chroma);
      v.quaternion.setFromAxisAngle(UP, Math.PI / 2);
      v.position.set(x + D / 2, y + H / 2, 0.005);
      shelf.add(v);
      x += D + 0.0015;
      if (x > 0.14) break;
    }
  });

  // Tablet on an acrylic stand, showing a page.
  const tablet = slot(root, 'tablet').block;
  const acrylic = new MeshPhysicalMaterial({
    color: new Color('#d8d2ff'),
    roughness: 0.1,
    transmission: 0,
    transparent: true,
    opacity: 0.35,
  });
  const foot = cast(new Mesh(new BoxGeometry(0.14, 0.008, 0.1), acrylic), false);
  foot.position.set(0, 0.004, 0.01);
  tablet.add(foot);
  const body = new Group();
  body.position.set(0, 0.012, 0);
  body.rotation.x = -0.32;
  const slab = cast(new Mesh(new BoxGeometry(0.15, 0.21, 0.008), darkMetal));
  slab.position.y = 0.105;
  body.add(slab);
  const screen = new Mesh(
    new PlaneGeometry(0.135, 0.19),
    new MeshBasicMaterial({ map: kit.manga[2], color: new Color('#e8e4f0') })
  );
  screen.position.set(0, 0.105, 0.0042);
  body.add(screen);
  tablet.add(body);

  // Brass bookend with an arched upright.
  const bookend = slot(root, 'bookend').block;
  const plate = cast(new Mesh(new BoxGeometry(0.08, 0.006, 0.07), brass));
  plate.position.y = 0.003;
  bookend.add(plate);
  const upright = cast(new Mesh(new BoxGeometry(0.075, 0.09, 0.008), brass));
  upright.position.set(0, 0.05, -0.03);
  bookend.add(upright);
  const arch = cast(
    new Mesh(
      new CylinderGeometry(0.0375, 0.0375, 0.008, 24, 1, false, -Math.PI / 2, Math.PI),
      brass
    )
  );
  arch.rotation.x = Math.PI / 2;
  arch.position.set(0, 0.095, -0.03);
  bookend.add(arch);

  // Volume stack, with Kirei standing on top.
  const stackSlot = slot(root, 'volume_stack');
  const stack = stackSlot.block;
  const BIG = 1.15;
  for (let i = 0; i < 3; i++) {
    const s = COVERS[(i + 4) % COVERS.length];
    const spine = kit.spines[(i + 4) % SHELF_SPINES.length].clone();
    spine.rotation = -Math.PI / 2;
    kit.textures.push(spine);
    const v = volume(spine, s.hue, s.chroma);
    v.scale.setScalar(BIG);
    v.quaternion
      .copy(LYING)
      .multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), Math.sin(i * 2.1) * 0.06));
    v.position.set(0, (D * BIG) / 2 + i * D * BIG, 0);
    stack.add(v);
  }
  const standY = 3 * D * BIG;
  const blockStandY = standY * stack.scale.y;
  let kirei: Mesh | null = null;
  if (kit.kirei) {
    const kireiHeight = 0.18;
    const image = kit.kirei.image as { width?: number; height?: number } | undefined;
    const aspect = image?.width && image.height ? image.width / image.height : 0.64;
    kirei = new Mesh(
      new PlaneGeometry(kireiHeight * aspect, kireiHeight),
      new MeshBasicMaterial({
        map: kit.kirei,
        transparent: true,
        alphaTest: 0.4,
        side: DoubleSide,
        color: new Color('#d9d6e4'),
      })
    );
    kirei.name = 'kirei_standin';
    kirei.position.set(0, blockStandY + kireiHeight / 2, 0);
    stackSlot.node.add(kirei);
  }

  return {
    root,
    slots: {
      desk,
      volume_open: open,
      tea: { node: tea.parent as Group, block: tea },
      lamp: { node: lamp.parent as Group, block: lamp },
      shelf: { node: shelf.parent as Group, block: shelf },
      tablet: { node: tablet.parent as Group, block: tablet },
      bookend: { node: bookend.parent as Group, block: bookend },
      volume_stack: stackSlot,
    },
    kirei,
    blockStandY,
    blockBulb,
  };
}

/** Gives the real files' named parts the painted art: the tablet's page and the stack's covers. */
function dress(name: PropName | 'desk', model: Object3D, kit: Kit) {
  model.traverse(node => {
    const mesh = node as Mesh;
    if (!mesh.isMesh) return;
    const material = mesh.material as Material;
    if (name === 'tablet' && material.name === 'screen') {
      mesh.material = new MeshBasicMaterial({ map: kit.screen, color: new Color('#d9d4e6') });
      mesh.castShadow = false;
    }
    if (name === 'volume_stack') {
      const cover = /^cover_(\d)$/.exec(material.name);
      const covers = kit.covers;
      if (cover)
        mesh.material = new MeshStandardMaterial({
          map: covers[Number(cover[1]) - 1] ?? covers[0],
          roughness: 0.5,
        });
      if (material.name === 'pages')
        mesh.material = new MeshStandardMaterial({
          color: new Color(ok(0.9, 0.02, 85)),
          roughness: 0.9,
        });
    }
    if (name === 'desk') {
      // The minimal black desk: the file's grey pushed towards black, with an
      // even soft gloss. Its compressed normal and roughness maps show their
      // blocks in a glossy highlight, so they go.
      const surface = mesh.material as MeshStandardMaterial;
      surface.color?.multiplyScalar(0.32);
      surface.normalMap = null;
      surface.roughnessMap = null;
      surface.metalnessMap = null;
      surface.metalness = 0;
      surface.roughness = 0.68;
      surface.needsUpdate = true;
      mesh.castShadow = false;
    }
  });
}

/** A warm glow under the real lamp's shade, where the spot light starts. */
function lampGlow(at: Vector3): Group {
  const glow = new Group();
  glow.name = 'lamp_glow';
  const bulb = new Mesh(
    new SphereGeometry(0.014, 16, 12),
    new MeshBasicMaterial({ color: '#fff3d6' })
  );
  const disc = new Mesh(
    new CircleGeometry(0.05, 32),
    new MeshBasicMaterial({
      color: '#ffc77a',
      transparent: true,
      opacity: 0.55,
      side: DoubleSide,
      depthWrite: false,
    })
  );
  disc.rotation.x = Math.PI / 2;
  disc.position.y = 0.012;
  glow.add(bulb, disc);
  glow.position.copy(at);
  return glow;
}

/**
 * Swaps in every prop file that is present, leaving the blockout for any that
 * fail, then places the anchors: the lamp's bulb and target, and Kirei's spot
 * on top of the stack.
 */
async function swapInProps(built: Built, kit: Kit, loaders: Loaders): Promise<Object3D[]> {
  const removed: Object3D[] = [];
  const names = Object.keys(built.slots) as (PropName | 'desk')[];
  /** Each loaded model's height, measured in its own space before it is placed. */
  const loaded = new Map<string, number>();
  await Promise.all(
    names
      .filter(name => PROP_FILES.has(name))
      .map(async name => {
        let model: Object3D;
        try {
          model = (await loaders.gltf.loadAsync(propFile(name))).scene;
        } catch {
          return;
        }
        const { node, block } = built.slots[name];
        shadows(model);
        dress(name, model, kit);
        const height = new Box3().setFromObject(model).max.y;
        // The desk is lifted so its top is the desk top the props stand on.
        if (name === 'desk') model.position.y = DESK_TOP - height;
        node.remove(block);
        removed.push(block);
        node.add(model);
        loaded.set(name, height);
      })
  );

  const { lamp, volume_stack: stack, volume_open: open } = built.slots;
  const bulb = loaded.has('lamp') ? new Vector3(...LAMP_BULB) : built.blockBulb;
  if (loaded.has('lamp')) lamp.node.add(lampGlow(bulb));
  const anchor = (parent: Object3D, name: string, at: Vector3) => {
    const node = new Object3D();
    node.name = name;
    node.position.copy(at);
    parent.add(node);
  };
  anchor(lamp.node, ANCHORS.lamp, bulb);
  anchor(open.node, ANCHORS.lampTarget, new Vector3(0, 0.02, 0));
  const standY = loaded.get('volume_stack') ?? built.blockStandY;
  anchor(stack.node, ANCHORS.mascot, new Vector3(0, standY, 0));
  if (built.kirei) built.kirei.position.y = standY + 0.09;
  return removed;
}

export interface Dressed {
  kit: Kit;
  built: Built;
  /** Blockouts taken out for their files, freed with the rest on unmount. */
  removed: Object3D[];
}

/**
 * Paints the textures, builds the blockout and swaps the prop files in, as one
 * promise. Call it outside the Suspense boundary: a boundary that suspends
 * before it first mounts drops its children's state and would start again.
 */
export function useDeskPromise(loaders: Loaders, standIn: boolean): Promise<Dressed> {
  const gl = useThree(s => s.gl);
  const [dressed] = useState(() =>
    buildKit(gl.capabilities.getMaxAnisotropy(), standIn).then(async kit => {
      const built = buildDesk(kit);
      const removed = await swapInProps(built, kit, loaders);
      return { kit, built, removed };
    })
  );
  useEffect(
    () => () =>
      void dressed.then(d => {
        d.kit.textures.forEach(t => t.dispose());
        disposeObject(d.built.root);
        d.removed.forEach(disposeObject);
      }),
    [dressed]
  );
  return dressed;
}

export function Desk({
  dressed,
  onModel,
}: {
  dressed: Promise<Dressed>;
  onModel: (root: Object3D) => void;
}) {
  const { built } = use(dressed);
  const camera = useThree(s => s.camera);
  useEffect(() => onModel(built.root), [built, onModel]);
  // The cut-out turns about its vertical axis to face the camera.
  useFrame(() => {
    const k = built.kirei;
    if (!k) return;
    const parent = k.parent;
    if (!parent) return;
    const local = parent.worldToLocal(camera.position.clone());
    k.rotation.y = Math.atan2(local.x - k.position.x, local.z - k.position.z);
  });
  return <primitive object={built.root} />;
}
