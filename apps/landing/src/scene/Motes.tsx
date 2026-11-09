/** Dust drifting in the lamp light: a few dozen soft points, additive. */
import { useFrame } from '@react-three/fiber';
import { useEffect, useState } from 'react';
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  PointsMaterial,
  type Vector3,
} from 'three';

const COUNT = 48;

function dot(): CanvasTexture {
  const el = document.createElement('canvas');
  el.width = el.height = 32;
  const ctx = el.getContext('2d');
  if (ctx) {
    const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.3)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 32, 32);
  }
  return new CanvasTexture(el);
}

export function Motes({ around, still }: { around: Vector3; still: boolean }) {
  const [geometry] = useState(() => {
    const positions = new Float32Array(COUNT * 3);
    let seed = 11;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < COUNT; i++) {
      positions[i * 3] = around.x + (rand() - 0.5) * 0.5;
      positions[i * 3 + 1] = around.y - rand() * 0.35;
      positions[i * 3 + 2] = around.z + (rand() - 0.3) * 0.35;
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(positions, 3));
    return g;
  });
  const [material] = useState(
    () =>
      new PointsMaterial({
        map: dot(),
        size: 0.008,
        color: '#ffe2b0',
        transparent: true,
        opacity: 0.8,
        depthWrite: false,
        blending: AdditiveBlending,
      })
  );
  useEffect(
    () => () => {
      geometry.dispose();
      material.map?.dispose();
      material.dispose();
    },
    [geometry, material]
  );
  useFrame(state => {
    if (still) return;
    const t = state.clock.elapsedTime;
    const pos = geometry.attributes.position as BufferAttribute;
    for (let i = 0; i < COUNT; i++) {
      const drift = 0.00012 * Math.sin(t * 0.4 + i);
      pos.setX(i, pos.getX(i) + drift);
      let y = pos.getY(i) + 0.00006 * (1 + (i % 4));
      if (y > around.y + 0.03) y = around.y - 0.35;
      pos.setY(i, y);
    }
    pos.needsUpdate = true;
  });
  return <points geometry={geometry} material={material} frustumCulled={false} />;
}
