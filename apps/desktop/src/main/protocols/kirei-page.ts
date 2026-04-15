import { app, protocol } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../logger';

const SCHEME = 'kirei-page';
const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp']);

const EXT_TO_MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
};

let pagesRoot: string | null = null;

function getPagesRoot(): string {
  if (!pagesRoot) {
    pagesRoot = path.join(app.getPath('userData'), 'chapters');
    if (!fs.existsSync(pagesRoot)) {
      fs.mkdirSync(pagesRoot, { recursive: true });
      logger.info(`Created chapter pages directory: ${pagesRoot}`);
    }
  }
  return pagesRoot;
}

/**
 * Build a page protocol URL for a given chapter id + page file name.
 */
export function toPageUrl(chapterId: string, fileName: string): string {
  return `${SCHEME}://page/${chapterId}/${fileName}`;
}

/**
 * Register the kirei-page: protocol.
 *
 * URL shape: kirei-page://page/{chapterId}/{fileName}
 *
 * Security:
 * - Resolves the final path and verifies it stays inside userData/chapters.
 * - Only image extensions in ALLOWED_EXTENSIONS are permitted.
 * - Content-addressed responses are cached aggressively.
 */
export function registerKireiPageProtocol(): void {
  const root = getPagesRoot();

  protocol.handle(SCHEME, async request => {
    try {
      const url = new URL(request.url);
      // Strip leading slashes, then split into [chapterId, ...rest]
      const parts = url.pathname.replace(/^\/+/, '').split('/');
      if (parts.length < 2) {
        return new Response('Bad request', { status: 400 });
      }

      const chapterId = path.basename(parts[0]);
      const fileName = path.basename(parts.slice(1).join('/'));

      if (!chapterId || !fileName) {
        return new Response('Bad request', { status: 400 });
      }

      const ext = path.extname(fileName).toLowerCase();
      if (!ALLOWED_EXTENSIONS.has(ext)) {
        logger.warn(`[kirei-page] Blocked non-image extension: ${ext}`);
        return new Response('Forbidden', { status: 403 });
      }

      const filePath = path.resolve(root, chapterId, fileName);
      // Ensure resolved path stays inside pages root
      const expectedPrefix = root + path.sep;
      if (!filePath.startsWith(expectedPrefix)) {
        logger.warn(`[kirei-page] Blocked path traversal: ${filePath}`);
        return new Response('Forbidden', { status: 403 });
      }

      let stat: fs.Stats;
      try {
        stat = await fs.promises.stat(filePath);
        if (!stat.isFile()) {
          return new Response('Not a file', { status: 403 });
        }
      } catch {
        return new Response('Not found', { status: 404 });
      }

      const data = await fs.promises.readFile(filePath);
      return new Response(data, {
        status: 200,
        headers: {
          'Content-Type': EXT_TO_MIME[ext] ?? 'application/octet-stream',
          'Content-Length': String(stat.size),
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      });
    } catch (error) {
      logger.error('[kirei-page] Error handling request:', error);
      return new Response('Internal error', { status: 500 });
    }
  });

  logger.info('kirei-page protocol registered');
}
