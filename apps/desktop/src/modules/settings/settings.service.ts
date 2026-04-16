import { Injectable } from '@nestjs/common';
import {
  createLogger,
  DEFAULT_APP_SETTINGS,
  type AppSettings,
  type DeepPartial,
} from '@kireimanga/shared';
import { store } from '../../main/store';

const logger = createLogger('SettingsService');

const STORE_KEY = 'app.settings';

/**
 * Section-aware merge: AppSettings is a flat-per-section shape, so we deep
 * merge one level into each known section and let the rest pass through. This
 * keeps unknown keys out of the persisted payload while still letting future
 * additions inherit defaults on next boot.
 */
function mergeWithDefaults(stored: unknown): { merged: AppSettings; mutated: boolean } {
  if (!stored || typeof stored !== 'object') {
    return { merged: { ...DEFAULT_APP_SETTINGS }, mutated: true };
  }

  const input = stored as Partial<AppSettings>;
  let mutated = false;

  const sectionKeys = ['appearance', 'reader', 'library'] as const;
  const merged: AppSettings = { ...DEFAULT_APP_SETTINGS };

  for (const key of sectionKeys) {
    const def = DEFAULT_APP_SETTINGS[key] as unknown as Record<string, unknown>;
    const inSection = (input[key] ?? {}) as unknown as Record<string, unknown>;
    const next: Record<string, unknown> = { ...def };
    for (const k of Object.keys(def)) {
      if (k in inSection && inSection[k] !== undefined) {
        next[k] = inSection[k];
      } else {
        mutated = true;
      }
    }
    (merged as unknown as Record<string, unknown>)[key] = next;
  }

  if (input.language !== undefined) {
    merged.language = input.language;
  } else {
    mutated = true;
  }

  if (input.shortcuts && typeof input.shortcuts === 'object') {
    merged.shortcuts = { ...DEFAULT_APP_SETTINGS.shortcuts, ...input.shortcuts };
  } else {
    merged.shortcuts = { ...DEFAULT_APP_SETTINGS.shortcuts };
    mutated = true;
  }

  return { merged, mutated };
}

/**
 * Apply a DeepPartial patch onto a known-good AppSettings. Only the three
 * known sections (appearance/reader/library) are deep-merged one level — the
 * shape is shallow per section so we don't need a generic recursive merge.
 * `language` and `shortcuts` overwrite at the top level.
 */
function applyPatch(base: AppSettings, patch: DeepPartial<AppSettings>): AppSettings {
  const next: AppSettings = {
    appearance: { ...base.appearance },
    reader: { ...base.reader },
    library: { ...base.library },
    language: base.language,
    shortcuts: { ...base.shortcuts },
  };

  if (patch.appearance) {
    next.appearance = { ...next.appearance, ...patch.appearance } as AppSettings['appearance'];
  }
  if (patch.reader) {
    next.reader = { ...next.reader, ...patch.reader } as AppSettings['reader'];
  }
  if (patch.library) {
    next.library = { ...next.library, ...patch.library } as AppSettings['library'];
  }
  if (patch.language !== undefined) {
    next.language = patch.language as AppSettings['language'];
  }
  if (patch.shortcuts) {
    next.shortcuts = { ...next.shortcuts, ...patch.shortcuts } as AppSettings['shortcuts'];
  }

  return next;
}

/**
 * Persists app-wide user settings (theme, font, reader defaults, default
 * chapter language, shortcuts) via the existing electron-store singleton
 * under a single `app.settings` key. Held in-memory after construction so
 * `get()` is synchronous; `set()` and `reset()` write through to disk and
 * return the new full settings object.
 */
@Injectable()
export class SettingsService {
  private settings: AppSettings;

  constructor() {
    const stored = store.get(STORE_KEY);
    const { merged, mutated } = mergeWithDefaults(stored);
    this.settings = merged;
    if (mutated) {
      // Backfill missing defaults so the on-disk shape stays consistent with
      // DEFAULT_APP_SETTINGS even after schema additions.
      store.set(STORE_KEY, this.settings);
    }
    logger.info('SettingsService initialized');
  }

  /** Returns a fresh copy so consumers can't mutate the in-memory cache. */
  get(): AppSettings {
    return JSON.parse(JSON.stringify(this.settings)) as AppSettings;
  }

  /**
   * Apply a partial patch and persist. Returns the new full settings.
   */
  set(partial: DeepPartial<AppSettings>): AppSettings {
    this.settings = applyPatch(this.settings, partial);
    store.set(STORE_KEY, this.settings);
    return this.get();
  }

  /** Restore defaults and persist. */
  reset(): AppSettings {
    this.settings = { ...DEFAULT_APP_SETTINGS, shortcuts: { ...DEFAULT_APP_SETTINGS.shortcuts } };
    store.set(STORE_KEY, this.settings);
    return this.get();
  }
}
