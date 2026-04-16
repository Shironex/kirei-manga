import { create } from 'zustand';

export type LibraryViewMode = 'grid' | 'list';

interface LibraryViewState {
  mode: LibraryViewMode;
}

interface LibraryViewActions {
  setMode: (mode: LibraryViewMode) => void;
}

// TODO: persist via middleware
export const useLibraryViewStore = create<LibraryViewState & LibraryViewActions>()(set => ({
  mode: 'grid',

  setMode: mode => set({ mode }),
}));
