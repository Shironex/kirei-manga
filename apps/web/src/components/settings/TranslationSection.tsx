import { useCallback, useEffect, useState } from 'react';
import { Download, Loader2, RefreshCw } from 'lucide-react';
import {
  TranslationEvents,
  type TranslationProviderStatus,
  type TranslationProviderStatusResponse,
  type TranslationSettings,
} from '@kireimanga/shared';
import { emitWithResponse } from '@/lib/socket';
import { useSettingsStore } from '@/stores/settings-store';
import { useSocketStore } from '@/stores/socket-store';
import { useT } from '@/hooks/useT';
import { useToast } from '@/hooks/useToast';
import { SettingRow, SettingsSection } from './SettingsSection';
import {
  OpacitySlider,
  PasswordInput,
  PROVIDER_OPTIONS,
  ProviderSelect,
  TextInput,
  ToggleSwitch,
  type DisplayProviderId,
} from './translation-form-primitives';

type OcrSidecarState = TranslationProviderStatusResponse['pipeline']['ocrSidecar']['state'];

interface ProviderStatusMap {
  deepl?: TranslationProviderStatus;
  google?: TranslationProviderStatus;
  ollama?: TranslationProviderStatus;
}

/**
 * Settings panel for the translation pipeline. Exposes the global toggle, the
 * default provider + target language, overlay rendering knobs, per-provider
 * credentials, and a live status snapshot of every backend (translation
 * providers + bubble detector + OCR sidecar) sourced from the desktop's
 * `translation:provider-status` channel.
 */
export function TranslationSection() {
  const t = useT();
  const toast = useToast();
  const translation = useSettingsStore(s => s.settings?.translation);
  const socketStatus = useSocketStore(s => s.status);

  const [statusLoading, setStatusLoading] = useState(false);
  const [providerStatuses, setProviderStatuses] = useState<ProviderStatusMap>({});
  const [pipeline, setPipeline] = useState<TranslationProviderStatusResponse['pipeline'] | null>(
    null
  );
  const [statusFetched, setStatusFetched] = useState(false);

  const fetchStatus = useCallback(async () => {
    if (socketStatus !== 'connected') return;
    setStatusLoading(true);
    try {
      const response = await emitWithResponse<
        Record<string, never>,
        TranslationProviderStatusResponse
      >(TranslationEvents.PROVIDER_STATUS, {});
      if (response.error) {
        toast.error(response.error, { title: t('settings.translation.status.toast.title') });
        return;
      }
      const next: ProviderStatusMap = {};
      for (const p of response.providers) {
        if (p.id === 'deepl' || p.id === 'google' || p.id === 'ollama') {
          next[p.id] = p;
        }
      }
      setProviderStatuses(next);
      setPipeline(response.pipeline);
      setStatusFetched(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err), {
        title: t('settings.translation.status.toast.title'),
      });
    } finally {
      setStatusLoading(false);
    }
  }, [socketStatus, toast, t]);

  // First mount: pull a snapshot so the pills aren't gray indefinitely. Skip
  // if the socket is mid-reconnect — the user can hit Test once it lands.
  useEffect(() => {
    if (socketStatus === 'connected') void fetchStatus();
  }, [socketStatus, fetchStatus]);

  if (!translation) return null;

  const enabled = translation.enabled;

  const patch = (partial: Partial<TranslationSettings>) => {
    void useSettingsStore.getState().set({ translation: partial });
  };

  const patchKey = (partial: Partial<TranslationSettings['providerKeys']>) => {
    void useSettingsStore.getState().set({ translation: { providerKeys: partial } });
  };

  return (
    <SettingsSection
      kanji="訳"
      eyebrow={t('settings.section.translation')}
      title={t('settings.translation.title')}
      description={t('settings.translation.description')}
    >
      <SettingRow
        label={t('settings.translation.enabled.label')}
        hint={t('settings.translation.enabled.hint')}
      >
        <ToggleSwitch
          checked={enabled}
          onChange={value => patch({ enabled: value })}
          ariaLabel={t('settings.translation.enabled.label')}
        />
      </SettingRow>

      <DisabledFieldset disabled={!enabled}>
        <SettingRow
          label={t('settings.translation.autoTranslate.label')}
          hint={t('settings.translation.autoTranslate.hint')}
        >
          <ToggleSwitch
            checked={translation.autoTranslate}
            onChange={value => patch({ autoTranslate: value })}
            ariaLabel={t('settings.translation.autoTranslate.label')}
            disabled={!enabled}
          />
        </SettingRow>

        <SettingRow
          label={t('settings.translation.defaultProvider.label')}
          hint={t('settings.translation.defaultProvider.hint')}
        >
          <ProviderSelect
            value={translation.defaultProvider}
            disabled={!enabled}
            ariaLabel={t('settings.translation.defaultProvider.label')}
            onChange={value => patch({ defaultProvider: value })}
            t={t}
          />
        </SettingRow>

        <SettingRow
          label={t('settings.translation.targetLang.label')}
          hint={t('settings.translation.targetLang.hint')}
        >
          <TextInput
            value={translation.targetLang}
            onChange={value => patch({ targetLang: value })}
            placeholder="en"
            disabled={!enabled}
            ariaLabel={t('settings.translation.targetLang.label')}
            data-testid="translation-target-lang"
            widthClass="w-24"
          />
        </SettingRow>

        <SettingRow
          label={t('settings.translation.overlayFont.label')}
          hint={t('settings.translation.overlayFont.hint')}
        >
          <TextInput
            value={translation.overlayFont}
            onChange={value => patch({ overlayFont: value })}
            placeholder="Fraunces"
            disabled={!enabled}
            ariaLabel={t('settings.translation.overlayFont.label')}
            data-testid="translation-overlay-font"
            widthClass="w-44"
          />
        </SettingRow>

        <SettingRow
          label={t('settings.translation.overlayOpacity.label')}
          hint={t('settings.translation.overlayOpacity.hint')}
        >
          <OpacitySlider
            value={translation.overlayOpacity}
            disabled={!enabled}
            onChange={value => patch({ overlayOpacity: value })}
            ariaLabel={t('settings.translation.overlayOpacity.label')}
          />
        </SettingRow>

        <div className="border-t border-border pt-6">
          <SectionSubheader
            eyebrow={t('settings.translation.keys.eyebrow')}
            description={t('settings.translation.keys.description')}
          />
          <div className="flex flex-col gap-4">
            <SettingRow label={t('settings.translation.keys.deepl.label')}>
              <PasswordInput
                value={translation.providerKeys.deepl ?? ''}
                onChange={value => patchKey({ deepl: value || undefined })}
                disabled={!enabled}
                ariaLabel={t('settings.translation.keys.deepl.label')}
                placeholder={t('settings.translation.keys.placeholder')}
                data-testid="translation-key-deepl"
              />
            </SettingRow>
            <SettingRow label={t('settings.translation.keys.google.label')}>
              <PasswordInput
                value={translation.providerKeys.google ?? ''}
                onChange={value => patchKey({ google: value || undefined })}
                disabled={!enabled}
                ariaLabel={t('settings.translation.keys.google.label')}
                placeholder={t('settings.translation.keys.placeholder')}
                data-testid="translation-key-google"
              />
            </SettingRow>
            <SettingRow
              label={t('settings.translation.keys.ollama.label')}
              hint={t('settings.translation.keys.ollama.hint')}
            >
              <TextInput
                value={translation.providerKeys.ollamaEndpoint ?? ''}
                onChange={value => patchKey({ ollamaEndpoint: value || undefined })}
                disabled={!enabled}
                ariaLabel={t('settings.translation.keys.ollama.label')}
                placeholder="http://localhost:11434"
                data-testid="translation-key-ollama"
                widthClass="w-72"
              />
            </SettingRow>
          </div>
        </div>

        <div className="border-t border-border pt-6">
          <div className="mb-4 flex items-start justify-between gap-4">
            <SectionSubheader
              eyebrow={t('settings.translation.status.eyebrow')}
              description={t('settings.translation.status.description')}
            />
            <button
              type="button"
              onClick={() => void fetchStatus()}
              disabled={!enabled || statusLoading || socketStatus !== 'connected'}
              data-testid="translation-status-test"
              className="inline-flex items-center gap-2 rounded-sm border border-border bg-[var(--color-ink-sunken)] px-3 py-1.5 font-mono text-[11px] tracking-[0.18em] uppercase text-[var(--color-bone-muted)] transition-colors enabled:hover:border-[var(--color-accent)] enabled:hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            >
              {statusLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              {t('settings.translation.status.test')}
            </button>
          </div>

          <div className="flex flex-col">
            {PROVIDER_OPTIONS.map(opt => (
              <ProviderStatusRow
                key={opt.value}
                providerId={opt.value}
                label={t(opt.labelKey)}
                status={providerStatuses[opt.value]}
                fetched={statusFetched}
                t={t}
              />
            ))}
          </div>

          <div className="mt-6 border-t border-border pt-6">
            <SectionSubheader
              eyebrow={t('settings.translation.pipeline.eyebrow')}
              description={t('settings.translation.pipeline.description')}
            />
            <PipelineStatusRows pipeline={pipeline} fetched={statusFetched} t={t} />
          </div>
        </div>
      </DisabledFieldset>
    </SettingsSection>
  );
}

function SectionSubheader({ eyebrow, description }: { eyebrow: string; description: string }) {
  return (
    <div className="mb-3 flex flex-col gap-1">
      <span className="font-mono text-[10px] tracking-[0.24em] text-[var(--color-bone-faint)] uppercase">
        {eyebrow}
      </span>
      <p className="text-[12.5px] leading-relaxed text-muted-foreground">{description}</p>
    </div>
  );
}

/**
 * Visually mutes its children when `disabled` is true. Form controls inside
 * pass their own `disabled` prop — this wrapper only handles the visual cue
 * and tab-skip behaviour for the rest of the section.
 */
function DisabledFieldset({
  disabled,
  children,
}: {
  disabled: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      data-testid="translation-fieldset"
      data-disabled={disabled ? 'true' : 'false'}
      aria-disabled={disabled}
      className={[
        'flex flex-col gap-6 transition-opacity',
        disabled ? 'pointer-events-none opacity-50' : '',
      ].join(' ')}
    >
      {children}
    </div>
  );
}

function StatusPill({ variant, label }: { variant: 'ok' | 'bad' | 'unknown'; label: string }) {
  const palette = {
    ok: 'border-[color:rgb(80_140_90/0.6)] bg-[color:rgb(80_140_90/0.18)] text-[color:rgb(170_220_180/1)]',
    bad: 'border-[color:rgb(180_70_70/0.6)] bg-[color:rgb(180_70_70/0.18)] text-[color:rgb(240_180_180/1)]',
    unknown: 'border-border bg-[var(--color-ink-sunken)] text-[var(--color-bone-faint)]',
  }[variant];
  return (
    <span
      data-testid={`status-pill-${variant}`}
      className={[
        'inline-flex h-6 items-center gap-1.5 rounded-full border px-2.5 font-mono text-[10px] tracking-[0.16em] uppercase',
        palette,
      ].join(' ')}
    >
      <span
        aria-hidden
        className={[
          'h-1.5 w-1.5 rounded-full',
          variant === 'ok'
            ? 'bg-[color:rgb(140_220_160/1)]'
            : variant === 'bad'
              ? 'bg-[color:rgb(240_120_120/1)]'
              : 'bg-[var(--color-bone-faint)]',
        ].join(' ')}
      />
      {label}
    </span>
  );
}

function ProviderStatusRow({
  providerId,
  label,
  status,
  fetched,
  t,
}: {
  providerId: DisplayProviderId;
  label: string;
  status: TranslationProviderStatus | undefined;
  fetched: boolean;
  t: ReturnType<typeof useT>;
}) {
  let variant: 'ok' | 'bad' | 'unknown';
  let pillLabel: string;
  let reason: string | null = null;

  if (!status) {
    variant = 'unknown';
    pillLabel = t(
      fetched ? 'settings.translation.status.unknown' : 'settings.translation.status.notFetched'
    );
  } else if (status.ok) {
    variant = 'ok';
    pillLabel = t('settings.translation.status.ok');
  } else {
    variant = 'bad';
    pillLabel = t('settings.translation.status.bad');
    reason = status.reason ?? null;
  }

  return (
    <div
      className="grid grid-cols-1 items-baseline gap-1 border-b border-border py-3 last:border-b-0 md:grid-cols-[1fr_auto] md:gap-6"
      data-testid={`provider-status-row-${providerId}`}
    >
      <div className="flex flex-col gap-0.5">
        <span className="text-[13px] text-foreground">{label}</span>
        {reason && (
          <span
            className="text-[11px] text-[var(--color-bone-faint)]"
            data-testid={`provider-status-reason-${providerId}`}
          >
            {reason}
          </span>
        )}
      </div>
      <StatusPill variant={variant} label={pillLabel} />
    </div>
  );
}

function PipelineStatusRows({
  pipeline,
  fetched,
  t,
}: {
  pipeline: TranslationProviderStatusResponse['pipeline'] | null;
  fetched: boolean;
  t: ReturnType<typeof useT>;
}) {
  return (
    <div className="flex flex-col">
      <PipelineRowBubbleDetector pipeline={pipeline} fetched={fetched} t={t} />
      <PipelineRowOcrSidecar pipeline={pipeline} fetched={fetched} t={t} />
    </div>
  );
}

function PipelineRowBubbleDetector({
  pipeline,
  fetched,
  t,
}: {
  pipeline: TranslationProviderStatusResponse['pipeline'] | null;
  fetched: boolean;
  t: ReturnType<typeof useT>;
}) {
  const detector = pipeline?.bubbleDetector;
  let variant: 'ok' | 'bad' | 'unknown';
  let label: string;
  let reason: string | null = null;
  if (!detector) {
    variant = 'unknown';
    label = t(
      fetched ? 'settings.translation.status.unknown' : 'settings.translation.status.notFetched'
    );
  } else if (detector.healthy) {
    variant = 'ok';
    label = t('settings.translation.pipeline.bubbleDetector.healthy');
  } else {
    variant = 'bad';
    label = t('settings.translation.pipeline.bubbleDetector.unhealthy');
    reason = detector.reason ?? null;
  }

  return (
    <div
      className="grid grid-cols-1 items-baseline gap-1 border-b border-border py-3 last:border-b-0 md:grid-cols-[1fr_auto] md:gap-6"
      data-testid="pipeline-status-bubble-detector"
    >
      <div className="flex flex-col gap-0.5">
        <span className="text-[13px] text-foreground">
          {t('settings.translation.pipeline.bubbleDetector.label')}
        </span>
        {reason && <span className="text-[11px] text-[var(--color-bone-faint)]">{reason}</span>}
      </div>
      <StatusPill variant={variant} label={label} />
    </div>
  );
}

function ocrStateLabelKey(state: OcrSidecarState): string {
  switch (state) {
    case 'not-downloaded':
      return 'settings.translation.pipeline.ocr.state.notDownloaded';
    case 'downloading':
      return 'settings.translation.pipeline.ocr.state.downloading';
    case 'starting':
      return 'settings.translation.pipeline.ocr.state.starting';
    case 'ready':
      return 'settings.translation.pipeline.ocr.state.ready';
    case 'crashed':
      return 'settings.translation.pipeline.ocr.state.crashed';
    case 'unhealthy':
      return 'settings.translation.pipeline.ocr.state.unhealthy';
    default:
      return 'settings.translation.status.unknown';
  }
}

function ocrPillVariant(state: OcrSidecarState): 'ok' | 'bad' | 'unknown' {
  switch (state) {
    case 'ready':
      return 'ok';
    case 'crashed':
    case 'unhealthy':
      return 'bad';
    default:
      return 'unknown';
  }
}

function PipelineRowOcrSidecar({
  pipeline,
  fetched,
  t,
}: {
  pipeline: TranslationProviderStatusResponse['pipeline'] | null;
  fetched: boolean;
  t: ReturnType<typeof useT>;
}) {
  const sidecar = pipeline?.ocrSidecar;
  const stateLabel = sidecar
    ? t(ocrStateLabelKey(sidecar.state))
    : t(fetched ? 'settings.translation.status.unknown' : 'settings.translation.status.notFetched');
  const variant = sidecar ? ocrPillVariant(sidecar.state) : 'unknown';
  const reason = sidecar?.reason ?? null;
  const showProgress = sidecar?.state === 'downloading' && sidecar.downloadProgress;
  const modelLoaded = sidecar?.state === 'ready' && sidecar.modelLoaded === true;

  // No `translation:ensure-ready` channel exists yet (v0.3 deferred). When the
  // sidecar reports `not-downloaded`, render a passive Download button that
  // surfaces the gap to the user via a toast — replace with a real handler
  // once Slice D ships the channel.
  const showDownloadCta = sidecar?.state === 'not-downloaded';

  return (
    <div
      className="grid grid-cols-1 items-baseline gap-3 border-b border-border py-3 last:border-b-0 md:grid-cols-[1fr_auto] md:gap-6"
      data-testid="pipeline-status-ocr-sidecar"
    >
      <div className="flex flex-col gap-1">
        <span className="text-[13px] text-foreground">
          {t('settings.translation.pipeline.ocr.label')}
        </span>
        {reason && <span className="text-[11px] text-[var(--color-bone-faint)]">{reason}</span>}
        {modelLoaded && (
          <span className="font-mono text-[10px] tracking-[0.18em] text-[var(--color-bone-faint)] uppercase">
            {t('settings.translation.pipeline.ocr.modelLoaded')}
          </span>
        )}
        {showProgress && sidecar?.downloadProgress && (
          <OcrDownloadProgress
            bytes={sidecar.downloadProgress.bytes}
            total={sidecar.downloadProgress.total}
            t={t}
          />
        )}
      </div>
      <div className="flex items-center gap-2">
        {showDownloadCta && <SidecarDownloadButton t={t} />}
        <StatusPill variant={variant} label={stateLabel} />
      </div>
    </div>
  );
}

function OcrDownloadProgress({
  bytes,
  total,
  t,
}: {
  bytes: number;
  total: number;
  t: ReturnType<typeof useT>;
}) {
  const percent = total > 0 ? Math.min(100, Math.round((bytes / total) * 100)) : 0;
  return (
    <div className="flex flex-col gap-1">
      <div
        role="progressbar"
        aria-label={t('settings.translation.pipeline.ocr.progressAria')}
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        className="relative h-[2px] w-40 overflow-hidden bg-[var(--color-rule)]"
      >
        <div
          className="absolute top-0 left-0 h-full bg-[var(--color-accent)] transition-[width] duration-300 ease-out"
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="font-mono text-[10px] tabular-nums text-[var(--color-bone-faint)]">
        {percent}%
      </span>
    </div>
  );
}

function SidecarDownloadButton({ t }: { t: ReturnType<typeof useT> }) {
  const toast = useToast();
  // No IPC channel exists yet — surface the limitation rather than wire a
  // half-broken button. Replace the toast with `emitWithResponse(...ENSURE_READY)`
  // once the channel lands.
  const onClick = () => {
    toast.error(t('settings.translation.pipeline.ocr.download.unavailable'), {
      title: t('settings.translation.pipeline.ocr.download.unavailableTitle'),
    });
  };
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid="sidecar-download-button"
      className="inline-flex items-center gap-2 rounded-sm border border-border bg-[var(--color-ink-sunken)] px-3 py-1.5 font-mono text-[11px] tracking-[0.18em] uppercase text-[var(--color-bone-muted)] transition-colors hover:border-[var(--color-accent)] hover:text-foreground"
    >
      <Download className="h-3.5 w-3.5" />
      {t('settings.translation.pipeline.ocr.download.label')}
    </button>
  );
}
