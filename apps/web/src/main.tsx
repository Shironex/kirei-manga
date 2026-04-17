import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { setLogLevel } from '@kireimanga/shared';
import App from './App';
import './styles/globals.css';
import { initializeSocket, connectSocket } from './lib/socket';
import { useSocketStore } from './stores/socket-store';
import { useLibraryStore } from './stores/library-store';
import { useSettingsStore } from './stores/settings-store';
import { useDownloadsStore } from './stores/downloads-store';

setLogLevel(import.meta.env.DEV ? 'debug' : 'info');

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Failed to find root element');
}

async function bootstrap(): Promise<void> {
  const port = await window.electronAPI.app.getBackendPort();
  initializeSocket(port);
  useSocketStore.getState().initListeners();
  useLibraryStore.getState().initListeners();
  useSettingsStore.getState().initListeners();
  useDownloadsStore.getState().initListeners();
  useSocketStore.subscribe((s, prev) => {
    if (s.status === 'connected' && prev.status !== 'connected') {
      void useLibraryStore.getState().refresh();
      void useSettingsStore.getState().hydrate();
    }
  });
  void connectSocket().catch(err => {
    console.error('[bootstrap] initial socket connect failed', err);
  });
}

void bootstrap();

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>
);
