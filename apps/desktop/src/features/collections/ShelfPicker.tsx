import { useId, useMemo, useState, type KeyboardEvent } from 'react';
import { Check, Minus, Plus } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { MAX_NAME_CHARS, type Membership } from '@/lib/shelf';
import { cn } from '@/lib/utils';

import { foldText } from '../library/shelf';
import { coverage } from './model';

/**
 * Tags or collections as a checklist for a selection of series: checked when
 * every selected series carries it, a dash when only some do. Clicking adds
 * it to all of them, or takes it off all when all have it. Typing filters
 * the list, and Enter (or the last row) makes a new one with that name.
 */
export function ShelfPicker({
  kind,
  items,
  size,
  busy = false,
  error,
  onToggle,
  onCreate,
}: {
  kind: 'tag' | 'collection';
  items: Membership[];
  /** Series in the selection. */
  size: number;
  busy?: boolean;
  error?: string | null;
  onToggle: (item: Membership, add: boolean) => void;
  onCreate: (name: string) => void;
}) {
  const [text, setText] = useState('');
  const listId = useId();
  const name = text.trim().replace(/\s+/g, ' ');
  const folded = foldText(name);
  const shown = useMemo(
    () => (folded ? items.filter(i => foldText(i.name).includes(folded)) : items),
    [items, folded]
  );
  const exact = items.some(i => foldText(i.name) === folded);
  const canCreate = name.length > 0 && !exact;
  const noun = kind === 'tag' ? 'tag' : 'collection';

  const create = () => {
    if (!canCreate || busy) return;
    onCreate(name);
    setText('');
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const only = shown.length === 1 ? shown[0] : undefined;
    if (canCreate) create();
    else if (only) onToggle(only, coverage(only.count, size) !== 'all');
  };

  return (
    <div className="grid gap-1.5">
      <Input
        size="sm"
        autoFocus
        value={text}
        maxLength={MAX_NAME_CHARS}
        onChange={event => setText(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder={kind === 'tag' ? 'Find or make a tag' : 'Find or make a collection'}
        aria-label={kind === 'tag' ? 'Find or make a tag' : 'Find or make a collection'}
        aria-controls={listId}
      />
      <div
        id={listId}
        role="group"
        aria-label={kind === 'tag' ? 'Tags' : 'Collections'}
        className="grid max-h-[260px] gap-px overflow-y-auto"
      >
        {shown.map(item => {
          const state = coverage(item.count, size);
          return (
            <button
              key={item.id}
              type="button"
              role="checkbox"
              aria-checked={state === 'all' ? true : state === 'some' ? 'mixed' : false}
              disabled={busy}
              onClick={() => onToggle(item, state !== 'all')}
              className={cn(
                'flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-left text-sm text-fg-2 outline-none',
                'transition-colors duration-base ease-expo hover:bg-ink-3 hover:text-fg-1 focus-visible:bg-ink-3 focus-visible:text-fg-1',
                'disabled:cursor-not-allowed disabled:opacity-45',
                state !== 'none' && 'text-fg-1'
              )}
            >
              <span
                aria-hidden
                className={cn(
                  'grid size-4 shrink-0 place-items-center rounded-[4px] border border-line-strong',
                  state !== 'none' && 'border-transparent bg-accent text-on-accent'
                )}
              >
                {state === 'all' && <Check className="size-3" strokeWidth={3} />}
                {state === 'some' && <Minus className="size-3" strokeWidth={3} />}
              </span>
              <span className="min-w-0 flex-1 truncate">{item.name}</span>
              {size > 1 && state === 'some' && (
                <span className="tabular text-xs text-fg-3">
                  {item.count} of {size}
                </span>
              )}
            </button>
          );
        })}
        {canCreate && (
          <button
            type="button"
            disabled={busy}
            onClick={create}
            className={cn(
              'flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-left text-sm text-fg-1 outline-none',
              'transition-colors duration-base ease-expo hover:bg-ink-3 focus-visible:bg-ink-3',
              'disabled:cursor-not-allowed disabled:opacity-45'
            )}
          >
            <Plus aria-hidden className="size-4 text-accent" />
            <span className="min-w-0 truncate">
              New {noun} <q className="font-semibold">{name}</q>
            </span>
          </button>
        )}
        {shown.length === 0 && !canCreate && (
          <p className="m-0 px-2.5 py-2 text-sm text-fg-3">
            {items.length === 0 ? `No ${noun}s yet. Type a name to make one.` : 'Nothing matches.'}
          </p>
        )}
      </div>
      {error && (
        <p role="alert" className="m-0 px-1 text-xs text-err">
          {error}
        </p>
      )}
    </div>
  );
}
