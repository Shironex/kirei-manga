import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { DEFAULT_APP_SETTINGS } from '@kireimanga/shared';
import { useSettingsStore } from '@/stores/settings-store';
import { TranslationErrorBanner, prettifyError } from './TranslationErrorBanner';

beforeEach(() => {
  // The banner uses `useT()` which reads `settings.language` from the
  // store — prime defaults so lookups resolve to the English dictionary.
  const seed = structuredClone(DEFAULT_APP_SETTINGS);
  useSettingsStore.setState({ settings: seed, loading: false, error: null });
});

afterEach(() => {
  useSettingsStore.setState({ settings: null, loading: false, error: null });
});

describe('TranslationErrorBanner', () => {
  it('renders nothing when error is null', () => {
    const { queryByTestId } = render(
      <TranslationErrorBanner error={null} onRetry={() => {}} onDismiss={() => {}} />
    );
    expect(queryByTestId('translation-error-banner')).toBeNull();
  });

  it('renders the banner with the prettified message and preserves the raw error in title', () => {
    const { getByTestId, getByText } = render(
      <TranslationErrorBanner
        error="sidecar exited with code 1"
        onRetry={() => {}}
        onDismiss={() => {}}
      />
    );

    const banner = getByTestId('translation-error-banner');
    expect(banner.getAttribute('role')).toBe('alert');
    expect(banner.getAttribute('aria-live')).toBe('polite');
    // Raw error stays accessible via the title for debugging / bug reports.
    expect(banner.getAttribute('title')).toBe('sidecar exited with code 1');

    expect(getByText('Translation unavailable.')).toBeDefined();
    expect(getByText('OCR sidecar offline.')).toBeDefined();
  });

  it('renders raw error verbatim when no pattern matches', () => {
    const { getByText } = render(
      <TranslationErrorBanner
        error="something completely unexpected happened"
        onRetry={() => {}}
        onDismiss={() => {}}
      />
    );

    expect(getByText('something completely unexpected happened')).toBeDefined();
  });

  it('clicking Retry invokes onRetry exactly once', () => {
    const onRetry = vi.fn();
    const onDismiss = vi.fn();
    const { getByTestId } = render(
      <TranslationErrorBanner
        error="no healthy provider"
        onRetry={onRetry}
        onDismiss={onDismiss}
      />
    );

    fireEvent.click(getByTestId('translation-error-banner-retry'));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('clicking Dismiss invokes onDismiss exactly once', () => {
    const onRetry = vi.fn();
    const onDismiss = vi.fn();
    const { getByTestId } = render(
      <TranslationErrorBanner
        error="no-api-key"
        onRetry={onRetry}
        onDismiss={onDismiss}
      />
    );

    fireEvent.click(getByTestId('translation-error-banner-dismiss'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onRetry).not.toHaveBeenCalled();
  });

  it('Dismiss button exposes a localized aria-label', () => {
    const { getByTestId } = render(
      <TranslationErrorBanner
        error="no-api-key"
        onRetry={() => {}}
        onDismiss={() => {}}
      />
    );

    const dismiss = getByTestId('translation-error-banner-dismiss');
    expect(dismiss.getAttribute('aria-label')).toBe('Dismiss');
  });
});

describe('prettifyError', () => {
  // Identity translator — tests assert against the dictionary keys directly
  // so the mapping is provable without coupling to the EN copy.
  const identity = (key: string) => key;

  const cases: Array<[string, string]> = [
    [
      'Error: no native build was found for platform=win32',
      'reader.translation.error.noNativeAddon',
    ],
    ['no native build', 'reader.translation.error.noNativeAddon'],
    ['sidecar exited with code 9', 'reader.translation.error.sidecarOffline'],
    ['OCR sidecar unhealthy', 'reader.translation.error.sidecarOffline'],
    ['ocr sidecar offline', 'reader.translation.error.sidecarOffline'],
    ['provider deepl: no-api-key', 'reader.translation.error.noApiKey'],
    ['No API key configured', 'reader.translation.error.noApiKey'],
    ['no healthy provider', 'reader.translation.error.noHealthyProvider'],
    ['Disconnected', 'reader.translation.error.disconnected'],
  ];

  for (const [raw, expectedKey] of cases) {
    it(`maps "${raw}" → ${expectedKey}`, () => {
      expect(prettifyError(raw, identity)).toBe(expectedKey);
    });
  }

  it('passes through the raw error when no pattern matches', () => {
    expect(prettifyError('boom: whatever', identity)).toBe('boom: whatever');
  });

  it('matching is case-insensitive', () => {
    expect(prettifyError('SIDECAR EXITED', identity)).toBe(
      'reader.translation.error.sidecarOffline'
    );
  });
});
