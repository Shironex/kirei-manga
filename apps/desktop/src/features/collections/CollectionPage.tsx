import { useEffect, useState, type DragEvent } from 'react';
import { getRouteApi, Link, useNavigate } from '@tanstack/react-router';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  GripVertical,
  ImageIcon,
  Layers,
  Pencil,
  Trash2,
  X,
} from 'lucide-react';

import { EmptyState } from '@/components/page/EmptyState';
import { PageHeader } from '@/components/page/PageHeader';
import { Button } from '@/components/ui/button';
import {
  deleteCollection,
  getCollectionItems,
  itemCoverSrc,
  itemKey,
  itemRef,
  removeFromCollection,
  renameCollection,
  reorderCollection,
  setCollectionCover,
  setWantToRead,
  type ShelfItem,
} from '@/lib/shelf';
import { usePageCover } from '@/lib/theme/coverTheme';
import { cn } from '@/lib/utils';

import { Cover } from '../library/Cover';
import { ConfirmButton } from '../settings/ConfirmButton';
import { moveItem, seriesCount } from './model';
import { NameDialog } from './NameDialog';
import { ShelfItems, useSeriesById } from './ShelfItems';
import { shelfChange, useShelf } from './shelfStore';

const route = getRouteApi('/shell/collections/$collectionId');

export function BackToCollections() {
  return (
    <Link
      to="/collections"
      className="inline-flex items-center gap-1.5 text-sm text-fg-2 no-underline transition-colors duration-base hover:text-fg-1"
    >
      <ArrowLeft className="size-4" aria-hidden /> Collections
    </Link>
  );
}

/** Members of one collection in the user's order, or Want to Read (`want`), newest first. */
export function CollectionPage() {
  const { collectionId } = route.useParams();
  const shelf = useShelf();
  const navigate = useNavigate();
  const want = collectionId === 'want';
  const id = want ? null : Number(collectionId);
  const collection = shelf.overview.collections.find(c => c.id === id) ?? null;
  const [items, setItems] = useState<ShelfItem[] | null>(want ? shelf.want : null);
  const [arranging, setArranging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const byId = useSeriesById();

  useEffect(() => {
    if (want) {
      setItems(shelf.want);
      return;
    }
    if (id === null || !Number.isSafeInteger(id)) return;
    let live = true;
    getCollectionItems(id).then(
      next => live && setItems(next),
      (e: unknown) => live && setError(e instanceof Error ? e.message : String(e))
    );
    return () => {
      live = false;
    };
  }, [want, id, shelf.version, shelf.want]);

  const first = items?.[0];
  const cover =
    collection?.preview[0]?.seriesId != null
      ? byId.get(collection.preview[0].seriesId)?.cover
      : first?.seriesId != null
        ? byId.get(first.seriesId)?.cover
        : undefined;
  usePageCover(cover ?? null);

  const act = (work: () => Promise<unknown>) => {
    setError(null);
    shelfChange(work).catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  };

  if (!want && shelf.status === 'ready' && !collection) {
    return (
      <>
        <BackToCollections />
        <PageHeader title="Missing collection" className="mt-4" />
        <EmptyState
          title="This collection is gone"
          actions={
            <Button variant="primary" asChild>
              <Link to="/collections">
                <Layers /> All collections
              </Link>
            </Button>
          }
        >
          <p>It may have been deleted. Its series are still in your library.</p>
        </EmptyState>
      </>
    );
  }

  const name = want ? 'Want to Read' : (collection?.name ?? 'Collection');
  const count = want ? shelf.overview.wantCount : (collection?.count ?? 0);
  const list = items ?? [];

  const reorder = (next: ShelfItem[]) => {
    setItems(next);
    if (id === null) return;
    const refs = next.map(i => i.refId).filter((r): r is number => r !== null);
    act(() => reorderCollection(id, refs));
  };
  const remove = (item: ShelfItem) =>
    act(() =>
      id === null
        ? setWantToRead([itemRef(item)], false)
        : removeFromCollection(id, [itemRef(item)])
    );

  return (
    <>
      <BackToCollections />
      <PageHeader
        className="mt-4"
        title={name}
        lead={
          want
            ? 'Series you mean to get to, newest first. Local series and MangaDex titles both fit here.'
            : seriesCount(count)
        }
        actions={
          <>
            {list.length > 0 && (
              <Button
                variant="ghost"
                aria-pressed={arranging}
                onClick={() => setArranging(a => !a)}
              >
                {arranging ? 'Done' : want ? 'Edit list' : 'Arrange'}
              </Button>
            )}
            {collection && (
              <>
                <NameDialog
                  trigger={
                    <Button variant="quiet" size="icon" aria-label={`Rename ${collection.name}`}>
                      <Pencil />
                    </Button>
                  }
                  title="Rename collection"
                  label="Name"
                  initial={collection.name}
                  submitLabel="Rename"
                  onSubmit={next => shelfChange(() => renameCollection(collection.id, next))}
                />
                <ConfirmButton
                  variant="quiet"
                  size="icon"
                  aria-label={`Delete ${collection.name}`}
                  title={`Delete ${collection.name}?`}
                  description="The collection goes. Its series stay in your library with their tags and other lists, and smart filters forget it."
                  confirmLabel="Delete collection"
                  danger
                  onConfirm={() =>
                    act(async () => {
                      await deleteCollection(collection.id);
                      void navigate({ to: '/collections' });
                    })
                  }
                >
                  <Trash2 />
                </ConfirmButton>
              </>
            )}
          </>
        }
      />
      {want && count > 0 && (
        <p className="tabular -mt-4 mb-8 text-sm text-fg-3">{seriesCount(count)}</p>
      )}
      {error && (
        <p role="alert" className="m-0 mb-6 text-sm text-err">
          {error}
        </p>
      )}

      {items !== null && list.length === 0 ? (
        <EmptyState title={want ? 'Nothing waiting yet' : 'An empty shelf'}>
          <p>
            {want
              ? 'Mark a series Want to Read on its page, or select series in the library and add them all at once.'
              : 'Add series from their page, or select several in the library and add them here in one go.'}
          </p>
        </EmptyState>
      ) : arranging ? (
        <ArrangeList
          items={list}
          ordered={!want}
          coverRefId={collection?.coverRefId ?? null}
          onReorder={reorder}
          onRemove={remove}
          onCover={
            collection
              ? item => act(() => setCollectionCover(collection.id, item.refId))
              : undefined
          }
        />
      ) : (
        <ShelfItems items={list} label={name} />
      )}
    </>
  );
}

/**
 * Members as rows to put in order: drag a row, or use its arrows from the
 * keyboard. Each row can also become the collection's cover or leave it.
 */
function ArrangeList({
  items,
  ordered,
  coverRefId,
  onReorder,
  onRemove,
  onCover,
}: {
  items: ShelfItem[];
  /** False for Want to Read, which keeps its newest first order. */
  ordered: boolean;
  coverRefId: number | null;
  onReorder: (next: ShelfItem[]) => void;
  onRemove: (item: ShelfItem) => void;
  onCover?: (item: ShelfItem) => void;
}) {
  const byId = useSeriesById();
  const [dragging, setDragging] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);

  const drop = (event: DragEvent, index: number) => {
    event.preventDefault();
    if (dragging !== null && dragging !== index) onReorder(moveItem(items, dragging, index));
    setDragging(null);
    setOver(null);
  };

  return (
    <ol className="m-0 grid max-w-[760px] list-none gap-1.5 p-0" aria-label="Arrange the series">
      {items.map((item, index) => {
        const series = item.seriesId !== null ? byId.get(item.seriesId) : undefined;
        const title = series?.title ?? item.title;
        const isCover = coverRefId !== null && item.refId === coverRefId;
        return (
          <li
            key={itemKey(item)}
            draggable={ordered}
            onDragStart={event => {
              event.dataTransfer.effectAllowed = 'move';
              setDragging(index);
            }}
            onDragOver={event => {
              if (dragging === null) return;
              event.preventDefault();
              setOver(index);
            }}
            onDragEnd={() => {
              setDragging(null);
              setOver(null);
            }}
            onDrop={event => drop(event, index)}
            className={cn(
              'grid grid-cols-[auto_40px_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-line bg-ink-1 py-2 pr-2 pl-2',
              'transition-[border-color,opacity] duration-base ease-expo',
              dragging === index && 'opacity-50',
              over === index && dragging !== index && 'border-accent'
            )}
          >
            {ordered ? (
              <GripVertical aria-hidden className="size-4 cursor-grab text-fg-3" />
            ) : (
              <span className="w-4" aria-hidden />
            )}
            <Cover
              cover={series?.cover ?? null}
              src={series ? undefined : itemCoverSrc(item)}
              title={title}
            />
            <span className="grid min-w-0 gap-0.5">
              <span className="truncate font-semibold">{title}</span>
              <span className="text-xs text-fg-3">
                {item.seriesId === null ? 'MangaDex' : isCover ? 'Collection cover' : 'On disk'}
              </span>
            </span>
            <span className="flex items-center gap-1">
              {ordered && (
                <>
                  <Button
                    variant="quiet"
                    size="icon-sm"
                    aria-label={`Move ${title} up`}
                    disabled={index === 0}
                    onClick={() => onReorder(moveItem(items, index, index - 1))}
                  >
                    <ArrowUp />
                  </Button>
                  <Button
                    variant="quiet"
                    size="icon-sm"
                    aria-label={`Move ${title} down`}
                    disabled={index === items.length - 1}
                    onClick={() => onReorder(moveItem(items, index, index + 1))}
                  >
                    <ArrowDown />
                  </Button>
                </>
              )}
              {onCover && (
                <Button
                  variant="quiet"
                  size="icon-sm"
                  aria-label={`Use ${title} as the cover`}
                  aria-pressed={isCover}
                  onClick={() => onCover(item)}
                  className={cn(isCover && 'text-accent')}
                >
                  <ImageIcon />
                </Button>
              )}
              <Button
                variant="quiet"
                size="icon-sm"
                aria-label={`Remove ${title} from the list`}
                onClick={() => onRemove(item)}
              >
                <X />
              </Button>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
