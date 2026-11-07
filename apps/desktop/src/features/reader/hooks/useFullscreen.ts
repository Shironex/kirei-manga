import { useCallback, useEffect, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';

import { isTauri } from '@/lib/ipc';

/**
 * Window fullscreen. In the app it is the native window state (macOS gets its
 * own space); in a browser preview it falls back to the Fullscreen API.
 */
export function useFullscreen(): { fullscreen: boolean; toggle: () => void; exit: () => boolean } {
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    if (isTauri()) {
      const win = getCurrentWindow();
      let alive = true;
      const sync = () =>
        win.isFullscreen().then(
          value => alive && setFullscreen(value),
          () => {}
        );
      void sync();
      const unlisten = win.onResized(() => void sync());
      return () => {
        alive = false;
        void unlisten.then(stop => stop());
      };
    }
    const sync = () => setFullscreen(document.fullscreenElement !== null);
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);

  const set = useCallback((value: boolean) => {
    if (isTauri()) {
      setFullscreen(value);
      getCurrentWindow()
        .setFullscreen(value)
        .catch(() => setFullscreen(!value));
    } else if (value) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else if (document.fullscreenElement) {
      void document.exitFullscreen();
    }
  }, []);

  const toggle = useCallback(() => set(!fullscreen), [set, fullscreen]);

  /** Leaves fullscreen; returns false when there was nothing to leave. */
  const exit = useCallback(() => {
    if (!fullscreen) return false;
    set(false);
    return true;
  }, [set, fullscreen]);

  return { fullscreen, toggle, exit };
}
