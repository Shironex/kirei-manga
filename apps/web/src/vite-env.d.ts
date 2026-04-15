/// <reference types="vite/client" />

import type { Socket } from 'socket.io-client';
import type { ElectronAPI } from '../../desktop/src/main/preload';

declare global {
  interface Window {
    __testSocket?: Socket;
    electronAPI: ElectronAPI;
  }
}

export {};
