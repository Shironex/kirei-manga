import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, Trash2 } from 'lucide-react';
import {
  LibraryCacheEvents,
  type LibraryClearCacheResponse,
  type LibraryGetCacheSizeResponse,
  type LibrarySettings,
} from '@kireimanga/shared';
import { emitWithResponse } from '@/lib/socket';
import { useSettingsStore } from '@/stores/settings-store';
import { useToast } from '@/hooks/useToast';
import { useSocketStore } from '@/stores/socket-store';
import { SettingRow, SettingsSection } from './SettingsSection';

const LANGUAGE_OPTIONS: ReadonlyArray<{ code: string; label: string }> = [
  { code: 'en', label: 'English' },
  { code: 'ja', label: '日本語 (Japanese)' },
  { code: 'pl', label: 'Polski (Polish)' },
  { code: 'es', label: 'Español (Spanish)' },
  { code: 'es-la', label: 'Español (LATAM)' },
  { code: 'fr', label: 'Français (French)' },
  { code: 'de', label: 'Deutsch (German)' },
  { code: 'it', label: 'Italiano (Italian)' },
  { code: 'pt-br', label: 'Português (BR)' },
  { code: 'ru', label: 'Русский (Russian)' },
  { code: 'zh', label: '中文 (Chinese)' },
  { code: 'ko', label: '한국어 (Korean)' },
  { code: 'id', label: 'Bahasa Indonesia' },
  { code: 'vi', label: 'Tiếng Việt (Vietnamese)' },
];

/**
 * Format a byte count as a human-readable size. Uses base-1024 to match how
 * users think about disk space and rounds to one decimal once we cross MB.
 */
function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / Math.pow(1024, i);
  const decimals = i >= 2 ? 1 : 0;
  return `${value.toFixed(decimals)} ${units[i]}`;
}

export function LibrarySection() {
  const library = useSettingsStore(s => s.settings?.library);
  const status = useSocketStore(s => s.status);
  const toast = useToast();

  const [cacheBytes, setCacheBytes] = useState<number | null>(null);
  const [cacheLoading, setCacheLoading] = useState(false);
  const [clearing, setClearing] = useState(false);

  const fetchCacheSize = useCallback(async () => {
    if (status !== 'connected') return;
    setCacheLoading(true);
    try {
      const res = await emitWithResponse<Record<string, never>, LibraryGetCacheSizeResponse>(
        LibraryCacheEvents.GET_SIZE,
        {}
      );
      if (res.error) {
        toast.error(res.error, { title: 'Cache size' });
        return;
      }
      setCacheBytes(res.bytes);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err), { title: 'Cache size' });
    } finally {
      setCacheLoading(false);
    }
  }, [status, toast]);

  useEffect(() => {
    void fetchCacheSize();
  }, [fetchCacheSize]);

  // Re-fetch when the window regains focus so users see fresh numbers after
  // a download or external file changes.
  useEffect(() => {
    const onFocus = () => {
      void fetchCacheSize();
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [fetchCacheSize]);

  const onClearCache = useCallback(async () => {
    if (clearing) return;
    setClearing(true);
    try {
      const res = await emitWithResponse<Record<string, never>, LibraryClearCacheResponse>(
        LibraryCacheEvents.CLEAR,
        {}
      );
      if (res.error || !res.success) {
        toast.error(res.error ?? 'Cache clear failed', { title: 'Clear cache' });
        return;
      }
      toast.success(`Cleared ${formatBytes(res.bytesFreed)} of cached pages.`, {
        title: 'Cache cleared',
      });
      setCacheBytes(0);
      // Re-fetch in the background to confirm — covers the empty-dir edge.
      void fetchCacheSize();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err), { title: 'Clear cache' });
    } finally {
      setClearing(false);
    }
  }, [clearing, toast, fetchCacheSize]);

  if (!library) return null;

  const patch = (partial: Partial<LibrarySettings>) => {
    void useSettingsStore.getState().set({ library: partial });
  };

  return (
    <SettingsSection
      kanji="架"
      eyebrow="Library"
      title="Languages & cache"
      description="The chapter language seeded for new reads, and the on-disk store of cached page images."
    >
      <SettingRow
        label="Default chapter language"
        hint="Used by the series detail page when picking the initial chapter feed."
      >
        <LanguageSelect
          value={library.defaultChapterLanguage}
          onChange={lang => patch({ defaultChapterLanguage: lang })}
        />
      </SettingRow>

      <SettingRow
        label="Page cache"
        hint={
          cacheLoading && cacheBytes === null
            ? 'Calculating size…'
            : `On-disk size: ${cacheBytes === null ? '—' : formatBytes(cacheBytes)}.`
        }
      >
        <button
          type="button"
          onClick={onClearCache}
          disabled={clearing || cacheBytes === 0}
          className="inline-flex items-center gap-2 rounded-sm border border-border bg-[var(--color-ink-sunken)] px-3 py-1.5 font-mono text-[11px] tracking-[0.18em] uppercase text-[var(--color-bone-muted)] transition-colors enabled:hover:border-[var(--color-accent)] enabled:hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Trash2 className="h-3.5 w-3.5" />
          {clearing ? 'Clearing…' : 'Clear cache'}
        </button>
      </SettingRow>
    </SettingsSection>
  );
}

function LanguageSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const hasValue = LANGUAGE_OPTIONS.some(o => o.code === value);
  const opts = hasValue
    ? LANGUAGE_OPTIONS
    : [...LANGUAGE_OPTIONS, { code: value, label: value }];
  return (
    <div className="relative">
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="h-8 appearance-none rounded-sm border border-border bg-[var(--color-ink-sunken)] px-2.5 pr-7 font-mono text-[11px] tracking-[0.06em] text-foreground"
      >
        {opts.map(o => (
          <option key={o.code} value={o.code}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown
        className="pointer-events-none absolute top-1/2 right-2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-bone-faint)]"
        aria-hidden
      />
    </div>
  );
}
