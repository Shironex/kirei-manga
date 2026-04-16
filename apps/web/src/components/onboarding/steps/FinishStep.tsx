import mascotRead from '@/assets/chibi_read.png';
import { router } from '@/router';
import { useT } from '@/hooks/useT';
import { useOnboardingStore } from '@/stores/onboarding-store';
import { OnboardingStepFrame } from '../OnboardingStepFrame';

export function FinishStep() {
  const t = useT();

  // The overlay lives outside `<RouterProvider>` in App.tsx, so the
  // `useNavigate` hook can't see the router context. Drive navigation
  // through the exported router instance instead — it works the same and
  // keeps the overlay decoupled from the routed tree.
  const finish = async (target: '/' | '/browse') => {
    await router.navigate(target);
    await useOnboardingStore.getState().complete();
  };

  return (
    <OnboardingStepFrame
      kanji="始"
      eyebrow={t('onboarding.finish.eyebrow')}
      title={t('onboarding.finish.title')}
      description={t('onboarding.finish.description')}
      footer={
        <>
          <span className="font-mono text-[10px] tracking-[0.22em] text-[var(--color-bone-faint)] uppercase">
            {t('onboarding.finish.tagline')}
          </span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => void finish('/')}
              className="inline-flex h-9 items-center rounded-[2px] border border-border px-4 font-mono text-[11px] tracking-[0.22em] text-foreground uppercase transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
            >
              {t('onboarding.finish.action.library')}
            </button>
            <button
              type="button"
              onClick={() => void finish('/browse')}
              className="inline-flex h-9 items-center rounded-[2px] border border-[var(--color-accent)] bg-[var(--color-accent)] px-4 font-mono text-[11px] tracking-[0.22em] text-[var(--color-ink)] uppercase transition-colors hover:bg-transparent hover:text-[var(--color-accent)]"
            >
              {t('onboarding.finish.action.browse')}
            </button>
          </div>
        </>
      }
    >
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-6">
        <img
          src={mascotRead}
          alt=""
          aria-hidden
          draggable={false}
          className="h-24 w-24 shrink-0 select-none object-contain"
        />
        <p className="max-w-[44ch] text-[14px] leading-relaxed text-[var(--color-bone-muted)]">
          {t('onboarding.finish.body')}
        </p>
      </div>
    </OnboardingStepFrame>
  );
}
