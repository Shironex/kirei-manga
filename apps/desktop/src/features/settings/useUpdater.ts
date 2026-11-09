import { useCallback, useEffect, useRef, useState } from 'react';

import { isTauri } from '@/lib/ipc';
import { checkForUpdate, installUpdate, type UpdateState } from '@/lib/updater';

const message = (reason: unknown) => (reason instanceof Error ? reason.message : String(reason));

/**
 * State and actions of the Updates row. Checks once when Settings opens; in
 * a browser preview it reports the build as having no updater.
 */
export function useUpdater() {
  const [state, setState] = useState<UpdateState>({ step: 'idle' });
  const mounted = useRef(true);

  const check = useCallback(() => {
    if (!isTauri()) {
      setState({ step: 'checked', check: { kind: 'disabled' } });
      return;
    }
    setState({ step: 'checking' });
    checkForUpdate().then(
      next => mounted.current && setState({ step: 'checked', check: next }),
      (reason: unknown) => mounted.current && setState({ step: 'failed', message: message(reason) })
    );
  }, []);

  const install = useCallback((version: string) => {
    setState({ step: 'installing', version });
    // Resolves only if the install failed: on success the app restarts.
    installUpdate().catch(
      (reason: unknown) => mounted.current && setState({ step: 'failed', message: message(reason) })
    );
  }, []);

  useEffect(() => {
    mounted.current = true;
    check();
    return () => {
      mounted.current = false;
    };
  }, [check]);

  return { state, check, install };
}
