import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ScanCandidateSeries, ScanResult } from '@kireimanga/shared';
import { BackButton } from '../components/layout/BackButton';
import { PageHeader } from '../components/layout/PageHeader';
import { EmptyState } from '../components/layout/EmptyState';
import { useFolderPicker, useScanRoot, useImport } from '@/hooks/useLocalImport';
import { useToastStore } from '@/stores/toast-store';
import { useT } from '@/hooks/useT';

type Phase = 'idle' | 'scanning' | 'review' | 'importing' | 'done';

interface ReviewRow {
  index: number;
  selected: boolean;
  title: string;
}

/**
 * Editorial folder-import flow. Scans a user-picked root, shows a review
 * panel of detected series (selectable + editable titles), commits the
 * survivors to the local library. Progress is streamed via
 * `local:scan-progress` — the hook handles listener lifecycle so this
 * component only reflects the latest tick.
 */
export function LibraryImportPage() {
  const t = useT();
  const navigate = useNavigate();
  const pushToast = useToastStore(s => s.show);
  const { pick } = useFolderPicker();
  const { progress, scan, reset: resetScan } = useScanRoot();
  const { importing, commit } = useImport();

  const [phase, setPhase] = useState<Phase>('idle');
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const pickAndScan = useCallback(async () => {
    setError(null);
    try {
      const folder = await pick();
      if (!folder) return;
      setPhase('scanning');
      const result = await scan(folder);
      if (!result || result.candidates.length === 0) {
        setScanResult(result);
        setPhase('review');
        return;
      }
      setScanResult(result);
      setRows(
        result.candidates.map((c, index) => ({
          index,
          selected: true,
          title: c.suggestedTitle,
        }))
      );
      setPhase('review');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setPhase('idle');
      resetScan();
    }
  }, [pick, scan, resetScan]);

  const toggle = (index: number): void => {
    setRows(prev => prev.map(r => (r.index === index ? { ...r, selected: !r.selected } : r)));
  };

  const rename = (index: number, title: string): void => {
    setRows(prev => prev.map(r => (r.index === index ? { ...r, title } : r)));
  };

  const commitSelection = useCallback(async () => {
    if (!scanResult) return;
    const selected: ScanCandidateSeries[] = rows
      .filter(r => r.selected)
      .map(r => ({
        ...scanResult.candidates[r.index],
        suggestedTitle: r.title.trim() || scanResult.candidates[r.index].suggestedTitle,
      }));

    if (selected.length === 0) {
      pushToast({
        variant: 'error',
        title: t('onboarding.shelf.toast.empty.title'),
        body: t('onboarding.shelf.toast.empty.body'),
      });
      return;
    }

    setPhase('importing');
    setError(null);
    try {
      const result = await commit(scanResult.rootPath, selected);
      setPhase('done');
      pushToast({
        variant: 'success',
        title: t('onboarding.shelf.toast.done.title'),
        body: t('onboarding.shelf.toast.done.body', {
          added: result.createdSeriesIds.length,
          skipped: result.skipped,
        }),
      });
      navigate('/');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setPhase('review');
    }
  }, [rows, scanResult, commit, pushToast, navigate, t]);

  const progressRatio = useMemo(() => {
    if (!progress || progress.total === 0) return 0;
    return Math.min(1, progress.current / progress.total);
  }, [progress]);

  const selectedCount = rows.filter(r => r.selected).length;

  return (
    <>
      <BackButton className="mb-4" />
      <PageHeader
        eyebrow={t('libraryImport.eyebrow')}
        kanji="取込"
        title={t('libraryImport.title')}
        subtitle={t('libraryImport.subtitle')}
      />

      {phase === 'idle' && (
        <div className="flex flex-col gap-8">
          <EmptyState
            glyph="取"
            title={t('libraryImport.pick.title')}
            body={t('libraryImport.pick.body')}
            action={
              <button
                type="button"
                onClick={pickAndScan}
                className="inline-flex h-9 items-center rounded-[2px] border border-[var(--color-accent)] bg-[var(--color-accent)] px-4 font-mono text-[11px] tracking-[0.22em] text-[var(--color-ink)] uppercase transition-colors hover:bg-transparent hover:text-[var(--color-accent)]"
              >
                {t('libraryImport.action.choose')}
              </button>
            }
            hint={t('libraryImport.pick.hint')}
          />
          {error && (
            <div className="animate-fade-up flex flex-col items-start gap-2 border-l-2 border-[var(--color-accent)] py-2 pl-5">
              <span className="font-mono text-[10px] tracking-[0.24em] text-[var(--color-accent)] uppercase">
                {t('common.failed')}
              </span>
              <p className="max-w-[56ch] text-[14px] text-foreground">{error}</p>
            </div>
          )}
        </div>
      )}

      {phase === 'scanning' && (
        <div className="animate-fade-up flex flex-col gap-6 py-10">
          <div className="flex items-center gap-3">
            <span className="font-mono text-[10px] tracking-[0.26em] text-[var(--color-accent)] uppercase">
              {progress?.phase === 'reading-archives'
                ? t('onboarding.shelf.scan.readingArchives')
                : t('onboarding.shelf.scan.scanning')}
            </span>
            <span className="block h-px flex-1 bg-[var(--color-rule)]" />
            <span className="font-mono text-[10px] tracking-[0.22em] text-[var(--color-bone-faint)] uppercase">
              {progress?.total ? `${progress.current} / ${progress.total}` : '—'}
            </span>
          </div>
          <div className="relative h-[2px] w-full overflow-hidden bg-[var(--color-rule)]">
            <div
              className="absolute inset-y-0 left-0 bg-[var(--color-accent)] transition-[width] duration-200"
              style={{ width: `${progressRatio * 100}%` }}
            />
          </div>
          {progress?.currentPath && (
            <p className="truncate font-mono text-[11px] text-[var(--color-bone-faint)]">
              {progress.currentPath}
            </p>
          )}
        </div>
      )}

      {phase === 'review' && scanResult && (
        <div className="animate-fade-up flex flex-col gap-8">
          {rows.length === 0 ? (
            <EmptyState
              glyph="空"
              title={t('libraryImport.empty.title')}
              body={t('libraryImport.empty.body')}
              action={
                <button
                  type="button"
                  onClick={pickAndScan}
                  className="inline-flex h-9 items-center rounded-[2px] border border-border px-4 font-mono text-[11px] tracking-[0.22em] text-foreground uppercase transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
                >
                  {t('libraryImport.empty.action')}
                </button>
              }
            />
          ) : (
            <>
              <div className="flex items-baseline justify-between border-b border-[var(--color-rule)] pb-3">
                <span className="font-mono text-[10px] tracking-[0.26em] text-[var(--color-bone-faint)] uppercase">
                  {t('onboarding.shelf.review.detected', { count: rows.length })}
                </span>
                <span className="font-mono text-[10px] tracking-[0.22em] text-foreground uppercase">
                  {t('onboarding.shelf.review.selected', { count: selectedCount })}
                </span>
              </div>
              <ul className="flex flex-col divide-y divide-[var(--color-rule)]">
                {rows.map(row => {
                  const candidate = scanResult.candidates[row.index];
                  return (
                    <li key={row.index} className="flex items-center gap-5 py-4">
                      <input
                        type="checkbox"
                        checked={row.selected}
                        onChange={() => toggle(row.index)}
                        className="h-4 w-4 shrink-0 accent-[var(--color-accent)]"
                        aria-label={`Include ${row.title}`}
                      />
                      <input
                        type="text"
                        value={row.title}
                        onChange={e => rename(row.index, e.target.value)}
                        className="font-display min-w-0 flex-1 border-b border-transparent bg-transparent pb-1 text-[17px] leading-tight font-[350] tracking-[-0.015em] text-foreground outline-none transition-colors focus:border-[var(--color-accent)]"
                      />
                      <span className="font-mono text-[10.5px] tracking-[0.22em] text-[var(--color-bone-faint)] uppercase">
                        {candidate.chapters.length} ch
                      </span>
                    </li>
                  );
                })}
              </ul>
              <div className="flex items-center justify-between gap-4 border-t border-[var(--color-rule)] pt-6">
                <button
                  type="button"
                  onClick={pickAndScan}
                  className="font-mono text-[11px] tracking-[0.22em] text-[var(--color-bone-muted)] underline-offset-4 uppercase hover:text-foreground hover:underline"
                >
                  {t('onboarding.shelf.action.pickAnother')}
                </button>
                <button
                  type="button"
                  disabled={importing || selectedCount === 0}
                  onClick={commitSelection}
                  className="inline-flex h-9 items-center rounded-[2px] border border-[var(--color-accent)] bg-[var(--color-accent)] px-4 font-mono text-[11px] tracking-[0.22em] text-[var(--color-ink)] uppercase transition-colors hover:bg-transparent hover:text-[var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {importing
                    ? t('onboarding.shelf.action.importing')
                    : t('onboarding.shelf.action.import', { count: selectedCount })}
                </button>
              </div>
              {error && <p className="text-[13px] text-[var(--color-accent)]">{error}</p>}
            </>
          )}
        </div>
      )}
    </>
  );
}
