//! MangaDex API client: search, series and chapter lists, MangaDex@Home
//! page delivery, and the signed-in user's follows and reading statuses.
//!
//! Everything is async on tokio, the runtime the desktop shell already runs.
//! One [`MangaDex`] per app: its clones share the rate limits, so the app as
//! a whole never sends faster than MangaDex allows (see [`Limits`]).
//!
//! Chapters come in the reader's language chain, Polish then English by
//! default, with a result that says when a fallback language was used
//! ([`LanguageOutcome`]).
//!
//! No UI and no downloads to disk live here. Credentials are supplied by the
//! caller and never stored or logged; see [`auth`].

mod at_home;
pub mod auth;
mod cache;
mod client;
mod config;
mod error;
mod http;
mod language;
mod limiter;
mod model;
mod query;
mod wire;

pub use at_home::{AtHomeServer, ImageQuality, PageImage};
pub use auth::{ClientCredentials, Secret, TokenSet, TokenSink};
pub use client::{ChapterListOptions, MangaDex};
pub use config::{CacheConfig, ClientConfig, Endpoints, Limits, RetryPolicy, default_user_agent};
pub use error::{MangaDexError, Result};
pub use language::{LanguageOutcome, LanguagePrefs, LocalizedChapters, resolve_chapters};
pub use limiter::{RateLimiter, RateWindow};
pub use model::{
    Chapter, ContentRating, Cover, CoverSize, Demographic, LocalizedText, Manga, Page, Person,
    PublicationStatus, ReadingStatus, ScanlationGroup, Tag, Uploader,
};
pub use query::{FeedOrder, FeedQuery, LanguageScope, SearchOrder, SearchQuery, SortDirection};
