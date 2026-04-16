export function fuzzyIncludes(haystack: string, needle: string): boolean {
  const q = needle.trim().toLowerCase();
  if (!q) return true;
  const h = haystack.toLowerCase();
  const tokens = q.split(/\s+/).filter(Boolean);
  return tokens.every(t => h.includes(t));
}
