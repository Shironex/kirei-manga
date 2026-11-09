/**
 * The ribbon of manga pages that winds out of the open volume, past every
 * prop, to the mascot. Built in code from the course in tour/stops.ts (or the
 * scene file's ribbon_XX empties): a standing strip of softly glowing pages,
 * a glow pool on the desk under it and a few warm lights along the way. The
 * pages drift slowly from the book towards the mascot, and the stretch the
 * camera has already travelled glows brighter.
 */
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  RepeatWrapping,
  ShaderMaterial,
  SRGBColorSpace,
  Vector3,
  type CatmullRomCurve3,
} from 'three';
import { paintRibbon } from './paint';

const HEIGHT = 0.03;
const POOL = 0.04;
const TILE = 0.14;
const SEGMENTS = 640;
const UP = new Vector3(0, 1, 0);

interface Strips {
  wall: BufferGeometry;
  pool: BufferGeometry;
  length: number;
}

/** A standing strip along the curve, leaning a little as it winds, and a flat one under it. */
function buildStrips(curve: CatmullRomCurve3): Strips {
  const length = curve.getLength();
  const wall = { position: [] as number[], uv: [] as number[], along: [] as number[] };
  const pool = { position: [] as number[], uv: [] as number[], along: [] as number[] };
  const p = new Vector3();
  const t = new Vector3();
  const side = new Vector3();
  const rise = new Vector3();
  for (let i = 0; i <= SEGMENTS; i++) {
    const u = i / SEGMENTS;
    curve.getPointAt(u, p);
    curve.getTangentAt(u, t);
    side.crossVectors(t, UP).normalize();
    const lean = 0.18 * Math.sin(u * 23) + 0.08 * Math.sin(u * 61);
    rise
      .copy(UP)
      .multiplyScalar(Math.cos(lean))
      .addScaledVector(side, Math.sin(lean))
      .multiplyScalar(HEIGHT);
    const s = (u * length) / TILE;
    wall.position.push(p.x, p.y, p.z, p.x + rise.x, p.y + rise.y, p.z + rise.z);
    wall.uv.push(s, 0, s, 1);
    wall.along.push(u, u);
    const y = Math.max(p.y - 0.002, 0);
    pool.position.push(
      p.x - side.x * POOL,
      y,
      p.z - side.z * POOL,
      p.x + side.x * POOL,
      y,
      p.z + side.z * POOL
    );
    pool.uv.push(s, 0, s, 1);
    pool.along.push(u, u);
  }
  const index: number[] = [];
  for (let i = 0; i < SEGMENTS; i++) {
    const a = i * 2;
    index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const make = (data: typeof wall) => {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(data.position), 3));
    g.setAttribute('uv', new BufferAttribute(new Float32Array(data.uv), 2));
    g.setAttribute('along', new BufferAttribute(new Float32Array(data.along), 1));
    g.setIndex(index);
    g.computeBoundingSphere();
    return g;
  };
  return { wall: make(wall), pool: make(pool), length };
}

const VERTEX = /* glsl */ `
  attribute float along;
  varying vec2 vUv;
  varying float vAlong;
  void main() {
    vUv = uv;
    vAlong = along;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const WALL_FRAGMENT = /* glsl */ `
  uniform sampler2D map;
  uniform float uTime;
  uniform float uHead;
  uniform vec3 uTint;
  varying vec2 vUv;
  varying float vAlong;
  void main() {
    vec4 page = texture2D(map, vec2(vUv.x - uTime * 0.035, vUv.y));
    float edge = smoothstep(0.0, 0.06, vUv.y) * smoothstep(1.0, 0.94, vUv.y);
    float ends = smoothstep(0.0, 0.03, vAlong) * smoothstep(1.0, 0.97, vAlong);
    float travelled = smoothstep(uHead + 0.05, uHead - 0.03, vAlong);
    float d = (vAlong - fract(uTime * 0.035)) * 30.0;
    float glint = exp(-d * d) * 0.3;
    float light = 0.5 + 0.36 * travelled + glint;
    vec3 color = page.rgb * light * mix(vec3(1.0), uTint, 0.22);
    gl_FragColor = vec4(color, 0.92 * edge * ends);
    #include <colorspace_fragment>
  }
`;

const POOL_FRAGMENT = /* glsl */ `
  uniform float uHead;
  uniform vec3 uTint;
  varying vec2 vUv;
  varying float vAlong;
  void main() {
    float across = 1.0 - abs(vUv.y * 2.0 - 1.0);
    float soft = across * across * across;
    float ends = smoothstep(0.0, 0.05, vAlong) * smoothstep(1.0, 0.95, vAlong);
    float travelled = smoothstep(uHead + 0.08, uHead - 0.04, vAlong);
    vec3 warm = mix(vec3(1.0, 0.86, 0.72), uTint, 0.35);
    gl_FragColor = vec4(warm * soft * ends * (0.07 + 0.08 * travelled), 1.0);
    #include <colorspace_fragment>
  }
`;

export interface RibbonProps {
  curve: CatmullRomCurve3;
  /** The ribbon parameter the camera has reached, as a ref read every frame. */
  head: React.RefObject<number>;
  still: boolean;
}

export function Ribbon({ curve, head, still }: RibbonProps) {
  const strips = useMemo(() => buildStrips(curve), [curve]);
  const materials = useMemo(() => {
    const map = new CanvasTexture(paintRibbon());
    map.colorSpace = SRGBColorSpace;
    map.wrapS = RepeatWrapping;
    map.anisotropy = 4;
    const shared = { uHead: { value: 0 }, uTint: { value: new Color('#e9d6ff') } };
    const wall = new ShaderMaterial({
      uniforms: { map: { value: map }, uTime: { value: 0 }, ...shared },
      vertexShader: VERTEX,
      fragmentShader: WALL_FRAGMENT,
      transparent: true,
      side: DoubleSide,
      depthWrite: false,
      toneMapped: false,
    });
    const pool = new ShaderMaterial({
      uniforms: shared,
      vertexShader: VERTEX,
      fragmentShader: POOL_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      toneMapped: false,
    });
    return { wall, pool, map, shared };
  }, []);
  useEffect(
    () => () => {
      strips.wall.dispose();
      strips.pool.dispose();
    },
    [strips]
  );
  useEffect(
    () => () => {
      materials.map.dispose();
      materials.wall.dispose();
      materials.pool.dispose();
    },
    [materials]
  );
  const lights = useMemo(
    () => [0.12, 0.45, 0.8].map(u => curve.getPointAt(u).add(new Vector3(0, 0.07, 0.02))),
    [curve]
  );

  useFrame(state => {
    materials.wall.uniforms.uTime.value = still ? 0 : state.clock.elapsedTime;
    materials.shared.uHead.value = head.current ?? 0;
  });

  return (
    <group>
      <mesh geometry={strips.pool} material={materials.pool} renderOrder={1} />
      <mesh geometry={strips.wall} material={materials.wall} renderOrder={2} />
      {lights.map((p, i) => (
        <pointLight
          key={i}
          position={p}
          intensity={0.06}
          distance={0.35}
          decay={2}
          color="#ffe8d6"
        />
      ))}
    </group>
  );
}
