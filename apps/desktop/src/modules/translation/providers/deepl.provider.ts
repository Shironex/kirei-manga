import { Injectable, Optional } from '@nestjs/common';
import { createLogger, type TranslationProviderStatus } from '@kireimanga/shared';
import { SettingsService } from '../../settings';
import { getFetch, type FetchLike } from '../../shared/net-fetch';
import { MinIntervalGate, sleep } from '../../shared/rate-limit';
import type { TranslationProvider } from './provider.interface';

const logger = createLogger('DeepLProvider');

const FREE_BASE = 'https://api-free.deepl.com';
const PRO_BASE = 'https://api.deepl.com';

// Generous floor — DeepL doesn't publish a per-minute cap, but a tiny gate
// avoids us slamming the endpoint when a page produces dozens of bubbles.
const MIN_INTERVAL_MS = 200;
const MAX_RETRIES = 3;
// DeepL accepts an unbounded number of `text` keys per request, but caps the
// JSON-array `text` parameter at 50; we mirror that with the form-encoded shape
// for predictable behavior across both API tiers.
const MAX_BATCH_SIZE = 50;
// Default source language — preserves the v0.3 Japanese-only behaviour when
// the orchestrator doesn't pass an explicit sourceLang.
const DEFAULT_SOURCE_LANG = 'JA';

/**
 * BCP-47 → DeepL target-language map. DeepL accepts a fixed enum (mostly
 * uppercase ISO 639-1) and recommends the regional variant `EN-US`/`EN-GB`
 * over the bare `EN`. Anything not listed falls back to a best-effort
 * uppercase passthrough — DeepL will 400 if the value is unsupported.
 */
const TARGET_LANG_MAP: Record<string, string> = {
  en: 'EN-US',
  pl: 'PL',
};

function mapTargetLang(bcp47: string): string {
  const lower = bcp47.toLowerCase();
  return TARGET_LANG_MAP[lower] ?? bcp47.toUpperCase();
}

/**
 * BCP-47 → DeepL source-language map. DeepL's source enum is uppercase
 * ISO-639-1 with a few specific exceptions (`EN`, `PT`, `ZH`). Anything
 * not listed passes through uppercase — DeepL will 400 on unsupported.
 * Notably the source set does NOT take regional variants (`EN-US` would
 * be rejected as a source even though it's valid as a target).
 */
const SOURCE_LANG_MAP: Record<string, string> = {
  ja: 'JA',
  en: 'EN',
  pl: 'PL',
  ko: 'KO',
  zh: 'ZH',
};

function mapSourceLang(bcp47: string): string {
  const lower = bcp47.toLowerCase();
  return SOURCE_LANG_MAP[lower] ?? bcp47.toUpperCase();
}

/** Free-tier keys are suffixed with `:fx` per DeepL's docs. */
function isFreeKey(key: string): boolean {
  return key.endsWith(':fx');
}

function endpointFor(key: string): string {
  return isFreeKey(key) ? FREE_BASE : PRO_BASE;
}

/**
 * Parse a 429 / 5xx retry hint. Honors `Retry-After` (seconds) when present,
 * otherwise falls back to exponential backoff seeded at 1s.
 */
function computeRetryDelayMs(response: Response, attempt: number): number {
  const retryAfter = response.headers.get('retry-after');
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds > 0) {
      return seconds * 1000;
    }
  }
  return Math.min(30_000, 1000 * 2 ** attempt);
}

interface DeepLTranslationResponse {
  translations: Array<{
    detected_source_language?: string;
    text: string;
  }>;
}

interface DeepLUsageResponse {
  character_count: number;
  character_limit: number;
}

function isUsageResponse(value: unknown): value is DeepLUsageResponse {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v.character_count === 'number' && typeof v.character_limit === 'number';
}

function isTranslationResponse(value: unknown): value is DeepLTranslationResponse {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (!Array.isArray(v.translations)) return false;
  return v.translations.every(
    t => t && typeof t === 'object' && typeof (t as Record<string, unknown>).text === 'string'
  );
}

/**
 * DeepL translation provider. Reads its API key from `AppSettings.translation
 * .providerKeys.deepl`, auto-detects free vs. pro by the `:fx` key suffix,
 * batches up to 50 texts per request, and treats 401/403/456 as terminal.
 */
@Injectable()
export class DeepLProvider implements TranslationProvider {
  readonly id = 'deepl' as const;

  private readonly gate = new MinIntervalGate(MIN_INTERVAL_MS);
  private readonly fetch: FetchLike;

  constructor(
    private readonly settings: SettingsService,
    @Optional() fetchFn?: FetchLike,
  ) {
    // Optional `fetchFn` mirrors the `OcrSidecarService.spawnFn` seam: prod
    // uses the auto-resolved Electron / global fetch; specs inject a jest mock.
    this.fetch = fetchFn ?? getFetch();
  }

  /** Translate a batch of source strings. Chunks the input into ≤50-text requests. */
  async translate(
    texts: string[],
    targetLang: string,
    sourceLang?: string,
  ): Promise<string[]> {
    if (texts.length === 0) return [];

    const key = this.getApiKey();
    if (!key) {
      throw new Error('DeepL: no API key configured');
    }

    const target = mapTargetLang(targetLang);
    const source = sourceLang ? mapSourceLang(sourceLang) : DEFAULT_SOURCE_LANG;
    const out: string[] = new Array(texts.length);

    for (let start = 0; start < texts.length; start += MAX_BATCH_SIZE) {
      const slice = texts.slice(start, start + MAX_BATCH_SIZE);
      const translated = await this.translateChunk(slice, target, source, key);
      if (translated.length !== slice.length) {
        throw new Error(
          `DeepL: response length mismatch — sent ${slice.length}, got ${translated.length}`
        );
      }
      for (let i = 0; i < translated.length; i += 1) {
        out[start + i] = translated[i];
      }
    }

    return out;
  }

  /** Probe `/v2/usage` for remaining character quota. */
  async status(): Promise<TranslationProviderStatus> {
    const key = this.getApiKey();
    if (!key) {
      return { id: this.id, ok: false, reason: 'no-api-key' };
    }

    const url = `${endpointFor(key)}/v2/usage`;
    try {
      const response = await this.gate.schedule(() =>
        this.fetch(url, {
          method: 'GET',
          headers: this.buildAuthHeaders(key),
        })
      );

      if (response.status === 401 || response.status === 403) {
        return { id: this.id, ok: false, reason: 'invalid-api-key' };
      }
      if (!response.ok) {
        const body = await response.text().catch(() => '');
        return {
          id: this.id,
          ok: false,
          reason: `http-${response.status}: ${body.slice(0, 200)}`,
        };
      }

      const json: unknown = await response.json();
      if (!isUsageResponse(json)) {
        return { id: this.id, ok: false, reason: 'malformed-usage-response' };
      }
      const remaining = Math.max(0, json.character_limit - json.character_count);
      return { id: this.id, ok: true, remainingChars: remaining };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { id: this.id, ok: false, reason: `network-error: ${message}` };
    }
  }

  private getApiKey(): string | undefined {
    const key = this.settings.get().translation.providerKeys.deepl;
    return key && key.length > 0 ? key : undefined;
  }

  private buildAuthHeaders(key: string): Record<string, string> {
    return {
      Authorization: `DeepL-Auth-Key ${key}`,
      Accept: 'application/json',
    };
  }

  /** POST one ≤50-text batch to /v2/translate, with retry/backoff. */
  private async translateChunk(
    texts: string[],
    targetLang: string,
    sourceLang: string,
    key: string
  ): Promise<string[]> {
    const url = `${endpointFor(key)}/v2/translate`;
    const headers: Record<string, string> = {
      ...this.buildAuthHeaders(key),
      'Content-Type': 'application/x-www-form-urlencoded',
    };

    const body = new URLSearchParams();
    for (const text of texts) {
      body.append('text', text);
    }
    body.append('source_lang', sourceLang);
    body.append('target_lang', targetLang);
    body.append('preserve_formatting', '1');

    let lastError: Error | undefined;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
      let response: Response;
      try {
        response = await this.gate.schedule(() =>
          this.fetch(url, {
            method: 'POST',
            headers,
            body: body.toString(),
          })
        );
      } catch (err) {
        // Network-level failure — retry up to MAX_RETRIES.
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt === MAX_RETRIES) {
          throw new Error(
            `DeepL: network error after ${MAX_RETRIES} retries: ${lastError.message}`,
            { cause: err }
          );
        }
        const delay = Math.min(30_000, 1000 * 2 ** attempt);
        logger.warn(
          `network error on DeepL translate — retry ${attempt + 1}/${MAX_RETRIES} in ${delay}ms`
        );
        await sleep(delay);
        continue;
      }

      if (response.status === 401 || response.status === 403) {
        throw new Error('DeepL: invalid API key');
      }
      if (response.status === 456) {
        throw new Error('DeepL: monthly character limit reached');
      }

      if (response.status === 429 || response.status >= 500) {
        if (attempt === MAX_RETRIES) {
          const body = await response.text().catch(() => '');
          throw new Error(
            `DeepL ${response.status} after ${MAX_RETRIES} retries: ${body.slice(0, 200)}`
          );
        }
        const delay = computeRetryDelayMs(response, attempt);
        logger.warn(
          `${response.status} from DeepL — retry ${attempt + 1}/${MAX_RETRIES} in ${delay}ms`
        );
        await sleep(delay);
        continue;
      }

      if (!response.ok) {
        const bodyText = await response.text().catch(() => '');
        throw new Error(
          `DeepL ${response.status} ${response.statusText}: ${bodyText.slice(0, 200)}`
        );
      }

      const json: unknown = await response.json();
      if (!isTranslationResponse(json)) {
        throw new Error('DeepL: malformed translation response');
      }
      return json.translations.map(t => t.text);
    }

    throw lastError ?? new Error('DeepL: translate exhausted retries');
  }
}
