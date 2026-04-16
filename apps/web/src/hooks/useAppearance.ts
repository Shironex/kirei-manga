import { useEffect } from 'react';
import type { CardSize, FontSize, ReadingFont, Theme } from '@kireimanga/shared';
import { useSettingsStore } from '@/stores/settings-store';

const FONT_SCALE: Record<FontSize, number> = {
  xs: 0.92,
  sm: 0.96,
  md: 1,
  lg: 1.06,
  xl: 1.12,
};

const READING_FONT: Record<ReadingFont, string> = {
  fraunces: 'var(--font-fraunces)',
  mincho: 'var(--font-kanji)',
  serif: "ui-serif, Georgia, 'Times New Roman', serif",
  sans: 'var(--font-sans)',
};

/**
 * Desktop (`lg+`) column count per density step. Smaller number = bigger
 * cards. Mobile/tablet column counts stay fixed since the viewport width
 * already dictates them.
 */
const CARD_COLS_LG: Record<CardSize, number> = {
  compact: 6,
  cozy: 5,
  spacious: 4,
};

function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === 'washi') {
    root.dataset.theme = 'light';
  } else {
    delete root.dataset.theme;
  }
}

function applyFontScale(size: FontSize): void {
  document.documentElement.style.setProperty('--app-font-scale', String(FONT_SCALE[size] ?? 1));
}

function applyReadingFont(font: ReadingFont): void {
  document.documentElement.style.setProperty(
    '--font-reading',
    READING_FONT[font] ?? READING_FONT.fraunces
  );
}

function applyCardSize(size: CardSize): void {
  document.documentElement.style.setProperty(
    '--library-grid-cols-lg',
    String(CARD_COLS_LG[size] ?? CARD_COLS_LG.cozy)
  );
}

/**
 * Subscribes the document root to `settings.appearance`: applies the theme
 * attribute (washi → light), `--app-font-scale` (body `zoom`, scales the
 * whole UI uniformly — see globals.css), `--font-reading` (narrative
 * typography — `.font-display` resolves through it, so page mastheads /
 * series titles / banners pick up the user's choice), and
 * `--library-grid-cols-lg` (cover-grid density at lg+). Mount once at the
 * App root.
 */
export function useAppearance(): void {
  const appearance = useSettingsStore(s => s.settings?.appearance);

  useEffect(() => {
    if (!appearance) return;
    applyTheme(appearance.theme);
    applyFontScale(appearance.fontSize);
    applyReadingFont(appearance.readingFont);
    applyCardSize(appearance.cardSize);
  }, [appearance]);
}
