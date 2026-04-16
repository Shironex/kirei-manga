import { create } from 'zustand';
import { useSettingsStore } from './settings-store';

/**
 * In-memory state machine for the first-run onboarding overlay.
 *
 * The overlay's *visibility* is driven by `settings.onboarding.completed`
 * (persisted in electron-store via `app.settings`). This store only tracks
 * the user's progress *through* the flow during a single mount: which step
 * they're on, and whether they've requested an animated dismissal.
 *
 * `complete()` is the only side-effecting action — it patches
 * `settings.onboarding` to mark the flow done, which causes the overlay to
 * unmount on the next render. Step writes (theme, reader mode, etc.) flow
 * through `useSettingsStore` directly from the step components, so anything
 * the user touched mid-flow stays even if they bail out via "Skip rest".
 */

export type OnboardingStepId = 'welcome' | 'appearance' | 'reader' | 'shelf' | 'finish';

/** Ordered step list — also drives the progress indicator. */
export const ONBOARDING_STEPS: ReadonlyArray<OnboardingStepId> = [
  'welcome',
  'appearance',
  'reader',
  'shelf',
  'finish',
];

interface OnboardingState {
  stepIndex: number;
  /** True while the exit fade is playing — overlay reads this for its class. */
  dismissing: boolean;
}

interface OnboardingActions {
  goTo: (step: OnboardingStepId) => void;
  next: () => void;
  back: () => void;
  /** Marks onboarding finished in persisted settings and starts the fade. */
  complete: () => Promise<void>;
  reset: () => void;
}

export type OnboardingStore = OnboardingState & OnboardingActions;

export const useOnboardingStore = create<OnboardingStore>()((set, get) => ({
  stepIndex: 0,
  dismissing: false,

  goTo: step => {
    const idx = ONBOARDING_STEPS.indexOf(step);
    if (idx === -1) return;
    set({ stepIndex: idx });
  },

  next: () => {
    const { stepIndex } = get();
    if (stepIndex >= ONBOARDING_STEPS.length - 1) return;
    set({ stepIndex: stepIndex + 1 });
  },

  back: () => {
    const { stepIndex } = get();
    if (stepIndex <= 0) return;
    set({ stepIndex: stepIndex - 1 });
  },

  complete: async () => {
    set({ dismissing: true });
    try {
      await useSettingsStore.getState().set({
        onboarding: {
          completed: true,
          completedAt: new Date().toISOString(),
        },
      });
    } catch {
      // Persistence failed — undo the dismiss so the user can retry the
      // exit instead of being trapped behind a stuck overlay.
      set({ dismissing: false });
      throw new Error('Failed to save onboarding state');
    }
  },

  reset: () => set({ stepIndex: 0, dismissing: false }),
}));

export function currentStep(state: Pick<OnboardingState, 'stepIndex'>): OnboardingStepId {
  return ONBOARDING_STEPS[state.stepIndex] ?? ONBOARDING_STEPS[0];
}
