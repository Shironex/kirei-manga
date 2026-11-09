# Data, portable mode and backups

Where KireiManga keeps its own data, how to run it portable, and the backup file. The user's manga files are never written to and are never part of a backup.

## Data folder

Every location comes from `kirei_core::DataPaths` (`crates/kirei-core/src/paths.rs`). Nothing else joins file names onto a data directory. The shell resolves it once at launch (`apps/desktop/src-tauri/src/data.rs`).

| What           | Path under the data folder                     |
| -------------- | ---------------------------------------------- |
| Database       | `library.sqlite3` (plus `-wal`, `-shm`)        |
| Cover cache    | `covers/`                                      |
| Logs           | `logs/` (reserved, nothing writes logs yet)    |
| Window state   | `.window-state.json`                           |
| Set aside data | `backups/pre-restore-<UTC time>/`              |
| Restore        | `restore-staging/`, `restore-pending` (transient) |
| Downloads      | `downloads/` (default folder, a library root; `downloads.folder` moves it) |
| Download queue | `downloads.sqlite3` (plus `-wal`, `-shm`)      |
| Unfinished downloads | `download-staging/<chapter id>/`         |

Installed builds use the OS app data directory for the identifier `app.kireimanga.desktop`: `~/Library/Application Support/app.kireimanga.desktop` on macOS, `%APPDATA%\app.kireimanga.desktop` on Windows. The WebView's own storage (cache, cookies) stays where the OS webview puts it; the app keeps no state there.

## Portable mode

Portable mode is on when the folder the app sits in holds a file named `portable` (contents ignored, an empty file works) or a folder named `data`. All data then lives in that `data` folder, created on first launch.

- Windows: next to `KireiManga.exe`.

  ```
  KireiManga\
    KireiManga.exe
    portable
    data\
  ```

- macOS: next to `KireiManga.app`, never inside the bundle. The bundle is replaced on update and writing into it breaks its code signature.

  ```
  KireiManga/
    KireiManga.app
    portable
    data/
  ```

Move the whole folder to keep the library. Library roots are stored as absolute paths, so on another machine (or another drive letter) add the manga folder again: reading progress and series settings come back through their stable identities (see `docs/library.md`, Keeping progress).

There is no switch between modes in the app and no automatic migration. To make an installed library portable, make a backup, create the portable folder and restore the backup in the portable build.

## Backup file

One ZIP file with the extension `.kireibackup`:

| Entry             | What                                                                                   |
| ----------------- | -------------------------------------------------------------------------------------- |
| `manifest.json`   | `app`, `format` (layout version, 1), `appVersion`, `schemaVersion`, `createdAt` (Unix ms), `includesCovers`, `coverCount`, `databaseBytes`, `databaseBlake3` |
| `library.sqlite3` | The whole database: roots, series, chapters, reading progress, per-series settings, app settings (`app_settings`, see `docs/settings.md`), cover rows |
| `covers/<hh>/<hash>.jpg` | Thumbnails, only when asked for                                                 |

The database copy is made with SQLite's `VACUUM INTO` while the app runs: a consistent, compacted snapshot, never a copy of a file SQLite may be writing. Covers are off by default because a scan rebuilds them. Downloaded archives, the download queue and unfinished pages are not part of a backup: the archives are manga files like any other, and the queue can be refilled from MangaDex. The file is written as `<name>.partial` and renamed when complete, so a failed backup leaves nothing behind.

## Restore

1. Validate (also the dry run, `backup_inspect`): the file must be a ZIP with a KireiManga manifest. A newer `format` or `schemaVersion` than this build supports is refused with "this backup was made by a newer KireiManga ...; update the app to restore it". The database is unpacked, its size and BLAKE3 hash must match the manifest, and SQLite's `integrity_check` must pass. An older schema is fine: it is migrated forward on the next open.
2. Stage (`backup_restore`): the same checks, unpacking into `restore-staging/`, then the `restore-pending` marker is written last. Nothing live has changed yet.
3. Restart (`app_restart`). At launch, before the library opens, the live database (and the cover cache, when the backup carries covers) moves to `backups/pre-restore-<UTC time>/` and the staged files move into place. Each step is a rename inside the data folder. A failed step moves everything back and the launch reports the error in `data_info`. If the process dies half way, the marker is still there and the next launch finishes; nothing is deleted.

The swap waits for a restart because the database is open while the app runs (and Windows cannot rename an open file). A backup without covers keeps the current cover cache; run a scan after restoring to fill in covers whose files are missing. Set aside folders are never removed automatically.

## In the app

Settings, Data (`features/settings/DataSection.tsx`, flows in `useBackup.ts`):

- **Data folder** shows the resolved folder from `data_info` and a Portable tag in portable mode.
- **Create backup** opens a dialog with an Include covers switch (off by default), then the save dialog. The default name is `kireimanga-<local date>.kireibackup`, and the extension is added when the picker drops it. The row then names the file it saved.
- **Restore** picks a file and runs `backup_inspect` first. A valid file opens a review dialog with the manifest (date, app version, schema, database size, covers) and says the current data is moved aside, not deleted; **Restore and restart** calls `backup_restore`, then `app_restart`. A refused file (newer schema, damaged, not a backup) opens a dialog that says why in plain words, with the raw message under Details (`describeBackupError` in `lib/settings/data.ts`).
- After a restart, `lastRestore` shows as a note on the Backup row with the set aside folder, and `restoreError` as a warning.

## Commands

| Command          | Arguments              | Returns                                                                 |
| ---------------- | ---------------------- | ----------------------------------------------------------------------- |
| `data_info`      |                        | `{ mode: 'installed' \| 'portable', root, database, covers, backups, lastRestore, restoreError }` |
| `backup_create`  | `path`, `includeCovers` | `BackupManifest`                                                        |
| `backup_inspect` | `path`                 | `BackupManifest` (dry run, changes nothing)                              |
| `backup_restore` | `path`                 | `BackupManifest` (staged; restart to apply)                              |
| `app_restart`    |                        | does not return                                                          |

`data_dir` and `open_data_dir` (see `docs/settings.md`) report and open the same resolved folder, so they follow portable mode. `lastRestore` is `{ manifest, previousData }` when this launch applied a restore. The UI picks paths with the dialog plugin (`dialog:allow-open` and `dialog:allow-save` are granted in `capabilities/default.json`). Errors come back as readable strings.
