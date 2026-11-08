import {
  createHashHistory,
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  notFound,
  Outlet,
  redirect,
} from '@tanstack/react-router';

import { BrowsePage } from '@/features/browse/BrowsePage';
import { DownloadsPage } from '@/features/downloads/DownloadsPage';
import { LibraryPage, validateLibrarySearch } from '@/features/library/LibraryPage';
import { parseFileSearch, parsePageSearch } from '@/features/reader/openChapter';
import { FileReaderPage, LibraryReaderPage } from '@/features/reader/ReaderPage';
import { SeriesPage } from '@/features/series/SeriesPage';
import { loadAbout } from '@/features/settings/loadAbout';
import { SettingsPage } from '@/features/settings/SettingsPage';

import { AppShell } from './shell/AppShell';
import { NotFound, RouteError, RoutePending, ShellNotFound } from './shell/RouteStates';

/**
 * Route tree. Code-based (no codegen step) and fully typed: `<Link to>` and
 * `useParams` are checked against these definitions.
 *
 *   /                          redirects to /library
 *   shell layout (rail + ambient)
 *     /library  /browse  /downloads  /settings
 *     /series/$seriesId
 *     /dev/design  /dev/engine (dev builds only)
 *   /read/$seriesId/$chapterId  full-window reader, outside the shell
 *   /read/file?path=            the reader on an archive or folder from disk
 */

const rootRoute = createRootRoute({
  component: Outlet,
  notFoundComponent: ShellNotFound,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: () => {
    throw redirect({ to: '/library' });
  },
});

const shellRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'shell',
  component: AppShell,
});

const libraryRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/library',
  validateSearch: validateLibrarySearch,
  component: LibraryPage,
});

const seriesRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/series/$seriesId',
  component: SeriesPage,
});

const browseRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/browse',
  component: BrowsePage,
});

const downloadsRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/downloads',
  component: DownloadsPage,
});

const settingsRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/settings',
  loader: loadAbout,
  component: SettingsPage,
});

// Dev routes are always in the tree (so links type-check) but render nothing and
// pull in no code in production: Vite drops the dead dynamic imports.
const devOnly = () => {
  if (!import.meta.env.DEV) throw notFound();
};

const designRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/dev/design',
  beforeLoad: devOnly,
  component: import.meta.env.DEV
    ? lazyRouteComponent(() => import('@/features/design/DesignPage'), 'DesignPage')
    : () => null,
});

const engineRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/dev/engine',
  beforeLoad: devOnly,
  component: import.meta.env.DEV
    ? lazyRouteComponent(() => import('@/features/reader-test/EngineRoute'), 'EngineRoute')
    : () => null,
});

const readerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/read/$seriesId/$chapterId',
  validateSearch: parsePageSearch,
  component: LibraryReaderPage,
});

const readFileRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/read/file',
  validateSearch: parseFileSearch,
  component: FileReaderPage,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  shellRoute.addChildren([
    libraryRoute,
    seriesRoute,
    browseRoute,
    downloadsRoute,
    settingsRoute,
    designRoute,
    engineRoute,
  ]),
  readerRoute,
  readFileRoute,
]);

export function createAppRouter() {
  return createRouter({
    routeTree,
    // Hash history: the webview loads index.html from Tauri's asset protocol,
    // so there is no server to answer deep links or reloads of /series/...
    history: createHashHistory(),
    defaultErrorComponent: RouteError,
    defaultPendingComponent: RoutePending,
    defaultNotFoundComponent: NotFound,
    defaultPendingMs: 150,
    defaultPreload: 'intent',
    scrollRestoration: true,
    scrollToTopSelectors: ['#main'],
  });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
