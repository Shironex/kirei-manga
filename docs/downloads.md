# Downloads

Offline downloads live in `crates/kirei-download`: a persistent queue that fetches MangaDex chapters through the app's one MangaDex client and writes each chapter as a CBZ archive with `ComicInfo.xml` into a downloads folder the library watches. The desktop shell wraps it in thin commands (`apps/desktop/src-tauri/src/downloads.rs`) and the renderer calls them through `apps/desktop/src/lib/downloads.ts`. Non MangaDex sources are out of scope.

## Where files land

| What             | Where                                                                  |
| ---------------- | ---------------------------------------------------------------------- |
| Archives         | `<downloads folder>/<Series>/[Group] Vol.02 Ch.011 - Title {5c0a1b2c}.cbz` |
| Downloads folder | `downloads.folder` setting, else `<data folder>/downloads`             |
| Queue            | `<data folder>/downloads.sqlite3` (WAL)                                |
| Unfinished pages | `<data folder>/download-staging/<chapter id>/`                         |

The data folder follows portable mode (`docs/data.md`), so a portable build keeps the queue, the staging pages and, by default, the downloads themselves in its `data` folder. Every path comes from `kirei_core::DataPaths`.

At launch, and whenever `downloads.folder` changes, the shell makes sure the folder exists and is scanned: when it already is a library root or sits inside one nothing changes, else it is added as a root of its own (watched, and scanned once in case it already held chapters). A folder that contains an existing root cannot be added (roots may not nest); the Downloads page and the Settings row then say the folder is not in the library. A finished archive is renamed into place, the watcher sees the new file and rescans that series, and the chapter reads offline like any other CBZ.

### Names

Folder and file names follow the scanner's rules (`crates/kirei-library/src/naming.rs`), so a downloaded series groups like any other folder:

- one folder per series directly inside the downloads folder, named after the series title in the reader's language chain. The folder chosen at a series' first download is remembered in the queue file (`series_folders`), so a later title change on MangaDex never splits a series; a second series with the same title gets the start of its id appended.
- one archive per chapter: the credited groups as a leading tag (read as the scan group), `Vol.` and `Ch.` numbers zero padded so files sort in any browser, the chapter title, and the first eight characters of the MangaDex chapter id in braces, which keeps two groups' uploads of one chapter apart and which the parser drops. A chapter with no number and no volume is `Oneshot`.
- names are safe on Windows and macOS: no reserved characters or brackets inside parts, no leading dot (the scanner skips hidden files), no trailing dot or space, no device names (`CON`, `NUL`, ...), and bounded lengths.

### ComicInfo.xml

Written in the Anansi v2.0 element order. The library reads every field it stores back from it (`tests/downloads.rs` checks the round trip through `kirei_library::parse_comic_info` and a real scan).

| Element                         | From                                                                   |
| ------------------------------- | ---------------------------------------------------------------------- |
| `Series`                        | the series title the folder is named after                             |
| `Title`, `Number`, `Volume`     | the chapter                                                            |
| `LanguageISO`                   | the chapter's translated language (`pl`, `en`, `pt-br`, ...)           |
| `Translator`, `ScanInformation` | the scanlation groups, or the uploader when there is no group          |
| `Web`                           | `https://mangadex.org/title/<manga id> https://mangadex.org/chapter/<id>` |
| `Summary`, `Writer`, `Penciller`, `Year`, `Genre` | the series                                           |
| `Manga`                         | `YesAndRightToLeft` for Japanese originals, `Yes` otherwise            |
| `AgeRating`, `PageCount`, `Notes` | content rating, page count, and both MangaDex ids in plain text      |

The library parser reads the MangaDex series id back out of `Web` (`ComicInfo::mangadex_id`), so the library can tie a downloaded series to its page online. There is no `<Pages>` list: marking page 0 as the front cover would stop the library from skipping a wide credits page when it picks a cover.

## Atomic writes and resume

A download never leaves a corrupt or half written archive where the library or a resume reads it, whenever the app is killed:

1. **Pages.** Each page goes to `.NNNN.tmp` in the chapter's staging folder, is synced, and is renamed to `NNNN.<ext>`. A file with a final name is always a whole page. Staging is outside every library root, so a half finished chapter is never scanned.
2. **Archive.** When every page is staged, the CBZ (ComicInfo.xml deflated, pages stored as they came) is written to `.<name>.cbz.part` in the series folder, synced, and renamed over `<name>.cbz`; on Unix the folder is synced after the rename. A rename within one folder is atomic, so the final name is either absent, the previous complete archive, or the new complete one. A kill before the rename leaves a hidden `.part`, which the scanner and watcher skip and the next attempt overwrites.
3. **Done.** The staging folder is deleted and the job is marked done.

Resume reads the staging folder: pages with a final name are kept, everything else is fetched again. On launch, jobs that were downloading go back to the queue and start by themselves; failed and paused jobs wait for Resume or Retry. A failed page stops new pages from starting, but the pages already in flight finish, so a resume has as little left as possible.

Pausing or cancelling aborts the chapter's task, which is safe at any await for the same reasons. Writing the archive runs on the blocking pool and finishes even if the task is aborted meanwhile: a pause that arrives during that last step loses to done, because the file exists. Cancel deletes the job, its staged pages and any `.part` file; an archive already in the library stays.

## Limits

Downloads use the shared MangaDex client (`docs/mangadex.md`), so every API call (chapter and series details, at-home server lookups) counts against the same global 5 per second and at-home 40 per minute budgets as browsing, and the client reports every image load to MangaDex@Home and fails over to a new server when a page fails (3 servers by default). On top of that the downloader:

| Control              | Default         | Notes                                                                 |
| -------------------- | --------------- | --------------------------------------------------------------------- |
| Chapters at a time   | 2               | `downloads.concurrency`, 1 to 4                                        |
| Pages in flight      | 3 per chapter   | fixed                                                                 |
| Page images started  | 5 per second    | one sliding window across all chapters; MangaDex publishes no number for MangaDex@Home, so this is our own guard |
| Page retries         | 3 tries         | 2 s doubling, at most 30 s; a 429 waits its `Retry-After`. Not retried: a ban (403), not found, bad input |

The page budget is the client crate's own `RateLimiter`. `tests/rate.rs` runs four chapters of 20 pages on a paused clock against a source with no network and checks that no window of one second holds more than five page starts and that no more than two chapters with three pages each are ever in flight.

Data saver (`downloads.dataSaver`) downloads MangaDex's recompressed `data-saver` pages. The quality is fixed per job when it is queued, so a resume never mixes the two sets.

## Queue

`downloads.sqlite3` holds one row per chapter (`jobs`: chapter id, series and chapter labels once known, quality, state, page counts, error, archive path, whether it was queued automatically) and the series folder choices. It is a file of its own rather than a library migration, so queue writes never wait on a scan and the library schema stays untouched. `PRAGMA user_version` is 1; a queue file from a newer build is refused and downloads report why.

States: `queued`, `downloading`, `paused`, `done`, `failed`. Queuing a chapter that is already queued, running, paused or done does nothing (a done chapter whose archive was deleted is queued again); a failed one is retried. Clearing finished jobs removes their rows and keeps their archives.

## For the online screens (#43)

- `requestDownload(chapterIds)` in `lib/downloads.ts` queues MangaDex chapter ids with the data saver setting in effect and resolves with the jobs added. The chapter row's Download action calls it.
- `autoDownloadNew(followedChapterIds)` queues new chapters from the follow feed when `downloads.autoFollows` is on (checked in Rust, `downloads::auto_download_new`, so a Rust side feed can call that directly) and resolves with what was queued, empty when the setting is off. The feed trigger is wired by #43.
- The client: `src-tauri/src/mangadex_client.rs` holds the app's one `MangaDex` behind `mangadex_client::shared(app)`. Until #43 lands its client in Tauri state, that accessor builds one with the default config. #43 should make `shared` return its own client (with sign in, languages and ratings) so downloads and browsing share one set of limits; nothing else needs to change.

## Commands

| Command                    | Arguments                    | Returns                                                     |
| -------------------------- | ---------------------------- | ----------------------------------------------------------- |
| `downloads_list`           |                              | `DownloadJob[]`, oldest first                               |
| `downloads_enqueue`        | `chapterIds`                 | `DownloadJob[]` added or requeued                           |
| `downloads_auto`           | `chapterIds`                 | `DownloadJob[]` queued; empty when `downloads.autoFollows` is off |
| `downloads_pause`          | `ids` (null for all)         |                                                             |
| `downloads_resume`         | `ids` (null for all)         | paused and failed jobs go back to the queue                 |
| `downloads_cancel`         | `ids` (null for all)         | deletes the jobs and their staged pages                     |
| `downloads_clear_finished` |                              | how many finished jobs were removed                         |
| `downloads_folder`         |                              | `{ path, inLibrary, error }`                                |
| `open_downloads_folder`    |                              | opens the folder in Finder or Explorer                      |

Every change is sent as a `downloads:changed` event: `{ kind: 'changed', job }` or `{ kind: 'removed', id }`. If the queue cannot start (no data folder, a newer queue file), the app still starts and the commands return the reason.

## Screens

- `features/downloads/downloadsStore.ts` loads the queue once and follows `downloads:changed`, buffering events that arrive while the first list loads.
- The Downloads page (`/downloads`, also in the command palette) lists jobs in progress with a progress bar and status line, and finished ones below. Rows have Pause, Resume (Retry for a failed job) and Cancel; the header has Pause all, Resume all and Clear finished. The folder line shows where archives go, with Show folder, and warns when the folder is not in the library.
- Settings, Downloads: the folder (Change, Use default), Data saver, Chapters at a time, and Download new chapters of followed series.

## Tests

No test touches the network. `crates/kirei-download/tests/downloads.rs` runs the real client against a local wiremock server replaying MangaDex responses:

- a chapter downloads into the library: pages in order, ComicInfo read back by the library's parser, and a real library scan shows one series with the right number, volume, title, language and group;
- two chapters from different groups group into one series;
- a page that keeps failing leaves the others staged and no archive; after a restart, resume fetches only the missing page;
- dropping the downloader mid chapter (as a kill would stop it) leaves no archive and nothing the scanner picks up; the next start resumes on its own and fetches only what is missing;
- a leftover `.part` from a kill during the archive write is invisible to the scanner and replaced;
- data saver, pause and resume, cancel, a queue that survives a restart, and bad ids refused.

Unit tests cover the store, staging, names, and a crash between writing the archive and the rename (`cbz.rs`). `tests/rate.rs` checks the page budget on a paused clock.
