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

  const sectionKeys = ['appearance', 'reader', 'library', 'onboarding', 'translation'] as const;
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
    // `translation.providerKeys` is the only nested object on a section: merge
    // one level so a stored payload from before a new key was added (e.g.
    // `ollamaModel` in J.1) still inherits its default on next boot instead of
    // overwriting the whole bucket with the older shape.
    if (key === 'translation') {
      const defKeys = (def.providerKeys ?? {}) as Record<string, unknown>;
      const inKeys = (inSection.providerKeys ?? {}) as Record<string, unknown>;
      const mergedKeys: Record<string, unknown> = { ...defKeys };
      for (const k of Object.keys(inKeys)) {
        if (inKeys[k] !== undefined) {
          mergedKeys[k] = inKeys[k];
        }
      }
      for (const k of Object.keys(defKeys)) {
        if (!(k in inKeys) || inKeys[k] === undefined) {
          mutated = true;
        }
      }
      next.providerKeys = mergedKeys;
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
 * Apply a DeepPartial patch onto a known-good AppSettings. Only the known
 * sections (appearance/reader/library/onboarding/translation) are deep-merged
 * one level — the shape is shallow per section so we don't need a generic
 * recursive merge. `translation.providerKeys` is the one nested object that
 * gets its own one-level merge so partial credential patches don't drop the
 * other providers' keys. `language` and `shortcuts` overwrite at the top level.
 */
function applyPatch(base: AppSettings, patch: DeepPartial<AppSettings>): AppSettings {
  const next: AppSettings = {
    appearance: { ...base.appearance },
    reader: { ...base.reader },
    library: { ...base.library, localRoots: [...base.library.localRoots] },
    language: base.language,
    shortcuts: { ...base.shortcuts },
    onboarding: { ...base.onboarding },
    translation: { ...base.translation, providerKeys: { ...base.translation.providerKeys } },
  };

  if (patch.appearance) {
    next.appearance = { ...next.appearance, ...patch.appearance } as AppSettings['appearance'];
  }
  if (patch.reader) {
    next.reader = { ...next.reader, ...patch.reader } as AppSettings['reader'];
  }
  if (patch.library) {
    next.library = { ...next.library, ...patch.library } as AppSettings['library'];
    if (patch.library.localRoots !== undefined) {
      // Always overwrite localRoots wholesale — patches are expected to send
      // the new full array (append happens client-side from the prior state).
      next.library.localRoots = [...(patch.library.localRoots as string[])];
    }
  }
  if (patch.language !== undefined) {
    next.language = patch.language as AppSettings['language'];
  }
  if (patch.shortcuts) {
    next.shortcuts = { ...next.shortcuts, ...patch.shortcuts } as AppSettings['shortcuts'];
  }
  if (patch.onboarding) {
    next.onboarding = { ...next.onboarding, ...patch.onboarding } as AppSettings['onboarding'];
  }
  if (patch.translation) {
    next.translation = { ...next.translation, ...patch.translation } as AppSettings['translation'];
    if (patch.translation.providerKeys) {
      // Merge keys so a single-provider update doesn't wipe the others.
      next.translation.providerKeys = {
        ...next.translation.providerKeys,
        ...patch.translation.providerKeys,
      };
    }
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
    this.settings = {
      ...DEFAULT_APP_SETTINGS,
      appearance: { ...DEFAULT_APP_SETTINGS.appearance },
      reader: { ...DEFAULT_APP_SETTINGS.reader },
      library: {
        ...DEFAULT_APP_SETTINGS.library,
        localRoots: [...DEFAULT_APP_SETTINGS.library.localRoots],
      },
      shortcuts: { ...DEFAULT_APP_SETTINGS.shortcuts },
      onboarding: { ...DEFAULT_APP_SETTINGS.onboarding },
      translation: {
        ...DEFAULT_APP_SETTINGS.translation,
        providerKeys: { ...DEFAULT_APP_SETTINGS.translation.providerKeys },
      },
    };
    store.set(STORE_KEY, this.settings);
    return this.get();
  }
}
