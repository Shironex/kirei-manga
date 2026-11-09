import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Search, SlidersHorizontal } from 'lucide-react';

import { EmptyState } from '@/components/page/EmptyState';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  getTags,
  searchManga,
  toOnlineError,
  type Demographic,
  type Manga,
  type OnlineError,
  type PublicationStatus,
  type SearchOrder,
  type Tag,
} from '@/lib/online';
import { useSetting } from '@/lib/settings/store';
import { cn } from '@/lib/utils';

import { LanguagePicker } from './LanguagePicker';
import { MangaCard, MangaGrid } from './MangaCard';
import { bestText, errorText, languageLabel } from './model';
import { EMPTY_FILTERS, nextTagState, toggle, toQuery, type Filters } from './search';

const TYPING_PAUSE_MS = 400;

const STATUSES: { value: PublicationStatus; label: string }[] = [
  { value: 'ongoing', label: 'Ongoing' },
  { value: 'completed', label: 'Completed' },
  { value: 'hiatus', label: 'Hiatus' },
  { value: 'cancelled', label: 'Cancelled' },
];

const DEMOGRAPHICS: { value: Demographic; label: string }[] = [
  { value: 'shounen', label: 'Shounen' },
  { value: 'shoujo', label: 'Shoujo' },
  { value: 'seinen', label: 'Seinen' },
  { value: 'josei', label: 'Josei' },
];

const ORDERS: { value: SearchOrder | 'auto'; label: string }[] = [
  { value: 'auto', label: 'Best match' },
  { value: 'latestUploadedChapter', label: 'Latest chapter' },
  { value: 'followedCount', label: 'Most followed' },
  { value: 'rating', label: 'Top rated' },
  { value: 'createdAt', label: 'Newest series' },
  { value: 'title', label: 'Title' },
];

/** Kept for the session, so coming back to Browse shows the same search. */
let remembered: Filters = EMPTY_FILTERS;

interface Results {
  items: Manga[];
  total: number;
}

/** Search MangaDex: a title box, filters, tags and the language picker over a cover grid. */
export function SearchView() {
  const [filters, setFilters] = useState<Filters>(remembered);
  const [typed, setTyped] = useState(remembered.title);
  const [showFilters, setShowFilters] = useState(false);
  const [results, setResults] = useState<Results | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<OnlineError | null>(null);
  const [chain] = useSetting('online.languages');
  const [only] = useSetting('online.onlyMyLanguage');
  const [ratings] = useSetting('online.contentRatings');

  // The title waits for a pause in typing; other filters apply at once.
  useEffect(() => {
    const timer = setTimeout(
      () => setFilters(current => ({ ...current, title: typed })),
      TYPING_PAUSE_MS
    );
    return () => clearTimeout(timer);
  }, [typed]);

  useEffect(() => {
    remembered = filters;
  }, [filters]);

  // Languages and ratings change what MangaDex returns, so they restart the search too.
  const languageKey = `${chain.join(',')}|${only}|${ratings.join(',')}`;
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    searchManga(toQuery(filters)).then(
      page => {
        if (!alive) return;
        setResults({ items: page.items, total: page.total });
        setLoading(false);
      },
      (reason: unknown) => {
        if (!alive) return;
        setError(toOnlineError(reason));
        setLoading(false);
      }
    );
    return () => {
      alive = false;
    };
  }, [filters, languageKey]);

  const loadMore = () => {
    if (!results) return;
    setLoading(true);
    searchManga(toQuery(filters, results.items.length)).then(
      page => {
        setResults(current => ({
          items: [...(current?.items ?? []), ...page.items],
          total: page.total,
        }));
        setLoading(false);
      },
      (reason: unknown) => {
        setError(toOnlineError(reason));
        setLoading(false);
      }
    );
  };

  const activeFilters =
    filters.status.length +
    filters.demographic.length +
    Object.keys(filters.tags).length +
    (filters.anyLanguage ? 1 : 0);
  const languages = only ? languageLabel(chain[0] ?? 'pl') : chain.map(languageLabel).join(', ');

  return (
    <section aria-label="Search MangaDex">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Input
          type="search"
          aria-label="Search MangaDex by title"
          placeholder="Search MangaDex"
          icon={<Search />}
          value={typed}
          onChange={event => setTyped(event.target.value)}
          className="min-w-[260px] flex-1"
        />
        <Select
          value={filters.order}
          onValueChange={value => setFilters(f => ({ ...f, order: value as Filters['order'] }))}
        >
          <SelectTrigger aria-label="Sort by" className="h-11 w-44 rounded-pill">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ORDERS.map(order => (
              <SelectItem key={order.value} value={order.value}>
                {order.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant={showFilters ? 'secondary' : 'ghost'}
          aria-expanded={showFilters}
          aria-controls="search-filters"
          onClick={() => setShowFilters(open => !open)}
        >
          <SlidersHorizontal /> Filters
          {activeFilters > 0 && <span className="tabular text-accent">{activeFilters}</span>}
          <ChevronDown className={cn('transition-transform', showFilters && 'rotate-180')} />
        </Button>
      </div>

      <LanguagePicker className="mb-4" />

      {showFilters && (
        <FilterPanel
          filters={filters}
          onChange={setFilters}
          onReset={() => {
            setFilters({ ...EMPTY_FILTERS, title: filters.title });
          }}
        />
      )}

      <p aria-live="polite" className="m-0 mb-4 text-sm text-fg-3">
        {loading && !results
          ? 'Searching MangaDex'
          : results
            ? `${results.total.toLocaleString('en')} series${filters.anyLanguage ? '' : ` with chapters in ${languages}`}`
            : ''}
      </p>

      {error && (
        <EmptyState
          tone="alert"
          title="The search did not go through"
          actions={
            <Button variant="primary" onClick={() => setFilters(f => ({ ...f }))}>
              Try again
            </Button>
          }
        >
          <p>{errorText(error)}</p>
        </EmptyState>
      )}

      {results && results.items.length === 0 && !error && !loading && (
        <EmptyState title="Nothing matches">
          <p>
            {filters.anyLanguage
              ? 'Try fewer filters or another title.'
              : `No series with chapters in ${languages} match. Add a fallback language, or turn on "Any language" in the filters.`}
          </p>
        </EmptyState>
      )}

      {results && results.items.length > 0 && (
        <>
          <MangaGrid label="Search results">
            {results.items.map(manga => (
              <li key={manga.id}>
                <MangaCard manga={manga} />
              </li>
            ))}
          </MangaGrid>
          {results.items.length < results.total && (
            <div className="mt-8 flex justify-center">
              <Button variant="secondary" disabled={loading} onClick={loadMore}>
                {loading ? 'Loading' : 'Show more'}
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function FilterPanel({
  filters,
  onChange,
  onReset,
}: {
  filters: Filters;
  onChange: (update: (current: Filters) => Filters) => void;
  onReset: () => void;
}) {
  const [tags, setTags] = useState<Tag[] | null>(null);
  const [tagError, setTagError] = useState<string | null>(null);
  const [chain] = useSetting('online.languages');

  useEffect(() => {
    let alive = true;
    getTags().then(
      list => alive && setTags(list),
      (reason: unknown) => alive && setTagError(errorText(toOnlineError(reason)))
    );
    return () => {
      alive = false;
    };
  }, []);

  const groups = useMemo(() => {
    const byGroup = new Map<string, { id: string; name: string }[]>();
    for (const tag of tags ?? []) {
      const list = byGroup.get(tag.group) ?? [];
      list.push({ id: tag.id, name: bestText(tag.name, chain) ?? tag.id });
      byGroup.set(tag.group, list);
    }
    for (const list of byGroup.values()) list.sort((a, b) => a.name.localeCompare(b.name));
    return [...byGroup.entries()];
  }, [tags, chain]);

  return (
    <div
      id="search-filters"
      className="mb-6 grid gap-5 rounded-panel border border-line bg-ink-1 p-6"
    >
      <FilterRow label="Status">
        {STATUSES.map(status => (
          <Chip
            key={status.value}
            pressed={filters.status.includes(status.value)}
            onPressedChange={() =>
              onChange(f => ({ ...f, status: toggle(f.status, status.value) }))
            }
          >
            {status.label}
          </Chip>
        ))}
      </FilterRow>
      <FilterRow label="Demographic">
        {DEMOGRAPHICS.map(demo => (
          <Chip
            key={demo.value}
            pressed={filters.demographic.includes(demo.value)}
            onPressedChange={() =>
              onChange(f => ({ ...f, demographic: toggle(f.demographic, demo.value) }))
            }
          >
            {demo.label}
          </Chip>
        ))}
      </FilterRow>
      <FilterRow label="Languages">
        <label className="flex items-center gap-2 text-sm text-fg-2">
          <Switch
            checked={filters.anyLanguage}
            onCheckedChange={anyLanguage => onChange(f => ({ ...f, anyLanguage }))}
          />
          Any language, not only series readable in mine
        </label>
      </FilterRow>
      <div className="grid gap-3">
        <p className="m-0 text-sm text-fg-3">
          Tags: click once to require, twice to exclude, again to clear.
        </p>
        {tagError && <p className="m-0 text-sm text-err">{tagError}</p>}
        {!tags && !tagError && <p className="m-0 text-sm text-fg-3">Loading tags</p>}
        {groups.map(([group, list]) => (
          <FilterRow key={group} label={group[0]!.toUpperCase() + group.slice(1)}>
            {list.map(tag => {
              const state = filters.tags[tag.id];
              return (
                <Chip
                  key={tag.id}
                  pressed={state !== undefined}
                  aria-label={`${tag.name}${state ? `, ${state}d` : ''}`}
                  onPressedChange={() =>
                    onChange(f => {
                      const next = { ...f.tags };
                      const value = nextTagState(f.tags[tag.id]);
                      if (value) next[tag.id] = value;
                      else delete next[tag.id];
                      return { ...f, tags: next };
                    })
                  }
                  className={cn(
                    state === 'exclude' &&
                      'border-err/50 bg-err/10 text-fg-1 line-through data-[state=on]:border-err/50 data-[state=on]:bg-err/10'
                  )}
                >
                  {tag.name}
                </Chip>
              );
            })}
          </FilterRow>
        ))}
      </div>
      <div>
        <Button variant="quiet" size="sm" onClick={onReset}>
          Clear filters
        </Button>
      </div>
    </div>
  );
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_minmax(0,1fr)] items-start gap-4">
      <span className="pt-1.5 text-sm text-fg-3">{label}</span>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}
