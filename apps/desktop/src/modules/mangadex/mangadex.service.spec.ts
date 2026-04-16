import { MangaDexService } from './mangadex.service';
import { MangaDexClient } from './mangadex.client';
import fixture from './__fixtures__/manga-search.json';

describe('MangaDexService', () => {
  let client: MangaDexClient;
  let service: MangaDexService;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    (globalThis as { fetch?: unknown }).fetch = fetchMock;
    // collapse rate-limit waits

    jest.spyOn(global, 'setTimeout').mockImplementation((fn: (...a: unknown[]) => void) => {
      fn();
      return 0 as unknown as NodeJS.Timeout;
    });

    client = new MangaDexClient();
    service = new MangaDexService(client);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('normalizes raw manga entities into SearchResults with kirei-cover URLs', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(fixture), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );

    const { results, total } = await service.search('anything');

    expect(results).toHaveLength(2);
    expect(total).toBe(2);

    const [berserk, frieren] = results;
    expect(berserk.title).toBe('Berserk');
    expect(berserk.author).toBe('Kentaro Miura');
    expect(berserk.coverUrl).toBe(
      'kirei-cover://mangadex/aa6c76f7-5f5f-4b7a-9e8c-111111111111/cover-berserk.jpg.512.jpg'
    );
    // content rating and tags
    expect(berserk.contentRating).toBe('suggestive');
    expect(berserk.tags).toEqual(['Action']);

    // Frieren has no English title — ja-ro alt should win after en is absent.
    // en missing → pickLocalized falls back to ja-ro via altTitles? Our picker uses
    // the title map itself; since ja is present, Japanese title is used.
    expect(frieren.title).toBe('葬送のフリーレン');
    expect(frieren.coverUrl).toBe(
      'kirei-cover://mangadex/bb6c76f7-5f5f-4b7a-9e8c-222222222222/cover-frieren.png.512.jpg'
    );
    // Never emit a direct uploads.mangadex.org URL.
    for (const r of results) {
      expect(r.coverUrl).not.toContain('uploads.mangadex.org');
    }
  });

  it('falls back through pickLocalized when English is unavailable', async () => {
    // Frieren fixture has no en title — ja should win via the preferred order.
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(fixture), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );

    const { results } = await service.search('q');
    const frieren = results[1];
    expect(frieren.title).toBe('葬送のフリーレン');
    // Description fell back away from English (no en key) to Japanese.
    expect(frieren.description).toContain('フリーレン');
  });

  it('serializes contentRating filter with bracket array syntax', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(fixture), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );

    await service.search('q', { contentRating: ['safe', 'suggestive'] });

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('contentRating%5B%5D=safe');
    expect(url).toContain('contentRating%5B%5D=suggestive');
  });
});
