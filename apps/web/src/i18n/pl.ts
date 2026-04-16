// review: native PL speaker before v0.2 release
/**
 * Polish string dictionary. Mirrors the keys in `./en.ts` exactly.
 *
 * Translations were drafted by a non-native speaker for v0.1 — please run
 * a pass before v0.2 ships. Interpolation uses the same `{name}` syntax.
 */
export const pl = {
  // Navigation
  'nav.library': 'Biblioteka',
  'nav.browse': 'Przeglądaj',
  'nav.settings': 'Ustawienia',
  'nav.footer': 'v0.1',
  'nav.sidebar.collapse': 'Zwiń panel',
  'nav.sidebar.expand': 'Rozwiń panel',

  // TopBar
  'topbar.placeholder.library': 'Filtruj bibliotekę…',
  'topbar.placeholder.global': 'Szukaj w bibliotece lub MangaDex…',
  'topbar.status.offline': 'Offline',

  // Common
  'common.retry': 'Spróbuj ponownie',
  'common.error.eyebrow': 'Coś poszło nie tak',
  'common.windowControls.minimize': 'Minimalizuj',
  'common.windowControls.maximize': 'Maksymalizuj',
  'common.windowControls.restore': 'Przywróć',
  'common.windowControls.close': 'Zamknij',

  // Library page
  'library.eyebrow': 'Biblioteka',
  'library.title': 'Twoja półka, cicha i strzeżona.',
  'library.subtitle.count': '{count} serii',
  'library.empty.title': 'Brak obserwowanych serii.',
  'library.empty.body':
    'Zacznij od przeglądania MangaDex, aby znaleźć swoją pierwszą serię.',
  'library.empty.cta': 'Przeglądaj MangaDex',
  'library.empty.cta.import': 'Importuj lokalne',
  'library.action.import': 'Importuj',
  'library.empty.hint': 'Ctrl + B · Przeglądaj',
  'library.filters.empty': 'Brak serii pasujących do filtrów.',

  // Library — controls (filter/sort/view chips)
  'library.groupLabel.status': 'Status',
  'library.groupLabel.source': 'Źródło',
  'library.groupLabel.sort': 'Sortuj',
  'library.filter.all': 'Wszystkie',
  'library.filter.reading': 'Czytane',
  'library.filter.completed': 'Ukończone',
  'library.filter.planToRead': 'Planowane',
  'library.filter.onHold': 'Wstrzymane',
  'library.filter.dropped': 'Porzucone',
  'library.source.all': 'Wszystkie',
  'library.source.mangadex': 'MangaDex',
  'library.source.local': 'Lokalne',
  'library.sort.title': 'Tytuł',
  'library.sort.lastRead': 'Ostatnio czytane',
  'library.sort.dateAdded': 'Data dodania',
  'library.sort.progress': 'Postęp',
  'library.sort.disabledHint': 'Dostępne po Slice E',
  'library.sort.ariaAsc': 'Sortuj rosnąco',
  'library.sort.ariaDesc': 'Sortuj malejąco',
  'library.view.grid': 'Siatka',
  'library.view.list': 'Lista',
  'library.list.col.title': 'Tytuł',
  'library.list.col.lastChapter': 'Ostatni rozdział',
  'library.list.col.progress': 'Postęp',
  'library.list.col.lastRead': 'Ostatnio czytane',
  'library.list.continue': 'Czytaj dalej',
  'library.card.localBadge': 'Lokalne',

  // Settings
  'settings.eyebrow': 'Ustawienia',
  'settings.title': 'Wszystko dostosowane do Ciebie.',
  'settings.subtitle':
    'KireiManga działa lokalnie. Twoja biblioteka, klucze i cache tłumaczeń nigdy nie opuszczają tego komputera bez Twojej zgody.',
  'settings.section.appearance': 'Wygląd',
  'settings.section.reader': 'Czytnik',
  'settings.section.library': 'Biblioteka',
  'settings.section.keyboard': 'Klawiatura',
  'settings.section.shortcuts': 'Skróty',
  'settings.language.label': 'Język',
  'settings.language.option.en': 'Angielski',
  'settings.language.option.pl': 'Polski',

  // Settings — Appearance
  'settings.appearance.title': 'Motyw i typografia',
  'settings.appearance.description':
    'Przełączaj między sumi (ciemny tusz) a washi (jasny papier). Dostosuj rozmiar czcionki i wybierz krój używany w tekście narracyjnym.',
  'settings.appearance.theme.label': 'Motyw',
  'settings.appearance.theme.hint': 'Sumi jest ciemny; Washi zmienia tło na papier washi.',
  'settings.appearance.fontSize.label': 'Rozmiar czcionki',
  'settings.appearance.fontSize.hint':
    'Skaluje cały interfejs od bardzo małego do bardzo dużego.',
  'settings.appearance.readingFont.label': 'Czcionka do czytania',
  'settings.appearance.readingFont.hint':
    'Edytorska Fraunces, Shippori Mincho, szeryfowa lub bezszeryfowa.',

  // Settings — Reader
  'settings.reader.title': 'Domyślne ustawienia czytnika',
  'settings.reader.description':
    'Startowy układ dla serii, których nie dostosowałeś. Ustawienia per seria mają priorytet — domyślne stosują się przy pierwszym czytaniu.',
  'settings.reader.mode.label': 'Domyślny tryb',
  'settings.reader.mode.hint': 'Pojedyncza strona, rozkładówka lub pionowe przewijanie.',
  'settings.reader.mode.single': 'Pojedyncza',
  'settings.reader.mode.double': 'Podwójna',
  'settings.reader.mode.webtoon': 'Webtoon',
  'settings.reader.direction.label': 'Domyślny kierunek',
  'settings.reader.direction.hint':
    'Od prawej do lewej dla mangi; od lewej do prawej dla komiksów.',
  'settings.reader.fit.label': 'Domyślne dopasowanie',
  'settings.reader.fit.hint': 'Jak obraz strony wypełnia widok.',
  'settings.reader.fit.width': 'Szerokość',
  'settings.reader.fit.height': 'Wysokość',
  'settings.reader.fit.original': 'Oryginał',
  'settings.reader.language.label': 'Domyślny język',
  'settings.reader.language.hint': 'Używany przy inicjalizacji listy rozdziałów.',

  // Settings — Library
  'settings.library.title': 'Języki i cache',
  'settings.library.description':
    'Język rozdziałów dla nowych lektur oraz lokalny cache obrazów stron.',
  'settings.library.defaultLanguage.label': 'Domyślny język rozdziałów',
  'settings.library.defaultLanguage.hint':
    'Używany na stronie serii przy wyborze startowej listy rozdziałów.',
  'settings.library.cache.label': 'Cache stron',
  'settings.library.cache.calculating': 'Obliczanie rozmiaru…',
  'settings.library.cache.size': 'Rozmiar na dysku: {size}.',
  'settings.library.cache.clear': 'Wyczyść cache',
  'settings.library.cache.clearing': 'Czyszczenie…',
  'settings.library.cache.toast.sizeTitle': 'Rozmiar cache',
  'settings.library.cache.toast.clearTitle': 'Wyczyść cache',
  'settings.library.cache.toast.clearedTitle': 'Cache wyczyszczony',
  'settings.library.cache.toast.clearedBody': 'Zwolniono {size} cache stron.',
  'settings.library.cache.toast.clearFailed': 'Nie udało się wyczyścić cache',

  // Settings — Updates
  'settings.section.updates': 'Aktualizacje',
  'settings.updates.title': 'Wersja i aktualizacje',
  'settings.updates.description':
    'Aktualna wersja i kanał, z którego aplikacja pobiera aktualizacje. Sprawdzanie działa w tle — ręczne sprawdzenie jest zawsze dostępne.',
  'settings.updates.version.label': 'Wersja',
  'settings.updates.channel.label': 'Kanał aktualizacji',
  'settings.updates.channel.hint': 'Beta to wcześniejsze buildy — mogą mieć więcej błędów.',
  'settings.updates.channel.stable': 'Stabilny',
  'settings.updates.channel.beta': 'Beta',
  'settings.updates.action.check': 'Sprawdź aktualizacje',
  'settings.updates.action.checking': 'Sprawdzanie…',
  'settings.updates.action.download': 'Pobierz',
  'settings.updates.action.install': 'Zainstaluj teraz',
  'settings.updates.action.releases': 'Otwórz GitHub Releases',
  'settings.updates.status.idle': 'Masz najnowszą wersję.',
  'settings.updates.status.checking': 'Sprawdzanie aktualizacji…',
  'settings.updates.status.available': 'Dostępna aktualizacja: {version}',
  'settings.updates.status.downloading': 'Pobieranie… {percent}%',
  'settings.updates.status.ready': 'Aktualizacja gotowa — uruchom ponownie, aby zainstalować.',
  'settings.updates.status.error': 'Błąd: {message}',
  'settings.updates.status.pending': 'Nowe wydanie jest jeszcze ładowane. Spróbuj za chwilę.',
  'settings.updates.error.unknown': 'Nieznany błąd',
  'settings.updates.progress.aria': 'Postęp pobierania',
  'settings.updates.mac.body':
    'Automatyczne aktualizacje nie są jeszcze dostępne na macOS (buildy nie są podpisane). Pobieraj nowe wersje ręcznie z GitHub Releases.',

  // Settings — Keyboard
  'settings.keyboard.title': 'Klawiatura',
  'settings.keyboard.description':
    'Skróty klawiszowe czytnika. Zmiana przypisań zaplanowana po v0.1.',
  'settings.keyboard.comingSoon': 'Wkrótce — zmiana przypisań',
  'settings.keyboard.hint.rtlInverted': 'Odwrócone w RTL.',
  'settings.keyboard.action.nextPage': 'Następna strona',
  'settings.keyboard.action.prevPage': 'Poprzednia strona',
  'settings.keyboard.action.firstPage': 'Pierwsza strona',
  'settings.keyboard.action.lastPage': 'Ostatnia strona',
  'settings.keyboard.action.fullscreen': 'Przełącz pełny ekran',
  'settings.keyboard.action.fitWidth': 'Dopasuj do szerokości',
  'settings.keyboard.action.fitHeight': 'Dopasuj do wysokości',
  'settings.keyboard.action.fitOriginal': 'Oryginalny rozmiar',
  'settings.keyboard.action.bookmark': 'Przełącz zakładkę',

  // Browse page
  'browse.eyebrow': 'MangaDex',
  'browse.title': 'Znajdź następną.',
  'browse.subtitle':
    'Szukaj w MangaDex po tytule, autorze, tagu lub języku. Tylko oficjalne API — żadnego scrapowania ani podejrzanych lustrzanek.',
  'browse.search.placeholder': 'Szukaj po tytule, autorze, tagu…',
  'browse.empty.title': 'Wyszukiwanie jeszcze się nie zaczęło.',
  'browse.empty.body':
    'Wpisz co najmniej dwa znaki powyżej lub naciśnij ⌘K z dowolnego miejsca. Wyniki pojawiają się w miarę napływu.',
  'browse.empty.hint': 'Wskazówka: filtry stosują się do każdego wyszukiwania',
  'browse.noMatch.title': 'Brak dopasowań.',
  'browse.noMatch.body':
    'Spróbuj krótszego zapytania albo poszerz filtr oceny treści. MangaDex indeksuje tytuły również w języku oryginału.',
  'browse.masthead.topResult': 'Najlepszy wynik',
  'browse.masthead.alsoNotable': 'Również warte uwagi',
  'browse.masthead.by': 'autor: {author}',
  'browse.masthead.chapterShort': 'Rozdz. {num}',

  // Browse — default discovery feed (shown when the search field is empty)
  'browse.feed.eyebrow': 'Odkrywaj',
  'browse.feed.ariaLabel': 'Polecane serie',
  'browse.feed.tab.popular': 'Popularne',
  'browse.feed.tab.latest': 'Najnowsze',
  'browse.feed.tab.top': 'Najlepiej oceniane',
  'browse.feed.loadingMore': 'Wczytywanie…',

  // Browse — CoverCard overlays
  'browse.card.inLibrary': 'W bibliotece',

  // Browse — filter groups and options
  'browse.filter.group.rating': 'Ocena',
  'browse.filter.group.demographic': 'Demografia',
  'browse.filter.group.status': 'Status',
  'browse.filter.group.language': 'Język',
  'browse.filter.language.en': 'Angielski',
  'browse.filter.language.pl': 'Polski',
  'browse.filter.language.ja': 'Japoński',

  // Series detail / banner
  'series.eyebrow': 'MangaDex · Seria',
  'series.eyebrow.local': 'Lokalne · Seria',
  'series.continue': 'Czytaj dalej',
  'series.follow': 'Obserwuj',
  'series.following': 'Obserwowane',
  'series.readMore': 'Czytaj więcej',
  'series.collapse': 'Zwiń',
  'series.chapters': 'Rozdziały',
  'series.bookmarks': 'Zakładki',
  'series.notFound.title': 'Nie znaleziono serii.',
  'series.notFound.body': 'Tej serii nie ma w Twojej lokalnej bibliotece.',
  'series.notFound.back': 'Wróć do biblioteki',
  'series.local.meta.chapters': 'Rozdziały',
  'series.local.meta.read': 'Przeczytane',
  'series.local.meta.mangadex': 'MangaDex',
  'series.local.meta.mangadex.linked': 'powiązane',
  'series.local.meta.root': 'Folder',
  'series.local.action.edit': 'Edytuj',
  'series.local.action.rescan': 'Przeskanuj',
  'series.local.action.rescanning': 'Skanowanie…',
  'series.local.action.remove': 'Usuń',
  'series.local.action.removing': 'Usuwanie…',
  'series.local.confirm.remove':
    'Usunąć „{title}” z biblioteki? Pliki na dysku pozostaną nietknięte.',
  'series.local.toast.newChaptersTitle': 'Nowe rozdziały',
  'series.local.toast.newChaptersBody':
    'Znaleziono {count} nowych rozdziałów.',
  'series.local.toast.upToDateTitle': 'Wszystko aktualne',
  'series.local.toast.upToDateBody': 'Brak nowych rozdziałów na dysku.',
  'series.local.toast.rescanFailed': 'Skanowanie nie powiodło się',
  'series.local.toast.removedTitle': 'Usunięto',
  'series.local.toast.removedBody': '{title} usunięte z biblioteki.',
  'series.local.toast.removeFailed': 'Usuwanie nie powiodło się',
  'series.local.chapters.readOfTotal': '{read} / {total} przeczytanych',
  'series.local.chapters.inProgress': 'W trakcie',
  'series.local.chapters.unread': 'Nieprzeczytane',
  'series.local.chapters.read': 'Przeczytane',
  'series.local.chapters.pageCount': '{count} str.',
  'series.local.chapters.pageProgress': '{current} / {total}',
  'series.local.chapters.fallbackTitle': 'Rozdział {number}',

  // Local series — metadata drawer
  'series.local.drawer.eyebrow': 'Lokalne · Metadane',
  'series.local.drawer.title': 'Edytuj serię',
  'series.local.drawer.field.title': 'Tytuł',
  'series.local.drawer.field.titleJapanese': 'Tytuł japoński',
  'series.local.drawer.field.score': 'Ocena',
  'series.local.drawer.field.scoreSuffix': '/ 10',
  'series.local.drawer.field.notes': 'Notatki',
  'series.local.drawer.field.notes.placeholder':
    'Myśli, przypomnienia, na czym skończyłeś…',
  'series.local.drawer.mangadex.heading': 'Znajdź na MangaDex',
  'series.local.drawer.mangadex.unlink': 'Odłącz',
  'series.local.drawer.mangadex.searching': 'Szukanie…',
  'series.local.drawer.action.save': 'Zapisz',
  'series.local.drawer.action.saving': 'Zapisywanie…',
  'series.local.drawer.action.cancel': 'Anuluj',
  'series.local.drawer.error.mangadexTaken':
    'Ten wpis z MangaDex jest już powiązany z inną serią w bibliotece.',
  'series.local.drawer.toast.savedTitle': 'Zapisano',
  'series.local.drawer.toast.savedBody': '{title} zaktualizowane.',

  // Series — status / rating / demographic enums (MangaDex)
  'series.status.ongoing': 'W trakcie',
  'series.status.completed': 'Ukończone',
  'series.status.hiatus': 'Przerwane',
  'series.status.cancelled': 'Anulowane',
  'series.rating.safe': 'Bezpieczne',
  'series.rating.suggestive': 'Sugestywne',
  'series.rating.erotica': 'Erotyka',
  'series.rating.pornographic': 'Pornograficzne',
  'series.demographic.shounen': 'Shōnen',
  'series.demographic.shoujo': 'Shōjo',
  'series.demographic.seinen': 'Seinen',
  'series.demographic.josei': 'Josei',

  // Chapter list
  'chapterList.empty.title': 'Brak rozdziałów.',
  'chapterList.empty.body': 'Spróbuj innego tłumaczenia lub zajrzyj później.',
  'chapterList.downloadAria': 'Pobierz rozdział',
  'chapterList.downloadedAria': 'Pobrane',
  'chapterList.downloadingAria': 'Pobieranie',
  'chapterList.downloadingAriaProgress': 'Pobieranie {current}/{total}',
  'chapterList.bookmarks.jump': 'Przejdź',
  'chapterList.bookmarks.removeAria': 'Usuń zakładkę',
  'chapterList.bookmarks.page': 's.{page}',

  // Reader chrome + loading states
  'reader.back': 'Wstecz',
  'reader.label': 'Czytnik',
  'reader.loading': 'Wczytywanie…',
  'reader.loadingPages': 'Wczytywanie stron…',
  'reader.empty.indicator': 'Pusto',
  'reader.error.indicator': 'Błąd',
  'reader.empty.body': 'Dla tego rozdziału nie zwrócono żadnych stron.',
  'reader.settingsAria': 'Ustawienia czytnika',

  // Reader settings popover (group labels — reuses
  // settings.reader.{mode,direction,fit}.* for the option labels).
  'reader.popover.group.mode': 'Tryb',
  'reader.popover.group.direction': 'Kierunek',
  'reader.popover.group.fit': 'Dopasowanie',
  'reader.popover.direction.ltr': 'LTR',
  'reader.popover.direction.rtl': 'RTL',

  // Reader — per-page overlays (shared across Single/Double/Webtoon views)
  'reader.page.bookmarked': 'Z zakładką',

  // Toast
  'toast.eyebrow.error': 'BŁĄD',
  'toast.eyebrow.notice': 'INFO',
  'toast.eyebrow.done': 'GOTOWE',
  'toast.dismiss': 'Zamknij',

  // Splash
  'splash.error.eyebrow': 'Coś poszło nie tak',
  'splash.retry': 'Spróbuj ponownie',
  'splash.msg.0': 'Odkurzamy półki z mangą…',
  'splash.msg.1': 'Ostrzymy ołówki…',
  'splash.msg.2': 'Nalewamy herbatę…',
  'splash.msg.3': 'Przewracamy strony…',
  'splash.msg.4': 'Wyszukujemy rozdziały…',
  'splash.msg.5': 'Otwieramy okładki…',
  'splash.msg.6': 'Sortujemy zakładki…',
  'splash.msg.7': 'Kirei czyta cichutko…',
} as const;
