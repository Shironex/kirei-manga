/**
 * `getFetch()` returns Electron's `net.fetch` when running inside the main
 * process and falls back to the global `fetch` (Node 18+/jsdom/test mocks)
 * elsewhere. Centralized so HTTP clients across modules (MangaDex, DeepL, …)
 * pick up the same resolution rules.
 */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export function getFetch(): FetchLike {
  // electron.net.fetch is only available inside an Electron main process.
  // In Jest we fall back to the global fetch (node 18+ / jsdom / test mock).
  try {
    // Dynamic require so tests without electron installed still work.

    const mod = require('electron') as { net?: { fetch?: FetchLike } };
    if (mod?.net?.fetch) {
      return mod.net.fetch.bind(mod.net);
    }
  } catch {
    // not in Electron runtime
  }
  if (typeof globalThis.fetch !== 'function') {
    throw new Error('No fetch implementation available');
  }
  return globalThis.fetch.bind(globalThis);
}
