/**
 * The fictional covers used across the page: the theming demo draws them as
 * SVG, the 3D placeholder paints them onto its volumes. Hue and chroma are the
 * seed each one gives the page, as the app would sample them.
 */
export interface CoverInfo {
  id: string;
  title: string;
  jp: string;
  hue: number;
  chroma: number;
}

export const COVERS: readonly CoverInfo[] = [
  { id: 'moonlit', title: 'The Moonlit Bookshop', jp: '月夜の書店', hue: 268, chroma: 0.13 },
  { id: 'akane', title: 'Akane Signal', jp: '茜シグナル', hue: 32, chroma: 0.17 },
  { id: 'stardust', title: 'Stardust Relay', jp: '星屑リレー', hue: 196, chroma: 0.11 },
  { id: 'ember', title: 'Ash and Ember', jp: '灰と火種', hue: 48, chroma: 0.16 },
  { id: 'sumire', title: 'Sumire Archive', jp: '菫の書庫', hue: 300, chroma: 0.12 },
];

export const coverById = (id: string): CoverInfo => {
  const cover = COVERS.find(c => c.id === id);
  if (!cover) throw new Error(`unknown cover ${id}`);
  return cover;
};
