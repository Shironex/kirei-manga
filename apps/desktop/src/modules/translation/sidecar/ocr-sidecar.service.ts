import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { spawn, type ChildProcess } from 'child_process';
import { createLogger, type OcrResult } from '@kireimanga/shared';
import { OcrSidecarDownloader } from './ocr-sidecar-downloader';
import type { OcrRequestBox, OcrSidecarStatus } from './ocr-sidecar.types';

const logger = createLogger('OcrSidecarService');

/** Per-request timeout. OCR on a single page (≤30 bubbles) finishes well under this. */
const REQUEST_TIMEOUT_MS = 60_000;
/** Restart delays: 1s, 2s, 4s. Exhausted → `unhealthy`. */
const RESTART_BACKOFF_MS = [1_000, 2_000, 4_000] as const;
/** Grace period for the sidecar to flush + exit after `{op:'shutdown'}`. */
const SHUTDOWN_GRACE_MS = 5_000;

interface PendingRequest {
  resolve: (value: SidecarResponse) => void;
  reject: (err: Error) => void;
  timeout: NodeJS.Timeout;
}

interface OcrResponseEntry {
  box_index: number;
  text: string;
  error?: string;
}

interface SidecarResponse {
  id: string | null;
  results?: OcrResponseEntry[];
  ok?: boolean;
  model_loaded?: boolean;
  ready?: boolean;
  shutting_down?: boolean;
  error?: string;
}

/** Public error class so callers can `instanceof` distinguish sidecar faults. */
export class OcrSidecarError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OcrSidecarError';
  }
}

/** Spawn seam — overridable in tests so we can assert on the spawned binary. */
type SpawnFn = typeof spawn;

/**
 * Long-running manga-OCR child process. Lazy-spawns on first `ocr()` call,
 * speaks newline-delimited JSON over stdin/stdout with a correlation id per
 * request, serializes to one in-flight request at a time (OCR is CPU/GPU
 * bound — stacking just thrashes), times out after 60s, and auto-restarts
 * with 1s/2s/4s backoff. Three consecutive crashes flips the service to
 * `unhealthy` and Slice K's Tesseract fallback takes over.
 */
@Injectable()
export class OcrSidecarService implements OnModuleDestroy {
  private process: ChildProcess | null = null;
  private status: OcrSidecarStatus = { state: 'not-downloaded' };
  private nextId = 0;
  private readonly pending = new Map<string, PendingRequest>();
  private readonly queue: Array<() => void> = [];
  private inFlight = false;
  private restartCount = 0;
  private readyPromise: Promise<void> | null = null;
  private buffer = '';
  private shuttingDown = false;
  private restartTimer: NodeJS.Timeout | null = null;
  private readonly spawnFn: SpawnFn;

  constructor(
    private readonly downloader: OcrSidecarDownloader,
    spawnFn: SpawnFn = spawn
  ) {
    this.spawnFn = spawnFn;
  }

  /** Snapshot of the sidecar's current lifecycle state. */
  getStatus(): OcrSidecarStatus {
    return this.status;
  }

  /**
   * OCR every box in the supplied list. Returns an `OcrResult` per box in the
   * original order. Per-box failures surface as `text: ''` (the orchestrator
   * decides whether to skip / surface); a sidecar-level failure rejects.
   */
  async ocr(imagePath: string, boxes: OcrRequestBox[]): Promise<OcrResult[]> {
    await this.ensureReady();
    await this.acquireSlot();
    try {
      const id = this.nextRequestId();
      const response = await this.send({ op: 'ocr', id, image_path: imagePath, boxes });
      if (response.error) {
        throw new OcrSidecarError(`sidecar ocr error: ${response.error}`);
      }
      const entries = response.results ?? [];
      return entries.map<OcrResult>(entry => {
        if (entry.error) {
          // Per-box failures: log + surface empty text. The shared `OcrResult`
          // shape stays clean; the orchestrator can detect by `text === ''`.
          logger.warn(
            `OCR error for box ${entry.box_index} of ${imagePath}: ${entry.error}`
          );
          return { boxIndex: entry.box_index, text: '' };
        }
        return { boxIndex: entry.box_index, text: entry.text };
      });
    } finally {
      this.releaseSlot();
    }
  }

  /** Cheap healthcheck — returns whether the sidecar has loaded its model yet. */
  async ping(): Promise<{ ok: boolean; modelLoaded: boolean }> {
    await this.ensureReady();
    const id = this.nextRequestId();
    const response = await this.send({ op: 'ping', id });
    return {
      ok: response.ok === true,
      modelLoaded: response.model_loaded === true,
    };
  }

  /**
   * Make sure the binary is on disk and the process is spawned + ready.
   * Idempotent: subsequent calls reuse the in-flight `readyPromise`. Pass
   * `onDownloadProgress` to surface tarball progress to the renderer.
   */
  async ensureReady(
    onDownloadProgress?: (bytes: number, total: number) => void
  ): Promise<void> {
    if (this.status.state === 'unhealthy') {
      throw new OcrSidecarError(
        this.status.reason ?? 'OCR sidecar is unhealthy after repeated crashes'
      );
    }
    if (this.process && this.readyPromise) {
      return this.readyPromise;
    }
    if (this.readyPromise) {
      return this.readyPromise;
    }

    this.readyPromise = (async () => {
      // 1. Make sure the binary exists (download on first use).
      if (!(await this.downloader.isAvailable())) {
        this.status = { state: 'downloading', downloadProgress: { bytes: 0, total: 0 } };
        try {
          await this.downloader.download((bytes, total) => {
            this.status = {
              state: 'downloading',
              downloadProgress: { bytes, total },
            };
            onDownloadProgress?.(bytes, total);
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          this.status = { state: 'unhealthy', reason: `download failed: ${message}` };
          this.readyPromise = null;
          throw new OcrSidecarError(`OCR sidecar download failed: ${message}`);
        }
      }

      // 2. Spawn the process and wait for the `{ready:true}` notification.
      this.status = { state: 'starting' };
      await this.spawnAndAwaitReady();
      this.status = { state: 'ready' };
      this.restartCount = 0;
    })();

    try {
      await this.readyPromise;
    } catch (err) {
      // Clear so the next call can retry from scratch (unless we're now unhealthy).
      this.readyPromise = null;
      throw err;
    }
  }

  /** Send `{op:'shutdown'}` and wait up to 5s for the process to exit. */
  async shutdown(): Promise<void> {
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    if (!this.process) return;

    this.shuttingDown = true;
    const proc = this.process;

    const exited = new Promise<void>(resolve => {
      proc.once('exit', () => resolve());
    });

    try {
      this.writeLine({ op: 'shutdown' });
    } catch (err) {
      logger.warn(`Failed to send shutdown to sidecar: ${(err as Error).message}`);
    }

    const killTimer = setTimeout(() => {
      if (!proc.killed) {
        logger.warn('Sidecar did not exit within grace; sending SIGTERM');
        proc.kill('SIGTERM');
      }
    }, SHUTDOWN_GRACE_MS);

    try {
      await exited;
    } finally {
      clearTimeout(killTimer);
    }
  }

  /** NestJS lifecycle hook — fires when the host module is torn down. */
  async onModuleDestroy(): Promise<void> {
    await this.shutdown();
  }

  // -- internals ----------------------------------------------------------

  private nextRequestId(): string {
    return String(this.nextId++);
  }

  /** Block until the in-flight slot is free, then claim it. */
  private acquireSlot(): Promise<void> {
    if (!this.inFlight) {
      this.inFlight = true;
      return Promise.resolve();
    }
    return new Promise<void>(resolve => {
      this.queue.push(() => {
        this.inFlight = true;
        resolve();
      });
    });
  }

  private releaseSlot(): void {
    this.inFlight = false;
    const next = this.queue.shift();
    if (next) next();
  }

  /**
   * Write a single JSON request, register it as pending, return a promise
   * that resolves with the matching response (or rejects on timeout / exit).
   */
  private send(payload: Record<string, unknown> & { id: string }): Promise<SidecarResponse> {
    return new Promise<SidecarResponse>((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (this.pending.delete(payload.id)) {
          reject(new OcrSidecarError(`sidecar request ${payload.id} timed out after ${REQUEST_TIMEOUT_MS}ms`));
        }
      }, REQUEST_TIMEOUT_MS);
      this.pending.set(payload.id, { resolve, reject, timeout });
      try {
        this.writeLine(payload);
      } catch (err) {
        clearTimeout(timeout);
        this.pending.delete(payload.id);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  private writeLine(payload: Record<string, unknown>): void {
    if (!this.process || !this.process.stdin || !this.process.stdin.writable) {
      throw new OcrSidecarError('sidecar stdin is not writable');
    }
    this.process.stdin.write(JSON.stringify(payload) + '\n');
  }

  /**
   * Spawn the binary, wire the stdio listeners, and resolve when the sidecar
   * emits its `{id:null, ready:true}` startup notification. Any exit before
   * `ready` is treated as a startup failure and rejects.
   */
  private spawnAndAwaitReady(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const binary = this.downloader.binaryPath();
      logger.info(`Spawning OCR sidecar: ${binary}`);
      let proc: ChildProcess;
      try {
        proc = this.spawnFn(binary, [], {
          stdio: ['pipe', 'pipe', 'pipe'],
          windowsHide: true,
        });
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
        return;
      }

      this.process = proc;
      this.shuttingDown = false;
      this.buffer = '';

      let readyResolved = false;

      proc.stdout?.setEncoding('utf8');
      proc.stdout?.on('data', (chunk: string) => {
        this.buffer += chunk;
        let newlineIdx = this.buffer.indexOf('\n');
        while (newlineIdx >= 0) {
          const line = this.buffer.slice(0, newlineIdx).trim();
          this.buffer = this.buffer.slice(newlineIdx + 1);
          if (line.length > 0) {
            this.handleLine(line, () => {
              if (!readyResolved) {
                readyResolved = true;
                resolve();
              }
            });
          }
          newlineIdx = this.buffer.indexOf('\n');
        }
      });

      proc.stderr?.setEncoding('utf8');
      proc.stderr?.on('data', (chunk: string) => {
        const trimmed = chunk.trimEnd();
        if (trimmed.length > 0) {
          logger.warn(`[sidecar stderr] ${trimmed}`);
        }
      });

      const onTermination = (code: number | null, signal: NodeJS.Signals | null) => {
        const wasReady = readyResolved;
        this.handleProcessExit(code, signal);
        if (!wasReady) {
          reject(
            new OcrSidecarError(
              `sidecar exited before ready (code=${code ?? 'null'}, signal=${signal ?? 'null'})`
            )
          );
        }
      };

      proc.once('exit', onTermination);
      proc.once('error', err => {
        logger.warn(`sidecar process error: ${err.message}`);
        if (!readyResolved) {
          readyResolved = true;
          reject(err);
        }
      });
    });
  }

  /** Parse one JSON line and dispatch — startup notification, response, or stray error. */
  private handleLine(line: string, onReady: () => void): void {
    let parsed: SidecarResponse;
    try {
      parsed = JSON.parse(line) as SidecarResponse;
    } catch (err) {
      logger.warn(`failed to parse sidecar line: ${(err as Error).message} :: ${line}`);
      return;
    }

    // Startup notification: `{id:null, ready:true}`.
    if (parsed.ready === true && parsed.id === null) {
      onReady();
      return;
    }

    // Top-level error without an id: log; nothing to dispatch.
    if (parsed.id === null || parsed.id === undefined) {
      if (parsed.error) {
        logger.warn(`sidecar emitted unattributed error: ${parsed.error}`);
      }
      return;
    }

    const corrId = String(parsed.id);
    const pending = this.pending.get(corrId);
    if (!pending) {
      logger.warn(`sidecar response for unknown id ${corrId}`);
      return;
    }
    this.pending.delete(corrId);
    clearTimeout(pending.timeout);
    pending.resolve(parsed);
  }

  /**
   * Handle an exit event: clear pending, schedule a restart unless we asked
   * for shutdown ourselves.
   */
  private handleProcessExit(code: number | null, signal: NodeJS.Signals | null): void {
    const wasShuttingDown = this.shuttingDown;
    this.process = null;
    this.readyPromise = null;
    this.shuttingDown = false;
    this.buffer = '';

    // Reject every in-flight request — the responses can never arrive.
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timeout);
      pending.reject(
        new OcrSidecarError(`sidecar exited (code=${code ?? 'null'}, signal=${signal ?? 'null'})`)
      );
      this.pending.delete(id);
    }
    this.inFlight = false;
    // Drop any waiters — they'd just hang on a never-coming slot.
    this.queue.length = 0;

    if (wasShuttingDown) {
      this.status = { state: 'not-downloaded' }; // benign reset; ensureReady() rebuilds.
      return;
    }

    this.status = {
      state: 'crashed',
      reason: `sidecar exited (code=${code ?? 'null'}, signal=${signal ?? 'null'})`,
    };

    const delay = RESTART_BACKOFF_MS[this.restartCount];
    if (delay === undefined) {
      this.status = {
        state: 'unhealthy',
        reason: 'sidecar crashed 3 times in a row',
      };
      logger.warn('sidecar crashed 3 times — marking unhealthy');
      return;
    }

    this.restartCount += 1;
    logger.warn(
      `sidecar crashed (attempt ${this.restartCount} of ${RESTART_BACKOFF_MS.length}); ` +
        `restarting in ${delay}ms`
    );
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      // Fire-and-forget: a failure here just leaves status as crashed/unhealthy,
      // and the next ocr() call will surface the error to the renderer.
      this.ensureReady().catch(err => {
        logger.warn(`auto-restart attempt failed: ${(err as Error).message}`);
      });
    }, delay);
  }
}
