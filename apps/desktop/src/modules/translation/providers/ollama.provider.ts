import { Injectable, Optional } from '@nestjs/common';
import { createLogger, type TranslationProviderStatus } from '@kireimanga/shared';
import { SettingsService } from '../../settings';
import { getFetch, type FetchLike } from '../../shared/net-fetch';
import { sleep } from '../../shared/rate-limit';
import type { TranslationProvider } from './provider.interface';

const logger = createLogger('OllamaProvider');

const DEFAULT_ENDPOINT = 'http://localhost:11434';
const DEFAULT_MODEL = 'qwen2:7b';
// Local Ollama errors are usually local-environment problems (model crashed,
// out of VRAM) rather than transient network issues, so we cap retries lower
// than DeepL/Google.
const MAX_RETRIES = 2;
// 60s ceiling for one full /api/chat round-trip. Local models can be slow
// enough on cold-start that a tighter window would routinely false-fail; the
// AbortController fires after this and the catch path maps it to a network
// error.
const REQUEST_TIMEOUT_MS = 60_000;

/**
 * BCP-47 -> human-readable target-language for the system-prompt phrasing.
 * The model is told to translate "to <name>" rather than to a tag, because
 * LLMs follow natural-language directives more reliably than ISO codes.
 * Anything not listed falls back to the raw tag — the model usually copes.
 */
const TARGET_LANG_NAMES: Record<string, string> = {
  en: 'English',
  pl: 'Polish',
};

function targetLangLabel(bcp47: string): string {
  const lower = bcp47.toLowerCase();
  return TARGET_LANG_NAMES[lower] ?? bcp47;
}

interface OllamaChatResponse {
  model: string;
  message: { role: string; content: string };
  done: boolean;
}

interface OllamaTagsResponse {
  models: Array<{ name: string }>;
}

function isChatResponse(value: unknown): value is OllamaChatResponse {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (!v.message || typeof v.message !== 'object') return false;
  const message = v.message as Record<string, unknown>;
  return typeof message.content === 'string';
}

function isTagsResponse(value: unknown): value is OllamaTagsResponse {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (!Array.isArray(v.models)) return false;
  return v.models.every(
    m => m && typeof m === 'object' && typeof (m as Record<string, unknown>).name === 'string'
  );
}

/**
 * Build the system + user prompt for one batch translation. Pure function so
 * the spec can assert the exact phrasing without spinning up the provider.
 *
 * The "Line N: text" framing is more robust than newline-only input because
 * LLMs occasionally emit blank lines, commentary, or reorder outputs; the
 * prefix lets `parseResponse` map every reply back to its source index even
 * when the model misbehaves.
 */
export function formatPrompt(
  texts: string[],
  targetLang: string
): { system: string; user: string } {
  const langLabel = targetLangLabel(targetLang);
  const system = [
    `You are a manga translator. Translate Japanese text to ${langLabel}.`,
    'Keep honorifics (-san, -kun, -chan, -sama, -sensei).',
    'Do not paraphrase.',
    'Output one translation per input line, in the same order.',
    'Use the exact prefix "Line N: " (matching the input numbering) for each output line.',
    'No commentary.',
  ].join(' ');
  const user = texts.map((text, i) => `Line ${i + 1}: ${text}`).join('\n');
  return { system, user };
}

const LINE_PREFIX_RE = /^Line\s+(\d+)\s*:\s*(.*)$/;

/**
 * Pure parser for an Ollama chat response. Splits the model output into lines,
 * extracts entries that start with `Line N:` and maps them back to the input
 * index `N - 1`. If the prefix mapping fills fewer than `expectedCount` slots
 * (model dropped the prefix, emitted a blank line, etc.), falls back to a
 * sequential mapping over the non-empty lines and warn-logs the discrepancy.
 *
 * Always returns an array of length `expectedCount` so the orchestrator can
 * align translations to bubble indices without extra defensive code; missing
 * slots become empty strings as a last resort.
 */
export function parseResponse(content: string, expectedCount: number): string[] {
  if (expectedCount <= 0) return [];
  const lines = content.split(/\r?\n/);
  const out: Array<string | undefined> = new Array(expectedCount);

  let prefixHits = 0;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const match = LINE_PREFIX_RE.exec(line);
    if (!match) continue;
    const idx = Number(match[1]) - 1;
    if (idx < 0 || idx >= expectedCount) continue;
    if (out[idx] !== undefined) continue;
    out[idx] = match[2].trim();
    prefixHits += 1;
  }

  if (prefixHits < expectedCount) {
    // Fallback: best-effort sequential mapping over non-empty lines that the
    // prefix pass didn't already consume. This rescues the case where the
    // model dropped the `Line N:` prefix on some outputs.
    const filledIndexes = new Set<number>();
    for (let i = 0; i < expectedCount; i += 1) {
      if (out[i] !== undefined) filledIndexes.add(i);
    }
    const sequentialQueue: string[] = [];
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      if (LINE_PREFIX_RE.test(line)) continue;
      sequentialQueue.push(line);
    }
    let cursor = 0;
    for (let i = 0; i < expectedCount && cursor < sequentialQueue.length; i += 1) {
      if (filledIndexes.has(i)) continue;
      out[i] = sequentialQueue[cursor];
      cursor += 1;
    }
    logger.warn(
      `Ollama: parse fallback engaged — only ${prefixHits}/${expectedCount} prefix matches; sequential filled ${cursor} additional lines`
    );
  }

  // `Array.from(out)` materialises any holes the prefix-only path left behind
  // so the subsequent map sees `undefined` for missing slots instead of
  // skipping them; the fallback returns `''` for any slot the model never
  // filled, preserving the alignment invariant.
  return Array.from(out, value => value ?? '');
}

/**
 * Ollama local-model translation provider. Talks to a user-installed Ollama
 * runtime over its HTTP API (`/api/chat` for translation, `/api/tags` for
 * health). Endpoint and model name come from
 * `AppSettings.translation.providerKeys.{ollamaEndpoint, ollamaModel}`,
 * defaulting to `http://localhost:11434` and `qwen2:7b`.
 *
 * Unlike DeepL/Google, all texts for a page go in one request — local LLMs
 * handle 10-30 bubbles per call comfortably and the per-request overhead is
 * higher than the hosted APIs. Streaming (J.3) is intentionally not wired here.
 */
@Injectable()
export class OllamaProvider implements TranslationProvider {
  readonly id = 'ollama' as const;

  private readonly fetch: FetchLike;

  constructor(
    private readonly settings: SettingsService,
    @Optional() fetchFn?: FetchLike
  ) {
    // Optional `fetchFn` mirrors the seam used by DeepL / Google specs; prod
    // uses Electron's `net.fetch` (or global fetch in non-Electron builds),
    // tests inject a jest mock.
    this.fetch = fetchFn ?? getFetch();
  }

  /** Translate a batch of source strings in a single Ollama chat request. */
  async translate(texts: string[], targetLang: string): Promise<string[]> {
    if (texts.length === 0) return [];

    const endpoint = this.getEndpoint();
    const model = this.getModel();
    const { system, user } = formatPrompt(texts, targetLang);

    const url = `${endpoint}/api/chat`;
    const body = JSON.stringify({
      model,
      stream: false,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    });
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };

    const content = await this.postChat(url, body, headers, model, endpoint);
    const parsed = parseResponse(content, texts.length);
    if (parsed.length !== texts.length) {
      // parseResponse always returns exactly expectedCount entries today, but
      // the guard documents the invariant for future edits.
      throw new Error(
        `Ollama: response length mismatch — sent ${texts.length}, got ${parsed.length}`
      );
    }
    return parsed;
  }

  /**
   * Probe `/api/tags` to confirm the endpoint is reachable AND the configured
   * model is installed. Distinguishing those two failure modes lets the
   * settings UI tell the user whether to start Ollama or pull the model.
   */
  async status(): Promise<TranslationProviderStatus> {
    const endpoint = this.getEndpoint();
    const model = this.getModel();
    const url = `${endpoint}/api/tags`;

    let response: Response;
    try {
      response = await this.fetchWithTimeout(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
    } catch {
      return { id: this.id, ok: false, reason: 'endpoint unreachable' };
    }

    if (!response.ok) {
      return { id: this.id, ok: false, reason: 'endpoint unreachable' };
    }

    let json: unknown;
    try {
      json = await response.json();
    } catch {
      return { id: this.id, ok: false, reason: 'endpoint unreachable' };
    }

    if (!isTagsResponse(json)) {
      return { id: this.id, ok: false, reason: 'endpoint unreachable' };
    }

    const installed = json.models.some(m => m.name === model);
    if (!installed) {
      return { id: this.id, ok: false, reason: 'model not installed' };
    }

    // Local has no quota — `remainingChars` is intentionally omitted.
    return { id: this.id, ok: true };
  }

  private getEndpoint(): string {
    const raw = this.settings.get().translation.providerKeys.ollamaEndpoint;
    const endpoint = raw && raw.length > 0 ? raw : DEFAULT_ENDPOINT;
    // Trim a trailing slash so `${endpoint}/api/chat` doesn't double up.
    return endpoint.replace(/\/+$/, '');
  }

  private getModel(): string {
    const model = this.settings.get().translation.providerKeys.ollamaModel;
    return model && model.length > 0 ? model : DEFAULT_MODEL;
  }

  /**
   * POST one chat request with timeout, retry on 5xx and connection errors,
   * and granular error messages for the two most common local-Ollama setup
   * problems (daemon down, model not pulled).
   */
  private async postChat(
    url: string,
    body: string,
    headers: Record<string, string>,
    model: string,
    endpoint: string
  ): Promise<string> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
      let response: Response;
      try {
        response = await this.fetchWithTimeout(url, {
          method: 'POST',
          headers,
          body,
        });
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (isConnectionRefused(lastError)) {
          throw new Error(
            `Ollama: cannot reach endpoint ${endpoint}. Is Ollama running?`,
            { cause: err }
          );
        }
        if (attempt === MAX_RETRIES) {
          throw new Error(
            `Ollama: network error after ${MAX_RETRIES} retries: ${lastError.message}`,
            { cause: err }
          );
        }
        const delay = Math.min(30_000, 1000 * 2 ** attempt);
        logger.warn(
          `network error on Ollama chat — retry ${attempt + 1}/${MAX_RETRIES} in ${delay}ms`
        );
        await sleep(delay);
        continue;
      }

      if (response.status === 404) {
        // Ollama returns 404 when the requested model isn't pulled. The body
        // is JSON like `{"error":"model 'qwen2:7b' not found, try pulling it first"}`
        // — we surface a fixed-format message because it's actionable and
        // we don't want to leak the upstream wording into UI copy.
        throw new Error(
          'Ollama: model ' + model + ' not installed. Run `ollama pull ' + model + '`'
        );
      }

      if (response.status >= 500) {
        if (attempt === MAX_RETRIES) {
          const bodyText = await response.text().catch(() => '');
          throw new Error(
            `Ollama ${response.status} after ${MAX_RETRIES} retries: ${bodyText.slice(0, 200)}`
          );
        }
        const delay = Math.min(30_000, 1000 * 2 ** attempt);
        logger.warn(
          `${response.status} from Ollama — retry ${attempt + 1}/${MAX_RETRIES} in ${delay}ms`
        );
        await sleep(delay);
        continue;
      }

      if (!response.ok) {
        const bodyText = await response.text().catch(() => '');
        throw new Error(
          `Ollama ${response.status} ${response.statusText}: ${bodyText.slice(0, 200)}`
        );
      }

      const json: unknown = await response.json();
      if (!isChatResponse(json)) {
        throw new Error('Ollama: malformed chat response');
      }
      return json.message.content;
    }

    throw lastError ?? new Error('Ollama: chat exhausted retries');
  }

  /** `fetch` wrapper with a 60s AbortController so a hung daemon doesn't block forever. */
  private async fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      return await this.fetch(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }
}

/**
 * Best-effort sniffer for "endpoint not listening" failures across the fetch
 * implementations we care about (Electron `net.fetch`, Node's undici-backed
 * global fetch, and jest mocks that throw a stock `Error('ECONNREFUSED')`).
 */
function isConnectionRefused(err: Error): boolean {
  const message = err.message ?? '';
  if (/ECONNREFUSED/i.test(message)) return true;
  if (/connection refused/i.test(message)) return true;
  if (/failed to fetch/i.test(message)) return true;
  const cause = (err as { cause?: unknown }).cause;
  if (cause && typeof cause === 'object') {
    const code = (cause as { code?: unknown }).code;
    if (typeof code === 'string' && /ECONNREFUSED/i.test(code)) return true;
  }
  return false;
}
