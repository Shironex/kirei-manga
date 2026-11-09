import { Link } from '@tanstack/react-router';
import { Bookmark, BookmarkCheck, FolderPlus, Plus, Tag as TagIcon, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { SeriesRef } from '@/lib/shelf';

import { ShelfPicker } from './ShelfPicker';
import { useShelfEdit } from './useShelfEdit';

/**
 * A series page's lists card: Want to Read, the series' tags (removable
 * chips, a picker to add) and the collections it is in. The library's series
 * page and the MangaDex series page both show it; the MangaDex one keeps
 * its Want to Read button in the header (`wantToggle` false).
 */
export function SeriesShelfCard({
  series,
  title,
  wantToggle = true,
}: {
  series: SeriesRef;
  title: string;
  wantToggle?: boolean;
}) {
  const edit = useShelfEdit([series]);
  const { shelf, busy } = edit;
  const tags = shelf?.tags.filter(t => t.count > 0) ?? [];
  const collections = shelf?.collections.filter(c => c.count > 0) ?? [];
  const wanted = (shelf?.wantCount ?? 0) > 0;

  return (
    <section
      aria-labelledby="lists-heading"
      className="grid gap-4 rounded-panel border border-line bg-ink-1 p-6"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id="lists-heading" className="m-0 font-display text-lg font-[650] font-condensed">
          Your lists
        </h2>
        {wantToggle && (
          <Button
            variant={wanted ? 'secondary' : 'ghost'}
            size="sm"
            disabled={busy || !shelf}
            aria-pressed={wanted}
            onClick={() => edit.setWant(!wanted)}
          >
            {wanted ? <BookmarkCheck className="text-accent" /> : <Bookmark />}
            {wanted ? 'In Want to Read' : 'Want to Read'}
          </Button>
        )}
      </div>

      <div className="grid gap-2">
        <h3 className="m-0 text-xs font-medium text-fg-3">Tags</h3>
        <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0" aria-label={`Tags on ${title}`}>
          {tags.map(tag => (
            <li key={tag.id}>
              <span className="inline-flex h-[26px] items-center gap-1 rounded-chip bg-fg-1/6 pr-1 pl-2.5 text-xs font-medium text-fg-2">
                <Link
                  to="/tags/$tagId"
                  params={{ tagId: String(tag.id) }}
                  className="text-fg-2 no-underline hover:text-fg-1"
                >
                  {tag.name}
                </Link>
                <button
                  type="button"
                  disabled={busy}
                  aria-label={`Remove the tag ${tag.name}`}
                  onClick={() => edit.toggleTag(tag, false)}
                  className="grid size-5 place-items-center rounded-[4px] text-fg-3 transition-colors duration-base hover:bg-fg-1/10 hover:text-fg-1 disabled:opacity-45"
                >
                  <X className="size-3" aria-hidden />
                </button>
              </span>
            </li>
          ))}
          <li>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="quiet"
                  size="sm"
                  className="h-[26px] px-2 text-xs"
                  disabled={!shelf}
                >
                  {tags.length > 0 ? <Plus /> : <TagIcon />}
                  {tags.length > 0 ? 'Tag' : 'Add a tag'}
                </Button>
              </PopoverTrigger>
              <PopoverContent aria-label="Tags">
                {shelf && (
                  <ShelfPicker
                    kind="tag"
                    items={shelf.tags}
                    size={1}
                    busy={busy}
                    error={edit.error}
                    onToggle={edit.toggleTag}
                    onCreate={edit.createTag}
                  />
                )}
              </PopoverContent>
            </Popover>
          </li>
        </ul>
      </div>

      <div className="grid gap-2">
        <h3 className="m-0 text-xs font-medium text-fg-3">Collections</h3>
        {collections.length > 0 && (
          <ul className="m-0 grid list-none gap-1 p-0 text-sm">
            {collections.map(c => (
              <li key={c.id}>
                <Link
                  to="/collections/$collectionId"
                  params={{ collectionId: String(c.id) }}
                  className="text-fg-2 no-underline transition-colors duration-base hover:text-fg-1"
                >
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="quiet" size="sm" className="justify-self-start px-2" disabled={!shelf}>
              <FolderPlus />
              {collections.length > 0 ? 'Change collections' : 'Add to a collection'}
            </Button>
          </PopoverTrigger>
          <PopoverContent aria-label="Collections">
            {shelf && (
              <ShelfPicker
                kind="collection"
                items={shelf.collections}
                size={1}
                busy={busy}
                error={edit.error}
                onToggle={edit.toggleCollection}
                onCreate={edit.createCollection}
              />
            )}
          </PopoverContent>
        </Popover>
      </div>
    </section>
  );
}
