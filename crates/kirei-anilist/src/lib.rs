//! AniList tracking: sign in through the system browser, a rate limited
//! GraphQL client for the viewer, manga search and list entries, and the
//! rules that reconcile local reading progress with AniList.
//!
//! Async on tokio, like the MangaDex client. One [`AniList`] per app: clones
//! share the rate limit and the token.
//!
//! Nothing here touches disk. The app stores the token in the OS keychain,
//! and the series links and the offline queue in the library database; see
//! `docs/tracking.md`.

pub mod auth;
mod client;
mod config;
mod error;
mod http;
mod limiter;
mod model;
mod token;

pub use auth::{CALLBACK_PATH, SignInListener, authorize_url, redirect_uri};
pub use client::{AniList, MAX_PAGE_SIZE};
pub use config::{ClientConfig, Endpoints, Limits, RetryPolicy, default_user_agent};
pub use error::{AniListError, Result};
pub use model::{EntryUpdate, ListEntry, ListStatus, Media, MediaTitle, SearchPage, Viewer};
pub use token::{AccessToken, DEFAULT_TOKEN_LIFETIME_SECS, Secret};
