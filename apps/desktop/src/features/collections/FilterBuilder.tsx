import { useEffect, useId, useState, type FormEvent, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Segmented, SegmentedItem } from '@/components/ui/segmented';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  EMPTY_QUERY,
  getLanguages,
  MAX_NAME_CHARS,
  runFilter,
  saveFilter,
  type FilterQuery,
  type SmartFilter,
} from '@/lib/shelf';

import { languageName } from '../library/format';
import {
  ADDED_OPTIONS,
  describeQuery,
  seriesCount,
  SORT_OPTIONS,
  SOURCE_OPTIONS,
  STATUS_OPTIONS,
} from './model';
import { shelfChange, useShelf } from './shelfStore';

const PREVIEW_PAUSE_MS = 150;

function toggle<T>(list: readonly T[], value: T, on: boolean): T[] {
  return on ? [...list.filter(v => v !== value), value] : list.filter(v => v !== value);
}

/**
 * Makes or edits a smart filter. Every criterion is optional; the count
 * under the title is the filter evaluated live as it is built, so the user
 * sees what it keeps before saving.
 */
export function FilterBuilder({
  open,
  onOpenChange,
  filter,
  initial,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The filter to edit; omitted to make a new one. */
  filter?: SmartFilter;
  /** Starting criteria for a new filter (such as a tag page's tag). */
  initial?: Partial<FilterQuery>;
  onSaved?: (filter: SmartFilter) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-48px)] w-[min(640px,calc(100vw-32px))] overflow-y-auto">
        {open && (
          <BuilderForm
            filter={filter}
            initial={initial}
            onDone={saved => {
              onOpenChange(false);
              if (saved) onSaved?.(saved);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function BuilderForm({
  filter,
  initial,
  onDone,
}: {
  filter?: SmartFilter;
  initial?: Partial<FilterQuery>;
  onDone: (saved: SmartFilter | null) => void;
}) {
  const { overview } = useShelf();
  const [name, setName] = useState(filter?.name ?? '');
  const [query, setQuery] = useState<FilterQuery>(filter?.query ?? { ...EMPTY_QUERY, ...initial });
  const [pinned, setPinned] = useState(filter?.pinned ?? true);
  const [languages, setLanguages] = useState<string[]>([]);
  const [count, setCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const nameId = useId();
  const unreadId = useId();
  const patch = (next: Partial<FilterQuery>) => setQuery(q => ({ ...q, ...next }));

  useEffect(() => {
    getLanguages().then(setLanguages, () => setLanguages([]));
  }, []);

  useEffect(() => {
    let live = true;
    const timer = setTimeout(() => {
      runFilter(query, 1).then(
        result => live && setCount(result.total),
        () => live && setCount(null)
      );
    }, PREVIEW_PAUSE_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [query]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      setError('Give the filter a name.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const saved = await shelfChange(() => saveFilter(filter?.id ?? null, name, query, pinned));
      onDone(saved);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  };

  const shownLanguages = [...new Set([...languages, ...query.languages])];

  return (
    <form onSubmit={submit} className="grid gap-5">
      <DialogHeader>
        <DialogTitle>{filter ? 'Edit smart filter' : 'New smart filter'}</DialogTitle>
        <DialogDescription aria-live="polite">
          {describeQuery(query, overview)}.{' '}
          <span className="tabular font-medium text-fg-1">
            {count === null ? 'Counting' : `${seriesCount(count)} match`}
          </span>
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-1.5">
        <label htmlFor={nameId} className="text-sm font-medium text-fg-2">
          Name
        </label>
        <Input
          id={nameId}
          autoFocus
          size="sm"
          value={name}
          maxLength={MAX_NAME_CHARS}
          placeholder="Weekend reads"
          invalid={!!error && !name.trim()}
          onChange={event => setName(event.target.value)}
        />
      </div>

      {overview.tags.length > 0 && (
        <Field label="With tags">
          <ChipRow>
            {overview.tags.map(tag => (
              <Chip
                key={tag.id}
                pressed={query.tags.includes(tag.id)}
                onPressedChange={on =>
                  patch({
                    tags: toggle(query.tags, tag.id, on),
                    excludeTags: query.excludeTags.filter(t => t !== tag.id),
                  })
                }
              >
                {tag.name}
              </Chip>
            ))}
          </ChipRow>
          {query.tags.length > 1 && (
            <Segmented
              size="sm"
              aria-label="Tags to match"
              value={query.tagMode}
              onValueChange={value => patch({ tagMode: value === 'all' ? 'all' : 'any' })}
              className="justify-self-start"
            >
              <SegmentedItem value="any">Any of them</SegmentedItem>
              <SegmentedItem value="all">All of them</SegmentedItem>
            </Segmented>
          )}
        </Field>
      )}

      {overview.tags.length > 0 && (
        <Field label="Without tags">
          <ChipRow>
            {overview.tags.map(tag => (
              <Chip
                key={tag.id}
                pressed={query.excludeTags.includes(tag.id)}
                onPressedChange={on =>
                  patch({
                    excludeTags: toggle(query.excludeTags, tag.id, on),
                    tags: query.tags.filter(t => t !== tag.id),
                  })
                }
              >
                {tag.name}
              </Chip>
            ))}
          </ChipRow>
        </Field>
      )}

      {overview.collections.length > 0 && (
        <Field label="In collections">
          <ChipRow>
            {overview.collections.map(c => (
              <Chip
                key={c.id}
                pressed={query.collections.includes(c.id)}
                onPressedChange={on => patch({ collections: toggle(query.collections, c.id, on) })}
              >
                {c.name}
              </Chip>
            ))}
          </ChipRow>
        </Field>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Want to Read">
          <Segmented
            size="sm"
            aria-label="Want to Read"
            value={query.wantToRead === null ? 'any' : query.wantToRead ? 'only' : 'not'}
            onValueChange={value =>
              patch({ wantToRead: value === 'only' ? true : value === 'not' ? false : null })
            }
            className="justify-self-start"
          >
            <SegmentedItem value="any">Either</SegmentedItem>
            <SegmentedItem value="only">Only</SegmentedItem>
            <SegmentedItem value="not">Leave out</SegmentedItem>
          </Segmented>
        </Field>
        <Field label="Source">
          <Segmented
            size="sm"
            aria-label="Source"
            value={query.source ?? 'any'}
            onValueChange={value =>
              patch({ source: value === 'local' || value === 'mangadex' ? value : null })
            }
            className="justify-self-start"
          >
            {SOURCE_OPTIONS.map(o => (
              <SegmentedItem key={o.value} value={o.value}>
                {o.label}
              </SegmentedItem>
            ))}
          </Segmented>
        </Field>
      </div>

      <Field label="Reading state">
        <ChipRow>
          {STATUS_OPTIONS.map(s => (
            <Chip
              key={s.value}
              pressed={query.status.includes(s.value)}
              onPressedChange={on => patch({ status: toggle(query.status, s.value, on) })}
            >
              {s.label}
            </Chip>
          ))}
        </ChipRow>
      </Field>

      <div className="grid gap-5 sm:grid-cols-3">
        <div className="grid content-start gap-1.5">
          <label htmlFor={unreadId} className="text-sm font-medium text-fg-2">
            Unread chapters, at least
          </label>
          <Input
            id={unreadId}
            size="sm"
            type="number"
            inputMode="numeric"
            min={1}
            max={9999}
            placeholder="Any"
            value={query.minUnread ?? ''}
            onChange={event => {
              const n = Number.parseInt(event.target.value, 10);
              patch({ minUnread: Number.isFinite(n) && n > 0 ? Math.min(n, 9999) : null });
            }}
          />
        </div>
        <Field label="Added">
          <Select
            value={String(query.addedWithinDays ?? 'any')}
            onValueChange={value =>
              patch({ addedWithinDays: value === 'any' ? null : Number(value) })
            }
          >
            <SelectTrigger aria-label="Added" className="h-[38px] rounded-[10px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ADDED_OPTIONS.map(o => (
                <SelectItem key={o.label} value={String(o.value ?? 'any')}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Sort by">
          <Select
            value={query.sort}
            onValueChange={value =>
              patch({ sort: SORT_OPTIONS.find(o => o.value === value)?.value ?? 'title' })
            }
          >
            <SelectTrigger aria-label="Sort by" className="h-[38px] rounded-[10px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map(o => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      {shownLanguages.length > 0 && (
        <Field label="Language">
          <ChipRow>
            {shownLanguages.map(code => (
              <Chip
                key={code}
                pressed={query.languages.includes(code)}
                onPressedChange={on => patch({ languages: toggle(query.languages, code, on) })}
              >
                {languageName(code) ?? code}
              </Chip>
            ))}
          </ChipRow>
        </Field>
      )}

      <label className="flex items-center justify-between gap-4 rounded-xl bg-ink-2 px-4 py-3">
        <span className="grid gap-0.5">
          <span className="text-sm font-medium text-fg-1">Pin to Home</span>
          <span className="text-xs text-fg-2">Show it as a row on the library page.</span>
        </span>
        <Switch checked={pinned} onCheckedChange={setPinned} aria-label="Pin to Home" />
      </label>

      {error && (
        <p role="alert" className="m-0 text-sm text-err">
          {error}
        </p>
      )}

      <DialogFooter>
        <Button variant="ghost" onClick={() => onDone(null)}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={saving}>
          {filter ? 'Save changes' : 'Save filter'}
        </Button>
      </DialogFooter>
    </form>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <fieldset className="m-0 grid min-w-0 content-start gap-2 border-0 p-0">
      <legend className="mb-2 p-0 text-sm font-medium text-fg-2">{label}</legend>
      {children}
    </fieldset>
  );
}

function ChipRow({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap gap-1.5">{children}</div>;
}
