//! The app's one MangaDex client, shared by every feature that talks to
//! MangaDex so they all count against the same rate limits (see
//! `docs/mangadex.md`).
//!
//! The client lives in [`Online`] (`docs/online.md`), with the session and
//! the user's language and rating settings. Downloads and tracking reach it
//! through [`shared`].

use kirei_mangadex::MangaDex;
use tauri::{AppHandle, Manager, Runtime};

use crate::online::Online;

/// The shared client. Clones share limits, cache and session.
pub(crate) fn shared<R: Runtime>(app: &AppHandle<R>) -> Result<MangaDex, String> {
    app.try_state::<Online>()
        .map(|online| online.client().clone())
        .ok_or_else(|| "the MangaDex client is not ready yet".to_owned())
}
