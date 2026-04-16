import { useT } from '@/hooks/useT';
import { useOnboardingStore } from '@/stores/onboarding-store';

interface Props {
  /** Override the primary CTA label — defaults to `onboarding.action.next`. */
  nextLabel?: string;
  /** Optional secondary action shown left of the Skip link. */
  secondaryAction?: React.ReactNode;
  /** Hide the Skip step link (e.g. on a step with its own primary skip CTA). */
  hideSkip?: boolean;
  /** Disable the Next button (e.g. async work in flight). */
  nextDisabled?: boolean;
  /** Called when Next is clicked; defaults to advancing one step. */
  onNext?: () => void;
}

/**
 * Standard onboarding footer rail used by the middle steps. Keeps Back /
 * Skip step / Next consistent in spelling, hover behavior, and keyboard
 * order so the chrome doesn't shift between steps.
 */
export function StepFooter({ nextLabel, secondaryAction, hideSkip, nextDisabled, onNext }: Props) {
  const t = useT();
  const back = useOnboardingStore(s => s.back);
  const next = useOnboardingStore(s => s.next);
  const stepIndex = useOnboardingStore(s => s.stepIndex);

  const handleNext = onNext ?? next;
  const showBack = stepIndex > 0;

  return (
    <>
      <div className="flex items-center gap-5">
        {showBack && (
          <button
            type="button"
            onClick={back}
            className="font-mono text-[11px] tracking-[0.22em] text-[var(--color-bone-muted)] underline-offset-4 uppercase transition-colors hover:text-foreground hover:underline"
          >
            {t('onboarding.action.back')}
          </button>
        )}
        {secondaryAction}
      </div>
      <div className="flex items-center gap-5">
        {!hideSkip && (
          <button
            type="button"
            onClick={next}
            className="font-mono text-[11px] tracking-[0.22em] text-[var(--color-bone-muted)] underline-offset-4 uppercase transition-colors hover:text-foreground hover:underline"
          >
            {t('onboarding.action.skipStep')}
          </button>
        )}
        <button
          type="button"
          disabled={nextDisabled}
          onClick={handleNext}
          className="inline-flex h-9 items-center rounded-[2px] border border-[var(--color-accent)] bg-[var(--color-accent)] px-5 font-mono text-[11px] tracking-[0.22em] text-[var(--color-ink)] uppercase transition-colors enabled:hover:bg-transparent enabled:hover:text-[var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {nextLabel ?? t('onboarding.action.next')}
        </button>
      </div>
    </>
  );
}
