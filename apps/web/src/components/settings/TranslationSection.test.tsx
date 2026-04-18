import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, waitFor } from '@testing-library/react';
import {
  DEFAULT_APP_SETTINGS,
  type AppSettings,
  type TranslationProviderStatusResponse,
} from '@kireimanga/shared';

const emitWithResponseMock = vi.fn();

vi.mock('@/lib/socket', () => ({
  emitWithResponse: (event: string, payload: unknown) => emitWithResponseMock(event, payload),
  getSocket: () => ({ on: vi.fn(), off: vi.fn() }),
}));

import { useSettingsStore } from '@/stores/settings-store';
import { useSocketStore } from '@/stores/socket-store';
import { TranslationSection } from './TranslationSection';

function primeSettings(translation: Partial<AppSettings['translation']> = {}): void {
  const seed = structuredClone(DEFAULT_APP_SETTINGS);
  seed.translation = {
    ...seed.translation,
    ...translation,
    providerKeys: { ...seed.translation.providerKeys, ...(translation.providerKeys ?? {}) },
  };
  useSettingsStore.setState({ settings: seed, loading: false, error: null });
}

function primeSocket(status: 'connected' | 'reconnecting' | 'failed' = 'connected'): void {
  useSocketStore.setState({ status, disconnectedAt: null });
}

function makeStatusResponse(
  overrides: Partial<TranslationProviderStatusResponse> = {}
): TranslationProviderStatusResponse {
  return {
    providers: [
      { id: 'deepl', ok: true },
      { id: 'google', ok: false, reason: 'no-api-key' },
      { id: 'ollama', ok: false, reason: 'connection refused' },
    ],
    pipeline: {
      bubbleDetector: { healthy: true },
      ocrSidecar: { state: 'ready', modelLoaded: true },
    },
    ...overrides,
  };
}

beforeEach(() => {
  emitWithResponseMock.mockReset();
  // Default the IPC mock to a "never resolves" promise so the auto-fetch on
  // mount doesn't race the test's own assertions. Individual tests override
  // when they care about the response.
  emitWithResponseMock.mockReturnValue(new Promise(() => {}));
  primeSocket('connected');
  primeSettings();
});

afterEach(() => {
  useSettingsStore.setState({ settings: null, loading: false, error: null });
});

describe('TranslationSection — rendering', () => {
  it('renders all settings fields when translation settings are loaded', () => {
    primeSettings({ enabled: true });

    const { getByLabelText, getByTestId } = render(<TranslationSection />);

    // Toggles + selects + free-text fields + slider all present.
    expect(getByLabelText('Enabled')).toBeDefined();
    expect(getByLabelText('Auto-translate on page open')).toBeDefined();
    expect(getByTestId('translation-default-provider')).toBeDefined();
    expect(getByTestId('translation-target-lang')).toBeDefined();
    expect(getByTestId('translation-overlay-font')).toBeDefined();
    expect(getByTestId('translation-overlay-opacity')).toBeDefined();
    expect(getByTestId('translation-key-deepl')).toBeDefined();
    expect(getByTestId('translation-key-google')).toBeDefined();
    expect(getByTestId('translation-key-ollama')).toBeDefined();
    expect(getByTestId('translation-key-ollama-model')).toBeDefined();
    expect(getByTestId('translation-status-test')).toBeDefined();
  });

  it('renders nothing while settings are still hydrating', () => {
    useSettingsStore.setState({ settings: null, loading: true, error: null });
    const { container } = render(<TranslationSection />);
    expect(container.firstChild).toBeNull();
  });
});

describe('TranslationSection — enabled gating', () => {
  it('mutes downstream fields when enabled is false', () => {
    primeSettings({ enabled: false });

    const { getByTestId } = render(<TranslationSection />);

    const fieldset = getByTestId('translation-fieldset') as HTMLDivElement;
    expect(fieldset.getAttribute('data-disabled')).toBe('true');
    expect(fieldset.getAttribute('aria-disabled')).toBe('true');

    expect((getByTestId('translation-default-provider') as HTMLSelectElement).disabled).toBe(true);
    expect((getByTestId('translation-target-lang') as HTMLInputElement).disabled).toBe(true);
    expect((getByTestId('translation-overlay-font') as HTMLInputElement).disabled).toBe(true);
    expect((getByTestId('translation-overlay-opacity') as HTMLInputElement).disabled).toBe(true);
    expect((getByTestId('translation-key-deepl') as HTMLInputElement).disabled).toBe(true);
    expect((getByTestId('translation-key-google') as HTMLInputElement).disabled).toBe(true);
    expect((getByTestId('translation-key-ollama') as HTMLInputElement).disabled).toBe(true);
    expect((getByTestId('translation-key-ollama-model') as HTMLInputElement).disabled).toBe(true);
    expect((getByTestId('translation-status-test') as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows the per-series override hint when global is disabled (Slice H.3)', () => {
    primeSettings({ enabled: false });

    const { getByTestId } = render(<TranslationSection />);

    expect(getByTestId('translation-disabled-override-hint')).toBeDefined();
  });

  it('un-mutes downstream fields when enabled is true', () => {
    primeSettings({ enabled: true });

    const { getByTestId, queryByTestId } = render(<TranslationSection />);

    const fieldset = getByTestId('translation-fieldset') as HTMLDivElement;
    expect(fieldset.getAttribute('data-disabled')).toBe('false');
    expect((getByTestId('translation-default-provider') as HTMLSelectElement).disabled).toBe(false);
    // Override hint is hidden when global is enabled — it's only useful as a
    // discovery aid in the disabled state.
    expect(queryByTestId('translation-disabled-override-hint')).toBeNull();
  });
});

describe('TranslationSection — persistence', () => {
  it('toggling enabled fires settingsStore.set with the patched value', async () => {
    primeSettings({ enabled: false });

    const setSpy = vi.spyOn(useSettingsStore.getState(), 'set').mockResolvedValue(undefined);

    const { getByLabelText } = render(<TranslationSection />);

    await act(async () => {
      fireEvent.click(getByLabelText('Enabled'));
    });

    expect(setSpy).toHaveBeenCalledWith({ translation: { enabled: true } });
  });

  it('typing in the DeepL key field persists via providerKeys.deepl', async () => {
    primeSettings({ enabled: true });

    const setSpy = vi.spyOn(useSettingsStore.getState(), 'set').mockResolvedValue(undefined);

    const { getByTestId } = render(<TranslationSection />);

    const input = getByTestId('translation-key-deepl') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { value: 'sk-deepl-test-token' } });
    });

    expect(setSpy).toHaveBeenCalledWith({
      translation: { providerKeys: { deepl: 'sk-deepl-test-token' } },
    });
  });

  it('Ollama model field renders the seeded default and persists on change (Slice J.2)', async () => {
    primeSettings({ enabled: true });

    const setSpy = vi.spyOn(useSettingsStore.getState(), 'set').mockResolvedValue(undefined);

    const { getByTestId } = render(<TranslationSection />);

    // Default seeded by DEFAULT_APP_SETTINGS (J.1) — `qwen2:7b` is visible up
    // front so the user knows what the provider will hit on first translation.
    const input = getByTestId('translation-key-ollama-model') as HTMLInputElement;
    expect(input.value).toBe('qwen2:7b');

    await act(async () => {
      fireEvent.change(input, { target: { value: 'aya' } });
    });

    expect(setSpy).toHaveBeenCalledWith({
      translation: { providerKeys: { ollamaModel: 'aya' } },
    });
  });

  it('clearing the Ollama model field persists `undefined` so the provider falls back (Slice J.2)', async () => {
    primeSettings({ enabled: true, providerKeys: { ollamaModel: 'aya' } });

    const setSpy = vi.spyOn(useSettingsStore.getState(), 'set').mockResolvedValue(undefined);

    const { getByTestId } = render(<TranslationSection />);

    const input = getByTestId('translation-key-ollama-model') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { value: '   ' } });
    });

    expect(setSpy).toHaveBeenCalledWith({
      translation: { providerKeys: { ollamaModel: undefined } },
    });
  });

  it('clearing the DeepL key field persists `undefined` so the provider is wiped', async () => {
    primeSettings({ enabled: true, providerKeys: { deepl: 'previous-key' } });

    const setSpy = vi.spyOn(useSettingsStore.getState(), 'set').mockResolvedValue(undefined);

    const { getByTestId } = render(<TranslationSection />);

    const input = getByTestId('translation-key-deepl') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { value: '' } });
    });

    expect(setSpy).toHaveBeenCalledWith({
      translation: { providerKeys: { deepl: undefined } },
    });
  });
});

describe('TranslationSection — provider status IPC', () => {
  it('Test button calls the translation:provider-status IPC channel', async () => {
    primeSettings({ enabled: true });
    // Override the default never-resolving mock with a valid response so the
    // initial auto-fetch settles before we click Test.
    emitWithResponseMock.mockResolvedValue(makeStatusResponse());

    const { getByTestId } = render(<TranslationSection />);

    // Wait for the auto-fetch on mount to land first.
    await waitFor(() => {
      expect(emitWithResponseMock).toHaveBeenCalledWith('translation:provider-status', {});
    });
    const initialCalls = emitWithResponseMock.mock.calls.length;

    await act(async () => {
      fireEvent.click(getByTestId('translation-status-test'));
    });

    expect(emitWithResponseMock.mock.calls.length).toBeGreaterThan(initialCalls);
    expect(emitWithResponseMock).toHaveBeenLastCalledWith('translation:provider-status', {});
  });

  it('reflects the mocked provider status in the pills', async () => {
    primeSettings({ enabled: true });
    emitWithResponseMock.mockResolvedValue(makeStatusResponse());

    const { getByTestId, queryByTestId } = render(<TranslationSection />);

    await waitFor(() => {
      // DeepL → ok pill, Google + Ollama → bad pills.
      const deeplRow = getByTestId('provider-status-row-deepl');
      const googleRow = getByTestId('provider-status-row-google');
      const ollamaRow = getByTestId('provider-status-row-ollama');
      expect(deeplRow.querySelector('[data-testid="status-pill-ok"]')).not.toBeNull();
      expect(googleRow.querySelector('[data-testid="status-pill-bad"]')).not.toBeNull();
      expect(ollamaRow.querySelector('[data-testid="status-pill-bad"]')).not.toBeNull();
    });

    // Reasons surface for the bad providers, not the healthy one.
    expect(getByTestId('provider-status-reason-google').textContent).toBe('no-api-key');
    expect(getByTestId('provider-status-reason-ollama').textContent).toBe('connection refused');
    expect(queryByTestId('provider-status-reason-deepl')).toBeNull();

    // Pipeline rows reflect the bubbleDetector + ocrSidecar payload.
    const detectorRow = getByTestId('pipeline-status-bubble-detector');
    const sidecarRow = getByTestId('pipeline-status-ocr-sidecar');
    expect(detectorRow.querySelector('[data-testid="status-pill-ok"]')).not.toBeNull();
    expect(sidecarRow.querySelector('[data-testid="status-pill-ok"]')).not.toBeNull();
  });

  it('hides the Tesseract fallback row when ocrFallback is absent (Slice K.3)', async () => {
    primeSettings({ enabled: true });
    emitWithResponseMock.mockResolvedValue(makeStatusResponse());

    const { getByTestId, queryByTestId } = render(<TranslationSection />);

    await waitFor(() => {
      expect(getByTestId('pipeline-status-ocr-sidecar')).toBeDefined();
    });
    // Older desktop builds omit the field; we mustn't surface a fallback row
    // out of nothing.
    expect(queryByTestId('pipeline-status-ocr-fallback')).toBeNull();
  });

  it('marks the Tesseract fallback Active when sidecar is down (Slice K.3)', async () => {
    primeSettings({ enabled: true });
    emitWithResponseMock.mockResolvedValue(
      makeStatusResponse({
        pipeline: {
          bubbleDetector: { healthy: true },
          ocrSidecar: { state: 'crashed', reason: 'sidecar exited' },
          ocrFallback: { name: 'tesseract', healthy: true },
        },
      })
    );

    const { getByTestId } = render(<TranslationSection />);

    await waitFor(() => {
      const row = getByTestId('pipeline-status-ocr-fallback');
      expect(row.querySelector('[data-testid="status-pill-ok"]')).not.toBeNull();
      expect(row.textContent).toContain('Active');
    });
  });

  it('marks the Tesseract fallback Standby when the sidecar is healthy (Slice K.3)', async () => {
    primeSettings({ enabled: true });
    emitWithResponseMock.mockResolvedValue(
      makeStatusResponse({
        pipeline: {
          bubbleDetector: { healthy: true },
          ocrSidecar: { state: 'ready', modelLoaded: true },
          ocrFallback: { name: 'tesseract', healthy: true },
        },
      })
    );

    const { getByTestId } = render(<TranslationSection />);

    await waitFor(() => {
      const row = getByTestId('pipeline-status-ocr-fallback');
      expect(row.querySelector('[data-testid="status-pill-unknown"]')).not.toBeNull();
      expect(row.textContent).toContain('Standby');
    });
  });

  it('marks the Tesseract fallback Unavailable + surfaces the reason (Slice K.3)', async () => {
    primeSettings({ enabled: true });
    emitWithResponseMock.mockResolvedValue(
      makeStatusResponse({
        pipeline: {
          bubbleDetector: { healthy: true },
          ocrSidecar: { state: 'crashed' },
          ocrFallback: { name: 'tesseract', healthy: false, reason: 'jpn traineddata missing' },
        },
      })
    );

    const { getByTestId } = render(<TranslationSection />);

    await waitFor(() => {
      const row = getByTestId('pipeline-status-ocr-fallback');
      expect(row.querySelector('[data-testid="status-pill-bad"]')).not.toBeNull();
    });
    expect(getByTestId('pipeline-status-ocr-fallback-reason').textContent).toBe(
      'jpn traineddata missing'
    );
  });

  it('renders the OCR sidecar download button when state=not-downloaded', async () => {
    primeSettings({ enabled: true });
    emitWithResponseMock.mockResolvedValue(
      makeStatusResponse({
        pipeline: {
          bubbleDetector: { healthy: true },
          ocrSidecar: { state: 'not-downloaded' },
        },
      })
    );

    const { getByTestId } = render(<TranslationSection />);

    await waitFor(() => {
      expect(getByTestId('sidecar-download-button')).toBeDefined();
    });
  });
});
