import { create } from 'zustand';
import type { ReadingStatus } from '@kireimanga/shared';

export type LibraryViewMode = 'grid' | 'list';
export type LibrarySort = 'title' | 'lastRead' | 'dateAdded' | 'progress';
export type LibrarySortDir = 'asc' | 'desc';
export type LibraryStatusFilter = ReadingStatus | 'all';
export type LibrarySourceFilter = 'all' | 'mangadex' | 'local';

interface LibraryViewState {
  mode: LibraryViewMode;
  sort: LibrarySort;
  sortDir: LibrarySortDir;
  statusFilter: LibraryStatusFilter;
  sourceFilter: LibrarySourceFilter;
  query: string;
}

interface LibraryViewActions {
  setMode: (mode: LibraryViewMode) => void;
  setSort: (sort: LibrarySort) => void;
  setSortDir: (dir: LibrarySortDir) => void;
  toggleSortDir: () => void;
  setStatusFilter: (filter: LibraryStatusFilter) => void;
  setSourceFilter: (filter: LibrarySourceFilter) => void;
  setQuery: (q: string) => void;
}

// TODO: persist via middleware
export const useLibraryViewStore = create<LibraryViewState & LibraryViewActions>()(set => ({
  mode: 'grid',
  sort: 'lastRead',
  sortDir: 'desc',
  statusFilter: 'all',
  sourceFilter: 'all',
  query: '',

  setMode: mode => set({ mode }),
  setSort: sort => set({ sort }),
  setSortDir: sortDir => set({ sortDir }),
  toggleSortDir: () => set(state => ({ sortDir: state.sortDir === 'asc' ? 'desc' : 'asc' })),
  setStatusFilter: statusFilter => set({ statusFilter }),
  setSourceFilter: sourceFilter => set({ sourceFilter }),
  setQuery: query => set({ query }),
}));
