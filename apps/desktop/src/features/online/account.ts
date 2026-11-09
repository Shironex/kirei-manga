import { useSyncExternalStore } from 'react';

import { isTauri } from '@/lib/ipc';
import { getAccount, onAccountChanged, type Account } from '@/lib/online';

/**
 * The MangaDex account and network state, shared by every online view. Loads
 * once, then follows the `online:account` event Rust sends whenever the
 * session or the connection changes (sign in, expiry, offline, rate limit).
 */

const SIGNED_OUT: Account = {
  session: 'signedOut',
  username: null,
  clientId: null,
  health: { state: 'online' },
  keychain: true,
};

let account: Account = SIGNED_OUT;
let loaded = false;
let started = false;
const listeners = new Set<() => void>();

function publish(next: Account) {
  account = next;
  loaded = true;
  for (const listener of listeners) listener();
}

function start() {
  if (started || !isTauri()) return;
  started = true;
  void onAccountChanged(publish);
  getAccount().then(publish, () => {
    loaded = true;
  });
}

/** Replaces the account after a command returned a fresh one. */
export function setAccount(next: Account) {
  publish(next);
}

function subscribe(listener: () => void) {
  start();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useAccount(): Account & { loaded: boolean } {
  const current = useSyncExternalStore(subscribe, () => account);
  return { ...current, loaded };
}
