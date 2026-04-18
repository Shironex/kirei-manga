import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import {
  DEFAULT_APP_SETTINGS,
  type AppSettings,
  type PageTranslation,
  type TranslationRunPipelinePayload,
  type TranslationRunPipelineResponse,
} from '@kireimanga/shared';

const emitWithResponseMock =
  vi.fn<
    (event: string, payload: TranslationRunPipelinePayload) => Promise<TranslationRunPipelineResponse>
  >();

vi.mock('@/lib/socket', () => ({
  emitWithResponse: (event: string, payload: TranslationRunPipelinePayload) =>
    emitWithResponseMock(event, payload),
  getSocket: () => ({ on: vi.fn(), off: vi.fn() }),
}));

import { useSettingsStore } from '@/stores/settings-store';
import { useSocketStore } from '@/stores/socket-store';
import { useTranslationForPage } from './useTranslationForPage';

const URL_1 = 'kirei-page://mangadex/ch01/page-001.jpg';
const URL_2 = 'kirei-page://mangadex/ch01/page-002.jpg';
const URL_AUTO = 'kirei-page://mangadex/ch01/auto.jpg';
const URL_MANUAL = 'kirei-page://mangadex/ch01/manual.jpg';
const URL_ERR = 'kirei-page://mangadex/ch01/err.jpg';
const URL_THROW = 'kirei-page://mangadex/ch01/throw.jpg';

function primeSettings(translation: Partial<AppSettings['translation']> = {}): void {
  const seed = structuredClone(DEFAULT_APP_SETTINGS);
  seed.translation = { ...seed.translation, ...translation };
  useSettingsStore.setState({ settings: seed, loading: false, error: null });
}

function primeSocket(status: 'connected' | 'reconnecting' | 'failed' = 'connected'): void {
  useSocketStore.setState({ status, disconnectedAt: null });
}

function makePageTranslation(pageHash = 'hash-1'): PageTranslation {
  return {
    pageHash,
    bubbles: [
      {
        box: { x: 10, y: 20, w: 100, h: 50 },
        original: 'こんにちは',
        translated: 'Hello',
        provider: 'deepl',
        targetLang: 'en',
      },
    ],
  };
}

beforeEach(() => {
  emitWithResponseMock.mockReset();
  primeSocket('connected');
  primeSettings();
});

afterEach(() => {
  useSettingsStore.setState({ settings: null, loading: false, error: null });
});

describe('useTranslationForPage — autoTranslate gating', () => {
  it('stays idle and does not call run-pipeline when translation is disabled', async () => {
    primeSettings({ enabled: false, autoTranslate: true });

    const { result } = renderHook(() => useTranslationForPage({ pageUrl: URL_1 }));

    expect(result.current.status).toBe('idle');
    expect(result.current.page).toBeNull();
    expect(result.current.error).toBeNull();
    // Give any accidentally-scheduled promise a tick to flush.
    await Promise.resolve();
    expect(emitWithResponseMock).not.toHaveBeenCalled();
  });

  it('stays idle and does not fire when autoTranslate is off', async () => {
    primeSettings({ enabled: true, autoTranslate: false });

    const { result } = renderHook(() => useTranslationForPage({ pageUrl: URL_1 }));

    expect(result.current.status).toBe('idle');
    await Promise.resolve();
    expect(emitWithResponseMock).not.toHaveBeenCalled();
  });

  it('stays idle when pageUrl is null even with autoTranslate on', async () => {
    primeSettings({ enabled: true, autoTranslate: true });

    const { result } = renderHook(() => useTranslationForPage({ pageUrl: null }));

    expect(result.current.status).toBe('idle');
    await Promise.resolve();
    expect(emitWithResponseMock).not.toHaveBeenCalled();
  });
});

describe('useTranslationForPage — auto-firing pipeline', () => {
  it('fires translation:run-pipeline with pageUrl on mount when enabled + autoTranslate are on', async () => {
    primeSettings({ enabled: true, autoTranslate: true, targetLang: 'en', defaultProvider: 'deepl' });
    const expected = makePageTranslation('h-mount');
    emitWithResponseMock.mockResolvedValueOnce({ page: expected });

    const { result } = renderHook(() => useTranslationForPage({ pageUrl: URL_AUTO }));

    await waitFor(() => expect(result.current.status).toBe('ready'));

    expect(emitWithResponseMock).toHaveBeenCalledTimes(1);
    expect(emitWithResponseMock).toHaveBeenCalledWith('translation:run-pipeline', {
      pageUrl: URL_AUTO,
      targetLang: 'en',
      providerHint: 'deepl',
    });
    expect(result.current.page).toEqual(expected);
    expect(result.current.error).toBeNull();
  });

  it('honours targetLang and providerHint overrides over the user defaults', async () => {
    primeSettings({ enabled: true, autoTranslate: true, targetLang: 'en', defaultProvider: 'deepl' });
    emitWithResponseMock.mockResolvedValueOnce({ page: makePageTranslation() });

    renderHook(() =>
      useTranslationForPage({
        pageUrl: URL_1,
        targetLang: 'pl',
        providerHint: 'ollama',
      })
    );

    await waitFor(() => expect(emitWithResponseMock).toHaveBeenCalledTimes(1));
    expect(emitWithResponseMock).toHaveBeenCalledWith('translation:run-pipeline', {
      pageUrl: URL_1,
      targetLang: 'pl',
      providerHint: 'ollama',
    });
  });

  it('falls back to pageImagePath when no pageUrl is supplied (legacy / test path)', async () => {
    primeSettings({ enabled: true, autoTranslate: true, defaultProvider: 'deepl' });
    emitWithResponseMock.mockResolvedValueOnce({ page: makePageTranslation('h-path') });

    renderHook(() =>
      useTranslationForPage({ pageUrl: null, pageImagePath: 'C:/pages/legacy.jpg' })
    );

    await waitFor(() => expect(emitWithResponseMock).toHaveBeenCalledTimes(1));
    expect(emitWithResponseMock).toHaveBeenCalledWith('translation:run-pipeline', {
      pageImagePath: 'C:/pages/legacy.jpg',
      targetLang: 'en',
      providerHint: 'deepl',
    });
  });
});

describe('useTranslationForPage — manual runNow', () => {
  it('runNow fires the pipeline even when autoTranslate is off', async () => {
    primeSettings({ enabled: true, autoTranslate: false });
    const expected = makePageTranslation('h-manual');
    emitWithResponseMock.mockResolvedValueOnce({ page: expected });

    const { result } = renderHook(() => useTranslationForPage({ pageUrl: URL_MANUAL }));

    expect(result.current.status).toBe('idle');

    await act(async () => {
      await result.current.runNow();
    });

    expect(emitWithResponseMock).toHaveBeenCalledTimes(1);
    expect(emitWithResponseMock).toHaveBeenCalledWith('translation:run-pipeline', {
      pageUrl: URL_MANUAL,
      targetLang: 'en',
      providerHint: 'deepl',
    });
    expect(result.current.status).toBe('ready');
    expect(result.current.page).toEqual(expected);
  });

  it('runNow is a no-op when both pageUrl and pageImagePath are null', async () => {
    primeSettings({ enabled: true, autoTranslate: false });

    const { result } = renderHook(() =>
      useTranslationForPage({ pageUrl: null, pageImagePath: null })
    );

    await act(async () => {
      await result.current.runNow();
    });

    expect(emitWithResponseMock).not.toHaveBeenCalled();
    expect(result.current.status).toBe('idle');
  });
});

describe('useTranslationForPage — error propagation', () => {
  it('surfaces the response.error envelope as status="error"', async () => {
    primeSettings({ enabled: true, autoTranslate: true });
    emitWithResponseMock.mockResolvedValueOnce({
      page: { pageHash: '', bubbles: [] },
      error: 'sidecar-offline',
    });

    const { result } = renderHook(() => useTranslationForPage({ pageUrl: URL_ERR }));

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe('sidecar-offline');
    expect(result.current.page).toBeNull();
  });

  it('surfaces a thrown emit error as status="error"', async () => {
    primeSettings({ enabled: true, autoTranslate: true });
    emitWithResponseMock.mockRejectedValueOnce(new Error('socket timeout'));

    const { result } = renderHook(() => useTranslationForPage({ pageUrl: URL_THROW }));

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe('socket timeout');
    expect(result.current.page).toBeNull();
  });

  it('reports Disconnected without emitting when the socket is not connected', async () => {
    primeSettings({ enabled: true, autoTranslate: false });
    primeSocket('reconnecting');

    const { result } = renderHook(() => useTranslationForPage({ pageUrl: URL_1 }));

    await act(async () => {
      await result.current.runNow();
    });

    expect(emitWithResponseMock).not.toHaveBeenCalled();
    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('Disconnected');
  });
});

describe('useTranslationForPage — page-change reset', () => {
  it('resets state and re-fires the pipeline when pageUrl changes', async () => {
    primeSettings({ enabled: true, autoTranslate: true });
    const first = makePageTranslation('h-first');
    const second = makePageTranslation('h-second');
    emitWithResponseMock
      .mockResolvedValueOnce({ page: first })
      .mockResolvedValueOnce({ page: second });

    const { result, rerender } = renderHook(
      (props: { pageUrl: string | null }) => useTranslationForPage(props),
      { initialProps: { pageUrl: URL_1 } }
    );

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.page?.pageHash).toBe('h-first');

    rerender({ pageUrl: URL_2 });

    // Stale page data must clear on page change — no flash of the previous
    // bubble overlay. Status flips to 'loading' immediately because the new
    // pipeline call fires inside the same effect.
    expect(result.current.page).toBeNull();
    expect(result.current.status).toBe('loading');

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.page?.pageHash).toBe('h-second');
    expect(emitWithResponseMock).toHaveBeenCalledTimes(2);
    expect(emitWithResponseMock).toHaveBeenLastCalledWith('translation:run-pipeline', {
      pageUrl: URL_2,
      targetLang: 'en',
      providerHint: 'deepl',
    });
  });

  it('clears state to idle when pageUrl becomes null', async () => {
    primeSettings({ enabled: true, autoTranslate: true });
    emitWithResponseMock.mockResolvedValueOnce({ page: makePageTranslation('h-1') });

    const { result, rerender } = renderHook(
      (props: { pageUrl: string | null }) => useTranslationForPage(props),
      { initialProps: { pageUrl: URL_1 as string | null } }
    );

    await waitFor(() => expect(result.current.status).toBe('ready'));

    rerender({ pageUrl: null });
    expect(result.current.status).toBe('idle');
    expect(result.current.page).toBeNull();
    expect(result.current.error).toBeNull();
  });
});
