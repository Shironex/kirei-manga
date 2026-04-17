export const LANDING_LANGUAGES = ['en', 'pl'] as const;
export type LandingLanguage = (typeof LANDING_LANGUAGES)[number];

export const translations: Record<LandingLanguage, Record<string, string>> = {
  en: {
    'layout.skipToContent': 'Skip to content',
    'brand.iconAlt': 'KireiManga icon',
    'meta.home.title': 'KireiManga · A quiet desktop manga reader',
    'meta.home.description':
      'KireiManga is a quiet desktop manga reader. Browse MangaDex, import CBZ files and folders, and read in a clean, focused interface. Part of the Shiro suite.',
    'meta.download.title': 'Download KireiManga',
    'meta.download.description': 'Download the latest KireiManga desktop build for Windows or macOS.',
    'meta.changelog.title': 'Changelog · KireiManga',
    'meta.changelog.description':
      'Release notes for KireiManga, including the MangaDex Reader and Local Library milestones.',

    'nav.primary': 'Primary navigation',
    'nav.features': 'Features',
    'nav.gallery': 'Gallery',
    'nav.roadmap': 'Roadmap',
    'nav.suite': 'Shiro Suite',
    'nav.changelog': 'Changelog',
    'nav.github': 'GitHub',
    'nav.download': 'Download',
    'nav.issue': 'Issue No. {version}',
    'nav.switchLanguage': 'Switch language',
    'nav.toggleMenu': 'Toggle menu',

    'hero.eyebrowBrand': '綺麗漫画 · KireiManga',
    'hero.eyebrowMilestone': 'v{version} · Local Library',
    'hero.titleHtml': 'Read any manga,<br />in <em>any</em> language.',
    'hero.subhead':
      'A quiet desktop reader built around your own library. Browse MangaDex, keep your collection in SQLite, and read CBZ files or folders in one calm reading space. No dashboard clutter. No neon. Just a shelf you will want to return to.',
    'hero.ctaDownload': 'Download v{version}',
    'hero.ctaGithub': 'View on GitHub',
    'hero.metaWindows': 'Windows',
    'hero.metaMacos': 'macOS',
    'hero.metaLicense': 'Source available',
    'hero.tate': '静かに読む場所',
    'hero.portraitAlt': 'Kirei reading quietly',
    'hero.portraitCaption': 'Plate 0 · Frontispiece',

    'features.num': '§ I',
    'features.label': 'Contents',
    'features.heading': 'Everything a reader needs, nothing that gets in the way.',
    'features.body':
      'KireiManga is shaped around how people actually read manga, one folder at a time and one chapter at a time. The feature set stays restrained on purpose. It is there when you need it and quiet when you do not.',

    'features.01.title': 'MangaDex Browse',
    'features.01.body':
      "Discovery tabs for Popular, Latest, and Top rated, plus search across title, author, tags, demographic, and rating through MangaDex's official API.",
    'features.02.title': 'Library',
    'features.02.body':
      'Keep follow status, reading status, and chapter progress for MangaDex series and local series in one place.',
    'features.03.title': 'Local Import',
    'features.03.body':
      'Pick a folder, scan CBZ, ZIP, and image based series, review the matches, and import everything in one pass.',
    'features.04.title': 'Distraction free Reader',
    'features.04.body':
      'Read in full screen with single page, double page, or webtoon layouts, fit controls, keyboard navigation, RTL support, and cached pages from disk.',
    'features.05.title': 'Bookmarks and Progress',
    'features.05.body':
      'Save page bookmarks with notes and resume exactly where you stopped, whether the chapter is local, remote, or already downloaded for offline reading.',
    'features.06.title': 'Translation Overlay',
    'features.06.body':
      'Bubble detection, manga OCR, and DeepL, Google, or Ollama translations can be rendered directly on the page for raw Japanese releases.',
    'features.07.title': 'AniList Sync',
    'features.07.body':
      'Sign in with OAuth, import your list, and keep reading progress in sync between the app and AniList.',
    'features.08.title': 'English and Polish',
    'features.08.body':
      'The interface is available in English and Polish, with language switching built in from the start.',

    'gallery.num': '§ II',
    'gallery.label': 'Gallery',
    'gallery.heading': 'A set of quiet screens.',
    'gallery.body':
      'These screenshots come from the current build. Each view is meant to stay clear, readable, and out of the way while you browse or read.',

    'gallery.01.title': 'Library',
    'gallery.01.note':
      'A calm shelf with fast search, filters, and lazy cover loading that stays smooth even with a large collection.',
    'gallery.01.alt': 'KireiManga library view with covers in a clean grid',
    'gallery.02.title': 'Series Detail',
    'gallery.02.note':
      'Synopsis, chapters, follow status, and reading direction stay together on one clean page.',
    'gallery.02.alt': 'Series detail page showing synopsis and chapter list',
    'gallery.03.title': 'Local Import',
    'gallery.03.note':
      'Choose a folder, scan archives or image folders, review metadata, and confirm the import.',
    'gallery.03.alt': 'Local import review screen',
    'gallery.04.title': 'Reader',
    'gallery.04.note':
      'Full screen reading with fit controls, keyboard navigation, and per series reading direction.',
    'gallery.04.alt': 'KireiManga reader in full screen mode',

    'roadmap.num': '§ III',
    'roadmap.label': 'Milestones',
    'roadmap.heading': 'A long project, released in chapters.',
    'roadmap.body':
      'KireiManga moves carefully. Each milestone adds one clear capability and ships when it feels ready, not when a date on the calendar says it should.',

    'roadmap.v01.title': 'MangaDex Reader',
    'roadmap.v01.desc':
      'MangaDex API, chapter streaming, internal library, reader shell, and progress tracking.',
    'roadmap.v01.status': 'Shipped',
    'roadmap.v02.title': 'Local Library',
    'roadmap.v02.desc':
      'CBZ and folder import, unified library, local reader, metadata editor, MangaDex matching, and folder update polling.',
    'roadmap.v02.status': 'Shipped · current',
    'roadmap.v03.title': 'Translation',
    'roadmap.v03.desc':
      'Bubble detection, manga OCR sidecar, and on page translation overlays from DeepL, Google, or Ollama.',
    'roadmap.v03.status': 'Planned',
    'roadmap.v04.title': 'AniList Sync',
    'roadmap.v04.desc': 'OAuth login, two way progress sync, and full manga list import.',
    'roadmap.v04.status': 'Planned',
    'roadmap.v05.title': 'Polish',
    'roadmap.v05.desc':
      'Kanji hover dictionary, Anki export, translation polish, and community features.',
    'roadmap.v05.status': 'Backlog',

    'cta.num': '§ IV',
    'cta.label': 'Download',
    'cta.heading': 'Bring Kirei home.',
    'cta.body':
      'Download the latest build for Windows or macOS. The app is unsigned for now, so the Releases page includes the quick steps for SmartScreen on Windows and the first launch on macOS.',
    'cta.download': 'Download v{version}',
    'cta.source': 'Source and issues',
    'cta.platforms': 'Windows · macOS',

    'suite.num': '§ V',
    'suite.label': 'Shiro Suite',
    'suite.heading': 'One quiet shelf for manga, anime, and music.',
    'suite.body':
      'KireiManga is one of three sibling apps built around the same idea — local-first, calm, and easy to live with. Different repos, shared architecture and design language.',
    'suite.self': 'Manga reader · you are here',
    'suite.shiroani': 'Anime tracker',
    'suite.shiranami': 'Music sanctuary',

    'changelog.label': 'Changelog',
    'changelog.heading': "What's new?",
    'changelog.subtitle':
      'Release notes grouped by milestone. Each entry marks something that actually shipped.',
    'changelog.backHome': 'Back to home',
    'changelog.versionLabel': 'v{version}',

    'download.label': 'Download',
    'download.heading': 'Pick the build that fits your system.',
    'download.subtitle':
      'KireiManga is still unsigned. SmartScreen may complain on Windows and macOS may block the first launch, but both are easy to get past.',
    'download.mascotAlt': 'Kirei waving',
    'download.windows': 'Windows',
    'download.windowsExt': '.exe installer',
    'download.macos': 'macOS',
    'download.macosExt': '.dmg disk image',
    'download.yourSystem': 'Your system',
    'download.detecting': 'Detecting...',
    'download.primary': 'Download for {platform}',
    'download.secondary': 'Also available for {platform}',
    'download.open': 'Open Releases on GitHub',
    'download.notesTitle': 'If your system complains...',
    'download.notesWindows':
      "Windows SmartScreen may warn on first launch because the installer is not code signed. Click 'More info', then 'Run anyway'.",
    'download.notesMacos':
      'macOS may block the first launch because the .dmg is not notarized. Move the app to Applications, then open Terminal and run:',
    'download.notesMacosCmd': 'xattr -cr /Applications/KireiManga.app',
    'download.sourceLabel': 'Source',
    'download.notesSource':
      'If you would rather build from source, clone the repo, run pnpm install, then pnpm package:win or pnpm package:mac.',

    'footer.tagline': 'Read any manga, in any language.',
    'footer.body':
      'A local first desktop manga reader with MangaDex browsing, CBZ and folder import, offline reading, and translation tools on the roadmap.',
    'footer.project': 'Project',
    'footer.sisterApps': 'Sister apps',
    'footer.source': 'Source on GitHub',
    'footer.releases': 'Releases',
    'footer.changelog': 'Changelog',
    'footer.issue': 'Report an issue',
    'footer.colophon': 'Source available · v{version} · Built by',
    'footer.githubAria': 'KireiManga on GitHub',
  },

  pl: {
    'layout.skipToContent': 'Przejdź do treści',
    'brand.iconAlt': 'Ikona KireiManga',
    'meta.home.title': 'KireiManga · Spokojny desktopowy czytnik mangi',
    'meta.home.description':
      'KireiManga to spokojny desktopowy czytnik mangi. Przeglądaj MangaDex, importuj pliki CBZ i foldery, i czytaj w czystym, skupionym interfejsie. Część pakietu Shiro.',
    'meta.download.title': 'Pobierz KireiManga',
    'meta.download.description': 'Pobierz najnowszą wersję desktopową KireiManga dla Windowsa lub macOS.',
    'meta.changelog.title': 'Lista zmian · KireiManga',
    'meta.changelog.description':
      'Notatki do wydań KireiManga, w tym kamienie milowe Czytnik MangaDex i Biblioteka lokalna.',

    'nav.primary': 'Nawigacja główna',
    'nav.features': 'Funkcje',
    'nav.gallery': 'Galeria',
    'nav.roadmap': 'Plan rozwoju',
    'nav.suite': 'Pakiet Shiro',
    'nav.changelog': 'Lista zmian',
    'nav.github': 'GitHub',
    'nav.download': 'Pobierz',
    'nav.issue': 'Wydanie nr {version}',
    'nav.switchLanguage': 'Zmień język',
    'nav.toggleMenu': 'Przełącz menu',

    'hero.eyebrowBrand': '綺麗漫画 · KireiManga',
    'hero.eyebrowMilestone': 'v{version} · Biblioteka lokalna',
    'hero.titleHtml': 'Czytaj dowolną mangę,<br />w <em>dowolnym</em> języku.',
    'hero.subhead':
      'Spokojny czytnik desktopowy zbudowany wokół własnej biblioteki. Przeglądaj MangaDex, trzymaj kolekcję w SQLite i czytaj pliki CBZ albo foldery w jednym, uporządkowanym miejscu. Bez paneli. Bez neonów. Tylko półka, do której chce się wracać.',
    'hero.ctaDownload': 'Pobierz v{version}',
    'hero.ctaGithub': 'Zobacz na GitHubie',
    'hero.metaWindows': 'Windows',
    'hero.metaMacos': 'macOS',
    'hero.metaLicense': 'Kod dostępny publicznie',
    'hero.tate': '静かに読む場所',
    'hero.portraitAlt': 'Kirei czyta po cichu',
    'hero.portraitCaption': 'Plansza 0 · Frontispis',

    'features.num': '§ I',
    'features.label': 'Spis treści',
    'features.heading': 'Wszystko, czego potrzebuje czytelnik, nic ponad to.',
    'features.body':
      'KireiManga powstała wokół tego, jak naprawdę czyta się mangę: folder po folderze i rozdział po rozdziale. Zestaw funkcji pozostaje celowo oszczędny. Ma być pod ręką, kiedy go potrzebujesz, i znikać z pola widzenia, kiedy go nie potrzebujesz.',

    'features.01.title': 'Przeglądanie MangaDex',
    'features.01.body':
      'Zakładki Popularne, Najnowsze i Najlepiej oceniane oraz wyszukiwanie po tytule, autorze, tagach, demografii i ocenach przez oficjalne API MangaDex.',
    'features.02.title': 'Biblioteka',
    'features.02.body':
      'Status obserwowania, status czytania i postęp rozdziałów dla serii z MangaDex i serii lokalnych w jednym miejscu.',
    'features.03.title': 'Import lokalny',
    'features.03.body':
      'Wskaż folder, przeskanuj CBZ, ZIP i serie z obrazów, sprawdź dopasowania i zaimportuj wszystko w jednym kroku.',
    'features.04.title': 'Czytnik bez rozpraszaczy',
    'features.04.body':
      'Pełny ekran, układ pojedynczy, podwójny albo webtoon, tryby dopasowania, obsługa klawiatury, RTL i strony podawane z dysku.',
    'features.05.title': 'Zakładki i postęp',
    'features.05.body':
      'Zapisuj zakładki z notatkami i wracaj dokładnie tam, gdzie skończyłeś, niezależnie od tego, czy rozdział jest lokalny, zdalny czy pobrany offline.',
    'features.06.title': 'Nakładka tłumaczeń',
    'features.06.body':
      'Wykrywanie dymków, manga OCR oraz tłumaczenia z DeepL, Google lub Ollama mogą być nanoszone bezpośrednio na stronę surowych japońskich wydań.',
    'features.07.title': 'Synchronizacja AniList',
    'features.07.body':
      'Logowanie przez OAuth, import listy i synchronizacja postępu czytania między aplikacją a AniList.',
    'features.08.title': 'Angielski i polski',
    'features.08.body':
      'Interfejs jest dostępny po angielsku i po polsku, a zmiana języka jest wbudowana od początku.',

    'gallery.num': '§ II',
    'gallery.label': 'Galeria',
    'gallery.heading': 'Zestaw spokojnych ekranów.',
    'gallery.body':
      'To zrzuty ekranu z aktualnej wersji. Każdy widok ma być czytelny, lekki i nie odciągać uwagi od przeglądania ani czytania.',

    'gallery.01.title': 'Biblioteka',
    'gallery.01.note':
      'Spokojna półka z szybkim wyszukiwaniem, filtrami i leniwym ładowaniem okładek, które pozostaje płynne nawet przy dużej kolekcji.',
    'gallery.01.alt': 'Widok biblioteki KireiManga z okładkami w uporządkowanej siatce',
    'gallery.02.title': 'Strona serii',
    'gallery.02.note':
      'Opis, rozdziały, status obserwowania i kierunek czytania na jednej przejrzystej stronie.',
    'gallery.02.alt': 'Strona serii z opisem i listą rozdziałów',
    'gallery.03.title': 'Import lokalny',
    'gallery.03.note':
      'Wybierz folder, przeskanuj archiwa albo katalogi z obrazami, sprawdź metadane i zatwierdź import.',
    'gallery.03.alt': 'Ekran przeglądu importu lokalnego',
    'gallery.04.title': 'Czytnik',
    'gallery.04.note':
      'Czytanie na pełnym ekranie z trybami dopasowania, obsługą klawiatury i kierunkiem czytania ustawianym dla każdej serii.',
    'gallery.04.alt': 'Czytnik KireiManga w trybie pełnoekranowym',

    'roadmap.num': '§ III',
    'roadmap.label': 'Kamienie milowe',
    'roadmap.heading': 'Długi projekt, wypuszczany rozdziałami.',
    'roadmap.body':
      'KireiManga rozwija się spokojnie i bez pośpiechu. Każdy kamień milowy dodaje jedną konkretną rzecz i trafia do wydania wtedy, gdy jest gotowy.',

    'roadmap.v01.title': 'Czytnik MangaDex',
    'roadmap.v01.desc':
      'API MangaDex, strumieniowanie rozdziałów, własna biblioteka, szkielet czytnika i śledzenie postępu.',
    'roadmap.v01.status': 'Wydane',
    'roadmap.v02.title': 'Biblioteka lokalna',
    'roadmap.v02.desc':
      'Import CBZ i folderów, wspólna biblioteka, lokalny czytnik, edytor metadanych, dopasowanie do MangaDex i odświeżanie folderów.',
    'roadmap.v02.status': 'Wydane · teraz',
    'roadmap.v03.title': 'Tłumaczenia',
    'roadmap.v03.desc':
      'Wykrywanie dymków, sidecar z manga OCR i nakładki tłumaczeń z DeepL, Google lub Ollama bezpośrednio na stronie.',
    'roadmap.v03.status': 'Planowane',
    'roadmap.v04.title': 'Synchronizacja AniList',
    'roadmap.v04.desc': 'Logowanie przez OAuth, dwukierunkowa synchronizacja postępu i pełny import listy mang.',
    'roadmap.v04.status': 'Planowane',
    'roadmap.v05.title': 'Dopracowanie',
    'roadmap.v05.desc':
      'Słownik kanji pod kursorem, eksport do Anki, dopracowanie tłumaczeń i funkcje społecznościowe.',
    'roadmap.v05.status': 'Backlog',

    'cta.num': '§ IV',
    'cta.label': 'Pobierz',
    'cta.heading': 'Zabierz Kirei do siebie.',
    'cta.body':
      'Pobierz najnowszą wersję dla Windowsa albo macOS. Aplikacja nie jest jeszcze podpisana, więc na stronie wydań są krótkie instrukcje dla SmartScreen w Windowsie i pierwszego uruchomienia w macOS.',
    'cta.download': 'Pobierz v{version}',
    'cta.source': 'Kod i zgłoszenia',
    'cta.platforms': 'Windows · macOS',

    'suite.num': '§ V',
    'suite.label': 'Pakiet Shiro',
    'suite.heading': 'Jedna spokojna półka na mangę, anime i muzykę.',
    'suite.body':
      'KireiManga to jedna z trzech siostrzanych aplikacji zbudowanych wokół tej samej idei — lokalnie, spokojnie, na co dzień. Różne repozytoria, wspólna architektura i język wizualny.',
    'suite.self': 'Czytnik mangi · jesteś tutaj',
    'suite.shiroani': 'Tracker anime',
    'suite.shiranami': 'Azyl dla muzyki',

    'changelog.label': 'Lista zmian',
    'changelog.heading': 'Co nowego?',
    'changelog.subtitle': 'Notatki do wydań pogrupowane według kamieni milowych. Każdy wpis opisuje to, co naprawdę trafiło do wersji.',
    'changelog.backHome': 'Wróć na stronę główną',
    'changelog.versionLabel': 'v{version}',

    'download.label': 'Pobierz',
    'download.heading': 'Wybierz wersję dla swojego systemu.',
    'download.subtitle':
      'KireiManga nadal nie jest podpisana. SmartScreen może marudzić w Windowsie, a macOS może zablokować pierwsze uruchomienie, ale oba przypadki da się łatwo obejść.',
    'download.mascotAlt': 'Kirei macha',
    'download.windows': 'Windows',
    'download.windowsExt': 'Instalator .exe',
    'download.macos': 'macOS',
    'download.macosExt': 'Obraz dysku .dmg',
    'download.yourSystem': 'Twój system',
    'download.detecting': 'Wykrywanie...',
    'download.primary': 'Pobierz dla {platform}',
    'download.secondary': 'Dostępne też dla {platform}',
    'download.open': 'Otwórz wydania na GitHubie',
    'download.notesTitle': 'Jeśli system protestuje...',
    'download.notesWindows':
      "Windows SmartScreen może ostrzec przy pierwszym uruchomieniu, bo instalator nie jest podpisany cyfrowo. Kliknij 'Więcej informacji', a potem 'Uruchom mimo to'.",
    'download.notesMacos':
      'macOS może zablokować pierwsze uruchomienie, bo plik .dmg nie jest notaryzowany. Przenieś aplikację do katalogu Aplikacje, potem otwórz Terminal i uruchom:',
    'download.notesMacosCmd': 'xattr -cr /Applications/KireiManga.app',
    'download.sourceLabel': 'Źródło',
    'download.notesSource':
      'Jeśli wolisz zbudować aplikację ze źródeł, sklonuj repozytorium, uruchom pnpm install, a potem pnpm package:win albo pnpm package:mac.',

    'footer.tagline': 'Czytaj dowolną mangę, w dowolnym języku.',
    'footer.body':
      'Desktopowy czytnik mangi działający lokalnie, z przeglądaniem MangaDex, importem CBZ i folderów, czytaniem offline oraz tłumaczeniami w planach.',
    'footer.project': 'Projekt',
    'footer.sisterApps': 'Siostrzane aplikacje',
    'footer.source': 'Kod na GitHubie',
    'footer.releases': 'Wydania',
    'footer.changelog': 'Lista zmian',
    'footer.issue': 'Zgłoś problem',
    'footer.colophon': 'Kod dostępny publicznie · v{version} · Autor',
    'footer.githubAria': 'KireiManga na GitHubie',
  },
};

export function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? `{${k}}`);
}
