import { useEffect, useMemo, useState } from 'react';
import type { SearchResult, Series } from '@kireimanga/shared';
import {
  LocalEvents,
  type LocalUpdateSeriesPayload,
  type LocalUpdateSeriesResponse,
  type LocalSeriesMetaPatch,
} from '@kireimanga/shared';
import { Drawer } from '../ui/Drawer';
import { emitWithResponse } from '@/lib/socket';
import { useMangaDexSearch } from '@/hooks/useMangaDexSearch';
import { useToastStore } from '@/stores/toast-store';

interface Props {
  open: boolean;
  onClose: () => void;
  series: Series;
  onSaved: (updated: Series) => void;
}

/**
 * Editor for the metadata fields a user is most likely to fix after an
 * import: display title, Japanese title, free-form notes, personal score.
 * Cover upload lives in a follow-up — handling file bytes over the
 * socket is a separate scope. Status changes continue to flow through
 * the existing `library:update-status` path (source-agnostic), so this
 * drawer intentionally stays narrow.
 */
export function LocalMetadataDrawer({ open, onClose, series, onSaved }: Props) {
  const pushToast = useToastStore(s => s.show);

  const [title, setTitle] = useState(series.title);
  const [titleJapanese, setTitleJapanese] = useState(series.titleJapanese ?? '');
  const [notes, setNotes] = useState(series.notes ?? '');
  const [score, setScore] = useState<string>(series.score?.toString() ?? '');
  const [mangadexId, setMangadexId] = useState<string | undefined>(series.mangadexId);
  const [linkedPreview, setLinkedPreview] = useState<SearchResult | null>(null);
  const [mangadexQuery, setMangadexQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset the form whenever the drawer opens or the target series
  // changes — prevents a stale form after a second edit session.
  useEffect(() => {
    if (!open) return;
    setTitle(series.title);
    setTitleJapanese(series.titleJapanese ?? '');
    setNotes(series.notes ?? '');
    setScore(series.score?.toString() ?? '');
    setMangadexId(series.mangadexId);
    setLinkedPreview(null);
    setMangadexQuery('');
    setError(null);
  }, [
    open,
    series.id,
    series.title,
    series.titleJapanese,
    series.notes,
    series.score,
    series.mangadexId,
  ]);

  // Keep the search filter stable for the hook's request-id dedup.
  const searchFilters = useMemo(() => ({ limit: 5 }), []);
  const mangadexSearch = useMangaDexSearch(mangadexQuery, searchFilters);

  const buildPatch = (): LocalSeriesMetaPatch => {
    const patch: LocalSeriesMetaPatch = {};
    const trimmedTitle = title.trim();
    if (trimmedTitle && trimmedTitle !== series.title) {
      patch.title = trimmedTitle;
    }
    const trimmedJp = titleJapanese.trim();
    if (trimmedJp !== (series.titleJapanese ?? '')) {
      patch.titleJapanese = trimmedJp || undefined;
    }
    const trimmedNotes = notes.trim();
    if (trimmedNotes !== (series.notes ?? '')) {
      patch.notes = trimmedNotes || undefined;
    }
    const parsedScore = score.trim() === '' ? undefined : Number.parseInt(score, 10);
    if (parsedScore !== series.score) {
      patch.score = parsedScore;
    }
    if (mangadexId && mangadexId !== series.mangadexId) {
      patch.mangadexId = mangadexId;
    }
    return patch;
  };

  const applyMangadexLink = (result: SearchResult): void => {
    setMangadexId(result.id);
    setLinkedPreview(result);
    // Only pre-fill title fields if the user hasn't overridden them yet.
    if (title === series.title) setTitle(result.title);
  };

  const clearMangadexLink = (): void => {
    setMangadexId(series.mangadexId);
    setLinkedPreview(null);
  };

  const handleSave = async (): Promise<void> => {
    const patch = buildPatch();
    if (Object.keys(patch).length === 0) {
      onClose();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const response = await emitWithResponse<
        LocalUpdateSeriesPayload,
        LocalUpdateSeriesResponse
      >(LocalEvents.UPDATE_SERIES, { id: series.id, patch });
      if (response.error || !response.series) {
        // Re-raise with a friendlier message on the typed mangadex-id-taken
        // error so the user understands the collision without leaving the
        // drawer open in a confusing state.
        if (response.error === 'mangadex-id-taken') {
          throw new Error('That MangaDex entry is already linked to another library series.');
        }
        throw new Error(response.error ?? 'local:update-series returned no series');
      }
      onSaved(response.series);
      pushToast({ variant: 'success', title: 'Saved', body: `${response.series.title} updated.` });
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      eyebrow="Local · Metadata"
      title="Edit series"
      footer={
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="font-mono text-[11px] tracking-[0.22em] text-[var(--color-bone-muted)] underline-offset-4 uppercase hover:text-foreground hover:underline disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className="inline-flex h-9 items-center rounded-[2px] border border-[var(--color-accent)] bg-[var(--color-accent)] px-5 font-mono text-[11px] tracking-[0.22em] text-[var(--color-accent-foreground)] uppercase transition-opacity hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <Field label="Title">
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            className="h-10 w-full border-b border-[var(--color-rule)] bg-transparent font-display text-[16px] font-[360] tracking-[-0.01em] text-foreground outline-none transition-colors focus:border-[var(--color-accent)]"
          />
        </Field>

        <Field label="Japanese title">
          <input
            type="text"
            value={titleJapanese}
            onChange={e => setTitleJapanese(e.target.value)}
            placeholder="—"
            className="h-10 w-full border-b border-[var(--color-rule)] bg-transparent font-kanji text-[15px] text-[var(--color-bone-muted)] outline-none transition-colors focus:border-[var(--color-accent)]"
          />
        </Field>

        <Field label="Score">
          <div className="flex items-center gap-3">
            <input
              type="number"
              min={1}
              max={10}
              step={1}
              value={score}
              onChange={e => setScore(e.target.value)}
              placeholder="—"
              className="h-10 w-20 border-b border-[var(--color-rule)] bg-transparent text-center font-mono text-[14px] text-foreground outline-none transition-colors focus:border-[var(--color-accent)]"
            />
            <span className="font-mono text-[10px] tracking-[0.22em] text-[var(--color-bone-faint)] uppercase">
              / 10
            </span>
          </div>
        </Field>

        <Field label="Notes">
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={5}
            placeholder="Thoughts, reminders, where you left off…"
            className="w-full border border-[var(--color-rule)] bg-transparent px-3 py-2 text-[13.5px] leading-relaxed text-foreground outline-none transition-colors focus:border-[var(--color-accent)]"
          />
        </Field>

        <div className="mt-3 flex flex-col gap-3 border-t border-[var(--color-rule)] pt-5">
          <span className="font-mono text-[10px] tracking-[0.24em] text-[var(--color-bone-faint)] uppercase">
            Find on MangaDex
          </span>

          {mangadexId ? (
            <div className="flex items-baseline justify-between gap-3 border border-[var(--color-rule-strong)] px-3 py-2">
              <span className="font-display truncate text-[13px] text-foreground">
                {linkedPreview?.title ?? series.title}
              </span>
              <button
                type="button"
                onClick={clearMangadexLink}
                className="font-mono text-[10px] tracking-[0.22em] text-[var(--color-bone-muted)] underline-offset-4 uppercase hover:text-[var(--color-accent)] hover:underline"
              >
                Unlink
              </button>
            </div>
          ) : (
            <>
              <input
                type="text"
                value={mangadexQuery}
                onChange={e => setMangadexQuery(e.target.value)}
                placeholder={series.title}
                className="h-10 w-full border-b border-[var(--color-rule)] bg-transparent text-[14px] text-foreground outline-none transition-colors focus:border-[var(--color-accent)]"
              />
              {mangadexSearch.loading && (
                <span className="font-mono text-[10px] tracking-[0.22em] text-[var(--color-bone-faint)] uppercase">
                  Searching…
                </span>
              )}
              {mangadexSearch.error && (
                <span className="font-mono text-[10px] tracking-[0.22em] text-[var(--color-accent)] uppercase">
                  {mangadexSearch.error}
                </span>
              )}
              {mangadexSearch.results.length > 0 && (
                <ul className="flex flex-col divide-y divide-[var(--color-rule)] border border-[var(--color-rule)]">
                  {mangadexSearch.results.slice(0, 5).map(result => (
                    <li key={result.id}>
                      <button
                        type="button"
                        onClick={() => applyMangadexLink(result)}
                        className="group flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-[var(--color-ink-raised)]"
                      >
                        <span className="font-display min-w-0 flex-1 truncate text-[13px] text-foreground italic group-hover:not-italic group-hover:text-[var(--color-accent)]">
                          {result.title}
                        </span>
                        <span className="font-mono text-[10px] tracking-[0.22em] text-[var(--color-bone-faint)] uppercase">
                          {result.year ?? '—'}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>

        {error && (
          <p className="border-l-2 border-[var(--color-accent)] py-1 pl-3 text-[12.5px] text-[var(--color-accent)]">
            {error}
          </p>
        )}
      </div>
    </Drawer>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-2">
      <span className="font-mono text-[10px] tracking-[0.24em] text-[var(--color-bone-faint)] uppercase">
        {label}
      </span>
      {children}
    </label>
  );
}
