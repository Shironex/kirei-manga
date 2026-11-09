# Reading stats

How KireiManga records reading time and what the stats page and the year in review card show. Everything stays on this computer: there is no telemetry, the stats live in the library database, and the card is written only to a file the user picks.

## Sessions

Reading is recorded as sessions in the `reading_sessions` table (migration `0004_reading_sessions.sql`). The reader needs no timer of its own: the progress events that save the page on screen (`library_record_progress`, sent half a second after the page settles and once more when the reader closes) also feed the sessions, through `Library::record_reading` in `crates/kirei-library/src/stats.rs`. Progress and session are written in one transaction.

| Column              | What                                                                                     |
| ------------------- | ---------------------------------------------------------------------------------------- |
| `series_id`         | The live series, `ON DELETE SET NULL` like progress                                      |
| `series_ident`      | The series' stable identity (see `docs/library.md`, Keeping progress)                    |
| `series_title`      | The title when the session was written, so a removed series still has a name            |
| `day`               | Local calendar day, as days since 1970-01-01                                             |
| `utc_offset_min`    | The reader's UTC offset at that moment, minutes east of UTC                              |
| `started_at`, `ended_at` | Unix milliseconds                                                                   |
| `active_ms`         | Reading time: the gaps between events, each within the idle cutoff                       |
| `pages_turned`      | Events that moved to another page or chapter                                             |
| `chapters_finished` | Times the last page of a chapter was reached by turning to it                            |
| `last_*`            | Where the open session stands; only used while it can still be extended                  |

The rules:

- **Idle cutoff.** An event within 5 minutes (`IDLE_CUTOFF_MS`) of the open session, on the same series, extends it and adds the gap to `active_ms`. A longer pause, another series, or the first event after a launch starts a new session, and the pause counts for nothing. The time spent on the very last page before a pause is therefore not counted.
- **Local midnight.** A session never spans two local days. When a gap crosses midnight, the time up to midnight stays with the old session and the rest opens a new session on the next day. Daily totals and streaks are exact.
- **Time zones.** The renderer sends its UTC offset with every event (`utcOffsetMin`, `-getTimezoneOffset()`), and the day is fixed when the event is recorded. Travelling or a daylight saving change never moves days that were already recorded. If the offset changes mid-session, the new day starts a new session.
- **Finishing.** A chapter counts as finished when the reader turns onto its last page, once per session. Opening a finished chapter on its last page does not count again, nor does flipping back and forth on the last pages.
- **What counts.** A session with no time, no turn and no finish (a chapter opened and closed at once) is ignored by every total.
- Chapters opened from disk (`/read/file`) are not part of the library and are not recorded.

## Stats

`stats_get(year, utcOffsetMin)` returns `ReadingStats` for a calendar year in the reader's time zone:

| Field                                   | What                                                                    |
| --------------------------------------- | ----------------------------------------------------------------------- |
| `year`, `today`, `years`                | The year shown, today (`YYYY-MM-DD`), years with reading, newest first  |
| `allTime`, `yearTotals`                 | Time, sessions, pages, chapters finished, days with reading, series     |
| `currentStreak`                         | The run of reading days ending today, or yesterday when today has no reading yet |
| `longestStreak`, `yearLongestStreak`    | Longest run of all time and inside the year (latest wins a tie)         |
| `days`                                  | Every day of the year with reading, with its sums                        |
| `months`                                | Time read per month                                                      |
| `topSeries`                             | The five series read most in the year, by time, grouped by stable identity, with the live cover when the series is still in the library |
| `longestSessionMs`                      | The longest single session of the year                                   |

## Stats page

`/stats`, in the rail after Downloads (Ctrl or Cmd + 4, and Reading stats in the command palette). Code in `apps/desktop/src/features/stats`.

- The hero shows the year's time in the accent colour, the current streak, the average sitting, the busiest month and the all-time total.
- Tiles: chapters finished, pages turned, days with reading, longest streak of the year.
- A heatmap of every day of the year, Monday first, in four levels by quartile of the days with reading (`buildHeatmap` in `model.ts`). Each day has a tooltip; the grid is one image for screen readers with a sentence describing the year.
- Most read: the top series with covers, time, chapters and days, each linking to its series. Hovering previews the cover colours.
- By month and All time.
- The page puts the cover of the year's most read series in focus, so the whole app takes its colours while the page is open.
- A year picker appears once there is more than one year of reading.

Text uses only the token pairs `contrast.test.ts` already holds to AA (fg-1, fg-2 and the accent over the backdrop, fg-3 only on panels); the fullest heatmap cell keeps 3:1 against an empty one (`pairs.ts`).

## Year in review card

A 1080 by 1350 PNG (4:5) drawn on a canvas by `card/drawCard.ts`: the year, the hours read, the four tiles, the heatmap, the top three series with covers, and the blurred and featured cover of the year's most read series. The preview on the page is the same canvas scaled down, so what is shown is what is saved.

- **Colours** come from that cover's palette the way the app's tokens do: hue and chroma from the cover, lightness fixed per role (`card/cardTheme.ts`). `cardTheme.test.ts` holds every text colour to AA over the brightest the background can get (a white cover plus both glows) for every hue and chroma.
- **Covers** are fetched as bytes over IPC (`stats_cover`), not loaded from `kirei-cover` URLs: those are another origin and would taint the canvas, which blocks the export.
- **Portable drawing.** No `ctx.filter`, no `oklch()` colours, no font variation settings; the blur is a tiny canvas scaled up, the grain uses a fixed seed. Fonts are loaded with `document.fonts.load` before drawing.
- **Saving.** Save as PNG opens the save dialog (`dialog:allow-save`, already granted) with `kireimanga-<year>-in-review.png`. The renderer encodes the canvas with `toBlob` and sends the bytes as the raw body of `stats_save_card`, with the path percent-encoded in the `x-kirei-path` header. The command accepts only PNG bytes and an absolute path, adds `.png` when the picker dropped it, and writes through a `.partial` file that is renamed into place.

## Commands

| Command           | Arguments                         | Returns                              |
| ----------------- | --------------------------------- | ------------------------------------ |
| `stats_get`       | `year`, `utcOffsetMin`            | `ReadingStats`                       |
| `stats_cover`     | `hash`                            | the thumbnail's JPEG bytes           |
| `stats_save_card` | raw PNG body, `x-kirei-path` header | the path written                   |
| `stats_count`     |                                   | how many sessions are stored; deletes nothing |
| `stats_clear`     |                                   | how many sessions were deleted       |

## Clearing

Settings, Data, Reading stats shows how many sessions are stored and has a Clear button (also in the command palette as Clear reading stats). A confirm step names the count first. Clearing runs `DELETE FROM reading_sessions` (`Library::clear_reading_sessions`) and nothing else: reading progress, series settings and the library stay, and backups already made keep their copy. The next chapter read opens a fresh session. There is no undo short of restoring a backup.

## Backup

Sessions are rows of the library database, so a backup carries them and a restore brings them back unchanged (`tests/backup.rs`, `reading_stats_survive_a_backup_and_restore`). See `docs/data.md`.
