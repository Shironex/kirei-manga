/**
 * Entry of the demo capture mode (`shots.html`). It draws the demo art, puts
 * the mock core in place of Rust, then starts the real app. Only `shots.html`
 * imports it, and the release build has `index.html` as its only input, so
 * none of this reaches a shipped bundle. See docs/screenshots.md.
 */
import '../index.css';

import { applyChrome } from '@/app/shell/platform';

import { loadArtFonts, renderCover, renderPage, renderStrip } from './art';
import { ALL_SERIES, LINES_EN, LOCAL, ONLINE, chapterPages } from './data';
import { installMockCore, pageOf } from './ipc';

/** The chapters the shots open, by series id: the number and how it is drawn. */
const READ = [
  { seriesId: 1, number: 42 },
  { seriesId: 3, number: 89 },
];

declare global {
  interface Window {
    /** Set once the demo app has rendered its first route. */
    __SHOTS_READY__?: boolean;
  }
}

async function boot(): Promise<void> {
  await loadArtFonts(ALL_SERIES.map(s => s.jp ?? '').join(''));

  const covers = new Map(
    await Promise.all(ALL_SERIES.map(async s => [s.key, await renderCover(s)] as const))
  );

  const pages = new Map(
    await Promise.all(
      READ.flatMap(({ seriesId, number }) => {
        const seed = LOCAL.find(s => s.id === seriesId);
        if (!seed) return [];
        return Array.from({ length: chapterPages(seriesId, number) }, async (_, i) => {
          const url = seed.webtoon
            ? await renderStrip(seed, number * 100 + i, LINES_EN)
            : await renderPage(seed, i + 1, LINES_EN);
          return [`${seriesId}:${i}` as string, url] as const;
        });
      })
    )
  );

  const onlineCover = new Map(ONLINE.map(s => [s.id, s.key]));
  const fallback = covers.get(LOCAL[0]?.key ?? '') ?? '';

  // A trailing '#' keeps the `?r=` the reader appends in the fragment, which
  // blob URLs ignore.
  installMockCore((path, scheme) => {
    if (scheme === 'kirei-cover') return `${covers.get(path) ?? fallback}#`;
    if (scheme === 'kirei-online') {
      const id = path.split('/')[1] ?? '';
      return `${covers.get(onlineCover.get(id) ?? '') ?? fallback}#`;
    }
    if (scheme === 'kirei-page') {
      const [sourceId, index] = path.split('/').map(Number);
      const source = pageOf(sourceId ?? -1);
      const url = source ? pages.get(`${source.seriesId}:${index}`) : undefined;
      return `${url ?? fallback}#`;
    }
    return `${fallback}#`;
  });

  await import('../main');
  // The demo shows the plain window chrome on every platform: no gap for
  // macOS traffic lights that a browser capture does not have.
  applyChrome('native');
  window.__SHOTS_READY__ = true;
}

void boot();
