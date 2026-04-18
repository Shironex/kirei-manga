import { Injectable } from '@nestjs/common';
import {
  createLogger,
  type TranslationProviderId,
  type TranslationProviderStatus,
} from '@kireimanga/shared';
import { SettingsService } from '../../settings';
import type { TranslationProvider } from './provider.interface';
import { DeepLProvider } from './deepl.provider';
import { GoogleTranslateProvider } from './google-translate.provider';

const logger = createLogger('TranslationProviderRegistry');

/**
 * Aggregates every concrete `TranslationProvider` that Nest has wired up and
 * exposes selection / fan-out helpers consumed by the orchestrator (Slice F)
 * and the `translation:provider-status` gateway (D.5).
 *
 * Slices I / J extend the registry by injecting the new provider in the
 * constructor and appending it to `this.providers` — no other changes
 * required because callers go through `pickProvider` / `getAllStatuses`.
 */
@Injectable()
export class TranslationProviderRegistry {
  private readonly providers: readonly TranslationProvider[];

  constructor(
    private readonly settings: SettingsService,
    deepl: DeepLProvider,
    google: GoogleTranslateProvider
    // J phase injects OllamaProvider here:
    // ollama: OllamaProvider,
  ) {
    this.providers = [deepl, google];
  }

  /**
   * Resolve the best provider for this request. Selection order:
   *   1. caller-supplied hint (if healthy)
   *   2. user's default from settings (if healthy)
   *   3. any healthy provider, in registration order
   *
   * The pseudo-id `tesseract-only` is silently ignored as a hint / default —
   * it is OCR-only and never resolves to a translation backend.
   *
   * @throws if no provider is healthy.
   */
  async pickProvider(hint?: TranslationProviderId): Promise<TranslationProvider> {
    const fromSettings = this.settings.get().translation?.defaultProvider;
    const wanted: TranslationProviderId | undefined = hint ?? fromSettings;

    const statuses = await this.refreshStatuses();

    if (wanted && wanted !== 'tesseract-only') {
      const match = statuses.find(s => s.provider.id === wanted && s.status.ok);
      if (match) return match.provider;
    }

    const healthy = statuses.find(s => s.status.ok);
    if (healthy) return healthy.provider;

    const reasons = statuses
      .map(s => `${s.provider.id}: ${s.status.reason ?? 'unhealthy'}`)
      .join('; ');
    throw new Error(`No healthy translation provider. ${reasons}`);
  }

  /** All registered providers (used by the gateway for status fan-out). */
  getAll(): readonly TranslationProvider[] {
    return this.providers;
  }

  /** Probe every provider — used by `translation:provider-status`. */
  async getAllStatuses(): Promise<TranslationProviderStatus[]> {
    const probed = await this.refreshStatuses();
    return probed.map(s => s.status);
  }

  /**
   * Probe every provider in parallel. `status()` is meant to be lightweight
   * (DeepL hits `/v2/usage`); a thrown probe degrades to an `ok:false` entry
   * so a single broken provider never poisons selection for the rest.
   */
  private async refreshStatuses(): Promise<
    Array<{ provider: TranslationProvider; status: TranslationProviderStatus }>
  > {
    return Promise.all(
      this.providers.map(async provider => {
        try {
          const status = await provider.status();
          return { provider, status };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          logger.warn(`status() threw for ${provider.id}: ${message}`);
          return {
            provider,
            status: {
              id: provider.id,
              ok: false,
              reason: `status-check-failed: ${message}`,
            } satisfies TranslationProviderStatus,
          };
        }
      })
    );
  }
}
