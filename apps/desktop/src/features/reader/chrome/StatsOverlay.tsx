import { useEffect, useState } from 'react';

import { isTauri } from '@/lib/ipc';
import { formatBytes, readerStats, type ReaderStats } from '@/lib/reader';

const POLL_MS = 1000;

const ms = (us: number) => `${(us / 1000).toFixed(1)} ms`;

/**
 * Engine numbers over the stage (the I key): how long the last page took to
 * show, the backend's serve and render latency and the cache. For measuring
 * page turns in the real app.
 */
export function StatsOverlay({
  page,
  revision,
  turnMs,
}: {
  page: number;
  revision: number | undefined;
  /** Page change to image load of the last turn, in ms. */
  turnMs: number | null;
}) {
  const [stats, setStats] = useState<ReaderStats | null>(null);

  useEffect(() => {
    if (!isTauri()) return;
    let alive = true;
    const poll = () =>
      readerStats().then(
        next => alive && setStats(next),
        () => {}
      );
    void poll();
    const timer = setInterval(poll, POLL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  const rows: Array<[string, string]> = [
    ['Page', String(page + 1)],
    ['Revision', revision === undefined ? '...' : String(revision)],
    ['Last turn', turnMs === null ? '...' : `${turnMs.toFixed(1)} ms`],
  ];
  if (stats) {
    rows.push(
      ['Serve p50 / p95', `${ms(stats.serve.p50Us)} / ${ms(stats.serve.p95Us)}`],
      ['Render p50 / p95', `${ms(stats.render.p50Us)} / ${ms(stats.render.p95Us)}`],
      ['Hits / misses', `${stats.hits} / ${stats.misses}`],
      ['Cache', `${stats.cachedPages} pages, ${formatBytes(stats.cachedBytes)}`]
    );
  }

  return (
    <dl
      data-testid="reader-stats"
      className="glass absolute bottom-[84px] left-3 z-[3] m-0 grid grid-cols-[auto_auto] gap-x-4 gap-y-0.5 rounded-xl px-3 py-2 font-mono text-[11px] text-fg-2"
    >
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-fg-3">{label}</dt>
          <dd className="m-0 text-right text-fg-1 tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
