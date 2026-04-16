import { Search } from 'lucide-react';
import { useBrowseStore } from '@/stores/browse-store';
import { useT } from '@/hooks/useT';

/**
 * Full-width 56px search bar. Writes to the browse store so the TopBar and
 * the Browse page share a single source of truth.
 */
export function SearchBar() {
  const t = useT();
  const query = useBrowseStore(s => s.query);
  const setQuery = useBrowseStore(s => s.setQuery);

  return (
    <label className="group relative flex h-14 w-full items-center gap-4 border-b border-[var(--color-border)] transition-colors focus-within:border-[var(--color-accent)]">
      <Search className="h-4 w-4 stroke-[1.3] text-[var(--color-bone-faint)] transition-colors group-focus-within:text-[var(--color-accent)]" />
      <input
        type="search"
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder={t('browse.search.placeholder')}
        className="font-display flex-1 bg-transparent text-[18px] font-[350] tracking-[-0.01em] text-foreground italic placeholder:text-[var(--color-bone-faint)] placeholder:italic focus:outline-none"
        style={{ outline: 'none' }}
        autoFocus
      />
    </label>
  );
}
