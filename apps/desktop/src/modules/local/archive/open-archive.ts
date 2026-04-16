import * as fs from 'fs/promises';
import type { LocalArchiveFormat } from '@kireimanga/shared';
import { type ArchiveReader, getExtension } from './archive-reader';
import { ZipArchiveReader } from './zip-archive-reader';
import { FolderArchiveReader } from './folder-archive-reader';

/**
 * Map a file extension to the archive format we'll use to read it. Case-
 * insensitive. Returns `null` for anything we can't handle — callers treat
 * that as "skip this entry" rather than throwing, since the scanner can
 * encounter odd files (PDF, mobi) in a user's manga folder.
 */
export function inferArchiveFormat(
  absolutePath: string,
  isDirectory: boolean
): LocalArchiveFormat | null {
  if (isDirectory) return 'folder';
  const ext = getExtension(absolutePath);
  if (ext === 'cbz') return 'cbz';
  if (ext === 'zip') return 'zip';
  if (ext === 'cbr') return 'cbr';
  return null;
}

/**
 * Open the given path for page reading. `format` overrides the
 * extension/stat-based inference — the scanner typically knows the format
 * already and passes it through to avoid a redundant `stat`.
 *
 * CBR is not yet supported in v0.2 (Slice C); requesting it throws rather
 * than silently succeeding so an accidental misroute fails loudly. The
 * scanner filters CBR out at detection time so users never reach here with
 * CBR under normal operation.
 */
export async function openArchive(
  absolutePath: string,
  format?: LocalArchiveFormat
): Promise<ArchiveReader> {
  let resolved = format ?? null;

  if (!resolved) {
    const stat = await fs.stat(absolutePath);
    resolved = inferArchiveFormat(absolutePath, stat.isDirectory());
  }

  if (!resolved) {
    throw new Error(`openArchive: unsupported path ${absolutePath}`);
  }

  switch (resolved) {
    case 'folder':
      return new FolderArchiveReader(absolutePath);
    case 'cbz':
    case 'zip':
      return new ZipArchiveReader(absolutePath);
    case 'cbr':
      throw new Error('openArchive: CBR support not yet available (v0.2 Slice C)');
  }
}
