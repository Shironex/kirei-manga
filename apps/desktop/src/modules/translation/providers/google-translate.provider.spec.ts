import type { AppSettings } from '@kireimanga/shared';
import { GoogleTranslateProvider } from './google-translate.provider';
import type { SettingsService } from '../../settings';

/**
 * Build a `Response` with a JSON body. `Response` is global in Node 20+ so no
 * import is needed. Mirrors the helper in `deepl.provider.spec.ts` but tuned
 * for Google's JSON-only response shape.
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
 * Minimal `SettingsService` stand-in. The provider only ever reads
 * `settings.get().translation.providerKeys.google`; we ship a fixture object
 * shaped just enough for that path and let the type assertion paper over the
 * unused fields rather than spinning up a Nest test module.
 */
function makeSettings(googleKey: string | undefined): SettingsService {
  const value = {
    translation: {
      providerKeys: googleKey === undefined ? {} : { google: googleKey },
    },
  } as unknown as AppSettings;
  return { get: jest.fn().mockReturnValue(value) } as unknown as SettingsService;
}

/** Pull the parsed JSON body from a recorded fetch call. */
function jsonBody(fetchMock: jest.Mock, callIndex = 0): Record<string, unknown> {
  const init = fetchMock.mock.calls[callIndex][1] as RequestInit;
  return JSON.parse(String(init.body)) as Record<string, unknown>;
}

/** Yield to the microtask queue so awaited promises settle under fake timers. */
function flush(): Promise<void> {
  return new Promise(resolve => setImmediate(resolve));
}

/**
 * Advance fake timers in small steps with a microtask flush between each. The
 * provider chains several awaited `setTimeout`s back-to-back (gate floor →
 * user-space backoff → next gate floor), and each one only schedules the next
 * after its own resolution microtask has run.
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
 * primitives dispatch via `process.nextTick`.
 */
function useRetryFakeTimers(): void {
  jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate'] });
}

describe('GoogleTranslateProvider', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  describe('translate', () => {
    it('translates a single batch and asserts request shape', async () => {
      // Happy path: 5 strings → one POST to translate v2 with API key in the
      // URL query, JSON body carrying q/source/target/format, results returned
      // in input order from `data.translations[].translatedText`.
      const fetchMock = jest.fn(() =>
        jsonResponse({
          data: {
            translations: [
              { translatedText: 'A', detectedSourceLanguage: 'ja' },
              { translatedText: 'B' },
              { translatedText: 'C' },
              { translatedText: 'D' },
              { translatedText: 'E' },
            ],
          },
        })
      );
      const provider = new GoogleTranslateProvider(makeSettings('test-key'), fetchMock);

      const out = await provider.translate(['a', 'b', 'c', 'd', 'e'], 'en');

      expect(out).toEqual(['A', 'B', 'C', 'D', 'E']);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(
        'https://translation.googleapis.com/language/translate/v2?key=test-key'
      );
      expect(init.method).toBe('POST');
      const headers = init.headers as Record<string, string>;
      expect(headers['Content-Type']).toBe('application/json');
      expect(headers.Accept).toBe('application/json');

      const body = jsonBody(fetchMock);
      expect(body.q).toEqual(['a', 'b', 'c', 'd', 'e']);
      expect(body.source).toBe('ja');
      expect(body.target).toBe('en');
      expect(body.format).toBe('text');
    });

    it('chunks inputs over 128 into multiple requests preserving order', async () => {
      // 129 inputs → first request sees 128 `q` entries, second sees 1, and
      // the merged output stays in original index order.
      const inputs = Array.from({ length: 129 }, (_, i) => `src-${i}`);
      const fetchMock = jest
        .fn()
        .mockImplementationOnce(() =>
          jsonResponse({
            data: {
              translations: Array.from({ length: 128 }, (_, i) => ({
                translatedText: `T-${i}`,
              })),
            },
          })
        )
        .mockImplementationOnce(() =>
          jsonResponse({ data: { translations: [{ translatedText: 'T-128' }] } })
        );
      const provider = new GoogleTranslateProvider(makeSettings('test-key'), fetchMock);

      const out = await provider.translate(inputs, 'en');

      expect(out).toHaveLength(129);
      expect(out[0]).toBe('T-0');
      expect(out[128]).toBe('T-128');
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect((jsonBody(fetchMock, 0).q as string[]).length).toBe(128);
      expect(jsonBody(fetchMock, 1).q).toEqual(['src-128']);
    });

    it('short-circuits on empty input without hitting the network', async () => {
      // `[]` → no fetch call at all, returns `[]`. Defends against burning a
      // request quota when an upstream OCR step yields zero bubbles.
      const fetchMock = jest.fn();
      const provider = new GoogleTranslateProvider(makeSettings('test-key'), fetchMock);

      await expect(provider.translate([], 'en')).resolves.toEqual([]);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('throws when Google returns a different number of translations than inputs', async () => {
      // Length-mismatch defense: silently dropping a translation here would
      // misalign the bubble overlay against the OCR boxes downstream.
      const fetchMock = jest.fn(() =>
        jsonResponse({
          data: {
            translations: [
              { translatedText: 'A' },
              { translatedText: 'B' },
              { translatedText: 'C' },
              { translatedText: 'D' },
            ],
          },
        })
      );
      const provider = new GoogleTranslateProvider(makeSettings('test-key'), fetchMock);

      await expect(provider.translate(['a', 'b', 'c', 'd', 'e'], 'en')).rejects.toThrow(
        /response length mismatch.*sent 5.*got 4/
      );
    });

    it('lowercases the target lang and hardcodes source=ja', async () => {
      // Google v2 expects lowercase ISO-639-1; the helper normalises whatever
      // BCP-47 tag the orchestrator passes in. Source is fixed to `ja` for
      // v0.3 — Slice F can extend the interface if multi-source ever matters.
      const fetchMock = jest
        .fn()
        .mockImplementation(() =>
          jsonResponse({ data: { translations: [{ translatedText: 'OK' }] } })
        );
      const provider = new GoogleTranslateProvider(makeSettings('test-key'), fetchMock);

      await provider.translate(['hi'], 'EN');
      const body = jsonBody(fetchMock, 0);
      expect(body.target).toBe('en');
      expect(body.source).toBe('ja');
    });

    it('URL-encodes the API key in the query string', async () => {
      // Special characters in the key (Google keys are usually alphanumeric +
      // `-`/`_`, but a paranoid encode keeps any future migration safe).
      const fetchMock = jest.fn(() =>
        jsonResponse({ data: { translations: [{ translatedText: 'OK' }] } })
      );
      const provider = new GoogleTranslateProvider(
        makeSettings('a/b+c=d'),
        fetchMock
      );

      await provider.translate(['hi'], 'en');

      const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(
        'https://translation.googleapis.com/language/translate/v2?key=a%2Fb%2Bc%3Dd'
      );
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
        .mockImplementationOnce(() =>
          jsonResponse({ data: { translations: [{ translatedText: 'OK' }] } })
        );
      const provider = new GoogleTranslateProvider(makeSettings('test-key'), fetchMock);

      const promise = provider.translate(['hi'], 'en');

      await flush();
      // Roll past the gate's 200ms floor + the 1000ms Retry-After backoff +
      // the next gate floor. Step in small chunks so each chained
      // `setTimeout` gets a chance to schedule its successor under fake timers.
      await advanceWithFlush(2_000);

      await expect(promise).resolves.toEqual(['OK']);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('exponentially backs off on 5xx with no Retry-After', async () => {
      // 500 → 502 → 200. First retry waits ~1s (1000 * 2^0), second ~2s.
      // Asserts three fetch attempts and that no fetch fires before its
      // scheduled time.
      useRetryFakeTimers();

      const fetchMock = jest
        .fn()
        .mockImplementationOnce(() => textResponse('boom', { status: 500 }))
        .mockImplementationOnce(() => textResponse('boom', { status: 502 }))
        .mockImplementationOnce(() =>
          jsonResponse({ data: { translations: [{ translatedText: 'OK' }] } })
        );
      const provider = new GoogleTranslateProvider(makeSettings('test-key'), fetchMock);

      const promise = provider.translate(['hi'], 'en');

      await flush();
      expect(fetchMock).toHaveBeenCalledTimes(1);

      await advanceWithFlush(2_000);
      expect(fetchMock).toHaveBeenCalledTimes(2);

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
      const provider = new GoogleTranslateProvider(makeSettings('test-key'), fetchMock);

      const promise = provider.translate(['hi'], 'en');
      promise.catch(() => {});

      await flush();
      // Walk past the full backoff sequence: gate floors + 1s + 2s + 4s.
      await advanceWithFlush(12_000);

      await expect(promise).rejects.toThrow(/Google 503/);
      await expect(promise).rejects.toThrow(/upstream is on fire/);
      expect(fetchMock).toHaveBeenCalledTimes(4);
    });
  });

  describe('hard errors', () => {
    it('throws on 400 invalid request without retrying', async () => {
      // Bad request bodies (unsupported lang, etc.) are terminal — retrying
      // wastes quota.
      const fetchMock = jest.fn(() =>
        textResponse('{"error":{"message":"bad lang"}}', { status: 400 })
      );
      const provider = new GoogleTranslateProvider(makeSettings('test-key'), fetchMock);

      await expect(provider.translate(['hi'], 'zz')).rejects.toThrow(
        /Google 400 invalid request/
      );
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('throws on 401 without retrying', async () => {
      // Auth failures are terminal.
      const fetchMock = jest.fn(() => textResponse('unauthorized', { status: 401 }));
      const provider = new GoogleTranslateProvider(
        makeSettings('bad-key'),
        fetchMock
      );

      await expect(provider.translate(['hi'], 'en')).rejects.toThrow(
        /Google: invalid API key/
      );
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('classifies 403 keyInvalid as invalid API key', async () => {
      // Google returns 403 for both bad keys and exhausted quota; we read
      // `error.errors[].reason` to surface the right user message.
      const errorBody = JSON.stringify({
        error: {
          code: 403,
          message: 'API key not valid. Please pass a valid API key.',
          errors: [{ reason: 'keyInvalid', message: 'Bad key' }],
        },
      });
      const fetchMock = jest.fn(() => textResponse(errorBody, { status: 403 }));
      const provider = new GoogleTranslateProvider(
        makeSettings('bad-key'),
        fetchMock
      );

      await expect(provider.translate(['hi'], 'en')).rejects.toThrow(
        /Google: invalid API key$/
      );
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('classifies 403 dailyLimitExceeded as quota exhausted', async () => {
      const errorBody = JSON.stringify({
        error: {
          code: 403,
          message: 'Daily Limit Exceeded',
          errors: [{ reason: 'dailyLimitExceeded', message: 'over' }],
        },
      });
      const fetchMock = jest.fn(() => textResponse(errorBody, { status: 403 }));
      const provider = new GoogleTranslateProvider(makeSettings('test-key'), fetchMock);

      await expect(provider.translate(['hi'], 'en')).rejects.toThrow(
        /Google: quota exhausted/
      );
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('status', () => {
    it('returns no-api-key without hitting the network when no key is configured', async () => {
      // Missing key short-circuits before any request. The settings UI relies
      // on this to display the "configure key" prompt without burning a probe.
      const fetchMock = jest.fn();
      const provider = new GoogleTranslateProvider(makeSettings(undefined), fetchMock);

      await expect(provider.status()).resolves.toEqual({
        id: 'google',
        ok: false,
        reason: 'no-api-key',
      });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('returns ok:true when a key is set without hitting the network', async () => {
      // Google v2 has no /usage endpoint, and a probe translate call would
      // burn billable quota every refresh. We trust key presence and let the
      // settings UI's explicit "Test" button do the round-trip on demand.
      const fetchMock = jest.fn();
      const provider = new GoogleTranslateProvider(makeSettings('test-key'), fetchMock);

      await expect(provider.status()).resolves.toEqual({ id: 'google', ok: true });
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
