import { useEffect, useState } from 'react';
import { Copy, Minus, Square, X } from 'lucide-react';
import { useT } from '@/hooks/useT';

/**
 * Custom window controls for frameless Electron builds on Windows.
 *
 * Returns `null` on macOS (native traffic lights are used) and in web mode
 * (no `electronAPI`). The Electron main-process IPC handler for
 * `window:maximize` already toggles maximize/unmaximize based on current
 * state, so this component only needs to call `.maximize()` for both actions.
 *
 * Hit area is 46×32 px to match Windows 11 caption buttons; the close button
 * uses the conventional #c42b1c red on hover.
 */
export function WindowControls() {
  const t = useT();
  const api = typeof window !== 'undefined' ? window.electronAPI : undefined;
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    if (!api || api.platform === 'darwin') return;

    let cancelled = false;
    void api.window.isMaximized().then(state => {
      if (!cancelled) setIsMaximized(state);
    });

    const unsubscribe = api.window.onMaximizedChange(state => {
      setIsMaximized(state);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [api]);

  if (!api || api.platform === 'darwin') return null;

  const MaximizeIcon = isMaximized ? Copy : Square;

  return (
    <div className="app-no-drag -mr-4 flex h-12 items-stretch">
      <button
        type="button"
        aria-label={t('common.windowControls.minimize')}
        onClick={() => api.window.minimize()}
        className="flex h-full w-[46px] items-center justify-center text-[var(--color-bone-muted)] transition-colors hover:bg-[var(--color-ink-sunken)] hover:text-foreground"
      >
        <Minus className="h-[14px] w-[14px] stroke-[1.4]" />
      </button>
      <button
        type="button"
        aria-label={
          isMaximized ? t('common.windowControls.restore') : t('common.windowControls.maximize')
        }
        onClick={() => api.window.maximize()}
        className="flex h-full w-[46px] items-center justify-center text-[var(--color-bone-muted)] transition-colors hover:bg-[var(--color-ink-sunken)] hover:text-foreground"
      >
        <MaximizeIcon className="h-[14px] w-[14px] stroke-[1.4]" />
      </button>
      <button
        type="button"
        aria-label={t('common.windowControls.close')}
        onClick={() => api.window.close()}
        className="group flex h-full w-[46px] items-center justify-center text-[var(--color-bone-muted)] transition-colors hover:bg-[#c42b1c] hover:text-white"
      >
        <X className="h-[14px] w-[14px] stroke-[1.4]" />
      </button>
    </div>
  );
}
