import { Test, type TestingModule } from '@nestjs/testing';
import type { TranslationProviderId, TranslationProviderStatus } from '@kireimanga/shared';
import { TranslationProviderRegistry } from './provider.registry';
import { DeepLProvider } from './deepl.provider';
import { GoogleTranslateProvider } from './google-translate.provider';
import { SettingsService } from '../../settings';
import type { TranslationProvider } from './provider.interface';

/**
 * Selection coverage for `pickProvider`. Slice I.1 added Google alongside
 * DeepL, so the Nest test module wires both real providers as DI fakes; the
 * tests below replace `this.providers` with bespoke arrays per case to
 * exercise the multi-provider selection paths (Slice J will append Ollama
 * the same way).
 */
function makeFakeProvider(
  id: Exclude<TranslationProviderId, 'tesseract-only'>,
  status: TranslationProviderStatus
): TranslationProvider {
  return {
    id,
    translate: jest.fn(async (texts: string[]) => texts.map(t => `[${id}] ${t}`)),
    status: jest.fn(async () => status),
  };
}

function injectFakeProviders(
  registry: TranslationProviderRegistry,
  providers: TranslationProvider[]
): void {
  // The registry's `providers` field is private + readonly; tests intentionally
  // overwrite it to install fakes for selection logic without spinning up a
  // module per provider permutation.
  (registry as unknown as { providers: readonly TranslationProvider[] }).providers = providers;
}

describe('TranslationProviderRegistry', () => {
  let module: TestingModule;
  let registry: TranslationProviderRegistry;
  let settings: { get: jest.Mock };
  let deepl: { id: 'deepl'; translate: jest.Mock; status: jest.Mock };
  let google: { id: 'google'; translate: jest.Mock; status: jest.Mock };

  beforeEach(async () => {
    settings = {
      get: jest.fn().mockReturnValue({
        translation: { defaultProvider: 'deepl' as TranslationProviderId },
      }),
    };
    deepl = { id: 'deepl', translate: jest.fn(), status: jest.fn() };
    google = { id: 'google', translate: jest.fn(), status: jest.fn() };

    module = await Test.createTestingModule({
      providers: [
        TranslationProviderRegistry,
        { provide: SettingsService, useValue: settings },
        { provide: DeepLProvider, useValue: deepl },
        { provide: GoogleTranslateProvider, useValue: google },
      ],
    }).compile();

    registry = module.get(TranslationProviderRegistry);
  });

  afterEach(async () => {
    if (module) await module.close();
  });

  it('returns the hint-matched provider when it is healthy', async () => {
    const deeplFake = makeFakeProvider('deepl', { id: 'deepl', ok: true });
    const googleFake = makeFakeProvider('google', { id: 'google', ok: true });
    injectFakeProviders(registry, [deeplFake, googleFake]);
    settings.get.mockReturnValue({ translation: { defaultProvider: 'deepl' } });

    const picked = await registry.pickProvider('google');

    expect(picked).toBe(googleFake);
  });

  it('falls back to the settings default when no hint is supplied', async () => {
    const deeplFake = makeFakeProvider('deepl', { id: 'deepl', ok: true });
    const googleFake = makeFakeProvider('google', { id: 'google', ok: true });
    injectFakeProviders(registry, [deeplFake, googleFake]);
    settings.get.mockReturnValue({ translation: { defaultProvider: 'google' } });

    const picked = await registry.pickProvider();

    expect(picked).toBe(googleFake);
  });

  it('falls back to any healthy provider when the wanted one is unhealthy', async () => {
    const deeplFake = makeFakeProvider('deepl', {
      id: 'deepl',
      ok: false,
      reason: 'no-api-key',
    });
    const googleFake = makeFakeProvider('google', { id: 'google', ok: true });
    injectFakeProviders(registry, [deeplFake, googleFake]);
    settings.get.mockReturnValue({ translation: { defaultProvider: 'deepl' } });

    const picked = await registry.pickProvider('deepl');

    expect(picked).toBe(googleFake);
  });

  it('throws when no provider is healthy', async () => {
    const deeplFake = makeFakeProvider('deepl', {
      id: 'deepl',
      ok: false,
      reason: 'no-api-key',
    });
    const googleFake = makeFakeProvider('google', {
      id: 'google',
      ok: false,
      reason: 'invalid-key',
    });
    injectFakeProviders(registry, [deeplFake, googleFake]);

    await expect(registry.pickProvider('deepl')).rejects.toThrow(
      /No healthy translation provider.*deepl: no-api-key.*google: invalid-key/
    );
  });

  it("ignores hint = 'tesseract-only' (it is OCR-only, not a translation provider)", async () => {
    const deeplFake = makeFakeProvider('deepl', { id: 'deepl', ok: true });
    injectFakeProviders(registry, [deeplFake]);
    settings.get.mockReturnValue({ translation: { defaultProvider: 'deepl' } });

    // Even though 'tesseract-only' is in the TranslationProviderId union, it
    // must never resolve to a translation backend — selection should fall
    // through to settings default / any-healthy.
    const picked = await registry.pickProvider('tesseract-only');

    expect(picked).toBe(deeplFake);
  });
});
