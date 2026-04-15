import { IoAdapter } from '@nestjs/platform-socket.io';
import type { ServerOptions, Server } from 'socket.io';

/**
 * Custom Socket.io adapter with Connection State Recovery (CSR) enabled.
 *
 * CSR allows the server to temporarily buffer events and restore room
 * memberships for clients that disconnect and reconnect within the
 * maxDisconnectionDuration window. This means short network blips are
 * transparent to the user -- no manual re-fetch or room rejoin needed.
 *
 * @see https://socket.io/docs/v4/connection-state-recovery
 */
export class CustomIoAdapter extends IoAdapter {
  createIOServer(port: number, options?: Partial<ServerOptions>) {
    const server: Server = super.createIOServer(port, {
      ...options,
      connectionStateRecovery: {
        maxDisconnectionDuration: 30_000,
        skipMiddlewares: true,
      },
    });

    // Multiple NestJS WebSocket gateways share one Socket.IO server. Each
    // gateway adds ~2 "disconnect" listeners per client socket (from
    // bindClientDisconnect + RxJS fromEvent), exceeding Node's default
    // limit of 10. Raise it to avoid MaxListenersExceeded warnings.
    server.on('connection', socket => {
      socket.setMaxListeners(20);
    });

    return server;
  }
}
