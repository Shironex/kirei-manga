import { Injectable, Optional } from '@nestjs/common';
import { createLogger, type TranslationProviderStatus } from '@kireimanga/shared';
import { SettingsService } from '../../settings';
import { getFetch, type FetchLike } from '../../shared/net-fetch';
import { MinIntervalGate, sleep } from '../../shared/rate-limit';
import type { TranslationProvider } from './provider.interface';

const logger = createLogger('GoogleTranslateProvider');

const ENDPOINT = 'https://translation.googleapis.com/language/translate/v2';

// Generous floor — Google's per-project quota is much higher than a tiny gate
// would ever bump into, but the gate keeps a single page's bubble fan-out from
// slamming the endpoint in lockstep with DeepL's behavior.
const MIN_INTERVAL_MS = 200;
const MAX_RETRIES = 3;
// Google's v2 `q` parameter accepts up to 128 strings per request per their
// public docs; chunk anything larger.
const MAX_BATCH_SIZE = 128;
// Default source language — preserves the v0.3 Japanese-only behaviour when
// the orchestrator doesn't pass an explicit sourceLang.
const DEFAULT_SOURCE_LANG = 'ja';

/**
 * BCP-47 → Google target-language map. Google's v2 API uses ISO-639-1
 * lowercase by default and accepts most BCP-47 tags as-is, so we just
 * lowercase the input. Anything Google doesn't recognise will surface as a
 * 400 from the endpoint.
 */
function mapTargetLang(bcp47: string): string {
  return bcp47.toLowerCase();
}

/**
 * Same shape as the target map — Google's source enum is also lowercase
 * BCP-47 / ISO-639-1. Pass-through is correct for the languages we care
 * about; an unrecognised tag will 400 from the endpoint.
 */
function mapSourceLang(bcp47: string): string {
  return bcp47.toLowerCase();
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

interface GoogleTranslationResponse {
  data: {
    translations: Array<{
      translatedText: string;
      detectedSourceLanguage?: string;
    }>;
  };
}

interface GoogleErrorResponse {
  error?: {
    code?: number;
    message?: string;
    status?: string;
    errors?: Array<{ reason?: string; message?: string }>;
  };
}

function isTranslationResponse(value: unknown): value is GoogleTranslationResponse {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (!v.data || typeof v.data !== 'object') return false;
  const data = v.data as Record<string, unknown>;
  if (!Array.isArray(data.translations)) return false;
  return data.translations.every(
    t =>
      t &&
      typeof t === 'object' &&
      typeof (t as Record<string, unknown>).translatedText === 'string'
  );
}

/**
 * Inspect a Google error body to distinguish "key invalid" from "quota
 * exhausted". The v2 endpoint returns the same 403 status for both, with the
 * concrete reason buried under `error.errors[].reason` (e.g.
 * `keyInvalid`, `dailyLimitExceeded`, `userRateLimitExceededUnreg`).
 */
function classify403(bodyText: string): string {
  let parsed: GoogleErrorResponse | undefined;
  try {
    parsed = JSON.parse(bodyText) as GoogleErrorResponse;
  } catch {
    return 'invalid API key or quota exhausted';
  }
  const reasons = parsed?.error?.errors?.map(e => e.reason ?? '') ?? [];
  const message = parsed?.error?.message ?? '';
  const isQuota = reasons.some(r => /quota|limit|rate/i.test(r)) || /quota|limit/i.test(message);
  const isKey = reasons.some(r => /keyInvalid|forbidden|API_KEY/i.test(r)) || /API key/i.test(message);
  if (isQuota && !isKey) return 'quota exhausted';
  if (isKey && !isQuota) return 'invalid API key';
  return 'invalid API key or quota exhausted';
}

/**
 * Google Translate v2 provider. Reads its API key from `AppSettings.translation
 * .providerKeys.google`, batches up to 128 texts per request, and treats
 * 401/403 as terminal. Free-tier v2 only — advanced v3 with service-account
 * auth is a non-goal for v0.3.
 */
@Injectable()
export class GoogleTranslateProvider implements TranslationProvider {
  readonly id = 'google' as const;

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

  /** Translate a batch of source strings. Chunks the input into ≤128-text requests. */
  async translate(
    texts: string[],
    targetLang: string,
    sourceLang?: string,
  ): Promise<string[]> {
    if (texts.length === 0) return [];

    const key = this.getApiKey();
    if (!key) {
      throw new Error('Google: no API key configured');
    }

    const target = mapTargetLang(targetLang);
    const source = sourceLang ? mapSourceLang(sourceLang) : DEFAULT_SOURCE_LANG;
    const out: string[] = new Array(texts.length);

    for (let start = 0; start < texts.length; start += MAX_BATCH_SIZE) {
      const slice = texts.slice(start, start + MAX_BATCH_SIZE);
      const translated = await this.translateChunk(slice, target, source, key);
      if (translated.length !== slice.length) {
        throw new Error(
          `Google: response length mismatch — sent ${slice.length}, got ${translated.length}`
        );
      }
      for (let i = 0; i < translated.length; i += 1) {
        out[start + i] = translated[i];
      }
    }

    return out;
  }

  /**
   * Probe key presence only. Google v2 has no `/usage` endpoint; the cheapest
   * verification would be a one-character translate round-trip, but that burns
   * billable quota every time the settings panel polls. We trade verification
   * depth for quota and report ok:true whenever a key is set. Settings UI's
   * explicit "Test" button can issue a real translate call instead.
   */
  async status(): Promise<TranslationProviderStatus> {
    const key = this.getApiKey();
    if (!key) {
      return { id: this.id, ok: false, reason: 'no-api-key' };
    }
    return { id: this.id, ok: true };
  }

  private getApiKey(): string | undefined {
    const key = this.settings.get().translation.providerKeys.google;
    return key && key.length > 0 ? key : undefined;
  }

  /** POST one ≤128-text batch to /language/translate/v2, with retry/backoff. */
  private async translateChunk(
    texts: string[],
    targetLang: string,
    sourceLang: string,
    key: string
  ): Promise<string[]> {
    const url = `${ENDPOINT}?key=${encodeURIComponent(key)}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    const body = JSON.stringify({
      q: texts,
      source: sourceLang,
      target: targetLang,
      format: 'text',
    });

    let lastError: Error | undefined;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
      let response: Response;
      try {
        response = await this.gate.schedule(() =>
          this.fetch(url, {
            method: 'POST',
            headers,
            body,
          })
        );
      } catch (err) {
        // Network-level failure — retry up to MAX_RETRIES.
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt === MAX_RETRIES) {
          throw new Error(
            `Google: network error after ${MAX_RETRIES} retries: ${lastError.message}`,
            { cause: err }
          );
        }
        const delay = Math.min(30_000, 1000 * 2 ** attempt);
        logger.warn(
          `network error on Google translate — retry ${attempt + 1}/${MAX_RETRIES} in ${delay}ms`
        );
        await sleep(delay);
        continue;
      }

      if (response.status === 400) {
        const bodyText = await response.text().catch(() => '');
        throw new Error(`Google 400 invalid request: ${bodyText.slice(0, 200)}`);
      }
      if (response.status === 401 || response.status === 403) {
        const bodyText = await response.text().catch(() => '');
        throw new Error(`Google: ${classify403(bodyText)}`);
      }

      if (response.status === 429 || response.status >= 500) {
        if (attempt === MAX_RETRIES) {
          const bodyText = await response.text().catch(() => '');
          throw new Error(
            `Google ${response.status} after ${MAX_RETRIES} retries: ${bodyText.slice(0, 200)}`
          );
        }
        const delay = computeRetryDelayMs(response, attempt);
        logger.warn(
          `${response.status} from Google — retry ${attempt + 1}/${MAX_RETRIES} in ${delay}ms`
        );
        await sleep(delay);
        continue;
      }

      if (!response.ok) {
        const bodyText = await response.text().catch(() => '');
        throw new Error(
          `Google ${response.status} ${response.statusText}: ${bodyText.slice(0, 200)}`
        );
      }

      const json: unknown = await response.json();
      if (!isTranslationResponse(json)) {
        throw new Error('Google: malformed translation response');
      }
      return json.data.translations.map(t => t.translatedText);
    }

    throw lastError ?? new Error('Google: translate exhausted retries');
  }
}
