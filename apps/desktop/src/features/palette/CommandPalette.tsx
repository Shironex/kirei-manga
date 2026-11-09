import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Dialog as DialogPrimitive } from 'radix-ui';
import {
  BookOpen,
  CornerDownLeft,
  Globe,
  History,
  Layers,
  Library,
  Search,
  Settings,
  Zap,
  type LucideIcon,
} from 'lucide-react';

import { Kbd } from '@/components/ui/tooltip';
import { useOpenChapter } from '@/features/reader/openChapter';
import { cn } from '@/lib/utils';

import { matchPositions, queryWords } from './fuzzy';
import { setPaletteOpen, togglePalette, usePaletteOpen } from './paletteStore';
import { loadRecents, pushRecent, saveRecents } from './recents';
import { runItem } from './run';
import { isPaletteShortcut } from './shortcut';
import type { PaletteContext, PaletteItem, PaletteSection } from './types';
import { usePaletteResults } from './usePaletteResults';

const ICONS: Record<PaletteSection, LucideIcon> = {
  recent: History,
  series: Library,
  shelf: Layers,
  chapters: BookOpen,
  pages: Search,
  settings: Settings,
  actions: Zap,
  online: Globe,
};

function Highlight({ text, words }: { text: string; words: string[] }) {
  const hit = new Set(matchPositions(words, text));
  if (hit.size === 0) return text;
  const parts: { text: string; on: boolean }[] = [];
  for (let i = 0; i < text.length; i += 1) {
    const on = hit.has(i);
    const last = parts[parts.length - 1];
    if (last && last.on === on) last.text += text[i];
    else parts.push({ text: text[i] ?? '', on });
  }
  return parts.map((p, i) =>
    p.on ? (
      <mark key={i} className="bg-transparent font-semibold text-accent">
        {p.text}
      </mark>
    ) : (
      p.text
    )
  );
}

/**
 * Ctrl+K (Cmd+K on macOS) palette: jump to a series, chapter, setting, page
 * or run an action. ARIA combobox over a listbox: focus stays in the input
 * and `aria-activedescendant` names the highlighted option. Radix traps the
 * focus, closes on Esc and puts it back where it was.
 */
export function CommandPalette() {
  const open = usePaletteOpen();
  const [query, setQuery] = useState('');
  const [recent, setRecent] = useState<PaletteItem[]>([]);
  const [active, setActive] = useState(0);
  const ran = useRef(false);
  const listRef = useRef<HTMLDivElement>(null);
  const baseId = useId();
  const navigate = useNavigate();
  const openChapter = useOpenChapter();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!isPaletteShortcut(event)) return;
      event.preventDefault();
      togglePalette();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (open) {
      ran.current = false;
      setQuery('');
      setActive(0);
      setRecent(loadRecents());
    }
  }, [open]);

  const { groups: shownGroups, flat: items } = usePaletteResults(query, recent);
  const words = useMemo(() => queryWords(query), [query]);
  const current = Math.min(active, Math.max(items.length - 1, 0));

  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [current, items]);

  const ctx = useMemo<PaletteContext>(
    () => ({
      goTo: to => void navigate({ to }),
      goToSeries: seriesId =>
        void navigate({ to: '/series/$seriesId', params: { seriesId: String(seriesId) } }),
      goToShelf: target => {
        if (target.kind === 'collection') {
          void navigate({ to: '/collections/$collectionId', params: { collectionId: target.id } });
        } else if (target.kind === 'filter') {
          void navigate({ to: '/filters/$filterId', params: { filterId: String(target.id) } });
        } else {
          void navigate({ to: '/tags/$tagId', params: { tagId: String(target.id) } });
        }
      },
      openChapter: (seriesId, chapterId) => openChapter({ kind: 'library', seriesId, chapterId }),
      close: () => setPaletteOpen(false),
    }),
    [navigate, openChapter]
  );

  const choose = useCallback(
    (item: PaletteItem) => {
      ran.current = true;
      saveRecents(pushRecent(loadRecents(), item));
      setPaletteOpen(false);
      void runItem(item, ctx).catch(() => {});
    },
    [ctx]
  );

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    const count = items.length;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (count === 0) return;
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive((current + step + count) % count);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const item = items[current];
      if (item) choose(item);
    }
  };

  const optionId = (i: number) => `${baseId}-opt-${i}`;
  const listId = `${baseId}-list`;
  let position = -1;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setPaletteOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-[oklch(0.08_calc(var(--tint)*0.5)_var(--seed-h)/0.6)] data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          data-slot="command-palette"
          onCloseAutoFocus={event => {
            // After running something the destination owns focus.
            if (ran.current) event.preventDefault();
          }}
          className="glass fixed top-[14vh] left-1/2 z-50 flex max-h-[min(560px,72vh)] w-[min(640px,calc(100vw-32px))] -translate-x-1/2 flex-col overflow-hidden rounded-panel border border-glass-edge shadow-[0_40px_80px_-30px_oklch(0_0_0/0.8)] outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.98]"
        >
          <DialogPrimitive.Title className="sr-only">Command palette</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Search series, chapters, settings and actions. Use the arrow keys to choose and Enter to
            open.
          </DialogPrimitive.Description>

          <div className="flex items-center gap-3 border-b border-line px-4">
            <Search aria-hidden className="size-4 shrink-0 text-fg-3" />
            <input
              role="combobox"
              aria-label="Search series, chapters, settings and actions"
              aria-expanded
              aria-haspopup="listbox"
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={items.length > 0 ? optionId(current) : undefined}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Search series, chapters, settings, actions"
              className="h-14 min-w-0 flex-1 border-0 bg-transparent text-lg text-fg-1 outline-none placeholder:text-fg-3"
            />
          </div>

          <div
            ref={listRef}
            id={listId}
            role="listbox"
            aria-label="Results"
            onMouseDown={e => e.preventDefault()}
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2"
          >
            {items.length === 0 && (
              <p className="m-0 px-3 py-8 text-center text-sm text-fg-3">
                {words.length > 0 ? `Nothing found for "${query.trim()}".` : 'Nothing to show yet.'}
              </p>
            )}
            {shownGroups.map(group => (
              <div
                key={group.id}
                role="group"
                aria-labelledby={`${baseId}-${group.id}`}
                className="[&+&]:mt-1"
              >
                <div
                  id={`${baseId}-${group.id}`}
                  role="presentation"
                  className="px-3 pt-2 pb-1 text-xs font-medium tracking-wide text-fg-3 uppercase"
                >
                  {group.label}
                </div>
                {group.items.map(item => {
                  position += 1;
                  const index = position;
                  const selected = index === current;
                  const Icon = ICONS[group.section];
                  return (
                    <div
                      key={`${group.id}:${item.id}`}
                      id={optionId(index)}
                      role="option"
                      aria-selected={selected}
                      onClick={() => choose(item)}
                      onMouseMove={() => setActive(index)}
                      className={cn(
                        'flex cursor-default items-center gap-3 rounded-chip px-3 py-2',
                        selected ? 'bg-accent-wash text-fg-1' : 'text-fg-2'
                      )}
                    >
                      <Icon aria-hidden className="size-4 shrink-0 text-fg-3" />
                      <span className="min-w-0 flex-1 truncate">
                        <span className="text-md">
                          <Highlight text={item.title} words={words} />
                        </span>
                        {item.subtitle && (
                          <span className="ml-2 text-sm text-fg-3">{item.subtitle}</span>
                        )}
                      </span>
                      {item.keys && (
                        <span aria-hidden className="flex gap-1">
                          {item.keys.map(k => (
                            <Kbd key={k} className="h-5 min-w-5 px-1 text-xs">
                              {k}
                            </Kbd>
                          ))}
                        </span>
                      )}
                      {selected && (
                        <CornerDownLeft aria-hidden className="size-3.5 shrink-0 text-fg-3" />
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          <div role="status" className="sr-only">
            {words.length > 0
              ? items.length === 0
                ? 'No results'
                : `${items.length} ${items.length === 1 ? 'result' : 'results'}`
              : ''}
          </div>
          <div
            aria-hidden
            className="flex items-center gap-4 border-t border-line px-4 py-2 text-xs text-fg-3"
          >
            <span className="flex items-center gap-1">
              <Kbd className="h-5 min-w-5 px-1 text-xs">↑</Kbd>
              <Kbd className="h-5 min-w-5 px-1 text-xs">↓</Kbd> to move
            </span>
            <span className="flex items-center gap-1">
              <Kbd className="h-5 min-w-5 px-1 text-xs">Enter</Kbd> to open
            </span>
            <span className="flex items-center gap-1">
              <Kbd className="h-5 min-w-5 px-1 text-xs">Esc</Kbd> to close
            </span>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
