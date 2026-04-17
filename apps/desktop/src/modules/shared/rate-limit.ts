/**
 * Minimum interval gate — serializes async work through a promise chain and
 * enforces a floor between completions so we never burst past an upstream's
 * rate cap. Used by the MangaDex client (per-bucket) and the DeepL provider.
 */
export class MinIntervalGate {
  private next = Promise.resolve();

  constructor(private readonly intervalMs: number) {}

  schedule<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.next.then(async () => {
      const started = Date.now();
      try {
        return await fn();
      } finally {
        const elapsed = Date.now() - started;
        const wait = this.intervalMs - elapsed;
        if (wait > 0) {
          await sleep(wait);
        }
      }
    });
    // Keep the chain free of rejections so one failure doesn't break the gate.
    this.next = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
