import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DEFAULT_APP_SETTINGS, type TranslationSettings } from '@kireimanga/shared';
import { useSettingsStore } from '@/stores/settings-store';
import { TranslationOverrideForm } from './TranslationOverrideForm';

function primeSettings(): void {
  // Hydrate the settings store so `useSettingsStore(s => s.settings?.translation)`
  // resolves to a real object (the form reads global defaults for placeholders).
  const seed = structuredClone(DEFAULT_APP_SETTINGS);
  seed.translation = {
    ...seed.translation,
    targetLang: 'en',
    overlayFont: 'Fraunces',
    overlayOpacity: 1,
    defaultProvider: 'deepl',
    autoTranslate: false,
  };
  useSettingsStore.setState({ settings: seed, loading: false, error: null });
}

describe('TranslationOverrideForm', () => {
  beforeEach(() => {
    primeSettings();
  });

  it('renders "Use global" toggle on and hides override fields when override is undefined', () => {
    render(<TranslationOverrideForm override={undefined} onChange={vi.fn()} />);

    const toggle = screen.getByRole('switch', { name: /use global settings/i });
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    expect(screen.queryByTestId('translation-override-fields')).toBeNull();
  });

  it('toggling "Use global" off calls onChange with an empty override object', () => {
    const onChange = vi.fn();
    render(<TranslationOverrideForm override={undefined} onChange={onChange} />);

    fireEvent.click(screen.getByRole('switch', { name: /use global settings/i }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({});
  });

  it('toggling "Use global" on (from an active override) calls onChange with undefined', () => {
    const onChange = vi.fn();
    const override: Partial<TranslationSettings> = { targetLang: 'pl' };
    render(<TranslationOverrideForm override={override} onChange={onChange} />);

    // The toggle starts unchecked (override is active). Click to re-enable global.
    const toggle = screen.getByRole('switch', { name: /use global settings/i });
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(toggle);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it('editing the target language merges the new value into the existing override', async () => {
    const onChange = vi.fn();
    const override: Partial<TranslationSettings> = { autoTranslate: true };
    render(<TranslationOverrideForm override={override} onChange={onChange} />);

    fireEvent.change(screen.getByTestId('translation-override-target-lang'), {
      target: { value: 'pl' },
    });

    // TextInput now debounces commits (~300ms) so a single keystroke
    // doesn't burst-fire `settings:set`. Wait for the timer to flush.
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith({ autoTranslate: true, targetLang: 'pl' });
    });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('changing the provider replaces only the defaultProvider key on the override', () => {
    const onChange = vi.fn();
    const override: Partial<TranslationSettings> = { targetLang: 'pl', defaultProvider: 'deepl' };
    render(<TranslationOverrideForm override={override} onChange={onChange} />);

    fireEvent.change(screen.getByTestId('translation-override-provider'), {
      target: { value: 'ollama' },
    });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ targetLang: 'pl', defaultProvider: 'ollama' });
  });
});
