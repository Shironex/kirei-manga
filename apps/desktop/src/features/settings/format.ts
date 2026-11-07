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
