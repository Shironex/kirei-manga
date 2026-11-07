import { LoaderCircle, TriangleAlert } from 'lucide-react';

import { Progress } from '@/components/ui/progress';
import type { ScanPhase, ScanProgress } from '@/lib/library';
import { cn } from '@/lib/utils';

const PHASES: Record<ScanPhase, string> = {
  discovering: 'Looking for series',
  reading: 'Reading archives',
  covers: 'Making covers',
  saving: 'Saving',
  done: 'Finishing up',
};

/** Overall share done: each phase owns a slice so the bar never jumps back. */
const SLICES: Record<ScanPhase, [number, number]> = {
  discovering: [0, 0.1],
  reading: [0.1, 0.7],
  covers: [0.7, 0.95],
  saving: [0.95, 1],
  done: [1, 1],
};

export function scanFraction(scan: ScanProgress): number {
  const [from, to] = SLICES[scan.phase];
  const within = scan.total > 0 ? Math.min(1, scan.done / scan.total) : 0;
  return from + (to - from) * within;
}

/** A live line while a scan runs, or the reason the last one failed. */
export function ScanStatus({
  scan,
  error,
  className,
}: {
  scan: ScanProgress | null;
  error: string | null;
  className?: string;
}) {
  if (!scan && !error) return null;
  if (!scan) {
    return (
      <p role="alert" className={cn('m-0 flex items-center gap-2 text-sm text-err', className)}>
        <TriangleAlert className="size-4" aria-hidden /> The scan stopped: {error}
      </p>
    );
  }
  const counted = scan.total > 0 && scan.phase !== 'discovering';
  return (
    <div
      role="status"
      className={cn(
        'grid max-w-[460px] grid-cols-[18px_minmax(0,1fr)] items-center gap-x-3 gap-y-2 rounded-panel border border-line bg-ink-1/80 px-4 py-3',
        className
      )}
    >
      <LoaderCircle
        aria-hidden
        className="size-[18px] animate-spin text-accent motion-reduce:animate-none"
      />
      <p className="m-0 flex min-w-0 items-baseline justify-between gap-3 text-sm">
        <span className="font-medium text-fg-1">{PHASES[scan.phase]}</span>
        {counted && (
          <span className="tabular shrink-0 text-xs text-fg-3">
            {scan.done.toLocaleString()} of {scan.total.toLocaleString()}
          </span>
        )}
      </p>
      <Progress
        value={scanFraction(scan)}
        label="Scan progress"
        className="col-start-2"
        size="md"
      />
      {scan.current && (
        <p className="col-start-2 m-0 truncate font-mono text-xs text-fg-3">{scan.current}</p>
      )}
    </div>
  );
}
