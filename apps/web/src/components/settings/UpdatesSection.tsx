import { useEffect, useState } from 'react';
import { Download, ExternalLink, FolderOpen, Loader2, RefreshCw, Sparkles } from 'lucide-react';
import {
  GITHUB_RELEASES_URL,
  UPDATE_ERROR_RELEASE_PENDING,
  type UpdateChannel,
} from '@kireimanga/shared';
import { useT } from '@/hooks/useT';
import { useToast } from '@/hooks/useToast';
import { useUpdateStore } from '@/stores/update-store';
import { Segmented, type SegmentedOption } from './Segmented';
import { SettingRow, SettingsSection } from './SettingsSection';

export function UpdatesSection() {
  const t = useT();
  const toast = useToast();
  const status = useUpdateStore(s => s.status);
  const updateInfo = useUpdateStore(s => s.updateInfo);
  const progress = useUpdateStore(s => s.progress);
  const error = useUpdateStore(s => s.error);
  const channel = useUpdateStore(s => s.channel);
  const isChannelSwitching = useUpdateStore(s => s.isChannelSwitching);
  const checkForUpdates = useUpdateStore(s => s.checkForUpdates);
  const startDownload = useUpdateStore(s => s.startDownload);
  const installNow = useUpdateStore(s => s.installNow);
  const setChannel = useUpdateStore(s => s.setChannel);

  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    const api = window.electronAPI?.app;
    if (!api) return;
    let cancelled = false;
    api
      .getVersion()
      .then(v => {
        if (!cancelled) setVersion(v);
      })
      .catch(() => {
        if (!cancelled) setVersion(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const isMac = typeof window !== 'undefined' && window.electronAPI?.platform === 'darwin';

  const channelOptions: ReadonlyArray<SegmentedOption<UpdateChannel>> = [
    { value: 'stable', label: t('settings.updates.channel.stable') },
    { value: 'beta', label: t('settings.updates.channel.beta') },
  ];

  const openReleases = () => {
    window.open(GITHUB_RELEASES_URL, '_blank', 'noopener,noreferrer');
  };

  const openLogsFolder = async () => {
    try {
      await window.electronAPI?.app.openLogsFolder();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err), {
        title: t('settings.updates.logs.error'),
      });
    }
  };

  const statusLine = (() => {
    switch (status) {
      case 'idle':
        return t('settings.updates.status.idle');
      case 'checking':
        return t('settings.updates.status.checking');
      case 'available':
        return t('settings.updates.status.available', {
          version: updateInfo?.version ?? '',
        });
      case 'downloading':
        return t('settings.updates.status.downloading', {
          percent: progress ? Math.round(progress.percent) : 0,
        });
      case 'ready':
        return t('settings.updates.status.ready');
      case 'error':
        if (error === UPDATE_ERROR_RELEASE_PENDING) {
          return t('settings.updates.status.pending');
        }
        return t('settings.updates.status.error', {
          message: error ?? t('settings.updates.error.unknown'),
        });
      default:
        return '';
    }
  })();

  const statusIsError = status === 'error' && error !== UPDATE_ERROR_RELEASE_PENDING;
  const checking = status === 'checking';
  const downloading = status === 'downloading';

  return (
    <SettingsSection
      kanji="刷"
      eyebrow={t('settings.section.updates')}
      title={t('settings.updates.title')}
      description={t('settings.updates.description')}
    >
      <SettingRow label={t('settings.updates.version.label')}>
        <span className="font-mono text-[12px] tracking-[0.08em] tabular-nums text-foreground">
          {version ?? '—'}
        </span>
      </SettingRow>

      <SettingRow label={t('settings.updates.logs.label')} hint={t('settings.updates.logs.hint')}>
        <button
          type="button"
          onClick={openLogsFolder}
          className="inline-flex items-center gap-2 rounded-sm border border-border bg-[var(--color-ink-sunken)] px-3 py-1.5 font-mono text-[11px] tracking-[0.18em] uppercase text-[var(--color-bone-muted)] transition-colors hover:border-[var(--color-accent)] hover:text-foreground"
        >
          <FolderOpen className="h-3.5 w-3.5" />
          {t('settings.updates.logs.action')}
        </button>
      </SettingRow>

      {!isMac && (
        <SettingRow
          label={t('settings.updates.channel.label')}
          hint={t('settings.updates.channel.hint')}
        >
          <Segmented<UpdateChannel>
            ariaLabel={t('settings.updates.channel.label')}
            value={channel}
            options={channelOptions}
            onChange={value => {
              if (isChannelSwitching || value === channel) return;
              setChannel(value);
            }}
          />
        </SettingRow>
      )}

      {isMac ? (
        <div className="flex flex-col gap-3">
          <p className="text-[12.5px] leading-relaxed text-muted-foreground">
            {t('settings.updates.mac.body')}
          </p>
          <button
            type="button"
            onClick={openReleases}
            className="inline-flex w-fit items-center gap-2 rounded-sm border border-border bg-[var(--color-ink-sunken)] px-3 py-1.5 font-mono text-[11px] tracking-[0.18em] uppercase text-[var(--color-bone-muted)] transition-colors hover:border-[var(--color-accent)] hover:text-foreground"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            {t('settings.updates.action.releases')}
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={checkForUpdates}
              disabled={checking || downloading}
              className="inline-flex items-center gap-2 rounded-sm border border-border bg-[var(--color-ink-sunken)] px-3 py-1.5 font-mono text-[11px] tracking-[0.18em] uppercase text-[var(--color-bone-muted)] transition-colors enabled:hover:border-[var(--color-accent)] enabled:hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            >
              {checking ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              {checking
                ? t('settings.updates.action.checking')
                : t('settings.updates.action.check')}
            </button>

            {status === 'available' && (
              <button
                type="button"
                onClick={startDownload}
                className="inline-flex items-center gap-2 rounded-sm border border-[var(--color-accent)] bg-[var(--color-ink-sunken)] px-3 py-1.5 font-mono text-[11px] tracking-[0.18em] uppercase text-foreground transition-colors hover:bg-[var(--color-accent)] hover:text-[var(--color-ink)]"
              >
                <Download className="h-3.5 w-3.5" />
                {t('settings.updates.action.download')}
              </button>
            )}

            {status === 'ready' && (
              <button
                type="button"
                onClick={installNow}
                className="inline-flex items-center gap-2 rounded-sm border border-[var(--color-accent)] bg-[var(--color-accent)] px-3 py-1.5 font-mono text-[11px] tracking-[0.18em] uppercase text-[var(--color-ink)] transition-opacity hover:opacity-90"
              >
                <Sparkles className="h-3.5 w-3.5" />
                {t('settings.updates.action.install')}
              </button>
            )}
          </div>

          <p
            className={[
              'text-[12px]',
              statusIsError ? 'text-[var(--color-accent)]' : 'text-[var(--color-bone-faint)]',
            ].join(' ')}
          >
            {statusLine}
          </p>

          {downloading && progress && (
            <div
              role="progressbar"
              aria-label={t('settings.updates.progress.aria')}
              aria-valuenow={Math.round(progress.percent)}
              aria-valuemin={0}
              aria-valuemax={100}
              className="relative h-[2px] w-full overflow-hidden bg-[var(--color-rule)]"
            >
              <div
                className="absolute top-0 left-0 h-full bg-[var(--color-accent)] transition-[width] duration-300 ease-out"
                style={{ width: `${progress.percent}%` }}
              />
            </div>
          )}
        </div>
      )}
    </SettingsSection>
  );
}
