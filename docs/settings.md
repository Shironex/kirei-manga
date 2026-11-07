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

The reader keys are defaults. A choice made inside the reader belongs in that series' `series_settings` blob and wins over these.

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
| `library_purge_orphans`     | `olderThanDays` (null for all)              | `{ progress, settings }` |
| `library_cover_cache`       |                                             | `{ bytes, files }` |
| `library_clear_cover_cache` |                                             | `{ bytes, files }` freed; refused while a scan runs; the next scan makes covers again |
| `data_dir`                  |                                             | path (the portable `data` folder in portable mode, see `docs/data.md`) |
| `open_data_dir`             |                                             | opens it in Finder or Explorer |
| `open_link`                 | `link`: `website`, `repository`, `issues`, `notices` | opens a fixed URL in the browser |
| `third_party_notices`       |                                             | the bundled `THIRD_PARTY_NOTICES` text, or null |

`open_link` takes a name, not a URL, so the renderer cannot launch arbitrary targets. Folders and links are handed to the OS (`open`, `explorer`, `xdg-open`) without a plugin. `THIRD_PARTY_NOTICES` is bundled as a resource (`tauri.conf.json`); without it the About section links to the file in the repository.
