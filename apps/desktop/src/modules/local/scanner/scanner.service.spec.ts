import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import JSZip from 'jszip';
import { LocalScannerService } from './scanner.service';
import type { ScanProgress } from '@kireimanga/shared';

/**
 * Each layout fixture is a tmp tree that mirrors what a real user's manga
 * folder looks like. Tests are slow enough (real fs + real zip I/O) that
 * we keep the fixture set small — three shapes plus one mixed root.
 */

async function makeTmp(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'kirei-scanner-'));
}

async function writeZip(target: string, files: string[]): Promise<void> {
  const zip = new JSZip();
  for (const name of files) {
    zip.file(name, Buffer.from('x'));
  }
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, await zip.generateAsync({ type: 'nodebuffer' }));
}

async function writeImage(target: string): Promise<void> {
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
}

describe('LocalScannerService', () => {
  let scanner: LocalScannerService;
  let tmp: string;

  beforeEach(async () => {
    scanner = new LocalScannerService();
    tmp = await makeTmp();
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it('detects a flat layout — each child folder = series, archives inside = chapters', async () => {
    await writeZip(path.join(tmp, 'Berserk', 'Chapter 1.cbz'), ['001.jpg', '002.jpg']);
    await writeZip(path.join(tmp, 'Berserk', 'Chapter 2.cbz'), ['001.jpg']);
    await writeZip(path.join(tmp, 'Vinland Saga', 'ch_01.cbz'), ['001.jpg']);

    const result = await scanner.scan(tmp);

    expect(result.candidates).toHaveLength(2);
    const titles = result.candidates.map(c => c.suggestedTitle).sort();
    expect(titles).toEqual(['Berserk', 'Vinland Saga']);

    const berserk = result.candidates.find(c => c.suggestedTitle === 'Berserk');
    expect(berserk?.chapters).toHaveLength(2);
    expect(berserk?.chapters[0].pageCount).toBe(2);
    expect(berserk?.chapters[0].chapterNumber).toBe(1);
  });

  it('detects a nested layout — series/volume/images', async () => {
    const base = path.join(tmp, 'Vagabond');
    await writeImage(path.join(base, 'Volume 01', '001.jpg'));
    await writeImage(path.join(base, 'Volume 01', '002.jpg'));
    await writeImage(path.join(base, 'Volume 02', '001.jpg'));

    const result = await scanner.scan(tmp);

    expect(result.candidates).toHaveLength(1);
    const [series] = result.candidates;
    expect(series.suggestedTitle).toBe('Vagabond');
    expect(series.chapters).toHaveLength(2);
    const chapterOne = series.chapters.find(c => c.volumeNumber === 1);
    expect(chapterOne?.format).toBe('folder');
    expect(chapterOne?.pageCount).toBe(2);
  });

  it('detects a single-series layout — archives at the root', async () => {
    await writeZip(path.join(tmp, 'Chapter 1.cbz'), ['001.jpg']);
    await writeZip(path.join(tmp, 'Chapter 2.cbz'), ['001.jpg', '002.jpg']);

    const result = await scanner.scan(tmp);

    expect(result.candidates).toHaveLength(1);
    const [series] = result.candidates;
    expect(series.chapters).toHaveLength(2);
    expect(series.chapters[0].chapterNumber).toBe(1);
  });

  it('ignores hidden files and well-known system noise', async () => {
    await writeZip(path.join(tmp, 'SeriesA', 'Chapter 1.cbz'), ['001.jpg']);
    await fs.writeFile(path.join(tmp, 'SeriesA', 'Thumbs.db'), 'x');
    await fs.writeFile(path.join(tmp, 'SeriesA', '.DS_Store'), 'x');
    await fs.mkdir(path.join(tmp, '.hidden-series'));

    const result = await scanner.scan(tmp);

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].suggestedTitle).toBe('SeriesA');
  });

  it('emits progress events across phases', async () => {
    await writeZip(path.join(tmp, 'A', 'Chapter 1.cbz'), ['001.jpg']);
    await writeZip(path.join(tmp, 'A', 'Chapter 2.cbz'), ['001.jpg']);

    const progress: ScanProgress[] = [];
    await scanner.scan(tmp, p => progress.push(p));

    const phases = Array.from(new Set(progress.map(p => p.phase)));
    expect(phases).toEqual(expect.arrayContaining(['scanning', 'reading-archives', 'done']));
    const final = progress[progress.length - 1];
    expect(final.phase).toBe('done');
  });

  it('returns no candidates for an empty root', async () => {
    const result = await scanner.scan(tmp);
    expect(result.candidates).toEqual([]);
    expect(result.rootPath).toBe(path.resolve(tmp));
  });
});
