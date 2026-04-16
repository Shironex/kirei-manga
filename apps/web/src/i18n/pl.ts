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
  'nav.browse': 'Odkrywaj',
  'nav.settings': 'Ustawienia',
  'nav.sidebar.collapse': 'Zwiń pasek boczny',
  'nav.sidebar.expand': 'Rozwiń pasek boczny',

  // TopBar
  'topbar.placeholder.library': 'Filtruj bibliotekę…',
  'topbar.placeholder.global': 'Szukaj w bibliotece lub MangaDex…',

  // Common
  'common.retry': 'Spróbuj ponownie',
  'common.back': 'Wstecz',
  'common.error.eyebrow': 'Coś poszło nie tak',
  'common.windowControls.minimize': 'Minimalizuj',
  'common.windowControls.maximize': 'Maksymalizuj',
  'common.windowControls.restore': 'Przywróć',
  'common.windowControls.close': 'Zamknij',

  // Library page
  'library.eyebrow': 'Biblioteka',
  'library.title': 'Twoja półka. Spokojna, zawsze pod ręką.',
  'library.subtitle.count': '{count} serii',
  'library.subtitle.count_one': '{count} seria',
  'library.subtitle.count_few': '{count} serie',
  'library.subtitle.count_many': '{count} serii',
  'library.subtitle.count_other': '{count} serii',
  'library.empty.title': 'Brak obserwowanych serii.',
  'library.empty.body': 'Zajrzyj do MangaDex i wybierz pierwszą serię do swojej biblioteki.',
  'library.empty.cta': 'Przejdź do MangaDex',
  'library.empty.cta.import': 'Importuj z dysku',
  'library.action.import': 'Importuj',
  'library.empty.hint': 'Ctrl + B · Odkrywaj',
  'library.filters.empty': 'Żadna seria nie pasuje do wybranych filtrów.',

  // Library — controls (filter/sort/view chips)
  'library.groupLabel.status': 'Status',
  'library.groupLabel.source': 'Źródło',
  'library.groupLabel.sort': 'Sortuj',
  'library.filter.all': 'Wszystkie',
  'library.filter.reading': 'Czytam',
  'library.filter.completed': 'Ukończone',
  'library.filter.planToRead': 'Planuję przeczytać',
  'library.filter.onHold': 'Wstrzymane',
  'library.filter.dropped': 'Porzucone',
  'library.source.all': 'Wszystkie',
  'library.source.mangadex': 'MangaDex',
  'library.source.local': 'Lokalne',
  'library.sort.title': 'Tytuł',
  'library.sort.lastRead': 'Ostatnio czytane',
  'library.sort.dateAdded': 'Data dodania',
  'library.sort.progress': 'Postęp',
  'library.sort.disabledHint': 'Dostępne w jednym z kolejnych etapów',
  'library.sort.ariaAsc': 'Sortuj rosnąco',
  'library.sort.ariaDesc': 'Sortuj malejąco',
  'library.view.grid': 'Siatka',
  'library.view.list': 'Lista',
  'library.list.col.title': 'Tytuł',
  'library.list.col.lastChapter': 'Ostatni rozdział',
  'library.list.col.progress': 'Postęp',
  'library.list.col.lastRead': 'Ostatnio czytane',
  'library.list.continue': 'Czytaj dalej',
  'library.card.localBadge': 'Z dysku',

  // Settings
  'settings.eyebrow': 'Ustawienia',
  'settings.title': 'Ustawione po swojemu.',
  'settings.subtitle':
    'KireiManga działa lokalnie. Twoja biblioteka, klucze i pamięć podręczna tłumaczeń nie opuszczają tego komputera, chyba że wyraźnie na to pozwolisz.',
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
    'Przełączaj się między sumi (ciemny tusz) a washi (jasny papier), ustaw rozmiar interfejsu i wybierz krój do dłuższych tekstów.',
  'settings.appearance.theme.label': 'Motyw',
  'settings.appearance.theme.hint':
    'Sumi to ciemny motyw, a Washi przenosi całość na jasne, papierowe tło.',
  'settings.appearance.fontSize.label': 'Rozmiar czcionki',
  'settings.appearance.fontSize.hint':
    'Zmienia skalę całego interfejsu: od bardzo małej do bardzo dużej.',
  'settings.appearance.readingFont.label': 'Czcionka do czytania',
  'settings.appearance.readingFont.hint':
    'Fraunces, Shippori Mincho, klasyczny szeryf albo prosty bezszeryfowy krój.',
  'settings.appearance.cardSize.label': 'Rozmiar okładek',
  'settings.appearance.cardSize.hint':
    'Określa gęstość siatki w bibliotece i zakładce odkrywania. Kompaktowy widok mieści więcej okładek, a przestronny daje im więcej oddechu.',
  'settings.appearance.cardSize.compact': 'Kompaktowa',
  'settings.appearance.cardSize.cozy': 'Standardowa',
  'settings.appearance.cardSize.spacious': 'Przestronna',

  // Settings — Reader
  'settings.reader.title': 'Domyślne ustawienia czytnika',
  'settings.reader.description':
    'To ustawienia startowe dla serii, którym nie nadałeś jeszcze własnych preferencji. Ustawienia zapisane dla konkretnej serii zawsze mają pierwszeństwo.',
  'settings.reader.mode.label': 'Domyślny tryb',
  'settings.reader.mode.hint': 'Pojedyncza strona, rozkładówka lub pionowe przewijanie.',
  'settings.reader.mode.single': 'Pojedyncza',
  'settings.reader.mode.double': 'Podwójna',
  'settings.reader.mode.webtoon': 'Webtoon',
  'settings.reader.direction.label': 'Domyślny kierunek',
  'settings.reader.direction.hint': 'Od prawej do lewej w mandze, od lewej do prawej w komiksach.',
  'settings.reader.fit.label': 'Domyślne dopasowanie',
  'settings.reader.fit.hint': 'Jak obraz strony wypełnia widok.',
  'settings.reader.fit.width': 'Szerokość',
  'settings.reader.fit.height': 'Wysokość',
  'settings.reader.fit.original': 'Oryginał',
  'settings.reader.language.label': 'Domyślny język',
  'settings.reader.language.hint': 'Na jego podstawie czytnik wybiera początkową listę rozdziałów.',

  // Settings — Library
  'settings.library.title': 'Języki i pamięć podręczna',
  'settings.library.description':
    'Tutaj ustawisz domyślny język rozdziałów i sprawdzisz miejsce zajmowane przez zapisane strony.',
  'settings.library.defaultLanguage.label': 'Domyślny język rozdziałów',
  'settings.library.defaultLanguage.hint':
    'Strona serii używa go przy pierwszym wyborze listy rozdziałów.',
  'settings.library.cache.label': 'Pamięć podręczna stron',
  'settings.library.cache.calculating': 'Obliczanie rozmiaru…',
  'settings.library.cache.size': 'Rozmiar na dysku: {size}.',
  'settings.library.cache.clear': 'Wyczyść pamięć podręczną',
  'settings.library.cache.clearing': 'Czyszczenie…',
  'settings.library.cache.toast.sizeTitle': 'Rozmiar pamięci podręcznej',
  'settings.library.cache.toast.clearTitle': 'Wyczyść pamięć podręczną',
  'settings.library.cache.toast.clearedTitle': 'Pamięć podręczna wyczyszczona',
  'settings.library.cache.toast.clearedBody':
    'Usunięto zapisane strony o łącznym rozmiarze {size}.',
  'settings.library.cache.toast.clearFailed': 'Nie udało się wyczyścić pamięci podręcznej',

  // Settings — Updates
  'settings.section.updates': 'Aktualizacje',
  'settings.updates.title': 'Wersja i autoaktualizacje',
  'settings.updates.description':
    'Aktualna wersja i kanał wydań, z którego korzysta aplikacja. Aktualizacje sprawdzają się w tle, ale w każdej chwili możesz wymusić kontrolę ręcznie.',
  'settings.updates.version.label': 'Wersja',
  'settings.updates.channel.label': 'Kanał aktualizacji',
  'settings.updates.channel.hint':
    'Kanał beta dostaje nowe buildy wcześniej, ale zwykle są mniej dopracowane.',
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
  'settings.updates.status.ready': 'Aktualizacja gotowa. Uruchom ponownie, aby zainstalować.',
  'settings.updates.status.error': 'Błąd: {message}',
  'settings.updates.status.pending':
    'Nowe wydanie wciąż się publikuje. Spróbuj ponownie za chwilę.',
  'settings.updates.error.unknown': 'Nieznany błąd',
  'settings.updates.progress.aria': 'Postęp pobierania',
  'settings.updates.mac.body':
    'Na macOS autoaktualizacje nie są jeszcze dostępne, bo buildy nie są podpisane. Nowe wersje trzeba na razie pobierać ręcznie z GitHub Releases.',

  // Settings — About
  'settings.section.about': 'O aplikacji',
  'settings.about.title': 'O KireiManga',
  'settings.about.description': 'Wersja, podziękowania i diagnostyka samej aplikacji.',
  'settings.about.tagline': 'ciche miejsce dla mang, które chcesz zatrzymać.',
  'settings.about.credits.prefix': 'Stworzone z',
  'settings.about.logs.action': 'Otwórz folder z logami',
  'settings.about.logs.error': 'Nie udało się otworzyć folderu z logami.',

  // Settings — Keyboard
  'settings.keyboard.title': 'Klawiatura',
  'settings.keyboard.description':
    'Skróty klawiszowe czytnika. Zmiana przypisań pojawi się po v0.1.',
  'settings.keyboard.comingSoon': 'Zmiana przypisań już wkrótce',
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
  'browse.title': 'Znajdź coś następnego.',
  'browse.subtitle':
    'Szukaj w MangaDex po tytule, autorze, tagu albo języku. Korzystamy wyłącznie z oficjalnego API, bez scrapowania i szemranych mirrorów.',
  'browse.search.placeholder': 'Szukaj po tytule, autorze, tagu…',
  'browse.empty.title': 'Wyszukiwanie jeszcze się nie zaczęło.',
  'browse.empty.body':
    'Wpisz u góry co najmniej dwa znaki albo naciśnij ⌘K z dowolnego miejsca. Wyniki będą wpadać na bieżąco.',
  'browse.empty.hint': 'Filtry działają przy każdym wyszukiwaniu',
  'browse.noMatch.title': 'Brak dopasowań.',
  'browse.noMatch.body':
    'Spróbuj krótszego zapytania albo poluzuj filtr treści. MangaDex indeksuje też tytuły w języku oryginału.',
  'browse.masthead.topResult': 'Najlepszy wynik',
  'browse.masthead.alsoNotable': 'Warte uwagi',
  'browse.masthead.by': 'autor: {author}',
  'browse.masthead.chapterShort': 'Rozdz. {num}',

  // Browse — default discovery feed (shown when the search field is empty)
  'browse.feed.eyebrow': 'Odkryj',
  'browse.feed.ariaLabel': 'Polecane serie',
  'browse.feed.tab.popular': 'Popularne',
  'browse.feed.tab.latest': 'Najnowsze',
  'browse.feed.tab.top': 'Najlepiej oceniane',
  'browse.feed.loadingMore': 'Wczytywanie…',

  // Browse — CoverCard overlays
  'browse.card.inLibrary': 'W bibliotece',

  // Browse — filter groups and options
  'browse.filter.group.rating': 'Treść',
  'browse.filter.group.demographic': 'Demografia',
  'browse.filter.group.status': 'Status',
  'browse.filter.group.language': 'Język',
  'browse.filter.language.en': 'Angielski',
  'browse.filter.language.pl': 'Polski',
  'browse.filter.language.ja': 'Japoński',

  // Series detail / banner
  'series.eyebrow': 'MangaDex · Seria',
  'series.eyebrow.local': 'Z dysku · Seria',
  'series.continue': 'Czytaj dalej',
  'series.follow': 'Obserwuj',
  'series.following': 'Obserwujesz',
  'series.readMore': 'Czytaj więcej',
  'series.collapse': 'Zwiń',
  'series.chapters': 'Rozdziały',
  'series.bookmarks': 'Zakładki',
  'series.notFound.title': 'Nie znaleziono serii.',
  'series.notFound.body': 'Tej serii nie ma w Twojej bibliotece na dysku.',
  'series.notFound.back': 'Wróć do biblioteki',
  'series.local.meta.chapters': 'Rozdziały',
  'series.local.meta.read': 'Przeczytane',
  'series.local.meta.mangadex': 'MangaDex',
  'series.local.meta.mangadex.linked': 'połączono',
  'series.local.meta.root': 'Folder',
  'series.local.action.edit': 'Edytuj',
  'series.local.action.rescan': 'Skanuj ponownie',
  'series.local.action.rescanning': 'Skanowanie…',
  'series.local.action.remove': 'Usuń',
  'series.local.action.removing': 'Usuwanie…',
  'series.local.confirm.eyebrow': 'Potwierdź usunięcie',
  'series.local.confirm.title': 'Usunąć z biblioteki?',
  'series.local.confirm.remove':
    'Usunąć „{title}” z biblioteki? Pliki na dysku zostaną na miejscu.',
  'series.local.confirm.confirmLabel': 'Usuń',
  'series.local.confirm.cancelLabel': 'Anuluj',
  'series.local.toast.newChaptersTitle': 'Nowe rozdziały',
  'series.local.toast.newChaptersBody': 'Znaleziono {count} nowych rozdziałów.',
  'series.local.toast.newChaptersBody_one': 'Znaleziono 1 nowy rozdział.',
  'series.local.toast.newChaptersBody_few': 'Znaleziono {count} nowe rozdziały.',
  'series.local.toast.newChaptersBody_many': 'Znaleziono {count} nowych rozdziałów.',
  'series.local.toast.newChaptersBody_other': 'Znaleziono {count} nowych rozdziałów.',
  'series.local.toast.upToDateTitle': 'Wszystko jest aktualne',
  'series.local.toast.upToDateBody': 'Brak nowych rozdziałów na dysku.',
  'series.local.toast.rescanFailed': 'Skanowanie nie powiodło się',
  'series.local.toast.removedTitle': 'Usunięto',
  'series.local.toast.removedBody': 'Usunięto „{title}” z biblioteki.',
  'series.local.toast.removeFailed': 'Usuwanie nie powiodło się',
  'series.local.chapters.readOfTotal': 'Przeczytane: {read} / {total}',
  'series.local.chapters.inProgress': 'W trakcie',
  'series.local.chapters.unread': 'Nieprzeczytane',
  'series.local.chapters.read': 'Przeczytane',
  'series.local.chapters.pageCount': '{count} str.',
  'series.local.chapters.pageProgress': '{current} / {total}',
  'series.local.chapters.fallbackTitle': 'Rozdział {number}',

  // Local series — metadata drawer
  'series.local.drawer.eyebrow': 'Z dysku · Metadane',
  'series.local.drawer.title': 'Edytuj serię',
  'series.local.drawer.field.title': 'Tytuł',
  'series.local.drawer.field.titleJapanese': 'Tytuł japoński',
  'series.local.drawer.field.score': 'Ocena',
  'series.local.drawer.field.scoreSuffix': '/ 10',
  'series.local.drawer.field.notes': 'Notatki',
  'series.local.drawer.field.notes.placeholder':
    'Notatki, przypomnienia, miejsce, w którym skończyłeś…',
  'series.local.drawer.mangadex.heading': 'Wyszukaj w MangaDex',
  'series.local.drawer.mangadex.unlink': 'Odłącz',
  'series.local.drawer.mangadex.searching': 'Szukanie…',
  'series.local.drawer.action.save': 'Zapisz',
  'series.local.drawer.action.saving': 'Zapisywanie…',
  'series.local.drawer.action.cancel': 'Anuluj',
  'series.local.drawer.error.mangadexTaken':
    'Ten wpis z MangaDex jest już połączony z inną serią w bibliotece.',
  'series.local.drawer.toast.savedTitle': 'Zapisano',
  'series.local.drawer.toast.savedBody': 'Zapisano zmiany w „{title}”.',

  // Series — status / rating / demographic enums (MangaDex)
  'series.status.ongoing': 'Wydawana',
  'series.status.completed': 'Ukończone',
  'series.status.hiatus': 'Zawieszone',
  'series.status.cancelled': 'Anulowane',
  'series.rating.safe': 'Bez ograniczeń',
  'series.rating.suggestive': 'Sugestywne',
  'series.rating.erotica': 'Erotyka',
  'series.rating.pornographic': 'Pornograficzne',
  'series.demographic.shounen': 'Shōnen',
  'series.demographic.shoujo': 'Shōjo',
  'series.demographic.seinen': 'Seinen',
  'series.demographic.josei': 'Josei',

  // Chapter list
  'chapterList.empty.title': 'Nie ma tu jeszcze rozdziałów.',
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
  'reader.empty.indicator': 'Brak treści',
  'reader.error.indicator': 'Błąd',
  'reader.empty.body': 'Ten rozdział nie zwrócił żadnych stron.',
  'reader.settingsAria': 'Ustawienia czytnika',

  // Reader settings popover (group labels — reuses
  // settings.reader.{mode,direction,fit}.* for the option labels).
  'reader.popover.group.mode': 'Tryb',
  'reader.popover.group.direction': 'Kierunek',
  'reader.popover.group.fit': 'Dopasowanie',
  'reader.popover.direction.ltr': 'LTR',
  'reader.popover.direction.rtl': 'RTL',

  // Reader — per-page overlays (shared across Single/Double/Webtoon views)
  'reader.page.bookmarked': 'Zakładka dodana',

  // Toast
  'toast.eyebrow.error': 'BŁĄD',
  'toast.eyebrow.notice': 'UWAGA',
  'toast.eyebrow.done': 'OK',
  'toast.dismiss': 'Zamknij',

  // Splash
  'splash.error.eyebrow': 'Coś poszło nie tak',
  'splash.retry': 'Spróbuj ponownie',
  'splash.msg.0': 'Odkurzamy półki z mangą…',
  'splash.msg.1': 'Ostrzymy ołówki…',
  'splash.msg.2': 'Nalewamy herbatę…',
  'splash.msg.3': 'Przerzucamy strony…',
  'splash.msg.4': 'Wyszukujemy rozdziały…',
  'splash.msg.5': 'Otwieramy okładki…',
  'splash.msg.6': 'Sortujemy zakładki…',
  'splash.msg.7': 'Kirei czyta cichutko…',
} as const;
