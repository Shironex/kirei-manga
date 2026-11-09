/**
 * Loads the hero and mascot GLBs. The loader understands Draco and meshopt
 * meshes and KTX2 textures; the decoders live in /3d/decoders (copied from
 * three at build time) and are only fetched when a file uses them.
 */
import type { Material, Object3D, Texture, WebGLRenderer } from 'three';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

const DECODERS = '/3d/decoders';

interface Loaders {
  gltf: GLTFLoader;
  dispose: () => void;
}

export function createLoaders(renderer: WebGLRenderer): Loaders {
  const draco = new DRACOLoader().setDecoderPath(`${DECODERS}/draco/`);
  const ktx2 = new KTX2Loader().setTranscoderPath(`${DECODERS}/basis/`).detectSupport(renderer);
  const gltf = new GLTFLoader()
    .setDRACOLoader(draco)
    .setKTX2Loader(ktx2)
    .setMeshoptDecoder(MeshoptDecoder);
  return {
    gltf,
    dispose: () => {
      draco.dispose();
      ktx2.dispose();
    },
  };
}

export function loadGltf(loader: GLTFLoader, url: string): Promise<GLTF> {
  return loader.loadAsync(url);
}

/**
 * Frees everything a loaded file put on the GPU. R3F only disposes what it
 * created itself, and a scene mounted with <primitive> is not that.
 */
export function disposeObject(root: Object3D): void {
  const textures = new Set<Texture>();
  const materials = new Set<Material>();
  root.traverse(node => {
    const mesh = node as Object3D & {
      geometry?: { dispose: () => void };
      material?: Material | Material[];
    };
    mesh.geometry?.dispose();
    const list = Array.isArray(mesh.material)
      ? mesh.material
      : mesh.material
        ? [mesh.material]
        : [];
    for (const material of list) {
      materials.add(material);
      for (const value of Object.values(material)) {
        if (value && typeof value === 'object' && (value as Texture).isTexture) {
          textures.add(value as Texture);
        }
      }
    }
  });
  textures.forEach(t => t.dispose());
  materials.forEach(m => m.dispose());
}
