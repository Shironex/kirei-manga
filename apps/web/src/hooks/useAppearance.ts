import { useEffect } from 'react';
import type { FontSize, ReadingFont, Theme } from '@kireimanga/shared';
import { useSettingsStore } from '@/stores/settings-store';

const FONT_SCALE: Record<FontSize, number> = {
  xs: 0.92,
  sm: 0.96,
  md: 1,
  lg: 1.06,
  xl: 1.12,
};

const READING_FONT: Record<ReadingFont, string> = {
  fraunces: 'var(--font-display)',
  mincho: 'var(--font-kanji)',
  serif: "ui-serif, Georgia, 'Times New Roman', serif",
  sans: 'var(--font-sans)',
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
  document.documentElement.style.setProperty(
    '--app-font-scale',
    String(FONT_SCALE[size] ?? 1)
  );
}

function applyReadingFont(font: ReadingFont): void {
  document.documentElement.style.setProperty(
    '--font-reading',
    READING_FONT[font] ?? READING_FONT.fraunces
  );
}

/**
 * Subscribes the document root to `settings.appearance` — applies the
 * data-theme attribute (washi → light), the `--app-font-scale` CSS variable
 * (drives body font-size), and `--font-reading` (the family used for any
 * narrative copy that opts in via that variable). Mount once at the App root.
 */
export function useAppearance(): void {
  const appearance = useSettingsStore(s => s.settings?.appearance);

  useEffect(() => {
    if (!appearance) return;
    applyTheme(appearance.theme);
    applyFontScale(appearance.fontSize);
    applyReadingFont(appearance.readingFont);
  }, [appearance]);
}
