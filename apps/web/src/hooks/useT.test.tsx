import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { DEFAULT_APP_SETTINGS, type AppSettings } from '@kireimanga/shared';

vi.mock('@/lib/socket', () => ({
  emitWithResponse: vi.fn(),
  getSocket: () => ({ on: vi.fn(), off: vi.fn() }),
}));

import { useSettingsStore } from '@/stores/settings-store';
import { useT } from './useT';

function primeLanguage(lang: AppSettings['language']): void {
  useSettingsStore.setState({
    settings: { ...structuredClone(DEFAULT_APP_SETTINGS), language: lang },
    loading: false,
    error: null,
  });
}

function Render({ k, vars }: { k: string; vars?: Record<string, string | number> }) {
  const t = useT();
  return <span data-testid="t">{t(k, vars)}</span>;
}

beforeEach(() => {
  useSettingsStore.setState({ settings: null, loading: false, error: null });
});

describe('useT — English plural rules', () => {
  it('uses _one for count=1', () => {
    primeLanguage('en');
    const { getByTestId } = render(
      <Render k="library.subtitle.count" vars={{ count: 1 }} />
    );
    expect(getByTestId('t').textContent).toBe('1 series');
  });

  it('uses _other for count=5', () => {
    primeLanguage('en');
    const { getByTestId } = render(
      <Render k="library.subtitle.count" vars={{ count: 5 }} />
    );
    expect(getByTestId('t').textContent).toBe('5 series');
  });

  it('resolves {name} placeholders', () => {
    primeLanguage('en');
    const { getByTestId } = render(
      <Render k="series.local.toast.newChaptersBody_one" vars={{ count: 1 }} />
    );
    expect(getByTestId('t').textContent).toBe('Found 1 new chapter.');
  });
});

describe('useT — Polish plural rules (one/few/many)', () => {
  it('picks _one for count=1', () => {
    primeLanguage('pl');
    const { getByTestId } = render(
      <Render k="library.subtitle.count" vars={{ count: 1 }} />
    );
    expect(getByTestId('t').textContent).toBe('1 seria');
  });

  it('picks _few for count=3 (CLDR "few" for Polish)', () => {
    primeLanguage('pl');
    const { getByTestId } = render(
      <Render k="library.subtitle.count" vars={{ count: 3 }} />
    );
    expect(getByTestId('t').textContent).toBe('3 serie');
  });

  it('picks _many for count=5 (CLDR "many" for Polish)', () => {
    primeLanguage('pl');
    const { getByTestId } = render(
      <Render k="library.subtitle.count" vars={{ count: 5 }} />
    );
    expect(getByTestId('t').textContent).toBe('5 serii');
  });

  it('picks _many for count=0 in Polish', () => {
    primeLanguage('pl');
    const { getByTestId } = render(
      <Render k="library.subtitle.count" vars={{ count: 0 }} />
    );
    expect(getByTestId('t').textContent).toBe('0 serii');
  });
});

describe('useT — fallback behaviour', () => {
  it('returns the key itself when the translation is missing', () => {
    primeLanguage('en');
    const { getByTestId } = render(<Render k="missing.key.nowhere" />);
    expect(getByTestId('t').textContent).toBe('missing.key.nowhere');
  });

  it('falls back to the base key when no pluralized variant matches', () => {
    primeLanguage('en');
    const { getByTestId } = render(
      <Render k="series.local.chapters.pageCount" vars={{ count: 42 }} />
    );
    expect(getByTestId('t').textContent).toBe('42 pp');
  });

  it('defaults to English when settings have not hydrated', () => {
    useSettingsStore.setState({ settings: null, loading: false, error: null });
    const { getByTestId } = render(
      <Render k="library.subtitle.count" vars={{ count: 1 }} />
    );
    expect(getByTestId('t').textContent).toBe('1 series');
  });
});
