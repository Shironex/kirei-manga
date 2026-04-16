/**
 * Unit test: SettingsService against a stand-in electron-store.
 *
 * The real `electron-store` requires `app.getPath('userData')` which only
 * exists inside an Electron main process. We mock the store singleton at
 * module boundary so the service works under Jest exactly like it does in
 * production — read on construction, write on set/reset.
 */

const storeData = new Map<string, unknown>();

jest.mock('../../main/store', () => ({
  store: {
    get: (key: string) => storeData.get(key),
    set: (key: string, value: unknown) => {
      storeData.set(key, value);
    },
    delete: (key: string) => {
      storeData.delete(key);
    },
  },
}));

import { DEFAULT_APP_SETTINGS } from '@kireimanga/shared';
import { SettingsService } from './settings.service';

describe('SettingsService', () => {
  beforeEach(() => {
    storeData.clear();
  });

  it('seeds DEFAULT_APP_SETTINGS on first read', () => {
    const service = new SettingsService();
    expect(service.get()).toEqual(DEFAULT_APP_SETTINGS);
    // Defaults are also persisted so subsequent reads are stable.
    expect(storeData.get('app.settings')).toEqual(DEFAULT_APP_SETTINGS);
  });

  it('hydrates from existing store contents', () => {
    storeData.set('app.settings', {
      ...DEFAULT_APP_SETTINGS,
      appearance: { ...DEFAULT_APP_SETTINGS.appearance, theme: 'washi' },
    });
    const service = new SettingsService();
    expect(service.get().appearance.theme).toBe('washi');
  });

  it('backfills missing fields from defaults on hydration', () => {
    storeData.set('app.settings', { appearance: { theme: 'washi' } });
    const service = new SettingsService();
    const settings = service.get();
    expect(settings.appearance.theme).toBe('washi');
    // Other appearance keys filled from defaults.
    expect(settings.appearance.fontSize).toBe(DEFAULT_APP_SETTINGS.appearance.fontSize);
    expect(settings.reader).toEqual(DEFAULT_APP_SETTINGS.reader);
    expect(settings.library).toEqual(DEFAULT_APP_SETTINGS.library);
    // Backfilled defaults are persisted.
    expect((storeData.get('app.settings') as { reader: unknown }).reader).toEqual(
      DEFAULT_APP_SETTINGS.reader
    );
  });

  it('set deep-merges a partial patch and writes through', () => {
    const service = new SettingsService();

    const next = service.set({
      appearance: { theme: 'washi' },
      reader: { mode: 'webtoon' },
    });

    expect(next.appearance.theme).toBe('washi');
    expect(next.appearance.fontSize).toBe(DEFAULT_APP_SETTINGS.appearance.fontSize);
    expect(next.reader.mode).toBe('webtoon');
    expect(next.reader.direction).toBe(DEFAULT_APP_SETTINGS.reader.direction);

    // Persisted shape matches.
    const stored = storeData.get('app.settings') as typeof DEFAULT_APP_SETTINGS;
    expect(stored.appearance.theme).toBe('washi');
    expect(stored.reader.mode).toBe('webtoon');
  });

  it('reset restores defaults and writes through', () => {
    const service = new SettingsService();
    service.set({ appearance: { theme: 'washi' } });

    const restored = service.reset();
    expect(restored).toEqual(DEFAULT_APP_SETTINGS);
    expect(storeData.get('app.settings')).toEqual(DEFAULT_APP_SETTINGS);
  });

  it('get returns a fresh copy so callers cannot mutate cache', () => {
    const service = new SettingsService();
    const snapshot = service.get();
    snapshot.appearance.theme = 'washi';

    expect(service.get().appearance.theme).toBe('sumi');
  });
});
