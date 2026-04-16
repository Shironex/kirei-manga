import { useCallback, useEffect, useState } from 'react';
import { RouterProvider } from 'react-router-dom';
import { router } from './router';
import { ToastContainer } from './components/system/ToastContainer';
import { SplashScreen } from './components/splash';
import { OnboardingOverlay } from './components/onboarding/OnboardingOverlay';
import { TooltipProvider } from './components/ui/Tooltip';
import { useAppearance } from './hooks/useAppearance';
import { useSettingsStore } from './stores/settings-store';
import { useSocketStore } from './stores/socket-store';
import { useUpdateStore } from './stores/update-store';

export default function App() {
  // Subscribe the document root to settings.appearance.
  useAppearance();

  // The splash stays visible until the socket connects (backend is up) *and*
  // its own minimum-display timer has elapsed. Reading the status here keeps
  // the splash component pure (it doesn't depend on the socket store directly)
  // and lets a future slice swap in a richer readiness signal (e.g. settings
  // hydrated, library refreshed) by extending this boolean.
  const status = useSocketStore(s => s.status);
  const ready = status === 'connected';

  const [splashDone, setSplashDone] = useState(false);
  const handleDismissed = useCallback(() => setSplashDone(true), []);

  // Subscribe once at app boot so update events fire into the store even
  // before the user opens Settings. The store's own action is stable.
  useEffect(() => useUpdateStore.getState().initListeners(), []);

  // First-run gate. Stays false until settings hydrate so we never flash
  // the overlay against an unloaded settings store. Re-runs from Settings
  // simply patch `onboarding.completed = false`, which flips this back on.
  const onboardingNeeded = useSettingsStore(
    s => s.settings !== null && s.settings.onboarding.completed === false
  );

  return (
    <TooltipProvider delayDuration={300} skipDelayDuration={150}>
      <SplashScreen ready={ready} error={null} onDismissed={handleDismissed} />
      {/* Keep the router mounted behind the splash so route data starts loading
          while the splash is still visible — the overlay covers it completely
          until fade-out begins. */}
      <div className="h-full" aria-hidden={!splashDone}>
        <RouterProvider router={router} />
      </div>
      {splashDone && onboardingNeeded && <OnboardingOverlay />}
      <ToastContainer />
    </TooltipProvider>
  );
}
