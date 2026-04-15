/// <reference types="vite/client" />

import type { Socket } from 'socket.io-client';

declare global {
  interface Window {
    __testSocket?: Socket;
  }
}

export {};
