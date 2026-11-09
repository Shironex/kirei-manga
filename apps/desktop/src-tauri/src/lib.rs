//! Composition root of the KireiManga desktop app: registers commands, plugins
//! and the page and cover protocols, and hands control to Tauri. Domain logic lives in
//! `crates/`.

mod catalog;
mod commands;
mod cover_protocol;
mod data;
mod library;
mod protocol;
mod settings;
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
        .setup(|app| {
            // Resolving the data root also swaps in a staged restore, so it
            // has to happen before the library opens.
            let data = data::DataState::init(app.handle());
            let catalog = catalog::Catalog::open(data.paths());
            app.manage(data);
            app.manage(catalog::Watch::start(app.handle(), &catalog));
            app.manage(catalog);
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
            data::data_info,
            data::backup_create,
            data::backup_inspect,
            data::backup_restore,
            data::app_restart,
            updater::update_check,
            updater::update_install,
        ])
        .run(tauri::generate_context!());

    if let Err(error) = result {
        eprintln!("KireiManga failed to start: {error}");
        std::process::exit(1);
    }
}
