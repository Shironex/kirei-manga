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
  return changelog.map(release => ({
    version: release.version,
    date: formatChangelogDate(release.date, lang),
    title: release.title[lang],
    description: release.description[lang],
    categories: release.categories.map(category => ({
      label: category.label[lang],
      entries: category.entries.map(entry => entry[lang]),
    })),
  }));
}

export const changelog: ChangelogRelease[] = [
  {
    version: '0.2.0',
    date: '2026-04-17',
    title: l('Local Library', 'Biblioteka lokalna'),
    description: l(
      "The Local Library milestone adds full support for your own CBZ files, ZIP archives, and image folders alongside MangaDex. It brings one shared reader, metadata editing, folder watching, and a proper Browse feed in place of the old empty search screen.",
      'Kamień milowy Biblioteka lokalna dodaje pełne wsparcie dla własnych plików CBZ, archiwów ZIP i folderów z obrazami obok MangaDex. Wspólny czytnik, edycja metadanych, obserwowanie folderów i pełny kanał Przeglądaj zastępują dawny pusty ekran wyszukiwania.'
    ),
    categories: [
      {
        label: l('Added', 'Dodano'),
        entries: [
          l(
            'A local import flow that lets you choose a folder, scan CBZ, ZIP, and image based series, review metadata, and confirm the selection in one pass.',
            'Nowy import lokalny pozwala wskazać folder, przeskanować serie z CBZ, ZIP i obrazów, sprawdzić metadane i zatwierdzić wybór w jednym przebiegu.'
          ),
          l(
            'A unified library that shows MangaDex series and local series on the same shelf, with shared filters, sorting, and fuzzy search.',
            'Wspólna biblioteka pokazuje serie z MangaDex i serie lokalne na jednej półce, z tymi samymi filtrami, sortowaniem i wyszukiwaniem rozmytym.'
          ),
          l(
            'A local reader served through the new kirei-page://local/ protocol, streaming pages from CBZ and ZIP archives as well as image folders while preserving content type.',
            'Lokalny czytnik działa przez nowy protokół kirei-page://local/ i strumieniuje strony z archiwów CBZ i ZIP oraz folderów z obrazami, zachowując poprawny content type.'
          ),
          l(
            'A series metadata editor for title, author, artist, tags, and reading direction on local series and MangaDex matched series.',
            'Edytor metadanych serii pozwala zmieniać tytuł, autora, rysownika, tagi i kierunek czytania zarówno dla serii lokalnych, jak i dopasowanych do MangaDex.'
          ),
          l(
            "A 'Match to MangaDex' action on local series that searches by title, attaches a mangadexId, and pulls the remote cover plus metadata.",
            'Akcja „Dopasuj do MangaDex” na seriach lokalnych wyszukuje tytuł, przypina mangadexId i pobiera zdalną okładkę oraz metadane.'
          ),
          l(
            'A Browse discovery feed with Popular, Latest, and Top rated tabs in place of the old blank search state.',
            'Kanał odkrywania w zakładce Przeglądaj z kartami Popularne, Najnowsze i Najlepiej oceniane zastępuje stary pusty ekran wyszukiwania.'
          ),
          l(
            "An 'In library' badge on Browse covers so followed titles are visible at a glance.",
            'Odznaka „W bibliotece” na okładkach w Przeglądaj pozwala od razu zobaczyć śledzone tytuły.'
          ),
          l(
            'Infinite scroll on the Browse grid with 24 items per page, while staying within the MangaDex offset and limit cap.',
            'Nieskończone przewijanie siatki w Przeglądaj ładuje 24 pozycje naraz i pilnuje limitów offsetu oraz zakresu w MangaDex.'
          ),
          l(
            "A bulk 'Download all' action on the chapter list that starts sequential downloads with one click and shows progress for each chapter.",
            'Zbiorcza akcja „Pobierz wszystko” na liście rozdziałów uruchamia sekwencyjne pobieranie jednym kliknięciem i pokazuje postęp każdego rozdziału.'
          ),
          l(
            'Scheduled rescans for local series with a saved root path, so new chapters can appear without manual work.',
            'Zaplanowane ponowne skanowanie serii lokalnych z zapisaną ścieżką główną pozwala wykrywać nowe rozdziały bez ręcznej ingerencji.'
          ),
        ],
      },
      {
        label: l('Improvements', 'Ulepszenia'),
        entries: [
          l(
            'Download state now survives navigation, so leaving a series during downloads no longer loses progress or abandons the worker.',
            'Stan pobierania przetrwa teraz zmianę widoku, więc wyjście z serii w trakcie pobierania nie gubi postępu ani nie porzuca procesu.'
          ),
          l(
            'Clearing the cache now also resets the is_downloaded flag, so the chapter list matches what is really on disk.',
            'Czyszczenie pamięci podręcznej resetuje teraz także flagę is_downloaded, więc lista rozdziałów pokazuje to, co naprawdę jest na dysku.'
          ),
          l(
            'The Select component now has proper keyboard focus styling across Settings, Filters, and the metadata editor.',
            'Komponent Select ma teraz poprawny fokus klawiatury w Ustawieniach, Filtrach i edytorze metadanych.'
          ),
          l(
            'MangaDex tag chips on the series page are now translated and sorted more clearly.',
            'Tagi MangaDex na stronie serii są teraz tłumaczone i czytelniej uporządkowane.'
          ),
        ],
      },
      {
        label: l('Known issues', 'Znane problemy'),
        entries: [
          l(
            'CBR and RAR support is still postponed to a follow up milestone because the unrar licensing question is unresolved.',
            'Obsługa CBR i RAR nadal jest odłożona na kolejny kamień milowy, bo kwestia licencji unrar pozostaje nierozwiązana.'
          ),
          l(
            'The automatic update channel is not yet wired on macOS, so new builds still need to be downloaded manually from Releases.',
            'Kanał automatycznych aktualizacji nie jest jeszcze podłączony na macOS, więc nowe wersje nadal trzeba pobierać ręcznie ze strony wydań.'
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
      'The first public preview of KireiManga introduced a local first desktop shell built with Electron, embedded NestJS, and SQLite. It focused on browsing MangaDex through the official API, keeping an internal library, and reading chapters in a quiet, keyboard friendly reader.',
      'Pierwsza publiczna wersja KireiManga wprowadziła lokalną aplikację desktopową opartą na Electronie, osadzonym NestJS i SQLite. Skupiła się na przeglądaniu MangaDex przez oficjalne API, własnej bibliotece i spokojnym czytniku obsługiwanym wygodnie z klawiatury.'
    ),
    categories: [
      {
        label: l('Added', 'Dodano'),
        entries: [
          l(
            'A MangaDex HTTP client with per endpoint rate limiting, retries, backoff, and a dedicated KireiManga user agent, all proxied through the backend.',
            'Klient HTTP do MangaDex z limitami dla poszczególnych endpointów, ponawianiem prób, backoffem i własnym user agentem KireiManga, w całości prowadzony przez backend.'
          ),
          l(
            'An editorial Browse page with a thin search bar, filter chips, a result masthead, and a cover grid served through kirei-cover://.',
            'Redakcyjna strona Przeglądaj z lekkim polem wyszukiwania, filtrami, nagłówkiem wyników i siatką okładek serwowaną przez kirei-cover://.'
          ),
          l(
            'A series detail page with banner art, metadata, a follow toggle, translated tags, and a chapter list with language filtering.',
            'Strona serii z banerem, metadanymi, przełącznikiem obserwowania, przetłumaczonymi tagami i listą rozdziałów z filtrem języka.'
          ),
          l(
            'Follow and unfollow actions stored in SQLite, with optimistic UI updates and rollback on error.',
            'Obserwowanie i cofanie obserwowania zapisywane w SQLite, z optymistyczną aktualizacją interfejsu i wycofaniem zmian przy błędzie.'
          ),
          l(
            'A library page with grid and list views, sorting by title, last read, date added, and progress, plus filtering by reading status.',
            'Strona biblioteki z widokiem siatki i listy, sortowaniem po tytule, ostatnim czytaniu, dacie dodania i postępie oraz filtrowaniem po statusie czytania.'
          ),
          l(
            'A reader route with single page, double page, and webtoon layouts, plus fit by width, fit by height, and original size.',
            'Trasa czytnika z układem pojedynczym, podwójnym i webtoon oraz z dopasowaniem do szerokości, wysokości i rozmiarem oryginalnym.'
          ),
          l(
            'Keyboard navigation with arrows, A, D, Space, Enter, Home, End, fullscreen, and fit shortcuts, including RTL aware behavior.',
            'Nawigacja klawiaturą z użyciem strzałek, A, D, Spacji, Entera, Home, End, pełnego ekranu i skrótów dopasowania, także z uwzględnieniem RTL.'
          ),
          l(
            'Reader preferences saved per series in SQLite.',
            'Preferencje czytnika zapisywane osobno dla każdej serii w SQLite.'
          ),
          l(
            'Progress tracking for last read time, last read page, and finished chapters, plus resume buttons in the library and series view.',
            'Śledzenie czasu ostatniego czytania, ostatniej strony i ukończonych rozdziałów oraz przyciski wznawiania w bibliotece i widoku serii.'
          ),
          l(
            'An offline cache that stores chapter pages on disk and serves them locally when available.',
            'Pamięć podręczna offline zapisująca strony rozdziałów na dysku i podająca je lokalnie, gdy są dostępne.'
          ),
          l(
            'A poller for followed series that checks for new chapters on startup and on a schedule.',
            'Mechanizm sprawdzający obserwowane serie przy starcie aplikacji i cyklicznie w poszukiwaniu nowych rozdziałów.'
          ),
          l(
            'Bookmarks in the reader with a matching bookmarks panel on the series page.',
            'Zakładki w czytniku wraz z odpowiadającym im panelem zakładek na stronie serii.'
          ),
          l(
            'A Settings hub for appearance, reader defaults, library language and cache, and the keyboard map.',
            'Centrum Ustawień dla wyglądu, domyślnych opcji czytnika, języka biblioteki, pamięci podręcznej i mapy klawiatury.'
          ),
          l(
            'A small dependency free i18n layer with English and Polish.',
            'Niewielka warstwa i18n bez dodatkowych zależności, z angielskim i polskim.'
          ),
        ],
      },
      {
        label: l('Infrastructure', 'Infrastruktura'),
        entries: [
          l(
            'A pnpm workspace monorepo with apps for desktop and web plus shared packages.',
            'Monorepo pnpm z aplikacjami desktopową i webową oraz współdzielonymi pakietami.'
          ),
          l(
            'Shared event enums for socket channels as a single source of truth across the IPC boundary.',
            'Wspólne enumy zdarzeń dla kanałów socket jako jedno źródło prawdy po obu stronach IPC.'
          ),
          l(
            'Custom kirei-cover:// and kirei-page:// protocols registered with secure defaults.',
            'Niestandardowe protokoły kirei-cover:// i kirei-page:// zarejestrowane z bezpiecznymi ustawieniami.'
          ),
          l(
            'A strict production CSP that keeps direct MangaDex access in the main process.',
            'Ścisłe CSP w produkcji, które zostawia bezpośredni dostęp do MangaDex wyłącznie w procesie głównym.'
          ),
          l(
            'A Jest backend test setup switched from native better-sqlite3 to WASM based sql.js, so the suite runs without a node-gyp toolchain.',
            'Testowy backend w Jest został przełączony z natywnego better-sqlite3 na oparte na WASM sql.js, dzięki czemu pakiet testów działa bez toolchainu node-gyp.'
          ),
        ],
      },
    ],
  },
];
