import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { DEFAULT_APP_SETTINGS } from '@kireimanga/shared';
import { useSettingsStore } from '@/stores/settings-store';
import { TranslationStatusPill } from './TranslationStatusPill';

beforeEach(() => {
  // The pill uses `useT()` which reads `settings.language` from the
  // store — prime defaults so lookups resolve to the English dictionary.
  const seed = structuredClone(DEFAULT_APP_SETTINGS);
  useSettingsStore.setState({ settings: seed, loading: false, error: null });
});

afterEach(() => {
  useSettingsStore.setState({ settings: null, loading: false, error: null });
});

describe('TranslationStatusPill', () => {
  it('renders nothing when status is idle', () => {
    const { queryByTestId } = render(
      <TranslationStatusPill status="idle" pageNumber={4} />
    );
    expect(queryByTestId('translation-status-pill')).toBeNull();
  });

  it('renders nothing when status is ready (cached / completed pages stay quiet)', () => {
    const { queryByTestId } = render(
      <TranslationStatusPill status="ready" pageNumber={4} />
    );
    expect(queryByTestId('translation-status-pill')).toBeNull();
  });

  it('shows the spinner and page-number copy while loading', () => {
    const { getByTestId, getByText } = render(
      <TranslationStatusPill status="loading" pageNumber={7} />
    );

    const pill = getByTestId('translation-status-pill');
    expect(pill.getAttribute('data-status')).toBe('loading');
    expect(pill.getAttribute('role')).toBe('status');
    expect(pill.getAttribute('aria-live')).toBe('polite');

    // Spinner ring uses the splash motif (animate-spin + border-t-transparent).
    const spinner = pill.querySelector('span[aria-hidden]');
    expect(spinner).not.toBeNull();
    expect(spinner?.className).toContain('animate-spin');
    expect(spinner?.className).toContain('border-t-transparent');

    // Page number is interpolated into the editorial copy (1-based).
    expect(getByText('Translating page 7…')).toBeDefined();
  });

  it('renders the failure label and surfaces the error reason via title attribute', () => {
    const { getByTestId, getByText } = render(
      <TranslationStatusPill
        status="error"
        pageNumber={2}
        error="OCR sidecar offline"
      />
    );

    const pill = getByTestId('translation-status-pill');
    expect(pill.getAttribute('data-status')).toBe('error');
    expect(pill.getAttribute('title')).toBe('OCR sidecar offline');
    expect(getByText('Translation failed')).toBeDefined();
  });

  it('error state still renders without a reason', () => {
    const { getByTestId } = render(
      <TranslationStatusPill status="error" pageNumber={1} />
    );

    const pill = getByTestId('translation-status-pill');
    expect(pill.getAttribute('data-status')).toBe('error');
    // No `title` attribute when error is undefined — passing `undefined`
    // to React's `title` prop omits the attribute entirely.
    expect(pill.hasAttribute('title')).toBe(false);
  });
});
