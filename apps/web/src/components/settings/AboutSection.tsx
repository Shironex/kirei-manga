import { FolderOpen, Heart } from 'lucide-react';
import mascotWave from '@/assets/chibi_wave.png';
import { useAppVersion } from '@/hooks/useAppVersion';
import { useT } from '@/hooks/useT';
import { useToast } from '@/hooks/useToast';
import { SettingsSection } from './SettingsSection';

export function AboutSection() {
  const t = useT();
  const toast = useToast();
  const version = useAppVersion();

  const openLogsFolder = async () => {
    try {
      await window.electronAPI?.app.openLogsFolder();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err), {
        title: t('settings.about.logs.error'),
      });
    }
  };

  return (
    <SettingsSection
      kanji="綺"
      eyebrow={t('settings.section.about')}
      title={t('settings.about.title')}
      description={t('settings.about.description')}
    >
      <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:gap-6">
        <img
          src={mascotWave}
          alt=""
          aria-hidden
          className="h-20 w-20 shrink-0 select-none object-contain"
          draggable={false}
        />
        <div className="flex flex-1 flex-col gap-1">
          <h3 className="font-display text-[22px] leading-tight font-[420] tracking-[-0.012em] text-foreground">
            KireiManga
          </h3>
          <p className="font-mono text-[11px] tracking-[0.18em] tabular-nums text-[var(--color-bone-muted)] uppercase">
            {version ? `v${version}` : '—'}
          </p>
          <p className="mt-2 max-w-[46ch] text-[13px] leading-relaxed text-muted-foreground italic">
            <span className="font-kanji text-foreground not-italic">綺麗漫画</span>
            {' — '}
            {t('settings.about.tagline')}
          </p>
          <p className="mt-3 inline-flex items-center gap-1.5 text-[12px] text-[var(--color-bone-faint)]">
            {t('settings.about.credits.prefix')}
            <Heart className="h-3 w-3 fill-[var(--color-accent)] stroke-[var(--color-accent)]" />
            <a
              href="https://github.com/Shironex"
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground underline-offset-4 transition-colors hover:text-[var(--color-accent)] hover:underline"
            >
              Shiro
            </a>
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={openLogsFolder}
        className="inline-flex w-fit items-center gap-2 rounded-sm border border-border bg-[var(--color-ink-sunken)] px-3 py-1.5 font-mono text-[11px] tracking-[0.18em] uppercase text-[var(--color-bone-muted)] transition-colors hover:border-[var(--color-accent)] hover:text-foreground"
      >
        <FolderOpen className="h-3.5 w-3.5" />
        {t('settings.about.logs.action')}
      </button>
    </SettingsSection>
  );
}
