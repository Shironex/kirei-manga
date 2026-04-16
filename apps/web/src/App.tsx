import { useCallback, useState } from 'react';
import { RouterProvider } from 'react-router-dom';
import { router } from './router';
import { ToastContainer } from './components/system/ToastContainer';
import { SplashScreen } from './components/splash';
import { TooltipProvider } from './components/ui/Tooltip';
import { useAppearance } from './hooks/useAppearance';
import { useSocketStore } from './stores/socket-store';

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

  return (
    <TooltipProvider delayDuration={300} skipDelayDuration={150}>
      <SplashScreen ready={ready} error={null} onDismissed={handleDismissed} />
      {/* Keep the router mounted behind the splash so route data starts loading
          while the splash is still visible — the overlay covers it completely
          until fade-out begins. */}
      <div className="h-full" aria-hidden={!splashDone}>
        <RouterProvider router={router} />
      </div>
      <ToastContainer />
    </TooltipProvider>
  );
}
