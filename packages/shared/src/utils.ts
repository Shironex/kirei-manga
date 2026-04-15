/**
 * Shared Utilities
 */

/**
 * Extract a human-readable error message from an unknown error value.
 *
 * @param error - The caught error value (could be anything)
 * @param fallback - Fallback message when error is not an Error instance (default: stringifies the error)
 * @returns A string error message
 */
export function extractErrorMessage(error: unknown, fallback?: string): string {
  if (error instanceof Error) {
    return error.message;
  }
  return fallback ?? String(error);
}

/**
 * Convert a Date to a local ISO date string (YYYY-MM-DD).
 *
 * Uses local timezone (getFullYear/getMonth/getDate) rather than UTC.
 */
export function toLocalDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Get the Monday of the week for the given date (defaults to today).
 *
 * Returns a new Date set to midnight (00:00:00.000) on that Monday.
 * Handles Sunday correctly (JS getDay()=0 maps to the previous Monday).
 */
export function getWeekStart(date?: Date): Date {
  const d = date ? new Date(date) : new Date();
  const dow = d.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Truncate a string to a maximum length, appending an ellipsis if truncated.
 *
 * @param text - The string to truncate
 * @param max - Maximum allowed length (including ellipsis)
 * @param ellipsis - The ellipsis string to append (default: '...')
 */
export function truncate(text: string, max: number, ellipsis = '...'): string {
  if (max <= 0) return '';
  if (text.length <= max) return text;
  if (max <= ellipsis.length) return ellipsis.slice(0, max);
  return text.slice(0, max - ellipsis.length) + ellipsis;
}
