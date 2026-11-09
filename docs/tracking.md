# AniList tracking

KireiManga keeps your AniList manga list in step with what you read: finishing a chapter of a linked series updates your progress on AniList, and progress made elsewhere shows on the series page. Other trackers are out of scope for now; the tables carry a `tracker` column so one can be added without a migration.

| Layer    | Where                                    | Role                                                                          |
| -------- | ---------------------------------------- | ----------------------------------------------------------------------------- |
| Client   | `crates/kirei-anilist`                   | Sign in listener, rate limited GraphQL client, conflict rules, one delivery   |
| Storage  | `crates/kirei-library/src/tracking.rs`   | Series links and the offline queue (migration `0005_tracking.sql`)            |
| App      | `apps/desktop/src-tauri/src/tracking.rs` | Token in the keychain, the queue worker, the commands                         |
| Keychain | `apps/desktop/src-tauri/src/keychain.rs` | The OS credential store, service `app.kireimanga.desktop`                     |
| Renderer | `apps/desktop/src/lib/tracking.ts`       | Types and command wrappers; Settings > Accounts and the series page AniList card |

## Setting up the AniList client (maintainer, once)

AniList only signs users in for a registered API client. Nothing secret ships in the app: the flow is AniList's implicit grant, which needs the client id only.

1. Sign in to AniList with the account that should own the client and open <https://anilist.co/settings/developer>.
2. Choose "Create New Application".
3. Name: `KireiManga`.
4. Redirect URL: exactly `http://127.0.0.1:47615/anilist/callback`.
5. Save. AniList shows a client id (a number) and a client secret. Keep the id; **the secret is not used and must not be committed or put in CI**.
6. In the GitHub repository settings, add a repository **variable** (Settings > Secrets and variables > Actions > Variables) named `ANILIST_CLIENT_ID` with the id. The release workflow passes it to the build as `KIREI_ANILIST_CLIENT_ID`. It is a variable rather than a secret because the id is public: it appears in every authorize URL.
7. For a local build, set it in the shell: `KIREI_ANILIST_CLIENT_ID=12345 pnpm dev` (or `pnpm tauri build`).

The id is read at compile time (`option_env!`), so a build without it shows "This build has no AniList client id" in Settings > Accounts and the Sign in button stays disabled. Everything else works.

If port 47615 is ever a problem, register another redirect URL on the client and build with `KIREI_ANILIST_REDIRECT_PORT=<port>` as well; the two must match exactly, because AniList refuses a redirect that differs from the registered one.

## Signing in

Settings > Accounts > AniList > Sign in:

1. The app starts a listener on `127.0.0.1:47615` and opens `https://anilist.co/api/v2/oauth/authorize?client_id=<id>&response_type=token` in the default browser.
2. The user logs in to AniList (if needed) and approves KireiManga. The app never sees the password.
3. AniList redirects the browser to `http://127.0.0.1:47615/anilist/callback#access_token=...`. Browsers do not send the fragment to a server, so the listener answers with a small page whose script posts the fragment back to `/anilist/token` together with a nonce that is new for every sign in. The page then removes the fragment from the address bar and says the tab can be closed.
4. The app checks the token with a `Viewer` query, stores it in the keychain under the account `anilist.token`, and closes the listener. Sign in gives up after five minutes; Cancel stops it at once.

### Why this flow

- **Implicit grant, not authorization code.** The authorization code grant needs the client secret at the token exchange, and a secret inside a desktop app is not secret. AniList's own guidance is to use the implicit grant where credentials cannot be stored safely. AniList does not support PKCE.
- **A loopback listener, not a custom URL scheme.** Both are allowed by AniList. A scheme (`kireimanga://`) needs registry entries on Windows and an Info.plist entry on macOS that only exist in an installed bundle, needs a single instance plugin to route the URL to the running app, and does not work in `tauri dev`. The listener needs no admin rights, no registration and no plugin, behaves the same on Windows and macOS, and works in development. It binds `127.0.0.1` only, which does not trigger the Windows firewall prompt.
- **The fixed port** is required because AniList matches the redirect URL exactly. If something else holds the port the sign in fails with a message saying so.

### Safety

- The listener only exists during a sign in and only accepts requests whose `Host` is `127.0.0.1:<port>` or `localhost:<port>` (a DNS rebinding page sends its own host) and, for the token post, an `Origin` of the same address.
- Another web page cannot plant its own token: it cannot read the callback page (no CORS), so it never learns the nonce, and a post without it is refused. The callback page carries a strict Content Security Policy with a script nonce, `no-referrer` and `no-store`.
- The token is wrapped in `Secret`, whose `Debug` prints `Secret(***)`. It is never logged, never put in an error message, never sent over IPC (the renderer only sees the viewer name and avatar and the expiry date), and never stored in the settings, the library database or a backup.

### Token lifetime

AniList tokens last one year and cannot be refreshed. When AniList refuses a token (expired or revoked under the user's AniList settings > Apps), the app signs out by itself: the keychain entry is removed, queued updates are held as "blocked", and Settings > Accounts asks for a new sign in, after which the held updates are sent.

Signing out removes the token from the keychain and drops queued updates (they belong to the account that is leaving). Links stay.

## Rate limits

From docs.anilist.co/guide/rate-limiting, checked 2026-11-09:

| What                           | Value                                                             | What the client does                                                                                     |
| ------------------------------ | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Normal limit                   | 90 requests per minute                                            | Ceiling: the client never allows itself more, whatever the headers say                                  |
| Degraded mode (current)        | 30 requests per minute, "a temporary measure"                     | Starting budget; then follows `X-RateLimit-Limit` from each answer, so a change either way is picked up |
| Burst limiter                  | exists, no published number                                       | At least 500 ms between two request starts                                                               |
| `X-RateLimit-Remaining: 0`     | the window is used up                                             | Every request waits until `X-RateLimit-Reset` (a Unix timestamp)                                          |
| 429                            | one minute timeout; `Retry-After` (seconds) and `X-RateLimit-Reset` | Every request pauses until then; retried up to 3 times when the wait is at most 65 s, else `RateLimited` |
| 5xx and connection failures    |                                                                   | Retried up to 3 times with exponential backoff and jitter (0.5 s doubling)                               |
| API switched off (403, "temporarily disabled") |                                                   | `Unavailable`: transient, the queue retries later                                                        |

The budget is a sliding window (`limiter.rs`): no span of a minute holds more starts than the budget. All requests go to `POST https://graphql.anilist.co` with `Content-Type: application/json`, `Accept: application/json`, a KireiManga User-Agent and, when signed in, `Authorization: Bearer <token>`. Tracking needs few requests: one read and at most one write per series update, and chapter finishes are debounced.

## Linking series

A link ties one series to one AniList manga entry. Series are named by a stable key, not a row id:

| Series            | Key                         | How it gets linked                                                                                                  |
| ----------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Local library     | `local:<series ident>`      | Series page > AniList > Find on AniList: a search prefilled with the series title (the ComicInfo `Series` when the archives carry one), matches that started in the series' ComicInfo year are tagged "Same year". The user picks one. |
| MangaDex          | `mangadex:<manga uuid>`     | From the AniList id in the MangaDex series links (`Manga::anilist_id()`), passed to `tracking_link` with `origin: 'mangadex'`, or picked by hand like a local series |

Local series are never linked without the user picking the entry: a title match alone is too often a different edition, a sequel or a novel.

Because the key uses the series identity (`dir:<folder name>`, see `docs/library.md`), a link survives removing and re-adding a folder, like reading progress does. Linking a series to a different entry forgets what the old entry said. Unlinking also drops the queued update for the entry when no other series links it. Search leaves adult entries out.

Linking reconciles right away: the series' local progress (if any) goes through the rules below, and what AniList holds is stored on the link.

## Progress

AniList counts progress in whole chapters read.

- **Local progress of a series** (shown on the card, used by Sync now): the highest whole chapter number among completed chapters, so chapter 10.5 counts as 10; when none of the completed chapters has a number, the count of completed chapters.
- **A finished chapter** (the reader recording its last page) stands for its own whole number, or its 1 based place in the series when it has none. With tracking and "Update when a chapter is finished" on and the series linked, that progress is queued with a 15 second debounce: reading several chapters in a row sends one update, with the last one.
- **MangaDex reading** reports progress through `tracking_report_progress` (the online lane calls it when a chapter is finished); it is queued the same way.

## Conflict rules

Inputs: local progress `L`, the AniList entry (progress `R` and status, or none), `S` the progress both sides last agreed on (stored on the link after a successful send or an equal read), and the series' total chapters when AniList knows it. The setting `tracking.conflict` picks the policy.

| Case                                         | Keep the higher (default)                         | Follow this device                                                     |
| -------------------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------- |
| Not on the AniList list, `L = 0`             | nothing                                           | nothing                                                                |
| Not on the list, `L > 0`                     | add it: progress `L`, status Reading (Completed if `L` reaches the total) | same                                                    |
| `L = R`                                      | nothing; `S = R`                                  | same                                                                   |
| `L > R`                                      | send `L`                                          | send `L`                                                               |
| `L < R` (AniList ahead)                      | keep AniList; store and show `R` ("AniList is ahead") | if `S = R` (AniList has not moved since the last sync, so this is a reread here): send `L`. Otherwise keep AniList and show it |

AniList is never moved backwards under the default policy, and never overwritten with lower progress when it moved on another device under either policy. Remote progress ahead of local is pulled and shown on the series page; local reading progress is not changed by it.

Status sent along with new progress:

| AniList status now           | After reading forward                    | When `L` reaches the known total |
| ---------------------------- | ---------------------------------------- | -------------------------------- |
| none (not listed)            | Reading                                  | Completed                        |
| Planning, Paused, Dropped    | Reading (reading again resumes it)       | Completed                        |
| Reading, Rereading           | unchanged                                | Completed                        |
| Completed                    | Reading (new chapters came out)          | unchanged                        |
| Completed, going back under "Follow this device" | Rereading            |                                  |

A status (Reading, Planning, Completed, Paused, Dropped, Rereading) or score picked on the series page is sent as picked and wins over the derived status.

The rules are `kirei_anilist::sync::decide`, a pure function; `sync.rs` has a table test with a row per case above.

## The offline queue

Every change goes through `tracker_queue` in the library database, so nothing is lost when AniList cannot be reached, and the queue survives a restart.

- At most one update per entry: a newer one replaces the waiting values (fields it leaves out keep theirs), starts its attempts over and bumps `revision`. A delivery that started before it only deletes its own revision, so the newer update is never lost.
- The worker (`tracking::start`) wakes when something is queued, or when the next update is due, or at least every minute. It does nothing while tracking is off or nobody is signed in.
- Per update it reads the entry (`Media.mediaListEntry`), applies the rules, and saves only the fields that change (`SaveMediaListEntry`). What AniList answered is stored on every link to the entry.
- Offline, rate limited, 5xx or maintenance: retried after 30 s, doubling per attempt up to an hour, and never sooner than a 429 asked. The reason shows in Settings > Accounts > Waiting to sync.
- A refused token: the queue is held ("blocked") and the account signed out; signing in releases it.
- Refused for good (no such entry, invalid value): parked as "failed" with AniList's message. Retry now in Settings gives failed and held updates another try.

## Settings

See `docs/settings.md`: `tracking.enabled` (off by default), `tracking.autoUpdate` (on), `tracking.conflict` (`'higher'` or `'local'`).

## Commands

| Command                    | Arguments                                                    | Returns                                                         |
| -------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------- |
| `anilist_status`           |                                                              | `AccountStatus`: configured, signed in, viewer, expiry, redirect URL, current budget |
| `anilist_sign_in`          |                                                              | `AccountStatus` once the browser came back; rejects with the reason |
| `anilist_cancel_sign_in`   |                                                              |                                                                 |
| `anilist_sign_out`         |                                                              | `AccountStatus`                                                 |
| `tracking_search`          | `query`, `page`                                              | `SearchPage` (20 per page, no adult entries)                    |
| `tracking_series`          | `series` (`{ kind: 'local', id }` or `{ kind: 'mangadex', id }`) | `SeriesTracking`: key, link, local progress, queued update  |
| `tracking_link`            | `series`, `mediaId`, `title`, `totalChapters`, `origin`      | `SeriesTracking`; queues a reconcile                            |
| `tracking_unlink`          | `series`                                                     | `SeriesTracking`                                                |
| `tracking_sync`            | `series`                                                     | `SeriesTracking`; queues a reconcile now                        |
| `tracking_update_entry`    | `series`, `status`, `score` (0 to 100)                       | `SeriesTracking`; queued, sent now                              |
| `tracking_report_progress` | `series`, `progress`                                         | whether it was queued                                           |
| `tracking_queue`           |                                                              | `QueueSummary`                                                  |
| `tracking_retry`           |                                                              | `QueueSummary`; failed and held updates are due now             |

Every change emits `tracking:changed`, which the Accounts section and the series page card follow.

## Tests

No test talks to AniList. `crates/kirei-anilist/tests` replays AniList's GraphQL answers (including its error shapes: `Invalid token`, `Not Found.`, `Too Many Requests.`, the maintenance message) from `tests/fixtures` with wiremock, and drives the sign in listener like a browser would (the callback page, the nonce, a forged post, a foreign host or origin, a timeout, a taken port). `sync.rs` holds the conflict table; `tests/queue.rs` covers delivery, offline retry and backoff. The library tests cover links, coalescing, the revision guard and the queue states; the desktop tests run the worker against wiremock and an in-memory library and keychain (an outage then recovery, a refused token, remote ahead, the chapter finish hook).
