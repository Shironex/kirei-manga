//! Composition root of the KireiManga desktop app: registers commands, plugins
//! and the page protocol, and hands control to Tauri. Domain logic lives in
//! `crates/`.

mod commands;
mod library;
mod protocol;

use tauri::Manager;

/// Starts the app. Returns only when the last window closes.
pub fn run() {
    let result = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(library::Library::new())
        .register_asynchronous_uri_scheme_protocol(protocol::SCHEME, |ctx, request, responder| {
            let app = ctx.app_handle().clone();
            let path = request.uri().path().to_owned();
            // Reading a page can mean inflating megabytes; keep it off the
            // thread that delivered the request.
            tauri::async_runtime::spawn_blocking(move || {
                let library = app.state::<library::Library>();
                responder.respond(protocol::respond(&library, &path));
            });
        })
        .invoke_handler(tauri::generate_handler![
            commands::app_info,
            commands::open_source,
            commands::focus_page,
            commands::close_source,
            commands::reader_stats,
        ])
        .run(tauri::generate_context!());

    if let Err(error) = result {
        eprintln!("KireiManga failed to start: {error}");
        std::process::exit(1);
    }
}
