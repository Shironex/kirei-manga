import { formatBytes } from '@/lib/reader';

const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

/** `2 minutes ago`, `yesterday`, `just now`. */
export function formatAgo(timestampMs: number, now = Date.now()): string {
  const seconds = Math.round((timestampMs - now) / 1000);
  if (Math.abs(seconds) < 45) return 'just now';
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [
    ['minute', 60],
    ['hour', 3600],
    ['day', 86_400],
    ['week', 604_800],
    ['month', 2_592_000],
    ['year', 31_536_000],
  ];
  let [unit, size]: [Intl.RelativeTimeFormatUnit, number] = ['minute', 60];
  for (const step of steps) if (Math.abs(seconds) >= step[1]) [unit, size] = step;
  return relative.format(Math.round(seconds / size), unit);
}

/** `1 series`, `3 series`; `1 file`, `2 files`. */
export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count.toLocaleString('en')} ${count === 1 ? one : many}`;
}

/** `3 entries`: what a count of rows says about itself, for the cleanup rows. */
export function describeOrphans({ progress, settings }: { progress: number; settings: number }) {
  const parts: string[] = [];
  if (progress > 0) parts.push(plural(progress, 'progress entry', 'progress entries'));
  if (settings > 0) parts.push(plural(settings, 'series setting'));
  return parts.join(' and ');
}

/** The notice after a purge: what was deleted, from the counts the purge returned. */
export function describePurge(purge: { progress: number; settings: number }): string {
  const what = describeOrphans(purge);
  return what ? `Deleted ${what}.` : 'There was no hidden progress to clean up.';
}

/** The help line of the Reading stats row, from the stored session count. */
export function describeSessions(count: number | null): string {
  if (count === null) return 'Reading time, streaks and the year in review, kept on this computer.';
  if (count === 0) return 'No reading sessions stored. They build up as you read.';
  return `${plural(count, 'reading session')} behind the stats page and the year in review, kept on this computer.`;
}

/** The notice after clearing the stats. */
export function describeClearedSessions(count: number): string {
  return count === 0
    ? 'There were no reading sessions to clear.'
    : `Cleared ${plural(count, 'reading session')}. The stats start over from your next chapter.`;
}

/** The notice after pruning thumbnails: how many went and the space freed. */
export function describePrune({ bytes, files }: { bytes: number; files: number }): string {
  if (files === 0) return 'Every cover thumbnail is in use, nothing to remove.';
  return `Removed ${plural(files, 'unused thumbnail')} and freed ${formatBytes(bytes)}.`;
}
