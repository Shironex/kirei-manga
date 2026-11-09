/** The page's copy, in one place. */
import type { StopId } from '../tour/stops';

export interface TourCopy {
  id: Exclude<StopId, 'hero'>;
  label: string;
  title: string;
  line: string;
  points: string[];
}

export const HERO = {
  eyebrow: 'Manga reader for Windows and macOS',
  titleStart: 'Your manga,',
  titleAccent: 'beautifully kept.',
  lede: 'KireiManga reads the archives and folders you already have, straight from disk, and dresses every series in the colours of its own cover. I am building it from scratch in Tauri and Rust.',
};

export const TOUR: readonly TourCopy[] = [
  {
    id: 'reader',
    label: 'Reader',
    title: 'Reads the way the book was made.',
    line: 'Single pages, double spreads with spread detection, or one long strip for webtoons, left to right or right to left. Brightness, contrast, sharpen and the rest are remembered per title.',
    points: ['Single, double, webtoon', 'Right to left', 'Per title adjustments'],
  },
  {
    id: 'theme',
    label: 'Colour',
    title: 'Every cover sets the mood.',
    line: 'The app samples each cover and tints the whole interface from it, the way a lamp warms a desk. Lightness stays fixed per role, so text keeps its contrast while the colour changes. This page does the same as you scroll.',
    points: ['Sampled at scan time', 'Subtle, balanced, vivid', 'Off with one switch'],
  },
  {
    id: 'archives',
    label: 'Archives',
    title: 'Opens archives without unpacking them.',
    line: 'CBZ, ZIP, CBR and plain folders stream straight from disk. Nothing is extracted, and a Rust pipeline decodes the next pages at the size of your screen before you turn to them.',
    points: ['CBZ, ZIP, CBR, folders', 'Decode ahead', 'Bounded cache'],
  },
  {
    id: 'library',
    label: 'Library',
    title: 'A library that stays yours.',
    line: 'A SQLite library with a persistent cover cache that understands loose file names and ComicInfo.xml. No account and no scrapers. Run it portable from a folder, and back it up whenever you like.',
    points: ['Local files first', 'Portable mode', 'Backup and restore'],
  },
];
