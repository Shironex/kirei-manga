import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';

import { pageHash } from './page-hash';

// `apps/desktop/test/fixtures/translation/blank-bubble.png` is the same
// committed fixture used by the bubble-detector smoke spec — a hand-rolled
// 100x100 solid-white PNG (~118 bytes). Its bytes are fixed, so its SHA-256
// is fixed. Recompute via:
//   node -e "const c=require('crypto'),f=require('fs');const h=c.createHash('sha256');h.update(f.readFileSync('apps/desktop/test/fixtures/translation/blank-bubble.png'));console.log(h.digest('hex'))"
const FIXTURE = path.resolve(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'test',
  'fixtures',
  'translation',
  'blank-bubble.png'
);
const FIXTURE_SHA256 =
  '30dab6a5c037a9de5d345308b5b93cbbe95dac26a357329cf814f375bfee2799';

describe('pageHash', () => {
  let tempDir: string;

  beforeAll(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), 'kirei-page-hash-'));
  });

  afterAll(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('returns the known SHA-256 of the committed fixture (stable across runs)', async () => {
    const digest = await pageHash(FIXTURE);
    expect(digest).toBe(FIXTURE_SHA256);
    // Sanity: 64-char lowercase hex.
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
  });

  it('produces the same hash for identical content stored at different paths', async () => {
    const payload = Buffer.from('kirei-manga page bytes — identical content');
    const a = path.join(tempDir, 'copy-a.bin');
    const b = path.join(tempDir, 'copy-b.bin');
    await writeFile(a, payload);
    await writeFile(b, payload);

    const [hashA, hashB] = await Promise.all([pageHash(a), pageHash(b)]);
    expect(hashA).toBe(hashB);
  });

  it('produces a different hash when a single byte changes', async () => {
    const original = Buffer.from('kirei-manga page bytes — original');
    const mutated = Buffer.from(original);
    // Flip the final byte — smallest possible content change.
    mutated[mutated.length - 1] = mutated[mutated.length - 1] ^ 0x01;

    const originalPath = path.join(tempDir, 'sensitive-original.bin');
    const mutatedPath = path.join(tempDir, 'sensitive-mutated.bin');
    await writeFile(originalPath, original);
    await writeFile(mutatedPath, mutated);

    const [originalHash, mutatedHash] = await Promise.all([
      pageHash(originalPath),
      pageHash(mutatedPath),
    ]);
    expect(originalHash).not.toBe(mutatedHash);
  });

  it('rejects with ENOENT when the file does not exist', async () => {
    const missing = path.join(tempDir, 'does-not-exist.png');
    await expect(pageHash(missing)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
