/**
 * The scene file and the mascot. Loading suspends, so the stage keeps its
 * poster until both are in; a failed load throws to the error boundary and
 * the page goes back to its posters.
 */
import { useFrame, useThree } from '@react-three/fiber';
import { use, useEffect, useState } from 'react';
import { AnimationMixer, type Object3D, type Vector3 } from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createLoaders, disposeObject } from './gltf';

type Loaders = ReturnType<typeof createLoaders>;

/** One loader set per mount, freed with it. Call from a component that does not suspend. */
export function useLoaders(): Loaders {
  const gl = useThree(s => s.gl);
  const [loaders] = useState(() => createLoaders(gl));
  useEffect(() => () => loaders.dispose(), [loaders]);
  return loaders;
}

/** Starts a load once per mount and frees the file on unmount. */
export function useGltfPromise(loaders: Loaders, url: string | null): Promise<GLTF> | null {
  const [promise] = useState(() => (url ? loaders.gltf.loadAsync(url) : null));
  useEffect(
    () => () => {
      promise?.then(gltf => disposeObject(gltf.scene)).catch(() => undefined);
    },
    [promise]
  );
  return promise;
}

function shadows(root: Object3D) {
  root.traverse(node => {
    if ((node as { isMesh?: boolean }).isMesh) {
      node.castShadow = true;
      node.receiveShadow = true;
    }
  });
}

/** Plays the first clip of a file, if it has one (the mascot's idle). */
function useIdleClip(gltf: GLTF, still: boolean) {
  const [mixer] = useState(() => {
    if (!gltf.animations.length) return null;
    const m = new AnimationMixer(gltf.scene);
    m.clipAction(gltf.animations[0]).play();
    return m;
  });
  useEffect(
    () => () => {
      mixer?.stopAllAction();
    },
    [mixer]
  );
  useFrame((_, delta) => {
    if (mixer && !still) mixer.update(Math.min(delta, 0.05));
  });
}

export function SceneFile({
  promise,
  still,
  onModel,
}: {
  promise: Promise<GLTF>;
  still: boolean;
  onModel: (root: Object3D) => void;
}) {
  const gltf = use(promise);
  useIdleClip(gltf, still);
  useEffect(() => {
    shadows(gltf.scene);
    onModel(gltf.scene);
  }, [gltf, onModel]);
  return <primitive object={gltf.scene} />;
}

/** The mascot model's front looks down +X, a quarter turn from glTF's +Z. */
const MASCOT_FRONT = Math.PI / 2;

export function Mascot({
  promise,
  at,
  faceTo,
  still,
}: {
  promise: Promise<GLTF>;
  at: Vector3;
  /** The camera of the stop that shows her, so she looks into the lens. */
  faceTo: readonly [number, number, number];
  still: boolean;
}) {
  const gltf = use(promise);
  useIdleClip(gltf, still);
  useEffect(() => shadows(gltf.scene), [gltf]);
  const yaw = Math.atan2(faceTo[0] - at.x, faceTo[2] - at.z) - MASCOT_FRONT;
  return <primitive object={gltf.scene} position={at} rotation={[0, yaw, 0]} />;
}
