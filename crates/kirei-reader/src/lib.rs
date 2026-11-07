//! The reader's page pipeline: pages rendered to the size they are shown at,
//! a byte-bounded LRU of those renders, and a pool of read-ahead workers that
//! fill it around the page being read.
//!
//! The protocol handler asks [`Reader::page`] for a page and gets a cached
//! render when the read-ahead got there first, or waits for the worker that is
//! rendering it. Navigation calls [`Reader::focus`], which throws away every
//! queued job from the previous position and stops running renders that left
//! the window, so flipping fast never builds a backlog of pages nobody will
//! look at. [`Reader::update_render_settings`] carries the viewport box and
//! the resampling filter; pages larger than the box are decoded, downscaled
//! and re-encoded, the rest are served as the archive holds them.

mod cache;
mod metrics;
mod read_ahead;
mod render;

pub use cache::{CachedPage, PageCache, PageKey, SourceId};
pub use metrics::LatencySummary;
pub use read_ahead::{Direction, ReadAheadConfig, Reader, ReaderStats};
pub use render::{RenderSettings, RenderedPage, Resample, served_size, target_size};
