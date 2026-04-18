import type { AppSettings } from '@kireimanga/shared';
import {
  OllamaProvider,
  formatPrompt,
  parseResponse,
} from './ollama.provider';
import type { SettingsService } from '../../settings';

/**
 * Build a `Response` with a JSON body. Mirrors the helpers in
 * `deepl.provider.spec.ts` and `google-translate.provider.spec.ts`.
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

interface OllamaSettingsOverrides {
  endpoint?: string;
  model?: string;
}

/**
 * Minimal `SettingsService` stand-in. The provider reads
 * `settings.get().translation.providerKeys.{ollamaEndpoint, ollamaModel}` and
 * falls back to the built-in defaults when either is unset; the fixture only
 * needs to ship the keys the test wants to override.
 */
function makeSettings(overrides: OllamaSettingsOverrides = {}): SettingsService {
  const providerKeys: Record<string, string> = {};
  if (overrides.endpoint !== undefined) providerKeys.ollamaEndpoint = overrides.endpoint;
  if (overrides.model !== undefined) providerKeys.ollamaModel = overrides.model;
  const value = {
    translation: { providerKeys },
  } as unknown as AppSettings;
  return { get: jest.fn().mockReturnValue(value) } as unknown as SettingsService;
}

/** Yield to the microtask queue so awaited promises settle under fake timers. */
function flush(): Promise<void> {
  return new Promise(resolve => setImmediate(resolve));
}

/**
 * Advance fake timers in small steps with a microtask flush between each. The
 * provider chains several awaited `setTimeout`s back-to-back during retry
 * backoff and each one only schedules the next after its own resolution
 * microtask has run.
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
 * uses `setTimeout` for retry backoff and Node's stream primitives dispatch
 * via `process.nextTick`.
 */
function useRetryFakeTimers(): void {
  jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate'] });
}

/** Pull the parsed JSON body from a recorded fetch call. */
function jsonBody(fetchMock: jest.Mock, callIndex = 0): Record<string, unknown> {
  const init = fetchMock.mock.calls[callIndex][1] as RequestInit;
  return JSON.parse(String(init.body)) as Record<string, unknown>;
}

describe('OllamaProvider', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  describe('formatPrompt', () => {
    it('produces the expected system + user messages with Line N: prefixes', () => {
      // Pure-function check on the exact prompt the provider sends. Locks the
      // honorific + no-paraphrase contract and the numbering scheme that
      // `parseResponse` will key off of.
      const { system, user } = formatPrompt(['こんにちは', 'さようなら'], 'en');

      expect(system).toContain('Translate Japanese text to English');
      expect(system).toContain('Keep honorifics');
      expect(system).toContain('Do not paraphrase');
      expect(system).toContain('No commentary');
      expect(user).toBe('Line 1: こんにちは\nLine 2: さようなら');
    });

    it('falls back to the raw BCP-47 tag when no human label is mapped', () => {
      // Unknown target lang → the raw tag is interpolated; the model usually
      // copes since LLMs recognise most ISO codes.
      const { system } = formatPrompt(['hi'], 'fr');
      expect(system).toContain('Translate Japanese text to fr');
    });
  });

  describe('parseResponse', () => {
    it('extracts translations by Line N: prefix in the original index order', () => {
      // Happy-path parser: the model echoed our prefixes back, even out of
      // order — we still align by the embedded index.
      const out = parseResponse('Line 2: world\nLine 1: hello', 2);
      expect(out).toEqual(['hello', 'world']);
    });

    it('falls back to sequential mapping when prefixes are missing', () => {
      // Worst-case: model dropped the prefix entirely. The parser should fill
      // outputs in input order from non-empty lines so the bubble overlay
      // still gets *some* text per box.
      const out = parseResponse('hello\nworld\ngoodbye', 3);
      expect(out).toEqual(['hello', 'world', 'goodbye']);
    });

    it('mixes prefixed + sequential lines without double-filling slots', () => {
      // Mixed output: line 1 carries its prefix, the rest don't. Index 0 is
      // taken by the prefix pass; the remaining sequential lines fill the
      // earliest empty slots in order.
      const out = parseResponse('Line 1: hello\nworld\ngoodbye', 3);
      expect(out).toEqual(['hello', 'world', 'goodbye']);
    });

    it('returns empty strings for slots the model never filled', () => {
      // Truncated output: the parser must always produce expectedCount entries
      // so the orchestrator can align with bubble indices without extra
      // defensive code.
      const out = parseResponse('Line 1: hello', 3);
      expect(out).toEqual(['hello', '', '']);
    });
  });

  describe('translate', () => {
    it('sends one /api/chat request with the configured model and parses Line N: output', async () => {
      // Happy path: 3 strings -> single POST to /api/chat, stream:false, the
      // system + user messages match `formatPrompt`, and the response content
      // is parsed back into the same order.
      const fetchMock = jest.fn(() =>
        jsonResponse({
          model: 'qwen2:7b',
          message: { role: 'assistant', content: 'Line 1: hello\nLine 2: world\nLine 3: bye' },
          done: true,
        })
      );
      const provider = new OllamaProvider(makeSettings(), fetchMock);

      const out = await provider.translate(['こんにちは', '世界', 'さようなら'], 'en');

      expect(out).toEqual(['hello', 'world', 'bye']);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('http://localhost:11434/api/chat');
      expect(init.method).toBe('POST');
      const headers = init.headers as Record<string, string>;
      expect(headers['Content-Type']).toBe('application/json');

      const body = jsonBody(fetchMock);
      expect(body.model).toBe('qwen2:7b');
      expect(body.stream).toBe(false);
      const messages = body.messages as Array<{ role: string; content: string }>;
      expect(messages).toHaveLength(2);
      expect(messages[0].role).toBe('system');
      expect(messages[0].content).toContain('Translate Japanese text to English');
      expect(messages[1].role).toBe('user');
      expect(messages[1].content).toBe('Line 1: こんにちは\nLine 2: 世界\nLine 3: さようなら');
    });

    it('sends all texts in a single request with no chunking', async () => {
      // Local LLMs handle a whole page's worth of bubbles per call; the
      // provider must not pre-batch the way DeepL/Google do.
      const inputs = Array.from({ length: 30 }, (_, i) => `src-${i}`);
      const replyContent = Array.from(
        { length: 30 },
        (_, i) => `Line ${i + 1}: T-${i}`
      ).join('\n');
      const fetchMock = jest.fn(() =>
        jsonResponse({
          model: 'qwen2:7b',
          message: { role: 'assistant', content: replyContent },
          done: true,
        })
      );
      const provider = new OllamaProvider(makeSettings(), fetchMock);

      const out = await provider.translate(inputs, 'en');

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(out).toHaveLength(30);
      expect(out[0]).toBe('T-0');
      expect(out[29]).toBe('T-29');
    });

    it('short-circuits on empty input without hitting the network', async () => {
      // `[]` -> no fetch call, returns `[]`. Defends against burning a slow
      // local round-trip when an upstream OCR step yields zero bubbles.
      const fetchMock = jest.fn();
      const provider = new OllamaProvider(makeSettings(), fetchMock);

      await expect(provider.translate([], 'en')).resolves.toEqual([]);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('honors the configured endpoint and model overrides', async () => {
      // Endpoint trailing-slash gets trimmed so `${endpoint}/api/chat` doesn't
      // produce `//api/chat`. Model override propagates into the request body.
      const fetchMock = jest.fn(() =>
        jsonResponse({
          model: 'aya',
          message: { role: 'assistant', content: 'Line 1: hi' },
          done: true,
        })
      );
      const provider = new OllamaProvider(
        makeSettings({ endpoint: 'http://10.0.0.5:11434/', model: 'aya' }),
        fetchMock
      );

      await provider.translate(['hi'], 'en');

      const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('http://10.0.0.5:11434/api/chat');
      expect(jsonBody(fetchMock).model).toBe('aya');
    });

    it('maps ECONNREFUSED to the actionable "Is Ollama running?" message', async () => {
      // The most common local-Ollama setup error is "daemon not started".
      // Surface that with copy the settings UI can show verbatim.
      const fetchMock = jest.fn(() => Promise.reject(new Error('connect ECONNREFUSED 127.0.0.1:11434')));
      const provider = new OllamaProvider(makeSettings(), fetchMock);

      await expect(provider.translate(['hi'], 'en')).rejects.toThrow(
        /cannot reach endpoint http:\/\/localhost:11434\. Is Ollama running\?/
      );
      // Connection-refused short-circuits retries — wasted wall-time on a
      // daemon that isn't there is just noise.
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('maps 404 from /api/chat to a "model not installed" message', async () => {
      // 404 means the model tag isn't pulled. Upstream body wording is unstable
      // so the provider uses a fixed-format message that names the model.
      const fetchMock = jest.fn(() =>
        textResponse('{"error":"model not found"}', { status: 404 })
      );
      const provider = new OllamaProvider(makeSettings({ model: 'nope' }), fetchMock);

      await expect(provider.translate(['hi'], 'en')).rejects.toThrow(
        /model nope not installed.*ollama pull nope/
      );
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('retries 5xx up to MAX_RETRIES (2 retries = 3 attempts) then throws', async () => {
      // Cap is intentionally lower than DeepL/Google: a 5xx from a local
      // process usually means OOM or a model crash, not a transient blip.
      useRetryFakeTimers();

      const fetchMock = jest.fn(() => textResponse('boom', { status: 500 }));
      const provider = new OllamaProvider(makeSettings(), fetchMock);

      const promise = provider.translate(['hi'], 'en');
      promise.catch(() => {});

      await flush();
      expect(fetchMock).toHaveBeenCalledTimes(1);

      // First retry waits 1s (1000 * 2^0).
      await advanceWithFlush(1_500);
      expect(fetchMock).toHaveBeenCalledTimes(2);

      // Second retry waits 2s (1000 * 2^1).
      await advanceWithFlush(2_500);
      expect(fetchMock).toHaveBeenCalledTimes(3);

      await expect(promise).rejects.toThrow(/Ollama 500 after 2 retries: boom/);
    });
  });

  describe('status', () => {
    it('returns ok:true when /api/tags lists the configured model', async () => {
      // Happy path: GET /api/tags returns a list including the model. Local
      // has no quota -> no remainingChars on the response.
      const fetchMock = jest.fn(() =>
        jsonResponse({
          models: [
            { name: 'qwen2:7b' },
            { name: 'llama3:8b' },
          ],
        })
      );
      const provider = new OllamaProvider(makeSettings(), fetchMock);

      const result = await provider.status();

      expect(result).toEqual({ id: 'ollama', ok: true });
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('http://localhost:11434/api/tags');
      expect(init.method).toBe('GET');
    });

    it('returns endpoint unreachable when /api/tags fails', async () => {
      // Daemon down -> `endpoint unreachable`. The error must not propagate;
      // the registry's status fan-out depends on `status()` never throwing.
      const fetchMock = jest.fn(() => Promise.reject(new Error('connect ECONNREFUSED')));
      const provider = new OllamaProvider(makeSettings(), fetchMock);

      await expect(provider.status()).resolves.toEqual({
        id: 'ollama',
        ok: false,
        reason: 'endpoint unreachable',
      });
    });

    it('returns model not installed when /api/tags omits the configured model', async () => {
      // Daemon up but the requested tag isn't pulled -> the second of the two
      // distinct local-setup failure modes the settings UI needs to surface.
      const fetchMock = jest.fn(() =>
        jsonResponse({ models: [{ name: 'llama3:8b' }] })
      );
      const provider = new OllamaProvider(makeSettings({ model: 'qwen2:7b' }), fetchMock);

      await expect(provider.status()).resolves.toEqual({
        id: 'ollama',
        ok: false,
        reason: 'model not installed',
      });
    });
  });
});
