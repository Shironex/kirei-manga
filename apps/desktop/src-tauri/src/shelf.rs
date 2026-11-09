//! Shelf commands: collections, tags, Want to Read and smart filters. Thin
//! wrappers over `kirei_library` on the blocking pool; see
//! `docs/collections.md`.
//!
//! Series are named by `SeriesRef` (`{ source: 'local', seriesId }` or
//! `{ source: 'mangadex', remoteId, title?, coverFile? }`), so the online
//! screens use the same commands for MangaDex titles.

use kirei_library::{
    Collection, FilterQuery, FilterResult, SelectionShelf, SeriesRef, ShelfItem, ShelfOverview,
    SmartFilter, Tag,
};
use tauri::{AppHandle, Runtime};

use crate::catalog::with_library;

#[tauri::command]
pub(crate) async fn shelf_overview<R: Runtime>(app: AppHandle<R>) -> Result<ShelfOverview, String> {
    with_library(&app, |library| library.shelf_overview()).await
}

/// Tags, collections and Want to Read for the given series, with how many
/// of them carry each.
#[tauri::command]
pub(crate) async fn shelf_selection<R: Runtime>(
    app: AppHandle<R>,
    series: Vec<SeriesRef>,
) -> Result<SelectionShelf, String> {
    with_library(&app, move |library| library.selection_shelf(&series)).await
}

#[tauri::command]
pub(crate) async fn shelf_want_to_read<R: Runtime>(
    app: AppHandle<R>,
) -> Result<Vec<ShelfItem>, String> {
    with_library(&app, |library| library.want_to_read()).await
}

#[tauri::command]
pub(crate) async fn shelf_set_want<R: Runtime>(
    app: AppHandle<R>,
    refs: Vec<SeriesRef>,
    want: bool,
) -> Result<(), String> {
    with_library(&app, move |library| library.set_want_to_read(&refs, want)).await
}

#[tauri::command]
pub(crate) async fn shelf_tag<R: Runtime>(
    app: AppHandle<R>,
    refs: Vec<SeriesRef>,
    name: String,
) -> Result<Tag, String> {
    with_library(&app, move |library| library.tag_series(&refs, &name)).await
}

#[tauri::command]
pub(crate) async fn shelf_untag<R: Runtime>(
    app: AppHandle<R>,
    refs: Vec<SeriesRef>,
    tag_id: i64,
) -> Result<(), String> {
    with_library(&app, move |library| library.untag_series(&refs, tag_id)).await
}

#[tauri::command]
pub(crate) async fn shelf_rename_tag<R: Runtime>(
    app: AppHandle<R>,
    tag_id: i64,
    name: String,
) -> Result<Tag, String> {
    with_library(&app, move |library| library.rename_tag(tag_id, &name)).await
}

#[tauri::command]
pub(crate) async fn shelf_delete_tag<R: Runtime>(
    app: AppHandle<R>,
    tag_id: i64,
) -> Result<bool, String> {
    with_library(&app, move |library| library.delete_tag(tag_id)).await
}

#[tauri::command]
pub(crate) async fn shelf_create_collection<R: Runtime>(
    app: AppHandle<R>,
    name: String,
) -> Result<Collection, String> {
    with_library(&app, move |library| library.create_collection(&name)).await
}

#[tauri::command]
pub(crate) async fn shelf_rename_collection<R: Runtime>(
    app: AppHandle<R>,
    id: i64,
    name: String,
) -> Result<Collection, String> {
    with_library(&app, move |library| library.rename_collection(id, &name)).await
}

#[tauri::command]
pub(crate) async fn shelf_delete_collection<R: Runtime>(
    app: AppHandle<R>,
    id: i64,
) -> Result<bool, String> {
    with_library(&app, move |library| library.delete_collection(id)).await
}

#[tauri::command]
pub(crate) async fn shelf_reorder_collections<R: Runtime>(
    app: AppHandle<R>,
    ids: Vec<i64>,
) -> Result<(), String> {
    with_library(&app, move |library| library.reorder_collections(&ids)).await
}

#[tauri::command]
pub(crate) async fn shelf_set_collection_cover<R: Runtime>(
    app: AppHandle<R>,
    id: i64,
    ref_id: Option<i64>,
) -> Result<Collection, String> {
    with_library(&app, move |library| {
        library.set_collection_cover(id, ref_id)
    })
    .await
}

#[tauri::command]
pub(crate) async fn shelf_collection_items<R: Runtime>(
    app: AppHandle<R>,
    id: i64,
) -> Result<Vec<ShelfItem>, String> {
    with_library(&app, move |library| library.collection_items(id)).await
}

#[tauri::command]
pub(crate) async fn shelf_add_to_collection<R: Runtime>(
    app: AppHandle<R>,
    id: i64,
    refs: Vec<SeriesRef>,
) -> Result<(), String> {
    with_library(&app, move |library| library.add_to_collection(id, &refs)).await
}

#[tauri::command]
pub(crate) async fn shelf_remove_from_collection<R: Runtime>(
    app: AppHandle<R>,
    id: i64,
    refs: Vec<SeriesRef>,
) -> Result<(), String> {
    with_library(&app, move |library| {
        library.remove_from_collection(id, &refs)
    })
    .await
}

#[tauri::command]
pub(crate) async fn shelf_reorder_collection<R: Runtime>(
    app: AppHandle<R>,
    id: i64,
    ref_ids: Vec<i64>,
) -> Result<(), String> {
    with_library(&app, move |library| {
        library.reorder_collection(id, &ref_ids)
    })
    .await
}

/// Evaluates a filter in SQL and returns its first `limit` rows and the total.
#[tauri::command]
pub(crate) async fn shelf_run_filter<R: Runtime>(
    app: AppHandle<R>,
    query: FilterQuery,
    limit: u32,
) -> Result<FilterResult, String> {
    with_library(&app, move |library| library.run_filter(&query, limit)).await
}

#[tauri::command]
pub(crate) async fn shelf_save_filter<R: Runtime>(
    app: AppHandle<R>,
    id: Option<i64>,
    name: String,
    query: FilterQuery,
    pinned: bool,
) -> Result<SmartFilter, String> {
    with_library(&app, move |library| {
        library.save_filter(id, &name, &query, pinned)
    })
    .await
}

#[tauri::command]
pub(crate) async fn shelf_pin_filter<R: Runtime>(
    app: AppHandle<R>,
    id: i64,
    pinned: bool,
) -> Result<(), String> {
    with_library(&app, move |library| library.pin_filter(id, pinned)).await
}

#[tauri::command]
pub(crate) async fn shelf_delete_filter<R: Runtime>(
    app: AppHandle<R>,
    id: i64,
) -> Result<bool, String> {
    with_library(&app, move |library| library.delete_filter(id)).await
}

#[tauri::command]
pub(crate) async fn shelf_reorder_filters<R: Runtime>(
    app: AppHandle<R>,
    ids: Vec<i64>,
) -> Result<(), String> {
    with_library(&app, move |library| library.reorder_filters(&ids)).await
}

/// Languages the library's files name, for the filter builder.
#[tauri::command]
pub(crate) async fn shelf_languages<R: Runtime>(app: AppHandle<R>) -> Result<Vec<String>, String> {
    with_library(&app, |library| library.languages()).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn series_refs_read_the_shape_the_renderer_sends() {
        let refs: Vec<SeriesRef> = serde_json::from_str(
            r#"[{"source":"local","seriesId":4},
                {"source":"mangadex","remoteId":"a-b","title":"T","coverFile":null}]"#,
        )
        .unwrap();
        assert_eq!(refs[0], SeriesRef::Local { series_id: 4 });
        assert!(matches!(&refs[1], SeriesRef::MangaDex { remote_id, .. } if remote_id == "a-b"));
    }

    #[test]
    fn a_filter_query_from_the_renderer_parses_with_defaults() {
        let query: FilterQuery =
            serde_json::from_str(r#"{"status":["reading"],"source":"mangadex"}"#).unwrap();
        assert_eq!(query.status, vec![kirei_library::ReadStatus::Reading]);
        assert_eq!(query.source, Some(kirei_library::SourceFilter::MangaDex));
    }
}
