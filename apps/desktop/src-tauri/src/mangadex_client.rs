//! The app's one MangaDex client, shared by every feature that talks to
//! MangaDex so they all count against the same rate limits (see
//! `docs/mangadex.md`).
//!
//! Downloads are the first user. The online lane (#43) owns the client for
//! good, with sign in and the user's language and rating settings; when it
//! lands, [`shared`] becomes a lookup of that client instead of making one
//! here. Every caller goes through [`shared`], so that is the only line to
//! change.

use kirei_mangadex::{ClientConfig, MangaDex, default_user_agent};
use tauri::{AppHandle, Manager, Runtime};

/// Managed state: the client, or why it could not be built.
pub(crate) struct SharedMangaDex(Result<MangaDex, String>);

/// The shared client, created on first use. Clones share limits, cache and
/// session.
pub(crate) fn shared<R: Runtime>(app: &AppHandle<R>) -> Result<MangaDex, String> {
    if let Some(state) = app.try_state::<SharedMangaDex>() {
        return state.0.clone();
    }
    let version = app.package_info().version.to_string();
    let client = MangaDex::new(ClientConfig::new(default_user_agent(&version)))
        .map_err(|error| error.to_string());
    app.manage(SharedMangaDex(client.clone()));
    client
}
