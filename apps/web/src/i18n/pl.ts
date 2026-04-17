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
  'common.failed': 'Nie powiodło się',
  'common.close': 'Zamknij',
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

  // Library import page (standalone flow; mirrors onboarding.shelf.*)
  'libraryImport.eyebrow': 'Biblioteka · Import',
  'libraryImport.title': 'Dodaj swoją mangę.',
  'libraryImport.subtitle':
    'Wskaż folder. Foldery z plikami CBZ lub katalogami obrazów działają na płasko albo w podfolderach tomów — skaner sobie poradzi.',
  'libraryImport.pick.title': 'Wybierz folder, żeby zacząć.',
  'libraryImport.pick.body':
    'Każdy podfolder wybranego katalogu jest traktowany jako seria. Rozdziały mogą być archiwami CBZ / ZIP albo katalogami z numerowanymi obrazami.',
  'libraryImport.pick.hint': 'Obsługa CBR pojawi się w kolejnym wydaniu',
  'libraryImport.action.choose': 'Wybierz folder',
  'libraryImport.empty.title': 'Nic nie znaleziono.',
  'libraryImport.empty.body':
    'W tym katalogu nie znaleziono folderów CBZ ani obrazów. Wskaż inny folder albo sprawdź układ plików.',
  'libraryImport.empty.action': 'Wybierz inny folder',

  // Library — toast titles emitted from hooks
  'library.toast.followFailedTitle': 'Nie udało się obserwować',
  'library.toast.unfollowFailedTitle': 'Nie udało się przestać obserwować',

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
  'settings.library.cache.confirm.eyebrow': 'Potwierdź czyszczenie',
  'settings.library.cache.confirm.title': 'Wyczyścić pamięć stron?',
  'settings.library.cache.confirm.body':
    'Usunie {size} obrazów stron z MangaDex — zarówno bufor przeglądanych rozdziałów, jak i rozdziały pobrane ręcznie do czytania offline. Biblioteka, zakładki, postęp czytania, ustawienia ani lokalnie zaimportowane mangi nie zostaną ruszone. Strony pobiorą się ponownie przy kolejnym otwarciu rozdziału.',
  'settings.library.cache.confirm.bodyEmpty':
    'Usunie obrazy stron z MangaDex — zarówno bufor przeglądanych rozdziałów, jak i rozdziały pobrane ręcznie do czytania offline. Biblioteka, zakładki, postęp czytania, ustawienia ani lokalnie zaimportowane mangi nie zostaną ruszone. Strony pobiorą się ponownie przy kolejnym otwarciu rozdziału.',
  'settings.library.cache.confirm.confirmLabel': 'Wyczyść',
  'settings.library.cache.confirm.cancelLabel': 'Anuluj',

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
  'settings.about.onboarding.action': 'Uruchom konfigurację ponownie',
  'settings.about.onboarding.error': 'Nie udało się uruchomić konfiguracji.',

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

  // Series — etykiety tagów MangaDex (odpowiadają liście z /manga/tag).
  // Mapa nazwa → klucz mieszka w `i18n/mangadexTags.ts`.
  'series.tag.oneshot': 'Oneshot',
  'series.tag.awardWinning': 'Nagradzana',
  'series.tag.officialColored': 'Oficjalnie kolorowana',
  'series.tag.longStrip': 'Długi pas',
  'series.tag.anthology': 'Antologia',
  'series.tag.fanColored': 'Pokolorowana przez fanów',
  'series.tag.selfPublished': 'Samowydawnictwo',
  'series.tag.fourKoma': '4-koma',
  'series.tag.doujinshi': 'Doujinshi',
  'series.tag.webComic': 'Webkomiks',
  'series.tag.fullColor': 'Pełny kolor',
  'series.tag.adaptation': 'Adaptacja',
  'series.tag.thriller': 'Thriller',
  'series.tag.sciFi': 'Sci-Fi',
  'series.tag.historical': 'Historyczna',
  'series.tag.action': 'Akcja',
  'series.tag.psychological': 'Psychologiczna',
  'series.tag.romance': 'Romans',
  'series.tag.comedy': 'Komedia',
  'series.tag.mecha': 'Mecha',
  'series.tag.boysLove': 'Boys’ love',
  'series.tag.crime': 'Kryminał',
  'series.tag.sports': 'Sport',
  'series.tag.superhero': 'Superbohaterowie',
  'series.tag.magicalGirls': 'Magiczne dziewczęta',
  'series.tag.adventure': 'Przygoda',
  'series.tag.philosophical': 'Filozoficzna',
  'series.tag.drama': 'Dramat',
  'series.tag.medical': 'Medyczna',
  'series.tag.horror': 'Horror',
  'series.tag.fantasy': 'Fantasy',
  'series.tag.girlsLove': 'Girls’ love',
  'series.tag.wuxia': 'Wuxia',
  'series.tag.isekai': 'Isekai',
  'series.tag.tragedy': 'Tragedia',
  'series.tag.mystery': 'Zagadka',
  'series.tag.sliceOfLife': 'Codzienność',
  'series.tag.reincarnation': 'Reinkarnacja',
  'series.tag.timeTravel': 'Podróże w czasie',
  'series.tag.genderswap': 'Zamiana płci',
  'series.tag.loli': 'Loli',
  'series.tag.traditionalGames': 'Gry tradycyjne',
  'series.tag.monsters': 'Potwory',
  'series.tag.demons': 'Demony',
  'series.tag.ghosts': 'Duchy',
  'series.tag.animals': 'Zwierzęta',
  'series.tag.ninja': 'Ninja',
  'series.tag.samurai': 'Samuraje',
  'series.tag.mafia': 'Mafia',
  'series.tag.martialArts': 'Sztuki walki',
  'series.tag.virtualReality': 'Rzeczywistość wirtualna',
  'series.tag.officeWorkers': 'Pracownicy biurowi',
  'series.tag.videoGames': 'Gry komputerowe',
  'series.tag.postApocalyptic': 'Postapokalipsa',
  'series.tag.survival': 'Przetrwanie',
  'series.tag.zombies': 'Zombie',
  'series.tag.reverseHarem': 'Odwrócony harem',
  'series.tag.harem': 'Harem',
  'series.tag.crossdressing': 'Crossdressing',
  'series.tag.magic': 'Magia',
  'series.tag.military': 'Militarna',
  'series.tag.vampires': 'Wampiry',
  'series.tag.delinquents': 'Chuligani',
  'series.tag.monsterGirls': 'Dziewczyny-potwory',
  'series.tag.shota': 'Shota',
  'series.tag.police': 'Policja',
  'series.tag.aliens': 'Kosmici',
  'series.tag.cooking': 'Gotowanie',
  'series.tag.supernatural': 'Nadprzyrodzona',
  'series.tag.music': 'Muzyka',
  'series.tag.gyaru': 'Gyaru',
  'series.tag.incest': 'Kazirodztwo',
  'series.tag.villainess': 'Złoczyńca',
  'series.tag.schoolLife': 'Życie szkolne',
  'series.tag.mahjong': 'Mahjong',
  'series.tag.sexualViolence': 'Przemoc seksualna',
  'series.tag.gore': 'Gore',

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

  // Reader — toast titles emitted from reader hooks
  'reader.toast.progressTitle': 'Postęp czytania',
  'reader.toast.sessionTitle': 'Sesja czytania',
  'reader.toast.prefsTitle': 'Ustawienia czytnika',

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

  // Onboarding — pierwsze uruchomienie
  'onboarding.aria.dialog': 'Konfiguracja KireiManga',
  'onboarding.topbar.brand': 'KireiManga · konfiguracja',
  'onboarding.topbar.step': 'Krok {current} z {total}',
  'onboarding.action.back': 'Wstecz',
  'onboarding.action.next': 'Dalej',
  'onboarding.action.skipStep': 'Pomiń krok',
  'onboarding.action.skipRest': 'Pomiń resztę',

  // Onboarding — Powitanie
  'onboarding.welcome.eyebrow': 'Witaj',
  'onboarding.welcome.title': 'Cicha półka, dopasowana do Ciebie.',
  'onboarding.welcome.description':
    'Trzy krótkie kroki, by KireiManga była Twoja — wygląd, ustawienia czytnika i (opcjonalnie) Twój folder z mangą.',
  'onboarding.welcome.point.appearance':
    'Wybierz motyw, rozmiar pisma i krój. Sumi domyślnie — washi, gdy czytasz w dzień.',
  'onboarding.welcome.point.reader':
    'Ustal, jak otwierają się rozdziały: tryb stron, kierunek, dopasowanie i język.',
  'onboarding.welcome.point.shelf':
    'Opcjonalnie — wskaż folder z plikami CBZ lub katalogami obrazów, a zaimportujemy je za Ciebie.',
  'onboarding.welcome.begin': 'Rozpocznij',
  'onboarding.welcome.skip': 'Sam się rozejrzę',

  // Onboarding — Wygląd
  'onboarding.appearance.eyebrow': 'Wygląd',
  'onboarding.appearance.title': 'Dostrój pokój.',
  'onboarding.appearance.description':
    'Każdy wybór zapisuje się od razu. Wszystko można zmienić później w Ustawienia → Wygląd.',
  'onboarding.appearance.language.hint': 'KireiManga jest po angielsku i polsku.',

  // Onboarding — Czytnik
  'onboarding.reader.eyebrow': 'Czytnik',
  'onboarding.reader.title': 'Jak mają się otwierać rozdziały.',
  'onboarding.reader.description':
    'Te ustawienia stają się domyślne dla nowych serii. Każda seria zapamiętuje własne preferencje po pierwszym czytaniu.',

  // Onboarding — Lokalna półka
  'onboarding.shelf.eyebrow': 'Dodaj swoją półkę',
  'onboarding.shelf.title': 'Dodaj swoje pliki (opcjonalnie).',
  'onboarding.shelf.description':
    'Wskaż folder. Każdy podfolder w nim staje się serią. Pliki CBZ albo katalogi z numerowanymi obrazami — skaner sobie poradzi.',
  'onboarding.shelf.action.pick': 'Wybierz folder',
  'onboarding.shelf.action.pickAnother': 'Wybierz inny folder',
  'onboarding.shelf.action.import': 'Importuj {count}',
  'onboarding.shelf.action.importing': 'Importowanie…',
  'onboarding.shelf.hint': 'Kolejne foldery dodasz później z poziomu Biblioteki.',
  'onboarding.shelf.scan.scanning': 'Skanowanie',
  'onboarding.shelf.scan.readingArchives': 'Czytanie archiwów',
  'onboarding.shelf.review.empty':
    'Nic nie znaleziono w tym folderze. Wybierz inny lub sprawdź, czy każda seria jest w osobnym podfolderze.',
  'onboarding.shelf.review.detected': 'Przegląd · znaleziono {count} serii',
  'onboarding.shelf.review.selected': 'Zaznaczono {count}',
  'onboarding.shelf.toast.empty.title': 'Nic nie zaznaczono',
  'onboarding.shelf.toast.empty.body': 'Zaznacz co najmniej jedną serię przed importem.',
  'onboarding.shelf.toast.done.title': 'Import zakończony',
  'onboarding.shelf.toast.done.body': 'Dodano {added} · pominięto {skipped}',
  'onboarding.shelf.done.eyebrow': 'Zaimportowano',
  'onboarding.shelf.done.body':
    'Dodano {count} serii do półki. Przejdź dalej — będą czekały w Bibliotece.',

  // Onboarding — Zakończenie
  'onboarding.finish.eyebrow': 'Gotowe',
  'onboarding.finish.title': 'Od czego zacząć?',
  'onboarding.finish.description':
    'Przeglądaj MangaDex w poszukiwaniu nowych serii lub otwórz Bibliotekę, by sięgnąć po to, co już masz.',
  'onboarding.finish.body':
    'Wszystkie wybory zmienisz w Ustawieniach — a tę konfigurację uruchomisz ponownie z Ustawienia → O programie.',
  'onboarding.finish.tagline': 'Witaj na półce.',
  'onboarding.finish.action.browse': 'Przeglądaj MangaDex',
  'onboarding.finish.action.library': 'Otwórz Bibliotekę',
} as const;
