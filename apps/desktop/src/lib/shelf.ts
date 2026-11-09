import { invoke } from '@tauri-apps/api/core';

import { coverFileUrl } from './online';

/**
 * Collections, tags, Want to Read and smart filters, mirrored from
 * `kirei_library` (see `docs/collections.md`). Every call goes through the
 * `shelf_*` commands in `src-tauri/src/shelf.rs`.
 */

/**
 * Names a series for the shelf: a series of the local library, or a title of
 * an online source that may not be on disk. Mirrors `kirei_library::SeriesRef`.
 * `title` and `coverFile` (the MangaDex cover file name) of a remote title are
 * cached so lists show it offline; `itemCoverSrc` turns them into an image URL.
 */
export type SeriesRef =
  | { source: 'local'; seriesId: number }
  | { source: 'mangadex'; remoteId: string; title?: string | null; coverFile?: string | null };

export type ItemSource = 'local' | 'mangadex';

/** One series in a list. A local one is drawn from the catalogue by `seriesId`. */
export interface ShelfItem {
  /** Null for a local series nothing was organised on yet (filter results only). */
  refId: number | null;
  seriesId: number | null;
  source: ItemSource;
  remoteId: string | null;
  title: string;
  coverFile: string | null;
  /** When it joined the list; for filter results, when the series was added. */
  addedAt: number;
}

export interface Tag {
  id: number;
  name: string;
  /** Live series that carry it. */
  count: number;
}

export interface Collection {
  id: number;
  name: string;
  position: number;
  count: number;
  coverRefId: number | null;
  /** The cover member (picked, else the first) and the next few, in order. */
  preview: ShelfItem[];
  updatedAt: number;
}

export type TagMode = 'any' | 'all';
export type ReadStatus = 'unread' | 'reading' | 'finished';
export type SourceFilter = 'local' | 'mangadex';
export type FilterSort = 'title' | 'added' | 'recent' | 'unread';

/** A smart filter, mirrors `kirei_library::FilterQuery`. Every criterion must hold. */
export interface FilterQuery {
  tags: number[];
  tagMode: TagMode;
  excludeTags: number[];
  collections: number[];
  /** True: only Want to Read. False: none of it. Null: either. */
  wantToRead: boolean | null;
  status: ReadStatus[];
  minUnread: number | null;
  languages: string[];
  source: SourceFilter | null;
  addedWithinDays: number | null;
  sort: FilterSort;
}

export interface SmartFilter {
  id: number;
  name: string;
  query: FilterQuery;
  pinned: boolean;
  position: number;
  updatedAt: number;
}

export interface FilterResult {
  items: ShelfItem[];
  total: number;
}

export interface ShelfOverview {
  wantCount: number;
  collections: Collection[];
  tags: Tag[];
  filters: SmartFilter[];
}

/** A tag or collection, with how many of a selection carry it. */
export interface Membership {
  id: number;
  name: string;
  count: number;
}

export interface SelectionShelf {
  size: number;
  wantCount: number;
  tags: Membership[];
  collections: Membership[];
}

/** The most rows one evaluation returns, mirrors `MAX_FILTER_ROWS`. */
export const MAX_FILTER_ROWS = 10_000;
/** The longest name a tag, collection or filter may have, mirrors `MAX_NAME_CHARS`. */
export const MAX_NAME_CHARS = 80;

export const EMPTY_QUERY: FilterQuery = {
  tags: [],
  tagMode: 'any',
  excludeTags: [],
  collections: [],
  wantToRead: null,
  status: [],
  minUnread: null,
  languages: [],
  source: null,
  addedWithinDays: null,
  sort: 'title',
};

export const localRef = (seriesId: number): SeriesRef => ({ source: 'local', seriesId });

export const getShelfOverview = () => invoke<ShelfOverview>('shelf_overview');
export const getSelectionShelf = (series: SeriesRef[]) =>
  invoke<SelectionShelf>('shelf_selection', { series });

export const getWantToRead = () => invoke<ShelfItem[]>('shelf_want_to_read');
export const setWantToRead = (refs: SeriesRef[], want: boolean) =>
  invoke<void>('shelf_set_want', { refs, want });

export const tagSeries = (refs: SeriesRef[], name: string) =>
  invoke<Tag>('shelf_tag', { refs, name });
export const untagSeries = (refs: SeriesRef[], tagId: number) =>
  invoke<void>('shelf_untag', { refs, tagId });
export const renameTag = (tagId: number, name: string) =>
  invoke<Tag>('shelf_rename_tag', { tagId, name });
export const deleteTag = (tagId: number) => invoke<boolean>('shelf_delete_tag', { tagId });

export const createCollection = (name: string) =>
  invoke<Collection>('shelf_create_collection', { name });
export const renameCollection = (id: number, name: string) =>
  invoke<Collection>('shelf_rename_collection', { id, name });
export const deleteCollection = (id: number) => invoke<boolean>('shelf_delete_collection', { id });
export const reorderCollections = (ids: number[]) =>
  invoke<void>('shelf_reorder_collections', { ids });
export const setCollectionCover = (id: number, refId: number | null) =>
  invoke<Collection>('shelf_set_collection_cover', { id, refId });
export const getCollectionItems = (id: number) =>
  invoke<ShelfItem[]>('shelf_collection_items', { id });
export const addToCollection = (id: number, refs: SeriesRef[]) =>
  invoke<void>('shelf_add_to_collection', { id, refs });
export const removeFromCollection = (id: number, refs: SeriesRef[]) =>
  invoke<void>('shelf_remove_from_collection', { id, refs });
export const reorderCollection = (id: number, refIds: number[]) =>
  invoke<void>('shelf_reorder_collection', { id, refIds });

export const runFilter = (query: FilterQuery, limit: number) =>
  invoke<FilterResult>('shelf_run_filter', { query, limit });
export const saveFilter = (id: number | null, name: string, query: FilterQuery, pinned: boolean) =>
  invoke<SmartFilter>('shelf_save_filter', { id, name, query, pinned });
export const pinFilter = (id: number, pinned: boolean) =>
  invoke<void>('shelf_pin_filter', { id, pinned });
export const deleteFilter = (id: number) => invoke<boolean>('shelf_delete_filter', { id });
export const reorderFilters = (ids: number[]) => invoke<void>('shelf_reorder_filters', { ids });
export const getLanguages = () => invoke<string[]>('shelf_languages');

/** The ref a list item stands for, to pass back to the shelf commands. */
export function itemRef(item: ShelfItem): SeriesRef {
  if (item.seriesId !== null) return localRef(item.seriesId);
  return {
    source: 'mangadex',
    remoteId: item.remoteId ?? '',
    title: item.title,
    coverFile: item.coverFile,
  };
}

/** Image of a remote title, through the MangaDex cover scheme; null for a local series. */
export function itemCoverSrc(item: ShelfItem): string | null {
  if (item.source !== 'mangadex' || !item.remoteId || !item.coverFile) return null;
  return coverFileUrl(item.remoteId, item.coverFile);
}

/** Stable key for a list item: local series by id, remote titles by source id. */
export function itemKey(item: ShelfItem): string {
  return item.seriesId !== null ? `s:${item.seriesId}` : `r:${item.source}:${item.remoteId ?? ''}`;
}
