import { languageName } from '@/features/library/format';
import type {
  Chapter,
  ContentRating,
  Health,
  LanguageOutcome,
  LocalizedText,
  Manga,
  OnlineError,
  ReadingStatus,
} from '@/lib/online';

/**
 * Pure helpers behind the online screens: titles in the reader's languages,
 * chapter labels and credits, the language outcome note, the network state
 * and the language chain editor. Kept free of React so they are unit tested.
 */

/** Languages offered in the pickers, most read on MangaDex first, Polish on top. */
export const COMMON_LANGUAGES = [
  'pl',
  'en',
  'es-la',
  'es',
  'pt-br',
  'fr',
  'de',
  'it',
  'ru',
  'uk',
  'id',
  'vi',
  'th',
  'tr',
  'ja',
  'ko',
  'zh',
  'zh-hk',
] as const;

/** "Polski (pl)" style name for a language code. */
export function languageLabel(code: string): string {
  const name = languageName(code) ?? code.toUpperCase();
  return name.toLowerCase() === code.toLowerCase() ? code.toUpperCase() : name;
}

/**
 * The best text for the reader's chain, as the Rust client picks it: each
 * language of the chain, then English, then a romanized title, then anything.
 */
export function bestText(text: LocalizedText, chain: readonly string[]): string | null {
  const usable = (value: string | undefined) => (value && value.trim() ? value : null);
  for (const code of [...chain, 'en']) {
    const found = usable(text[code]);
    if (found) return found;
  }
  for (const [code, value] of Object.entries(text)) {
    if (code.endsWith('-ro') && usable(value)) return value;
  }
  for (const value of Object.values(text)) {
    if (usable(value)) return value;
  }
  return null;
}

export function mangaTitle(manga: Pick<Manga, 'title' | 'altTitles'>, chain: readonly string[]) {
  return (
    bestText(manga.title, chain) ??
    manga.altTitles.map(alt => bestText(alt, chain)).find(Boolean) ??
    'Untitled'
  );
}

/** "Vol. 2 Ch. 12", "Ch. 12" or "Oneshot". */
export function chapterLabel(chapter: Pick<Chapter, 'volume' | 'chapter' | 'title'>): string {
  if (chapter.chapter) {
    return chapter.volume
      ? `Vol. ${chapter.volume} Ch. ${chapter.chapter}`
      : `Ch. ${chapter.chapter}`;
  }
  return chapter.title?.trim() ? chapter.title : 'Oneshot';
}

/** Who to credit for a chapter: its groups, or the uploader when it has none. */
export function creditLine(chapter: Pick<Chapter, 'groups' | 'uploader'>): string {
  if (chapter.groups.length > 0) return chapter.groups.map(group => group.name).join(' & ');
  if (chapter.uploader?.username) return `Uploaded by ${chapter.uploader.username}`;
  return 'No group credited';
}

export interface OutcomeNote {
  tone: 'calm' | 'info' | 'warn';
  text: string;
}

/**
 * What the series page says about the languages of its chapter list, so a
 * fallback is never silent.
 */
export function outcomeNote(
  outcome: LanguageOutcome,
  preferred: string,
  singleLanguage: string | null
): OutcomeNote {
  const name = languageLabel(preferred);
  if (singleLanguage) {
    return outcome.kind === 'nothing'
      ? { tone: 'warn', text: `No chapters in ${languageLabel(singleLanguage)} for this series.` }
      : { tone: 'calm', text: `Showing ${languageLabel(singleLanguage)} only.` };
  }
  switch (outcome.kind) {
    case 'preferred':
      return { tone: 'calm', text: `Every chapter is in ${name}.` };
    case 'mixed':
      return {
        tone: 'info',
        text: `${outcome.preferredCount} in ${name}, ${outcome.fallbackCount} filled from ${outcome.fallbackLanguages.map(languageLabel).join(', ')}.`,
      };
    case 'fallbackOnly':
      return {
        tone: 'warn',
        text: `No chapters in ${name} yet, showing ${outcome.languages.map(languageLabel).join(', ')}.`,
      };
    case 'nothing':
      return { tone: 'warn', text: `No chapters in your languages for this series.` };
  }
}

/** Seconds until a rate limit lifts, never below one. */
export function secondsUntil(until: number, now: number): number {
  return Math.max(1, Math.ceil((until - now) / 1000));
}

/** The banner for a network state; `null` when all is well. */
export function healthMessage(health: Health, now: number): string | null {
  switch (health.state) {
    case 'online':
      return null;
    case 'offline':
      return 'MangaDex cannot be reached. Followed series and the feed show what was saved.';
    case 'rateLimited':
      return `MangaDex asked us to slow down. Requests resume in ${secondsUntil(health.until, now)} s.`;
    case 'blocked':
      return 'MangaDex is refusing requests from this network for a while. Try again later.';
  }
}

/** A short, friendly line for a failed online action. */
export function errorText(error: OnlineError): string {
  switch (error.kind) {
    case 'offline':
      return 'MangaDex cannot be reached. Check your connection.';
    case 'rateLimited':
      return `MangaDex asked us to slow down. Try again in ${error.retryAfterSecs ?? 30} s.`;
    case 'blocked':
      return 'MangaDex is refusing requests from this network for a while.';
    case 'sessionExpired':
      return 'Your MangaDex session has expired. Sign in again in Settings.';
    case 'notSignedIn':
      return 'Sign in to MangaDex in Settings first.';
    default:
      return error.message;
  }
}

export const READING_STATUSES: { value: ReadingStatus; label: string }[] = [
  { value: 'reading', label: 'Reading' },
  { value: 'planToRead', label: 'Plan to read' },
  { value: 'onHold', label: 'On hold' },
  { value: 'reReading', label: 'Re-reading' },
  { value: 'completed', label: 'Completed' },
  { value: 'dropped', label: 'Dropped' },
];

/** The chain with `code` as the preferred language, the rest kept in order. */
export function withPreferred(chain: readonly string[], code: string): string[] {
  return [code, ...chain.filter(c => c !== code)];
}

/** The chain with a fallback added at the end or removed; the preferred one stays. */
export function toggleFallback(chain: readonly string[], code: string): string[] {
  if (chain[0] === code) return [...chain];
  return chain.includes(code) ? chain.filter(c => c !== code) : [...chain, code].slice(0, 6);
}

/** "5 min ago", "3 h ago", "2 d ago" or "just now". */
export function timeAgo(ms: number, now: number): string {
  const minutes = Math.floor((now - ms) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} d ago`;
}

/** Unix ms of a MangaDex timestamp, or null. */
export function parseTime(text: string | null): number | null {
  if (!text) return null;
  const ms = Date.parse(text);
  return Number.isNaN(ms) ? null : ms;
}

const RATING_ORDER: readonly ContentRating[] = ['safe', 'suggestive', 'erotica', 'pornographic'];

/** The ratings with one switched, in MangaDex order and never empty: the last one stays on. */
export function toggleRating(
  list: readonly ContentRating[],
  value: ContentRating
): ContentRating[] {
  if (list.includes(value)) return list.length > 1 ? list.filter(r => r !== value) : [...list];
  return RATING_ORDER.filter(r => r === value || list.includes(r));
}
