import { invoke } from '@tauri-apps/api/core';

/**
 * Data folder, backup and restore commands (src-tauri/src/data.rs). The file
 * format and the restore steps are described in docs/data.md.
 */

/** Mirrors `kirei_library::BackupManifest`. */
export interface BackupManifest {
  app: string;
  format: number;
  appVersion: string;
  schemaVersion: number;
  /** Unix milliseconds (UTC). */
  createdAt: number;
  includesCovers: boolean;
  coverCount: number;
  databaseBytes: number;
  databaseBlake3: string;
}

/** Mirrors `kirei_library::RestoreOutcome`. */
export interface RestoreOutcome {
  manifest: BackupManifest;
  /** Where the replaced data was moved. */
  previousData: string;
}

/** Mirrors the shell's `DataInfo`. */
export interface DataInfo {
  mode: 'installed' | 'portable';
  root: string;
  database: string;
  covers: string;
  backups: string;
  /** Set when this launch applied a staged restore. */
  lastRestore: RestoreOutcome | null;
  /** Why the restore at this launch failed; the previous data was kept. */
  restoreError: string | null;
}

/** File extension of a backup, without the dot. */
export const BACKUP_EXTENSION = 'kireibackup';

export function getDataInfo(): Promise<DataInfo> {
  return invoke<DataInfo>('data_info');
}

export function createBackup(path: string, includeCovers: boolean): Promise<BackupManifest> {
  return invoke<BackupManifest>('backup_create', { path, includeCovers });
}

/** Validates a backup fully and returns what it holds. Changes nothing. */
export function inspectBackup(path: string): Promise<BackupManifest> {
  return invoke<BackupManifest>('backup_inspect', { path });
}

/** Validates and stages a backup; the swap happens at the next launch. */
export function restoreBackup(path: string): Promise<BackupManifest> {
  return invoke<BackupManifest>('backup_restore', { path });
}

/** Restarts the app, which finishes a staged restore. Does not resolve. */
export function restartApp(): Promise<void> {
  return invoke('app_restart');
}

/** `kireimanga-2026-11-08.kireibackup` for the given day (local time). */
export function backupFileName(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const day = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return `kireimanga-${day}.${BACKUP_EXTENSION}`;
}

/** The last segment of a path, on either separator. */
export function fileName(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}

/** A refused backup or restore, in words for the Settings screen. */
export interface BackupProblem {
  /** One plain sentence. */
  summary: string;
  /** The message from Rust, for the curious and for bug reports. */
  detail: string;
}

/**
 * Maps the error strings from kirei-library (`LibraryError::NewerBackup`,
 * `InvalidBackup`, `Io`) to plain words. Anything unknown keeps its message.
 */
export function describeBackupError(error: unknown): BackupProblem {
  const detail = error instanceof Error ? error.message : String(error);
  const lower = detail.toLowerCase();
  if (lower.includes('made by a newer kireimanga')) {
    return {
      summary: 'This backup comes from a newer KireiManga. Update the app, then restore it.',
      detail,
    };
  }
  if (lower.includes('not a usable kireimanga backup') || lower.includes('is damaged')) {
    return {
      summary: 'This file is damaged or is not a KireiManga backup. Nothing was changed.',
      detail,
    };
  }
  if (lower.startsWith('cannot read')) {
    return {
      summary:
        'KireiManga could not read or write a file it needed. Check that the folder is there and has room, then try again.',
      detail,
    };
  }
  return { summary: detail, detail };
}

/** Adds `.kireibackup` when the save dialog returned a path without it. */
export function withBackupExtension(path: string): string {
  return path.toLowerCase().endsWith(`.${BACKUP_EXTENSION}`) ? path : `${path}.${BACKUP_EXTENSION}`;
}
