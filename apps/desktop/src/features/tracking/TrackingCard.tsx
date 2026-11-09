import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Link2, Link2Off, RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useSetting } from '@/lib/settings/store';
import {
  describeProgress,
  LIST_STATUS_LABEL,
  LIST_STATUSES,
  linkSeries,
  syncSeries,
  unlinkSeries,
  updateEntry,
  type ListStatus,
  type Media,
  type SeriesRef,
  type SeriesTracking,
} from '@/lib/tracking';

import { LinkDialog } from './LinkDialog';
import { useAccount } from './useAccount';
import { useSeriesTracking } from './useSeriesTracking';

function describeQueued(state: SeriesTracking): string | null {
  const queued = state.queued;
  if (!queued) return null;
  if (queued.lastError) return `Not sent yet, retrying: ${queued.lastError}`;
  return 'Waiting to sync.';
}

/**
 * The series page's AniList card: link the series through a search, then see
 * progress on both sides, change the status and sync now.
 */
export function TrackingCard({
  series,
  title,
  year,
  version,
}: {
  series: SeriesRef;
  title: string;
  year: number | null;
  version: number;
}) {
  const [enabled] = useSetting('tracking.enabled');
  const { account } = useAccount();
  const { state, setState, error, setError } = useSeriesTracking(series, version);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);

  const run = async (work: () => Promise<SeriesTracking>) => {
    setBusy(true);
    setError(null);
    try {
      setState(await work());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const link = state?.link ?? null;
  const signedIn = account?.signedIn === true;
  const ready = enabled && signedIn;
  const progress = state ? describeProgress(state) : null;
  const queued = state ? describeQueued(state) : null;

  let lead: string;
  if (!enabled) lead = 'Tracking is off.';
  else if (!signedIn) lead = 'Sign in to AniList to track this series.';
  else if (!link) lead = 'Link this series to its AniList entry to sync your progress.';
  else lead = link.title ?? `AniList entry ${link.mediaId}`;

  return (
    <section
      aria-labelledby="tracking-heading"
      className="rounded-panel border border-line bg-ink-1 p-6"
    >
      <h2
        id="tracking-heading"
        className="m-0 mb-1 font-display text-lg leading-tight font-[650] font-condensed"
      >
        AniList
      </h2>
      <p className="m-0 mb-4 text-sm text-fg-2">{lead}</p>

      {(!enabled || !signedIn) && (
        <Button variant="ghost" size="sm" asChild>
          <Link to="/settings" hash="settings-accounts">
            Open Accounts
          </Link>
        </Button>
      )}

      {ready && link && (
        <div className="grid gap-3">
          <div aria-live="polite" className="text-sm text-fg-3 empty:hidden">
            {progress && <p className="tabular m-0">{progress}</p>}
            {queued && <p className="m-0">{queued}</p>}
          </div>
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="tracking-status" className="text-sm text-fg-2">
              Status
            </label>
            <Select
              value={link.remoteStatus ?? undefined}
              disabled={busy}
              onValueChange={value =>
                void run(() => updateEntry(series, { status: value as ListStatus }))
              }
            >
              <SelectTrigger id="tracking-status" className="w-36">
                <SelectValue placeholder="Not listed" />
              </SelectTrigger>
              <SelectContent>
                {LIST_STATUSES.map(status => (
                  <SelectItem key={status} value={status}>
                    {LIST_STATUS_LABEL[status]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={() => void run(() => syncSeries(series))}
            >
              <RefreshCw /> Sync now
            </Button>
            <Button variant="quiet" size="sm" disabled={busy} onClick={() => setPicking(true)}>
              <Link2 /> Change
            </Button>
            <Button
              variant="quiet"
              size="sm"
              disabled={busy}
              onClick={() => void run(() => unlinkSeries(series))}
            >
              <Link2Off /> Unlink
            </Button>
          </div>
        </div>
      )}

      {ready && state && !link && (
        <Button variant="primary" size="sm" onClick={() => setPicking(true)}>
          <Link2 /> Find on AniList
        </Button>
      )}

      <p aria-live="polite" className="m-0 empty:hidden">
        {error && <span className="mt-3 block text-sm text-err">{error}</span>}
      </p>

      <LinkDialog
        open={picking}
        onOpenChange={setPicking}
        initialQuery={title}
        year={year}
        onPick={async (media: Media) => {
          setState(await linkSeries(series, media));
        }}
      />
    </section>
  );
}
