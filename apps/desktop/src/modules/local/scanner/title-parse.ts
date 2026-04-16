/**
 * Chapter-number inference. Matches `ch 12`, `ch.12`, `c_12`, `chapter 12.5`,
 * etc., case-insensitive. Supports decimal chapter numbers common in scans
 * (bonus / omake chapters use `.5`). Returns `null` when nothing matches so
 * the scanner can surface the chapter with an empty number cell for the
 * user to correct manually (Slice J).
 */
const CHAPTER_RE = /(?:^|[^a-z])(?:ch|chapter|c)[\s_.-]*(\d+(?:\.\d+)?)\b/i;

/** Volume-number inference — integer only (half-volumes aren't a thing). */
const VOLUME_RE = /(?:^|[^a-z])(?:vol|volume|v)[\s_.-]*(\d+)\b/i;

/**
 * Strip well-known noise from folder names so the suggested title is
 * closer to what the user wants to see:
 *   - `[Group Name]`, `(raw)`, `{v2}`      — scanlation tags
 *   - trailing ` - Chapter Title`         — keep as title on chapter rows, drop on series
 *   - leading/trailing whitespace + separators
 */
const BRACKET_TAG_RE = /[\[\(\{][^\]\)\}]*[\]\)\}]/g;

export function parseChapterNumber(filename: string): number | null {
  const match = filename.match(CHAPTER_RE);
  if (!match) return null;
  const value = Number.parseFloat(match[1]);
  return Number.isFinite(value) ? value : null;
}

export function parseVolumeNumber(filename: string): number | null {
  const match = filename.match(VOLUME_RE);
  if (!match) return null;
  const value = Number.parseInt(match[1], 10);
  return Number.isFinite(value) ? value : null;
}

/**
 * Clean up a folder name for display. Removes bracket-tags, then collapses
 * any orphan whitespace or leading separators. The result is what the UI
 * shows in the import-review table before the user edits it.
 */
export function cleanTitle(raw: string): string {
  return raw
    .replace(BRACKET_TAG_RE, ' ')
    .replace(/[_.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
