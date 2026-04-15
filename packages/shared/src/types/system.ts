/**
 * System Types — connection and WebSocket throttling types shared between
 * the renderer and the embedded NestJS backend.
 */

/** Current state of the renderer's socket connection to the backend. */
export type ConnectionStatus = 'connected' | 'reconnecting' | 'failed';

/** Payload emitted when a WebSocket request is throttled. */
export interface WsThrottledPayload {
  /** The event name that was throttled. */
  event: string;
  /** Time in ms before the client can retry. */
  retryAfter: number;
}
