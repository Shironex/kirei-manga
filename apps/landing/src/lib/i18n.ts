export const LANDING_LANGUAGES = ['en', 'pl'] as const;
export type LandingLanguage = (typeof LANDING_LANGUAGES)[number];

export const translations: Record<LandingLanguage, Record<string, string>> = {
  en: {
    // Shared
    'layout.skipToContent': 'Skip to content',
    'brand.iconAlt': 'KireiManga icon',

    // Navbar
    'nav.primary': 'Primary navigation',
    'nav.features': 'Features',
    'nav.gallery': 'Gallery',
    'nav.roadmap': 'Roadmap',
    'nav.suite': 'Shiro Suite',
    'nav.changelog': 'Changelog',
    'nav.github': 'GitHub',
    'nav.download': 'Download',
    'nav.issue': 'ISSUE №{version}',
    'nav.switchLanguage': 'Switch language',
    'nav.toggleMenu': 'Toggle menu',

    // Hero
    'hero.eyebrowBrand': '綺麗漫画 · KireiManga',
    'hero.eyebrowMilestone': 'v{version} · Local Library',
    'hero.titleHtml': 'Read any manga,<br />in <em>any</em> language.',
    'hero.subhead':
      "A quiet, local-first desktop reader. Browse MangaDex, keep a library in SQLite, and read your own CBZ files and folders side-by-side — all in one ink-and-paper reading room. No dashboards. No neon. Just a shelf to come home to.",
    'hero.ctaDownload': 'Download v{version}',
    'hero.ctaGithub': 'View on GitHub',
    'hero.metaWindows': 'Windows',
    'hero.metaMacos': 'macOS',
    'hero.metaLicense': 'Source-available',
    'hero.tate': '静かに読む場所',
    'hero.portraitAlt': 'Kirei reading quietly',
    'hero.portraitCaption': 'Pl. 0 · Frontispiece',

    // Features
    'features.num': '§ I',
    'features.label': 'Contents',
    'features.heading': 'Everything a reader needs, nothing that shouts.',
    'features.body':
      "KireiManga was built around the way people actually read — one folder at a time, one chapter at a time. Features are restrained by design: present when you need them, invisible when you don't. What follows is the table of contents.",

    'features.01.title': 'MangaDex Browse',
    'features.01.body':
      "Discovery tabs (Popular, Latest, Top rated) plus keyword search across title, author, tag, demographic, and rating — straight through MangaDex's official API.",
    'features.02.title': 'Internal Library',
    'features.02.body':
      'Follow and unfollow titles, keep reading status (reading, completed, plan to read, on hold, dropped), track resume points per chapter — MangaDex and local alike.',
    'features.03.title': 'Local Import',
    'features.03.body':
      'Point it at a folder. Scan CBZ, ZIP, and image-directory series, review matches, commit with a single click. Works alongside MangaDex under the same shelf.',
    'features.04.title': 'Distraction-free Reader',
    'features.04.body':
      'Full-screen reader with single, double, and webtoon modes, fit variations, keyboard navigation, per-series RTL preference, and cached pages served from disk.',
    'features.05.title': 'Bookmarks & Progress',
    'features.05.body':
      'Per-page bookmarks with notes. Resume exactly where you stopped on every chapter, local or remote. Downloaded chapters work offline — no network needed.',
    'features.06.title': 'Translation Overlay',
    'features.06.body':
      'C++ OpenCV bubble detection, manga-ocr Python sidecar, and DeepL / Google / Ollama translations rendered directly on the page. For raw Japanese releases.',
    'features.07.title': 'AniList Sync',
    'features.07.body':
      'OAuth login, list import, two-way progress sync. Your reading follows you between the app and AniList without manual reconciliation.',
    'features.08.title': 'English & Polski',
    'features.08.body':
      'Full i18n out of the box. The interface reads in English or Polish with a single toggle. Translation corrections welcome via pull request.',

    // Gallery
    'gallery.num': '§ II',
    'gallery.label': 'Plates',
    'gallery.heading': "A book's worth of quiet surfaces.",
    'gallery.body':
      'Interface frames from the current release, numbered like plates in a studio monograph. Each view was drawn to carry its weight without asking the reader for attention.',

    'gallery.01.title': 'Library',
    'gallery.01.note':
      'Your shelf — quiet, kept, and search-indexed. Cover grid renders lazily so thousands of titles scroll without jank.',
    'gallery.01.alt': 'KireiManga library view with covers in a quiet grid',
    'gallery.02.title': 'Series Detail',
    'gallery.02.note':
      'Synopsis, chapters, follow status, and reading direction — all on one restrained page.',
    'gallery.02.alt': 'Series detail page showing synopsis and chapter list',
    'gallery.03.title': 'Local Import',
    'gallery.03.note':
      'Point at a folder. Scan CBZ, ZIP, or image directories. Review per-series metadata. Commit in one step.',
    'gallery.03.alt': 'Local import review screen',
    'gallery.04.title': 'Reader',
    'gallery.04.note':
      'Full-screen, fit-aware, keyboard-first. Single, double, and webtoon modes with per-series right-to-left preference.',
    'gallery.04.alt': 'KireiManga reader in full-screen mode',

    // Roadmap
    'roadmap.num': '§ III',
    'roadmap.label': 'Milestones',
    'roadmap.heading': 'A long project, read in chapters.',
    'roadmap.body':
      "KireiManga is released slowly and deliberately. Each milestone ships one well-chosen capability and ends when it's solid — not when the calendar says.",

    'roadmap.v01.title': 'MangaDex Reader',
    'roadmap.v01.desc':
      'MangaDex API, chapter streaming, internal library, reader shell, progress tracking.',
    'roadmap.v01.status': 'Shipped',
    'roadmap.v02.title': 'Local Library',
    'roadmap.v02.desc':
      'CBZ & folder import, unified library, local reader, metadata editor, MangaDex match, folder update polling.',
    'roadmap.v02.status': 'Shipped · now',
    'roadmap.v03.title': 'Translation',
    'roadmap.v03.desc':
      'C++ OpenCV bubble detection, manga-ocr sidecar, DeepL / Google / Ollama overlay rendered on page.',
    'roadmap.v03.status': 'Planned',
    'roadmap.v04.title': 'AniList Sync',
    'roadmap.v04.desc': 'OAuth login, two-way read-progress sync, full manga-list import.',
    'roadmap.v04.status': 'Planned',
    'roadmap.v05.title': 'Polish',
    'roadmap.v05.desc':
      'Kanji hover dictionary, Anki export, translation corrections, community features.',
    'roadmap.v05.status': 'Backlog',

    // CTA
    'cta.num': '§ IV',
    'cta.label': 'Download',
    'cta.heading': 'Bring Kirei home.',
    'cta.body':
      "Grab the latest build for Windows or macOS. It's unsigned — the Releases page has the two Terminal commands you'll need on macOS, and a quick SmartScreen note for Windows.",
    'cta.download': 'Download v{version}',
    'cta.source': 'Source & issues',
    'cta.platforms': 'Windows · macOS',

    // Suite
    'suite.num': '§ V',
    'suite.label': 'Shiro Suite',
    'suite.heading': 'One quiet shelf for manga, anime, and music.',
    'suite.body':
      'KireiManga shares monorepo patterns and design language with two sister apps. Each one is built around the same idea — local-first, calm, and out of the way when you just want to read, watch, or listen.',
    'suite.self': 'Manga reader · you are here',
    'suite.shiroani': 'Anime tracker',
    'suite.shiranami': 'Music sanctuary',

    // Changelog page
    'changelog.label': 'Changelog',
    'changelog.heading': "What's new?",
    'changelog.subtitle':
      "Release notes, by milestone. KireiManga ships slowly — each entry here is a chapter that shipped, not a sprint that ended.",
    'changelog.backHome': 'Back to home',
    'changelog.versionLabel': 'v{version}',

    // Download page
    'download.label': 'Download',
    'download.heading': 'Pick the build that fits your desk.',
    'download.subtitle':
      "KireiManga ships unsigned for now. SmartScreen will grumble on Windows; macOS will block the first open. Both are one click (or one Terminal command) past.",
    'download.mascotAlt': 'Kirei waving',
    'download.windows': 'Windows',
    'download.windowsExt': '.exe installer',
    'download.macos': 'macOS',
    'download.macosExt': '.dmg disk image',
    'download.yourSystem': 'Your system',
    'download.detecting': 'Detecting…',
    'download.primary': 'Download for {platform}',
    'download.secondary': 'Also available for {platform}',
    'download.open': 'Open Releases on GitHub',
    'download.notesTitle': "If your OS complains…",
    'download.notesWindows': "Windows SmartScreen will warn on first run because the installer isn't code-signed. Click 'More info', then 'Run anyway'.",
    'download.notesMacos':
      "macOS will block the first launch because the .dmg isn't notarised. Drag the app to Applications, then open Terminal and run:",
    'download.notesMacosCmd': 'xattr -cr /Applications/KireiManga.app',
    'download.notesSource':
      "Rather build from source? Clone the repo, run pnpm install, then pnpm package:win or pnpm package:mac.",

    // Footer
    'footer.tagline': 'Read any manga, in any language.',
    'footer.body':
      'A local-first desktop manga reader. MangaDex browsing, CBZ and folder import, offline cache, and translation overlay on the horizon.',
    'footer.project': 'Project',
    'footer.sisterApps': 'Sister apps',
    'footer.source': 'Source on GitHub',
    'footer.releases': 'Releases',
    'footer.changelog': 'Changelog',
    'footer.issue': 'Report an issue',
    'footer.colophon': 'Source-available · v{version} · Built by',
    'footer.githubAria': 'KireiManga on GitHub',
  },

  pl: {
    // Shared
    'layout.skipToContent': 'Przejdź do treści',
    'brand.iconAlt': 'Ikona KireiManga',

    // Navbar
    'nav.primary': 'Nawigacja główna',
    'nav.features': 'Funkcje',
    'nav.gallery': 'Galeria',
    'nav.roadmap': 'Plan rozwoju',
    'nav.suite': 'Pakiet Shiro',
    'nav.changelog': 'Lista zmian',
    'nav.github': 'GitHub',
    'nav.download': 'Pobierz',
    'nav.issue': 'NUMER №{version}',
    'nav.switchLanguage': 'Zmień język',
    'nav.toggleMenu': 'Menu',

    // Hero
    'hero.eyebrowBrand': '綺麗漫画 · KireiManga',
    'hero.eyebrowMilestone': 'v{version} · Biblioteka lokalna',
    'hero.titleHtml': 'Czytaj dowolną mangę,<br />w <em>dowolnym</em> języku.',
    'hero.subhead':
      'Cicha, lokalna aplikacja do czytania mangi na komputer. Przeglądaj MangaDex, prowadź bibliotekę w SQLite i czytaj własne pliki CBZ i foldery obok siebie — wszystko w jednej, papierowej czytelni. Bez paneli. Bez neonu. Tylko półka, do której chce się wracać.',
    'hero.ctaDownload': 'Pobierz v{version}',
    'hero.ctaGithub': 'Zobacz na GitHubie',
    'hero.metaWindows': 'Windows',
    'hero.metaMacos': 'macOS',
    'hero.metaLicense': 'Kod dostępny publicznie',
    'hero.tate': '静かに読む場所',
    'hero.portraitAlt': 'Kirei czyta cicho',
    'hero.portraitCaption': 'Pl. 0 · Frontispis',

    // Features
    'features.num': '§ I',
    'features.label': 'Spis treści',
    'features.heading': 'Wszystko, co potrzebne czytelnikowi — nic więcej.',
    'features.body':
      'KireiManga została zbudowana wokół tego, jak naprawdę czyta się mangę — folder po folderze, rozdział po rozdziale. Funkcje są celowo stonowane: są, gdy ich potrzebujesz, niewidoczne, gdy ich nie potrzebujesz. Poniżej spis treści.',

    'features.01.title': 'Przeglądanie MangaDex',
    'features.01.body':
      'Zakładki odkrywania (Popularne, Najnowsze, Najlepiej oceniane) oraz wyszukiwanie po tytule, autorze, tagach, demografii i ocenie — przez oficjalne API MangaDex.',
    'features.02.title': 'Wewnętrzna biblioteka',
    'features.02.body':
      'Obserwuj i przestań obserwować tytuły, prowadź status czytania (czytane, ukończone, planowane, wstrzymane, porzucone), śledź punkty wznowienia w każdym rozdziale — zarówno dla MangaDex, jak i lokalnie.',
    'features.03.title': 'Import lokalny',
    'features.03.body':
      'Wskaż folder. Przeskanuj serie CBZ, ZIP i katalogi z obrazkami, sprawdź dopasowania, zatwierdź jednym kliknięciem. Działa obok MangaDex pod tą samą półką.',
    'features.04.title': 'Czytnik bez rozproszeń',
    'features.04.body':
      'Pełnoekranowy czytnik z trybem pojedynczym, podwójnym i webtoon, z dopasowaniami, nawigacją klawiaturą, preferencją RTL per seria i stronami serwowanymi z dysku.',
    'features.05.title': 'Zakładki i postęp',
    'features.05.body':
      'Zakładki per strona z notatkami. Wznawiaj dokładnie tam, gdzie skończyłeś — lokalnie lub zdalnie. Pobrane rozdziały działają offline, bez sieci.',
    'features.06.title': 'Nakładka tłumaczeń',
    'features.06.body':
      'Detekcja dymków w C++ (OpenCV), sidecar manga-ocr i tłumaczenia DeepL / Google / Ollama renderowane bezpośrednio na stronie. Do surowych wydań japońskich.',
    'features.07.title': 'Synchronizacja AniList',
    'features.07.body':
      'Logowanie OAuth, import listy, dwukierunkowa synchronizacja postępu. Twoje czytanie podąża za tobą między aplikacją a AniList, bez ręcznego godzenia.',
    'features.08.title': 'Polski i angielski',
    'features.08.body':
      'Pełne i18n w standardzie. Interfejs czyta po polsku lub angielsku, jednym przełącznikiem. Poprawki tłumaczeń mile widziane przez pull request.',

    // Gallery
    'gallery.num': '§ II',
    'gallery.label': 'Plansze',
    'gallery.heading': 'Cała książka cichych powierzchni.',
    'gallery.body':
      'Kadry interfejsu z aktualnego wydania, numerowane jak plansze w monografii. Każdy widok został narysowany tak, by nieść swoją rolę bez proszenia czytelnika o uwagę.',

    'gallery.01.title': 'Biblioteka',
    'gallery.01.note':
      'Twoja półka — cicha, uporządkowana, z indeksem wyszukiwania. Okładki renderują się leniwie, więc tysiące tytułów przewijają się bez zacięć.',
    'gallery.01.alt': 'Widok biblioteki KireiManga z okładkami w cichej siatce',
    'gallery.02.title': 'Strona serii',
    'gallery.02.note':
      'Opis, rozdziały, status obserwowania i kierunek czytania — wszystko na jednej, stonowanej stronie.',
    'gallery.02.alt': 'Strona serii z opisem i listą rozdziałów',
    'gallery.03.title': 'Import lokalny',
    'gallery.03.note':
      'Wskaż folder. Przeskanuj CBZ, ZIP lub katalogi z obrazkami. Sprawdź metadane per seria. Zatwierdź jednym krokiem.',
    'gallery.03.alt': 'Ekran sprawdzania importu lokalnego',
    'gallery.04.title': 'Czytnik',
    'gallery.04.note':
      'Pełny ekran, dopasowanie, obsługa klawiatury. Tryb pojedynczy, podwójny i webtoon z preferencją prawo-do-lewa per seria.',
    'gallery.04.alt': 'Czytnik KireiManga w trybie pełnoekranowym',

    // Roadmap
    'roadmap.num': '§ III',
    'roadmap.label': 'Kamienie milowe',
    'roadmap.heading': 'Długi projekt, czytany w rozdziałach.',
    'roadmap.body':
      'KireiManga jest wydawana powoli i z namysłem. Każdy kamień milowy dostarcza jedną dobrze wybraną możliwość i kończy się, gdy jest solidna — nie wtedy, gdy każe kalendarz.',

    'roadmap.v01.title': 'Czytnik MangaDex',
    'roadmap.v01.desc':
      'API MangaDex, streaming rozdziałów, wewnętrzna biblioteka, szkielet czytnika, śledzenie postępu.',
    'roadmap.v01.status': 'Wydane',
    'roadmap.v02.title': 'Biblioteka lokalna',
    'roadmap.v02.desc':
      'Import CBZ i folderów, zjednoczona biblioteka, czytnik lokalny, edytor metadanych, dopasowanie MangaDex, polling folderów.',
    'roadmap.v02.status': 'Wydane · teraz',
    'roadmap.v03.title': 'Tłumaczenia',
    'roadmap.v03.desc':
      'Detekcja dymków w C++ (OpenCV), sidecar manga-ocr, nakładka DeepL / Google / Ollama renderowana na stronie.',
    'roadmap.v03.status': 'Planowane',
    'roadmap.v04.title': 'Synchronizacja AniList',
    'roadmap.v04.desc':
      'Logowanie OAuth, dwukierunkowa synchronizacja postępu, pełny import listy mangi.',
    'roadmap.v04.status': 'Planowane',
    'roadmap.v05.title': 'Dopracowanie',
    'roadmap.v05.desc':
      'Słownik kanji pod kursorem, eksport do Anki, poprawki tłumaczeń, funkcje społecznościowe.',
    'roadmap.v05.status': 'W zapasie',

    // CTA
    'cta.num': '§ IV',
    'cta.label': 'Pobierz',
    'cta.heading': 'Zabierz Kirei do domu.',
    'cta.body':
      'Pobierz najnowszą wersję dla Windowsa lub macOS. Aplikacja nie jest podpisana — strona Wydań ma dwie komendy do Terminala dla macOS oraz krótką notkę o SmartScreen dla Windowsa.',
    'cta.download': 'Pobierz v{version}',
    'cta.source': 'Kod i zgłoszenia',
    'cta.platforms': 'Windows · macOS',

    // Suite
    'suite.num': '§ V',
    'suite.label': 'Pakiet Shiro',
    'suite.heading': 'Jedna cicha półka na mangę, anime i muzykę.',
    'suite.body':
      'KireiManga dzieli układ monorepo i język projektowy z dwoma siostrzanymi aplikacjami. Każda z nich zbudowana jest wokół tej samej idei — lokalnie, spokojnie i bez wchodzenia w drogę, gdy chcesz tylko czytać, oglądać lub słuchać.',
    'suite.self': 'Czytnik mangi · jesteś tutaj',
    'suite.shiroani': 'Tracker anime',
    'suite.shiranami': 'Sanktuarium muzyczne',

    // Changelog page
    'changelog.label': 'Lista zmian',
    'changelog.heading': 'Co nowego?',
    'changelog.subtitle':
      'Notatki wydań, według kamieni milowych. KireiManga jest wydawana powoli — każda pozycja tutaj to rozdział, który się ukazał, a nie sprint, który się skończył.',
    'changelog.backHome': 'Wróć do strony głównej',
    'changelog.versionLabel': 'v{version}',

    // Download page
    'download.label': 'Pobierz',
    'download.heading': 'Wybierz wersję dopasowaną do Twojego biurka.',
    'download.subtitle':
      'KireiManga jest na razie niepodpisana. SmartScreen na Windowsie będzie marudzić; macOS zablokuje pierwsze otwarcie. Oba przypadki są jedno kliknięcie (lub jedną komendę Terminala) stąd.',
    'download.mascotAlt': 'Kirei macha',
    'download.windows': 'Windows',
    'download.windowsExt': 'Instalator .exe',
    'download.macos': 'macOS',
    'download.macosExt': 'Obraz dysku .dmg',
    'download.yourSystem': 'Twój system',
    'download.detecting': 'Wykrywanie…',
    'download.primary': 'Pobierz dla {platform}',
    'download.secondary': 'Dostępne też dla {platform}',
    'download.open': 'Otwórz Wydania na GitHubie',
    'download.notesTitle': 'Jeśli Twój system się skrzywi…',
    'download.notesWindows':
      'SmartScreen na Windowsie ostrzeże przy pierwszym uruchomieniu, bo instalator nie jest podpisany cyfrowo. Kliknij „Więcej informacji", potem „Uruchom mimo to".',
    'download.notesMacos':
      'macOS zablokuje pierwsze uruchomienie, bo .dmg nie jest notaryzowany. Przeciągnij aplikację do Aplikacji, otwórz Terminal i wpisz:',
    'download.notesMacosCmd': 'xattr -cr /Applications/KireiManga.app',
    'download.notesSource':
      'Wolisz zbudować ze źródeł? Sklonuj repozytorium, uruchom pnpm install, potem pnpm package:win lub pnpm package:mac.',

    // Footer
    'footer.tagline': 'Czytaj dowolną mangę, w dowolnym języku.',
    'footer.body':
      'Lokalna aplikacja do czytania mangi na komputer. Przeglądanie MangaDex, import CBZ i folderów, cache offline i nakładka tłumaczeń na horyzoncie.',
    'footer.project': 'Projekt',
    'footer.sisterApps': 'Aplikacje siostrzane',
    'footer.source': 'Kod na GitHubie',
    'footer.releases': 'Wydania',
    'footer.changelog': 'Lista zmian',
    'footer.issue': 'Zgłoś problem',
    'footer.colophon': 'Kod dostępny publicznie · v{version} · Zbudowane przez',
    'footer.githubAria': 'KireiManga na GitHubie',
  },
};

/** Replaces `{version}` and other `{key}` placeholders in a translation string. */
export function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? `{${k}}`);
}
