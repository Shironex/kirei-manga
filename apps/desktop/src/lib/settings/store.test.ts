import { beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.fn();
let emit: ((event: { payload: unknown }) => void) | null = null;
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...args: unknown[]) => invoke(...args) }));
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async (_name: string, handler: (event: { payload: unknown }) => void) => {
    emit = handler;
    return () => {};
  }),
}));

const { DEFAULT_SETTINGS } = await import('./contract');
const { getSettingsState, resetSettingsStore, startSettings, updateSetting } =
  await import('./store');

function inTauri(on: boolean) {
  const win = globalThis as unknown as { window?: Record<string, unknown> };
  win.window = on ? { __TAURI_INTERNALS__: {} } : {};
}

describe('settings store', () => {
  beforeEach(() => {
    invoke.mockReset();
    emit = null;
    resetSettingsStore();
    inTauri(true);
  });

  it('starts from the defaults and loads the stored settings once', async () => {
    expect(getSettingsState().settings).toEqual(DEFAULT_SETTINGS);
    invoke.mockResolvedValueOnce({ ...DEFAULT_SETTINGS, 'reader.mode': 'webtoon' });
    await Promise.all([startSettings(), startSettings()]);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith('settings_get');
    expect(getSettingsState()).toMatchObject({ loaded: true, error: null });
    expect(getSettingsState().settings['reader.mode']).toBe('webtoon');
  });

  it('follows change events from other views and windows', async () => {
    invoke.mockResolvedValueOnce({ ...DEFAULT_SETTINGS });
    await startSettings();
    emit?.({ payload: { ...DEFAULT_SETTINGS, 'appearance.glass': false } });
    expect(getSettingsState().settings['appearance.glass']).toBe(false);
  });

  it('applies a write at once and keeps what Rust stored', async () => {
    let resolve: (value: unknown) => void = () => {};
    invoke.mockReturnValueOnce(new Promise(r => (resolve = r)));
    const done = updateSetting('appearance.strength', 'vivid');
    expect(getSettingsState().settings['appearance.strength']).toBe('vivid');
    expect(invoke).toHaveBeenCalledWith('settings_set', {
      key: 'appearance.strength',
      value: 'vivid',
    });
    resolve({ ...DEFAULT_SETTINGS, 'appearance.strength': 'vivid' });
    await done;
    expect(getSettingsState().settings['appearance.strength']).toBe('vivid');
  });

  it('rolls back a refused value and rejects with the reason', async () => {
    invoke.mockRejectedValueOnce('invalid value for `reader.fit`: unknown variant');
    await expect(updateSetting('reader.fit', 'width')).rejects.toThrow(/reader\.fit/);
    expect(getSettingsState().settings['reader.fit']).toBe('screen');
  });

  it('keeps an in-flight write over an event carrying the old value', async () => {
    invoke.mockResolvedValueOnce({ ...DEFAULT_SETTINGS });
    await startSettings();
    let resolve: (value: unknown) => void = () => {};
    invoke.mockReturnValueOnce(new Promise(r => (resolve = r)));
    const done = updateSetting('appearance.ambient', false);
    emit?.({ payload: { ...DEFAULT_SETTINGS, 'reader.direction': 'ltr' } });
    expect(getSettingsState().settings['appearance.ambient']).toBe(false);
    expect(getSettingsState().settings['reader.direction']).toBe('ltr');
    resolve({ ...DEFAULT_SETTINGS, 'appearance.ambient': false, 'reader.direction': 'ltr' });
    await done;
    expect(getSettingsState().settings['appearance.ambient']).toBe(false);
  });

  it('records why the stored settings could not be read', async () => {
    invoke.mockRejectedValueOnce('the library database is at schema 9');
    await startSettings();
    expect(getSettingsState()).toMatchObject({
      loaded: false,
      error: expect.stringMatching(/schema 9/),
    });
    expect(getSettingsState().settings).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps writes in memory outside Tauri', async () => {
    inTauri(false);
    await updateSetting('reader.direction', 'ltr');
    expect(invoke).not.toHaveBeenCalled();
    expect(getSettingsState().settings['reader.direction']).toBe('ltr');
  });
});
