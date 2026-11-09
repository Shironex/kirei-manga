//! Composition root of the KireiManga desktop app: registers commands, plugins
//! and the page and cover protocols, and hands control to Tauri. Domain logic lives in
//! `crates/`.

mod catalog;
mod commands;
mod cover_protocol;
mod data;
mod downloads;
mod keychain;
mod library;
mod mangadex_client;
mod online;
mod protocol;
mod settings;
mod shelf;
mod stats;
mod tracking;
mod updater;

use tauri::Manager;

/// Starts the app. Returns only when the last window closes.
pub fn run() {
    // In portable mode the window state goes to the portable data folder too.
    let mut window_state = tauri_plugin_window_state::Builder::default();
    if let Some(file) = data::portable_window_state() {
        window_state = window_state.with_filename(file);
    }
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(window_state.build());
    // Only a release build updates itself. Without the plugin and its state the
    // update commands answer "disabled" instead of failing.
    if updater::is_supported() {
        builder = builder
            .plugin(tauri_plugin_updater::Builder::new().build())
            .manage(updater::Pending::default());
    }
    let result = builder
        .manage(library::Library::new())
        .manage(tracking::Tracking::new())
        .setup(|app| {
            // Resolving the data root also swaps in a staged restore, so it
            // has to happen before the library opens.
            let data = data::DataState::init(app.handle());
            let catalog = catalog::Catalog::open(data.paths());
            app.manage(catalog::Watch::start(app.handle(), &catalog));
            let online = online::setup(app.handle(), catalog.library().ok().as_deref());
            app.manage(catalog);
            // Before the downloads: they share this client (`mangadex_client::shared`).
            app.manage(online);
            online::refresh::start(app.handle());
            // After the library: the downloads folder is kept as a root.
            let downloads = downloads::Downloads::start(app.handle(), data.paths());
            app.manage(data);
            app.manage(downloads);
            tracking::start(app.handle());
            Ok(())
        })
        .register_asynchronous_uri_scheme_protocol(protocol::SCHEME, |ctx, request, responder| {
            let app = ctx.app_handle().clone();
            let path = request.uri().path().to_owned();
            let if_none_match = request
                .headers()
                .get(tauri::http::header::IF_NONE_MATCH)
                .and_then(|value| value.to_str().ok())
                .map(str::to_owned);
            // Reading a page can mean inflating megabytes; keep it off the
            // thread that delivered the request.
            tauri::async_runtime::spawn_blocking(move || {
                let library = app.state::<library::Library>();
                responder.respond(protocol::respond(&library, &path, if_none_match.as_deref()));
            });
        })
        .register_asynchronous_uri_scheme_protocol(
            cover_protocol::SCHEME,
            |ctx, request, responder| {
                let app = ctx.app_handle().clone();
                let path = request.uri().path().to_owned();
                let if_none_match = request
                    .headers()
                    .get(tauri::http::header::IF_NONE_MATCH)
                    .and_then(|value| value.to_str().ok())
                    .map(str::to_owned);
                tauri::async_runtime::spawn_blocking(move || {
                    let library = app.state::<catalog::Catalog>().library().ok();
                    responder.respond(cover_protocol::respond(
                        library.as_deref(),
                        &path,
                        if_none_match.as_deref(),
                    ));
                });
            },
        )
        .register_asynchronous_uri_scheme_protocol(
            online::cover::SCHEME,
            |ctx, request, responder| {
                let app = ctx.app_handle().clone();
                let path = request.uri().path().to_owned();
                tauri::async_runtime::spawn(async move {
                    let online = app.state::<online::Online>();
                    responder.respond(online::cover::respond(&online, &path).await);
                });
            },
        )
        .invoke_handler(tauri::generate_handler![
            commands::app_info,
            commands::open_source,
            commands::focus_page,
            commands::close_source,
            commands::reader_stats,
            catalog::library_roots,
            catalog::library_add_root,
            catalog::library_remove_root,
            catalog::library_scan,
            catalog::library_series,
            catalog::library_series_detail,
            catalog::library_record_progress,
            catalog::library_series_settings,
            catalog::library_set_series_settings,
            commands::set_viewport,
            commands::page_meta,
            commands::set_render_quality,
            settings::settings_get,
            settings::settings_set,
            settings::library_count_orphans,
            settings::library_purge_orphans,
            settings::library_cover_cache,
            settings::library_clear_cover_cache,
            settings::library_unused_covers,
            settings::library_prune_covers,
            settings::data_dir,
            settings::open_data_dir,
            settings::open_link,
            settings::third_party_notices,
            shelf::shelf_overview,
            shelf::shelf_selection,
            shelf::shelf_want_to_read,
            shelf::shelf_set_want,
            shelf::shelf_tag,
            shelf::shelf_untag,
            shelf::shelf_rename_tag,
            shelf::shelf_delete_tag,
            shelf::shelf_create_collection,
            shelf::shelf_rename_collection,
            shelf::shelf_delete_collection,
            shelf::shelf_reorder_collections,
            shelf::shelf_set_collection_cover,
            shelf::shelf_collection_items,
            shelf::shelf_add_to_collection,
            shelf::shelf_remove_from_collection,
            shelf::shelf_reorder_collection,
            shelf::shelf_run_filter,
            shelf::shelf_save_filter,
            shelf::shelf_pin_filter,
            shelf::shelf_delete_filter,
            shelf::shelf_reorder_filters,
            shelf::shelf_languages,
            stats::stats_get,
            stats::stats_count,
            stats::stats_clear,
            stats::stats_cover,
            stats::stats_save_card,
            data::data_info,
            data::backup_create,
            data::backup_inspect,
            data::backup_restore,
            data::app_restart,
            downloads::downloads_list,
            downloads::downloads_enqueue,
            downloads::downloads_auto,
            downloads::downloads_pause,
            downloads::downloads_resume,
            downloads::downloads_cancel,
            downloads::downloads_clear_finished,
            downloads::downloads_folder,
            downloads::open_downloads_folder,
            updater::update_check,
            updater::update_install,
            tracking::anilist_status,
            tracking::anilist_sign_in,
            tracking::anilist_cancel_sign_in,
            tracking::anilist_sign_out,
            tracking::tracking_search,
            tracking::tracking_series,
            tracking::tracking_link,
            tracking::tracking_unlink,
            tracking::tracking_sync,
            tracking::tracking_update_entry,
            tracking::tracking_report_progress,
            tracking::tracking_queue,
            tracking::tracking_retry,
            online::commands::online_account,
            online::commands::online_sign_in,
            online::commands::online_sign_out,
            online::commands::online_search,
            online::commands::online_tags,
            online::commands::online_series,
            online::commands::online_chapters,
            online::commands::online_set_series_language,
            online::commands::online_follow,
            online::commands::online_set_reading_status,
            online::commands::online_follows,
            online::commands::online_feed,
            online::commands::online_refresh_feed,
            online::commands::online_mark_feed_seen,
            online::commands::online_open_chapter,
            online::commands::online_record_progress,
            online::commands::online_mark_read,
            online::commands::online_open_mangadex,
        ])
        .run(tauri::generate_context!());

    if let Err(error) = result {
        eprintln!("KireiManga failed to start: {error}");
        std::process::exit(1);
    }
}
