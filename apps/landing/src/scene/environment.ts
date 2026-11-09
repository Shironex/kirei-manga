import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import { PMREMGenerator } from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

/**
 * A dim prefiltered room for reflections, so the black desk and the brass
 * catch some light. The room itself is freed as soon as it is baked.
 */
export function useEnvironment(intensity = 0.12) {
  const { gl, scene } = useThree();
  useEffect(() => {
    const pmrem = new PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const target = pmrem.fromScene(room, 0.04);
    room.dispose();
    pmrem.dispose();
    scene.environment = target.texture;
    scene.environmentIntensity = intensity;
    return () => {
      scene.environment = null;
      target.dispose();
    };
  }, [gl, scene, intensity]);
}
