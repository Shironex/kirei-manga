/**
 * Process `items` with at most `limit` concurrent `fn` calls in flight.
 * Returned array is index-aligned with `items`. Kept inline (instead of
 * pulling in `p-limit`) because it's 12 lines and the semantics matter:
 *   - Errors reject the whole pool (we never want a silent half-scan).
 *   - Workers finish naturally — no AbortController plumbing, which we
 *     don't need for the scanner's bounded workload.
 */
export async function asyncPool<T, R>(
  limit: number,
  items: readonly T[],
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  const worker = async (): Promise<void> => {
    while (true) {
      const i = cursor;
      cursor += 1;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  };

  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, () =>
    worker()
  );
  await Promise.all(workers);
  return results;
}
