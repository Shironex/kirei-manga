import { lazy, Suspense, useCallback, useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ReaderTestPage } from '@/features/reader-test/ReaderTestPage';
import { describeAppInfo, getAppInfo, isTauri } from '@/lib/ipc';

type Status =
  { kind: 'loading' } | { kind: 'ready'; text: string } | { kind: 'error'; text: string };

// Dev-only design review page; the import is dropped from production builds.
const DesignPage = import.meta.env.DEV
  ? lazy(() => import('@/features/design/DesignPage').then(m => ({ default: m.DesignPage })))
  : null;

function useHash() {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return hash;
}

export function App() {
  const hash = useHash();
  return (
    <TooltipProvider>
      {DesignPage && hash.startsWith('#/design') ? (
        <Suspense fallback={null}>
          <DesignPage />
        </Suspense>
      ) : (
        <EngineHome />
      )}
    </TooltipProvider>
  );
}

function EngineHome() {
  const [status, setStatus] = useState<Status>({ kind: 'loading' });

  const load = useCallback(async () => {
    if (!isTauri()) {
      setStatus({ kind: 'error', text: 'Running outside Tauri: no backend to call.' });
      return;
    }
    try {
      setStatus({ kind: 'ready', text: describeAppInfo(await getAppInfo()) });
    } catch (error) {
      setStatus({ kind: 'error', text: error instanceof Error ? error.message : String(error) });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <main className="flex min-h-screen flex-col items-center gap-6 p-8">
      <h1 className="m-0 font-display text-4xl font-bold font-condensed-tight">KireiManga</h1>
      <p className="text-fg-2" data-testid="app-info">
        {status.kind === 'loading' ? 'Asking the Rust core...' : status.text}
      </p>
      <Button variant="ghost" onClick={() => void load()}>
        Call the backend again
      </Button>
      {isTauri() && <ReaderTestPage />}
    </main>
  );
}
