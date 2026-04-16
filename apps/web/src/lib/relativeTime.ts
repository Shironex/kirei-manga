/**
 * Relative-time formatting helpers.
 *
 * Backed by `Intl.RelativeTimeFormat` so we get locale-aware output
 * ("6 lat temu" / "6 years ago" / "yesterday" / "wczoraj") without shipping
 * date-fns locale chunks. Formatters are cached per locale to avoid repeated
 * construction in render hot paths (ChapterList rows, LibraryList rows).
 *
 * The caller is expected to pass the active UI language from the settings
 * store; unknown locales degrade to 'en' rather than throwing.
 */

type Unit = Intl.RelativeTimeFormatUnit;

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

const formatterCache = new Map<string, Intl.RelativeTimeFormat>();

function getFormatter(locale: string): Intl.RelativeTimeFormat {
  const cached = formatterCache.get(locale);
  if (cached) return cached;
  let rtf: Intl.RelativeTimeFormat;
  try {
    rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  } catch {
    rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  }
  formatterCache.set(locale, rtf);
  return rtf;
}

function pickUnit(absMs: number): { value: number; unit: Unit } {
  if (absMs < MINUTE) return { value: Math.round(absMs / SECOND), unit: 'second' };
  if (absMs < HOUR) return { value: Math.round(absMs / MINUTE), unit: 'minute' };
  if (absMs < DAY) return { value: Math.round(absMs / HOUR), unit: 'hour' };
  if (absMs < WEEK) return { value: Math.round(absMs / DAY), unit: 'day' };
  if (absMs < MONTH) return { value: Math.round(absMs / WEEK), unit: 'week' };
  if (absMs < YEAR) return { value: Math.round(absMs / MONTH), unit: 'month' };
  return { value: Math.round(absMs / YEAR), unit: 'year' };
}

function toTimestamp(input: Date | number | string): number | null {
  if (input instanceof Date) {
    const t = input.getTime();
    return Number.isFinite(t) ? t : null;
  }
  if (typeof input === 'number') {
    return Number.isFinite(input) ? input : null;
  }
  const t = new Date(input).getTime();
  return Number.isFinite(t) ? t : null;
}

/**
 * Locale-aware "x ago" / "in x" formatter.
 *
 * Past times render with negative offsets ("6 years ago"), future times with
 * positive ("in 5 minutes"). Callers that only handle past times can ignore
 * the sign — `Intl.RelativeTimeFormat` handles the phrasing on its own.
 */
export function formatRelativeTime(input: Date | number | string, locale: string = 'en'): string {
  const ts = toTimestamp(input);
  if (ts === null) return '';
  const diffMs = ts - Date.now();
  const absMs = Math.abs(diffMs);
  const { value, unit } = pickUnit(absMs);
  const signed = diffMs < 0 ? -value : value;
  return getFormatter(locale).format(signed, unit);
}

/**
 * Legacy wrapper kept for callers that still pass ISO strings directly.
 * Defaults to English — pass `locale` when the active language is known.
 */
export function relativeFromIso(iso: string, locale: string = 'en'): string {
  return formatRelativeTime(iso, locale);
}
