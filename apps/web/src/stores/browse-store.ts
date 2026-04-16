import { create } from 'zustand';
import type {
  SearchFilters,
  MangaDexContentRating,
  MangaDexDemographic,
  MangaDexStatus,
} from '@kireimanga/shared';

export interface BrowseFilters {
  contentRating: MangaDexContentRating[];
  demographic: MangaDexDemographic[];
  status: MangaDexStatus[];
  availableTranslatedLanguage: string[];
}

interface BrowseState {
  query: string;
  filters: BrowseFilters;
}

interface BrowseActions {
  setQuery: (q: string) => void;
  toggleContentRating: (value: MangaDexContentRating) => void;
  toggleDemographic: (value: MangaDexDemographic) => void;
  toggleStatus: (value: MangaDexStatus) => void;
  toggleLanguage: (value: string) => void;
  clearFilters: () => void;
}

const INITIAL_FILTERS: BrowseFilters = {
  contentRating: ['safe', 'suggestive'],
  demographic: [],
  status: [],
  availableTranslatedLanguage: [],
};

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter(v => v !== value) : [...list, value];
}

export const useBrowseStore = create<BrowseState & BrowseActions>()(set => ({
  query: '',
  filters: INITIAL_FILTERS,

  setQuery: q => set({ query: q }),
  toggleContentRating: value =>
    set(state => ({
      filters: { ...state.filters, contentRating: toggle(state.filters.contentRating, value) },
    })),
  toggleDemographic: value =>
    set(state => ({
      filters: { ...state.filters, demographic: toggle(state.filters.demographic, value) },
    })),
  toggleStatus: value =>
    set(state => ({ filters: { ...state.filters, status: toggle(state.filters.status, value) } })),
  toggleLanguage: value =>
    set(state => ({
      filters: {
        ...state.filters,
        availableTranslatedLanguage: toggle(state.filters.availableTranslatedLanguage, value),
      },
    })),
  clearFilters: () => set({ filters: INITIAL_FILTERS }),
}));

/** Project the editorial store shape into the API-level `SearchFilters`. */
export function toSearchFilters(filters: BrowseFilters): SearchFilters {
  const f: SearchFilters = {
    contentRating: filters.contentRating.length ? filters.contentRating : undefined,
    publicationDemographic: filters.demographic.length ? filters.demographic : undefined,
    status: filters.status.length ? filters.status : undefined,
    availableTranslatedLanguage: filters.availableTranslatedLanguage.length
      ? filters.availableTranslatedLanguage
      : undefined,
    order: { relevance: 'desc' },
  };
  return f;
}
