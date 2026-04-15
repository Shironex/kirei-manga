import { app, protocol } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../logger';

const SCHEME = 'kirei-cover';
const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp']);

const EXT_TO_MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
};

let coverDir: string | null = null;

function getCoverDir(): string {
  if (!coverDir) {
    coverDir = path.join(app.getPath('userData'), 'covers');
    if (!fs.existsSync(coverDir)) {
      fs.mkdirSync(coverDir, { recursive: true });
      logger.info(`Created covers directory: ${coverDir}`);
    }
  }
  return coverDir;
}

/**
 * Build a cover protocol URL for a stored cover file name.
 * Callers are expected to content-address files (e.g. sha256 hash + ext).
 */
export function toCoverUrl(fileName: string): string {
  return `${SCHEME}://cover/${fileName}`;
}

/**
 * Register the kirei-cover: protocol.
 *
 * URL shape: kirei-cover://cover/{hash}.{ext}
 *
 * Security:
 * - Only files inside userData/covers are served.
 * - Path traversal is blocked via path.basename().
 * - Only image extensions in ALLOWED_EXTENSIONS are permitted.
 * - Responses ship with immutable cache headers since files are content-addressed.
 */
export function registerKireiCoverProtocol(): void {
  const dir = getCoverDir();

  protocol.handle(SCHEME, async request => {
    try {
      const url = new URL(request.url);
      const fileName = url.pathname.replace(/^\/+/, '');
      if (!fileName) {
        return new Response('Bad request', { status: 400 });
      }

      const ext = path.extname(fileName).toLowerCase();
      if (!ALLOWED_EXTENSIONS.has(ext)) {
        logger.warn(`[kirei-cover] Blocked non-image extension: ${ext}`);
        return new Response('Forbidden', { status: 403 });
      }

      const safeName = path.basename(fileName);
      const filePath = path.join(dir, safeName);

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
      logger.error('[kirei-cover] Error handling request:', error);
      return new Response('Internal error', { status: 500 });
    }
  });

  logger.info('kirei-cover protocol registered');
}
