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
  'nav.footer': 'v0.1 · szkic',

  // TopBar
  'topbar.placeholder.library': 'Filtruj bibliotekę…',
  'topbar.placeholder.global': 'Szukaj w bibliotece lub MangaDex…',
  'topbar.status.offline': 'Offline',

  // Library page
  'library.eyebrow': 'Biblioteka',
  'library.title': 'Twoja półka, cicha i strzeżona.',
  'library.subtitle.count': '{count} serii',
  'library.empty.title': 'Brak obserwowanych serii.',
  'library.empty.body':
    'Zacznij od przeglądania MangaDex, aby znaleźć swoją pierwszą serię.',
  'library.empty.cta': 'Przeglądaj MangaDex',
  'library.empty.cta.import': 'Importuj lokalne',
  'library.empty.hint': 'Ctrl + B · Przeglądaj',
  'library.filters.empty': 'Brak serii pasujących do filtrów.',

  // Settings
  'settings.eyebrow': 'Ustawienia',
  'settings.title': 'Wszystko dostosowane do Ciebie.',
  'settings.section.appearance': 'Wygląd',
  'settings.section.reader': 'Czytnik',
  'settings.section.library': 'Biblioteka',
  'settings.section.keyboard': 'Klawiatura',
  'settings.language.label': 'Język',
  'settings.language.option.en': 'Angielski',
  'settings.language.option.pl': 'Polski',

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
