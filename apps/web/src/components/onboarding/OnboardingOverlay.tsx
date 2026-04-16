import { useEffect, useState } from 'react';
import { useT } from '@/hooks/useT';
import {
  ONBOARDING_STEPS,
  type OnboardingStepId,
  useOnboardingStore,
} from '@/stores/onboarding-store';
import { WelcomeStep } from './steps/WelcomeStep';
import { AppearanceStep } from './steps/AppearanceStep';
import { ReaderStep } from './steps/ReaderStep';
import { LocalShelfStep } from './steps/LocalShelfStep';
import { FinishStep } from './steps/FinishStep';

/** How long the dismiss fade plays before the overlay unmounts itself. */
const EXIT_ANIMATION_MS = 360;

/**
 * First-run onboarding overlay. Mounted from `App.tsx` once the splash
 * dismisses and `settings.onboarding.completed === false`. Looks like a
 * cousin of the splash screen — sumi background, single bengara hairline
 * down the left edge, draggable header, but with a centered editorial
 * card hosting the active step.
 *
 * The overlay never blocks the underlying router from painting; it just
 * renders on top with `z-[9000]` (the splash itself sits at 9999, so any
 * brief overlap during boot collapses safely).
 */
export function OnboardingOverlay() {
  const t = useT();
  const stepIndex = useOnboardingStore(s => s.stepIndex);
  const dismissing = useOnboardingStore(s => s.dismissing);
  const reset = useOnboardingStore(s => s.reset);

  // When the store flips `dismissing` to true, settings has been patched
  // already — keep the overlay around for the fade duration, then unmount.
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    if (!dismissing) return;
    const id = setTimeout(() => setHidden(true), EXIT_ANIMATION_MS);
    return () => clearTimeout(id);
  }, [dismissing]);

  // Reset the local progress whenever the overlay re-mounts (e.g. user hit
  // "Run setup again" from Settings). The mount itself is gated upstream so
  // this only fires when we genuinely re-enter the flow.
  useEffect(() => {
    reset();
  }, [reset]);

  if (hidden) return null;

  const stepId: OnboardingStepId = ONBOARDING_STEPS[stepIndex] ?? ONBOARDING_STEPS[0];
  const totalSteps = ONBOARDING_STEPS.length;
  const stepNumber = stepIndex + 1;

  return (
    <div
      className={[
        'fixed inset-0 z-[9000] flex flex-col bg-[var(--color-ink)] text-foreground',
        'transition-opacity duration-300 ease-out',
        dismissing ? 'opacity-0' : 'opacity-100',
      ].join(' ')}
      role="dialog"
      aria-modal="true"
      aria-label={t('onboarding.aria.dialog')}
    >
      {/* Hairline bengara rule hugging the left edge — same motif the splash and sidebar use. */}
      <div
        aria-hidden
        className="pointer-events-none absolute top-0 bottom-0 left-[18px] w-px bg-[var(--color-accent)] opacity-30"
      />

      {/* Top rail: drag region + step counter + Skip rest. */}
      <div className="app-drag relative flex h-12 shrink-0 items-center justify-between gap-4 px-8 pl-12">
        <span className="font-mono text-[10px] tracking-[0.28em] text-[var(--color-bone-faint)] uppercase">
          {t('onboarding.topbar.brand')}
        </span>
        <div className="app-no-drag flex items-center gap-5">
          <span className="font-mono text-[10px] tracking-[0.22em] text-[var(--color-bone-faint)] tabular-nums uppercase">
            {t('onboarding.topbar.step', { current: stepNumber, total: totalSteps })}
          </span>
          {stepId !== 'finish' && stepId !== 'welcome' && (
            <button
              type="button"
              onClick={() => void useOnboardingStore.getState().complete()}
              className="font-mono text-[10px] tracking-[0.22em] text-[var(--color-bone-muted)] underline-offset-4 uppercase transition-colors hover:text-foreground hover:underline"
            >
              {t('onboarding.action.skipRest')}
            </button>
          )}
        </div>
      </div>

      <main className="relative flex flex-1 items-center justify-center overflow-y-auto px-8 pb-10">
        <div className="w-full max-w-[640px]">
          {stepId === 'welcome' && <WelcomeStep />}
          {stepId === 'appearance' && <AppearanceStep />}
          {stepId === 'reader' && <ReaderStep />}
          {stepId === 'shelf' && <LocalShelfStep />}
          {stepId === 'finish' && <FinishStep />}
        </div>
      </main>

      {/* Progress dots — anchor at bottom, mirror the kanji eyebrow scale. */}
      <footer className="flex shrink-0 items-center justify-center gap-2 pb-8">
        {ONBOARDING_STEPS.map((id, idx) => {
          const active = idx === stepIndex;
          const past = idx < stepIndex;
          return (
            <span
              key={id}
              aria-hidden
              className={[
                'h-px transition-all duration-300',
                active
                  ? 'w-8 bg-[var(--color-accent)]'
                  : past
                    ? 'w-4 bg-[var(--color-bone-muted)]'
                    : 'w-4 bg-[var(--color-rule-strong)]',
              ].join(' ')}
            />
          );
        })}
      </footer>
    </div>
  );
}
