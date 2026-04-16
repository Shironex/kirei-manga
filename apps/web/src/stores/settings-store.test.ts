import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_APP_SETTINGS, type AppSettings, type DeepPartial } from '@kireimanga/shared';

const emitWithResponseMock =
  vi.fn<
    (event: string, payload: { settings?: DeepPartial<AppSettings> }) => Promise<unknown>
  >();

vi.mock('@/lib/socket', () => ({
  emitWithResponse: (event: string, payload: { settings?: DeepPartial<AppSettings> }) =>
    emitWithResponseMock(event, payload),
  getSocket: () => ({ on: vi.fn(), off: vi.fn() }),
}));

import { useSettingsStore } from './settings-store';

function primeStore(seed: AppSettings = structuredClone(DEFAULT_APP_SETTINGS)): void {
  useSettingsStore.setState({ settings: seed, loading: false, error: null });
}

beforeEach(() => {
  emitWithResponseMock.mockReset();
  primeStore();
});

describe('settings-store applyPatch (via set())', () => {
  it('patching a single appearance field preserves sibling fields', async () => {
    emitWithResponseMock.mockImplementation(async () => ({
      settings: useSettingsStore.getState().settings,
    }));

    await useSettingsStore.getState().set({ appearance: { theme: 'washi' } });

    const { appearance } = useSettingsStore.getState().settings!;
    expect(appearance.theme).toBe('washi');
    expect(appearance.fontSize).toBe(DEFAULT_APP_SETTINGS.appearance.fontSize);
    expect(appearance.readingFont).toBe(DEFAULT_APP_SETTINGS.appearance.readingFont);
    expect(appearance.cardSize).toBe(DEFAULT_APP_SETTINGS.appearance.cardSize);
  });

  it('patching a reader field preserves the other reader fields', async () => {
    emitWithResponseMock.mockImplementation(async () => ({
      settings: useSettingsStore.getState().settings,
    }));

    await useSettingsStore.getState().set({ reader: { mode: 'double' } });

    const { reader } = useSettingsStore.getState().settings!;
    expect(reader.mode).toBe('double');
    expect(reader.direction).toBe(DEFAULT_APP_SETTINGS.reader.direction);
    expect(reader.fit).toBe(DEFAULT_APP_SETTINGS.reader.fit);
    expect(reader.language).toBe(DEFAULT_APP_SETTINGS.reader.language);
  });

  it('overwrites library.localRoots as a whole array', async () => {
    emitWithResponseMock.mockImplementation(async () => ({
      settings: useSettingsStore.getState().settings,
    }));
    primeStore({
      ...structuredClone(DEFAULT_APP_SETTINGS),
      library: { defaultChapterLanguage: 'en', localRoots: ['C:/old'] },
    });

    await useSettingsStore
      .getState()
      .set({ library: { localRoots: ['C:/a', 'C:/b'] } });

    const { library } = useSettingsStore.getState().settings!;
    expect(library.localRoots).toEqual(['C:/a', 'C:/b']);
    expect(library.defaultChapterLanguage).toBe('en');
  });

  it('patching shortcuts merges with existing entries', async () => {
    emitWithResponseMock.mockImplementation(async () => ({
      settings: useSettingsStore.getState().settings,
    }));
    primeStore({
      ...structuredClone(DEFAULT_APP_SETTINGS),
      shortcuts: { next: 'ArrowRight' },
    });

    await useSettingsStore.getState().set({ shortcuts: { prev: 'ArrowLeft' } });

    const { shortcuts } = useSettingsStore.getState().settings!;
    expect(shortcuts).toEqual({ next: 'ArrowRight', prev: 'ArrowLeft' });
  });

  it('patching language overwrites the top-level field', async () => {
    emitWithResponseMock.mockImplementation(async () => ({
      settings: useSettingsStore.getState().settings,
    }));

    await useSettingsStore.getState().set({ language: 'pl' });
    expect(useSettingsStore.getState().settings!.language).toBe('pl');
  });

  it('onboarding patch preserves sibling fields', async () => {
    emitWithResponseMock.mockImplementation(async () => ({
      settings: useSettingsStore.getState().settings,
    }));

    await useSettingsStore.getState().set({ onboarding: { completed: true } });

    const { onboarding } = useSettingsStore.getState().settings!;
    expect(onboarding.completed).toBe(true);
    expect(onboarding.version).toBe(DEFAULT_APP_SETTINGS.onboarding.version);
    expect(onboarding.completedAt).toBe(DEFAULT_APP_SETTINGS.onboarding.completedAt);
  });

  it('an empty patch leaves settings structurally equivalent', async () => {
    emitWithResponseMock.mockImplementation(async () => ({
      settings: useSettingsStore.getState().settings,
    }));

    await useSettingsStore.getState().set({});
    expect(useSettingsStore.getState().settings).toEqual(DEFAULT_APP_SETTINGS);
  });

  it('rolls back to snapshot when the server rejects', async () => {
    const before = structuredClone(DEFAULT_APP_SETTINGS);
    primeStore(before);
    emitWithResponseMock.mockResolvedValueOnce({ error: 'boom' });

    await expect(
      useSettingsStore.getState().set({ appearance: { theme: 'washi' } })
    ).rejects.toThrow(/boom/);

    expect(useSettingsStore.getState().settings).toEqual(before);
    expect(useSettingsStore.getState().error).toBe('boom');
  });
});
