import { useMemo } from 'react';
import { CircleAlert, Download, ShieldCheck } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { isTauri } from '@/lib/ipc';
import type { ReadingStats } from '@/lib/stats';
import { cn } from '@/lib/utils';

import { buildCardModel, describeCard } from './cardModel';
import { useYearCard } from './useYearCard';

/**
 * The year in review card: the same canvas the PNG is made from, shown at
 * a third of its size, with the save button beside it.
 */
export function YearCard({ stats }: { stats: ReadingStats }) {
  const model = useMemo(() => buildCardModel(stats), [stats]);
  const { canvasRef, drawn, exportState, exportPng, size } = useYearCard(model);
  const empty = stats.yearTotals.sessions === 0;

  return (
    <div className="grid items-center gap-8 md:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
      <canvas
        ref={canvasRef}
        width={size.width}
        height={size.height}
        role="img"
        aria-label={describeCard(model)}
        className={cn(
          'block aspect-[4/5] w-full rounded-panel bg-ink-1',
          'shadow-[0_40px_90px_-30px_oklch(0.02_0.03_var(--seed-h)/0.95),0_0_0_1px_var(--line)]',
          'transition-opacity duration-slow ease-expo',
          drawn ? 'opacity-100' : 'opacity-0'
        )}
      />
      <div className="max-w-[46ch]">
        <p className="m-0 mb-2 text-sm font-semibold text-accent">{model.year} in review</p>
        <h3 className="m-0 mb-3 font-display text-3xl font-bold font-condensed">
          Your year on one card
        </h3>
        <p className="m-0 mb-6 text-fg-2">
          Coloured by the cover you read most. Save it as a PNG and share it wherever you like; the
          app itself never sends it anywhere.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="primary"
            disabled={!isTauri() || !drawn || empty || exportState.step === 'saving'}
            onClick={() => void exportPng()}
          >
            <Download />
            {exportState.step === 'saving' ? 'Saving' : 'Save as PNG'}
          </Button>
          {empty && <span className="text-sm text-fg-3">Read a chapter to fill the card.</span>}
        </div>
        <p role="status" className="m-0 mt-4 min-h-[1.5em] text-sm">
          {exportState.step === 'saved' && (
            <span className="inline-flex items-start gap-2 text-ok">
              <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0" />
              <span className="break-all">Saved to {exportState.path}</span>
            </span>
          )}
          {exportState.step === 'failed' && (
            <span className="inline-flex items-start gap-2 text-err">
              <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
              <span>The card was not saved: {exportState.message}</span>
            </span>
          )}
        </p>
      </div>
    </div>
  );
}
