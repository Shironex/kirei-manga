/** What the sidebar Kirei card knows when it picks a line. */
export interface KireiMood {
  /** True once the library has loaded; before that the card stays quiet. */
  libraryReady: boolean;
  seriesCount: number;
  scanning: boolean;
  /** Unread chapters added since the series were last read, summed over the library. */
  newChapters: number;
  /** Days in the current reading streak, 0 when there is none or it is not known yet. */
  streakDays: number;
}

/** A streak shorter than this is not worth a remark. */
export const MIN_STREAK_DAYS = 3;

export const KIREI_LINES = {
  empty: 'Add a folder and I will find your manga.',
  scanning: 'Looking through your folders now.',
  quiet: 'Your shelf is all set. Pick something to read.',
} as const;

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * The card's line, from state alone: no clock, no randomness, so the same
 * state always gives the same words. The first case that applies wins.
 */
export function kireiLine(mood: KireiMood): string {
  if (!mood.libraryReady) return KIREI_LINES.quiet;
  if (mood.seriesCount === 0 && !mood.scanning) return KIREI_LINES.empty;
  if (mood.scanning) return KIREI_LINES.scanning;
  if (mood.newChapters > 0) {
    return `${plural(mood.newChapters, 'new chapter is', 'new chapters are')} waiting for you.`;
  }
  if (mood.streakDays >= MIN_STREAK_DAYS) {
    return `${mood.streakDays} days of reading in a row. Lovely.`;
  }
  return KIREI_LINES.quiet;
}
