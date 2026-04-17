/**
 * Map of MangaDex's English tag names → flat i18n keys used in `series.tag.*`.
 *
 * Tags come from upstream pre-localized by the desktop service via
 * `pickLocalized(tag.attributes.name)`. MangaDex only publishes English names,
 * so the string arriving here is effectively a stable English slug we can map
 * to our own translation keys. Anything not in this map (a new tag MangaDex
 * adds after this was written) falls back to the raw upstream string.
 *
 * Source of truth: `GET https://api.mangadex.org/manga/tag` — 77 tags across
 * `genre` / `theme` / `format` / `content` groups.
 */
export const MANGADEX_TAG_KEYS: Record<string, string> = {
  // Format
  'Oneshot': 'series.tag.oneshot',
  'Award Winning': 'series.tag.awardWinning',
  'Official Colored': 'series.tag.officialColored',
  'Long Strip': 'series.tag.longStrip',
  'Anthology': 'series.tag.anthology',
  'Fan Colored': 'series.tag.fanColored',
  'Self-Published': 'series.tag.selfPublished',
  '4-Koma': 'series.tag.fourKoma',
  'Doujinshi': 'series.tag.doujinshi',
  'Web Comic': 'series.tag.webComic',
  'Full Color': 'series.tag.fullColor',
  'Adaptation': 'series.tag.adaptation',

  // Genre
  'Thriller': 'series.tag.thriller',
  'Sci-Fi': 'series.tag.sciFi',
  'Historical': 'series.tag.historical',
  'Action': 'series.tag.action',
  'Psychological': 'series.tag.psychological',
  'Romance': 'series.tag.romance',
  'Comedy': 'series.tag.comedy',
  'Mecha': 'series.tag.mecha',
  "Boys' Love": 'series.tag.boysLove',
  'Crime': 'series.tag.crime',
  'Sports': 'series.tag.sports',
  'Superhero': 'series.tag.superhero',
  'Magical Girls': 'series.tag.magicalGirls',
  'Adventure': 'series.tag.adventure',
  'Philosophical': 'series.tag.philosophical',
  'Drama': 'series.tag.drama',
  'Medical': 'series.tag.medical',
  'Horror': 'series.tag.horror',
  'Fantasy': 'series.tag.fantasy',
  "Girls' Love": 'series.tag.girlsLove',
  'Wuxia': 'series.tag.wuxia',
  'Isekai': 'series.tag.isekai',
  'Tragedy': 'series.tag.tragedy',
  'Mystery': 'series.tag.mystery',
  'Slice of Life': 'series.tag.sliceOfLife',

  // Theme
  'Reincarnation': 'series.tag.reincarnation',
  'Time Travel': 'series.tag.timeTravel',
  'Genderswap': 'series.tag.genderswap',
  'Loli': 'series.tag.loli',
  'Traditional Games': 'series.tag.traditionalGames',
  'Monsters': 'series.tag.monsters',
  'Demons': 'series.tag.demons',
  'Ghosts': 'series.tag.ghosts',
  'Animals': 'series.tag.animals',
  'Ninja': 'series.tag.ninja',
  'Samurai': 'series.tag.samurai',
  'Mafia': 'series.tag.mafia',
  'Martial Arts': 'series.tag.martialArts',
  'Virtual Reality': 'series.tag.virtualReality',
  'Office Workers': 'series.tag.officeWorkers',
  'Video Games': 'series.tag.videoGames',
  'Post-Apocalyptic': 'series.tag.postApocalyptic',
  'Survival': 'series.tag.survival',
  'Zombies': 'series.tag.zombies',
  'Reverse Harem': 'series.tag.reverseHarem',
  'Harem': 'series.tag.harem',
  'Crossdressing': 'series.tag.crossdressing',
  'Magic': 'series.tag.magic',
  'Military': 'series.tag.military',
  'Vampires': 'series.tag.vampires',
  'Delinquents': 'series.tag.delinquents',
  'Monster Girls': 'series.tag.monsterGirls',
  'Shota': 'series.tag.shota',
  'Police': 'series.tag.police',
  'Aliens': 'series.tag.aliens',
  'Cooking': 'series.tag.cooking',
  'Supernatural': 'series.tag.supernatural',
  'Music': 'series.tag.music',
  'Gyaru': 'series.tag.gyaru',
  'Incest': 'series.tag.incest',
  'Villainess': 'series.tag.villainess',
  'School Life': 'series.tag.schoolLife',
  'Mahjong': 'series.tag.mahjong',

  // Content
  'Sexual Violence': 'series.tag.sexualViolence',
  'Gore': 'series.tag.gore',
};

/**
 * Translate a pre-localized MangaDex tag name using the app's i18n table.
 * Falls back to the raw name when no mapping exists (new upstream tags or
 * when pickLocalized already returned a non-English value).
 */
export function translateMangaDexTag(
  rawName: string,
  t: (key: string) => string
): string {
  const key = MANGADEX_TAG_KEYS[rawName];
  if (!key) return rawName;
  const translated = t(key);
  return translated === key ? rawName : translated;
}
