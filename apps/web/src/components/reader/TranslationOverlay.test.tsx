import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import type { PageTranslation } from '@kireimanga/shared';
import { TranslationOverlay } from './TranslationOverlay';

// jsdom doesn't lay anything out — the FittedText useLayoutEffect runs but
// every measurement is `0`, which means it bails out (zero-sized container)
// without setting an inline font-size. That's fine; we're asserting on the
// overlay structure, not the binary search itself.

// jsdom ships ResizeObserver-less; install a no-op stub so the overlay's
// useEffect can `new ResizeObserver(...)` without crashing.
class MockResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
vi.stubGlobal('ResizeObserver', MockResizeObserver);

function makePage(
  bubbles: PageTranslation['bubbles'],
  pageHash = 'hash-test'
): PageTranslation {
  return { pageHash, bubbles };
}

function makeBubble(
  overrides: Partial<PageTranslation['bubbles'][number]> = {}
): PageTranslation['bubbles'][number] {
  return {
    box: { x: 10, y: 20, w: 100, h: 50 },
    original: 'こんにちは',
    translated: 'Hello',
    provider: 'deepl',
    targetLang: 'en',
    ...overrides,
  };
}

describe('TranslationOverlay — bubble rendering', () => {
  it('renders one BubbleBox per page.bubbles entry', () => {
    const page = makePage([
      makeBubble({ translated: 'One' }),
      makeBubble({ translated: 'Two' }),
      makeBubble({ translated: 'Three' }),
    ]);

    const { getAllByTestId, getByText } = render(
      <TranslationOverlay
        page={page}
        imageNaturalWidth={1000}
        imageNaturalHeight={1500}
      />
    );

    expect(getAllByTestId('translation-bubble')).toHaveLength(3);
    expect(getByText('One')).toBeDefined();
    expect(getByText('Two')).toBeDefined();
    expect(getByText('Three')).toBeDefined();
  });

  it('renders nothing when bubbles is empty', () => {
    const page = makePage([]);

    const { queryByTestId } = render(
      <TranslationOverlay
        page={page}
        imageNaturalWidth={1000}
        imageNaturalHeight={1500}
      />
    );

    expect(queryByTestId('translation-overlay')).toBeNull();
    expect(queryByTestId('translation-bubble')).toBeNull();
  });
});

describe('TranslationOverlay — coordinate scaling', () => {
  it('scales bubble coordinates by renderedWidth / imageNaturalWidth', () => {
    const page = makePage([
      makeBubble({
        box: { x: 100, y: 200, w: 80, h: 40 },
        translated: 'Scale me',
      }),
    ]);

    // Stub an image element whose rendered width is half its natural width.
    const img = document.createElement('img');
    img.getBoundingClientRect = (() => ({
      width: 500,
      height: 750,
      top: 0,
      left: 0,
      right: 500,
      bottom: 750,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    })) as HTMLElement['getBoundingClientRect'];

    const { getByTestId } = render(
      <TranslationOverlay
        page={page}
        imageNaturalWidth={1000}
        imageNaturalHeight={1500}
        imageElement={img}
      />
    );

    const bubble = getByTestId('translation-bubble') as HTMLDivElement;
    expect(bubble.style.left).toBe('50px');
    expect(bubble.style.top).toBe('100px');
    expect(bubble.style.width).toBe('40px');
    expect(bubble.style.height).toBe('20px');
  });

  it('falls back to 1:1 scale when no imageElement is supplied', () => {
    const page = makePage([
      makeBubble({ box: { x: 7, y: 11, w: 13, h: 17 }, translated: '1x' }),
    ]);

    const { getByTestId } = render(
      <TranslationOverlay
        page={page}
        imageNaturalWidth={1000}
        imageNaturalHeight={1500}
      />
    );

    const bubble = getByTestId('translation-bubble') as HTMLDivElement;
    expect(bubble.style.left).toBe('7px');
    expect(bubble.style.top).toBe('11px');
    expect(bubble.style.width).toBe('13px');
    expect(bubble.style.height).toBe('17px');
  });
});

describe('TranslationOverlay — opacity and font propagation', () => {
  it('passes a custom font through to BubbleBox FittedText', () => {
    const page = makePage([makeBubble({ translated: 'Font test' })]);

    const { getByText } = render(
      <TranslationOverlay
        page={page}
        imageNaturalWidth={500}
        imageNaturalHeight={700}
        font="'Shippori Mincho', serif"
      />
    );

    const span = getByText('Font test') as HTMLSpanElement;
    expect(span.style.fontFamily).toContain('Shippori Mincho');
  });

  it('applies opacity to the bubble background via color-mix', () => {
    const page = makePage([makeBubble({ translated: 'O' })]);

    const { getByTestId } = render(
      <TranslationOverlay
        page={page}
        imageNaturalWidth={500}
        imageNaturalHeight={700}
        opacity={0.5}
      />
    );

    const bubble = getByTestId('translation-bubble') as HTMLDivElement;
    expect(bubble.style.backgroundColor).toContain('color-mix');
    expect(bubble.style.backgroundColor).toContain('50%');
    expect(bubble.style.backgroundColor).toContain('var(--color-bone)');
  });

  it('clamps out-of-range opacity to [0, 1]', () => {
    const page = makePage([makeBubble({ translated: 'Clamp' })]);

    const { getByTestId, rerender } = render(
      <TranslationOverlay
        page={page}
        imageNaturalWidth={500}
        imageNaturalHeight={700}
        opacity={2}
      />
    );

    expect((getByTestId('translation-bubble') as HTMLDivElement).style.backgroundColor).toContain(
      '100%'
    );

    rerender(
      <TranslationOverlay
        page={page}
        imageNaturalWidth={500}
        imageNaturalHeight={700}
        opacity={-1}
      />
    );
    expect((getByTestId('translation-bubble') as HTMLDivElement).style.backgroundColor).toContain(
      '0%'
    );
  });
});
