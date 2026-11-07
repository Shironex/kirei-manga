import { useCallback, useSyncExternalStore } from 'react';

import { isTauri } from '@/lib/ipc';

import {
  DEFAULT_SETTINGS,
  getSettings,
  onSettingsChanged,
  setSetting as saveSetting,
  type AppSettings,
  type SettingKey,
} from './contract';

/**
 * The one settings store the app reads from. It loads once from the Rust
 * store, then follows `settings:changed` events, so every view (and every
 * window) shows the same values live.
 *
 *   const [strength, setStrength] = useSetting('appearance.strength');
 *
 * Writes apply at once (optimistic) and roll back if Rust refuses the value;
 * the returned promise rejects with the reason. Until the first load
 * resolves, and in a plain browser with no Rust core, the defaults are used
 * and writes stay in memory.
 */

export interface SettingsState {
  settings: AppSettings;
  /** True once the stored settings arrived (always false outside Tauri). */
  loaded: boolean;
  /** Why the stored settings could not be read, if they could not. */
  error: string | null;
}

let state: SettingsState = { settings: { ...DEFAULT_SETTINGS }, loaded: false, error: null };
const listeners = new Set<() => void>();
let started: Promise<void> | null = null;
/** Id of the latest local write. */
let revision = 0;
/** Writes still in flight. Settings arriving from Rust keep these on top. */
const pending = new Map<SettingKey, { value: unknown; id: number }>();

function publish(next: SettingsState): void {
  state = next;
  for (const listener of listeners) listener();
}

/** Settings from Rust with in-flight local writes laid over them. */
function fromRust(settings: AppSettings): AppSettings {
  if (pending.size === 0) return settings;
  const merged: Record<string, unknown> = { ...settings };
  for (const [key, { value }] of pending) merged[key] = value;
  return merged as unknown as AppSettings;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Loads the stored settings and subscribes to changes. Safe to call repeatedly. */
export function startSettings(): Promise<void> {
  if (started) return started;
  started = (async () => {
    if (!isTauri()) return;
    await onSettingsChanged(settings =>
      publish({ settings: fromRust(settings), loaded: true, error: null })
    );
    try {
      const settings = await getSettings();
      publish({ settings: fromRust(settings), loaded: true, error: null });
    } catch (error) {
      publish({ ...state, error: message(error) });
    }
  })();
  return started;
}

export function getSettingsState(): SettingsState {
  return state;
}

/** Sets one setting. Resolves once stored; rejects (after rolling back) if refused. */
export async function updateSetting<K extends SettingKey>(
  key: K,
  value: AppSettings[K]
): Promise<void> {
  const previous = state.settings[key];
  revision += 1;
  const id = revision;
  publish({ ...state, settings: { ...state.settings, [key]: value } });
  if (!isTauri()) return;
  pending.set(key, { value, id });
  const settle = () => {
    // A newer write to the same key owns the slot now.
    if (pending.get(key)?.id === id) pending.delete(key);
  };
  try {
    const settings = await saveSetting(key, value);
    settle();
    publish({ ...state, settings: fromRust(settings) });
  } catch (error) {
    const newer = pending.has(key) && pending.get(key)?.id !== id;
    settle();
    if (!newer) publish({ ...state, settings: { ...state.settings, [key]: previous } });
    throw new Error(message(error), { cause: error });
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  void startSettings();
  return () => listeners.delete(listener);
}

/** Every setting plus the load state. Prefer `useSetting` for a single value. */
export function useSettings(): SettingsState {
  return useSyncExternalStore(subscribe, getSettingsState, getSettingsState);
}

/** One setting and its setter, typed by key. */
export function useSetting<K extends SettingKey>(
  key: K
): [AppSettings[K], (value: AppSettings[K]) => Promise<void>] {
  const value = useSyncExternalStore(
    subscribe,
    () => state.settings[key],
    () => state.settings[key]
  );
  const set = useCallback((next: AppSettings[K]) => updateSetting(key, next), [key]);
  return [value, set];
}

/** Test hook: back to defaults, nothing loaded, no subscription. */
export function resetSettingsStore(): void {
  state = { settings: { ...DEFAULT_SETTINGS }, loaded: false, error: null };
  started = null;
  revision = 0;
  pending.clear();
  listeners.clear();
}
