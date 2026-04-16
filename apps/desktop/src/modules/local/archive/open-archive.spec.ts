import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import JSZip from 'jszip';
import {
  openArchive,
  inferArchiveFormat,
  ZipArchiveReader,
  FolderArchiveReader,
} from './index';

async function makeTmp(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'kirei-open-archive-'));
}

describe('inferArchiveFormat', () => {
  it('maps known extensions and directory stats', () => {
    expect(inferArchiveFormat('/x/ch.cbz', false)).toBe('cbz');
    expect(inferArchiveFormat('/x/ch.ZIP', false)).toBe('zip');
    expect(inferArchiveFormat('/x/ch.CBR', false)).toBe('cbr');
    expect(inferArchiveFormat('/x/ch', true)).toBe('folder');
  });

  it('returns null for unknown file extensions', () => {
    expect(inferArchiveFormat('/x/book.pdf', false)).toBeNull();
    expect(inferArchiveFormat('/x/README', false)).toBeNull();
  });
});

describe('openArchive', () => {
  let tmp: string;
  beforeEach(async () => {
    tmp = await makeTmp();
  });
  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it('returns a FolderArchiveReader for a directory', async () => {
    await fs.writeFile(path.join(tmp, '1.jpg'), 'x');

    const reader = await openArchive(tmp);
    expect(reader).toBeInstanceOf(FolderArchiveReader);
    await reader.close();
  });

  it('returns a ZipArchiveReader for a CBZ file', async () => {
    const cbz = path.join(tmp, 'ch.cbz');
    const zip = new JSZip();
    zip.file('001.jpg', Buffer.from('x'));
    await fs.writeFile(cbz, await zip.generateAsync({ type: 'nodebuffer' }));

    const reader = await openArchive(cbz);
    expect(reader).toBeInstanceOf(ZipArchiveReader);
    await reader.close();
  });

  it('rejects CBR until Slice C lands', async () => {
    await expect(openArchive('/non/existent.cbr', 'cbr')).rejects.toThrow(
      /CBR support not yet available/
    );
  });

  it('rejects unsupported file extensions', async () => {
    const pdf = path.join(tmp, 'book.pdf');
    await fs.writeFile(pdf, 'x');
    await expect(openArchive(pdf)).rejects.toThrow(/unsupported path/);
  });
});
