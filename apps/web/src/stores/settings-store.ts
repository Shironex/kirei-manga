import { create } from 'zustand';
import {
  createLogger,
  DEFAULT_APP_SETTINGS,
  SettingsEvents,
  type AppSettings,
  type DeepPartial,
  type SettingsGetResponse,
  type SettingsSetPayload,
  type SettingsSetResponse,
  type SettingsUpdatedEvent,
} from '@kireimanga/shared';
import { emitWithResponse, getSocket } from '@/lib/socket';

const logger = createLogger('SettingsStore');

interface SettingsState {
  /** Current settings — null until first hydrate completes. */
  settings: AppSettings | null;
  loading: boolean;
  error: string | null;
}

interface SettingsActions {
  hydrate: () => Promise<void>;
  set: (partial: DeepPartial<AppSettings>) => Promise<void>;
  reset: () => Promise<void>;
  initListeners: () => void;
  cleanupListeners: () => void;
}

type SettingsStore = SettingsState & SettingsActions;

let updatedHandler: ((payload: SettingsUpdatedEvent) => void) | null = null;
let listenersInitialized = false;

/**
 * Apply a partial patch onto the cached settings — mirrors
 * SettingsService.applyPatch on the desktop side so the optimistic UI matches
 * what the persistence layer will write. Known sections are deep-merged one
 * level; `translation.providerKeys` gets its own one-level merge so partial
 * credential patches don't drop other providers' keys. `language` and
 * `shortcuts` overwrite at the top level.
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
      // localRoots is overwritten as a whole array, mirroring the desktop
      // service. Append/remove logic happens at the call site so the patch
      // payload always carries the intended final list.
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
    next.translation = {
      ...next.translation,
      ...patch.translation,
    } as AppSettings['translation'];
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

export const useSettingsStore = create<SettingsStore>()((set, get) => ({
  settings: null,
  loading: false,
  error: null,

  hydrate: async () => {
    set({ loading: true, error: null });
    try {
      const response = await emitWithResponse<Record<string, never>, SettingsGetResponse>(
        SettingsEvents.GET,
        {}
      );
      if (response.error) {
        logger.error('settings:get returned error', response.error);
        set({ loading: false, error: response.error });
        return;
      }
      set({ settings: response.settings, loading: false, error: null });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('settings:get failed', message);
      set({ loading: false, error: message });
    }
  },

  set: async (partial: DeepPartial<AppSettings>) => {
    const current = get().settings ?? DEFAULT_APP_SETTINGS;
    const snapshot = current;
    // Optimistic patch.
    const optimistic = applyPatch(current, partial);
    set({ settings: optimistic, error: null });

    try {
      const response = await emitWithResponse<SettingsSetPayload, SettingsSetResponse>(
        SettingsEvents.SET,
        { settings: partial }
      );
      if (response.error) {
        throw new Error(response.error);
      }
      // Trust the server's normalized response — keeps client in sync if the
      // backend filtered/clamped any field.
      set({ settings: response.settings });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('settings:set failed', message);
      // Rollback to snapshot.
      set({ settings: snapshot, error: message });
      throw err instanceof Error ? err : new Error(message);
    }
  },

  reset: async () => {
    const snapshot = get().settings;
    set({ settings: { ...DEFAULT_APP_SETTINGS }, error: null });
    try {
      const response = await emitWithResponse<Record<string, never>, SettingsSetResponse>(
        SettingsEvents.RESET,
        {}
      );
      if (response.error) {
        throw new Error(response.error);
      }
      set({ settings: response.settings });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('settings:reset failed', message);
      set({ settings: snapshot, error: message });
      throw err instanceof Error ? err : new Error(message);
    }
  },

  initListeners: () => {
    if (listenersInitialized) return;

    updatedHandler = (payload: SettingsUpdatedEvent) => {
      if (!payload?.settings) return;
      set({ settings: payload.settings });
    };
    getSocket().on(SettingsEvents.UPDATED, updatedHandler);

    listenersInitialized = true;
    logger.debug('Settings listeners registered');
  },

  cleanupListeners: () => {
    if (updatedHandler) {
      getSocket().off(SettingsEvents.UPDATED, updatedHandler);
      updatedHandler = null;
    }
    listenersInitialized = false;
    logger.debug('Settings listeners cleaned up');
  },
}));
