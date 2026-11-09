# MangaDex client

`crates/kirei-mangadex` talks to the MangaDex API: search, series and chapter lists, cover art, MangaDex@Home page delivery, and the signed-in user's follows and reading statuses. It has no UI and writes nothing to disk; the browse screens (#43), downloads (#44) and AniList tracking (#45) build on it.

It is async on tokio, the runtime Tauri already runs. The app should hold one `MangaDex` and clone it where needed: clones share the rate limits, the cache and the session, so the app as a whole stays inside MangaDex's limits.

## What it does

| Area           | Calls                                                                                                   |
| -------------- | ------------------------------------------------------------------------------------------------------- |
| Catalogue      | `search(&SearchQuery)`, `manga(id)`, `tags()`, `covers(manga)`, `cover_url(...)`, `cover(...)`          |
| Chapters       | `chapters(manga, options)` (language resolved), `chapter_feed(manga, &FeedQuery)` (raw page), `chapter(id)` |
| Pages          | `at_home_server(chapter)`, `page(chapter, index, quality)` with `ImageQuality::Data` or `DataSaver`     |
| Session        | `sign_in(client, username, password)`, `restore_session(client, tokens)`, `sign_out()`                   |
| User           | `followed_manga`, `followed_feed`, `is_following`, `follow`, `unfollow`, `reading_statuses`, `reading_status`, `set_reading_status` |
| Read markers   | `read_markers(manga)`, `read_markers_for(mangas)` (100 series per request), `set_read_markers(manga, read, unread)` (also adds the read ones to the MangaDex reading history) |

Every chapter carries its scanlation groups and uploader, so credits can be shown wherever a chapter is read. `Manga::anilist_id()` reads the AniList id from the series links for tracking.

Images are always fetched by the client and handed over as bytes. MangaDex does not allow hotlinking, so page and cover URLs never go to the webview; the at-home base URL also embeds a temporary token and is kept out of `Debug` output and serialization.

## Languages

`LanguagePrefs` holds an ordered chain, `pl` then `en` by default, and the "only my language" toggle. `chapters()` asks for every language of the chain in one request (500 chapters per page), then keeps, for each chapter number, the chapters in the earliest language that has it. All groups' versions of that number in that language are kept.

The result says how it went (`LanguageOutcome`):

| Outcome        | Meaning                                                                 |
| -------------- | ----------------------------------------------------------------------- |
| `Preferred`    | every chapter is in the preferred language                              |
| `Mixed`        | the preferred language has some chapters, the rest come from fallbacks  |
| `FallbackOnly` | the preferred language has nothing; everything comes from fallbacks     |
| `Nothing`      | no language of the chain has chapters (or only the preferred one, with the toggle on) |

With the toggle on, only the preferred language is requested and nothing ever falls back. Searches by default only list series with chapters in the requested languages (`LanguageScope::Preferences`). Series whose chapter numbers restart each volume should pass `ChapterListOptions { by_volume: true }` (from `Manga::chapter_numbers_reset_on_new_volume`).

## Limits it enforces

From the MangaDex docs (api.mangadex.org/docs, "Limitations/Requirements", checked 2026-11-09):

| Budget                          | Default         | Source                                                                       |
| ------------------------------- | --------------- | ---------------------------------------------------------------------------- |
| Every API request               | 5 per second    | documented global limit, about 5 requests per second per IP                  |
| `GET /at-home/server/{id}`      | 40 per minute   | documented endpoint limit                                                    |
| OAuth password grant            | 30 per hour     | documented limit of `POST /auth/login`, applied to the token endpoint        |
| OAuth refresh grant             | 60 per hour     | documented limit of `POST /auth/refresh`, applied to the token endpoint      |
| Cover downloads                 | 10 per second   | our own guard; MangaDex publishes no number for uploads.mangadex.org         |
| Ban cool-down                   | 5 minutes       | our own choice; the ban length is undocumented and requests extend it        |

Each budget is a sliding window: no span of the window ever holds more starts than the budget. A request that has an endpoint budget waits for that first, then for the global one. The tests prove it on a paused clock (500 and 200 concurrent callers) and against a local server (`tests/limits.rs`).

Retries: 429, 5xx and connection failures are retried up to 3 times with exponential backoff and jitter (0.5 s doubling, at most 30 s). A 429 pauses every request, not just the one that got it, until `X-RateLimit-Retry-After` (a Unix timestamp) or `Retry-After` passes; MangaDex escalates to a temporary IP ban when requests keep coming during a 429. A wait longer than 30 s is returned as `MangaDexError::RateLimited`. A 403 without an API error body is treated as that ban: `MangaDexError::Blocked`, and every request pauses for the cool-down.

Caching: public reads are kept in memory by URL, so a change of languages or ratings is a different entry. Lists 5 minutes, details 10, tags a day. At-home server answers are reused for 10 minutes (MangaDex guarantees 15) and dropped as soon as a page fails on them. Requests with a token are never cached. `clear_cache()` is the manual refresh.

Other policy points the client follows: a real User-Agent on every request (`default_user_agent(version)`), HTTPS only, no auth header on image requests, and content ratings sent explicitly on every list (default safe and suggestive) rather than left to the server's default.

## MangaDex@Home

`page()` asks for a server for the chapter (once, shared by concurrent callers), downloads the page and reports the load to `https://api.mangadex.network/report` with the full URL, success, whether the server answered `X-Cache: HIT...`, the byte count and the full download time in milliseconds. Failed loads are reported too, with 0 bytes. Servers under mangadex.org are not part of the network and are not reported. On a failure the client asks for a new server and tries again, 3 tries by default.

## Sign in

MangaDex uses OAuth with personal API clients. The user creates a client in their MangaDex account settings (it may need approval before it works, and only the owning account can use it) and gives the app its client id and secret, plus their username and password.

1. `sign_in(ClientCredentials { client_id, client_secret }, username, &password)` sends the password grant to `auth.mangadex.org/realms/mangadex/protocol/openid-connect/token`. The password is used for that one request and dropped.
2. The access token lives 15 minutes. Before each user call the client refreshes it when less than a minute is left, and once more if the API answers 401. Concurrent calls share one refresh.
3. A refused refresh (the refresh token expired or was revoked) ends the session: `MangaDexError::SessionExpired`, and the token sink hears `None`. The app then asks for the password again.

Credentials and tokens are wrapped in `Secret`, whose `Debug` prints `Secret(***)`; no error message carries one.

### Storing credentials (app side)

The crate stores nothing. The app should:

- Keep the client secret and the latest refresh token in the OS keychain (Keychain on macOS, Credential Manager on Windows), never in settings files, the SQLite library or IPC payloads. The client id is not secret but can sit next to them.
- Never store the password. If the session ends, ask for it again.
- Pass a `TokenSink` in `ClientConfig::token_sink`. It is called after a sign in, after every refresh (the identity server may rotate the refresh token, and the old one stops working) and with `None` on sign out or a dead session, so the keychain entry always matches the live session.
- On launch, read the keychain and call `restore_session(client, tokens)`. No network call happens until the first user request, which refreshes the token if needed.

`TokenSet` serializes to JSON (`accessToken`, `refreshToken`, `accessExpiresAt`, `refreshExpiresAt`, Unix milliseconds) for exactly this purpose.

## Tests

No test touches the network. Responses are replayed from `crates/kirei-mangadex/tests/fixtures` by a local wiremock server; the fixtures follow the shapes the live API returns, including its quirks (`[]` for an empty description or link map, relationships without attributes when not expanded).
