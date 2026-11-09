/** The sections of the settings page, in order; ids match `settings-<id>` anchors. */
export const SECTIONS = [
  { id: 'appearance', label: 'Appearance' },
  { id: 'reader', label: 'Reader' },
  { id: 'library', label: 'Library' },
  { id: 'online', label: 'MangaDex' },
  { id: 'accounts', label: 'Accounts' },
  { id: 'downloads', label: 'Downloads' },
  { id: 'data', label: 'Data' },
  { id: 'shortcuts', label: 'Shortcuts' },
  { id: 'about', label: 'About' },
] as const;

export type SectionId = (typeof SECTIONS)[number]['id'];

/** The `section` search param: which section to open the page on. */
export function validateSettingsSearch(search: Record<string, unknown>): { section?: SectionId } {
  const section = SECTIONS.find(s => s.id === search.section);
  return section ? { section: section.id } : {};
}
