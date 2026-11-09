import { invoke } from '@tauri-apps/api/core';

/**
 * Self-update commands (src-tauri/src/updater.rs). Release builds only: a
 * debug build answers `disabled`.
 */

/** Mirrors `updater::UpdateCheck`. */
export type UpdateCheck =
  | { kind: 'disabled' }
  | { kind: 'upToDate'; current: string }
  | { kind: 'available'; current: string; version: string; notes: string | null };

/** What the Updates row shows. */
export type UpdateState =
  | { step: 'idle' }
  | { step: 'checking' }
  | { step: 'installing'; version: string }
  | { step: 'failed'; message: string }
  | { step: 'checked'; check: UpdateCheck };

/** Asks the release feeds for a newer version. */
export function checkForUpdate(): Promise<UpdateCheck> {
  return invoke<UpdateCheck>('update_check');
}

/** Downloads and installs the update the last check found, then restarts the app. */
export function installUpdate(): Promise<void> {
  return invoke('update_install');
}

/** The Updates row's help line for a state. */
export function describeUpdate(state: UpdateState): string {
  switch (state.step) {
    case 'idle':
      return 'KireiManga checks GitHub for a newer signed release.';
    case 'checking':
      return 'Checking for updates…';
    case 'installing':
      return `Downloading ${state.version}. KireiManga restarts when it is installed.`;
    case 'failed':
      return `The update did not go through: ${state.message}`;
    case 'checked':
      switch (state.check.kind) {
        case 'disabled':
          return 'Updates are not available in this build.';
        case 'upToDate':
          return `You have the latest version (${state.check.current}).`;
        case 'available':
          return `Version ${state.check.version} is ready to install (you have ${state.check.current}).`;
      }
  }
}
