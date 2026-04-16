import { useCallback, useMemo, useState } from 'react';
import { Check, FolderOpen } from 'lucide-react';
import type { ScanCandidateSeries, ScanResult } from '@kireimanga/shared';
import { useT } from '@/hooks/useT';
import { useFolderPicker, useImport, useScanRoot } from '@/hooks/useLocalImport';
import { useSettingsStore } from '@/stores/settings-store';
import { useOnboardingStore } from '@/stores/onboarding-store';
import { useToast } from '@/hooks/useToast';
import { OnboardingStepFrame } from '../OnboardingStepFrame';
import { StepFooter } from '../StepFooter';

type Phase = 'idle' | 'scanning' | 'review' | 'importing' | 'done';

interface ReviewRow {
  index: number;
  selected: boolean;
  title: string;
}

/**
 * Optional onboarding step. Mirrors the standalone `LibraryImportPage` flow
 * (idle → scanning → review → done) but inline inside the overlay so users
 * never leave onboarding to add their first folder. On a successful commit
 * we append the chosen root to `settings.library.localRoots` so future
 * launches can rescan without re-prompting.
 */
export function LocalShelfStep() {
  const t = useT();
  const toast = useToast();
  const { pick } = useFolderPicker();
  const { progress, scan, reset: resetScan } = useScanRoot();
  const { importing, commit } = useImport();
  const next = useOnboardingStore(s => s.next);

  const localRoots = useSettingsStore(s => s.settings?.library.localRoots ?? []);

  const [phase, setPhase] = useState<Phase>('idle');
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [importedCount, setImportedCount] = useState(0);

  const pickAndScan = useCallback(async () => {
    setError(null);
    try {
      const folder = await pick();
      if (!folder) return;
      setPhase('scanning');
      const result = await scan(folder);
      if (!result || result.candidates.length === 0) {
        setScanResult(result);
        setRows([]);
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
      toast.error(t('onboarding.shelf.toast.empty.body'), {
        title: t('onboarding.shelf.toast.empty.title'),
      });
      return;
    }

    setPhase('importing');
    setError(null);
    try {
      const result = await commit(scanResult.rootPath, selected);
      // Append the rootPath to persisted localRoots if it isn't there yet.
      const nextRoots = localRoots.includes(scanResult.rootPath)
        ? localRoots
        : [...localRoots, scanResult.rootPath];
      await useSettingsStore.getState().set({ library: { localRoots: nextRoots } });
      setImportedCount(result.createdSeriesIds.length);
      setPhase('done');
      toast.success(
        t('onboarding.shelf.toast.done.body', {
          added: result.createdSeriesIds.length,
          skipped: result.skipped,
        }),
        { title: t('onboarding.shelf.toast.done.title') }
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setPhase('review');
    }
  }, [rows, scanResult, commit, toast, t, localRoots]);

  const progressRatio = useMemo(() => {
    if (!progress || progress.total === 0) return 0;
    return Math.min(1, progress.current / progress.total);
  }, [progress]);

  const selectedCount = rows.filter(r => r.selected).length;

  return (
    <OnboardingStepFrame
      kanji="架"
      eyebrow={t('onboarding.shelf.eyebrow')}
      title={t('onboarding.shelf.title')}
      description={t('onboarding.shelf.description')}
      footer={<StepFooter nextLabel={t('onboarding.action.next')} onNext={next} />}
    >
      {phase === 'idle' && (
        <div className="flex flex-col gap-5">
          <button
            type="button"
            onClick={pickAndScan}
            className="inline-flex w-fit items-center gap-2 rounded-[2px] border border-[var(--color-accent)] px-4 py-2 font-mono text-[11px] tracking-[0.22em] text-foreground uppercase transition-colors hover:bg-[var(--color-accent)] hover:text-[var(--color-ink)]"
          >
            <FolderOpen className="h-3.5 w-3.5" />
            {t('onboarding.shelf.action.pick')}
          </button>
          <p className="text-[12.5px] text-[var(--color-bone-faint)]">
            {t('onboarding.shelf.hint')}
          </p>
          {error && (
            <p className="border-l-2 border-[var(--color-accent)] pl-4 text-[13px] text-foreground">
              {error}
            </p>
          )}
        </div>
      )}

      {phase === 'scanning' && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <span className="font-mono text-[10px] tracking-[0.26em] text-[var(--color-accent)] uppercase">
              {progress?.phase === 'reading-archives'
                ? t('onboarding.shelf.scan.readingArchives')
                : t('onboarding.shelf.scan.scanning')}
            </span>
            <span className="block h-px flex-1 bg-[var(--color-rule)]" />
            <span className="font-mono text-[10px] tracking-[0.22em] text-[var(--color-bone-faint)] tabular-nums uppercase">
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

      {phase === 'review' && scanResult && rows.length === 0 && (
        <div className="flex flex-col gap-4">
          <p className="text-[14px] text-foreground">{t('onboarding.shelf.review.empty')}</p>
          <button
            type="button"
            onClick={pickAndScan}
            className="inline-flex w-fit items-center gap-2 rounded-[2px] border border-border px-4 py-2 font-mono text-[11px] tracking-[0.22em] text-foreground uppercase transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
          >
            {t('onboarding.shelf.action.pickAnother')}
          </button>
        </div>
      )}

      {phase === 'review' && scanResult && rows.length > 0 && (
        <div className="flex flex-col gap-5">
          <div className="flex items-baseline justify-between border-b border-[var(--color-rule)] pb-2">
            <span className="font-mono text-[10px] tracking-[0.26em] text-[var(--color-bone-faint)] uppercase">
              {t('onboarding.shelf.review.detected', { count: rows.length })}
            </span>
            <span className="font-mono text-[10px] tracking-[0.22em] text-foreground tabular-nums uppercase">
              {t('onboarding.shelf.review.selected', { count: selectedCount })}
            </span>
          </div>
          <ul className="flex max-h-[260px] flex-col divide-y divide-[var(--color-rule)] overflow-y-auto pr-1">
            {rows.map(row => {
              const candidate = scanResult.candidates[row.index];
              return (
                <li key={row.index} className="flex items-center gap-4 py-3">
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
                    className="font-display min-w-0 flex-1 border-b border-transparent bg-transparent pb-1 text-[15px] leading-tight font-[350] tracking-[-0.012em] text-foreground outline-none transition-colors focus:border-[var(--color-accent)]"
                  />
                  <span className="font-mono text-[10px] tracking-[0.22em] text-[var(--color-bone-faint)] tabular-nums uppercase">
                    {candidate.chapters.length} ch
                  </span>
                </li>
              );
            })}
          </ul>
          <div className="flex items-center justify-between gap-4 pt-2">
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
              className="inline-flex h-9 items-center rounded-[2px] border border-[var(--color-accent)] bg-[var(--color-accent)] px-4 font-mono text-[11px] tracking-[0.22em] text-[var(--color-ink)] uppercase transition-colors enabled:hover:bg-transparent enabled:hover:text-[var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {importing
                ? t('onboarding.shelf.action.importing')
                : t('onboarding.shelf.action.import', { count: selectedCount })}
            </button>
          </div>
          {error && <p className="text-[13px] text-[var(--color-accent)]">{error}</p>}
        </div>
      )}

      {phase === 'done' && (
        <div className="flex flex-col gap-3">
          <span className="font-mono inline-flex items-center gap-2 self-start text-[10px] tracking-[0.26em] text-[var(--color-accent)] uppercase">
            <Check className="h-3.5 w-3.5" />
            {t('onboarding.shelf.done.eyebrow')}
          </span>
          <p className="text-[14px] text-foreground">
            {t('onboarding.shelf.done.body', { count: importedCount })}
          </p>
        </div>
      )}
    </OnboardingStepFrame>
  );
}
