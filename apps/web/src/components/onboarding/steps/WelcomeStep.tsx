import mascotWave from '@/assets/chibi_wave.png';
import { useT } from '@/hooks/useT';
import { useOnboardingStore } from '@/stores/onboarding-store';
import { OnboardingStepFrame } from '../OnboardingStepFrame';

export function WelcomeStep() {
  const t = useT();
  const next = useOnboardingStore(s => s.next);

  const skip = () => {
    void useOnboardingStore.getState().complete();
  };

  return (
    <OnboardingStepFrame
      kanji="始"
      eyebrow={t('onboarding.welcome.eyebrow')}
      title={t('onboarding.welcome.title')}
      description={t('onboarding.welcome.description')}
      footer={
        <>
          <button
            type="button"
            onClick={skip}
            className="font-mono text-[11px] tracking-[0.22em] text-[var(--color-bone-muted)] underline-offset-4 uppercase transition-colors hover:text-foreground hover:underline"
          >
            {t('onboarding.welcome.skip')}
          </button>
          <button
            type="button"
            onClick={next}
            className="inline-flex h-9 items-center rounded-[2px] border border-[var(--color-accent)] bg-[var(--color-accent)] px-5 font-mono text-[11px] tracking-[0.22em] text-[var(--color-ink)] uppercase transition-colors hover:bg-transparent hover:text-[var(--color-accent)]"
          >
            {t('onboarding.welcome.begin')}
          </button>
        </>
      }
    >
      <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start sm:gap-8">
        <img
          src={mascotWave}
          alt=""
          aria-hidden
          draggable={false}
          className="h-28 w-28 shrink-0 select-none object-contain"
        />
        <ul className="flex flex-col gap-3 text-[13.5px] leading-relaxed text-foreground">
          <li className="flex gap-3">
            <span className="font-mono mt-[3px] text-[10px] tracking-[0.24em] text-[var(--color-accent)] uppercase">
              01
            </span>
            <span>{t('onboarding.welcome.point.appearance')}</span>
          </li>
          <li className="flex gap-3">
            <span className="font-mono mt-[3px] text-[10px] tracking-[0.24em] text-[var(--color-accent)] uppercase">
              02
            </span>
            <span>{t('onboarding.welcome.point.reader')}</span>
          </li>
          <li className="flex gap-3">
            <span className="font-mono mt-[3px] text-[10px] tracking-[0.24em] text-[var(--color-accent)] uppercase">
              03
            </span>
            <span>{t('onboarding.welcome.point.shelf')}</span>
          </li>
        </ul>
      </div>
    </OnboardingStepFrame>
  );
}
