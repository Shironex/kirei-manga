import { Bookmark, BookmarkMinus, FolderPlus, Tag as TagIcon, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Kbd } from '@/components/ui/tooltip';
import { localRef } from '@/lib/shelf';
import { cn } from '@/lib/utils';

import { coverage, seriesCount } from './model';
import { ShelfPicker } from './ShelfPicker';
import { useShelfEdit } from './useShelfEdit';

/**
 * The bar that floats over the library grid while it selects: how many
 * series are picked, tags and collections for all of them at once, Want to
 * Read, select all, and done. Glass, since it floats over covers.
 */
export function BulkBar({
  seriesIds,
  shownCount,
  onSelectAll,
  onDone,
}: {
  /** Selected series, in grid order. */
  seriesIds: number[];
  /** Series the grid shows, for the select all label. */
  shownCount: number;
  onSelectAll: () => void;
  onDone: () => void;
}) {
  const edit = useShelfEdit(seriesIds.map(id => localRef(id)));
  const size = seriesIds.length;
  const none = size === 0;
  const allWanted = !!edit.shelf && coverage(edit.shelf.wantCount, edit.shelf.size) === 'all';
  const allSelected = size > 0 && size === shownCount;

  return (
    <div
      role="toolbar"
      aria-label="Edit the selected series"
      className={cn(
        'glass sticky bottom-6 z-20 mx-auto mt-8 flex w-fit max-w-full flex-wrap items-center gap-2 rounded-panel p-2 pl-4'
      )}
    >
      <span className="tabular mr-2 text-sm font-medium text-fg-1" aria-live="polite">
        {none ? 'Pick series to edit' : `${seriesCount(size)} selected`}
      </span>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="secondary" size="sm" disabled={none || !edit.shelf}>
            <TagIcon /> Tags
          </Button>
        </PopoverTrigger>
        <PopoverContent side="top" aria-label="Tags for the selected series">
          {edit.shelf && (
            <ShelfPicker
              kind="tag"
              items={edit.shelf.tags}
              size={edit.shelf.size}
              busy={edit.busy}
              error={edit.error}
              onToggle={edit.toggleTag}
              onCreate={edit.createTag}
            />
          )}
        </PopoverContent>
      </Popover>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="secondary" size="sm" disabled={none || !edit.shelf}>
            <FolderPlus /> Collections
          </Button>
        </PopoverTrigger>
        <PopoverContent side="top" aria-label="Collections for the selected series">
          {edit.shelf && (
            <ShelfPicker
              kind="collection"
              items={edit.shelf.collections}
              size={edit.shelf.size}
              busy={edit.busy}
              error={edit.error}
              onToggle={edit.toggleCollection}
              onCreate={edit.createCollection}
            />
          )}
        </PopoverContent>
      </Popover>
      <Button
        variant="secondary"
        size="sm"
        disabled={none || edit.busy || !edit.shelf}
        onClick={() => edit.setWant(!allWanted)}
      >
        {allWanted ? <BookmarkMinus /> : <Bookmark />}
        {allWanted ? 'Remove from Want to Read' : 'Want to Read'}
      </Button>
      <Button variant="quiet" size="sm" onClick={onSelectAll}>
        {allSelected ? 'Select none' : 'Select all'}
      </Button>
      <Button variant="ghost" size="sm" onClick={onDone} aria-keyshortcuts="Escape">
        <X /> Done <Kbd className="ml-0.5">Esc</Kbd>
      </Button>
      {edit.error && (
        <p role="alert" className="m-0 w-full px-1 pb-1 text-xs text-err">
          {edit.error}
        </p>
      )}
    </div>
  );
}
