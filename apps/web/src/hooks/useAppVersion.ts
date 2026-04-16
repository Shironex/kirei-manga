/**
 * Reads the live Electron `app.getVersion()` via the preload bridge.
 *
 * Source of truth is `apps/desktop/package.json#version` at runtime — so when
 * `electron-updater` installs a new binary, the UI reflects the new version
 * on next render with no code changes.
 *
 * Returns `null` until the IPC round-trip resolves, or when running in a
 * plain browser (no `window.electronAPI`). Callers should render a fallback.
 */
import { useEffect, useState } from 'react';

export function useAppVersion(): string | null {
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    const api = window.electronAPI?.app;
    if (!api) return;
    let cancelled = false;
    api
      .getVersion()
      .then(v => {
        if (!cancelled) setVersion(v);
      })
      .catch(() => {
        if (!cancelled) setVersion(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return version;
}
