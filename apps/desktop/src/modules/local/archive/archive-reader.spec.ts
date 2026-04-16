import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import JSZip from 'jszip';
import {
  naturalPageSort,
  getExtension,
  isImageEntry,
  IMAGE_EXTENSIONS,
  ZipArchiveReader,
  FolderArchiveReader,
} from './index';

/**
 * Isolated tmp dir per spec — avoids cross-test pollution if a prior run
 * left an archive file around. `fs.mkdtemp` uses the OS temp location so
 * we never accidentally write into the repo.
 */
async function makeTmpDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'kirei-archive-reader-'));
}

async function buildZip(targetPath: string, files: Record<string, Buffer | string>): Promise<void> {
  const zip = new JSZip();
  for (const [name, content] of Object.entries(files)) {
    zip.file(name, content);
  }
  const buffer = await zip.generateAsync({ type: 'nodebuffer' });
  await fs.writeFile(targetPath, buffer);
}

describe('naturalPageSort', () => {
  it('orders numeric sequences without leading zeros correctly', () => {
    const input = ['page_10.jpg', 'page_1.jpg', 'page_2.jpg'];
    expect([...input].sort(naturalPageSort)).toEqual(['page_1.jpg', 'page_2.jpg', 'page_10.jpg']);
  });

  it('handles mixed prefixes and punctuation', () => {
    const input = ['p01.png', 'p10.png', 'p2.png'];
    expect([...input].sort(naturalPageSort)).toEqual(['p01.png', 'p2.png', 'p10.png']);
  });

  it('collates case-insensitively', () => {
    const input = ['PAGE_02.JPG', 'page_01.jpg'];
    expect([...input].sort(naturalPageSort)).toEqual(['page_01.jpg', 'PAGE_02.JPG']);
  });
});

describe('getExtension', () => {
  it('returns the lower-case extension without the dot', () => {
    expect(getExtension('cover.JPG')).toBe('jpg');
    expect(getExtension('scan.page.png')).toBe('png');
  });

  it('returns empty string when no extension is present', () => {
    expect(getExtension('README')).toBe('');
    expect(getExtension('trailing.')).toBe('');
  });
});

describe('isImageEntry', () => {
  it('accepts whitelisted extensions', () => {
    for (const ext of IMAGE_EXTENSIONS) {
      expect(isImageEntry(`x.${ext}`)).toBe(true);
    }
  });

  it('rejects non-image files, dotfiles, directories, and _ noise', () => {
    expect(isImageEntry('Thumbs.db')).toBe(false);
    expect(isImageEntry('.DS_Store')).toBe(false);
    expect(isImageEntry('_rels/')).toBe(false);
    expect(isImageEntry('chapter/')).toBe(false);
    expect(isImageEntry('info.txt')).toBe(false);
  });
});

describe('ZipArchiveReader', () => {
  let tmp: string;
  beforeEach(async () => {
    tmp = await makeTmpDir();
  });
  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it('lists only image entries in natural order', async () => {
    const cbz = path.join(tmp, 'ch1.cbz');
    await buildZip(cbz, {
      'page_10.jpg': Buffer.from('a'),
      'page_1.jpg': Buffer.from('b'),
      'page_2.jpg': Buffer.from('c'),
      'Thumbs.db': Buffer.from('junk'),
      'info.txt': Buffer.from('meta'),
    });

    const reader = new ZipArchiveReader(cbz);
    const pages = await reader.listPages();
    await reader.close();

    expect(pages.map(p => p.name)).toEqual(['page_1.jpg', 'page_2.jpg', 'page_10.jpg']);
  });

  it('readPage returns the entry bytes and a matching mime', async () => {
    const cbz = path.join(tmp, 'ch1.cbz');
    await buildZip(cbz, { '001.png': Buffer.from('PNG!') });

    const reader = new ZipArchiveReader(cbz);
    const [page] = await reader.listPages();
    const result = await reader.readPage(page);
    await reader.close();

    expect(result.data.toString()).toBe('PNG!');
    expect(result.mime).toBe('image/png');
  });

  it('rejects an entry the archive never listed', async () => {
    const cbz = path.join(tmp, 'ch1.cbz');
    await buildZip(cbz, { '001.jpg': Buffer.from('a') });

    const reader = new ZipArchiveReader(cbz);
    await reader.listPages();
    await expect(reader.readPage({ name: 'evil.jpg', ext: 'jpg' })).rejects.toThrow(
      /unknown entry/
    );
    await reader.close();
  });
});

describe('FolderArchiveReader', () => {
  let tmp: string;
  beforeEach(async () => {
    tmp = await makeTmpDir();
  });
  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it('lists only image entries in natural order', async () => {
    await fs.writeFile(path.join(tmp, 'page_1.jpg'), 'a');
    await fs.writeFile(path.join(tmp, 'page_10.jpg'), 'b');
    await fs.writeFile(path.join(tmp, 'page_2.jpg'), 'c');
    await fs.writeFile(path.join(tmp, 'Thumbs.db'), 'junk');
    await fs.writeFile(path.join(tmp, '.DS_Store'), 'junk');
    await fs.mkdir(path.join(tmp, 'sub'), { recursive: true });

    const reader = new FolderArchiveReader(tmp);
    const pages = await reader.listPages();

    expect(pages.map(p => p.name)).toEqual(['page_1.jpg', 'page_2.jpg', 'page_10.jpg']);
  });

  it('readPage returns file bytes and the correct mime', async () => {
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    await fs.writeFile(path.join(tmp, 'a.png'), bytes);

    const reader = new FolderArchiveReader(tmp);
    const [entry] = await reader.listPages();
    const result = await reader.readPage(entry);

    expect(result.data.equals(bytes)).toBe(true);
    expect(result.mime).toBe('image/png');
  });

  it('rejects path-traversal attempts', async () => {
    await fs.writeFile(path.join(tmp, 'ok.jpg'), 'a');

    const reader = new FolderArchiveReader(tmp);
    await reader.listPages();
    await expect(reader.readPage({ name: '../etc/passwd', ext: '' })).rejects.toThrow(
      /unknown entry|suspicious/
    );
  });
});
