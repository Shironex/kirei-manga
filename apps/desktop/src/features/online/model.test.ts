import { describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
  convertFileSrc: (key: string, scheme: string) => `${scheme}://localhost/${key}`,
}));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn() }));

const {
  bestText,
  chapterLabel,
  creditLine,
  errorText,
  healthMessage,
  outcomeNote,
  timeAgo,
  toggleFallback,
  toggleRating,
  withPreferred,
} = await import('./model');
const { OnlineError, onlineCoverUrl, toOnlineError } = await import('@/lib/online');

describe('bestText', () => {
  it('follows the chain, then English, then a romanized title', () => {
    const chain = ['pl', 'en'];
    expect(bestText({ en: 'The Moon', pl: 'Księżyc' }, chain)).toBe('Księżyc');
    expect(bestText({ ja: '月', 'ja-ro': 'Tsuki' }, chain)).toBe('Tsuki');
    expect(bestText({ pl: '  ', en: 'The Moon' }, chain)).toBe('The Moon');
    expect(bestText({}, chain)).toBeNull();
  });
});

describe('chapter labels and credits', () => {
  it('labels numbered chapters and oneshots', () => {
    expect(chapterLabel({ volume: '2', chapter: '12', title: null })).toBe('Vol. 2 Ch. 12');
    expect(chapterLabel({ volume: null, chapter: '12.5', title: 'x' })).toBe('Ch. 12.5');
    expect(chapterLabel({ volume: null, chapter: null, title: null })).toBe('Oneshot');
  });

  it('credits every group, or the uploader when there is none', () => {
    const group = (name: string) => ({ id: name, name, website: null, official: false });
    expect(creditLine({ groups: [group('Nocne'), group('Moon')], uploader: null })).toBe(
      'Nocne & Moon'
    );
    expect(creditLine({ groups: [], uploader: { id: 'u', username: 'kasia' } })).toBe(
      'Uploaded by kasia'
    );
    expect(creditLine({ groups: [], uploader: null })).toBe('No group credited');
  });
});

describe('outcomeNote', () => {
  it('never hides a fallback', () => {
    expect(outcomeNote({ kind: 'preferred' }, 'pl', null).tone).toBe('calm');
    const mixed = outcomeNote(
      { kind: 'mixed', preferredCount: 3, fallbackCount: 9, fallbackLanguages: ['en'] },
      'pl',
      null
    );
    expect(mixed.tone).toBe('info');
    expect(mixed.text).toMatch(/^3 in .+, 9 filled from .+\.$/);
    expect(outcomeNote({ kind: 'fallbackOnly', languages: ['en'] }, 'pl', null).tone).toBe('warn');
    expect(outcomeNote({ kind: 'nothing' }, 'pl', null).text).toContain('No chapters');
  });

  it('describes the single language switch', () => {
    expect(outcomeNote({ kind: 'preferred' }, 'en', 'en').text).toMatch(/only\.$/);
    expect(outcomeNote({ kind: 'nothing' }, 'en', 'en').tone).toBe('warn');
  });
});

describe('network states', () => {
  it('says nothing while online and counts down a rate limit', () => {
    expect(healthMessage({ state: 'online' }, 0)).toBeNull();
    expect(healthMessage({ state: 'rateLimited', until: 30_500 }, 0)).toContain('31 s');
    expect(healthMessage({ state: 'offline' }, 0)).toContain('cannot be reached');
  });

  it('turns command rejections into typed errors', () => {
    const error = toOnlineError({ kind: 'rateLimited', message: 'slow', retryAfterSecs: 12 });
    expect(error).toBeInstanceOf(OnlineError);
    expect(errorText(error)).toContain('12 s');
    expect(toOnlineError(new Error('boom')).kind).toBe('other');
    expect(errorText(new OnlineError('sessionExpired', 'x'))).toContain('Sign in again');
  });
});

describe('language chain editing', () => {
  it('moves a language to the front', () => {
    expect(withPreferred(['pl', 'en'], 'en')).toEqual(['en', 'pl']);
    expect(withPreferred(['pl', 'en'], 'de')).toEqual(['de', 'pl', 'en']);
  });

  it('toggles fallbacks but keeps the preferred language', () => {
    expect(toggleFallback(['pl', 'en'], 'en')).toEqual(['pl']);
    expect(toggleFallback(['pl'], 'es')).toEqual(['pl', 'es']);
    expect(toggleFallback(['pl', 'en'], 'pl')).toEqual(['pl', 'en']);
    expect(toggleFallback(['a', 'b', 'c', 'd', 'e', 'f'], 'g')).toHaveLength(6);
  });
});

describe('helpers', () => {
  it('formats elapsed time', () => {
    expect(timeAgo(0, 30_000)).toBe('just now');
    expect(timeAgo(0, 5 * 60_000)).toBe('5 min ago');
    expect(timeAgo(0, 3 * 3_600_000)).toBe('3 h ago');
    expect(timeAgo(0, 50 * 3_600_000)).toBe('2 d ago');
  });

  it('builds cover URLs on the kirei-online scheme, never MangaDex', () => {
    const url = onlineCoverUrl({
      id: 'm1',
      cover: { id: 'c', fileName: 'a.jpg', volume: null, locale: null },
    });
    expect(url).toBe('kirei-online://localhost/cover/m1/a.jpg/256');
    expect(onlineCoverUrl({ id: 'm1', cover: null })).toBeNull();
  });
});

describe('toggleRating', () => {
  it('keeps MangaDex order and never empties the list', () => {
    expect(toggleRating(['suggestive'], 'safe')).toEqual(['safe', 'suggestive']);
    expect(toggleRating(['safe', 'suggestive'], 'safe')).toEqual(['suggestive']);
    expect(toggleRating(['safe'], 'safe')).toEqual(['safe']);
  });
});
