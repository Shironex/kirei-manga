import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { pathToFileURL } from 'node:url';

let userDataOverride: string | undefined;

/**
 * Mock Electron's `app.getPath('userData')` so each test gets an isolated
 * tmp dir. The protocol-cache helpers (`writeAtomic`) don't touch `app`
 * directly, so we only need this for the resolver's mangadex / local
 * branches.
 */
jest.mock('electron', () => ({
  app: {
    getPath: (name: string) => {
      if (name === 'userData') {
        if (!userDataOverride) {
          throw new Error('userData override not set — call useTmpUserData first');
        }
        return userDataOverride;
      }
      throw new Error(`unexpected app.getPath(${name}) in test`);
    },
  },
}));

import { PageUrlResolverService } from './page-url-resolver';
import type { LocalLibraryService } from '../local';

interface LocalLibraryStub {
  readChapterPage: jest.Mock<
    Promise<{ data: Buffer; mime: string } | null>,
    [string, number]
  >;
}

function buildResolver(): { resolver: PageUrlResolverService; local: LocalLibraryStub } {
  const local: LocalLibraryStub = {
    readChapterPage: jest.fn(),
  };
  const resolver = new PageUrlResolverService(local as unknown as LocalLibraryService);
  return { resolver, local };
}

async function useTmpUserData(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'kirei-resolver-'));
  userDataOverride = dir;
  return dir;
}

afterEach(async () => {
  if (userDataOverride) {
    await fs.rm(userDataOverride, { recursive: true, force: true });
    userDataOverride = undefined;
  }
});

describe('PageUrlResolverService', () => {
  it('resolves kirei-page://mangadex/{chapter}/{file} to the cached pages path', async () => {
    const userData = await useTmpUserData();
    const cached = path.join(userData, 'pages', 'mangadex', 'ch01', 'page-001.jpg');
    await fs.mkdir(path.dirname(cached), { recursive: true });
    await fs.writeFile(cached, Buffer.from([0x89, 0x50, 0x4e, 0x47]));

    const { resolver } = buildResolver();
    const result = await resolver.resolveToFilesystemPath(
      'kirei-page://mangadex/ch01/page-001.jpg',
    );

    expect(result).toBe(cached);
  });

  it('throws on a mangadex URL whose file has not been cached yet', async () => {
    await useTmpUserData();
    const { resolver } = buildResolver();

    await expect(
      resolver.resolveToFilesystemPath('kirei-page://mangadex/ch01/missing.jpg'),
    ).rejects.toThrow(/not cached/);
  });

  it('rejects mangadex URLs with traversal segments', async () => {
    await useTmpUserData();
    const { resolver } = buildResolver();

    await expect(
      resolver.resolveToFilesystemPath('kirei-page://mangadex/../etc/passwd'),
    ).rejects.toThrow(/unsafe segment|malformed/);
  });

  it('extracts kirei-page://local/... bytes into the translation cache and returns the path', async () => {
    const userData = await useTmpUserData();
    const { resolver, local } = buildResolver();
    const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
    local.readChapterPage.mockResolvedValueOnce({ data: bytes, mime: 'image/jpeg' });

    const result = await resolver.resolveToFilesystemPath(
      'kirei-page://local/abc-123/0.jpg',
    );

    expect(local.readChapterPage).toHaveBeenCalledWith('abc-123', 0);
    expect(result).toBe(path.join(userData, 'translation-cache', 'local', 'abc-123', '0.jpg'));
    const written = await fs.readFile(result);
    expect(written.equals(bytes)).toBe(true);
  });

  it('reuses the cached extract for repeated kirei-page://local/... lookups', async () => {
    await useTmpUserData();
    const { resolver, local } = buildResolver();
    local.readChapterPage.mockResolvedValueOnce({
      data: Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
      mime: 'image/jpeg',
    });

    const first = await resolver.resolveToFilesystemPath('kirei-page://local/dup/0.jpg');
    const second = await resolver.resolveToFilesystemPath('kirei-page://local/dup/0.jpg');

    expect(first).toBe(second);
    // A single archive read covers both calls — the second hits the on-disk
    // extract that the first one wrote.
    expect(local.readChapterPage).toHaveBeenCalledTimes(1);
  });

  it('throws when the local library cannot extract the requested page', async () => {
    await useTmpUserData();
    const { resolver, local } = buildResolver();
    local.readChapterPage.mockResolvedValueOnce(null);

    await expect(
      resolver.resolveToFilesystemPath('kirei-page://local/missing-chapter/0.jpg'),
    ).rejects.toThrow(/failed to extract/);
  });

  it('rejects local URLs with non-numeric page indices', async () => {
    await useTmpUserData();
    const { resolver, local } = buildResolver();

    await expect(
      resolver.resolveToFilesystemPath('kirei-page://local/ch01/notanumber.jpg'),
    ).rejects.toThrow(/malformed local page filename/);
    expect(local.readChapterPage).not.toHaveBeenCalled();
  });

  it('resolves a file:// URL to its filesystem path', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'kirei-resolver-file-'));
    try {
      const filePath = path.join(tmp, 'page.jpg');
      await fs.writeFile(filePath, Buffer.from([0x89]));
      const { resolver } = buildResolver();

      const url = pathToFileURL(filePath).toString();
      const result = await resolver.resolveToFilesystemPath(url);
      expect(result).toBe(filePath);
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it('returns absolute paths unchanged so existing callers keep working', async () => {
    const { resolver } = buildResolver();
    const absolute = path.resolve('/library/series/ch01/page-001.jpg');

    const result = await resolver.resolveToFilesystemPath(absolute);
    expect(result).toBe(absolute);
  });

  it('throws on unknown URL schemes', async () => {
    const { resolver } = buildResolver();

    await expect(resolver.resolveToFilesystemPath('http://example.com/page.jpg')).rejects.toThrow(
      /unknown URL scheme/,
    );
    await expect(resolver.resolveToFilesystemPath('relative/path.jpg')).rejects.toThrow(
      /unknown URL scheme/,
    );
  });

  it('throws on empty input', async () => {
    const { resolver } = buildResolver();
    await expect(resolver.resolveToFilesystemPath('')).rejects.toThrow(/non-empty/);
  });
});
