/**
 * Format of a local chapter's on-disk storage. Folder = a directory of image
 * files. CBZ/ZIP = zip archives. CBR = RAR archives (Slice C — may not ship
 * in v0.2). The v0.2 scanner + archive reader filter unsupported formats at
 * detection time so this union never represents a runtime-only placeholder.
 */
export type LocalArchiveFormat = 'folder' | 'cbz' | 'cbr' | 'zip';

/**
 * Partial metadata patch a user can apply to a local series via the manual
 * metadata editor (Slice J). Fields map 1:1 onto `series` columns. Omitted
 * fields are preserved. `score` is clamped to 1–10 by the desktop handler.
 */
export interface LocalSeriesMetaPatch {
  title?: string;
  titleJapanese?: string;
  notes?: string;
  score?: number;
  coverPath?: string;
}

/**
 * Per-chapter patch from the inline chapter-list editor. Used to correct
 * mis-parsed numbers or folder-name titles.
 */
export interface LocalChapterMetaPatch {
  chapterNumber?: number;
  volumeNumber?: number;
  title?: string;
}

/**
 * Scanner lifecycle phase. Broadcast as part of `ScanProgress` so the UI
 * can pick the right copy/spinner for what's happening.
 *   - `scanning`      walking the filesystem tree
 *   - `reading-archives` cracking open each archive to count pages / pick a cover
 *   - `done`          scanner has emitted its final `ScanResult`
 */
export type ScanPhase = 'scanning' | 'reading-archives' | 'done';

/**
 * Incremental progress event emitted by the scanner during a long-running
 * scan. `currentPath` is the last path the scanner started processing — it
 * may be a directory while scanning, or an archive while reading. Debounced
 * to ~200ms by the gateway; consumers should not assume every change surfaces.
 */
export interface ScanProgress {
  phase: ScanPhase;
  current: number;
  total: number;
  currentPath?: string;
}

/**
 * A chapter the scanner proposes importing. `relativePath` is relative to the
 * enclosing series' `absolutePath` so the UI can render it compactly and so
 * the import step can re-resolve it without depending on the scan's cwd.
 * `chapterNumber` / `volumeNumber` are `null` when the filename didn't match
 * the inference regex — the UI renders these as "—" and the manual editor
 * (Slice J) lets the user fix them post-import.
 */
export interface ScanCandidateChapter {
  relativePath: string;
  chapterNumber: number | null;
  volumeNumber: number | null;
  pageCount: number;
  format: LocalArchiveFormat;
}

/**
 * A series the scanner proposes importing. `suggestedTitle` comes from the
 * folder name (with common noise stripped — e.g. square-bracket group tags).
 * `coverCandidatePath` is the absolute path of the first page of the first
 * chapter; the desktop copies it into `userData/covers/local/{seriesId}/`
 * at import time and never exposes the raw path to the renderer.
 */
export interface ScanCandidateSeries {
  absolutePath: string;
  suggestedTitle: string;
  coverCandidatePath?: string;
  chapters: ScanCandidateChapter[];
}

/**
 * Final scanner output. `rootPath` matches the user-selected root so the
 * follow-up import step can persist it on the `series.local_root_path`
 * column for rescans (Slice L).
 */
export interface ScanResult {
  rootPath: string;
  scannedAt: string;
  candidates: ScanCandidateSeries[];
}
