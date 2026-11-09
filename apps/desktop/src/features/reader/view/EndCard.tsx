import type { ReactNode } from 'react';
import { ArrowLeft, ChevronRight, FolderOpen } from 'lucide-react';

import kireiFull from '@/assets/kirei/full.webp';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import type { ChapterLink } from '../useChapter';

/**
 * Shown past the last page: what was finished and what comes next, with the
 * next chapter as the one primary action. Kirei keeps it company.
 */
export function EndCard({
  label,
  next,
  onNext,
  onBack,
  backLabel,
  onOpenFile,
  autoFocus = false,
  lastNote,
  hint,
  className,
}: {
  label: string;
  next: ChapterLink | null;
  onNext: () => void;
  onBack: () => void;
  backLabel: string;
  /** Offered for a chapter opened from a file, which has no next chapter. */
  onOpenFile?: () => void;
  /** Focus the primary action on mount, for the card that covers the stage. */
  autoFocus?: boolean;
  /** Replaces "the last chapter on your shelf" when there is no next chapter. */
  lastNote?: string;
  /** How to read on without a click, under the actions. */
  hint?: ReactNode;
  className?: string;
}) {
  let body: ReactNode;
  if (next) {
    body = (
      <p>
        Next up: {next.label}
        {next.title ? `, ${next.title}` : ''}.
      </p>
    );
  } else if (onOpenFile) {
    body = <p>Open another archive or folder to keep reading.</p>;
  } else {
    body = <p>{lastNote ?? 'That was the last chapter on your shelf for this series.'}</p>;
  }

  return (
    <div
      role="status"
      data-testid="end-card"
      className={cn(
        'grid w-full max-w-[520px] animate-pop grid-cols-[88px_minmax(0,1fr)] items-center gap-6 rounded-panel border border-line bg-ink-1 p-8 shadow-[0_40px_80px_-30px_oklch(0_0_0/0.8)]',
        className
      )}
    >
      <img src={kireiFull} alt="Kirei" draggable={false} className="w-[88px] select-none" />
      <div>
        <h3 className="m-0 mb-1 font-display text-xl leading-tight font-[650] font-condensed">
          {label} finished
        </h3>
        <div className="mb-4 text-sm text-fg-2 [&_p]:m-0">{body}</div>
        <div className="flex flex-wrap items-center gap-2">
          {next && (
            <Button variant="primary" size="sm" onClick={onNext} autoFocus={autoFocus}>
              Read {next.label} <ChevronRight />
            </Button>
          )}
          {!next && onOpenFile && (
            <Button variant="primary" size="sm" onClick={onOpenFile} autoFocus={autoFocus}>
              <FolderOpen /> Open a file
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft /> {backLabel}
          </Button>
        </div>
        {next && hint && <p className="m-0 mt-3 text-xs text-fg-3">{hint}</p>}
      </div>
    </div>
  );
}
