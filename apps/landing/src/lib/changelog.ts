export type ChangelogLanguage = 'en' | 'pl';

export interface LocalizedText {
  en: string;
  pl: string;
}

export interface ChangelogCategory {
  label: LocalizedText;
  entries: LocalizedText[];
}

export interface ChangelogRelease {
  version: string;
  date: string;
  title: LocalizedText;
  description: LocalizedText;
  categories: ChangelogCategory[];
}

export interface ResolvedChangelogCategory {
  label: string;
  entries: string[];
}

export interface ResolvedChangelogRelease {
  version: string;
  date: string;
  title: string;
  description: string;
  categories: ResolvedChangelogCategory[];
}

const l = (en: string, pl: string): LocalizedText => ({ en, pl });

function localeFor(lang: ChangelogLanguage): string {
  return lang === 'pl' ? 'pl-PL' : 'en-US';
}

export function formatChangelogDate(date: string, lang: ChangelogLanguage): string {
  return new Intl.DateTimeFormat(localeFor(lang), {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${date}T00:00:00Z`));
}

export function getLocalizedChangelog(lang: ChangelogLanguage): ResolvedChangelogRelease[] {
  return changelog.map((release) => ({
    version: release.version,
    date: formatChangelogDate(release.date, lang),
    title: release.title[lang],
    description: release.description[lang],
    categories: release.categories.map((category) => ({
      label: category.label[lang],
      entries: category.entries.map((entry) => entry[lang]),
    })),
  }));
}

export const changelog: ChangelogRelease[] = [
  {
    version: '0.2.0',
    date: '2026-04-16',
    title: l('Local Library', 'Biblioteka lokalna'),
    description: l(
      "The Local Library milestone: first-class support for your own CBZ, ZIP, and folder-based manga alongside the existing MangaDex library. Unified reader, metadata editor, folder watching, and a Browse discovery feed that finally replaces the blank 'type to search' state.",
      'Kamień milowy Biblioteka lokalna: pełnoprawne wsparcie dla Twoich własnych archiwów CBZ, ZIP i folderów z obrazkami obok istniejącej biblioteki MangaDex. Wspólny czytnik, edytor metadanych, obserwowanie folderów oraz kanał odkrywania na stronie Przeglądaj, który wreszcie zastępuje pusty stan „zacznij pisać, aby szukać".'
    ),
    categories: [
      {
        label: l('Added', 'Dodano'),
        entries: [
          l(
            'Local import flow — pick a folder, scan for CBZ, ZIP, and image directories, review per-series metadata, commit the selection in one step.',
            'Przepływ importu lokalnego — wybierz folder, przeskanuj w poszukiwaniu CBZ, ZIP i katalogów z obrazkami, sprawdź metadane per seria, zatwierdź wybór jednym krokiem.'
          ),
          l(
            'Unified library that renders MangaDex and local series in the same shelf, with filters, sorting, and fuzzy search working across both.',
            'Zjednoczona biblioteka renderująca serie MangaDex i lokalne na jednej półce, z filtrami, sortowaniem i wyszukiwaniem fuzzy działającymi na obu źródłach.'
          ),
          l(
            'Local reader wired through a new kirei-page://local/ protocol that streams pages from CBZ/ZIP archives and image folders with content-type preserved.',
            'Czytnik lokalny podłączony przez nowy protokół kirei-page://local/ strumieniujący strony z archiwów CBZ/ZIP i folderów z obrazkami, z zachowaniem content-type.'
          ),
          l(
            'Series metadata editor — edit title, author, artist, tags, and reading direction for local and MangaDex-matched series alike.',
            'Edytor metadanych serii — edytuj tytuł, autora, rysownika, tagi i kierunek czytania zarówno dla serii lokalnych, jak i dopasowanych do MangaDex.'
          ),
          l(
            "'Match to MangaDex' action on local series: search MangaDex by title, attach a mangadexId, pull cover and metadata from the remote record.",
            'Akcja „Dopasuj do MangaDex" na seriach lokalnych: wyszukiwanie MangaDex po tytule, dołączenie mangadexId, pobranie okładki i metadanych z rekordu zdalnego.'
          ),
          l(
            'Browse discovery feed — three tabs (Popular, Latest, Top rated) replace the old blank search state, each backed by MangaDex sort parameters.',
            'Kanał odkrywania na stronie Przeglądaj — trzy zakładki (Popularne, Najnowsze, Najlepiej oceniane) zastępują stary pusty stan wyszukiwania, każda zasilana parametrami sortowania MangaDex.'
          ),
          l(
            "'In library' badge on Browse covers so already-followed titles are obvious without opening each card.",
            'Odznaka „W bibliotece" na okładkach w Przeglądaj, żeby już obserwowane tytuły były widoczne bez otwierania każdej karty.'
          ),
          l(
            'Infinite scroll on the Browse grid with a 24-per-page sentinel, respecting the MangaDex offset + limit ≤ 10 000 ceiling.',
            'Nieskończone przewijanie w siatce Przeglądaj z limitem 24 na stronę, z poszanowaniem pułapu MangaDex offset + limit ≤ 10 000.'
          ),
          l(
            "Bulk 'Download all' action on the chapter list — kicks off sequential downloads with a single click and surfaces progress per chapter.",
            'Akcja zbiorcza „Pobierz wszystko" na liście rozdziałów — uruchamia sekwencyjne pobieranie jednym kliknięciem i pokazuje postęp per rozdział.'
          ),
          l(
            'Per-folder update polling — local series with a root path are rescanned on a schedule and pick up new chapters without manual intervention.',
            'Polling aktualizacji per folder — serie lokalne z zapisaną ścieżką są ponownie skanowane według harmonogramu i same wychwytują nowe rozdziały.'
          ),
        ],
      },
      {
        label: l('Improvements', 'Ulepszenia'),
        entries: [
          l(
            'Download state now persists across navigation — leaving a series while chapters are downloading no longer loses progress or orphans the worker.',
            'Stan pobierania utrzymuje się teraz między nawigacjami — opuszczenie serii w trakcie pobierania rozdziałów nie gubi już postępu ani nie porzuca pracownika.'
          ),
          l(
            'Cache clear confirm dialog + is_downloaded flag reset — the chapter list is now honest about what is actually on disk.',
            'Okno potwierdzenia czyszczenia cache oraz reset flagi is_downloaded — lista rozdziałów pokazuje teraz zgodnie z prawdą, co rzeczywiście jest na dysku.'
          ),
          l(
            'Shadcn-style Select with proper keyboard focus rings, used across Settings, Filters, and the metadata editor.',
            'Select w stylu shadcn z porządnymi pierścieniami fokusu klawiatury, używany w Ustawieniach, Filtrach i edytorze metadanych.'
          ),
          l(
            'MangaDex tag chips on series detail are now translated and demographic-sorted for readability.',
            'Tagi MangaDex w szczegółach serii są teraz tłumaczone i sortowane demograficznie dla czytelności.'
          ),
        ],
      },
      {
        label: l('Known issues', 'Znane problemy'),
        entries: [
          l(
            "CBR (RAR) archives are deferred to a follow-up milestone — unrar licensing still hasn't been resolved.",
            'Archiwa CBR (RAR) są przesunięte do następnego kamienia milowego — licencja unrar wciąż nierozwiązana.'
          ),
          l(
            "Auto-update channel is not yet wired on macOS. Fetch new builds manually from the Releases page until it's in place.",
            'Kanał automatycznych aktualizacji nie jest jeszcze podłączony na macOS. Pobieraj nowe wersje ręcznie ze strony Wydań, zanim zostanie podłączony.'
          ),
        ],
      },
    ],
  },
  {
    version: '0.1.0',
    date: '2026-04-16',
    title: l('MangaDex Reader', 'Czytnik MangaDex'),
    description: l(
      "First public preview: the MangaDex Reader milestone. A local-first desktop shell (Electron + embedded NestJS + SQLite) that browses MangaDex through the official API, keeps an internal library, and reads chapters in a quiet editorial reader — single, double, or webtoon, keyboard-first, offline-friendly.",
      'Pierwsza publiczna wersja zapoznawcza: kamień milowy Czytnik MangaDex. Lokalna powłoka desktopowa (Electron + wbudowany NestJS + SQLite), która przegląda MangaDex przez oficjalne API, prowadzi wewnętrzną bibliotekę i czyta rozdziały w cichym czytniku edytorskim — pojedyncza, podwójna lub webtoon, klawiatura przede wszystkim, przyjazna dla trybu offline.'
    ),
    categories: [
      {
        label: l('Added', 'Dodano'),
        entries: [
          l(
            'MangaDex HTTP client with per-endpoint rate limiting, retry/backoff, and a KireiManga user agent. All traffic proxied through the backend.',
            'Klient HTTP MangaDex z limitowaniem przepustowości per endpoint, ponawianiem/backoff i user agentem KireiManga. Cały ruch proxowany przez backend.'
          ),
          l(
            'Editorial Browse page — hairline search bar, filter chips, masthead with result count, and a cover grid backed by the kirei-cover:// proxy.',
            'Redakcyjna strona Przeglądaj — cienka wyszukiwarka, chipy filtrów, nagłówek z liczbą wyników i siatka okładek zasilana proxy kirei-cover://.'
          ),
          l(
            'Series detail route with banner cover, Fraunces title, hairline metadata row, follow toggle, tag chips, and a chapter list with language filter.',
            'Trasa szczegółów serii z okładką-banerem, tytułem w Fraunces, cienkim wierszem metadanych, przełącznikiem obserwowania, chipami tagów i listą rozdziałów z filtrem języka.'
          ),
          l(
            'Follow / unfollow persisted in SQLite. Optimistic toggle with rollback + toast on error. library:changed events keep surfaces in sync.',
            'Obserwowanie / przestanie obserwowania zapisywane w SQLite. Optymistyczny przełącznik z rollbackiem i toastem przy błędzie. Zdarzenia library:changed utrzymują ekrany w synchronizacji.'
          ),
          l(
            'Library page in two views (grid + list), sortable by title, last-read, date-added, and progress; filterable by reading status.',
            'Strona Biblioteka w dwóch widokach (siatka + lista), sortowalna po tytule, ostatnim czytaniu, dacie dodania i postępie; filtrowana po statusie czytania.'
          ),
          l(
            'Reader route with three layouts: single page, double page (auto-pairs from page 2 after the cover), and webtoon. Fit modes: width, height, original.',
            'Trasa czytnika z trzema układami: pojedyncza strona, podwójna strona (auto-parowanie od strony 2 po okładce) i webtoon. Tryby dopasowania: szerokość, wysokość, oryginał.'
          ),
          l(
            'Keyboard navigation: arrows / A / D (RTL-aware), Space, Enter, Home, End, F for fullscreen, number keys for fit modes.',
            'Nawigacja klawiaturą: strzałki / A / D (świadome RTL), Spacja, Enter, Home, End, F dla pełnego ekranu, klawisze numeryczne dla trybów dopasowania.'
          ),
          l(
            'Per-series reader preferences (mode, direction, fit) persisted in SQLite via reader:set-prefs.',
            'Preferencje czytnika per seria (tryb, kierunek, dopasowanie) zapisywane w SQLite przez reader:set-prefs.'
          ),
          l(
            'Progress tracking: lastReadAt, lastReadPage, and an isRead flip when the final page of a chapter is reached. Resume buttons in library and series detail.',
            'Śledzenie postępu: lastReadAt, lastReadPage oraz przełączenie isRead po osiągnięciu ostatniej strony rozdziału. Przyciski wznawiania w bibliotece i szczegółach serii.'
          ),
          l(
            'Offline cache — mangadex:download-chapter streams every page to disk, kirei-page:// checks the cache before the network, cached chapters read offline.',
            'Cache offline — mangadex:download-chapter strumieniuje każdą stronę na dysk, kirei-page:// sprawdza cache przed siecią, rozdziały z cache czyta się bez sieci.'
          ),
          l(
            'Followed-series update poller — runs on startup and every 6 h, surfaces new-chapter badges on library tiles.',
            'Poller aktualizacji obserwowanych serii — uruchamia się na starcie i co 6 godzin, pokazuje odznaki nowych rozdziałów na kafelkach biblioteki.'
          ),
          l(
            'Bookmarks: B toggles a bookmark on the current reader page; Bookmarks panel in series detail, grouped by chapter.',
            'Zakładki: B przełącza zakładkę na bieżącej stronie czytnika; panel Zakładek w szczegółach serii, pogrupowany po rozdziale.'
          ),
          l(
            'Settings hub: Appearance (theme: sumi / washi, font size, reading font), Reader Defaults, Library (default language, cache size + clear), Keyboard map.',
            'Centrum Ustawień: Wygląd (motyw: sumi / washi, rozmiar czcionki, czcionka czytania), Domyślne Czytnika, Biblioteka (domyślny język, rozmiar cache + czyszczenie), Mapa klawiatury.'
          ),
          l(
            'Tiny dependency-free i18n layer. English + Polish shipped. Polish dictionary flagged for native review.',
            'Maleńka warstwa i18n bez zależności. Angielski + polski w komplecie. Słownik polski oflagowany do recenzji natywnej.'
          ),
        ],
      },
      {
        label: l('Infrastructure', 'Infrastruktura'),
        entries: [
          l(
            'pnpm workspace monorepo: apps/desktop (Electron + NestJS), apps/web (Vite + React + Tailwind 4), packages/shared.',
            'Monorepo pnpm: apps/desktop (Electron + NestJS), apps/web (Vite + React + Tailwind 4), packages/shared.'
          ),
          l(
            'Shared *.Events enums for every socket channel — single source of truth across the IPC boundary.',
            'Wspólne enumeracje *.Events dla każdego kanału socket — jedno źródło prawdy po obu stronach IPC.'
          ),
          l(
            'Custom protocols (kirei-cover://, kirei-page://) registered with bypassCSP: false and secure: true.',
            'Niestandardowe protokoły (kirei-cover://, kirei-page://) zarejestrowane z bypassCSP: false i secure: true.'
          ),
          l(
            'Strict CSP in production. api.mangadex.org and uploads.mangadex.org reachable only from the main process.',
            'Ścisłe CSP w produkcji. api.mangadex.org i uploads.mangadex.org dostępne tylko z procesu głównego.'
          ),
          l(
            'Jest test backend swapped from native better-sqlite3 to pure-WASM sql.js so the suite runs without a node-gyp toolchain.',
            'Backend testowy Jest przełączony z natywnego better-sqlite3 na czysto-WASM sql.js, żeby pakiet testów działał bez toolchainu node-gyp.'
          ),
        ],
      },
    ],
  },
];
