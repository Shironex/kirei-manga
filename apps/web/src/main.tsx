import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/globals.css';
import { initializeSocket, connectSocket } from './lib/socket';
import { useSocketStore } from './stores/socket-store';
import { useLibraryStore } from './stores/library-store';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Failed to find root element');
}

async function bootstrap(): Promise<void> {
  const port = await window.electronAPI.app.getBackendPort();
  initializeSocket(port);
  useSocketStore.getState().initListeners();
  useLibraryStore.getState().initListeners();
  useSocketStore.subscribe((s, prev) => {
    if (s.status === 'connected' && prev.status !== 'connected') {
      void useLibraryStore.getState().refresh();
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
