/**
 * Stable numeric-aware comparator used to put `page_1.jpg`, `page_2.jpg`,
 * `page_10.jpg` in reading order (instead of the 1/10/2 lexicographic order
 * a plain `String#localeCompare` returns). Uses `Intl.Collator` with the
 * `numeric` option — portable, no dependency, same behavior on Windows and
 * macOS. `sensitivity: 'base'` so `PAGE_01.JPG` and `page_01.jpg` collate
 * together when archives mix case.
 */
const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

export function naturalPageSort(a: string, b: string): number {
  return collator.compare(a, b);
}
