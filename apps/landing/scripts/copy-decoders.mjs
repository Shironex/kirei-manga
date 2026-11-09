// Copies the Draco and Basis (KTX2) decoders out of the installed three into
// public/3d/decoders, so the hero GLB can use compressed meshes and textures
// without a CDN. They are only fetched when a model needs them.
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
// three exports no package.json, so resolve a file that lives beside the libs.
const libs = dirname(require.resolve('three/examples/jsm/libs/meshopt_decoder.module.js'));
const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', '3d', 'decoders');

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(join(libs, 'draco', 'gltf'), join(out, 'draco'), { recursive: true });
cpSync(join(libs, 'basis'), join(out, 'basis'), {
  recursive: true,
  filter: src => !src.endsWith('.md'),
});
console.log(`decoders copied to ${out}`);
