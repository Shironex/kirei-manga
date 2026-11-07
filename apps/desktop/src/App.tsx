import { useCallback, useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ReaderTestPage } from '@/features/reader-test/ReaderTestPage';
import { describeAppInfo, getAppInfo, isTauri } from '@/lib/ipc';

type Status =
  { kind: 'loading' } | { kind: 'ready'; text: string } | { kind: 'error'; text: string };

export function App() {
  return (
    <TooltipProvider>
      <EngineHome />
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
