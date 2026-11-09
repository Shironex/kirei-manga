import { useEffect, useState } from 'react';

import {
  chapterLabel,
  getSeriesDetail,
  getSeriesSettings,
  type ChapterEntry,
  type CoverRef,
} from '@/lib/library';
import { closeSource, openSource, pageMeta, type OpenedSource, type PageMeta } from '@/lib/reader';

import type { ChapterTarget } from './openChapter';

/** A neighbouring chapter of the same series, for the end card. */
export interface ChapterLink {
  seriesId: number;
  chapterId: number;
  label: string;
  title: string | null;
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
  /** ComicInfo `<Manga>`, for the default direction. */
  manga: string | null;
  /** Stored series settings, `null` for a file or nothing stored yet. */
  settings: unknown;
  /** The series cover, whose colours tint the reader chrome; `null` for a file. */
  cover: CoverRef | null;
  next: ChapterLink | null;
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
    manga: detail.manga,
    settings,
    cover: detail.cover,
    next: link(detail.id, nextChapter),
  };
}

function targetKey(target: ChapterTarget): string {
  return target.kind === 'file'
    ? `file:${target.path}:${target.page ?? ''}`
    : `lib:${target.seriesId}:${target.chapterId}:${target.page ?? ''}`;
}

/**
 * Opens the chapter a target names and closes its source when the target
 * changes or the reader unmounts. A load that finishes after the target moved
 * on is closed right away instead of shown.
 */
export function useChapter(target: ChapterTarget): ChapterState {
  const [state, setState] = useState<{ key: string; value: ChapterState }>(() => ({
    key: targetKey(target),
    value: { status: 'loading' },
  }));
  const key = targetKey(target);

  useEffect(() => {
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

  return state.key === key ? state.value : { status: 'loading' };
}
