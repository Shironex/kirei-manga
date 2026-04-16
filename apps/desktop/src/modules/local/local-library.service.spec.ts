import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import JSZip from 'jszip';

let coverRootOverride: string | undefined;

/**
 * Mock Electron's `app.getPath('userData')` so the import test can write
 * its cover files into an isolated tmp dir per test. `dialog` is also
 * mocked so any accidental folder-picker call doesn't throw.
 */
jest.mock('electron', () => ({
  app: {
    getPath: (name: string) => {
      if (name === 'userData') {
        if (!coverRootOverride) {
          throw new Error('cover root override not set — call setCoverRootOverride first');
        }
        return coverRootOverride;
      }
      throw new Error(`unexpected app.getPath(${name}) in test`);
    },
  },
  dialog: {
    showOpenDialog: jest.fn(),
  },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
import { LocalLibraryService, computeLocalContentHash } from './local-library.service';
import { LocalScannerService } from './scanner';
import type { DatabaseService } from '../database';
import { createTestDatabase } from '../database/__test__/sqljs-adapter';

async function makeTmp(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'kirei-local-import-'));
}

async function writeZip(target: string, files: string[]): Promise<void> {
  const zip = new JSZip();
  for (const name of files) zip.file(name, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, await zip.generateAsync({ type: 'nodebuffer' }));
}

describe('LocalLibraryService (integration)', () => {
  let tmp: string;
  let userData: string;
  let dbService: DatabaseService;
  let service: LocalLibraryService;
  let scanner: LocalScannerService;

  beforeEach(async () => {
    tmp = await makeTmp();
    userData = await fs.mkdtemp(path.join(os.tmpdir(), 'kirei-userdata-'));
    coverRootOverride = userData;

    const db = await createTestDatabase();
    dbService = { db } as unknown as DatabaseService;
    service = new LocalLibraryService(dbService);
    scanner = new LocalScannerService();
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
    await fs.rm(userData, { recursive: true, force: true });
    coverRootOverride = undefined;
  });

  it('imports a scanned series, writes chapter rows, and extracts a cover', async () => {
    await writeZip(path.join(tmp, 'My Series', 'Chapter 1.cbz'), ['001.png', '002.png']);
    await writeZip(path.join(tmp, 'My Series', 'Chapter 2.cbz'), ['001.png']);

    const scan = await scanner.scan(tmp);
    expect(scan.candidates).toHaveLength(1);

    const result = await service.import({ rootPath: tmp, candidates: scan.candidates });

    expect(result.createdSeriesIds).toHaveLength(1);
    expect(result.skipped).toBe(0);

    const [seriesId] = result.createdSeriesIds;
    const series = await service.getSeries(seriesId);
    expect(series?.title).toBe('My Series');
    expect(series?.source).toBe('local');
    expect(series?.localRootPath).toBe(path.resolve(path.join(tmp, 'My Series')));
    expect(series?.coverPath).toBe(`kirei-cover://local/${seriesId}/cover.png`);

    const chapters = await service.getChapters(seriesId);
    expect(chapters).toHaveLength(2);
    expect(chapters.every(c => c.page_count > 0)).toBe(true);

    const coverFile = path.join(userData, 'covers', 'local', seriesId, 'cover.png');
    const coverStat = await fs.stat(coverFile);
    expect(coverStat.isFile()).toBe(true);
  });

  it('skips a second import of the same content hash', async () => {
    await writeZip(path.join(tmp, 'My Series', 'Chapter 1.cbz'), ['001.png']);

    const scan = await scanner.scan(tmp);
    const first = await service.import({ rootPath: tmp, candidates: scan.candidates });
    const second = await service.import({ rootPath: tmp, candidates: scan.candidates });

    expect(first.createdSeriesIds).toHaveLength(1);
    expect(second.createdSeriesIds).toHaveLength(0);
    expect(second.skipped).toBe(1);
  });

  it('deletes a series and cascades its chapters + cover files', async () => {
    await writeZip(path.join(tmp, 'My Series', 'Chapter 1.cbz'), ['001.png']);
    const scan = await scanner.scan(tmp);
    const { createdSeriesIds } = await service.import({
      rootPath: tmp,
      candidates: scan.candidates,
    });
    const [seriesId] = createdSeriesIds;

    const coverDir = path.join(userData, 'covers', 'local', seriesId);
    expect((await fs.stat(coverDir)).isDirectory()).toBe(true);

    await service.deleteSeries(seriesId);

    expect(await service.getSeries(seriesId)).toBeNull();
    await expect(fs.stat(coverDir)).rejects.toThrow();
  });

  it('updateSeries merges a patch and clamps score to 1..10', async () => {
    await writeZip(path.join(tmp, 'My Series', 'Chapter 1.cbz'), ['001.png']);
    const scan = await scanner.scan(tmp);
    const { createdSeriesIds } = await service.import({
      rootPath: tmp,
      candidates: scan.candidates,
    });
    const [seriesId] = createdSeriesIds;

    const patched = await service.updateSeries(seriesId, {
      title: 'Renamed Series',
      notes: 'read after vacation',
      score: 8,
    });
    expect(patched?.title).toBe('Renamed Series');
    expect(patched?.notes).toBe('read after vacation');
    expect(patched?.score).toBe(8);

    const clamped = await service.updateSeries(seriesId, { score: 42 });
    // Out-of-range score is coerced to null — COALESCE keeps prior value.
    expect(clamped?.score).toBe(8);
  });
});

describe('computeLocalContentHash', () => {
  it('is stable regardless of input order', () => {
    const a = computeLocalContentHash({
      chapters: [
        { relativePath: 'ch1.cbz', chapterNumber: 1, volumeNumber: null, pageCount: 10, format: 'cbz' },
        { relativePath: 'ch2.cbz', chapterNumber: 2, volumeNumber: null, pageCount: 10, format: 'cbz' },
      ],
    });
    const b = computeLocalContentHash({
      chapters: [
        { relativePath: 'ch2.cbz', chapterNumber: 2, volumeNumber: null, pageCount: 10, format: 'cbz' },
        { relativePath: 'ch1.cbz', chapterNumber: 1, volumeNumber: null, pageCount: 10, format: 'cbz' },
      ],
    });
    expect(a).toBe(b);
  });

  it('differs when the chapter set differs', () => {
    const a = computeLocalContentHash({
      chapters: [
        { relativePath: 'ch1.cbz', chapterNumber: 1, volumeNumber: null, pageCount: 10, format: 'cbz' },
      ],
    });
    const b = computeLocalContentHash({
      chapters: [
        { relativePath: 'ch1.cbz', chapterNumber: 1, volumeNumber: null, pageCount: 10, format: 'cbz' },
        { relativePath: 'ch2.cbz', chapterNumber: 2, volumeNumber: null, pageCount: 10, format: 'cbz' },
      ],
    });
    expect(a).not.toBe(b);
  });
});
