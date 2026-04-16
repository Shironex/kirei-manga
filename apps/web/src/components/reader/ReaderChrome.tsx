import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Settings } from 'lucide-react';
import type { FitMode, ReaderDirection, ReaderMode } from '@kireimanga/shared';
import { ReaderSettingsPopover } from './ReaderSettingsPopover';

interface Props {
  pageNumber: number;
  totalPages: number;
  visible: boolean;
  mode: ReaderMode;
  direction: ReaderDirection;
  fit: FitMode;
  onPrefsChange: (partial: {
    mode?: ReaderMode;
    direction?: ReaderDirection;
    fit?: FitMode;
  }) => void;
}

export function ReaderChrome({
  pageNumber,
  totalPages,
  visible,
  mode,
  direction,
  fit,
  onPrefsChange,
}: Props) {
  const navigate = useNavigate();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  const isMac =
    typeof window !== 'undefined' && window.electronAPI?.platform === 'darwin';

  // Dismiss popover on outside click.
  useEffect(() => {
    if (!settingsOpen) return;
    const onDown = (e: MouseEvent) => {
      const node = popoverRef.current;
      if (node && !node.contains(e.target as Node)) {
        setSettingsOpen(false);
      }
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [settingsOpen]);

  // Close the settings popover whenever the chrome auto-hides.
  useEffect(() => {
    if (!visible) setSettingsOpen(false);
  }, [visible]);

  return (
    <div
      ref={popoverRef}
      aria-hidden={!visible}
      className={[
        'pointer-events-none fixed inset-x-0 top-0 z-20 transition-opacity duration-200',
        visible ? 'opacity-100' : 'opacity-0',
      ].join(' ')}
    >
      <header
        className="app-drag pointer-events-auto flex h-12 items-center justify-between border-b border-border bg-[var(--color-ink)]/85 pr-4 backdrop-blur"
        style={{ paddingLeft: isMac ? 84 : 24 }}
      >
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="app-no-drag group inline-flex items-center gap-2 text-[12px] tracking-wide text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5 stroke-[1.4] transition-transform group-hover:-translate-x-0.5" />
          Back
        </button>

        <div className="flex items-center gap-3 text-[11px]">
          <span
            className="font-display text-[14px] leading-none font-[360] text-foreground"
            aria-hidden
          >
            Reader
          </span>
          <span className="font-mono tracking-[0.18em] text-[var(--color-bone-faint)] uppercase">
            {totalPages > 0
              ? `${String(pageNumber).padStart(2, '0')} / ${String(totalPages).padStart(2, '0')}`
              : '— / —'}
          </span>
        </div>

        <button
          type="button"
          onClick={() => setSettingsOpen(open => !open)}
          aria-haspopup="dialog"
          aria-expanded={settingsOpen}
          aria-label="Reader settings"
          className={[
            'app-no-drag inline-flex h-7 w-7 items-center justify-center rounded-sm transition-colors',
            settingsOpen
              ? 'text-foreground'
              : 'text-[var(--color-bone-muted)] hover:text-foreground',
          ].join(' ')}
        >
          <Settings className="h-4 w-4 stroke-[1.4]" />
        </button>
      </header>

      {settingsOpen && (
        <div className="pointer-events-auto">
          <ReaderSettingsPopover
            mode={mode}
            direction={direction}
            fit={fit}
            onChange={onPrefsChange}
          />
        </div>
      )}
    </div>
  );
}
