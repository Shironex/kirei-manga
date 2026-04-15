/**
 * Shared Formatters
 */

/**
 * Polish pluralization following correct grammatical rules.
 *
 * Rules:
 * - 1 -> singular (one)
 * - 2-4, 22-24, 32-34... (last digit 2-4, excluding teens 12-14) -> few
 * - Everything else (0, 5-21, 25-31...) -> many
 */
export function pluralize(count: number, one: string, few: string, many: string): string {
  if (count === 1) return `${count} ${one}`;
  const lastDigit = count % 10;
  const lastTwoDigits = count % 100;
  if (lastDigit >= 2 && lastDigit <= 4 && !(lastTwoDigits >= 12 && lastTwoDigits <= 14)) {
    return `${count} ${few}`;
  }
  return `${count} ${many}`;
}

/**
 * Format a date string to Polish locale.
 *
 * @param dateStr - Date string parseable by `new Date()` (e.g. "2024-01-15")
 * @param format - 'short' for abbreviated month ("15 sty 2024"), 'long' for full month ("15 stycznia 2024")
 */
export function formatDate(dateStr: string, format: 'short' | 'long' = 'long'): string {
  return new Date(dateStr).toLocaleDateString('pl-PL', {
    day: 'numeric',
    month: format,
    year: 'numeric',
  });
}
