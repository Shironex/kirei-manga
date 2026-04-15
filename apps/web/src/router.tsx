import { createHashRouter } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { LibraryPage } from '@/pages/Library';
import { BrowsePage } from '@/pages/Browse';
import { SettingsPage } from '@/pages/Settings';
import { ReaderPage } from '@/pages/Reader';
import { SeriesDetailPage } from '@/pages/SeriesDetail';

export const router = createHashRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <LibraryPage /> },
      { path: 'browse', element: <BrowsePage /> },
      { path: 'series/:mangadexId', element: <SeriesDetailPage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: 'reader/:chapterId', element: <ReaderPage /> },
    ],
  },
]);
