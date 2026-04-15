import { create } from 'zustand';
import {
  createLogger,
  SystemEvents,
  type ConnectionStatus,
  type WsThrottledPayload,
} from '@kireimanga/shared';
import { getSocket } from '@/lib/socket';

const logger = createLogger('SocketStore');

/** Duration after which a disconnection is considered a failure. */
const FAILURE_TIMEOUT_MS = 30_000;

interface SocketState {
  /** Current socket connection status. */
  status: ConnectionStatus;
  /** Timestamp (ms since epoch) when the last disconnect occurred. */
  disconnectedAt: number | null;
}

interface SocketActions {
  setConnected: () => void;
  setReconnecting: () => void;
  setFailed: () => void;
  retryConnection: () => void;
  initListeners: () => void;
  cleanupListeners: () => void;
}

type SocketStore = SocketState & SocketActions;

// Module-level refs for listeners so they can be removed on cleanup.
let connectHandler: (() => void) | null = null;
let disconnectHandler: ((reason: string) => void) | null = null;
let reconnectFailedHandler: (() => void) | null = null;
let throttledHandler: ((payload: WsThrottledPayload) => void) | null = null;
let listenersInitialized = false;

let failureTimeoutHandle: ReturnType<typeof setTimeout> | null = null;

export const useSocketStore = create<SocketStore>()((set, get) => ({
  status: 'reconnecting',
  disconnectedAt: null,

  setConnected: () => {
    if (failureTimeoutHandle !== null) {
      clearTimeout(failureTimeoutHandle);
      failureTimeoutHandle = null;
    }
    logger.info('Connection established');
    set({ status: 'connected', disconnectedAt: null });
  },

  setReconnecting: () => {
    if (failureTimeoutHandle !== null) {
      clearTimeout(failureTimeoutHandle);
      failureTimeoutHandle = null;
    }
    logger.info('Connection lost, attempting to reconnect...');
    failureTimeoutHandle = setTimeout(() => {
      logger.warn('Reconnection timed out after 30s');
      get().setFailed();
    }, FAILURE_TIMEOUT_MS);
    set({ status: 'reconnecting', disconnectedAt: Date.now() });
  },

  setFailed: () => {
    if (failureTimeoutHandle !== null) {
      clearTimeout(failureTimeoutHandle);
      failureTimeoutHandle = null;
    }
    logger.error('Connection failed');
    set({ status: 'failed' });
  },

  retryConnection: () => {
    logger.info('Manual retry requested');
    get().setReconnecting();
    getSocket().connect();
  },

  initListeners: () => {
    if (listenersInitialized) return;

    connectHandler = () => {
      get().setConnected();
    };

    disconnectHandler = (reason: string) => {
      if (reason !== 'io client disconnect') {
        get().setReconnecting();
      }
    };

    reconnectFailedHandler = () => {
      get().setFailed();
    };

    throttledHandler = (payload: WsThrottledPayload) => {
      logger.warn(`Rate limited on "${payload.event}" — retry in ${payload.retryAfter}ms`);
    };

    getSocket().on('connect', connectHandler);
    getSocket().on('disconnect', disconnectHandler);
    getSocket().on('reconnect_failed', reconnectFailedHandler);
    getSocket().on(SystemEvents.THROTTLED, throttledHandler);

    listenersInitialized = true;
    logger.debug('Socket listeners registered');
  },

  cleanupListeners: () => {
    if (failureTimeoutHandle !== null) {
      clearTimeout(failureTimeoutHandle);
      failureTimeoutHandle = null;
    }
    if (connectHandler) {
      getSocket().off('connect', connectHandler);
      connectHandler = null;
    }
    if (disconnectHandler) {
      getSocket().off('disconnect', disconnectHandler);
      disconnectHandler = null;
    }
    if (reconnectFailedHandler) {
      getSocket().off('reconnect_failed', reconnectFailedHandler);
      reconnectFailedHandler = null;
    }
    if (throttledHandler) {
      getSocket().off(SystemEvents.THROTTLED, throttledHandler);
      throttledHandler = null;
    }

    listenersInitialized = false;
    logger.debug('Socket listeners cleaned up');
  },
}));
