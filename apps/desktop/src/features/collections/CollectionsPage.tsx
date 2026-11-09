import { useState, type ReactNode } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Bookmark,
  FolderPlus,
  Layers,
  ListFilter,
  Pencil,
  Plus,
  RotateCw,
  Trash2,
} from 'lucide-react';

import { EmptyState } from '@/components/page/EmptyState';
import { PageHeader } from '@/components/page/PageHeader';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  createCollection,
  deleteFilter,
  pinFilter,
  reorderCollections,
  reorderFilters,
  type Collection,
  type SmartFilter,
} from '@/lib/shelf';

import { ConfirmButton } from '../settings/ConfirmButton';
import { CoverStack } from './CoverStack';
import { FilterBuilder } from './FilterBuilder';
import { describeQuery, moveItem, seriesCount } from './model';
import { NameDialog } from './NameDialog';
import { refreshShelf, shelfChange, useShelf } from './shelfStore';

const sectionTitle = 'm-0 font-display text-2xl leading-[1.1] font-[650] font-condensed';

/**
 * Collections home: Want to Read and the user's collections as cover cards
 * (arranged in the user's order), saved smart filters with their Home pin,
 * and every tag.
 */
export function CollectionsPage() {
  const shelf = useShelf();
  const navigate = useNavigate();
  const [building, setBuilding] = useState<SmartFilter | 'new' | null>(null);

  if (shelf.status === 'error') {
    return (
      <>
        <PageHeader title="Collections" />
        <EmptyState
          tone="alert"
          title="Your collections could not be read"
          actions={
            <Button variant="primary" onClick={() => void refreshShelf()}>
              <RotateCw /> Try again
            </Button>
          }
        >
          <p>{shelf.error}</p>
        </EmptyState>
      </>
    );
  }

  const { overview } = shelf;
  return (
    <>
      <PageHeader
        title="Collections"
        lead="Your own shelves: collections in the order you keep them, a Want to Read list, tags, and smart filters that fill themselves."
        actions={
          <>
            <NameDialog
              trigger={
                <Button variant="ghost">
                  <FolderPlus /> New collection
                </Button>
              }
              title="New collection"
              label="Name"
              placeholder="Summer reading"
              submitLabel="Make collection"
              onSubmit={async name => {
                const made = await shelfChange(() => createCollection(name));
                void navigate({
                  to: '/collections/$collectionId',
                  params: { collectionId: String(made.id) },
                });
              }}
            />
            <Button variant="primary" onClick={() => setBuilding('new')}>
              <ListFilter /> New smart filter
            </Button>
          </>
        }
      />

      <ListsSection collections={overview.collections} wantCount={overview.wantCount} />
      <FiltersSection filters={overview.filters} onEdit={setBuilding} />
      <TagsSection />

      <FilterBuilder
        open={building !== null}
        onOpenChange={open => !open && setBuilding(null)}
        filter={building && building !== 'new' ? building : undefined}
        onSaved={saved =>
          building === 'new' &&
          void navigate({ to: '/filters/$filterId', params: { filterId: String(saved.id) } })
        }
      />
    </>
  );
}

function ListsSection({
  collections,
  wantCount,
}: {
  collections: Collection[];
  wantCount: number;
}) {
  const { want } = useShelf();
  const [arranging, setArranging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const move = (index: number, delta: number) => {
    const order = moveItem(collections, index, index + delta).map(c => c.id);
    setError(null);
    shelfChange(() => reorderCollections(order)).catch((e: unknown) =>
      setError(e instanceof Error ? e.message : String(e))
    );
  };

  return (
    <section aria-labelledby="lists-heading" className="mb-14">
      <div className="mb-5 flex items-end gap-4">
        <h2 id="lists-heading" className={sectionTitle}>
          Lists
        </h2>
        <span className="tabular text-sm text-fg-3">
          {collections.length === 1 ? '1 collection' : `${collections.length} collections`}
        </span>
        {collections.length > 1 && (
          <Button
            variant="quiet"
            size="sm"
            className="ml-auto"
            aria-pressed={arranging}
            onClick={() => setArranging(a => !a)}
          >
            {arranging ? 'Done arranging' : 'Arrange'}
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className="m-0 mb-4 text-sm text-err">
          {error}
        </p>
      )}
      <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-x-6 gap-y-8 p-0">
        <li>
          <ListCard
            to="want"
            name="Want to Read"
            count={wantCount}
            items={want}
            icon={<Bookmark className="size-3.5 text-accent" aria-hidden />}
          />
        </li>
        {collections.map((c, index) => (
          <li key={c.id} className="grid content-start gap-2">
            <ListCard to={String(c.id)} name={c.name} count={c.count} items={c.preview} />
            {arranging && (
              <span className="flex gap-1.5">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Move ${c.name} earlier`}
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                >
                  <ArrowLeft />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Move ${c.name} later`}
                  disabled={index === collections.length - 1}
                  onClick={() => move(index, 1)}
                >
                  <ArrowRight />
                </Button>
              </span>
            )}
          </li>
        ))}
      </ul>
      {collections.length === 0 && (
        <p className="m-0 mt-6 max-w-[62ch] text-sm text-fg-2">
          Collections are shelves you fill by hand, in any order you like. Make one here, from a
          series page, or select series in the library and add them all at once.
        </p>
      )}
    </section>
  );
}

function ListCard({
  to,
  name,
  count,
  items,
  icon,
}: {
  to: string;
  name: string;
  count: number;
  items: Collection['preview'];
  icon?: ReactNode;
}) {
  return (
    <Link
      to="/collections/$collectionId"
      params={{ collectionId: to }}
      className="group grid gap-2.5 rounded-xl text-fg-1 no-underline outline-none focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-accent"
    >
      <CoverStack
        items={items}
        label={name}
        empty={<Layers className="size-6" />}
        className="border border-line transition-[border-color] duration-base group-hover:border-line-strong"
      />
      <span className="grid gap-0.5">
        <span className="flex items-center gap-1.5 truncate font-semibold">
          {icon}
          {name}
        </span>
        <span className="tabular text-xs text-fg-3">{seriesCount(count)}</span>
      </span>
    </Link>
  );
}

function FiltersSection({
  filters,
  onEdit,
}: {
  filters: SmartFilter[];
  onEdit: (filter: SmartFilter | 'new') => void;
}) {
  const { overview } = useShelf();
  const [error, setError] = useState<string | null>(null);
  const act = (work: () => Promise<unknown>) => {
    setError(null);
    shelfChange(work).catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  };
  const move = (index: number, delta: number) =>
    act(() => reorderFilters(moveItem(filters, index, index + delta).map(f => f.id)));

  return (
    <section aria-labelledby="filters-heading" className="mb-14">
      <div className="mb-5 flex items-end gap-4">
        <h2 id="filters-heading" className={sectionTitle}>
          Smart filters
        </h2>
        <span className="text-sm text-fg-3">Pinned filters are rows on Home, in this order.</span>
      </div>
      {error && (
        <p role="alert" className="m-0 mb-4 text-sm text-err">
          {error}
        </p>
      )}
      {filters.length === 0 ? (
        <div className="flex flex-wrap items-center gap-4 rounded-panel border border-line bg-ink-1 p-6">
          <p className="m-0 max-w-[60ch] flex-1 text-sm text-fg-2">
            A smart filter is a saved search that keeps itself up to date: unread series with a tag,
            what you added this month, everything in Polish you have not finished.
          </p>
          <Button variant="ghost" onClick={() => onEdit('new')}>
            <Plus /> Make one
          </Button>
        </div>
      ) : (
        <ul className="m-0 list-none overflow-hidden rounded-panel border border-line bg-ink-1 p-0">
          {filters.map((f, index) => (
            <li
              key={f.id}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 gap-y-2 px-6 py-4 [&+&]:border-t [&+&]:border-line"
            >
              <span className="grid min-w-0 gap-0.5">
                <Link
                  to="/filters/$filterId"
                  params={{ filterId: String(f.id) }}
                  className="truncate font-semibold text-fg-1 no-underline hover:underline"
                >
                  {f.name}
                </Link>
                <span className="truncate text-sm text-fg-2">
                  {describeQuery(f.query, overview)}
                </span>
              </span>
              <span className="flex items-center gap-1.5">
                <label className="mr-3 flex items-center gap-2 text-sm text-fg-2">
                  <Switch
                    checked={f.pinned}
                    onCheckedChange={on => act(() => pinFilter(f.id, on))}
                    aria-label={`Show ${f.name} on Home`}
                  />
                  On Home
                </label>
                <Button
                  variant="quiet"
                  size="icon-sm"
                  aria-label={`Move ${f.name} up`}
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                >
                  <ArrowUp />
                </Button>
                <Button
                  variant="quiet"
                  size="icon-sm"
                  aria-label={`Move ${f.name} down`}
                  disabled={index === filters.length - 1}
                  onClick={() => move(index, 1)}
                >
                  <ArrowDown />
                </Button>
                <Button
                  variant="quiet"
                  size="icon-sm"
                  aria-label={`Edit ${f.name}`}
                  onClick={() => onEdit(f)}
                >
                  <Pencil />
                </Button>
                <ConfirmButton
                  variant="quiet"
                  size="icon-sm"
                  aria-label={`Delete ${f.name}`}
                  title={`Delete ${f.name}?`}
                  description="The filter goes, and its row leaves Home. Your series, tags and collections stay as they are."
                  confirmLabel="Delete filter"
                  danger
                  onConfirm={() => act(() => deleteFilter(f.id))}
                >
                  <Trash2 />
                </ConfirmButton>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function TagsSection() {
  const { overview } = useShelf();
  return (
    <section aria-labelledby="tags-heading">
      <div className="mb-5 flex items-end gap-4">
        <h2 id="tags-heading" className={sectionTitle}>
          Tags
        </h2>
        <span className="tabular text-sm text-fg-3">
          {overview.tags.length === 1 ? '1 tag' : `${overview.tags.length} tags`}
        </span>
      </div>
      {overview.tags.length === 0 ? (
        <p className="m-0 max-w-[62ch] text-sm text-fg-2">
          Tags are free words you put on series, like <q>cosy</q> or <q>reread</q>. Add them on a
          series page or to many series at once from the library.
        </p>
      ) : (
        <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
          {overview.tags.map(tag => (
            <li key={tag.id}>
              <Link
                to="/tags/$tagId"
                params={{ tagId: String(tag.id) }}
                className="inline-flex h-[30px] items-center gap-2 rounded-chip border border-line-strong px-3 text-sm text-fg-2 no-underline transition-[border-color,color] duration-base ease-expo hover:border-fg-3 hover:text-fg-1"
              >
                {tag.name}
                <span className="tabular text-xs text-fg-3">{tag.count}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
