import { Injectable } from '@nestjs/common';
import { app } from 'electron';
import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'node:url';
import { createLogger } from '@kireimanga/shared';
import { LocalLibraryService } from '../local';
import { writeAtomic } from '../../main/shared/protocol-cache';

const logger = createLogger('PageUrlResolverService');

const MANGADEX_PREFIX = 'kirei-page://mangadex/';
const LOCAL_PREFIX = 'kirei-page://local/';
const FILE_PREFIX = 'file://';

/**
 * Same path-segment guard the kirei-page protocol applies — keeps url-derived
 * segments from escaping their cache directories. Mirrored here (instead of
 * imported from `protocol-cache`) so we stay independent of `protocol.handle`
 * registration timing; both copies must stay in sync.
 */
const SAFE_SEGMENT = /^[a-zA-Z0-9._-]+$/;

/**
 * Resolve a `userData/<subdir>` path with a Jest-friendly fallback so resolver
 * specs can run without spinning up an Electron `app` shim.
 */
function resolveUserData(subdir: string): string {
  try {
    return path.join(app.getPath('userData'), subdir);
  } catch {
    return path.join(process.cwd(), '.userData', subdir);
  }
}

/**
 * Single source of truth for `kirei-page://` URL → filesystem-path resolution.
 *
 * The renderer only ever holds a `kirei-page://` proxy URL; the translation
 * pipeline needs a real on-disk file (it stream-hashes for the cache key, the
 * native bubble detector reads from disk, and the OCR sidecar reads from
 * disk too). Doing the lookup here — instead of in the renderer — avoids a
 * second IPC round-trip per page and keeps URL parsing colocated with the
 * cache-layout knowledge it needs.
 *
 * URL → path rules:
 *   - `kirei-page://mangadex/{chapterId}/{filename}` →
 *       `userData/pages/mangadex/{chapterId}/{filename}` (must be on disk —
 *       the kirei-page protocol writes there before serving the renderer's
 *       `<img>` request, so by the time the user can see a page the file
 *       exists; missing throws so the user can retry rather than translating
 *       half a page).
 *   - `kirei-page://local/{chapterId}/{pageIndex}.{ext}` → extract the entry
 *       from the chapter's archive into a deterministic location under
 *       `userData/translation-cache/local/{chapterId}/{pageIndex}.{ext}`.
 *       Reuses the cached extract on subsequent calls.
 *   - `file://...` → `fileURLToPath` (handy for tests + future flows that
 *       embed a literal file URL).
 *   - Any absolute path → returned unchanged so existing callers (F.5
 *       integration test, manual paste) keep working.
 *   - Anything else throws — never silently degrade and translate the wrong
 *       file.
 */
@Injectable()
export class PageUrlResolverService {
  constructor(private readonly localLibrary: LocalLibraryService) {}

  async resolveToFilesystemPath(url: string): Promise<string> {
    if (typeof url !== 'string' || url.length === 0) {
      throw new Error('resolveToFilesystemPath: url must be a non-empty string');
    }

    if (url.startsWith(MANGADEX_PREFIX)) {
      return await this.resolveMangaDex(url);
    }
    if (url.startsWith(LOCAL_PREFIX)) {
      return await this.resolveLocal(url);
    }
    if (url.startsWith(FILE_PREFIX)) {
      return fileURLToPath(url);
    }
    if (path.isAbsolute(url)) {
      return url;
    }

    throw new Error(`PageUrlResolverService: unknown URL scheme: ${url}`);
  }

  private async resolveMangaDex(url: string): Promise<string> {
    const tail = url.slice(MANGADEX_PREFIX.length);
    const parts = tail.split('/');
    if (parts.length !== 2) {
      throw new Error(`PageUrlResolverService: malformed mangadex URL: ${url}`);
    }
    const [chapterId, fileName] = parts;
    if (!SAFE_SEGMENT.test(chapterId) || !SAFE_SEGMENT.test(fileName)) {
      throw new Error(`PageUrlResolverService: unsafe segment in mangadex URL: ${url}`);
    }

    const filePath = path.join(resolveUserData('pages'), 'mangadex', chapterId, fileName);

    try {
      const stat = await fsp.stat(filePath);
      if (!stat.isFile() || stat.size === 0) {
        throw new Error(
          `PageUrlResolverService: mangadex page not cached on disk yet: ${filePath}`,
        );
      }
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        throw new Error(
          `PageUrlResolverService: mangadex page not cached on disk yet: ${filePath}`,
        );
      }
      throw err;
    }

    return filePath;
  }

  private async resolveLocal(url: string): Promise<string> {
    const tail = url.slice(LOCAL_PREFIX.length);
    const parts = tail.split('/');
    if (parts.length !== 2) {
      throw new Error(`PageUrlResolverService: malformed local URL: ${url}`);
    }
    const [chapterId, fileName] = parts;
    if (!SAFE_SEGMENT.test(chapterId) || !SAFE_SEGMENT.test(fileName)) {
      throw new Error(`PageUrlResolverService: unsafe segment in local URL: ${url}`);
    }
    const match = fileName.match(/^(\d+)\.([a-z0-9]+)$/i);
    if (!match) {
      throw new Error(`PageUrlResolverService: malformed local page filename: ${fileName}`);
    }
    const pageIndex = Number.parseInt(match[1], 10);
    if (!Number.isFinite(pageIndex) || pageIndex < 0) {
      throw new Error(`PageUrlResolverService: invalid local page index: ${match[1]}`);
    }

    const targetPath = path.join(
      resolveUserData('translation-cache'),
      'local',
      chapterId,
      fileName,
    );

    // Reuse a prior extract — bytes are content-addressed by (chapterId,
    // pageIndex) so a hit is always safe.
    if (fs.existsSync(targetPath)) {
      return targetPath;
    }

    const result = await this.localLibrary.readChapterPage(chapterId, pageIndex);
    if (!result) {
      throw new Error(
        `PageUrlResolverService: failed to extract local page ${chapterId}/${pageIndex}`,
      );
    }

    await writeAtomic(targetPath, result.data);
    logger.debug(`extracted local page to ${targetPath}`);
    return targetPath;
  }
}
