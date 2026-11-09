/**
 * The procedural stand-in for /3d/scene.glb: a crude blockout of the minimal
 * black desk and its props (open volume, desk lamp, small shelf of volumes,
 * tablet on a stand, tea cup and saucer, bookend, volume stack), built from
 * primitives and painted canvases, with a flat cut-out of Kirei on the stack
 * until /3d/mascot.glb exists. Each prop is a node named `prop_<name>` and
 * the anchors match the real file's, so swapping in the GLB is a file drop.
 */
import { use, useEffect, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import {
  BoxGeometry,
  CanvasTexture,
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
import { loadCoverFonts, paintMangaPage, paintPages, paintSpine } from './paint';

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

interface Kit {
  textures: Texture[];
  spines: Texture[];
  pages: Texture;
  manga: Texture[];
  /** The flat Kirei cut-out, only while /3d/mascot.glb is missing. */
  kirei: Texture | null;
}

async function buildKit(anisotropy: number, standIn: boolean): Promise<Kit> {
  const kirei = standIn ? new TextureLoader().loadAsync('/3d/kirei-standin.webp') : null;
  await loadCoverFonts();
  const textures: Texture[] = [];
  const tex = (source: HTMLCanvasElement, spine = false) => {
    const t = new CanvasTexture(source);
    t.colorSpace = SRGBColorSpace;
    t.anisotropy = Math.min(8, anisotropy);
    if (spine) {
      t.center.set(0.5, 0.5);
      t.rotation = Math.PI / 2;
    }
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
    spines: SHELF_SPINES.map((s, i) => tex(paintSpine(s.jp, (i % 7) + 1, s.hue, s.chroma), true)),
    pages: tex(paintPages()),
    manga: [tex(paintMangaPage(3)), tex(paintMangaPage(8)), tex(paintMangaPage(5))],
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

/** A node for one prop, placed on the desk. */
function prop(root: Group, name: string, x: number, z: number, yaw = 0): Group {
  const g = new Group();
  g.name = name;
  g.position.set(x, DESK_TOP, z);
  g.rotation.y = yaw;
  root.add(g);
  return g;
}

function buildDesk(kit: Kit): { root: Group; kirei: Mesh | null } {
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

  // The desk: a thick black slab with a soft gloss.
  const top = cast(
    new Mesh(
      new BoxGeometry(1.9, 0.05, 1.05),
      new MeshPhysicalMaterial({
        color: new Color('#050408'),
        roughness: 0.5,
        clearcoat: 0.5,
        clearcoatRoughness: 0.2,
      })
    ),
    false
  );
  top.name = 'desk';
  top.position.set(0, DESK_TOP - 0.025, -0.02);
  root.add(top);

  // Open volume, the ribbon's source.
  const open = prop(root, 'prop_volume_open', -0.04, 0.24, 0.18);
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
    open.add(half);
  });

  // Tea cup and saucer.
  const tea = prop(root, 'prop_tea', -0.64, 0.14);
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
  const lamp = prop(root, 'prop_lamp', -0.64, -0.24, 0.5);
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

  // Small shelf of volumes, spines out.
  const shelf = prop(root, 'prop_shelf', -0.22, -0.34);
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
  const tablet = prop(root, 'prop_tablet', 0.17, -0.16, -0.25);
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
  const bookend = prop(root, 'prop_bookend', 0.4, 0.14, -0.4);
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
  const stack = prop(root, 'prop_volume_stack', 0.64, -0.12, -0.35);
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
  const mascotNode = new Object3D();
  mascotNode.name = ANCHORS.mascot;
  mascotNode.position.set(0, standY, 0);
  stack.add(mascotNode);
  let kirei: Mesh | null = null;
  if (kit.kirei) {
    const kireiHeight = 0.2;
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
    kirei.position.set(0, standY + kireiHeight / 2, 0);
    stack.add(kirei);
  }

  // Lamp light anchors, read by the scene for its spot light.
  root.updateMatrixWorld(true);
  const anchor = (name: string, at: Vector3) => {
    const node = new Object3D();
    node.name = name;
    node.position.copy(at);
    root.add(node);
  };
  anchor(ANCHORS.lamp, bulb.getWorldPosition(new Vector3()));
  anchor(ANCHORS.lampTarget, new Vector3(-0.3, DESK_TOP, 0.06));
  return { root, kirei };
}

/** Paints the textures once, then builds the desk from them. */
export function Desk({ onModel, mascot }: { onModel: (root: Object3D) => void; mascot: boolean }) {
  const gl = useThree(s => s.gl);
  const [kit] = useState(() => buildKit(gl.capabilities.getMaxAnisotropy(), !mascot));
  useEffect(() => () => void kit.then(k => k.textures.forEach(t => t.dispose())), [kit]);
  return <DeskFromKit kit={kit} onModel={onModel} />;
}

function DeskFromKit({ kit, onModel }: { kit: Promise<Kit>; onModel: (root: Object3D) => void }) {
  const ready = use(kit);
  const [built] = useState(() => buildDesk(ready));
  const camera = useThree(s => s.camera);
  useEffect(() => {
    onModel(built.root);
    return () => disposeObject(built.root);
  }, [built, onModel]);
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
