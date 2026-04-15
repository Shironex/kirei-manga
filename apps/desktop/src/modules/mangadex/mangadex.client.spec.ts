import { MangaDexClient } from './mangadex.client';

type MockResponseInit = {
  status?: number;
  headers?: Record<string, string>;
  json?: unknown;
  text?: string;
};

function mockResponse(init: MockResponseInit = {}): Response {
  const status = init.status ?? 200;
  const headers = new Headers(init.headers ?? {});
  const body = init.json !== undefined ? JSON.stringify(init.json) : (init.text ?? '');
  return new Response(body, {
    status,
    headers,
  }) as Response;
}

describe('MangaDexClient', () => {
  let client: MangaDexClient;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    (globalThis as { fetch?: unknown }).fetch = fetchMock;
    client = new MangaDexClient();
    // Collapse rate limit waits in tests.
    jest
      .spyOn(global, 'setTimeout')

      .mockImplementation((fn: (...a: unknown[]) => void) => {
        fn();
        return 0 as unknown as NodeJS.Timeout;
      });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('retries on 429 honoring X-RateLimit-Retry-After then succeeds', async () => {
    const retryEpoch = Math.floor(Date.now() / 1000) + 1;
    fetchMock
      .mockResolvedValueOnce(
        mockResponse({
          status: 429,
          headers: { 'x-ratelimit-retry-after': String(retryEpoch) },
        })
      )
      .mockResolvedValueOnce(
        mockResponse({
          json: { result: 'ok', response: 'collection', data: [], limit: 24, offset: 0, total: 0 },
        })
      );

    const result = await client.search({ title: 'berserk' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.result).toBe('ok');
  });

  it('serializes array filters as repeated bracketed params', async () => {
    fetchMock.mockResolvedValue(
      mockResponse({
        json: { result: 'ok', response: 'collection', data: [], limit: 24, offset: 0, total: 0 },
      })
    );

    await client.search({
      title: 'x',
      contentRating: ['safe', 'suggestive'],
      includedTags: ['tag-a', 'tag-b'],
      includes: ['cover_art', 'author'],
      order: { relevance: 'desc' },
    });

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('contentRating%5B%5D=safe');
    expect(url).toContain('contentRating%5B%5D=suggestive');
    expect(url).toContain('includedTags%5B%5D=tag-a');
    expect(url).toContain('includedTags%5B%5D=tag-b');
    expect(url).toContain('includes%5B%5D=cover_art');
    expect(url).toContain('order%5Brelevance%5D=desc');
  });

  it('serves cached responses without refetching', async () => {
    fetchMock.mockResolvedValue(
      mockResponse({
        json: { result: 'ok', response: 'collection', data: [], limit: 24, offset: 0, total: 0 },
      })
    );

    await client.search({ title: 'same' });
    await client.search({ title: 'same' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('builds cover URLs for all sizes', () => {
    const id = 'abc-123';
    const file = 'cover.jpg';
    expect(client.resolveCoverUrl(id, file, 256)).toBe(
      'https://uploads.mangadex.org/covers/abc-123/cover.jpg.256.jpg'
    );
    expect(client.resolveCoverUrl(id, file, 512)).toBe(
      'https://uploads.mangadex.org/covers/abc-123/cover.jpg.512.jpg'
    );
    expect(client.resolveCoverUrl(id, file, 'original')).toBe(
      'https://uploads.mangadex.org/covers/abc-123/cover.jpg'
    );
  });

  it('sends User-Agent header on every request', async () => {
    fetchMock.mockResolvedValue(
      mockResponse({
        json: { result: 'ok', response: 'collection', data: [], limit: 24, offset: 0, total: 0 },
      })
    );
    await client.search({ title: 'ua-test' });
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers['User-Agent']).toContain('KireiManga/');
  });
});
