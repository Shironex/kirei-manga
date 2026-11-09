# Settings

App-wide settings, the store behind the Settings screen (#35). Per-series reader choices are separate: they live in `series_settings` (see `docs/library.md`).

## Where they live

| Layer    | File                                         | Role                                                                                      |
| -------- | -------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Contract | `crates/kirei-core/src/settings.rs`          | `AppSettings`: every key, its type and its default. Validation is deserializing into it. |
| Storage  | `crates/kirei-library/src/settings.rs`       | One row per changed key in `app_settings` (migration 0003) of `library.sqlite3`.          |
| Commands | `apps/desktop/src-tauri/src/settings.rs`     | `settings_get`, `settings_set`, plus the Settings screen housekeeping commands.           |
| Renderer | `apps/desktop/src/lib/settings/`             | `contract.ts` (types, defaults), `store.ts` (`useSetting`), `appearance.ts`.              |

Settings share the library database instead of a file of their own, so there is one file to back up, restore and carry in portable mode, and a write is a SQLite statement rather than a hand-rolled atomic rename. A missing row means the default, so adding a key needs no migration. Rows a build does not know (written by a newer one) are kept and ignored, and a stored value that no longer validates falls back to the default instead of stopping the app.

## Reading and writing from the UI

```tsx
import { useSetting } from '@/lib/settings/store';

const [strength, setStrength] = useSetting('appearance.strength');
```

`useSetting(key)` is typed by key. The store loads once, then follows the `settings:changed` event that `settings_set` broadcasts to every window, so every view updates live. Writes apply at once and roll back if Rust refuses the value; the setter's promise rejects with the reason. `useSettings()` returns all settings plus `loaded` and `error`. Outside Tauri (a plain browser preview) the defaults are used and writes stay in memory.

Appearance keys are applied to `<html>` by `useAppearanceSettings()`, mounted once in `App.tsx`: `--strength`, `data-ambient`, `data-glass` and `data-motion`.

## Keys

| Key                     | Type                                                | Default      | Read by                                                                                   |
| ----------------------- | --------------------------------------------------- | ------------ | ----------------------------------------------------------------------------------------- |
| `appearance.strength`   | `'subtle' \| 'balanced' \| 'vivid'`                 | `'balanced'` | `--strength` (0.6, 1, 1.35) via `setStrength`                                             |
| `appearance.coverColours` | `boolean`                                       | `true`       | Cover theming (`lib/theme/coverTheme.ts`): off keeps the default accent and hides the cover backdrop |
| `appearance.ambient`    | `boolean`                                           | `true`       | `data-ambient="off"` hides the cover glow                                                 |
| `appearance.glass`      | `boolean`                                           | `true`       | `data-glass="off"` uses solid surfaces, like reduced transparency                         |
| `appearance.motion`     | `'system' \| 'reduced' \| 'full'`                   | `'system'`   | `data-motion`: absent follows `prefers-reduced-motion`; `reduced` and `full` force it     |
| `reader.mode`           | `'single' \| 'double' \| 'webtoon'`                 | `'single'`   | Reader (#29): layout for a series with no saved mode                                      |
| `reader.direction`      | `'rtl' \| 'ltr'`                                    | `'rtl'`      | Reader (#29): page order in paged modes when the series has none saved                    |
| `reader.fit`            | `'screen' \| 'width' \| 'height' \| 'original'`     | `'screen'`   | Reader (#29): page sizing against the window                                              |
| `reader.filter`         | `'lanczos3' \| 'mitchell' \| 'nearest'`             | `'lanczos3'` | Reader quality (#30): maps one to one onto `kirei_reader::Resample`                       |
| `reader.detectSpreads`  | `boolean`                                           | `true`       | Reader (#29): show wide pages alone in double page mode                                   |
| `reader.detectWebtoon`  | `boolean`                                           | `true`       | Reader (#95): open chapters of tall strips in webtoon when the series chose no mode       |
| `reader.splitTall`      | `boolean`                                           | `true`       | Reader (#95): show tall strips in screen sized parts in the paged modes at screen fit; sent to the pipeline with `set_render_quality` |
| `reader.keys`           | `Record<string, string[]>`                          | `{}`         | Reader (#95): key bindings, see below                                                      |
| `downloads.folder`      | `string \| null`                                   | `null`       | Downloads (#44): absolute folder for archives; null is `downloads/` in the data folder. Kept as a library root, see `docs/downloads.md` |
| `downloads.dataSaver`   | `boolean`                                           | `false`      | Downloads (#44): queue MangaDex's smaller `data-saver` pages; fixed per job when queued   |
| `downloads.concurrency` | `number`, 1 to 4                                    | `2`          | Downloads (#44): chapters downloaded at the same time; applied at once                    |
| `downloads.autoFollows` | `boolean`                                           | `false`      | Downloads (#44): `autoDownloadNew` queues new chapters from the follow feed only when on  |

`downloads.concurrency` is refused outside 1 to 4 and `downloads.folder` unless it is null or an absolute path; `settings_set` applies a changed download key to the running queue at once (see `downloads::apply_settings`).

The `reader.*` keys are defaults (`reader.keys` aside). A choice made inside the reader belongs in that series' `series_settings` blob and wins over these.

### Reader key bindings

`reader.keys` maps a reader command (`next`, `page-left`, `toggle-ui`, the list is `COMMANDS` in `features/reader/model/keys.ts`) to its keys. Key names are `KeyboardEvent.key` values with `Space` for the space bar and letters in lower case; a named key may carry `Shift+` (`Shift+Space`). A printed character is matched without Shift, since the character already says it (`+`). Keys with Cmd, Ctrl or Alt belong to the app and the OS and cannot be bound, nor can Tab, so a reader key can never clash with the app shortcuts (Cmd or Ctrl with 1 to 4, comma and K).

The empty object means the built-in bindings (`DEFAULT_BINDINGS`). Once the user changes anything, the Settings screen stores every command, and goes back to `{}` when the bindings match the defaults again, so later built-in changes still reach users who never customised. A command the stored map does not name (one added by a later build) keeps its built-in keys, minus any the user already gave to another command (`resolveBindings`).

Rust checks the shape only: command names of lower case letters, digits and dashes, at most 4 keys per command, names up to 32 characters, and no key on two commands. The Settings screen never gets that far: a key another command holds is offered to move ("Move it here" or "Keep it there") instead of being taken silently. The four arrow commands keep their meaning on any key: `page-left` and `page-right` follow the reading direction, `page-down` and `page-up` scroll a little in webtoon.

## Adding a key

1. Add the field to `AppSettings` in `kirei-core` with `#[serde(rename = "section.name")]` and its default.
2. Mirror it in `AppSettings` and `DEFAULT_SETTINGS` in `contract.ts`. `renderer_defaults_match_rust` in `src-tauri/src/settings.rs` fails until both agree.
3. Add a row here and a control on the Settings screen.

Never rename a shipped key: stored rows would be ignored. Add a new key instead.

## Commands

| Command                     | Arguments                                   | Returns            |
| --------------------------- | ------------------------------------------- | ------------------ |
| `settings_get`              |                                             | `AppSettings`      |
| `settings_set`              | `key`, `value`                              | `AppSettings`, emits `settings:changed`; refuses unknown keys and wrong values with a message |
| `library_count_orphans`     |                                             | `{ progress, settings }` that a purge would delete; deletes nothing |
| `library_purge_orphans`     | `olderThanDays` (null for all)              | `{ progress, settings }` deleted; refused while a scan runs |
| `library_cover_cache`       |                                             | `{ bytes, files }` |
| `library_clear_cover_cache` |                                             | `{ bytes, files }` freed; refused while a scan runs; the next scan makes covers again |
| `library_unused_covers`     |                                             | `{ bytes, files }` of thumbnails no series uses (deleted series, older cover rules); deletes nothing |
| `library_prune_covers`      |                                             | `{ bytes, files }` freed; thumbnails in use stay; refused while a scan runs |
| `data_dir`                  |                                             | path (the portable `data` folder in portable mode, see `docs/data.md`) |
| `open_data_dir`             |                                             | opens it in Finder or Explorer |
| `open_link`                 | `link`: `website`, `repository`, `issues`, `notices` | opens a fixed URL in the browser |
| `third_party_notices`       |                                             | the bundled `THIRD_PARTY_NOTICES` text, or null |

`open_link` takes a name, not a URL, so the renderer cannot launch arbitrary targets. Folders and links are handed to the OS (`open`, `explorer`, `xdg-open`) without a plugin. `THIRD_PARTY_NOTICES` is bundled as a resource (`tauri.conf.json`); without it the About section links to the file in the repository.

## Shortcuts and the command palette

The Shortcuts section lists the keys the app runs on. `Ctrl+K` (Windows and Linux) or `Cmd+K` (macOS) opens the command palette from any screen inside the app shell, even while typing; the same keys or `Esc` close it. `1`, `2`, `3` and `,` with the same modifier go to the library, browse, downloads and settings.

The palette's key is defined once in `features/palette/shortcut.ts` (`PALETTE_SHORTCUT`), so the remappable shortcuts table can take it over later.

The palette (`features/palette/`) searches:

- library series, from the library store (the index is memoised on the series array and built before the first open);
- chapters of the best three series a query finds, read on demand and cached per catalogue version;
- pages, Settings sections and individual settings, and app actions (rescan, add a folder, toggle cover colours, ambient glow and glass, back up or restore, open the data folder).

Matching is a small hand written scorer (`fuzzy.ts`): every word must match, runs of letters beat letters spread in order, word starts beat the middle, accents are folded. Enter runs the highlighted result, arrow keys move, and the last six picks show first when the box is empty (kept in `localStorage`). The input is an ARIA combobox over a listbox with `aria-activedescendant`; focus stays trapped in the panel.

Results that do not live in the app are a `PaletteSource` (`features/palette/types.ts`), registered with `registerPaletteSource`. The online lane (#43) fills the `online` section that way; the palette calls the source with the query (after a short pause, aborted when the query changes) and lists what it returns.
