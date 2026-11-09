import { foldText } from '@/features/library/shelf';

/**
 * A small fuzzy scorer for the command palette. The query is split into
 * words and every word must match. A word that appears as a run of letters
 * beats one that is only spread over the text in order, a hit at the start
 * of the text or of a word beats one in the middle, and a shorter text beats
 * a longer one. Both sides are folded first (see `foldText`), so "zolta"
 * finds "Żółta". A miss is -1.
 */

/** A text prepared for matching: folded once when the index is built. */
export interface Searchable {
  /** The title, folded. Matches here count in full. */
  title: string;
  /** Extra words that also find the item (folded), at half weight. */
  extra: string;
}

export function prepare(title: string, extra = ''): Searchable {
  return { title: foldText(title), extra: foldText(extra) };
}

/** Folded words of a query; empty for a blank one. */
export function queryWords(query: string): string[] {
  return foldText(query).split(/\s+/).filter(Boolean);
}

function isWordStart(text: string, at: number): boolean {
  return at === 0 || /[\s\-_.:/()[\]]/.test(text[at - 1] ?? '');
}

/** One word against one text: its score and where it matched, or null. */
function matchWord(word: string, text: string): { score: number; at: number[] } | null {
  const found = text.indexOf(word);
  if (found >= 0) {
    // Prefer a hit at a word start when the first one is mid word.
    let at = found;
    if (!isWordStart(text, at)) {
      const boundary = text.indexOf(` ${word}`);
      if (boundary >= 0) at = boundary + 1;
    }
    const score = 100 + (at === 0 ? 60 : isWordStart(text, at) ? 35 : 0) - at * 0.2;
    return { score, at: Array.from({ length: word.length }, (_, i) => at + i) };
  }
  if (word.length < 2) return null;
  // In order, not adjacent: "nrt" finds "naruto". Greedy from the left.
  const at: number[] = [];
  let from = 0;
  for (const ch of word) {
    const next = text.indexOf(ch, from);
    if (next < 0) return null;
    at.push(next);
    from = next + 1;
  }
  let score = 20;
  for (let i = 0; i < at.length; i += 1) {
    const here = at[i] ?? 0;
    const prev = at[i - 1];
    if (prev !== undefined && here === prev + 1) score += 8;
    else if (isWordStart(text, here)) score += 5;
    if (prev !== undefined) score -= Math.min(here - prev - 1, 10) * 0.5;
  }
  return { score, at };
}

/** Scores a prepared text against the words of a query. -1 when any word misses. */
export function scoreSearchable(words: string[], target: Searchable): number {
  let total = 0;
  for (const word of words) {
    const inTitle = matchWord(word, target.title);
    if (inTitle) {
      total += inTitle.score;
      continue;
    }
    const inExtra = target.extra ? matchWord(word, target.extra) : null;
    if (!inExtra) return -1;
    total += inExtra.score * 0.5;
  }
  return total - target.title.length * 0.05;
}

/**
 * Character positions of `text` that the words matched, for highlighting.
 * Empty when folding changed the text's length (decomposed accents), because
 * the positions would no longer line up.
 */
export function matchPositions(words: string[], text: string): number[] {
  const folded = foldText(text);
  if (folded.length !== text.length) return [];
  const hit = new Set<number>();
  for (const word of words) {
    const m = matchWord(word, folded);
    if (m) for (const i of m.at) hit.add(i);
  }
  return [...hit].sort((a, b) => a - b);
}
