//! Composition root of the KireiManga desktop app: registers commands and
//! plugins and hands control to Tauri. Domain logic lives in `crates/`.

mod commands;

/// Starts the app. Returns only when the last window closes.
pub fn run() {
    let result = tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![commands::app_info])
        .run(tauri::generate_context!());

    if let Err(error) = result {
        eprintln!("KireiManga failed to start: {error}");
        std::process::exit(1);
    }
}
