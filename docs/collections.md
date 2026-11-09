# Collections, tags and smart filters

Ways to organise the library beyond its folders: collections the user fills by hand, free tags, a Want to Read list, and smart filters that keep themselves up to date and can be pinned to Home as rows. Everything lives in the library database (`crates/kirei-library/src/collections.rs` and `filters.rs`), so it travels in a backup and survives a removed folder.

## Model

| Thing          | What it is                                                                                                           |
| -------------- | -------------------------------------------------------------------------------------------------------------------- |
| Series ref     | The row everything hangs off: a local series, a MangaDex title, or both. Made on first use.                           |
| Tag            | A free word. Names are unique ignoring case; a tag that comes off its last series is deleted.                          |
| Collection     | A named, ordered list. Collections themselves are ordered too, and one member can be picked as the collection's cover. |
| Want to Read   | A flag with a date on the ref, listed newest first.                                                                    |
| Smart filter   | A saved, named `FilterQuery`, optionally pinned to Home. Pinned filters show as rows in the user's order.              |

### Naming a series

Callers name a series with `SeriesRef`:

```ts
type SeriesRef =
  | { source: 'local'; seriesId: number }
  | { source: 'mangadex'; remoteId: string; title?: string | null; coverFile?: string | null };
```

The ref row stores the local `series_id` and the `source` plus `remote_id` pair side by side, each nullable, so a MangaDex title can join Want to Read and collections before (or without) being on disk, and a local series can later be linked to its MangaDex id without moving its lists. A remote title's `title` and `coverFile` (the MangaDex cover file name, `manga.cover.fileName`) are cached so lists show it offline, and the image comes through the `kirei-online` cover scheme like every other MangaDex cover; passing them again refreshes the cache, `null` keeps it.

A local ref also stores the series' stable identity (`series_ident`, see Keeping progress in `docs/library.md`). Removing a root nulls `series_id`; the ref is then an orphan, hidden from every list and count, and a scan that finds a series with the same identity links it again, tags, collections and Want to Read included. A ref that holds nothing is deleted as soon as its last tag, collection or Want to Read goes; the orphan purge in Settings also deletes any empty ref a removed folder left (counted as empty list entries) and keeps every ref that still carries something.

### MangaDex titles

```ts
import { addToWantToRead, removeFromWantToRead, isWanted } from '@/features/collections/shelfStore';

await addToWantToRead({
  source: 'mangadex',
  remoteId: manga.id,
  title,
  coverFile: manga.cover?.fileName ?? null,
});
```

That is the whole contract for a MangaDex title to show in Want to Read, on Home and in smart filters with the MangaDex source. `isWanted(useShelf().want, ref)` drives a toggle. Collections and tags take the same refs (`addToCollection(id, refs)` in `lib/shelf.ts`). The MangaDex series page (`features/online/OnlineSeriesPage.tsx`) does exactly this: a Want to Read button in its header and the Your lists card for tags and collections. In every list a MangaDex tile links to `/online/$mangaId`.

## Smart filters

A `FilterQuery` has optional criteria that must all hold; values inside one criterion are alternatives.

| Criterion         | Meaning                                                                                       |
| ----------------- | --------------------------------------------------------------------------------------------- |
| `tags`, `tagMode` | Any of the tags, or all of them                                                               |
| `excludeTags`     | None of these tags                                                                            |
| `collections`     | In any of these collections                                                                   |
| `wantToRead`      | Only Want to Read (`true`), none of it (`false`), either (`null`)                              |
| `status`          | Unread, reading or finished, with the library grid's rules                                    |
| `minUnread`       | At least this many unread chapters on disk                                                    |
| `languages`       | The series or one of its chapters is in one of these languages, as the files name them         |
| `source`          | `local` (on disk) or `mangadex` (a title known only from MangaDex)                             |
| `addedWithinDays` | Added to the library (for a remote title: first organised) in the last so many days            |
| `sort`            | Title, date added, recently read, most unread                                                 |

Status, unread count and language need files, so a remote title never matches them. The query is stored as JSON; unknown fields are ignored and missing ones take their default, so a filter saved by a newer build still opens. Deleting a tag or collection removes it from every saved query, and merging two tags (renaming one to the other's name) points the queries at the one kept.

### Evaluation

`filters::compile` builds one SQL statement from the query with every value bound as a parameter; the query text is never spliced in. Local series and remote refs are two halves joined by `UNION ALL`, ordered and limited in SQL, with `count(*) OVER ()` giving the total in the same pass. Read status and unread counts come from a `counts` CTE, added only when a criterion or the sort needs it: chapter presence is counted from the `chapters_presence` index alone, and progress from its own rows (a `CROSS JOIN` keeps SQLite driving from them).

Indexes the filters use: `series_tags` (primary key on tag, plus `series_tags_ref`), `collection_items_ref`, the unique `series_refs.series_id`, `series_added`, `series_language`, `chapters_language`, `chapters_presence`. `tests/collections.rs` checks the plans use them.

### Measured

`cargo test -p kirei-library --release --test collections filters_stay_fast -- --nocapture` builds 5000 series of 25 chapters (125 000 chapters, a quarter of the series partly read) and runs each filter warm, returning the first 24 rows and the total. On an Apple M3 (release build):

| Filter                                  | Matches | Time    |
| --------------------------------------- | ------- | ------- |
| Everything, by title                    | 5000    | 3.1 ms  |
| One tag                                 | 1667    | 2.1 ms  |
| A collection and a language             | 71      | 2.8 ms  |
| Reading, recently read first            | 1200    | 14.7 ms |
| At least 20 unread, in Want to Read     | 500     | 12.0 ms |
| Added in the last day                   | 0       | 0.04 ms |
| Tag 1667 series at once (bulk edit)     |         | 8.2 ms  |
| Add 500 series to a collection          |         | 2.0 ms  |

## Screens

- **Home** (the library page): under the continue hero, a Want to Read row when it has anything, then one row per pinned smart filter, each with its count and See all. Rows are hidden while searching, filtering or selecting.
- **Library grid, bulk edit**: the Select button in the toolbar turns the tiles into toggles. Click to select, Shift click for a range in grid order, Ctrl or Cmd+A to select everything shown, Esc to leave. A floating bar edits the selection: Tags and Collections open a checklist where a check means every selected series has it and a dash means some do; clicking adds to all or takes off all, and typing a new name makes one. Want to Read adds or removes the whole selection. A search or filter that hides series drops them from the selection, so a bulk edit only touches what is on screen.
- **Series page**: a Your lists card with the Want to Read toggle, tags as removable chips with a picker, and the collections the series is in.
- **MangaDex series page**: Want to Read beside Follow in the header, and the same Your lists card (tags, Add to a collection) next to the AniList card.
- **Collections** (`/collections`, in the rail, Ctrl or Cmd+5): Want to Read and every collection as cover cards (Arrange to reorder), saved smart filters with their On Home switch, order, edit and delete, and every tag with its count.
- **A collection** (`/collections/$id`, `want` for Want to Read): the covers in order; Arrange turns them into rows to drag, or move with the arrow buttons, and to pick the cover or remove a member. Rename and delete in the header.
- **A smart filter** (`/filters/$id`) and **a tag** (`/tags/$id`): the matches as a grid, local series first and MangaDex titles below. A tag page can rename (renaming onto another tag merges them), delete, or save itself as a smart filter.
- **Filter builder**: a dialog with every criterion, a live count of matches as it is built, and Pin to Home.
- **Command palette**: Want to Read, collections, smart filters and tags are listed under Collections and filters, and open their page.

## Commands

All in `apps/desktop/src-tauri/src/shelf.rs`, wrapped in `apps/desktop/src/lib/shelf.ts`.

| Command                        | Arguments                         | Returns            |
| ------------------------------ | --------------------------------- | ------------------ |
| `shelf_overview`               |                                   | `ShelfOverview`    |
| `shelf_selection`              | `series` (refs)                   | `SelectionShelf`   |
| `shelf_want_to_read`           |                                   | `ShelfItem[]`      |
| `shelf_set_want`               | `refs`, `want`                    |                    |
| `shelf_tag`                    | `refs`, `name` (made when new)    | `Tag`              |
| `shelf_untag`                  | `refs`, `tagId`                   |                    |
| `shelf_rename_tag`             | `tagId`, `name` (merges on clash) | `Tag`              |
| `shelf_delete_tag`             | `tagId`                           | `boolean`          |
| `shelf_create_collection`      | `name`                            | `Collection`       |
| `shelf_rename_collection`      | `id`, `name`                      | `Collection`       |
| `shelf_delete_collection`      | `id`                              | `boolean`          |
| `shelf_reorder_collections`    | `ids`                             |                    |
| `shelf_set_collection_cover`   | `id`, `refId` (null for the first) | `Collection`      |
| `shelf_collection_items`       | `id`                              | `ShelfItem[]`      |
| `shelf_add_to_collection`      | `id`, `refs`                      |                    |
| `shelf_remove_from_collection` | `id`, `refs`                      |                    |
| `shelf_reorder_collection`     | `id`, `refIds`                    |                    |
| `shelf_run_filter`             | `query`, `limit` (at most 10 000) | `FilterResult`     |
| `shelf_save_filter`            | `id` (null for new), `name`, `query`, `pinned` | `SmartFilter` |
| `shelf_pin_filter`             | `id`, `pinned`                    |                    |
| `shelf_delete_filter`          | `id`                              | `boolean`          |
| `shelf_reorder_filters`        | `ids`                             |                    |
| `shelf_languages`              |                                   | `string[]`         |

Names (tags, collections, filters) are trimmed, inner spaces collapsed, and limited to 80 characters; an unusable or taken name comes back as a plain sentence for the UI to show.
