import { Injectable } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import { app, net } from 'electron';
import * as tar from 'tar';
import { createLogger } from '@kireimanga/shared';

const logger = createLogger('OcrSidecarDownloader');

/**
 * Tarball asset naming convention from Slice D.3:
 *   `kirei-ocr-{platform}-{arch}.tar.gz`
 * uploaded to:
 *   `https://github.com/Shironex/kirei-manga/releases/download/v<version>/<asset>`
 * The tar is built with `tar -czf <asset> -C <dir> .` so the binary lives at
 * the tarball root (no nested folder).
 */
const RELEASE_BASE = 'https://github.com/Shironex/kirei-manga/releases/download';

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * Resolves to `electron.net.fetch` in the main process; falls back to global
 * `fetch` so unit tests can mock without an Electron shim. Mirrors the
 * MangaDex client pattern.
 */
function getFetch(): FetchLike {
  if (net && typeof net.fetch === 'function') {
    return net.fetch.bind(net);
  }
  if (typeof globalThis.fetch !== 'function') {
    throw new Error('No fetch implementation available for sidecar download');
  }
  return globalThis.fetch.bind(globalThis);
}

/**
 * Map Node's `process.platform` / `process.arch` onto the asset naming used
 * by the release workflow. We only ship win32/darwin × x64/arm64 for v0.3 —
 * unknown combos throw eagerly so the renderer can surface a clear error.
 */
function resolvePlatformTriple(): { platform: string; arch: string } {
  const platform =
    process.platform === 'win32' || process.platform === 'darwin' || process.platform === 'linux'
      ? process.platform
      : null;
  const arch = process.arch === 'x64' || process.arch === 'arm64' ? process.arch : null;
  if (!platform || !arch) {
    throw new Error(
      `Unsupported sidecar platform: ${process.platform}/${process.arch}. ` +
        'Only win32/darwin/linux × x64/arm64 are published.'
    );
  }
  return { platform, arch };
}

/**
 * Resolve `userData` lazily and tolerate the Jest case where the Electron
 * stub is partial — same trick `getLocalCoverRoot()` uses.
 */
function resolveBinaryDir(): string {
  try {
    return path.join(app.getPath('userData'), 'sidecar', 'manga-ocr');
  } catch {
    return path.join(process.cwd(), '.userData', 'sidecar', 'manga-ocr');
  }
}

/**
 * Manages the on-disk OCR sidecar binary: discovery, on-first-use download
 * from GitHub Releases, atomic install, and platform-correct executable bit.
 * The {@link OcrSidecarService} owns the spawned process lifecycle — this
 * class only deals with the binary itself.
 */
@Injectable()
export class OcrSidecarDownloader {
  /** True when the platform-specific binary is present on disk. */
  async isAvailable(): Promise<boolean> {
    try {
      await fs.access(this.binaryPath());
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Download the platform tarball into `userData/sidecar/manga-ocr/`,
   * extract, and return the absolute binary path. `onProgress` is invoked
   * with cumulative bytes / `Content-Length` total during streaming.
   */
  async download(onProgress: (bytes: number, total: number) => void): Promise<string> {
    const binaryDir = resolveBinaryDir();
    await fs.mkdir(binaryDir, { recursive: true });

    const url = this.assetUrl();
    logger.info(`Downloading OCR sidecar from ${url}`);

    const fetchImpl = getFetch();
    const response = await fetchImpl(url);
    if (!response.ok) {
      throw new Error(
        `Sidecar download failed: ${response.status} ${response.statusText} for ${url}`
      );
    }

    const totalHeader = response.headers.get('content-length');
    const total = totalHeader ? Number(totalHeader) : 0;
    const body = response.body;
    if (!body) {
      throw new Error(`Sidecar download returned an empty body for ${url}`);
    }

    const tmpPath = path.join(binaryDir, 'kirei-ocr.tar.gz.tmp');
    // Stream chunks → tmp file. We write incrementally so a 450MB asset
    // never sits fully in memory and progress events stay accurate.
    const handle = await fs.open(tmpPath, 'w');
    let received = 0;
    try {
      const reader = body.getReader();
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value && value.byteLength > 0) {
          await handle.write(value);
          received += value.byteLength;
          onProgress(received, total);
        }
      }
    } finally {
      await handle.close();
    }

    // Tarball is `tar -czf … -C <dir> .` — extract straight into binaryDir.
    logger.info(`Extracting sidecar tarball to ${binaryDir}`);
    await tar.x({ file: tmpPath, cwd: binaryDir });

    // Drop the .tmp tarball — best-effort, don't block install on cleanup.
    try {
      await fs.unlink(tmpPath);
    } catch (err) {
      logger.warn(`Failed to remove tmp tarball ${tmpPath}: ${(err as Error).message}`);
    }

    const binary = this.binaryPath();
    await fs.access(binary); // throws if extraction did not produce the binary

    if (process.platform !== 'win32') {
      // POSIX: PyInstaller drops a non-executable file inside the tar; chmod
      // 755 so spawn() can launch it.
      await fs.chmod(binary, 0o755);
    }

    logger.info(`OCR sidecar installed at ${binary}`);
    return binary;
  }

  /** Absolute path to where the binary lives on disk (whether or not it exists yet). */
  binaryPath(): string {
    const binaryDir = resolveBinaryDir();
    const name = process.platform === 'win32' ? 'kirei-ocr.exe' : 'kirei-ocr';
    return path.join(binaryDir, name);
  }

  /** Fully-qualified GitHub Release asset URL for the running app version. */
  private assetUrl(): string {
    const { platform, arch } = resolvePlatformTriple();
    const version = this.appVersion();
    return `${RELEASE_BASE}/v${version}/kirei-ocr-${platform}-${arch}.tar.gz`;
  }

  /** Current Electron app version; falls back to package version env or 0.0.0. */
  private appVersion(): string {
    try {
      const v = app?.getVersion?.();
      if (v) return v;
    } catch {
      // not in Electron runtime
    }
    return process.env.npm_package_version ?? '0.0.0';
  }
}
