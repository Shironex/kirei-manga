import { useEffect, useMemo, useState } from 'react';

import {
  chapterLabel,
  getSeriesDetail,
  getSeriesSettings,
  type ChapterEntry,
  type CoverRef,
} from '@/lib/library';
import { closeSource, openSource, pageMeta, type OpenedSource, type PageMeta } from '@/lib/reader';

import { loadOnlineChapter } from '@/features/online/onlineChapter';
import type { OnlineChapterRef } from '@/features/online/onlineProgress';

import type { ChapterTarget } from './openChapter';

/** A neighbouring chapter of the same series, for the end card. */
export type ChapterLink =
  | { kind?: 'library'; seriesId: number; chapterId: number; label: string; title: string | null }
  | { kind: 'online'; mangaId: string; chapterId: string; label: string; title: string | null };

/**
 * What a reader hands the next chapter when it flows into it, so the next one
 * opens at the same zoom and shows pages at once.
 */
export interface ReaderCarry {
  /** Zoom of the webtoon column. */
  webtoonScale: number;
  /** Render revision in effect, when the next chapter keeps the same box. */
  revision?: number;
}

/** An opened chapter with everything the reader screen shows around it. */
export interface LoadedChapter {
  source: OpenedSource;
  pages: PageMeta[];
  title: string;
  subtitle: string;
  /** Short name for the end card, such as `Ch. 42`. */
  label: string;
  seriesId: number | null;
  chapterId: number | null;
  /** Page to start on (0 based): the saved progress or the requested page. */
  startPage: number;
  /** Share of the start page already scrolled past in webtoon, 0 to 1. */
  startOffset: number;
  /** Handed over by the chapter before, when reading flowed into this one. */
  carry: ReaderCarry | null;
  /** ComicInfo `<Manga>`, for the default direction. */
  manga: string | null;
  /** Stored series settings, `null` for a file or nothing stored yet. */
  settings: unknown;
  /** The series cover, whose colours tint the reader chrome; `null` for a file. */
  cover: CoverRef | null;
  next: ChapterLink | null;
  /**
   * The MangaDex ids of an online chapter and its number, whose progress
   * syncs to MangaDex (and AniList, when the series is linked).
   */
  online?: OnlineChapterRef;
  /** The end card line when there is no next chapter. */
  lastNote?: string;
}

export type ChapterState =
  | { status: 'loading' }
  | { status: 'ready'; chapter: LoadedChapter }
  | { status: 'error'; message: string };

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function fileName(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

function link(seriesId: number, chapter: ChapterEntry | undefined): ChapterLink | null {
  if (!chapter) return null;
  return { seriesId, chapterId: chapter.id, label: chapterLabel(chapter), title: chapter.title };
}

/** Where a page index lands once clamped to a chapter of `count` pages. */
function clampPage(page: number, count: number): number {
  return Math.min(Math.max(0, Math.trunc(page)), Math.max(0, count - 1));
}

async function load(target: ChapterTarget): Promise<LoadedChapter> {
  if (target.kind === 'online') return loadOnlineChapter(target);
  if (target.kind === 'file') {
    const source = await openSource(target.path);
    const meta = await pageMeta(source.id);
    return {
      source,
      pages: meta.pages,
      title: fileName(target.path),
      subtitle: `${source.kind.toUpperCase()}, ${source.pages.length} pages`,
      label: fileName(target.path),
      seriesId: null,
      chapterId: null,
      startPage: clampPage(target.page ?? 0, source.pages.length),
      startOffset: 0,
      carry: null,
      manga: null,
      settings: null,
      cover: null,
      next: null,
    };
  }

  const detail = await getSeriesDetail(target.seriesId);
  if (!detail) throw new Error('This series is no longer in the library.');
  const position = detail.chapters.findIndex(chapter => chapter.id === target.chapterId);
  const chapter = detail.chapters[position];
  if (!chapter) throw new Error('This chapter is no longer in the library.');
  if (chapter.missing) throw new Error('The file for this chapter is missing from disk.');

  const [source, settings] = await Promise.all([
    openSource(chapter.path),
    // Settings are a nicety: a failed read starts from the defaults.
    getSeriesSettings(target.seriesId).catch(() => null),
  ]);
  const meta = await pageMeta(source.id);
  const label = chapterLabel(chapter);
  const resume = chapter.progress && !chapter.progress.completed ? chapter.progress.page : 0;
  const nextChapter = detail.chapters.slice(position + 1).find(entry => !entry.missing);
  const credits = [
    chapter.title && chapter.title !== label ? chapter.title : null,
    chapter.scanGroup,
  ]
    .filter(Boolean)
    .join(' · ');

  return {
    source,
    pages: meta.pages,
    title: detail.title,
    subtitle: credits ? `${label}, ${credits}` : label,
    label,
    seriesId: detail.id,
    chapterId: chapter.id,
    startPage: clampPage(target.page ?? resume, source.pages.length),
    startOffset: 0,
    carry: null,
    manga: detail.manga,
    settings,
    cover: detail.cover,
    next: link(detail.id, nextChapter),
  };
}

function targetKey(target: ChapterTarget): string {
  switch (target.kind) {
    case 'file':
      return `file:${target.path}:${target.page ?? ''}`;
    case 'online':
      return `online:${target.mangaId}:${target.chapterId}:${target.page ?? ''}`;
    case 'library':
      return `lib:${target.seriesId}:${target.chapterId}:${target.page ?? ''}`;
  }
}

/** The target that opens `next` from its first page, as the end card does. */
export function nextTarget(next: ChapterLink): ChapterTarget {
  return next.kind === 'online'
    ? { kind: 'online', mangaId: next.mangaId, chapterId: next.chapterId, page: 0 }
    : { kind: 'library', seriesId: next.seriesId, chapterId: next.chapterId, page: 0 };
}

/** Where reading left off when one chapter flowed into the next. */
export interface Handoff {
  page: number;
  offset: number;
  carry: ReaderCarry;
  /** The series settings as the reader last wrote them (a save may be pending). */
  settings: unknown;
}

interface Prefetch {
  promise: Promise<LoadedChapter>;
  chapter: LoadedChapter | null;
  /** Readers that still want it: the one before (prefetching), the one using it. */
  holders: number;
  handoff: Handoff | null;
  shown: LoadedChapter | null;
}

/**
 * Chapters opened ahead of time, by target key. The reader opens the next
 * chapter while the current one nears its end, so moving on needs no
 * loading screen and the webtoon strip can show the next pages under the
 * last ones. An entry closes its source once nobody holds it.
 */
const prefetched = new Map<string, Prefetch>();

function release(key: string, entry: Prefetch): void {
  entry.holders -= 1;
  // Deferred, so the reader that takes over (mounting in the same commit as
  // the old one unmounts, or remounting under StrictMode) can hold it first.
  setTimeout(() => {
    if (entry.holders > 0 || prefetched.get(key) !== entry) return;
    prefetched.delete(key);
    entry.promise.then(chapter => closeSource(chapter.source.id)).catch(() => {});
  }, 0);
}

function hold(key: string, entry: Prefetch): () => void {
  entry.holders += 1;
  return () => release(key, entry);
}

/**
 * Opens `target` ahead of time (or joins an open in flight) and holds it
 * until `release` is called. A failed open is dropped, so the normal open
 * can try again and show the error.
 */
export function prefetchChapter(target: ChapterTarget): {
  promise: Promise<LoadedChapter>;
  release: () => void;
} {
  const key = targetKey(target);
  let entry = prefetched.get(key);
  if (!entry) {
    const created: Prefetch = {
      promise: load(target),
      chapter: null,
      holders: 0,
      handoff: null,
      shown: null,
    };
    created.promise.then(
      chapter => {
        created.chapter = chapter;
      },
      () => {
        if (prefetched.get(key) === created) prefetched.delete(key);
      }
    );
    prefetched.set(key, created);
    entry = created;
  }
  return { promise: entry.promise, release: hold(key, entry) };
}

/** Tells a prefetched chapter where the reader left off before opening it. */
export function handOver(target: ChapterTarget, handoff: Handoff): void {
  const entry = prefetched.get(targetKey(target));
  if (entry && !entry.shown) entry.handoff = handoff;
}

/** A prefetched chapter that is ready, with its handoff applied (once, then kept). */
export function prefetchedChapter(target: ChapterTarget): LoadedChapter | null {
  return readyChapter(targetKey(target));
}

function readyChapter(key: string): LoadedChapter | null {
  const entry = prefetched.get(key);
  if (!entry?.chapter) return null;
  if (!entry.shown) {
    const { chapter, handoff } = entry;
    entry.shown = handoff
      ? {
          ...chapter,
          settings: handoff.settings ?? chapter.settings,
          startPage: clampPage(handoff.page, chapter.pages.length),
          startOffset: Math.min(1, Math.max(0, handoff.offset)),
          carry: handoff.carry,
        }
      : chapter;
  }
  return entry.shown;
}

/**
 * Opens the chapter a target names and closes its source when the target
 * changes or the reader unmounts. A load that finishes after the target moved
 * on is closed right away instead of shown. A chapter the previous one opened
 * ahead (`prefetchChapter`) is taken over as it is, already loaded.
 */
export function useChapter(target: ChapterTarget): ChapterState {
  const [state, setState] = useState<{ key: string; value: ChapterState }>(() => ({
    key: targetKey(target),
    value: { status: 'loading' },
  }));
  const key = targetKey(target);
  // Opened ahead by the chapter before: shown in the first render, no loading.
  const ready = useMemo(() => readyChapter(key), [key]);

  useEffect(() => {
    const entry = prefetched.get(key);
    if (ready && entry) return hold(key, entry);
    let alive = true;
    let opened: number | null = null;
    load(target).then(
      chapter => {
        opened = chapter.source.id;
        if (alive) setState({ key, value: { status: 'ready', chapter } });
        else void closeSource(chapter.source.id);
      },
      (error: unknown) => {
        if (alive) setState({ key, value: { status: 'error', message: message(error) } });
      }
    );
    return () => {
      alive = false;
      if (opened !== null) void closeSource(opened);
    };
    // The key captures every field of the target.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (ready) return { status: 'ready', chapter: ready };
  return state.key === key ? state.value : { status: 'loading' };
}
