import type { AppSettings } from '@kireimanga/shared';
import { DeepLProvider } from './deepl.provider';
import type { SettingsService } from '../../settings';

/**
 * Build a `Response` with a JSON body. `Response` is global in Node 20+ so no
 * import is needed. Mirrors the `mockResponse()` helper in `mangadex.client.spec.ts`
 * but optimised for DeepL's JSON-only response shape.
 */
function jsonResponse(body: unknown, init: ResponseInit = {}): Promise<Response> {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      headers: { 'content-type': 'application/json' },
      ...init,
    })
  );
}

/** Same idea, but for non-JSON error bodies (5xx text, etc). */
function textResponse(body: string, init: ResponseInit = {}): Promise<Response> {
  return Promise.resolve(
    new Response(body, {
      headers: { 'content-type': 'text/plain', ...(init.headers as Record<string, string>) },
      ...init,
    })
  );
}

/**
 * Minimal `SettingsService` stand-in. The provider only ever calls
 * `settings.get().translation.providerKeys.deepl`, so we ship a fixture object
 * shaped just enough for that path and let the type assertion paper over the
 * unused fields rather than spinning up a Nest test module.
 */
function makeSettings(deeplKey: string | undefined): SettingsService {
  const value = {
    translation: {
      providerKeys: deeplKey === undefined ? {} : { deepl: deeplKey },
    },
  } as unknown as AppSettings;
  return { get: jest.fn().mockReturnValue(value) } as unknown as SettingsService;
}

/** Pull the URL-encoded body from a recorded fetch call. */
function bodyParams(fetchMock: jest.Mock, callIndex = 0): URLSearchParams {
  const init = fetchMock.mock.calls[callIndex][1] as RequestInit;
  return new URLSearchParams(String(init.body));
}

/** Yield to the microtask queue so awaited promises settle under fake timers. */
function flush(): Promise<void> {
  return new Promise(resolve => setImmediate(resolve));
}

/**
 * Advance fake timers in small steps with a microtask flush between each. The
 * provider chains several awaited `setTimeout`s back-to-back (gate floor →
 * user-space backoff → next gate floor), and each one only schedules the next
 * after its own resolution microtask has run. A single big `advanceTimersByTime`
 * will fire all the existing timers but not the ones that get scheduled
 * mid-walk; iterating in 100ms chunks lets each new timer hatch and fire.
 */
async function advanceWithFlush(totalMs: number, stepMs = 100): Promise<void> {
  let remaining = totalMs;
  while (remaining > 0) {
    const step = Math.min(stepMs, remaining);
    jest.advanceTimersByTime(step);
    await flush();
    remaining -= step;
  }
}

/**
 * Enable jest fake timers but leave the microtask runners alone — the provider
 * uses `MinIntervalGate` + `setTimeout` for backoff and Node's stream
 * primitives dispatch via `process.nextTick`. Recipe matches the one in
 * `ocr-sidecar.service.spec.ts`.
 */
function useRetryFakeTimers(): void {
  jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate'] });
}

describe('DeepLProvider', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  describe('translate', () => {
    it('translates a single batch and asserts request shape', async () => {
      // Happy path: 5 strings → one POST with form-urlencoded body, JA→EN-US,
      // DeepL-Auth-Key header set, results returned in input order.
      const fetchMock = jest.fn(() =>
        jsonResponse({
          translations: [
            { text: 'A' },
            { text: 'B' },
            { text: 'C' },
            { text: 'D' },
            { text: 'E' },
          ],
        })
      );
      const provider = new DeepLProvider(makeSettings('test-key:fx'), fetchMock);

      const out = await provider.translate(['a', 'b', 'c', 'd', 'e'], 'en');

      expect(out).toEqual(['A', 'B', 'C', 'D', 'E']);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://api-free.deepl.com/v2/translate');
      expect(init.method).toBe('POST');
      const headers = init.headers as Record<string, string>;
      expect(headers.Authorization).toBe('DeepL-Auth-Key test-key:fx');
      expect(headers['Content-Type']).toBe('application/x-www-form-urlencoded');

      const params = bodyParams(fetchMock);
      expect(params.getAll('text')).toEqual(['a', 'b', 'c', 'd', 'e']);
      expect(params.get('source_lang')).toBe('JA');
      expect(params.get('target_lang')).toBe('EN-US');
      expect(params.get('preserve_formatting')).toBe('1');
    });

    it('chunks inputs over 50 into multiple requests preserving order', async () => {
      // 51 inputs → first request sees 50 `text` entries, second sees 1, and
      // the merged output stays in the original index order.
      const inputs = Array.from({ length: 51 }, (_, i) => `src-${i}`);
      const fetchMock = jest
        .fn()
        .mockImplementationOnce(() =>
          jsonResponse({
            translations: Array.from({ length: 50 }, (_, i) => ({ text: `T-${i}` })),
          })
        )
        .mockImplementationOnce(() =>
          jsonResponse({ translations: [{ text: 'T-50' }] })
        );
      const provider = new DeepLProvider(makeSettings('test-key:fx'), fetchMock);

      const out = await provider.translate(inputs, 'en');

      expect(out).toHaveLength(51);
      expect(out[0]).toBe('T-0');
      expect(out[50]).toBe('T-50');
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(bodyParams(fetchMock, 0).getAll('text')).toHaveLength(50);
      expect(bodyParams(fetchMock, 1).getAll('text')).toEqual(['src-50']);
    });

    it('short-circuits on empty input without hitting the network', async () => {
      // `[]` → no fetch call at all, returns `[]`. Defends against burning a
      // request quota when an upstream OCR step yields zero bubbles.
      const fetchMock = jest.fn();
      const provider = new DeepLProvider(makeSettings('test-key:fx'), fetchMock);

      await expect(provider.translate([], 'en')).resolves.toEqual([]);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('throws when DeepL returns a different number of translations than inputs', async () => {
      // Length-mismatch defense: silently dropping a translation here would
      // misalign the bubble overlay against the OCR boxes downstream.
      const fetchMock = jest.fn(() =>
        jsonResponse({
          translations: [{ text: 'A' }, { text: 'B' }, { text: 'C' }, { text: 'D' }],
        })
      );
      const provider = new DeepLProvider(makeSettings('test-key:fx'), fetchMock);

      await expect(provider.translate(['a', 'b', 'c', 'd', 'e'], 'en')).rejects.toThrow(
        /response length mismatch.*sent 5.*got 4/
      );
    });

    it('targets the free endpoint when the key ends in :fx', async () => {
      // Free-tier keys carry the `:fx` suffix per DeepL's docs.
      const fetchMock = jest.fn(() =>
        jsonResponse({ translations: [{ text: 'OK' }] })
      );
      const provider = new DeepLProvider(makeSettings('abc-123:fx'), fetchMock);

      await provider.translate(['x'], 'en');

      expect(fetchMock.mock.calls[0][0]).toBe('https://api-free.deepl.com/v2/translate');
    });

    it('targets the pro endpoint when the key has no :fx suffix', async () => {
      // Pro keys hit the paid endpoint.
      const fetchMock = jest.fn(() =>
        jsonResponse({ translations: [{ text: 'OK' }] })
      );
      const provider = new DeepLProvider(makeSettings('abc-123'), fetchMock);

      await provider.translate(['x'], 'en');

      expect(fetchMock.mock.calls[0][0]).toBe('https://api.deepl.com/v2/translate');
    });

    it('maps BCP-47 target langs (en→EN-US, pl→PL)', async () => {
      // DeepL recommends regional `EN-US` over the bare `EN`; `PL` has no
      // regional variant so it stays as-is.
      const fetchMock = jest
        .fn()
        .mockImplementation(() => jsonResponse({ translations: [{ text: 'OK' }] }));
      const provider = new DeepLProvider(makeSettings('test-key:fx'), fetchMock);

      await provider.translate(['hi'], 'pl');
      expect(bodyParams(fetchMock, 0).get('target_lang')).toBe('PL');

      await provider.translate(['hi'], 'EN');
      expect(bodyParams(fetchMock, 1).get('target_lang')).toBe('EN-US');
    });

    it('forwards an explicit sourceLang as DeepL uppercase source_lang', async () => {
      // DeepL uses uppercase ISO-639-1 for source. The provider must map
      // BCP-47 `'en'` → `'EN'` and pass through unmapped tags as uppercase.
      const fetchMock = jest
        .fn()
        .mockImplementation(() => jsonResponse({ translations: [{ text: 'OK' }] }));
      const provider = new DeepLProvider(makeSettings('test-key:fx'), fetchMock);

      await provider.translate(['hi'], 'pl', 'en');
      expect(bodyParams(fetchMock, 0).get('source_lang')).toBe('EN');

      await provider.translate(['hi'], 'pl', 'ko');
      expect(bodyParams(fetchMock, 1).get('source_lang')).toBe('KO');

      // Unmapped sourceLang falls through uppercase; DeepL will 400 if the
      // lang is unsupported, but that surfaces a clear error to the user.
      await provider.translate(['hi'], 'pl', 'xx');
      expect(bodyParams(fetchMock, 2).get('source_lang')).toBe('XX');
    });

    it('defaults source_lang to JA when sourceLang is omitted (preserves v0.3 behaviour)', async () => {
      const fetchMock = jest.fn(() =>
        jsonResponse({ translations: [{ text: 'OK' }] })
      );
      const provider = new DeepLProvider(makeSettings('test-key:fx'), fetchMock);

      await provider.translate(['hi'], 'en');
      expect(bodyParams(fetchMock, 0).get('source_lang')).toBe('JA');
    });
  });

  describe('429 retry', () => {
    it('honors Retry-After (seconds) on a 429 response', async () => {
      // First response is 429 with Retry-After: 1 → provider waits 1s under
      // fake timers, second response succeeds. Asserts exactly two fetch
      // calls and the second one returns the translation.
      useRetryFakeTimers();

      const fetchMock = jest
        .fn()
        .mockImplementationOnce(() =>
          textResponse('rate limited', {
            status: 429,
            headers: { 'retry-after': '1' },
          })
        )
        .mockImplementationOnce(() => jsonResponse({ translations: [{ text: 'OK' }] }));
      const provider = new DeepLProvider(makeSettings('test-key:fx'), fetchMock);

      const promise = provider.translate(['hi'], 'en');

      // Let the first request resolve and the gate's post-request settle.
      await flush();
      // Roll past the gate's 200ms floor (so the chain unblocks) plus the
      // 1000ms Retry-After backoff plus the next gate floor. We step in
      // small chunks so each chained `setTimeout` gets a chance to schedule
      // its successor under fake timers.
      await advanceWithFlush(2_000);

      await expect(promise).resolves.toEqual(['OK']);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('exponentially backs off on 5xx with no Retry-After', async () => {
      // 500 → 500 → 200. First retry waits ~1s (1000 * 2^0), second ~2s
      // (1000 * 2^1). Asserts three fetch attempts and that no fetch fires
      // before its scheduled time.
      useRetryFakeTimers();

      const fetchMock = jest
        .fn()
        .mockImplementationOnce(() => textResponse('boom', { status: 500 }))
        .mockImplementationOnce(() => textResponse('boom', { status: 502 }))
        .mockImplementationOnce(() => jsonResponse({ translations: [{ text: 'OK' }] }));
      const provider = new DeepLProvider(makeSettings('test-key:fx'), fetchMock);

      const promise = provider.translate(['hi'], 'en');

      await flush();
      expect(fetchMock).toHaveBeenCalledTimes(1);

      // First backoff window: gate floor (200ms) + 1000ms exponential + the
      // next gate floor before fn() runs again.
      await advanceWithFlush(2_000);
      expect(fetchMock).toHaveBeenCalledTimes(2);

      // Second backoff: gate floor + 2000ms exponential + next gate floor.
      await advanceWithFlush(3_000);
      expect(fetchMock).toHaveBeenCalledTimes(3);

      await expect(promise).resolves.toEqual(['OK']);
    });

    it('throws after MAX_RETRIES with the response body excerpt', async () => {
      // 4 consecutive 503s (initial attempt + 3 retries) → terminal error
      // surfaces the body so the user-visible message stays diagnosable.
      useRetryFakeTimers();

      const fetchMock = jest.fn(() =>
        textResponse('upstream is on fire', { status: 503 })
      );
      const provider = new DeepLProvider(makeSettings('test-key:fx'), fetchMock);

      const promise = provider.translate(['hi'], 'en');
      // Swallow now so the unhandled-rejection guard doesn't trip while we
      // tick through the backoff schedule.
      promise.catch(() => {});

      await flush();

      // Walk past the full backoff sequence: gate floors + 1s + 2s + 4s.
      // Advance generously past the sum (~8s) so every chained timer fires.
      await advanceWithFlush(12_000);

      await expect(promise).rejects.toThrow(/DeepL 503/);
      await expect(promise).rejects.toThrow(/upstream is on fire/);
      expect(fetchMock).toHaveBeenCalledTimes(4);
    });
  });

  describe('hard errors', () => {
    it('throws on 401 without retrying', async () => {
      // Auth failures are terminal — retrying would just burn quota and
      // delay the user-visible error.
      const fetchMock = jest.fn(() => textResponse('forbidden', { status: 401 }));
      const provider = new DeepLProvider(makeSettings('bad-key:fx'), fetchMock);

      await expect(provider.translate(['hi'], 'en')).rejects.toThrow(/invalid API key/);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('throws on 456 quota-exceeded without retrying', async () => {
      // 456 is DeepL's monthly-cap signal. Surfacing the quota wording lets
      // the settings UI direct the user at upgrading instead of retrying.
      const fetchMock = jest.fn(() => textResponse('quota', { status: 456 }));
      const provider = new DeepLProvider(makeSettings('test-key:fx'), fetchMock);

      await expect(provider.translate(['hi'], 'en')).rejects.toThrow(
        /monthly character limit/
      );
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('status', () => {
    it('returns no-api-key without hitting the network when no key is configured', async () => {
      // Missing key short-circuits before any request. The settings UI relies
      // on this to display the "configure key" prompt without burning a probe.
      const fetchMock = jest.fn();
      const provider = new DeepLProvider(makeSettings(undefined), fetchMock);

      await expect(provider.status()).resolves.toEqual({
        id: 'deepl',
        ok: false,
        reason: 'no-api-key',
      });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('reports remaining characters from /v2/usage on the happy path', async () => {
      // limit - count = remaining; the settings UI shows this number to
      // help users gauge how much quota is left before a reading session.
      const fetchMock = jest.fn(() =>
        jsonResponse({ character_count: 100, character_limit: 500_000 })
      );
      const provider = new DeepLProvider(makeSettings('test-key:fx'), fetchMock);

      const result = await provider.status();

      expect(result).toEqual({ id: 'deepl', ok: true, remainingChars: 499_900 });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0][0]).toBe('https://api-free.deepl.com/v2/usage');
    });

    it('returns invalid-api-key on 401 without throwing', async () => {
      // status() must never throw — settings panel polls it on a timer and an
      // unhandled rejection would tear the panel down.
      const fetchMock = jest.fn(() => textResponse('nope', { status: 401 }));
      const provider = new DeepLProvider(makeSettings('bad-key'), fetchMock);

      await expect(provider.status()).resolves.toEqual({
        id: 'deepl',
        ok: false,
        reason: 'invalid-api-key',
      });
    });
  });
});
