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

mod cache;
mod error;
mod language;
mod limiter;
mod model;
mod wire;

pub use error::{MangaDexError, Result};
pub use language::{LanguageOutcome, LanguagePrefs, LocalizedChapters, resolve_chapters};
pub use limiter::{RateLimiter, RateWindow};
pub use model::{
    Chapter, ContentRating, Cover, CoverSize, Demographic, LocalizedText, Manga, Page, Person,
    PublicationStatus, ReadingStatus, ScanlationGroup, Tag, Uploader,
};
