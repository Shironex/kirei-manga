import { PageHeader } from '@/components/page/PageHeader';
import { isTauri } from '@/lib/ipc';

import { ReaderTestPage } from './ReaderTestPage';

/** Dev route around the engine test bench, which needs the Rust core. */
export function EngineRoute() {
  return (
    <>
      <PageHeader
        title="Engine bench"
        lead="Open an archive or folder and page through it to watch the read-ahead cache. Not the reader."
      />
      {isTauri() ? (
        <ReaderTestPage />
      ) : (
        <p className="text-fg-3">The bench needs the desktop app: run pnpm dev, not dev:web.</p>
      )}
    </>
  );
}
