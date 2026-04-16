import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  WebSocketServer,
} from '@nestjs/websockets';
import { UseGuards } from '@nestjs/common';
import { Server } from 'socket.io';
import { dialog } from 'electron';
import {
  createLogger,
  LocalEvents,
  type LocalScanPayload,
  type LocalScanProgressEvent,
  type ScanProgress,
} from '@kireimanga/shared';
import { CORS_CONFIG } from '../shared/cors.config';
import { WsThrottlerGuard } from '../shared/ws-throttler.guard';
import { handleGatewayRequest } from '../shared/gateway-handler';
import { LocalScannerService } from './scanner';

const logger = createLogger('LocalGateway');

/** Smallest interval between SCAN_PROGRESS broadcasts. */
const SCAN_PROGRESS_DEBOUNCE_MS = 200;

@WebSocketGateway({ cors: CORS_CONFIG })
@UseGuards(WsThrottlerGuard)
export class LocalGateway {
  @WebSocketServer()
  server!: Server;

  constructor(private readonly scanner: LocalScannerService) {
    logger.info('LocalGateway initialized');
  }

  /**
   * Open the native folder picker and return the selected path. Runs in the
   * main process — `dialog.showOpenDialog` is a no-op under jest so this
   * handler is integration-tested via the import flow rather than a unit.
   */
  @SubscribeMessage(LocalEvents.PICK_FOLDER)
  handlePickFolder() {
    return handleGatewayRequest({
      logger,
      action: 'local:pick-folder',
      defaultResult: { path: null },
      handler: async () => {
        const result = await dialog.showOpenDialog({
          title: 'Select your manga folder',
          properties: ['openDirectory'],
        });
        if (result.canceled || result.filePaths.length === 0) {
          return { path: null };
        }
        return { path: result.filePaths[0] };
      },
    });
  }

  /**
   * Run a scan and stream `SCAN_PROGRESS` events while it runs. The final
   * `ScanResult` is returned as the acknowledgement payload — the renderer
   * uses that for the import-review UI without needing to re-aggregate
   * progress events.
   */
  @SubscribeMessage(LocalEvents.SCAN)
  handleScan(@MessageBody() payload: LocalScanPayload) {
    return handleGatewayRequest({
      logger,
      action: 'local:scan',
      defaultResult: { result: null },
      handler: async () => {
        const emit = this.buildDebouncedEmitter();
        try {
          const result = await this.scanner.scan(payload.rootPath, emit.push);
          return { result };
        } finally {
          emit.flush();
        }
      },
    });
  }

  /**
   * Coalesce `ScanProgress` events so we never spam the socket more than
   * once per `SCAN_PROGRESS_DEBOUNCE_MS`. The last emitted event in a burst
   * is what the renderer cares about; intermediate ticks get dropped.
   * `flush` is idempotent — safe to call in a `finally` after the scan
   * resolves or throws.
   */
  private buildDebouncedEmitter(): {
    push: (progress: ScanProgress) => void;
    flush: () => void;
  } {
    let pending: ScanProgress | null = null;
    let lastEmit = 0;
    let timer: NodeJS.Timeout | null = null;

    const emit = (): void => {
      if (!pending) return;
      const event: LocalScanProgressEvent = { progress: pending };
      this.server.emit(LocalEvents.SCAN_PROGRESS, event);
      lastEmit = Date.now();
      pending = null;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };

    return {
      push: (progress: ScanProgress) => {
        pending = progress;
        const sinceLast = Date.now() - lastEmit;
        if (sinceLast >= SCAN_PROGRESS_DEBOUNCE_MS) {
          emit();
          return;
        }
        if (!timer) {
          timer = setTimeout(emit, SCAN_PROGRESS_DEBOUNCE_MS - sinceLast);
        }
      },
      flush: () => {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        emit();
      },
    };
  }
}
