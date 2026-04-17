import { EventEmitter } from 'events';
import { Writable, Readable } from 'stream';
import type { ChildProcess } from 'child_process';
import { OcrSidecarService, OcrSidecarError } from './ocr-sidecar.service';
import type { OcrSidecarDownloader } from './ocr-sidecar-downloader';

/**
 * Minimal `ChildProcess` stand-in. We need to read JSON requests written to
 * stdin, push JSON responses out via stdout, and emit `exit` to drive crash
 * / shutdown paths. The real `ChildProcess` shape is huge; the service only
 * touches `stdin.write`, `stdout.on('data')`, `stderr.on('data')`, `kill`,
 * and the `exit` / `error` events.
 */
class FakeChild extends EventEmitter {
  stdin: Writable & { lines: string[] };
  stdout: Readable;
  stderr: Readable;
  killed = false;
  private stdoutPushed: string[] = [];

  constructor() {
    super();

    const lines: string[] = [];
    let pendingLine = '';
    const stdin = new Writable({
      write: (chunk: Buffer | string, _enc, cb) => {
        pendingLine += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
        let nl = pendingLine.indexOf('\n');
        while (nl >= 0) {
          lines.push(pendingLine.slice(0, nl));
          pendingLine = pendingLine.slice(nl + 1);
          nl = pendingLine.indexOf('\n');
        }
        cb();
      },
    }) as Writable & { lines: string[] };
    stdin.lines = lines;
    this.stdin = stdin;

    this.stdout = new Readable({ read() {} });
    this.stderr = new Readable({ read() {} });
  }

  emitStdout(payload: object | string): void {
    const line =
      (typeof payload === 'string' ? payload : JSON.stringify(payload)) + '\n';
    this.stdoutPushed.push(line);
    this.stdout.push(line);
  }

  emitExit(code: number | null = 0): void {
    this.killed = true;
    this.emit('exit', code, null);
  }

  kill(_signal?: NodeJS.Signals | number): boolean {
    this.killed = true;
    return true;
  }

  /** Latest line written by the service to stdin (parsed). */
  lastWritten(): { op: string; id?: string | null; [k: string]: unknown } | null {
    const lines = (this.stdin as Writable & { lines: string[] }).lines;
    if (lines.length === 0) return null;
    return JSON.parse(lines[lines.length - 1]);
  }

  writtenLines(): Array<{ op: string; id?: string | null; [k: string]: unknown }> {
    return (this.stdin as Writable & { lines: string[] }).lines.map(l => JSON.parse(l));
  }
}

/** Wait for the next microtask drain — used after `emitStdout` so the stream pipes deliver. */
function flush(): Promise<void> {
  return new Promise(resolve => setImmediate(resolve));
}

/** Bring up the sidecar under fake timers (with `setImmediate` left real). */
async function bringUpFakeTimers(harness: Harness): Promise<FakeChild> {
  const ready = harness.service.ensureReady();
  await flush();
  const child = harness.spawned[harness.spawned.length - 1];
  child.emitStdout({ id: null, ready: true });
  await flush();
  await ready;
  return child;
}

/**
 * Enable jest fake timers but leave the microtask runners alone — Node
 * `Readable.push()` dispatches `data` events via `process.nextTick`, so faking
 * those would silently drop every sidecar response in the tests below.
 */
function useFakeTimersForRestart(): void {
  jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate'] });
}

interface Harness {
  service: OcrSidecarService;
  downloader: jest.Mocked<OcrSidecarDownloader>;
  spawnFn: jest.Mock;
  spawned: FakeChild[];
}

function makeHarness(): Harness {
  const downloader = {
    isAvailable: jest.fn().mockResolvedValue(true),
    download: jest.fn().mockResolvedValue('/fake/kirei-ocr'),
    binaryPath: jest.fn().mockReturnValue('/fake/kirei-ocr'),
  } as unknown as jest.Mocked<OcrSidecarDownloader>;

  const spawned: FakeChild[] = [];
  const spawnFn = jest.fn(() => {
    const child = new FakeChild();
    spawned.push(child);
    return child as unknown as ChildProcess;
  });

  const service = new OcrSidecarService(
    downloader,
    spawnFn as unknown as typeof import('child_process').spawn
  );
  return { service, downloader, spawnFn, spawned };
}

/** Drive `ensureReady()` by spawning then emitting the `ready` startup line. */
async function bringUp(harness: Harness): Promise<FakeChild> {
  const ready = harness.service.ensureReady();
  await flush();
  const child = harness.spawned[harness.spawned.length - 1];
  child.emitStdout({ id: null, ready: true });
  await ready;
  return child;
}

describe('OcrSidecarService', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('ocr() spawns, sends an `ocr` op, and maps results to OcrResult[]', async () => {
    const harness = makeHarness();
    const child = await bringUp(harness);

    const ocrPromise = harness.service.ocr('/img.jpg', [{ x: 0, y: 0, w: 100, h: 50 }]);
    await flush();

    const sent = child.lastWritten();
    expect(sent?.op).toBe('ocr');
    expect(sent?.image_path).toBe('/img.jpg');
    expect(Array.isArray(sent?.boxes)).toBe(true);

    child.emitStdout({
      id: sent!.id,
      results: [{ box_index: 0, text: 'こんにちは' }],
    });

    const result = await ocrPromise;
    expect(result).toEqual([{ boxIndex: 0, text: 'こんにちは' }]);
    expect(harness.spawnFn).toHaveBeenCalledTimes(1);
  });

  it('ping() returns ok + modelLoaded from the sidecar response', async () => {
    const harness = makeHarness();
    const child = await bringUp(harness);

    const pingPromise = harness.service.ping();
    await flush();
    const sent = child.lastWritten();
    expect(sent?.op).toBe('ping');
    child.emitStdout({ id: sent!.id, ok: true, model_loaded: true });

    await expect(pingPromise).resolves.toEqual({ ok: true, modelLoaded: true });
  });

  it('serializes concurrent ocr() calls — second waits until first completes', async () => {
    const harness = makeHarness();
    const child = await bringUp(harness);

    const first = harness.service.ocr('/a.jpg', []);
    const second = harness.service.ocr('/b.jpg', []);
    await flush();

    // Only one request should be in flight: a single `op:'ocr'` line written.
    const linesAfterStart = child.writtenLines().filter(l => l.op === 'ocr');
    expect(linesAfterStart).toHaveLength(1);
    expect(linesAfterStart[0].image_path).toBe('/a.jpg');

    child.emitStdout({ id: linesAfterStart[0].id, results: [] });
    await first;
    await flush();

    // Now the queued second request should have been dispatched.
    const linesAfterFirstDone = child.writtenLines().filter(l => l.op === 'ocr');
    expect(linesAfterFirstDone).toHaveLength(2);
    expect(linesAfterFirstDone[1].image_path).toBe('/b.jpg');

    child.emitStdout({ id: linesAfterFirstDone[1].id, results: [] });
    await expect(second).resolves.toEqual([]);
  });

  it('rejects with timeout error when the sidecar never responds', async () => {
    useFakeTimersForRestart();
    const harness = makeHarness();
    await bringUpFakeTimers(harness);

    const ocrPromise = harness.service.ocr('/timeout.jpg', []);
    // Swallow now so the unhandled-rejection guard doesn't fail the run when
    // the timeout fires below.
    ocrPromise.catch(() => {});
    await flush();

    // Fast-forward past the 60s per-request timeout.
    jest.advanceTimersByTime(61_000);
    await flush();

    await expect(ocrPromise).rejects.toBeInstanceOf(OcrSidecarError);
    await expect(ocrPromise).rejects.toThrow(/timed out/);
  });

  it('auto-restarts after an unexpected exit and a second ocr() works', async () => {
    useFakeTimersForRestart();
    const harness = makeHarness();

    // Bring up #1.
    const child1 = await bringUpFakeTimers(harness);

    // Crash it. Service schedules an auto-restart in 1s.
    child1.emitExit(1);
    expect(harness.service.getStatus().state).toBe('crashed');

    // Advance past the first backoff (1s) — restart fires which calls
    // ensureReady() → spawnFn() → starts child #2.
    jest.advanceTimersByTime(1_000);
    await flush();
    expect(harness.spawnFn).toHaveBeenCalledTimes(2);

    const child2 = harness.spawned[1];
    child2.emitStdout({ id: null, ready: true });
    await flush();
    expect(harness.service.getStatus().state).toBe('ready');

    jest.useRealTimers();

    const ocrPromise = harness.service.ocr('/after-restart.jpg', []);
    await flush();
    const sent = child2.lastWritten();
    expect(sent?.op).toBe('ocr');
    child2.emitStdout({ id: sent!.id, results: [] });
    await expect(ocrPromise).resolves.toEqual([]);
  });

  it('flips to unhealthy after consecutive crashes exhaust the restart budget', async () => {
    useFakeTimersForRestart();
    const harness = makeHarness();

    // Initial spawn + ready.
    await bringUpFakeTimers(harness);

    // Three consecutive crashes with no `ready:true` between them. Each
    // restart spawns a fresh child that immediately exits before sending
    // its ready notification — `restartCount` never resets.
    //
    // Sequence: crash#1 → schedule retry @1s → spawn → exit → schedule @2s
    //         → spawn → exit → schedule @4s → spawn → exit → unhealthy.
    const backoffs = [1_000, 2_000, 4_000];
    harness.spawned[0].emitExit(1);
    expect(harness.service.getStatus().state).toBe('crashed');
    for (const delay of backoffs) {
      jest.advanceTimersByTime(delay);
      await flush();
      const next = harness.spawned[harness.spawned.length - 1];
      next.emitExit(1);
      await flush();
    }

    expect(harness.service.getStatus().state).toBe('unhealthy');

    jest.useRealTimers();
    await expect(harness.service.ocr('/x.jpg', [])).rejects.toBeInstanceOf(OcrSidecarError);
  });

  it('shutdown() sends the shutdown op then waits for exit', async () => {
    const harness = makeHarness();
    const child = await bringUp(harness);

    const shutdownPromise = harness.service.shutdown();
    // Let the write flush.
    await flush();

    const lastLine = child.lastWritten();
    expect(lastLine?.op).toBe('shutdown');

    // Sidecar exits in response.
    child.emitExit(0);
    await expect(shutdownPromise).resolves.toBeUndefined();
  });

  it('periodic healthcheck pings sidecar when ready and updates modelLoaded', async () => {
    useFakeTimersForRestart();
    const harness = makeHarness();
    const child = await bringUpFakeTimers(harness);

    // Kick off the background healthcheck loop.
    harness.service.onModuleInit();
    expect(harness.service.getStatus().modelLoaded).toBeUndefined();

    // Advance to the first 30s tick.
    jest.advanceTimersByTime(30_000);
    await flush();

    // The tick should have written a `ping` op to stdin.
    const pingLine = child.writtenLines().find(l => l.op === 'ping');
    expect(pingLine).toBeDefined();
    expect(pingLine?.id).toBeDefined();

    // Sidecar replies with `model_loaded: true` → status reflects it.
    child.emitStdout({ id: pingLine!.id, ok: true, model_loaded: true });
    await flush();

    expect(harness.service.getStatus()).toEqual({
      state: 'ready',
      modelLoaded: true,
    });

    // Tear down — emit exit so the shutdown promise resolves under fake timers
    // without us having to roll forward the 5s grace.
    const shutdown = harness.service.shutdown();
    await flush();
    child.emitExit(0);
    await shutdown;
  });

  it('healthcheck does not ping when the sidecar is not ready', async () => {
    useFakeTimersForRestart();
    const harness = makeHarness();

    // No bring-up — service starts in `not-downloaded`.
    harness.service.onModuleInit();
    jest.advanceTimersByTime(30_000);
    await flush();

    // No spawn (no ensureReady), no ping.
    expect(harness.spawnFn).not.toHaveBeenCalled();
    expect(harness.spawned).toHaveLength(0);

    // No spawned child here — shutdown short-circuits because process is null.
    await harness.service.shutdown();
  });

  it('per-box error in ocr() response surfaces as empty text in OcrResult', async () => {
    const harness = makeHarness();
    const child = await bringUp(harness);

    const ocrPromise = harness.service.ocr('/img.jpg', [
      { x: 0, y: 0, w: 1, h: 1 },
      { x: 0, y: 0, w: 1, h: 1 },
    ]);
    await flush();
    const sent = child.lastWritten();

    child.emitStdout({
      id: sent!.id,
      results: [
        { box_index: 0, text: 'good' },
        { box_index: 1, text: '', error: 'PIL.UnidentifiedImageError' },
      ],
    });

    await expect(ocrPromise).resolves.toEqual([
      { boxIndex: 0, text: 'good' },
      { boxIndex: 1, text: '' },
    ]);
  });

  describe('crash & restart edge cases', () => {
    it('escalates backoff to 1s, 2s, 4s on repeated crashes without ready', async () => {
      // Each crashed child exits *before* ever sending `ready:true` so
      // `restartCount` is never reset. We assert the restart timer fires at
      // exactly +1s, +2s, +4s — anything earlier or later is a regression.
      useFakeTimersForRestart();
      const harness = makeHarness();
      const child0 = await bringUpFakeTimers(harness);

      // Crash #1: scheduled restart should be at +1s.
      child0.emitExit(1);
      jest.advanceTimersByTime(999);
      await flush();
      expect(harness.spawnFn).toHaveBeenCalledTimes(1);
      jest.advanceTimersByTime(1);
      await flush();
      expect(harness.spawnFn).toHaveBeenCalledTimes(2);

      // Crash #2 (no `ready` emitted): scheduled restart should be at +2s.
      harness.spawned[1].emitExit(1);
      await flush();
      jest.advanceTimersByTime(1_999);
      await flush();
      expect(harness.spawnFn).toHaveBeenCalledTimes(2);
      jest.advanceTimersByTime(1);
      await flush();
      expect(harness.spawnFn).toHaveBeenCalledTimes(3);

      // Crash #3 (no `ready`): scheduled restart should be at +4s.
      harness.spawned[2].emitExit(1);
      await flush();
      jest.advanceTimersByTime(3_999);
      await flush();
      expect(harness.spawnFn).toHaveBeenCalledTimes(3);
      jest.advanceTimersByTime(1);
      await flush();
      expect(harness.spawnFn).toHaveBeenCalledTimes(4);

      // Crash #4: budget exhausted → unhealthy, no further spawn.
      harness.spawned[3].emitExit(1);
      await flush();
      jest.advanceTimersByTime(10_000);
      await flush();
      expect(harness.spawnFn).toHaveBeenCalledTimes(4);
      expect(harness.service.getStatus().state).toBe('unhealthy');
    });

    it('resets restart count after successful ready', async () => {
      // Distinct from the budget-exhaustion test: here we emit `ready` between
      // crashes, so the second crash should be billed as the *first* crash of
      // a fresh budget — backoff is +1s again, not +2s.
      useFakeTimersForRestart();
      const harness = makeHarness();
      const child0 = await bringUpFakeTimers(harness);

      // First crash → restart at +1s.
      child0.emitExit(1);
      jest.advanceTimersByTime(1_000);
      await flush();
      expect(harness.spawnFn).toHaveBeenCalledTimes(2);

      // Second child reaches ready: restartCount resets to 0.
      const child1 = harness.spawned[1];
      child1.emitStdout({ id: null, ready: true });
      await flush();
      expect(harness.service.getStatus().state).toBe('ready');

      // Crash again. Budget was reset, so backoff is the *first* slot (+1s),
      // not the second (+2s). Verify by stepping just under 1s and confirming
      // no spawn yet, then crossing the threshold.
      child1.emitExit(1);
      jest.advanceTimersByTime(999);
      await flush();
      expect(harness.spawnFn).toHaveBeenCalledTimes(2);
      jest.advanceTimersByTime(1);
      await flush();
      expect(harness.spawnFn).toHaveBeenCalledTimes(3);

      // Tear down the still-starting child #3 so no orphan timers / processes
      // leak into the next test.
      const shutdown = harness.service.shutdown();
      await flush();
      harness.spawned[2].emitExit(0);
      await shutdown;
    });

    it('rejects in-flight and queued requests when sidecar crashes mid-flight', async () => {
      // Two concurrent ocr() calls: the first claims the in-flight slot and
      // sits in `pending`; the second waits in the slot queue. A crash before
      // either completes must reject *both* — historically the queued waiter
      // would hang forever because the queue was cleared without rejecting.
      const harness = makeHarness();
      const child = await bringUp(harness);

      const first = harness.service.ocr('/in-flight.jpg', []);
      const second = harness.service.ocr('/queued.jpg', []);
      // Suppress unhandled-rejection noise; we await both below.
      first.catch(() => {});
      second.catch(() => {});
      await flush();

      // Sanity: only the first request was actually sent.
      const sent = child.writtenLines().filter(l => l.op === 'ocr');
      expect(sent).toHaveLength(1);
      expect(sent[0].image_path).toBe('/in-flight.jpg');

      // Crash the sidecar before either response arrives.
      child.emitExit(1);
      await flush();

      await expect(first).rejects.toBeInstanceOf(OcrSidecarError);
      await expect(first).rejects.toThrow(/sidecar exited/);
      await expect(second).rejects.toBeInstanceOf(OcrSidecarError);
      await expect(second).rejects.toThrow(/sidecar exited/);

      // Cancel the pending real-timer auto-restart so it doesn't fire after
      // the test ends and emit a stray "Spawning OCR sidecar" log.
      await harness.service.shutdown();
    });

    it('does not restart after explicit shutdown', async () => {
      // shutdown() must mark the exit as expected: no crash bookkeeping, no
      // restart timer, no spawn beyond the original. We advance well past the
      // entire backoff schedule (1+2+4=7s) to be sure.
      useFakeTimersForRestart();
      const harness = makeHarness();
      const child = await bringUpFakeTimers(harness);

      const shutdownPromise = harness.service.shutdown();
      await flush();

      // The service wrote `{op:'shutdown'}` and is waiting for exit.
      expect(child.lastWritten()?.op).toBe('shutdown');

      // Sidecar honours the shutdown.
      child.emitExit(0);
      await shutdownPromise;

      // Walk past the full backoff window — nothing new should spawn.
      jest.advanceTimersByTime(10_000);
      await flush();

      expect(harness.spawnFn).toHaveBeenCalledTimes(1);
      const state = harness.service.getStatus().state;
      expect(['not-downloaded', 'unhealthy']).toContain(state);
    });

    it('handles spawn-throws by treating it as a crash', async () => {
      // Synchronous spawn failure (e.g. corrupted binary, ENOENT) should hit
      // the same restart-budget machinery as a runtime crash. Without this,
      // a flaky binary would either bypass backoff (spin-fail) or surface
      // the raw error to every caller until the process magically appears.
      useFakeTimersForRestart();

      const downloader = {
        isAvailable: jest.fn().mockResolvedValue(true),
        download: jest.fn().mockResolvedValue('/fake/kirei-ocr'),
        binaryPath: jest.fn().mockReturnValue('/fake/kirei-ocr'),
      } as unknown as jest.Mocked<OcrSidecarDownloader>;

      const spawned: FakeChild[] = [];
      let spawnCalls = 0;
      const spawnFn = jest.fn(() => {
        spawnCalls += 1;
        if (spawnCalls === 1) {
          throw new Error('ENOENT: kirei-ocr binary missing');
        }
        const child = new FakeChild();
        spawned.push(child);
        return child as unknown as ChildProcess;
      });

      const service = new OcrSidecarService(
        downloader,
        spawnFn as unknown as typeof import('child_process').spawn
      );

      // First ocr() triggers spawn → throws → service records crash + schedules restart.
      const firstOcr = service.ocr('/x.jpg', []);
      firstOcr.catch(() => {});
      await flush();
      await expect(firstOcr).rejects.toThrow(/ENOENT/);
      expect(service.getStatus().state).toBe('crashed');
      expect(spawnFn).toHaveBeenCalledTimes(1);

      // Backoff fires at +1s → second spawn succeeds.
      jest.advanceTimersByTime(1_000);
      await flush();
      expect(spawnFn).toHaveBeenCalledTimes(2);
      const child = spawned[0];
      child.emitStdout({ id: null, ready: true });
      await flush();
      expect(service.getStatus().state).toBe('ready');

      // Switch back to real timers so the next ocr() can use the 60s timeout
      // path without us having to fake-tick it.
      jest.useRealTimers();

      const secondOcr = service.ocr('/x.jpg', []);
      await flush();
      const sent = child.lastWritten();
      expect(sent?.op).toBe('ocr');
      child.emitStdout({ id: sent!.id, results: [] });
      await expect(secondOcr).resolves.toEqual([]);

      // Tear down so the still-alive child doesn't keep the test runner open.
      const shutdown = service.shutdown();
      await flush();
      child.emitExit(0);
      await shutdown;
    });

    it('does not double-spawn when multiple ocr() calls await first download', async () => {
      // Two parallel ocr() calls during the very first ensureReady() must
      // share a single download + a single spawn. Without the cached
      // readyPromise this would race-spawn two children and (worse)
      // double-fetch the 450MB tarball.
      const downloader = {
        isAvailable: jest.fn().mockResolvedValue(false),
        download: jest.fn(),
        binaryPath: jest.fn().mockReturnValue('/fake/kirei-ocr'),
      } as unknown as jest.Mocked<OcrSidecarDownloader>;

      // Hold the download open until we choose to release it.
      let releaseDownload!: (path: string) => void;
      downloader.download.mockReturnValue(
        new Promise<string>(resolve => {
          releaseDownload = resolve;
        })
      );

      const spawned: FakeChild[] = [];
      const spawnFn = jest.fn(() => {
        const child = new FakeChild();
        spawned.push(child);
        return child as unknown as ChildProcess;
      });

      const service = new OcrSidecarService(
        downloader,
        spawnFn as unknown as typeof import('child_process').spawn
      );

      const ocr1 = service.ocr('/a.jpg', []);
      const ocr2 = service.ocr('/b.jpg', []);
      // Both calls are now blocked inside ensureReady() → downloader.download.
      await flush();
      expect(downloader.download).toHaveBeenCalledTimes(1);
      expect(spawnFn).not.toHaveBeenCalled();

      // Release the download → service spawns exactly once.
      releaseDownload('/fake/kirei-ocr');
      await flush();
      expect(spawnFn).toHaveBeenCalledTimes(1);

      const child = spawned[0];
      child.emitStdout({ id: null, ready: true });
      await flush();

      // First request goes out; second waits in the in-flight queue.
      const sent1 = child.writtenLines().filter(l => l.op === 'ocr');
      expect(sent1).toHaveLength(1);
      child.emitStdout({ id: sent1[0].id, results: [] });
      await ocr1;
      await flush();

      // Second request is now in flight.
      const sent2 = child.writtenLines().filter(l => l.op === 'ocr');
      expect(sent2).toHaveLength(2);
      child.emitStdout({ id: sent2[1].id, results: [] });
      await expect(ocr2).resolves.toEqual([]);

      // Critical assertions: still exactly one download, one spawn.
      expect(downloader.download).toHaveBeenCalledTimes(1);
      expect(spawnFn).toHaveBeenCalledTimes(1);

      // Tear down so the still-alive child doesn't keep the test runner open.
      const shutdown = service.shutdown();
      await flush();
      child.emitExit(0);
      await shutdown;
    });
  });
});
