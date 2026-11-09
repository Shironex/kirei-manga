import { useEffect, useMemo, useState } from 'react';
import { getRouteApi, Link, useNavigate } from '@tanstack/react-router';
import { ListFilter, Pencil, Pin, PinOff, Trash2 } from 'lucide-react';

import { EmptyState } from '@/components/page/EmptyState';
import { PageHeader } from '@/components/page/PageHeader';
import { Button } from '@/components/ui/button';
import {
  deleteFilter,
  deleteTag,
  EMPTY_QUERY,
  MAX_FILTER_ROWS,
  pinFilter,
  renameTag,
  runFilter,
  type FilterQuery,
  type FilterResult,
} from '@/lib/shelf';
import { usePageCover } from '@/lib/theme/coverTheme';

import { useLibrary } from '../library/libraryStore';
import { ConfirmButton } from '../settings/ConfirmButton';
import { BackToCollections } from './CollectionPage';
import { FilterBuilder } from './FilterBuilder';
import { describeQuery, seriesCount } from './model';
import { NameDialog } from './NameDialog';
import { ShelfItems, useSeriesById } from './ShelfItems';
import { shelfChange, useShelf } from './shelfStore';

const filterRoute = getRouteApi('/shell/filters/$filterId');
const tagRoute = getRouteApi('/shell/tags/$tagId');

/**
 * Runs a query and keeps the result fresh: again when the query changes,
 * when the shelf changes and after a scan.
 */
function useFilterResult(query: FilterQuery | null): {
  result: FilterResult | null;
  error: string | null;
} {
  const { version } = useShelf();
  const { version: catalogue } = useLibrary();
  const [result, setResult] = useState<FilterResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const key = query ? JSON.stringify(query) : null;

  useEffect(() => {
    if (key === null) return;
    let live = true;
    runFilter(JSON.parse(key) as FilterQuery, MAX_FILTER_ROWS).then(
      next => {
        if (!live) return;
        setResult(next);
        setError(null);
      },
      (e: unknown) => live && setError(e instanceof Error ? e.message : String(e))
    );
    return () => {
      live = false;
    };
  }, [key, version, catalogue]);

  return { result, error };
}

function Results({
  result,
  error,
  label,
}: {
  result: FilterResult | null;
  error: string | null;
  label: string;
}) {
  const byId = useSeriesById();
  const first = result?.items.find(i => i.seriesId !== null);
  usePageCover(first?.seriesId != null ? (byId.get(first.seriesId)?.cover ?? null) : null);

  if (error) {
    return (
      <p role="alert" className="m-0 text-sm text-err">
        {error}
      </p>
    );
  }
  if (!result) return null;
  if (result.items.length === 0) {
    return (
      <EmptyState title="Nothing matches yet">
        <p>
          No series fits this right now. As your library changes, matches show up here on their own.
        </p>
      </EmptyState>
    );
  }
  return <ShelfItems items={result.items} label={label} />;
}

/** A saved smart filter's matches, with its edit, pin and delete actions. */
export function FilterPage() {
  const { filterId } = filterRoute.useParams();
  const shelf = useShelf();
  const navigate = useNavigate();
  const filter = shelf.overview.filters.find(f => String(f.id) === filterId) ?? null;
  const { result, error } = useFilterResult(filter?.query ?? null);
  const [editing, setEditing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const act = (work: () => Promise<unknown>) => {
    setActionError(null);
    shelfChange(work).catch((e: unknown) =>
      setActionError(e instanceof Error ? e.message : String(e))
    );
  };

  if (shelf.status === 'ready' && !filter) {
    return (
      <>
        <BackToCollections />
        <PageHeader title="Missing filter" className="mt-4" />
        <EmptyState
          title="This smart filter is gone"
          actions={
            <Button variant="primary" asChild>
              <Link to="/collections">
                <ListFilter /> All filters
              </Link>
            </Button>
          }
        >
          <p>It may have been deleted. Nothing in your library changed.</p>
        </EmptyState>
      </>
    );
  }
  if (!filter) return <BackToCollections />;

  return (
    <>
      <BackToCollections />
      <PageHeader
        className="mt-4"
        title={filter.name}
        lead={describeQuery(filter.query, shelf.overview)}
        actions={
          <>
            <Button
              variant="ghost"
              aria-pressed={filter.pinned}
              onClick={() => act(() => pinFilter(filter.id, !filter.pinned))}
            >
              {filter.pinned ? <PinOff /> : <Pin />}
              {filter.pinned ? 'Unpin from Home' : 'Pin to Home'}
            </Button>
            <Button
              variant="quiet"
              size="icon"
              aria-label={`Edit ${filter.name}`}
              onClick={() => setEditing(true)}
            >
              <Pencil />
            </Button>
            <ConfirmButton
              variant="quiet"
              size="icon"
              aria-label={`Delete ${filter.name}`}
              title={`Delete ${filter.name}?`}
              description="The filter goes, and its row leaves Home. Your series, tags and collections stay as they are."
              confirmLabel="Delete filter"
              danger
              onConfirm={() =>
                act(async () => {
                  await deleteFilter(filter.id);
                  void navigate({ to: '/collections' });
                })
              }
            >
              <Trash2 />
            </ConfirmButton>
          </>
        }
      />
      <ResultCount result={result} />
      {actionError && (
        <p role="alert" className="m-0 mb-6 text-sm text-err">
          {actionError}
        </p>
      )}
      <Results result={result} error={error} label={filter.name} />
      <FilterBuilder open={editing} onOpenChange={setEditing} filter={filter} />
    </>
  );
}

function ResultCount({ result }: { result: FilterResult | null }) {
  if (!result) return null;
  return (
    <p className="tabular -mt-4 mb-8 text-sm text-fg-3">
      {seriesCount(result.total)}
      {result.total > result.items.length &&
        `, showing the first ${result.items.length.toLocaleString('en')}`}
    </p>
  );
}

/** Every series with one tag, with rename, delete and "save as smart filter". */
export function TagPage() {
  const { tagId } = tagRoute.useParams();
  const shelf = useShelf();
  const navigate = useNavigate();
  const tag = shelf.overview.tags.find(t => String(t.id) === tagId) ?? null;
  const query = useMemo<FilterQuery | null>(
    () => (tag ? { ...EMPTY_QUERY, tags: [tag.id] } : null),
    [tag]
  );
  const { result, error } = useFilterResult(query);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  if (shelf.status === 'ready' && !tag) {
    return (
      <>
        <BackToCollections />
        <PageHeader title="Missing tag" className="mt-4" />
        <EmptyState title="No series carries this tag any more">
          <p>A tag goes when it comes off its last series, or when it is deleted.</p>
        </EmptyState>
      </>
    );
  }
  if (!tag) return <BackToCollections />;

  return (
    <>
      <BackToCollections />
      <PageHeader
        className="mt-4"
        title={tag.name}
        lead="Every series with this tag."
        actions={
          <>
            <Button variant="ghost" onClick={() => setSaving(true)}>
              <ListFilter /> Save as smart filter
            </Button>
            <NameDialog
              trigger={
                <Button variant="quiet" size="icon" aria-label={`Rename the tag ${tag.name}`}>
                  <Pencil />
                </Button>
              }
              title="Rename tag"
              description="Renaming it to the name of another tag merges the two."
              label="Name"
              initial={tag.name}
              submitLabel="Rename"
              onSubmit={async name => {
                const kept = await shelfChange(() => renameTag(tag.id, name));
                if (kept.id !== tag.id) {
                  void navigate({ to: '/tags/$tagId', params: { tagId: String(kept.id) } });
                }
              }}
            />
            <ConfirmButton
              variant="quiet"
              size="icon"
              aria-label={`Delete the tag ${tag.name}`}
              title={`Delete the tag ${tag.name}?`}
              description={`It comes off ${seriesCount(tag.count)}, and smart filters stop using it. The series stay in your library.`}
              confirmLabel="Delete tag"
              danger
              onConfirm={() => {
                setActionError(null);
                shelfChange(() => deleteTag(tag.id))
                  .then(() => navigate({ to: '/collections' }))
                  .catch((e: unknown) =>
                    setActionError(e instanceof Error ? e.message : String(e))
                  );
              }}
            >
              <Trash2 />
            </ConfirmButton>
          </>
        }
      />
      <ResultCount result={result} />
      {actionError && (
        <p role="alert" className="m-0 mb-6 text-sm text-err">
          {actionError}
        </p>
      )}
      <Results result={result} error={error} label={tag.name} />
      <FilterBuilder
        open={saving}
        onOpenChange={setSaving}
        initial={{ tags: [tag.id] }}
        onSaved={saved =>
          void navigate({ to: '/filters/$filterId', params: { filterId: String(saved.id) } })
        }
      />
    </>
  );
}
