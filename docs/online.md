# Online: MangaDex in the app

Browsing, following and reading MangaDex inside KireiManga (#43). The API client is `crates/kirei-mangadex` (see `docs/mangadex.md`); this page covers the app around it: the screens, the settings, how sync works and when notifications fire.

## Where it lives

| Layer      | Path                                          | Role                                                                                      |
| ---------- | --------------------------------------------- | ----------------------------------------------------------------------------------------- |
| State      | `apps/desktop/src-tauri/src/online/mod.rs`    | `Online`: the one shared `MangaDex` client, session and network state, the cover cache     |
| Keychain   | `src-tauri/src/online/credentials.rs`         | Client id, client secret and session tokens through the shared `keychain.rs` helper, wired to `TokenSink` |
| Commands   | `src-tauri/src/online/commands.rs`            | Every `online_*` command and the typed `OnlineError`                                       |
| Sync       | `src-tauri/src/online/sync.rs`                | Follows, the updates feed, read markers both ways, the grouped feed                        |
| Schedule   | `src-tauri/src/online/refresh.rs`             | The background refresh and the new chapter notification                                    |
| Pages      | `src-tauri/src/online/source.rs`              | `OnlinePageSource`: a MangaDex chapter as a reader `PageSource`                            |
| Covers     | `src-tauri/src/online/cover.rs`               | The `kirei-online://cover/<manga>/<file>/<size>` scheme                                    |
| Storage    | `crates/kirei-library/src/online.rs`          | Tables of migration 0006 (below)                                                          |
| Renderer   | `apps/desktop/src/lib/online.ts`              | Typed wrappers for the commands; screens never call `invoke` directly                     |
| Screens    | `apps/desktop/src/features/online/`           | Search, updates, following, series page, chapter list, the online chapter loader           |

## Screens

| Route                               | What it shows                                                                                  |
| ----------------------------------- | ---------------------------------------------------------------------------------------------- |
| `/browse`                           | Search: title, sort, filters (status, demographic, tags to require or exclude, any language), the language picker, a cover grid with "Show more" |
| `/browse/updates`                   | New chapters of followed series, grouped by series, newest first; "Check now" and when it last checked |
| `/browse/following`                 | Followed series with their reading status                                                       |
| `/online/$mangaId`                  | Series page: cover, facts, tags, description, Read, Follow, reading status, a link to MangaDex, and the chapter list |
| `/read/online/$mangaId/$chapterId`  | The chapter in the normal reader                                                                |
| `/settings?section=online`          | MangaDex settings                                                                               |
| `/settings?section=accounts`        | Sign in and sign out                                                                            |

Every online screen has the status banner on top when MangaDex is unreachable, rate limited (with a countdown), refusing this network, or when the session expired (with "Sign in again"). The command palette has a MangaDex section: typing a title searches MangaDex and Enter opens the series page.

### Languages on screen

The language picker (search, series page, settings) edits the reading chain: the preferred language, then the fallbacks that fill its gaps, and the "Only <language>" switch. The series page always says how its list was built:

| Outcome        | Note                                                         |
| -------------- | ------------------------------------------------------------ |
| `preferred`    | "Every chapter is in Polski."                                |
| `mixed`        | "40 in Polski, 12 filled from English." Fallback rows carry an amber language badge |
| `fallbackOnly` | "No chapters in Polski yet, showing English." (warning)      |
| `nothing`      | "No chapters in your languages for this series." (warning)   |

A series can also be switched to one language ("Only English") from the chapter list header. That choice is stored per series (`online_series.single_language`) and wins over the chain for that series only.

### Credits

Every chapter row names its scanlation groups (or the uploader when there is none) and links the group to its MangaDex page. The reader bar reads "Ch. 12, Title · Group · via MangaDex", and each online screen ends with a line crediting MangaDex and the groups. Nothing is shown uncredited and the app shows no ads.

## Reading

`online_open_chapter` asks MangaDex@Home for the chapter's server, wraps it in an `OnlinePageSource` and registers it with the reader's `Library`, so the page pipeline, read ahead and cache work as for an archive. Pages are fetched in Rust and every fetch is reported back to MangaDex@Home as its rules ask; the webview never sees a MangaDex URL. Data saver picks the compressed images (and falls back to full quality for a chapter that has none).

In the renderer an online chapter is one more `ChapterTarget` (`{ kind: 'online', mangaId, chapterId }`), loaded by `features/online/onlineChapter.ts` through the same `useChapter` as library chapters. The next chapter is a `ChapterLink` of kind `online`, so opening it ahead near the end, the webtoon run into it and the end card all work as in the library.

A chapter hosted by its publisher (`externalUrl`) cannot be read in the app: its row says so and opens MangaDex in the browser.

Progress is recorded per page (`online_record_progress`). Reaching the last page marks the chapter read, locally at once and on MangaDex soon after.

## Accounts and the keychain

MangaDex signs in third party apps with a personal API client. The Accounts section asks for the client id, the client secret, the username and the password. The password goes to MangaDex once and is never stored. The rest lives in the OS keychain under the service `app.kireimanga.desktop`:

| Account                   | Holds                                         |
| ------------------------- | --------------------------------------------- |
| `mangadex.client_id`      | The personal client id (kept after sign out to fill the form) |
| `mangadex.client_secret`  | The client secret (removed on sign out)        |
| `mangadex.refresh`        | The session tokens as JSON (removed on sign out or expiry) |

Credentials never go into settings, the database or an IPC payload. A launch restores the session only when a username was stored, so a fresh install never touches the keychain. On a machine with no keychain the session lives in memory until the app closes, and the Accounts section says so.

When MangaDex refuses to refresh the session, the client clears the tokens and the app moves to `expired`: the banner and the Accounts row ask to sign in again. The AniList sign in (#45, `docs/tracking.md`) sits in the same section, below the MangaDex row.

## Sync

One refresh does, in order: follows and reading statuses, the feed, then read markers for every series in the feed. Only one refresh runs at a time.

| What             | Direction | Rule                                                                                       |
| ---------------- | --------- | ------------------------------------------------------------------------------------------ |
| Follows          | pull      | The followed list on MangaDex replaces the local one                                        |
| Follow, unfollow | push      | Sent at once from the series page                                                           |
| Reading status   | both      | Set from the series page (sent at once); pulled with the follows                            |
| Feed             | pull      | Chapters in your languages published since the last refresh (one hour of overlap); the first refresh looks back 14 days. Entries older than 30 days are pruned |
| Read markers     | both      | Local changes are stored as pending and pushed first; then MangaDex's markers are pulled and merged. A pending local change wins over the remote state until it is sent |

### Schedule and rate limits

The background refresh starts 20 seconds after launch, then runs every 30 minutes while signed in with "Check for new chapters" on. A refresh costs a handful of requests and the client's limiter keeps the app inside MangaDex's limits. After a failure the next run moves: five minutes when offline, until the limit lifts when rate limited (never sooner than five minutes), an hour when MangaDex refuses the network.

## Notifications

Sent from Rust through `tauri-plugin-notification` after a scheduled refresh finds chapters it has not announced yet, when "Notify me of new chapters" is on. One series: "New chapter: Title" with the chapter labels; several: "5 new chapters in 4 series" with the first titles. The refresh right after signing in, and the very first refresh, fill the feed without a notification, so signing in never floods the screen.

## Storage (migration 0006)

| Table           | Holds                                                                                |
| --------------- | ------------------------------------------------------------------------------------ |
| `online_series` | Cached series JSON, followed flag, reading status, per series language               |
| `online_feed`   | Feed chapters with when they were first seen and whether they were announced         |
| `online_read`   | Read markers and page progress per chapter, with the pending flag for unsent changes |
| `online_state`  | Small values: last refresh, when the feed was last seen, the signed-in username      |

Signing out forgets follows, statuses, feed and markers (`online_forget_account`).

## AniList tracking

A MangaDex series whose page names its AniList entry (`SeriesView.anilistId`, from the series' `al` link) is linked on its own the first time its page opens: `tracking_link` with origin `mangadex` (`useAnilistLink`), skipped when the series already has a link. The series page shows the same tracking card as a library series, so the link can be changed or made by hand.

Finishing a MangaDex chapter (reaching its last page) calls `tracking_report_progress` with the whole chapter number (`12.5` counts as 12; a oneshot sends nothing), once per chapter (`sendOnlineProgress` in `features/online/onlineProgress.ts`). Rust queues it only when tracking and auto update are on and the series is linked; the rules for conflicts are in `docs/tracking.md`.

## For other slices

| Hook                                     | Where                                                         |
| ---------------------------------------- | ------------------------------------------------------------- |
| Download action on chapter rows          | `requestDownload(chapterIds)` from `apps/desktop/src/lib/downloads.ts`, called by `OnlineSeriesPage` for a row of `OnlineChapterList` |
| Automatic downloads                      | `downloads::auto_download_new` with the fresh chapter ids of each feed refresh (not the first), in `online/refresh.rs` |
| The shared client for other slices       | `mangadex_client::shared(app)` returns the client held by `Online` |
| Accounts row                             | `MangaDexAccount` (`features/online/MangaDexAccount.tsx`) sits in `features/settings/AccountsSection.tsx` next to the AniList row |
