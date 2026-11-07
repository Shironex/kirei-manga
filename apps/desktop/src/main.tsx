import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';
import { applyChrome } from './app/shell/platform';
import './index.css';

const root = document.getElementById('root');
if (!root) {
  throw new Error('KireiManga: #root element missing from index.html');
}

applyChrome();

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
);
