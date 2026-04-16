/**
 * English string dictionary (default).
 *
 * Keep keys flat and namespaced by surface (`nav.*`, `topbar.*`, `library.*`,
 * `settings.*`, `toast.*`, `browse.*`, `series.*`, `chapterList.*`,
 * `reader.*`). Interpolation uses `{name}` placeholders resolved by `useT()`
 * — see `apps/web/src/hooks/useT.ts`.
 */
export const en = {
  // Navigation
  'nav.library': 'Library',
  'nav.browse': 'Browse',
  'nav.settings': 'Settings',
  'nav.footer': 'v0.1',
  'nav.sidebar.collapse': 'Collapse sidebar',
  'nav.sidebar.expand': 'Expand sidebar',

  // TopBar
  'topbar.placeholder.library': 'Filter library…',
  'topbar.placeholder.global': 'Search library or MangaDex…',
  'topbar.status.offline': 'Offline',

  // Common
  'common.retry': 'Retry',
  'common.error.eyebrow': 'Something went sideways',
  'common.windowControls.minimize': 'Minimize',
  'common.windowControls.maximize': 'Maximize',
  'common.windowControls.restore': 'Restore',
  'common.windowControls.close': 'Close',

  // Library page
  'library.eyebrow': 'Library',
  'library.title': 'Your shelf, quiet and kept.',
  'library.subtitle.count': '{count} series',
  'library.empty.title': 'No series followed yet.',
  'library.empty.body': 'Start by browsing MangaDex to find your first series.',
  'library.empty.cta': 'Browse MangaDex',
  'library.empty.cta.import': 'Import local',
  'library.action.import': 'Import',
  'library.empty.hint': 'Ctrl + B · Browse',
  'library.filters.empty': 'No series match your filters.',

  // Library — controls (filter/sort/view chips)
  'library.groupLabel.status': 'Status',
  'library.groupLabel.source': 'Source',
  'library.groupLabel.sort': 'Sort',
  'library.filter.all': 'All',
  'library.filter.reading': 'Reading',
  'library.filter.completed': 'Completed',
  'library.filter.planToRead': 'Plan to read',
  'library.filter.onHold': 'On hold',
  'library.filter.dropped': 'Dropped',
  'library.source.all': 'All',
  'library.source.mangadex': 'MangaDex',
  'library.source.local': 'Local',
  'library.sort.title': 'Title',
  'library.sort.lastRead': 'Last read',
  'library.sort.dateAdded': 'Date added',
  'library.sort.progress': 'Progress',
  'library.sort.disabledHint': 'Available after Slice E',
  'library.sort.ariaAsc': 'Sort ascending',
  'library.sort.ariaDesc': 'Sort descending',
  'library.view.grid': 'Grid',
  'library.view.list': 'List',
  'library.list.col.title': 'Title',
  'library.list.col.lastChapter': 'Last chapter',
  'library.list.col.progress': 'Progress',
  'library.list.col.lastRead': 'Last read',
  'library.list.continue': 'Continue',
  'library.card.localBadge': 'Local',

  // Settings
  'settings.eyebrow': 'Settings',
  'settings.title': 'Everything, tuned to you.',
  'settings.subtitle':
    'KireiManga is local-first. Your library, keys, and translation cache never leave this machine unless you ask.',
  'settings.section.appearance': 'Appearance',
  'settings.section.reader': 'Reader',
  'settings.section.library': 'Library',
  'settings.section.keyboard': 'Keyboard',
  'settings.section.shortcuts': 'Shortcuts',
  'settings.language.label': 'Language',
  'settings.language.option.en': 'English',
  'settings.language.option.pl': 'Polski',

  // Settings — Appearance
  'settings.appearance.title': 'Theme & typography',
  'settings.appearance.description':
    'Switch between sumi (ink-dark) and washi (paper-light). Tune the app font size and pick the family used for narrative copy.',
  'settings.appearance.theme.label': 'Theme',
  'settings.appearance.theme.hint': 'Sumi is dark; Washi flips the canvas to washi paper.',
  'settings.appearance.fontSize.label': 'Font size',
  'settings.appearance.fontSize.hint': 'Scales the entire UI from extra small to extra large.',
  'settings.appearance.readingFont.label': 'Reading font',
  'settings.appearance.readingFont.hint':
    'Editorial Fraunces, Shippori Mincho, generic serif, or sans.',

  // Settings — Reader
  'settings.reader.title': 'Reading defaults',
  'settings.reader.description':
    "The starting layout for any series you haven't customised. Per-series prefs override these — defaults only apply on first read.",
  'settings.reader.mode.label': 'Default mode',
  'settings.reader.mode.hint': 'Single-page, side-by-side spread, or vertical scroll.',
  'settings.reader.mode.single': 'Single',
  'settings.reader.mode.double': 'Double',
  'settings.reader.mode.webtoon': 'Webtoon',
  'settings.reader.direction.label': 'Default direction',
  'settings.reader.direction.hint': 'Right-to-left for manga; left-to-right for comics.',
  'settings.reader.fit.label': 'Default fit',
  'settings.reader.fit.hint': 'How the page image fills the viewport.',
  'settings.reader.fit.width': 'Width',
  'settings.reader.fit.height': 'Height',
  'settings.reader.fit.original': 'Original',
  'settings.reader.language.label': 'Default language',
  'settings.reader.language.hint': 'Used by the reader hook when seeding the chapter feed.',

  // Settings — Library
  'settings.library.title': 'Languages & cache',
  'settings.library.description':
    'The chapter language seeded for new reads, and the on-disk store of cached page images.',
  'settings.library.defaultLanguage.label': 'Default chapter language',
  'settings.library.defaultLanguage.hint':
    'Used by the series detail page when picking the initial chapter feed.',
  'settings.library.cache.label': 'Page cache',
  'settings.library.cache.calculating': 'Calculating size…',
  'settings.library.cache.size': 'On-disk size: {size}.',
  'settings.library.cache.clear': 'Clear cache',
  'settings.library.cache.clearing': 'Clearing…',
  'settings.library.cache.toast.sizeTitle': 'Cache size',
  'settings.library.cache.toast.clearTitle': 'Clear cache',
  'settings.library.cache.toast.clearedTitle': 'Cache cleared',
  'settings.library.cache.toast.clearedBody': 'Cleared {size} of cached pages.',
  'settings.library.cache.toast.clearFailed': 'Cache clear failed',

  // Settings — Keyboard
  'settings.keyboard.title': 'Keyboard',
  'settings.keyboard.description':
    'Reader keyboard bindings. Rebinding is parked until after v0.1.',
  'settings.keyboard.comingSoon': 'Coming soon — rebinding',
  'settings.keyboard.hint.rtlInverted': 'Inverted in RTL.',
  'settings.keyboard.action.nextPage': 'Next page',
  'settings.keyboard.action.prevPage': 'Previous page',
  'settings.keyboard.action.firstPage': 'First page',
  'settings.keyboard.action.lastPage': 'Last page',
  'settings.keyboard.action.fullscreen': 'Toggle fullscreen',
  'settings.keyboard.action.fitWidth': 'Fit to width',
  'settings.keyboard.action.fitHeight': 'Fit to height',
  'settings.keyboard.action.fitOriginal': 'Fit original',
  'settings.keyboard.action.bookmark': 'Toggle bookmark',

  // Browse page
  'browse.eyebrow': 'MangaDex',
  'browse.title': 'Find the next one.',
  'browse.subtitle':
    'Search MangaDex by title, author, tag, or language. Official API only — no scraping, no sketchy mirrors.',
  'browse.search.placeholder': 'Search by title, author, tag…',
  'browse.empty.title': "Search hasn't started.",
  'browse.empty.body':
    'Type at least two characters above, or press ⌘K from anywhere. Results stream in as they arrive.',
  'browse.empty.hint': 'Tip: filters apply to every search',
  'browse.noMatch.title': 'Nothing matched.',
  'browse.noMatch.body':
    'Try a shorter query, or widen the content rating filter. MangaDex indexes titles in their original language too.',
  'browse.masthead.topResult': 'Top result',
  'browse.masthead.alsoNotable': 'Also notable',
  'browse.masthead.by': 'by {author}',
  'browse.masthead.chapterShort': 'Ch. {num}',

  // Browse — default discovery feed (shown when the search field is empty)
  'browse.feed.eyebrow': 'Discover',
  'browse.feed.ariaLabel': 'Discovery feed',
  'browse.feed.tab.popular': 'Popular',
  'browse.feed.tab.latest': 'Latest',
  'browse.feed.tab.top': 'Top rated',
  'browse.feed.loadingMore': 'Loading more…',

  // Browse — CoverCard overlays
  'browse.card.inLibrary': 'In library',

  // Browse — filter groups and options
  'browse.filter.group.rating': 'Rating',
  'browse.filter.group.demographic': 'Demographic',
  'browse.filter.group.status': 'Status',
  'browse.filter.group.language': 'Language',
  'browse.filter.language.en': 'English',
  'browse.filter.language.pl': 'Polish',
  'browse.filter.language.ja': 'Japanese',

  // Series detail / banner
  'series.eyebrow': 'MangaDex · Series',
  'series.eyebrow.local': 'Local · Series',
  'series.continue': 'Continue',
  'series.follow': 'Follow',
  'series.following': 'Following',
  'series.readMore': 'Read more',
  'series.collapse': 'Collapse',
  'series.chapters': 'Chapters',
  'series.bookmarks': 'Bookmarks',
  'series.notFound.title': 'Series not found.',
  'series.notFound.body': 'The requested series is not in your local library.',
  'series.notFound.back': 'Back to library',
  'series.local.meta.chapters': 'Chapters',
  'series.local.meta.read': 'Read',
  'series.local.meta.mangadex': 'MangaDex',
  'series.local.meta.mangadex.linked': 'linked',
  'series.local.meta.root': 'Root',
  'series.local.action.edit': 'Edit',
  'series.local.action.rescan': 'Rescan',
  'series.local.action.rescanning': 'Rescanning…',
  'series.local.action.remove': 'Remove',
  'series.local.action.removing': 'Removing…',
  'series.local.confirm.remove':
    'Remove "{title}" from the library? The files on disk aren\'t deleted.',
  'series.local.toast.newChaptersTitle': 'New chapters',
  'series.local.toast.newChaptersBody':
    'Found {count} new chapter{plural}.',
  'series.local.toast.upToDateTitle': 'Up to date',
  'series.local.toast.upToDateBody': 'No new chapters on disk.',
  'series.local.toast.rescanFailed': 'Rescan failed',
  'series.local.toast.removedTitle': 'Removed',
  'series.local.toast.removedBody': '{title} removed from the library.',
  'series.local.toast.removeFailed': 'Remove failed',
  'series.local.chapters.readOfTotal': '{read} / {total} read',
  'series.local.chapters.inProgress': 'In progress',
  'series.local.chapters.unread': 'Unread',
  'series.local.chapters.read': 'Read',
  'series.local.chapters.pageCount': '{count} pp',
  'series.local.chapters.pageProgress': '{current} / {total}',
  'series.local.chapters.fallbackTitle': 'Chapter {number}',

  // Local series — metadata drawer
  'series.local.drawer.eyebrow': 'Local · Metadata',
  'series.local.drawer.title': 'Edit series',
  'series.local.drawer.field.title': 'Title',
  'series.local.drawer.field.titleJapanese': 'Japanese title',
  'series.local.drawer.field.score': 'Score',
  'series.local.drawer.field.scoreSuffix': '/ 10',
  'series.local.drawer.field.notes': 'Notes',
  'series.local.drawer.field.notes.placeholder':
    'Thoughts, reminders, where you left off…',
  'series.local.drawer.mangadex.heading': 'Find on MangaDex',
  'series.local.drawer.mangadex.unlink': 'Unlink',
  'series.local.drawer.mangadex.searching': 'Searching…',
  'series.local.drawer.action.save': 'Save',
  'series.local.drawer.action.saving': 'Saving…',
  'series.local.drawer.action.cancel': 'Cancel',
  'series.local.drawer.error.mangadexTaken':
    'That MangaDex entry is already linked to another library series.',
  'series.local.drawer.toast.savedTitle': 'Saved',
  'series.local.drawer.toast.savedBody': '{title} updated.',

  // Series — status / rating / demographic enums (MangaDex)
  'series.status.ongoing': 'Ongoing',
  'series.status.completed': 'Completed',
  'series.status.hiatus': 'Hiatus',
  'series.status.cancelled': 'Cancelled',
  'series.rating.safe': 'Safe',
  'series.rating.suggestive': 'Suggestive',
  'series.rating.erotica': 'Erotica',
  'series.rating.pornographic': 'Pornographic',
  'series.demographic.shounen': 'Shōnen',
  'series.demographic.shoujo': 'Shōjo',
  'series.demographic.seinen': 'Seinen',
  'series.demographic.josei': 'Josei',

  // Chapter list
  'chapterList.empty.title': 'No chapters here yet.',
  'chapterList.empty.body': 'Try another translation, or check back later.',
  'chapterList.downloadAria': 'Download chapter',
  'chapterList.downloadedAria': 'Downloaded',
  'chapterList.downloadingAria': 'Downloading',
  'chapterList.downloadingAriaProgress': 'Downloading {current}/{total}',
  'chapterList.bookmarks.jump': 'Jump',
  'chapterList.bookmarks.removeAria': 'Remove bookmark',
  'chapterList.bookmarks.page': 'p.{page}',

  // Reader chrome + loading states
  'reader.back': 'Back',
  'reader.label': 'Reader',
  'reader.loading': 'Loading…',
  'reader.loadingPages': 'Loading pages…',
  'reader.empty.indicator': 'Empty',
  'reader.error.indicator': 'Error',
  'reader.empty.body': 'No pages were returned for this chapter.',
  'reader.settingsAria': 'Reader settings',

  // Reader settings popover (group labels — reuses
  // settings.reader.{mode,direction,fit}.* for the option labels).
  'reader.popover.group.mode': 'Mode',
  'reader.popover.group.direction': 'Direction',
  'reader.popover.group.fit': 'Fit',
  'reader.popover.direction.ltr': 'LTR',
  'reader.popover.direction.rtl': 'RTL',

  // Reader — per-page overlays (shared across Single/Double/Webtoon views)
  'reader.page.bookmarked': 'Bookmarked',

  // Toast
  'toast.eyebrow.error': 'ERROR',
  'toast.eyebrow.notice': 'NOTICE',
  'toast.eyebrow.done': 'DONE',
  'toast.dismiss': 'Dismiss',

  // Splash
  'splash.error.eyebrow': 'Something went sideways',
  'splash.retry': 'Retry',
  'splash.msg.0': 'Dusting the manga shelves…',
  'splash.msg.1': 'Sharpening pencils…',
  'splash.msg.2': 'Pouring the tea…',
  'splash.msg.3': 'Turning the page…',
  'splash.msg.4': 'Looking up chapters…',
  'splash.msg.5': 'Opening the covers…',
  'splash.msg.6': 'Sorting bookmarks…',
  'splash.msg.7': 'Kirei is reading quietly…',
} as const;
